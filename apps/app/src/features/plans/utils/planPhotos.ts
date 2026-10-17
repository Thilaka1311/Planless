/**
 * planPhotos.ts
 *
 * Scoped photo discovery, selection, and software crop management for Planless plans.
 * Storage conventions:
 *   Bucket: "plan-images"
 *   Folder: "<planId>/"
 *   Filename: "plancoverimage<N>.webp"
 *   Database reference: "plan-images/<planId>/plancoverimage<N>.webp"
 */

import { supabase } from "../../../../lib/supabaseClient";
import { cleanPlanId } from "./planUtils";
import {
  resolveImageDetails,
  ImageType,
  setPlanCachedImage,
  evictImageCache,
} from "../../../shared/imaging/imageResolver";

export interface PlanPhotoItem {
  id: string;
  name: string;
  storagePath: string;
  fullDbPath: string;
  url: string;
  createdAt?: string;
  isCurrent?: boolean;
}

export interface PlanCropConfig {
  objectPosition: string; // e.g. "50% 35%"
  scale?: number;         // e.g. 1.2
}

/**
 * Parses crop configuration stored in plans.cover_card_image.
 * Returns null if not a crop configuration string.
 */
export function parseCropConfig(cardImageValue: string | null | undefined): PlanCropConfig | null {
  if (!cardImageValue || typeof cardImageValue !== "string") return null;
  if (!cardImageValue.startsWith("crop:")) return null;
  try {
    const jsonStr = cardImageValue.slice(5);
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.objectPosition === "string") {
      return {
        objectPosition: parsed.objectPosition,
        scale: typeof parsed.scale === "number" ? parsed.scale : undefined,
      };
    }
  } catch (err) {
    console.warn("[parseCropConfig] Failed to parse crop config:", cardImageValue, err);
  }
  return null;
}

/**
 * Discovers all photos in Supabase Storage strictly associated with this planId.
 * Never accesses or returns photos from other plans or users.
 */
export async function fetchPlanPhotos(
  rawPlanId: string,
  currentCoverImage?: string | null
): Promise<PlanPhotoItem[]> {
  if (!rawPlanId) return [];
  const planId = cleanPlanId(rawPlanId).trim();
  if (!planId) return [];

  const rawCurrent = (currentCoverImage || "").trim();
  const cleanCurrent = rawCurrent.split("?")[0].trim();

  try {
    const { data: fileList, error: listError } = await supabase.storage
      .from("plan-images")
      .list(planId, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      console.warn(`[fetchPlanPhotos] Failed to list photos for plan ${planId}:`, listError.message);
    }

    const items: PlanPhotoItem[] = [];
    const seenNames = new Set<string>();

    if (fileList && fileList.length > 0) {
      for (const file of fileList) {
        if (!file.name || file.name.startsWith(".")) continue;

        // Filter: only accept image files, exclude legacy card crops
        const lower = file.name.toLowerCase();
        const isImage = lower.endsWith(".webp") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg");
        const isCardCrop = lower.includes("card");
        if (!isImage || isCardCrop) continue;

        const storagePath = `${planId}/${file.name}`;
        const fullDbPath = `plan-images/${storagePath}`;
        const resolved = resolveImageDetails(fullDbPath, ImageType.PlanCover);

        const isCurrent = Boolean(
          (cleanCurrent &&
            (cleanCurrent === fullDbPath ||
             cleanCurrent === storagePath ||
             cleanCurrent.endsWith(`/${file.name}`))) ||
          (rawCurrent &&
            (rawCurrent === fullDbPath ||
             rawCurrent === storagePath ||
             rawCurrent.endsWith(`/${file.name}`)))
        );

        items.push({
          id: file.id || file.name,
          name: file.name,
          storagePath,
          fullDbPath,
          url: resolved.url,
          createdAt: file.created_at,
          isCurrent,
        });
        seenNames.add(file.name);
      }
    }

    // If currentCoverImage points to a plan-images storage path not yet in fileList, include it
    if (cleanCurrent && cleanCurrent.startsWith("plan-images/") && cleanCurrent.includes(`/${planId}/`)) {
      const fileName = cleanCurrent.split("/").pop();
      if (fileName && !seenNames.has(fileName)) {
        const storagePath = `${planId}/${fileName}`;
        const resolved = resolveImageDetails(cleanCurrent, ImageType.PlanCover);
        items.unshift({
          id: fileName,
          name: fileName,
          storagePath,
          fullDbPath: cleanCurrent,
          url: resolved.url,
          isCurrent: true,
        });
      }
    }

    // Sort by version number descending (plancoverimage<N>.webp -> highest N first)
    items.sort((a, b) => {
      const matchA = a.name.match(/^plancoverimage(\d+)\.webp$/i);
      const matchB = b.name.match(/^plancoverimage(\d+)\.webp$/i);
      if (matchA && matchB) {
        return parseInt(matchB[1], 10) - parseInt(matchA[1], 10);
      }
      if (matchA) return -1;
      if (matchB) return 1;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return items;
  } catch (err: any) {
    console.error(`[fetchPlanPhotos] Unexpected error fetching photos for plan ${planId}:`, err);
    return [];
  }
}

/**
 * Sets an existing photo as the active plan cover image.
 * Does NOT upload a new file. Preserves the original file untouched.
 */
export async function selectExistingPlanPhoto(
  rawPlanId: string,
  photo: PlanPhotoItem
): Promise<{ success: boolean; path: string }> {
  if (!rawPlanId) throw new Error("Missing planId for photo selection");
  if (!photo || !photo.fullDbPath) throw new Error("Missing photo details for selection");

  const planId = cleanPlanId(rawPlanId).trim();

  // Verify the photo belongs to this plan
  if (!photo.fullDbPath.includes(`/${planId}/`) && !photo.storagePath.startsWith(`${planId}/`)) {
    throw new Error("Cannot select photo belonging to another plan");
  }

  // Update plans table with existing photo path & reset cover_card_image
  const { error: dbError } = await (supabase as any)
    .from("plans")
    .update({
      cover_image: photo.fullDbPath,
      cover_card_image: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  if (dbError) {
    throw new Error(`Failed to update plan cover image: ${dbError.message}`);
  }

  // Cache & local memory sync
  setPlanCachedImage(planId, photo.fullDbPath);
  setPlanCachedImage(planId, photo.storagePath);
  evictImageCache(photo.fullDbPath, ImageType.PlanCover);
  evictImageCache(photo.storagePath, ImageType.PlanCover);

  return { success: true, path: photo.fullDbPath };
}

/**
 * Updates the Home screen card crop configuration without modifying or re-uploading the original image.
 */
export async function updatePlanCardCrop(
  rawPlanId: string,
  cropConfig: PlanCropConfig
): Promise<{ success: boolean; cropString: string }> {
  if (!rawPlanId) throw new Error("Missing planId for crop update");

  const planId = cleanPlanId(rawPlanId).trim();
  const cropString = `crop:${JSON.stringify(cropConfig)}`;

  const { error: dbError } = await (supabase as any)
    .from("plans")
    .update({
      cover_card_image: cropString,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  if (dbError) {
    throw new Error(`Failed to update card crop: ${dbError.message}`);
  }

  return { success: true, cropString };
}
