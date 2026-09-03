/**
 * EditPlanImageScreen.tsx
 *
 * Full-screen Apple-like image management screen for plans.
 * Displays the current plan image prominently with:
 * - Top-left: ArrowLeft back button
 * - Top-right: Edit action and Delete action
 * - Center: Prominent plan image display
 * - Reuses existing PlanImageEditorModal for crop/zoom
 * - Uses replacePlanImage for the authoritative 4-step save flow
 * - Reuses deleteCustomPlanImage for safe deletion with local asset fallback
 */

import React, { useState, useRef } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import { PlanImageEditorModal } from "../../../../create/components/PlanImageEditorModal";
import { replacePlanImage, deleteCustomPlanImage } from "../../../../../shared/utils/imageUtils";
import { useToast } from "../../../../../shared/contexts/ToastContext";

interface EditPlanImageScreenProps {
  planId: string;
  currentCoverImage: string | null | undefined;
  category?: string;
  subcategory?: string | null;
  title?: string;
  onBack: () => void;
  onImageUpdated: (newCoverImage: string | null) => void;
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
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [coverImage, setCoverImage] = useState<string | null | undefined>(initialCoverImage);
  const [editorImageFile, setEditorImageFile] = useState<File | Blob | string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Handle Save from PlanImageEditorModal
  const handleSaveCrop = async ({ blob }: { previewUrl: string; blob: Blob }) => {
    if (!blob) {
      showToast("No image data provided");
      return;
    }

    try {
      const { path: finalCoverPath } = await replacePlanImage(planId, blob);

      setCoverImage(finalCoverPath);
      onImageUpdated(finalCoverPath);

      if (onUpdatePlanDetails) {
        await onUpdatePlanDetails({ cover_image: finalCoverPath, skipDbWrite: true });
      }

      setIsEditorOpen(false);
      setEditorImageFile(null);
      showToast("✓ Plan image updated");
      
      // Return to Plan Settings
      onBack();
    } catch (err: any) {
      showToast(err?.message || "Failed to update plan image");
      // silent
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCustomPlanImage(planId);

      setCoverImage(null);
      onImageUpdated(null);

      if (onUpdatePlanDetails) {
        await onUpdatePlanDetails({ cover_image: null, skipDbWrite: true });
      }

      setShowDeleteConfirm(false);
      showToast("✓ Plan image deleted");
    } catch (err: any) {
      showToast(err?.message || "Failed to delete plan image");
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
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
            title="Choose a new image"
          >
            <Pencil className="w-5 h-5" />
          </button>

          {/* Delete Action */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition cursor-pointer"
            title="Delete custom image"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Image Canvas */}
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
        </div>
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

      {/* Existing Plan Image Editor Modal */}
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
