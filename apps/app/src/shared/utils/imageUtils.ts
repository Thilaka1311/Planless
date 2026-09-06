/**
 * imageUtils.ts — Client-side gallery picking, WebP conversion, and Supabase Storage uploads for plans.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  evictImageCache,
  getImageVersion,
  ImageType,
  evictPlanImage,
  setPlanCachedImage,
  resolveImage,
  resolveImageDetails,
} from "../imaging/imageResolver";
import { cleanPlanId } from "../../features/plans/utils/planUtils";

export interface ProcessedImageResult {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Opens the native gallery/file picker on browser/PWA.
 * Resolves to the selected File, or null if the user cancels.
 */
export function pickImageFromGallery(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    let hasSelected = false;

    input.onchange = () => {
      hasSelected = true;
      const file = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(file);
    };

    // Fallback for user cancelling file picker dialog
    const handleFocusBack = () => {
      setTimeout(() => {
        if (!hasSelected) {
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
          window.removeEventListener("focus", handleFocusBack);
          resolve(null);
        }
      }, 500);
    };

    window.addEventListener("focus", handleFocusBack, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Converts any image File/Blob into a compressed WebP Blob with dimension constraints.
 * Generates an object URL for immediate local preview.
 */
export async function convertFileToWebP(
  source: File | Blob | string,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<ProcessedImageResult> {
  const { maxDimension = 1920, quality = 0.85 } = options;

  return new Promise((resolve, reject) => {
    let sourceUrl: string;
    let shouldRevokeSource = false;

    if (typeof source === "string") {
      sourceUrl = source;
    } else {
      sourceUrl = URL.createObjectURL(source);
      shouldRevokeSource = true;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (shouldRevokeSource) {
        URL.revokeObjectURL(sourceUrl);
      }

      let { width, height } = img;

      // Scale down proportionally if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to obtain 2D canvas context for WebP conversion"));
        return;
      }

      // Smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("WebP conversion produced an empty blob"));
            return;
          }

          const previewUrl = URL.createObjectURL(blob);
          resolve({
            blob,
            previewUrl,
            width,
            height,
            size: blob.size,
          });
        },
        "image/webp",
        quality
      );
    };

    img.onerror = (err) => {
      if (shouldRevokeSource) {
        URL.revokeObjectURL(sourceUrl);
      }
      reject(new Error("Failed to load image for WebP conversion"));
    };

    img.src = sourceUrl;
  });
}

/**
 * Determines the next sequential cover image number for a specific plan.
 * Inspects the plan-images bucket for objects in the folder `<planId>/`.
 * Matches filenames matching `plancoverimage<N>.webp`.
 * Returns `max(N) + 1` (or 1 if no versioned images exist).
 */
export async function getNextPlanImageNumber(planId: string): Promise<number> {
  const { data: fileList, error: listError } = await supabase.storage
    .from("plan-images")
    .list(planId);

  if (listError) {
    throw new Error(`Failed to list plan images: ${listError.message}`);
  }

  let maxNum = 0;
  if (fileList && fileList.length > 0) {
    for (const file of fileList) {
      const match = file.name.match(/^plancoverimage(\d+)\.webp$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return maxNum + 1;
}

/**
 * AUTHORITATIVE EDIT IMAGE SAVE FLOW
 *
 * Exact sequence executed ONLY when user clicks Save:
 *
 * 1. Determine next sequential image number for this plan.
 * 2. Upload new image as `plan-images/<planId>/plancoverimage<N>.webp` (upsert: false to prevent race conditions).
 * 3. Verify new Storage object exists.
 * 4. Update local image cache to the new image.
 * 5. Update plans.cover_image database column to `plan-images/<planId>/plancoverimage<N>.webp`.
 * 6. Verify DB update with fresh read.
 *
 * Historical image versions are NEVER deleted from Storage.
 */
export async function replacePlanImage(
  rawPlanId: string,
  newWebpBlob: Blob
): Promise<{ success: boolean; path: string }> {
  if (!rawPlanId) {
    throw new Error("Missing planId for image replacement");
  }
  if (!newWebpBlob) {
    throw new Error("No image data provided for image replacement");
  }

  const planId = cleanPlanId(rawPlanId).trim();

  let nextNum = await getNextPlanImageNumber(planId);
  let storagePath = `${planId}/plancoverimage${nextNum}.webp`;
  let fullDbPath = `plan-images/${storagePath}`;
  let uploadSuccess = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!uploadSuccess && attempts < maxAttempts) {
    attempts++;
    storagePath = `${planId}/plancoverimage${nextNum}.webp`;
    fullDbPath = `plan-images/${storagePath}`;

    const { error: uploadError } = await supabase.storage
      .from("plan-images")
      .upload(storagePath, newWebpBlob, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "3600",
      });

    if (!uploadError) {
      uploadSuccess = true;
      break;
    }

    // If duplicate or conflict, re-fetch the latest number and increment
    const latestNum = await getNextPlanImageNumber(planId);
    nextNum = Math.max(latestNum, nextNum + 1);
  }

  if (!uploadSuccess) {
    throw new Error(`Failed to upload plan image after ${maxAttempts} attempts`);
  }

  // Verify the new image exists in Storage
  const { data: verifyList, error: verifyError } = await supabase.storage
    .from("plan-images")
    .list(planId, { search: `plancoverimage${nextNum}.webp` });

  const uploadedExists = Boolean(
    verifyList?.some((o) => o.name === `plancoverimage${nextNum}.webp`)
  );
  if (verifyError || !uploadedExists) {
    throw new Error(`Uploaded image not found in storage verification: ${storagePath}`);
  }

  // Update local cache to the new image
  setPlanCachedImage(planId, fullDbPath);
  setPlanCachedImage(planId, storagePath);
  evictImageCache(fullDbPath, ImageType.PlanCover);
  evictImageCache(storagePath, ImageType.PlanCover);

  // Update database with new image reference
  const { error: updateDbError } = await supabase
    .from("plans")
    .update({ cover_image: fullDbPath, updated_at: new Date().toISOString() })
    .eq("id", planId);

  if (updateDbError) {
    throw new Error(`Failed to update database with new image: ${updateDbError.message}`);
  }

  const { data: freshPlan, error: selectError } = await supabase
    .from("plans")
    .select("id, cover_image")
    .eq("id", planId)
    .single();

  if (selectError || !freshPlan || freshPlan.cover_image !== fullDbPath) {
    throw new Error(`Database verification failed: expected ${fullDbPath}, got ${freshPlan?.cover_image}`);
  }

  return {
    success: true,
    path: fullDbPath,
  };
}

export const uploadPlanImage = replacePlanImage;

/**
 * Deletes the active custom plan image:
 * 1. Sets `plans.cover_image = null` in the database.
 * 2. Verifies the database update.
 * 3. Evicts the active image from local cache.
 * 4. Local resolver falls back naturally to `planimagedefault.png`.
 *
 * Historical image versions remain preserved in Storage as historical assets.
 * Fallback image is NEVER uploaded to Supabase Storage.
 */
export async function deleteCustomPlanImage(
  rawPlanId: string
): Promise<{ success: boolean }> {
  if (!rawPlanId) {
    throw new Error("Missing planId for image deletion");
  }

  const planId = cleanPlanId(rawPlanId).trim();

  // 1. Update database reference to null
  const { error: dbError } = await supabase
    .from("plans")
    .update({ cover_image: null, updated_at: new Date().toISOString() })
    .eq("id", planId);

  if (dbError) {
    throw new Error(`[DELETE PLAN IMAGE FAILED]: ${dbError.message}`);
  }

  // 2. Verify DB row has cover_image = null
  const { data: freshPlan, error: selectError } = await supabase
    .from("plans")
    .select("id, cover_image")
    .eq("id", planId)
    .single();

  if (selectError || !freshPlan) {
    throw new Error(`[VERIFY DB CLEAR FAILED]: Could not read back plan row: ${selectError?.message}`);
  }

  if (freshPlan.cover_image !== null) {
    throw new Error(`[VERIFY DB CLEAR FAILED]: cover_image is not null: ${freshPlan.cover_image}`);
  }

  // 3. Evict the old image from local cache so the resolver uses planimagedefault.png
  evictPlanImage(planId);

  // 4. Verify the image resolver now returns planimagedefault.png
  const finalDetails = resolveImageDetails(null, ImageType.PlanCover);
  const finalResolverResult = finalDetails.url;

  if (
    !finalResolverResult ||
    (!finalResolverResult.includes("planimagedefault") && !finalResolverResult.startsWith("/assets/"))
  ) {
    throw new Error(`[VERIFY CACHE/RESOLVER FAILED]: Final resolver did not return planimagedefault: ${finalResolverResult}`);
  }

  return { success: true };
}
