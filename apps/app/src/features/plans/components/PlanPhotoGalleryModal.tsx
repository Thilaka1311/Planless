/**
 * PlanPhotoGalleryModal.tsx
 *
 * Scoped Photo Management & Gallery Bottom Sheet for Planless plans.
 * Displays all previously uploaded photos associated with the current plan.
 * Allows instant cover photo selection, crop editing, and adding new photos.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Crop, Plus, Image as ImageIcon } from "lucide-react";
import { fetchPlanPhotos, PlanPhotoItem } from "../utils/planPhotos";
import { useDismissibleOverlay } from "../../navigation/appRouter";

export interface PlanPhotoGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  currentCoverImage?: string | null;
  onCommitSelection?: (photo: PlanPhotoItem) => Promise<void> | void;
  onSelectPhoto?: (photo: PlanPhotoItem) => Promise<void> | void;
  onEditCrop: (photo: PlanPhotoItem) => void;
  onAddNewPhoto: () => void;
}

export const PlanPhotoGalleryModal: React.FC<PlanPhotoGalleryModalProps> = ({
  isOpen,
  onClose,
  planId,
  currentCoverImage,
  onCommitSelection,
  onSelectPhoto,
  onEditCrop,
  onAddNewPhoto,
}) => {
  const [photos, setPhotos] = useState<PlanPhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Temporary selection state inside bottom sheet
  // Temporary selection state inside bottom sheet
  const [pendingPhoto, setPendingPhoto] = useState<PlanPhotoItem | null>(null);
  const [selectedPhotoPath, setSelectedPhotoPath] = useState<string | null>(null);
  const initialCommittedPathRef = React.useRef<string | null>(null);
  const hasCommittedRef = React.useRef(false);
  const touchStartYRef = React.useRef<number | null>(null);

  // Load photos for the scoped planId
  const loadPhotos = useCallback(async () => {
    if (!planId) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchPlanPhotos(planId, currentCoverImage);
      setPhotos(items);

      // Determine initially committed photo (defaults to current cover, or first available photo)
      const activeItem = items.find((p) => p.isCurrent) || items[0] || null;
      const initialPath = activeItem ? activeItem.fullDbPath : (currentCoverImage || null);
      initialCommittedPathRef.current = initialPath;

      if (activeItem) {
        setPendingPhoto(activeItem);
        setSelectedPhotoPath(activeItem.fullDbPath);
      } else {
        setPendingPhoto(null);
        setSelectedPhotoPath(null);
      }
    } catch (err: any) {
      console.error("[PlanPhotoGalleryModal] Error loading plan photos:", err);
      setError("Failed to load photos. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [planId, currentCoverImage]);

  useEffect(() => {
    if (isOpen) {
      hasCommittedRef.current = false;
      loadPhotos();
    }
  }, [isOpen, loadPhotos]);

  // Active / pending photo object (guarantees a valid photo is selected whenever photos exist)
  const activePhoto = useMemo(() => {
    if (!photos.length) return null;
    return (
      pendingPhoto ||
      photos.find((p) => p.fullDbPath === selectedPhotoPath) ||
      photos.find((p) => p.isCurrent) ||
      photos[0] ||
      null
    );
  }, [photos, pendingPhoto, selectedPhotoPath]);

  // Handle temporary thumbnail selection (does NOT update DB, cache, or external state while sheet is open)
  const handleThumbnailClick = (photo: PlanPhotoItem) => {
    setPendingPhoto(photo);
    setSelectedPhotoPath(photo.fullDbPath);

    // Update only the temporary selection inside the bottom sheet
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        isCurrent: p.fullDbPath === photo.fullDbPath,
      }))
    );
  };

  // Commit selection when the bottom sheet closes
  const handleDismiss = useCallback(async () => {
    if (hasCommittedRef.current) {
      onClose();
      return;
    }
    hasCommittedRef.current = true;

    const initialPath = initialCommittedPathRef.current;
    const newPath = pendingPhoto?.fullDbPath || null;

    // Determine whether temporary selection differs from the committed selection
    const hasChanged = Boolean(pendingPhoto && newPath && newPath !== initialPath);

    // Close the bottom sheet immediately
    onClose();

    // Commit only if selection actually changed
    if (hasChanged && pendingPhoto) {
      const commitFn = onCommitSelection || onSelectPhoto;
      try {
        await commitFn?.(pendingPhoto);
      } catch (err) {
        console.error("[PlanPhotoGalleryModal] Commit selection error:", err);
      }
    }
  }, [pendingPhoto, onCommitSelection, onSelectPhoto, onClose]);

  useDismissibleOverlay(isOpen, handleDismiss);

  // Swipe down to dismiss support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      if (deltaY > 60) {
        handleDismiss();
      }
      touchStartYRef.current = null;
    }
  };

  // User taps "Add New Photo": close without committing pending selection
  const handleAddNewPhotoClick = () => {
    hasCommittedRef.current = true;
    onClose();
    onAddNewPhoto();
  };

  // User taps "Edit Crop": open crop editor for active photo without premature photo-selection commit
  const handleEditCropClick = () => {
    if (activePhoto) {
      hasCommittedRef.current = true;
      onEditCrop(activePhoto);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center animate-in fade-in duration-200 select-none backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-full bg-[#121212] border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-4 text-left select-none shadow-2xl max-h-[85vh] overflow-hidden"
      >
        {/* Drag handle with swipe-down dismiss */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="w-full flex flex-col items-center pt-0.5 pb-1 cursor-grab active:cursor-grabbing sm:hidden flex-shrink-0"
        >
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header Bar */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex items-center justify-between flex-shrink-0 border-b border-white/10 pb-3"
        >
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#FF6B2C]" />
            Plan Photos
          </h2>
        </div>

        {/* Gallery Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-[160px] max-h-[46vh] py-1">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="aspect-[9/16] rounded-xl bg-zinc-800/60 animate-pulse border border-white/5"
                />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-zinc-400">{error}</p>
              <button
                type="button"
                onClick={loadPhotos}
                className="py-2 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-medium transition cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-3 px-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-400">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div className="max-w-xs">
                <p className="text-sm font-semibold text-white">No photos yet</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Add photos to personalize this plan's cover. All uploaded photos will be saved here.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => {
                const isSelected = activePhoto?.fullDbPath === photo.fullDbPath;
                return (
                  <button
                    key={photo.id || photo.name}
                    type="button"
                    onClick={() => handleThumbnailClick(photo)}
                    className={`aspect-[9/16] rounded-xl overflow-hidden relative group text-left cursor-pointer transition-all duration-150 border-2 bg-zinc-900 ${
                      isSelected
                        ? "border-[#FF6B2C] ring-2 ring-[#FF6B2C]/30 shadow-lg shadow-[#FF6B2C]/10 scale-[1.01]"
                        : "border-white/10 hover:border-white/30 active:scale-95"
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Active Checkmark Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FF6B2C] text-black flex items-center justify-center shadow-md animate-in zoom-in-50 duration-150">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions (No divider between gallery and buttons; vertical stack with Add New Photo on top) */}
        <div className="flex flex-col gap-2.5 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex-shrink-0 w-full">
          {/* Add New Photo Button (Top) */}
          <button
            type="button"
            onClick={handleAddNewPhotoClick}
            className="w-full py-3.5 px-4 rounded-xl bg-[#FF6B2C] hover:bg-[#FF7B40] text-white text-sm font-bold transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#FF6B2C]/20"
            title="Pick a photo from your device"
          >
            <Plus className="w-4 h-4 stroke-[3] text-white" />
            <span>Add New Photo</span>
          </button>

          {/* Edit Crop Button (Bottom) */}
          <button
            type="button"
            disabled={!activePhoto}
            onClick={handleEditCropClick}
            className="w-full py-3.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-semibold transition active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
            title="Adjust Home card crop"
          >
            <Crop className="w-4 h-4 text-zinc-300" />
            <span>Edit Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
