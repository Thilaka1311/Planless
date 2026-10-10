import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveImageDetails,
  ImageType,
  evictImageCache,
} from "../../../shared/imaging/imageResolver";
import { classifyImageSource } from "../../../IMGfromDB/PlanImages";
import { getPlanCover, PLAN_COVER_IMAGES } from "../config/planCoverImages";
import { mapPlansToLegacyPlans } from "../../../../lib/mappers";
import { SUPABASE_URL } from "../../../../lib/supabaseClient";

describe("Plan Settings Image Parity & Canonical Resolution", () => {
  beforeEach(() => {
    evictImageCache();
  });

  /**
   * Helper that simulates how each screen resolves its image props
   * based on the exact component implementations.
   */
  function resolveScreenImages(plan: any) {
    // 1. Plan Details (PlansPreviewScreen.tsx lines 2289-2298)
    const planDetails = {
      src: plan.coverImage || plan.cover_image,
      planId: plan.dbUuid || plan.id,
      category: plan.category,
      subcategory: plan.subcategory || plan.sports_type,
    };

    // 2. Home Plan card (PlanCard.tsx lines 561-564, 665-670)
    const homeCard = {
      src: plan.cardCoverImage || plan.coverImage || getPlanCover(plan.category, plan.subcategory || plan.sports_type),
      planId: plan.dbUuid || plan.id,
      category: plan.category,
      subcategory: plan.subcategory || plan.sports_type,
    };

    // 3. Plan preview (HomePlansPreviewScreen.tsx lines 553-560)
    const planPreview = {
      src: plan.coverImage || plan.cover_image,
      planId: plan.dbUuid || plan.id,
      category: plan.category,
      subcategory: plan.subcategory || plan.sports_type,
    };

    // 4. Share Plan sheet (BottomSheets.tsx lines 4270, 4363-4367)
    const sharePlanSheet = {
      src: plan.coverImage || plan.cover_image,
      planId: plan.dbUuid || plan.id,
      category: plan.category,
      subcategory: plan.subcategory,
    };

    // 5. Plan Settings (PlanSettingsScreen.tsx lines 75-79, 603-610)
    const planSettings = {
      src: plan.coverImage || plan.cover_image || plan.cover_photo,
      planId: plan.dbUuid || plan.id,
      category: plan.category,
      subcategory: plan.subcategory || plan.sports_type,
    };

    return {
      planDetails,
      homeCard,
      planPreview,
      sharePlanSheet,
      planSettings,
    };
  }

  /**
   * Helper that simulates DiscoveryImages final URL resolution logic
   */
  function resolveDiscoveryImageUrl(item: {
    src?: string | null;
    planId?: string;
    category?: string;
    subcategory?: string | null;
  }): string {
    const { sourceType, cleanedPath } = classifyImageSource(item.src, item.planId);

    if (sourceType === "PLAN") {
      const details = resolveImageDetails(cleanedPath, ImageType.PlanCover);
      return details.url;
    }

    if (sourceType === "CATALOG") {
      const details = resolveImageDetails(cleanedPath, ImageType.DiscoveryCover);
      return details.url;
    }

    if (cleanedPath) {
      const details = resolveImageDetails(cleanedPath, ImageType.PlanCover);
      return details.url;
    }

    return getPlanCover(item.category, item.subcategory);
  }

  it("1. Custom image plan resolves to exact same image across all 5 views", () => {
    const customPlan = {
      id: "43643d33-7546-4bc3-8834-bc16346c3285",
      dbUuid: "43643d33-7546-4bc3-8834-bc16346c3285",
      title: "Lunch",
      coverImage: "plan-images/43643d33-7546-4bc3-8834-bc16346c3285/plancoverimage4.webp",
      cover_image: "plan-images/43643d33-7546-4bc3-8834-bc16346c3285/plancoverimage4.webp",
      category: "restaurants",
    };

    const screens = resolveScreenImages(customPlan);

    const planDetailsUrl = resolveDiscoveryImageUrl(screens.planDetails);
    const homeCardUrl = resolveDiscoveryImageUrl(screens.homeCard);
    const planPreviewUrl = resolveDiscoveryImageUrl(screens.planPreview);
    const shareSheetUrl = resolveDiscoveryImageUrl(screens.sharePlanSheet);
    const planSettingsUrl = resolveDiscoveryImageUrl(screens.planSettings);

    expect(planSettingsUrl).toBe(planDetailsUrl);
    expect(planSettingsUrl).toBe(homeCardUrl);
    expect(planSettingsUrl).toBe(planPreviewUrl);
    expect(planSettingsUrl).toBe(shareSheetUrl);
    expect(planSettingsUrl).toContain("plancoverimage4.webp");
  });

  it("2. Google Places image plan resolves to exact same proxy URL across all 5 views", () => {
    const placesPhotoPath =
      "/functions/v1/maps?action=photo&photo_reference=Aa-ngMbOLAalFoVHDnL2c2AnDoG1dSl&maxwidth=800";
    const placesPlan = {
      id: "a5c5ca11-0ebf-4179-9c04-3a38acf19bf1",
      dbUuid: "a5c5ca11-0ebf-4179-9c04-3a38acf19bf1",
      title: "Smash Guys",
      coverImage: placesPhotoPath,
      cover_image: placesPhotoPath,
      category: "restaurants",
    };

    const screens = resolveScreenImages(placesPlan);

    const planDetailsUrl = resolveDiscoveryImageUrl(screens.planDetails);
    const homeCardUrl = resolveDiscoveryImageUrl(screens.homeCard);
    const planPreviewUrl = resolveDiscoveryImageUrl(screens.planPreview);
    const shareSheetUrl = resolveDiscoveryImageUrl(screens.sharePlanSheet);
    const planSettingsUrl = resolveDiscoveryImageUrl(screens.planSettings);

    const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
    const expectedUrl = `${cleanBase}${placesPhotoPath}`;

    expect(planSettingsUrl).toBe(expectedUrl);
    expect(planSettingsUrl).toBe(planDetailsUrl);
    expect(planSettingsUrl).toBe(homeCardUrl);
    expect(planSettingsUrl).toBe(planPreviewUrl);
    expect(planSettingsUrl).toBe(shareSheetUrl);
  });

  it("3. Doomsday plan with legacy /src/assets/Movies.png resolves to Movies.webp, NOT default doodle", () => {
    const dbPlans = [
      {
        id: "4b790f81-6c81-41a9-ba94-d5038fb087ab",
        title: "Doomsday",
        cover_image: "/src/assets/Movies.png",
        category: "MOVIES",
        scheduled_at: "2026-10-09T10:45:00+00:00",
      },
    ];

    const mapped = mapPlansToLegacyPlans(dbPlans as any, [], [], "user-1");
    const doomsday = mapped[0];

    // Canonical mapped coverImage must resolve to the valid Movies cover asset
    expect(doomsday.coverImage).toBe(PLAN_COVER_IMAGES.movie);

    const screens = resolveScreenImages(doomsday);

    const planDetailsUrl = resolveDiscoveryImageUrl(screens.planDetails);
    const homeCardUrl = resolveDiscoveryImageUrl(screens.homeCard);
    const planPreviewUrl = resolveDiscoveryImageUrl(screens.planPreview);
    const shareSheetUrl = resolveDiscoveryImageUrl(screens.sharePlanSheet);
    const planSettingsUrl = resolveDiscoveryImageUrl(screens.planSettings);

    // All views must resolve to the exact same Movies cover, never the default doodle
    expect(planSettingsUrl).toBe(PLAN_COVER_IMAGES.movie);
    expect(planSettingsUrl).not.toBe(PLAN_COVER_IMAGES.default);
    expect(planSettingsUrl).toBe(planDetailsUrl);
    expect(planSettingsUrl).toBe(homeCardUrl);
    expect(planSettingsUrl).toBe(planPreviewUrl);
    expect(planSettingsUrl).toBe(shareSheetUrl);
  });

  it("4. Plan with genuinely no image falls back identically across all 5 views", () => {
    // 4a. Sports plan with no image -> sports.webp
    const sportsPlanNoImage = {
      id: "sports-plan-1",
      dbUuid: "sports-plan-1",
      title: "Badminton Match",
      coverImage: "",
      cover_image: null,
      category: "sports",
    };

    const sportsScreens = resolveScreenImages(sportsPlanNoImage);
    const sportsSettingsUrl = resolveDiscoveryImageUrl(sportsScreens.planSettings);
    expect(sportsSettingsUrl).toBe(PLAN_COVER_IMAGES.sports);
    expect(sportsSettingsUrl).toBe(resolveDiscoveryImageUrl(sportsScreens.planDetails));
    expect(sportsSettingsUrl).toBe(resolveDiscoveryImageUrl(sportsScreens.homeCard));
    expect(sportsSettingsUrl).toBe(resolveDiscoveryImageUrl(sportsScreens.planPreview));
    expect(sportsSettingsUrl).toBe(resolveDiscoveryImageUrl(sportsScreens.sharePlanSheet));

    // 4b. Custom plan with no image -> planimagedefault.webp
    const customPlanNoImage = {
      id: "custom-plan-1",
      dbUuid: "custom-plan-1",
      title: "Secret Hangout",
      coverImage: "",
      cover_image: null,
      category: "custom",
    };

    const customScreens = resolveScreenImages(customPlanNoImage);
    const customSettingsUrl = resolveDiscoveryImageUrl(customScreens.planSettings);
    expect(customSettingsUrl).toBe(PLAN_COVER_IMAGES.default);
    expect(customSettingsUrl).toBe(resolveDiscoveryImageUrl(customScreens.planDetails));
    expect(customSettingsUrl).toBe(resolveDiscoveryImageUrl(customScreens.homeCard));
    expect(customSettingsUrl).toBe(resolveDiscoveryImageUrl(customScreens.planPreview));
    expect(customSettingsUrl).toBe(resolveDiscoveryImageUrl(customScreens.sharePlanSheet));
  });

  it("5. Updating and deleting image through edit flow updates Plan Settings correctly", () => {
    let currentCover: string | null = PLAN_COVER_IMAGES.movie;

    // Simulate edit flow: user picks and uploads new custom image
    const newUploadedImage = "plan-images/doomsday-id/plancoverimage1.webp";
    currentCover = newUploadedImage;

    const updatedPlan = {
      id: "doomsday-id",
      title: "Doomsday",
      coverImage: currentCover,
      category: "movies",
    };

    const updatedScreens = resolveScreenImages(updatedPlan);
    const updatedSettingsUrl = resolveDiscoveryImageUrl(updatedScreens.planSettings);
    expect(updatedSettingsUrl).toContain("plancoverimage1.webp");
    expect(updatedSettingsUrl).toBe(resolveDiscoveryImageUrl(updatedScreens.planDetails));

    // Simulate edit flow: user deletes custom image
    currentCover = null;
    const deletedPlan = {
      id: "doomsday-id",
      title: "Doomsday",
      coverImage: currentCover,
      category: "movies",
    };

    const deletedScreens = resolveScreenImages(deletedPlan);
    const deletedSettingsUrl = resolveDiscoveryImageUrl(deletedScreens.planSettings);
    // After delete, must revert to Movies cover, NOT default doodle
    expect(deletedSettingsUrl).toBe(PLAN_COVER_IMAGES.movie);
    expect(deletedSettingsUrl).toBe(resolveDiscoveryImageUrl(deletedScreens.planDetails));
  });
});
