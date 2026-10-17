/**
 * EditPlanImageScreen.tsx
 *
 * Full-screen image management for existing plans — dual-image model:
 *   cover_image      → original full image  → Plan Preview / Hero
 *   cover_card_image → 9:16 portrait crop   → Home Plan Card
 *
 * Flow when user picks a new image:
 *  1. Open PlanImageEditorModal (crop editor for the Home Card portrait).
 *  2. On Save: upload original blob → cover_image, upload cropped blob → cover_card_image.
 *  3. Notify parent via onImageUpdated(originalPath, cardPath).
 *
 * If the user cancels the crop editor, no upload happens.
 */

import React, { useState, useRef } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import { PlanImageEditorModal } from "../../../../create/components/PlanImageEditorModal";
import { uploadOriginalPlanImage } from "../../../../../shared/utils/imageUtils";
import { supabase } from "../../../../../../lib/supabaseClient";
import { PlanPhotoGalleryModal } from "../../../components/PlanPhotoGalleryModal";
import {
  selectExistingPlanPhoto,
  updatePlanCardCrop,
  PlanPhotoItem,
} from "../../../utils/planPhotos";
import {
  setPlanCachedImage,
  evictImageCache,
  ImageType,
} from "../../../../../shared/imaging/imageResolver";

interface EditPlanImageScreenProps {
  planId: string;
  currentCoverImage: string | null | undefined;
  category?: string;
  subcategory?: string | null;
  title?: string;
  onBack: () => void;
  /** Called with the new original-image path and (optionally) the new card-crop path after a successful save. */
  onImageUpdated: (newCoverImage: string | null, newCardCoverImage?: string | null) => void;
  onUpdatePlanDetails?: (updates: any) => Promise<void> | void;
}

export const EditPlanImageScreen: React.FC<EditPlanImageScreenProps> = ({
  planId,
  currentCoverImage: initialCoverImage,
  category = "CUSTOM",
  subcategory,
  title = "Plan",
  onBack,
  onImageUpdated,
  onUpdatePlanDetails,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [coverImage, setCoverImage] = useState<string | null | undefined>(initialCoverImage);
  const [editorImageFile, setEditorImageFile] = useState<File | Blob | string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isEditingExistingCrop, setIsEditingExistingCrop] = useState(false);
  const [selectedPhotoForCrop, setSelectedPhotoForCrop] = useState<PlanPhotoItem | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  // Open photo gallery when user clicks the Pencil/Edit button
  const handleOpenGallery = () => {
    setIsGalleryOpen(true);
  };

  // Trigger device photo picker
  const handleOpenPicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        console.warn("[EditPlanImageScreen] Selected file is not an image:", file.type);
        return;
      }
      setIsEditingExistingCrop(false);
      setSelectedPhotoForCrop(null);
      setEditorImageFile(file);
      setIsEditorOpen(true);
    }
  };

  // User commits a photo selection when closing the bottom sheet
  const handleCommitPhotoSelection = async (photo: PlanPhotoItem) => {
    const updatedPath = photo.fullDbPath;

    // ── Step 1: Update the local application state immediately ──
    // Zero network delay: updates the image preview and parent Plan state instantly
    setCoverImage(updatedPath);
    onImageUpdated(updatedPath, null);

    if (onUpdatePlanDetails) {
      try {
        await onUpdatePlanDetails({
          cover_image: updatedPath,
          cover_card_image: null,
          skipDbWrite: true,
        });
      } catch (stateErr) {
        console.warn("[EditPlanImageScreen] Local state update warning:", stateErr);
      }
    }

    // ── Step 2: Update the local cache ──
    // Persist new committed selection into local memory/cache layer
    setPlanCachedImage(planId, updatedPath);
    setPlanCachedImage(planId, photo.storagePath);
    evictImageCache(updatedPath, ImageType.PlanCover);
    evictImageCache(photo.storagePath, ImageType.PlanCover);

    // ── Step 3: Synchronize with Supabase ──
    try {
      await selectExistingPlanPhoto(planId, photo);
    } catch (err: any) {
      // In case of network or Supabase failure:
      // - Keep the user's committed selection visible locally
      // - Preserve the updated local cache
      // - Do NOT revert the UI to the previous image
      console.error("[EditPlanImageScreen] Failed to synchronize photo selection to Supabase:", err);
    }
  };

  // User taps "Edit Crop" on an existing photo in the gallery
  const handleEditCrop = (photo: PlanPhotoItem) => {
    setIsGalleryOpen(false);
    setIsEditingExistingCrop(true);
    setSelectedPhotoForCrop(photo);
    setEditorImageFile(photo.url);
    setIsEditorOpen(true);
  };

  // User taps "Add New Photo" in the gallery
  const handleAddNewPhoto = () => {
    setIsGalleryOpen(false);
    setIsEditingExistingCrop(false);
    setSelectedPhotoForCrop(null);
    handleOpenPicker();
  };

  /**
   * Called when the user taps Save in the crop editor.
   * - If editing an existing photo's crop: updates crop config without re-uploading file.
   * - If adding a new photo: uploads canonical WebP image and stores crop config.
   */
  const handleSaveCrop = async ({
    blob,
    originalBlob,
    cropConfig,
  }: {
    previewUrl: string;
    blob: Blob;
    originalBlob: Blob | null;
    originalPreviewUrl: string;
    width: number;
    height: number;
    cropConfig?: {
      objectPosition: string;
      scale: number;
    };
  }) => {
    if (!blob && !originalBlob) {
      return;
    }

    setIsSavingImage(true);
    try {
      if (isEditingExistingCrop && selectedPhotoForCrop) {
        // Software crop update for existing photo: original image is single source of truth
        let cropString: string | null = null;
        if (cropConfig) {
          const cropRes = await updatePlanCardCrop(planId, cropConfig);
          cropString = cropRes.cropString;
        }
        const activeCover = selectedPhotoForCrop.fullDbPath;

        // Step 1: Update local application state immediately (zero delay)
        setCoverImage(activeCover);
        onImageUpdated(activeCover, cropString);

        if (onUpdatePlanDetails) {
          await onUpdatePlanDetails({
            cover_image: activeCover,
            cover_card_image: cropString,
            skipDbWrite: true,
          });
        }

        // Step 2: Update local cache
        setPlanCachedImage(planId, activeCover);
        setPlanCachedImage(planId, selectedPhotoForCrop.storagePath);
        evictImageCache(activeCover, ImageType.PlanCover);
        evictImageCache(selectedPhotoForCrop.storagePath, ImageType.PlanCover);

        // Step 3: Synchronize with Supabase — ensure both cover_image and cover_card_image are persisted together
        try {
          await (supabase as any)
            .from("plans")
            .update({
              cover_image: activeCover,
              cover_card_image: cropString,
              updated_at: new Date().toISOString(),
            })
            .eq("id", planId);
        } catch (dbErr) {
          console.error("[EditPlanImageScreen] Failed to synchronize crop and cover to Supabase:", dbErr);
        }
      } else {
        // New photo upload
        const imageBlobToUpload = originalBlob || blob;
        const { path } = await uploadOriginalPlanImage(planId, imageBlobToUpload);
        const finalCoverPath = path;

        let cropString: string | null = null;
        if (cropConfig) {
          const cropRes = await updatePlanCardCrop(planId, cropConfig);
          cropString = cropRes.cropString;
        }

        setCoverImage(finalCoverPath);
        onImageUpdated(finalCoverPath, cropString);

        if (onUpdatePlanDetails) {
          await onUpdatePlanDetails({
            cover_image: finalCoverPath,
            cover_card_image: cropString,
            skipDbWrite: true,
          });
        }
      }

      setIsEditorOpen(false);
      setEditorImageFile(null);
      setIsEditingExistingCrop(false);
      setSelectedPhotoForCrop(null);

      // Return to Plan Settings
      onBack();
    } catch (err: any) {
      console.error("[EditPlanImageScreen] Failed to update plan image:", err);
    } finally {
      setIsSavingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none animate-in fade-in duration-200">
      {/* Hidden file input for gallery picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Header Bar */}
      <div className="px-4 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-2 flex items-center justify-between gap-3 flex-shrink-0 relative z-30 min-h-[48px]">
        {/* Left: Back Button + Plan Title grouped closely */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center rounded-full flex-shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-tight truncate">
            {title || "Plan"}
          </h1>
        </div>

        {/* Right Action: Edit icon at the far right */}
        <button
          type="button"
          onClick={handleOpenGallery}
          disabled={isSavingImage}
          className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer disabled:opacity-50 flex-shrink-0"
          title="Plan photo gallery"
        >
          <Pencil className="w-5 h-5" />
        </button>
      </div>

      {/* Center Image Canvas — shows the original (full) plan image */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 sm:p-6 select-none overflow-hidden">
        <div className="relative w-full max-w-[360px] sm:max-w-[400px] max-h-[calc(100vh-8.5rem)] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-zinc-900 flex items-center justify-center">
          <DiscoveryImages
            src={coverImage}
            planId={planId}
            category={category}
            subcategory={subcategory}
            screen="Edit Image Screen"
            alt={title}
            className="w-full h-full object-cover"
          />
          {isSavingImage && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-3xl">
              <span className="text-white text-sm font-medium">Saving…</span>
            </div>
          )}
        </div>
        <p className="text-xs text-white/40 mt-3 text-center select-none">
          View and edit your plan photo.
        </p>
      </div>

      {/* Plan Photo Gallery Modal */}
      <PlanPhotoGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        planId={planId}
        currentCoverImage={coverImage}
        onCommitSelection={handleCommitPhotoSelection}
        onSelectPhoto={handleCommitPhotoSelection}
        onEditCrop={handleEditCrop}
        onAddNewPhoto={handleAddNewPhoto}
      />

      {/* Crop Editor — positions the Home Card portrait crop */}
      {isEditorOpen && editorImageFile && (
        <PlanImageEditorModal
          imageSrc={editorImageFile}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditorImageFile(null);
            setIsEditingExistingCrop(false);
            setSelectedPhotoForCrop(null);
          }}
          onSave={handleSaveCrop}
        />
      )}
    </div>
  );
};


