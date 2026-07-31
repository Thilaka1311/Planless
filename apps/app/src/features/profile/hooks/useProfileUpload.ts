import { useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { processImage, validateImageFile, ImagePresets } from "../../../shared/imaging/imagePipeline";

export interface UseProfileUploadResult {
  uploading: boolean;
  uploadError: string | null;
  uploadImage: (file: File, userId: string) => Promise<string | null>;
}

export function useProfileUpload(): UseProfileUploadResult {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = async (file: File, userId: string): Promise<string | null> => {
    // 1. Validate file type / size
    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      return null;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // 2. Process through shared pipeline — resize to 512×512 and convert to WebP
      const blob = await processImage(file, ImagePresets.Avatar);

      // 3. Upload to Supabase Storage as <user_uuid>/avatar.webp
      const bucketName = "avatars";
      const objectKey = `${userId}/avatar.webp`;

      const {
        data: { user },
      } = await supabase.auth.getUser();


      const { data, error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(objectKey, blob, {
          contentType: "image/webp",
          upsert: true,
        });


      if (uploadErr) {
        console.error("[Avatar Upload Error]", uploadErr);
        console.error(
          "[Avatar Upload Error JSON]",
          JSON.stringify(uploadErr, null, 2)
        );
      }

      if (uploadErr || !data) {
        throw new Error(uploadErr?.message || "Upload failed");
      }

      // Return the full storage path format: <bucket>/<object_key>
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
