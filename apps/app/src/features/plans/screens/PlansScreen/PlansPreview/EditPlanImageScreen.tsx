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
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import { PlanImageEditorModal } from "../../../../create/components/PlanImageEditorModal";
import {
  uploadOriginalPlanImage,
  uploadPlanCardImage,
  deleteCustomPlanImage,
} from "../../../../../shared/utils/imageUtils";

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);

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
      setEditorImageFile(file);
      setIsEditorOpen(true);
    }
  };

  /**
   * Called when the user taps Save in the crop editor.
   * Uploads:
   *   originalBlob → cover_image (Plan Preview / Hero)
   *   blob (crop)  → cover_card_image (Home Plan Card)
   */
  const handleSaveCrop = async ({
    blob,
    originalBlob,
  }: {
    previewUrl: string;
    blob: Blob;
    originalBlob: Blob | null;
    originalPreviewUrl: string;
    width: number;
    height: number;
  }) => {
    if (!blob) {
      return;
    }

    setIsSavingImage(true);
    try {
      let finalCoverPath: string | null = null;
      let finalCardPath: string | null = null;

      // 1. Upload the original (full) image → cover_image
      if (originalBlob) {
        const { path } = await uploadOriginalPlanImage(planId, originalBlob);
        finalCoverPath = path;
      } else {
        // No original blob (e.g. string URL source) — upload the cropped blob as cover_image fallback
        const { path } = await uploadOriginalPlanImage(planId, blob);
        finalCoverPath = path;
      }

      // 2. Upload the cropped portrait → cover_card_image (only if original was separate)
      if (originalBlob) {
        const { path } = await uploadPlanCardImage(planId, blob);
        finalCardPath = path;
      }

      // 3. Update local preview state (show original in the preview canvas)
      if (finalCoverPath) {
        setCoverImage(finalCoverPath);
      }

      // 4. Notify parent — pass both paths
      onImageUpdated(finalCoverPath, finalCardPath);

      // 5. Optionally notify the parent's updatePlanDetails handler
      if (onUpdatePlanDetails && finalCoverPath) {
        const updates: any = { cover_image: finalCoverPath, skipDbWrite: true };
        if (finalCardPath) updates.cover_card_image = finalCardPath;
        await onUpdatePlanDetails(updates);
      }

      setIsEditorOpen(false);
      setEditorImageFile(null);

      // Return to Plan Settings
      onBack();
    } catch (err: any) {
      console.error("[EditPlanImageScreen] Failed to update plan image:", err);
    } finally {
      setIsSavingImage(false);
    }
  };

  // Handle Delete Confirmation — clears both cover_image and cover_card_image
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCustomPlanImage(planId);

      setCoverImage(null);
      onImageUpdated(null, null);

      if (onUpdatePlanDetails) {
        await onUpdatePlanDetails({ cover_image: null, cover_card_image: null, skipDbWrite: true });
      }

      setShowDeleteConfirm(false);
    } catch (err: any) {
      console.error("[EditPlanImageScreen] Failed to delete plan image:", err);
    } finally {
      setIsDeleting(false);
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

        {/* Right Actions: Minimalist Edit & Delete icons */}
        <div className="flex items-center gap-1 -mr-1 flex-shrink-0">
          {/* Edit Action */}
          <button
            type="button"
            onClick={handleOpenPicker}
            disabled={isSavingImage}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer disabled:opacity-50"
            title="Choose a new image"
          >
            <Pencil className="w-5 h-5" />
          </button>

          {/* Delete Action */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSavingImage}
            className="w-10 h-10 flex items-center justify-center rounded-full text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition cursor-pointer disabled:opacity-50"
            title="Delete custom image"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Image Canvas — shows the original (full) plan image */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 sm:p-6 select-none overflow-hidden">
        <div className="relative w-full max-w-[360px] sm:max-w-[400px] max-h-[calc(100vh-8.5rem)] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-zinc-900 flex items-center justify-center">
          <DiscoveryImages
            src={coverImage}
            planId={planId}
            category="CUSTOM"
            subcategory={null}
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
          This image appears in your Plan Preview. Tap ✏️ to pick a new photo and crop it for the Home card.
        </p>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          className="fixed inset-0 bg-black/75 z-[120] flex items-end justify-center animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#141414] border-t border-white/10 rounded-t-3xl p-6 flex flex-col gap-4 text-center select-none shadow-2xl"
          >
            <h3 className="text-base font-semibold text-white">Delete plan image?</h3>
            <p className="text-sm text-zinc-400">
              The plan will use the default image instead.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 px-4 bg-white/[0.08] hover:bg-white/[0.12] rounded-xl text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 rounded-xl text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Editor — positions the Home Card portrait crop */}
      {isEditorOpen && editorImageFile && (
        <PlanImageEditorModal
          imageSrc={editorImageFile}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditorImageFile(null);
          }}
          onSave={handleSaveCrop}
        />
      )}
    </div>
  );
};
