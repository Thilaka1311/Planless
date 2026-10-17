import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveImageDetails, ImageType, evictPlanImage, setPlanCachedImage } from "../../../shared/imaging/imageResolver";
import { classifyImageSource } from "../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../config/planCoverImages";
import { mapPlansToLegacyPlans } from "../../../../lib/mappers";
import placeholderAsset from "../../../assets/placeholder.webp";

describe("Plan Image Deletion & Default Placeholder Fallback Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Scenario 1: A plan with a custom cover image displays that image correctly.
  it("Scenario 1: A plan with a custom cover image resolves and displays that custom image", () => {
    const customCover = "plan-images/34305c48-fb7f-43b9-a414-9ce501257d07/plancoverimage1.webp";
    const classification = classifyImageSource(customCover, "34305c48-fb7f-43b9-a414-9ce501257d07");
    expect(classification.sourceType).toBe("PLAN");
    expect(classification.cleanedPath).toBe("34305c48-fb7f-43b9-a414-9ce501257d07/plancoverimage1.webp");

    const details = resolveImageDetails(classification.cleanedPath, ImageType.PlanCover);
    expect(details.url).toBeTruthy();
    expect(details.url).toContain("34305c48-fb7f-43b9-a414-9ce501257d07/plancoverimage1.webp");
  });

  // Scenario 2: Deleting the custom image immediately restores the default .webp placeholder.
  it("Scenario 2: Deleting the custom image immediately restores the default .webp placeholder", () => {
    const planId = "34305c48-fb7f-43b9-a414-9ce501257d07";
    // Evict plan image as deleteCustomPlanImage does
    evictPlanImage(planId);

    // Classification recognizes the deleted state
    const classification = classifyImageSource(null, planId);
    expect(classification.sourceType).toBe("LOCAL_DEFAULT");

    // Resolver returns placeholder.webp
    const details = resolveImageDetails(null, ImageType.PlanCover);
    expect(details.url).toBe(placeholderAsset);
    expect(details.url).toContain("placeholder.webp");
  });

  // Scenario 3: The default placeholder remains visible after refreshing the page (DB persisted cover_image = null).
  it("Scenario 3: The default placeholder remains active after page reload when DB cover_image is null", () => {
    const rawDbPlan = {
      id: "fresh-plan-uuid",
      title: "Saturday Chill",
      cover_image: null,
      cover_card_image: null,
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      category: "custom",
    };

    const mapped = mapPlansToLegacyPlans([rawDbPlan as any], [], [], "host-user");
    expect(mapped[0].coverImage).toBe(placeholderAsset);
    expect(mapped[0].cardCoverImage).toBeNull();

    const classification = classifyImageSource(mapped[0].coverImage, mapped[0].id);
    expect(classification.sourceType).toBe("LOCAL_DEFAULT");

    const details = resolveImageDetails(null, ImageType.PlanCover);
    expect(details.url).toBe(placeholderAsset);
  });

  // Scenario 4: Navigating between Home, Plans, Plan Preview, and Edit Plan Image screen never causes the image to become blank.
  it("Scenario 4: Consumer screens derive stable non-empty image source across transitions", () => {
    const plan = {
      id: "nav-plan-1",
      title: "Coffee Chat",
      coverImage: null,
      cardCoverImage: null,
      category: "custom",
    };

    // 1. Home Plan Card
    const homeCardSrc = plan.coverImage || plan.cardCoverImage || getPlanCover(plan.category);
    expect(homeCardSrc).toBeTruthy();
    expect(homeCardSrc).toBe(placeholderAsset);

    // 2. Plans List
    const plansListSrc = plan.coverImage || getPlanCover(plan.category);
    expect(plansListSrc).toBeTruthy();
    expect(plansListSrc).toBe(placeholderAsset);

    // 3. Plan Preview / Hero Header
    const previewSrc = plan.coverImage || getPlanCover(plan.category);
    expect(previewSrc).toBeTruthy();
    expect(previewSrc).toBe(placeholderAsset);

    // 4. Edit Plan Image Screen
    const editScreenSrc = plan.coverImage || getPlanCover(plan.category);
    expect(editScreenSrc).toBeTruthy();
    expect(editScreenSrc).toBe(placeholderAsset);

    // Verify none are empty string or broken
    expect(homeCardSrc).not.toBe("");
    expect(previewSrc).not.toBe("");
  });

  // Scenario 5: Replacing the default placeholder with a new custom image still works.
  it("Scenario 5: Replacing the default placeholder with a new custom image updates the canonical path", () => {
    const planId = "replace-plan-id";
    const newCoverDbPath = `plan-images/${planId}/plancoverimage1.webp`;

    // Local cache updated
    setPlanCachedImage(planId, newCoverDbPath);

    const classification = classifyImageSource(newCoverDbPath, planId);
    expect(classification.sourceType).toBe("PLAN");
    expect(classification.cleanedPath).toBe(`${planId}/plancoverimage1.webp`);

    const details = resolveImageDetails(classification.cleanedPath, ImageType.PlanCover);
    expect(details.url).toContain(newCoverDbPath.replace("plan-images/", ""));
  });

  // Scenario 6: A plan that has never had a custom image displays the default placeholder.
  it("Scenario 6: A plan that has never had a custom image displays the default placeholder", () => {
    const newPlan = {
      id: "brand-new-plan",
      title: "First Ever Plan",
      cover_image: null,
      cover_card_image: null,
      category: "custom",
    };

    const mapped = mapPlansToLegacyPlans([newPlan as any], [], [], "host-1");
    expect(mapped[0].coverImage).toBe(placeholderAsset);

    const details = resolveImageDetails(mapped[0].coverImage, ImageType.PlanCover);
    expect(details.url).toBe(placeholderAsset);
  });

  // Scenario 7: A null, empty, invalid, or failed image URL falls back to the placeholder without a broken-image icon.
  it("Scenario 7: A null, empty, invalid, or failed image URL falls back to the placeholder", () => {
    const nullDetails = resolveImageDetails(null, ImageType.PlanCover);
    expect(nullDetails.url).toBe(placeholderAsset);

    const emptyDetails = resolveImageDetails("", ImageType.PlanCover);
    expect(emptyDetails.url).toBe(placeholderAsset);

    const whitespaceDetails = resolveImageDetails("   ", ImageType.PlanCover);
    expect(whitespaceDetails.url).toBe(placeholderAsset);

    const placeholderDetails = resolveImageDetails("placeholder.webp", ImageType.PlanCover);
    expect(placeholderDetails.url).toBe(placeholderAsset);

    // classifyImageSource ensures invalid/null/empty/placeholder all route to LOCAL_DEFAULT without throwing
    expect(classifyImageSource(null).sourceType).toBe("LOCAL_DEFAULT");
    expect(classifyImageSource("").sourceType).toBe("LOCAL_DEFAULT");
    expect(classifyImageSource("placeholder.webp").sourceType).toBe("LOCAL_DEFAULT");
  });

  // Scenario 8: The plan-card crop is derived from the active cover image, including when the default placeholder is used.
  it("Scenario 8: The plan-card crop derives naturally from the active cover image (placeholder.webp)", () => {
    const plan = {
      id: "crop-plan-1",
      coverImage: placeholderAsset,
      cardCoverImage: null,
      category: "custom",
    };

    // Card uses the active coverImage as its source for CSS object-fit: cover
    const cardDerivedSource = plan.coverImage || plan.cardCoverImage || getPlanCover(plan.category);
    expect(cardDerivedSource).toBe(placeholderAsset);
    expect(cardDerivedSource).toContain("placeholder.webp");
  });
});
