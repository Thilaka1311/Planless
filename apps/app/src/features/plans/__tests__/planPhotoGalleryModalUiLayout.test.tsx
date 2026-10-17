import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import { PlanPhotoGalleryModal } from "../components/PlanPhotoGalleryModal";
import * as planPhotosModule from "../utils/planPhotos";

// Mock fetchPlanPhotos
vi.mock("../utils/planPhotos", async () => {
  const actual = await vi.importActual<typeof planPhotosModule>("../utils/planPhotos");
  return {
    ...actual,
    fetchPlanPhotos: vi.fn(),
  };
});

describe("PlanPhotoGalleryModal UI Layout & Deferred Selection Behavior", () => {
  const mockPlanId = "4b790f81-6c81-41a9-ba94-d5038fb087ab";
  const mockPhoto1: planPhotosModule.PlanPhotoItem = {
    id: "photo-1",
    name: "plancoverimage1.webp",
    storagePath: `${mockPlanId}/plancoverimage1.webp`,
    fullDbPath: `plan-images/${mockPlanId}/plancoverimage1.webp`,
    url: "https://example.com/photo1.webp",
    isCurrent: true,
  };
  const mockPhoto2: planPhotosModule.PlanPhotoItem = {
    id: "photo-2",
    name: "plancoverimage2.webp",
    storagePath: `${mockPlanId}/plancoverimage2.webp`,
    fullDbPath: `plan-images/${mockPlanId}/plancoverimage2.webp`,
    url: "https://example.com/photo2.webp",
    isCurrent: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planPhotosModule.fetchPlanPhotos).mockResolvedValue([mockPhoto1, mockPhoto2]);
  });

  describe("1. Full-Width Layout Requirements", () => {
    it("occupies full screen width without outer horizontal margins or max-w constraints", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={mockPhoto1.fullDbPath}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      // Must be full-width
      expect(html).toContain("w-full max-w-full");
      // Must NOT contain max-w-lg, max-w-md, or outer horizontal margin constraints
      expect(html).not.toContain("max-w-lg");
      expect(html).not.toContain("max-w-md");
      expect(html).not.toContain("max-w-sm");
      expect(html).not.toContain("mx-auto");
      expect(html).not.toContain("mx-4");

      // Must be anchored to bottom of screen with rounded top corners
      expect(html).toContain("flex items-end justify-center");
      expect(html).toContain("rounded-t-3xl");

      // Must have dark background and safe area insets
      expect(html).toContain("bg-[#121212]");
      expect(html).toContain("pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]");
    });
  });

  describe("2. UI Elements & Action Buttons", () => {
    it("renders Add New Photo at the top and Edit Crop below in a vertical stack", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      expect(html).toContain("Add New Photo");
      expect(html).toContain("Edit Crop");

      // Vertical ordering: Add New Photo appears before Edit Crop
      const addNewIdx = html.indexOf("Add New Photo");
      const editCropIdx = html.indexOf("Edit Crop");
      expect(addNewIdx).toBeGreaterThan(-1);
      expect(editCropIdx).toBeGreaterThan(-1);
      expect(addNewIdx).toBeLessThan(editCropIdx);

      // Stack container is flex-col
      expect(html).toContain("flex flex-col gap-2.5");

      // Both buttons are full width
      expect(html).toContain("w-full py-3.5 px-4 rounded-xl bg-[#FF6B2C]");
      expect(html).toContain("w-full py-3.5 px-4 rounded-xl bg-white/[0.08]");
    });

    it("Add New Photo button has white text, white plus icon, and orange background", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      expect(html).toContain("bg-[#FF6B2C]");
      expect(html).toContain("text-white text-sm font-bold");
      expect(html).not.toContain("text-black text-xs");
      expect(html).not.toContain("text-black text-sm");
      expect(html).toContain("stroke-[3] text-white");
    });

    it("does not render the Close (X) button in the header", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      expect(html).not.toContain('title="Close"');
      expect(html).toContain("Plan Photos");
    });

    it("does not render the COVER label pill when rendering photos", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      expect(html).not.toContain(">Cover<");
      expect(html).not.toContain(">COVER<");
    });

    it("removes the photo-count subtitle entirely and preserves the Plan Photos heading", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={true}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      // Heading and orange icon must be preserved
      expect(html).toContain("Plan Photos");
      expect(html).toContain("text-[#FF6B2C]");

      // Subtitle and photo counts must NOT exist in the header or modal
      expect(html).not.toContain("available for this plan");
      expect(html).not.toContain("photos available");
      expect(html).not.toContain("photo available");
      expect(html).not.toContain("No uploaded photos yet");

      // Header container uses flex items-center justify-between pb-3
      expect(html).toContain("flex items-center justify-between flex-shrink-0 border-b border-white/10 pb-3");
    });

    it("modal is not rendered when isOpen is false", () => {
      const html = renderToString(
        <PlanPhotoGalleryModal
          isOpen={false}
          onClose={vi.fn()}
          planId={mockPlanId}
          currentCoverImage={null}
          onCommitSelection={vi.fn()}
          onEditCrop={vi.fn()}
          onAddNewPhoto={vi.fn()}
        />
      );

      expect(html).toBe("");
    });
  });

  describe("3. Code Architecture & Deferred Commit Invariants", () => {
    it("PlanPhotoGalleryModal implements temporary selection and commits only on dismissal", () => {
      const modalFilePath = path.resolve(__dirname, "../components/PlanPhotoGalleryModal.tsx");
      const modalCode = fs.readFileSync(modalFilePath, "utf-8");

      // Temporary selection state exists
      expect(modalCode).toContain("const [pendingPhoto, setPendingPhoto] = useState<PlanPhotoItem | null>(null);");
      expect(modalCode).toContain("const initialCommittedPathRef = React.useRef<string | null>(null);");
      expect(modalCode).toContain("const hasCommittedRef = React.useRef(false);");

      // Thumbnail tap updates only local pendingPhoto and photos, not committing immediately
      expect(modalCode).toContain("const handleThumbnailClick = (photo: PlanPhotoItem) => {");
      expect(modalCode).toContain("setPendingPhoto(photo);");

      // Commit happens inside handleDismiss
      expect(modalCode).toContain("const handleDismiss = useCallback(async () => {");
      expect(modalCode).toContain("const hasChanged = Boolean(pendingPhoto && newPath && newPath !== initialPath);");
      expect(modalCode).toContain("if (hasChanged && pendingPhoto) {");

      // Duplicate commit guard
      expect(modalCode).toContain("if (hasCommittedRef.current) {");
      expect(modalCode).toContain("hasCommittedRef.current = true;");

      // Dismissal hooked up to backdrop and useDismissibleOverlay
      expect(modalCode).toContain("useDismissibleOverlay(isOpen, handleDismiss);");
      expect(modalCode).toContain("onClick={handleDismiss}");
    });

    it("EditPlanImageScreen implements the exact Local State -> Local Cache -> Supabase sequence", () => {
      const screenFilePath = path.resolve(
        __dirname,
        "../screens/PlansScreen/PlansPreview/EditPlanImageScreen.tsx"
      );
      const screenCode = fs.readFileSync(screenFilePath, "utf-8");

      // Checks for handleCommitPhotoSelection function
      expect(screenCode).toContain("const handleCommitPhotoSelection = async (photo: PlanPhotoItem) => {");

      // Step 1: Local state updated first
      const step1Idx = screenCode.indexOf("Step 1: Update the local application state");
      const setCoverIdx = screenCode.indexOf("setCoverImage(updatedPath);", step1Idx);
      const onImageUpdatedIdx = screenCode.indexOf("onImageUpdated(updatedPath, null);", step1Idx);
      expect(step1Idx).toBeGreaterThan(-1);
      expect(setCoverIdx).toBeGreaterThan(step1Idx);
      expect(onImageUpdatedIdx).toBeGreaterThan(step1Idx);

      // Step 2: Local cache updated before Supabase network call
      const step2Idx = screenCode.indexOf("Step 2: Update the local cache");
      const setCacheIdx = screenCode.indexOf("setPlanCachedImage(planId, updatedPath);", step2Idx);
      const evictCacheIdx = screenCode.indexOf("evictImageCache(updatedPath, ImageType.PlanCover);", step2Idx);
      expect(step2Idx).toBeGreaterThan(step1Idx);
      expect(setCacheIdx).toBeGreaterThan(step2Idx);
      expect(evictCacheIdx).toBeGreaterThan(step2Idx);

      // Step 3: Supabase synchronization
      const step3Idx = screenCode.indexOf("Step 3: Synchronize with Supabase");
      const selectPhotoIdx = screenCode.indexOf("await selectExistingPlanPhoto(planId, photo);", step3Idx);
      expect(step3Idx).toBeGreaterThan(step2Idx);
      expect(selectPhotoIdx).toBeGreaterThan(step3Idx);

      // Offline / network failure resilience: does NOT revert UI or clear cache
      expect(screenCode).toContain("Failed to synchronize photo selection to Supabase:");
      expect(screenCode).not.toContain("setCoverImage(initialCoverImage);");

      // PlanPhotoGalleryModal is passed onCommitSelection
      expect(screenCode).toContain("onCommitSelection={handleCommitPhotoSelection}");
    });

    it("PlanPhotoGalleryModal guarantees activePhoto fallback and calls onEditCrop directly", () => {
      const modalFilePath = path.resolve(__dirname, "../components/PlanPhotoGalleryModal.tsx");
      const modalCode = fs.readFileSync(modalFilePath, "utf-8");

      // Active item resolution falls back to items[0] if no isCurrent match
      expect(modalCode).toContain("const activeItem = items.find((p) => p.isCurrent) || items[0] || null;");

      // Active photo memo falls back to photos[0] if no isCurrent match
      expect(modalCode).toContain("photos[0] ||");

      // handleEditCropClick invokes onEditCrop directly without intermediate onClose() call
      expect(modalCode).toContain("const handleEditCropClick = () => {");
      expect(modalCode).toContain("hasCommittedRef.current = true;");
      expect(modalCode).toContain("onEditCrop(activePhoto);");
      expect(modalCode).not.toContain("onClose();\n      onEditCrop(activePhoto);");
    });

    it("EditPlanImageScreen persists both cover_image and cover_card_image together to Supabase when editing crop", () => {
      const screenFilePath = path.resolve(
        __dirname,
        "../screens/PlansScreen/PlansPreview/EditPlanImageScreen.tsx"
      );
      const screenCode = fs.readFileSync(screenFilePath, "utf-8");

      // In handleSaveCrop: updates cover_image AND cover_card_image
      expect(screenCode).toContain("if (isEditingExistingCrop && selectedPhotoForCrop) {");
      expect(screenCode).toContain("const activeCover = selectedPhotoForCrop.fullDbPath;");
      expect(screenCode).toContain("setPlanCachedImage(planId, activeCover);");
      expect(screenCode).toContain("evictImageCache(activeCover, ImageType.PlanCover);");
      expect(screenCode).toContain("cover_image: activeCover,");
      expect(screenCode).toContain("cover_card_image: cropString,");
    });
  });

  describe("4. Plan Photo Details Screen UI Refinements (EditPlanImageScreen)", () => {
    const screenFilePath = path.resolve(
      __dirname,
      "../screens/PlansScreen/PlansPreview/EditPlanImageScreen.tsx"
    );
    const screenCode = fs.readFileSync(screenFilePath, "utf-8");

    it("displays the exact replacement helper text below the photo", () => {
      expect(screenCode).toContain("View and edit your plan photo.");
      expect(screenCode).toContain('<p className="text-xs text-white/40 mt-3 text-center select-none">\n          View and edit your plan photo.\n        </p>');
    });

    it("completely removes the previous helper text", () => {
      expect(screenCode).not.toContain("This image appears in your Plan Preview.");
      expect(screenCode).not.toContain("Tap ✏️ to open the photo gallery");
    });

    it("completely removes the trash icon and delete button from the top navigation bar", () => {
      expect(screenCode).not.toContain("<Trash2");
      expect(screenCode).not.toContain('import { ArrowLeft, Pencil, Trash2 }');
      expect(screenCode).not.toContain('title="Delete custom image"');
      expect(screenCode).not.toContain('title="Using default image"');
      expect(screenCode).not.toContain("showDeleteConfirm");
    });

    it("positions the edit icon at the far right of the header with back button and plan title on the left", () => {
      // Header container is justify-between
      expect(screenCode).toContain('justify-between gap-3 flex-shrink-0 relative z-30 min-h-[48px]');

      // Left group contains back arrow and truncated plan title
      expect(screenCode).toContain('className="flex items-center gap-2.5 min-w-0 flex-1"');
      expect(screenCode).toContain('<ArrowLeft className="w-6 h-6" />');
      expect(screenCode).toContain('className="text-lg font-bold text-white tracking-tight truncate"');

      // Right item is directly the Pencil edit button positioned at far right with -mr-2
      expect(screenCode).toContain('className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer disabled:opacity-50 flex-shrink-0"');
      expect(screenCode).toContain('<Pencil className="w-5 h-5" />');
      expect(screenCode).toContain('onClick={handleOpenGallery}');
    });
  });
});

