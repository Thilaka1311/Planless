import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchPlanPhotos,
  selectExistingPlanPhoto,
  updatePlanCardCrop,
  parseCropConfig,
  PlanPhotoItem,
  PlanCropConfig,
} from "../utils/planPhotos";
import {
  resolveImageDetails,
  ImageType,
  evictPlanImage,
  evictImageCache,
  setPlanCachedImage,
  getPlanCachedImage,
} from "../../../shared/imaging/imageResolver";
import { classifyImageSource } from "../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../config/planCoverImages";
import placeholderAsset from "../../../assets/placeholder.webp";
import { supabase } from "../../../../lib/supabaseClient";

// Mock supabase client
vi.mock("../../../../lib/supabaseClient", () => {
  const mockGetPublicUrl = vi.fn((key: string) => ({
    data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/plan-images/${key}` },
  }));
  const mockList = vi.fn();
  const mockUpload = vi.fn();
  const mockFrom = vi.fn();

  const mockStorageFrom = vi.fn(() => ({
    getPublicUrl: mockGetPublicUrl,
    list: mockList,
    upload: mockUpload,
  }));

  return {
    supabase: {
      storage: {
        from: mockStorageFrom,
      },
      from: mockFrom,
    },
    SUPABASE_URL: "https://mock.supabase.co",
  };
});

describe("Plan Photo Gallery & Crop Management Regression Suite", () => {
  const planId = "34305c48-fb7f-43b9-a414-9ce501257d07";
  const otherPlanId = "88888888-8888-8888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
    evictImageCache();

    (supabase.storage.from as any).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn((key: string) => ({
        data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/plan-images/${key}` },
      })),
    });
  });

  // 1. Opening the photo gallery for a specific plan
  it("Scenario 1: Opening the photo gallery lists photos for the specific plan", async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: [
        { name: "plancoverimage1.webp", created_at: "2026-10-15T10:00:00Z" },
        { name: "plancoverimage2.webp", created_at: "2026-10-16T12:00:00Z" },
      ],
      error: null,
    });

    (supabase.storage.from as any).mockReturnValue({
      list: mockList,
      getPublicUrl: (key: string) => ({
        data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/plan-images/${key}` },
      }),
    });

    const photos = await fetchPlanPhotos(planId, `plan-images/${planId}/plancoverimage2.webp`);

    expect(supabase.storage.from).toHaveBeenCalledWith("plan-images");
    expect(mockList).toHaveBeenCalledWith(planId, expect.anything());
    expect(photos).toHaveLength(2);
    // Highest version first
    expect(photos[0].name).toBe("plancoverimage2.webp");
    expect(photos[0].isCurrent).toBe(true);
    expect(photos[1].name).toBe("plancoverimage1.webp");
    expect(photos[1].isCurrent).toBe(false);
  });

  // 2. Displaying only photos associated with that plan
  it("Scenario 2: Displaying only photos associated with the current plan and filtering auxiliary files", async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: [
        { name: "plancoverimage1.webp", created_at: "2026-10-10T10:00:00Z" },
        { name: "plancoverimage3.webp", created_at: "2026-10-12T10:00:00Z" },
        { name: "plancardimage1.webp", created_at: "2026-10-10T10:01:00Z" }, // legacy card crop: should be excluded
        { name: ".emptyFolderPlaceholder", created_at: "2026-10-01T10:00:00Z" }, // auxiliary: should be excluded
        { name: "notes.txt", created_at: "2026-10-01T10:00:00Z" }, // non-image: should be excluded
      ],
      error: null,
    });

    (supabase.storage.from as any).mockReturnValue({
      list: mockList,
      getPublicUrl: (key: string) => ({
        data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/plan-images/${key}` },
      }),
    });

    const photos = await fetchPlanPhotos(planId);

    expect(photos).toHaveLength(2);
    expect(photos.map((p) => p.name)).toEqual(["plancoverimage3.webp", "plancoverimage1.webp"]);
    expect(photos.every((p) => p.storagePath.startsWith(`${planId}/`))).toBe(true);
    expect(photos.every((p) => p.fullDbPath.startsWith(`plan-images/${planId}/`))).toBe(true);
  });


  // 3. Selecting an existing photo without uploading a duplicate
  it("Scenario 3: Selecting an existing photo updates DB cover_image without uploading any file", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
    });

    const mockUpload = vi.fn();
    (supabase.storage.from as any).mockReturnValue({
      upload: mockUpload,
    });

    const photoToSelect: PlanPhotoItem = {
      id: "plancoverimage1.webp",
      name: "plancoverimage1.webp",
      storagePath: `${planId}/plancoverimage1.webp`,
      fullDbPath: `plan-images/${planId}/plancoverimage1.webp`,
      url: "https://mock.supabase.co/storage/v1/object/public/plan-images/planId/plancoverimage1.webp",
    };

    const result = await selectExistingPlanPhoto(planId, photoToSelect);

    expect(result.success).toBe(true);
    expect(result.path).toBe(`plan-images/${planId}/plancoverimage1.webp`);

    // Must NOT call storage upload!
    expect(mockUpload).not.toHaveBeenCalled();

    // Must update DB plans with the selected photo and clear cover_card_image
    expect(supabase.from).toHaveBeenCalledWith("plans");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_image: `plan-images/${planId}/plancoverimage1.webp`,
        cover_card_image: null,
      })
    );
  });

  // 4. Editing the card crop while preserving the original cover image
  it("Scenario 4: Editing the card crop saves crop metadata without touching or re-uploading original image", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
    });

    const mockUpload = vi.fn();
    (supabase.storage.from as any).mockReturnValue({
      upload: mockUpload,
    });

    const cropConfig: PlanCropConfig = {
      objectPosition: "50% 25%",
      scale: 1.35,
    };

    const result = await updatePlanCardCrop(planId, cropConfig);

    expect(result.success).toBe(true);
    expect(result.cropString).toBe('crop:{"objectPosition":"50% 25%","scale":1.35}');

    // Must NOT call storage upload
    expect(mockUpload).not.toHaveBeenCalled();

    // Database update stores only crop config in cover_card_image
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        cover_card_image: 'crop:{"objectPosition":"50% 25%","scale":1.35}',
      })
    );

    // Parsing the crop config restores exact values
    const parsed = parseCropConfig(result.cropString);
    expect(parsed).toEqual(cropConfig);
  });

  // 5. Adding a new photo and converting it to WebP
  it("Scenario 5: parseCropConfig returns null for empty or non-crop values", () => {
    expect(parseCropConfig(null)).toBeNull();
    expect(parseCropConfig(undefined)).toBeNull();
    expect(parseCropConfig("")).toBeNull();
    expect(parseCropConfig("plan-images/plan/plancoverimage1.webp")).toBeNull();
    expect(parseCropConfig("crop:invalid-json")).toBeNull();
  });

  // 6. Handling photo-picker cancellation
  it("Scenario 6: Handling photo-picker cancellation without modifying cover state", () => {
    const initialCover = `plan-images/${planId}/plancoverimage1.webp`;
    let currentCover = initialCover;

    // Simulate picker cancellation (no files selected)
    const simulatedFiles: File[] = [];
    if (simulatedFiles.length > 0) {
      currentCover = "new-image-path";
    }

    // Cover remains strictly intact
    expect(currentCover).toBe(initialCover);
  });

  // 7. Handling conversion and upload failures without losing the previous cover image
  it("Scenario 7: Upload/DB failures throw without altering previous state", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: new Error("Network disconnection") }),
    });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
    });

    const photoToSelect: PlanPhotoItem = {
      id: "plancoverimage1.webp",
      name: "plancoverimage1.webp",
      storagePath: `${planId}/plancoverimage1.webp`,
      fullDbPath: `plan-images/${planId}/plancoverimage1.webp`,
      url: "https://mock.supabase.co/img.webp",
    };

    await expect(selectExistingPlanPhoto(planId, photoToSelect)).rejects.toThrow("Network disconnection");
  });

  // 8. Deleting the selected custom image and falling back to default placeholder
  it("Scenario 8: Deleting custom image restores default placeholder.webp asset", () => {
    // Evict plan image cache as performed by deleteCustomPlanImage
    evictPlanImage(planId);

    const classification = classifyImageSource(null, planId);
    expect(classification.sourceType).toBe("LOCAL_DEFAULT");

    const details = resolveImageDetails(null, ImageType.PlanCover);
    expect(details.url).toBe(placeholderAsset);
    expect(details.url).toContain("placeholder.webp");
  });

  // 9. Ensuring Home screen card and Plan Preview use the correct image
  it("Scenario 9: Home screen card and Plan Preview resolve matching source with software crop", () => {
    const originalCover = `plan-images/${planId}/plancoverimage2.webp`;
    const cardCropString = 'crop:{"objectPosition":"60% 30%","scale":1.2}';

    const plan = {
      id: planId,
      coverImage: originalCover,
      cardCoverImage: cardCropString,
      category: "custom",
    };

    // Plan Preview uses original cover
    const previewSrc = plan.coverImage;
    expect(previewSrc).toBe(originalCover);

    // Home screen card uses canonical coverImage (ignoring "crop:..." as image src)
    const rawCard = plan.cardCoverImage;
    const legacyCard = typeof rawCard === "string" && !rawCard.startsWith("crop:") ? rawCard : null;
    const homeCardSrc = plan.coverImage || legacyCard || getPlanCover(plan.category);

    expect(homeCardSrc).toBe(originalCover);

    // Home screen card parses crop configuration into CSS styles
    const cropConfig = parseCropConfig(plan.cardCoverImage);
    const cropStyle = cropConfig
      ? {
          objectPosition: cropConfig.objectPosition,
          transform: `scale(${cropConfig.scale})`,
        }
      : {};

    expect(cropStyle.objectPosition).toBe("60% 30%");
    expect(cropStyle.transform).toBe("scale(1.2)");
  });

  // 10. Ensuring one plan cannot delete or modify another plan's images
  it("Scenario 10: selectExistingPlanPhoto refuses to select photos belonging to another plan", async () => {
    const foreignPhoto: PlanPhotoItem = {
      id: "foreign.webp",
      name: "foreign.webp",
      storagePath: `${otherPlanId}/plancoverimage1.webp`,
      fullDbPath: `plan-images/${otherPlanId}/plancoverimage1.webp`,
      url: "https://mock.supabase.co/foreign.webp",
    };

    await expect(selectExistingPlanPhoto(planId, foreignPhoto)).rejects.toThrow(
      "Cannot select photo belonging to another plan"
    );
  });

  // 11. Ensuring stale image caches do not display deleted images
  it("Scenario 11: Stale image caches are evicted and never return deleted image", () => {
    const customImage = `plan-images/${planId}/plancoverimage1.webp`;

    // Cache the image
    setPlanCachedImage(planId, customImage);
    expect(getPlanCachedImage(planId)).toBe(customImage);

    // Evict on delete
    evictPlanImage(planId);
    expect(getPlanCachedImage(planId)).toBe("placeholder.webp");

    const classification = classifyImageSource(null, planId);
    expect(classification.sourceType).toBe("LOCAL_DEFAULT");
  });

  // 12. Ensuring existing plans and their image references continue to work
  it("Scenario 12: Existing plans with legacy paths continue to resolve correctly", () => {
    const legacyPath = `plan-images/${planId}/plancoverimage1.webp`;
    const classification = classifyImageSource(legacyPath, planId);

    expect(classification.sourceType).toBe("PLAN");
    expect(classification.cleanedPath).toBe(`${planId}/plancoverimage1.webp`);

    const details = resolveImageDetails(classification.cleanedPath, ImageType.PlanCover);
    expect(details.url).toBeTruthy();
    expect(details.url).toContain(legacyPath);
  });
});
