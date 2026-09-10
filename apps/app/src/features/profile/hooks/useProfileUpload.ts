import { useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { processImage, validateImageFile, ImagePresets } from "../../../shared/imaging/imagePipeline";

export interface UseProfileUploadResult {
  uploading: boolean;
  uploadError: string | null;
  uploadImage: (file: File | Blob, userId?: string) => Promise<string | null>;
}

export function useProfileUpload(): UseProfileUploadResult {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = async (file: File | Blob, userId?: string): Promise<string | null> => {
    // 1. Validate file type / size if raw File
    if (file instanceof File) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setUploadError(validationError);
        return null;
      }
    }

    setUploading(true);
    setUploadError(null);

    try {
      // 2. If already a WebP blob from the crop editor, use directly; otherwise process through shared pipeline
      const isPreprocessedWebp = file instanceof Blob && !(file instanceof File) && file.type === "image/webp";
      const blob = isPreprocessedWebp ? file : await processImage(file, ImagePresets.Avatar);

      // 3. Obtain authenticated user ID directly from Supabase auth session
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      const authUserId = user?.id || userId;
      if (!authUserId) {
        throw new Error("Authentication required. Please sign in to update your profile photo.");
      }

      // Canonical storage path: {authUserId}/avatar in bucket "avatars"
      const bucketName = "avatars";
      const canonicalFileName = "avatar";
      const objectKey = `${authUserId}/${canonicalFileName}`;

      // 4. Safe Replacement: Upload the new image to {authUserId}/avatar with upsert: true
      const { data, error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(objectKey, blob, {
          contentType: "image/webp",
          cacheControl: "0",
          upsert: true,
        });

      if (uploadErr) {
        console.error("[useProfileUpload] Avatar Upload Error:", uploadErr);
      }

      if (uploadErr || !data) {
        throw new Error(uploadErr?.message || "Failed to upload avatar to storage");
      }

      // 5. Cleanup: Remove any obsolete files in the user's folder (e.g. avatar.webp, avatar1, avatar.jpg)
      // to ensure EXACTLY ONE avatar file ({authUserId}/avatar) exists at any given time.
      try {
        const { data: existingFiles, error: listErr } = await supabase.storage
          .from(bucketName)
          .list(authUserId);

        if (!listErr && existingFiles && existingFiles.length > 0) {
          const obsoleteFiles = existingFiles
            .filter((f) => f.name !== canonicalFileName)
            .map((f) => `${authUserId}/${f.name}`);

          if (obsoleteFiles.length > 0) {
            const { error: rmErr } = await supabase.storage
              .from(bucketName)
              .remove(obsoleteFiles);
            if (rmErr) {
              console.warn("[useProfileUpload] Warning cleaning obsolete avatar files:", rmErr);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("[useProfileUpload] Non-fatal cleanup warning:", cleanupErr);
      }

      // Return canonical storage reference format: avatars/<user_id>/avatar
      return `${bucketName}/${objectKey}`;
    } catch (err: any) {
      console.error("[useProfileUpload] Error uploading avatar:", err);
      setUploadError(err.message || "Failed to upload image. Please try again.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploading,
    uploadError,
    uploadImage,
  };
}
