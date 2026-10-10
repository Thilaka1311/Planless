import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveImageDetails,
  resolveImage,
  toCanonicalPlanPhoto,
  ImageType,
  evictImageCache,
} from "../../../shared/imaging/imageResolver";
import { classifyImageSource } from "../../../IMGfromDB/PlanImages";
import { SUPABASE_URL } from "../../../../lib/supabaseClient";

describe("Google Places Plan Photo Persistence & Resolution", () => {
  beforeEach(() => {
    evictImageCache();
  });

  const photoRef =
    "Aa-ngMbQ2AOzYpa5LDs1LqcCnX74dPDsC1EyaIhO0iwrzMZ92QTR5sczIooQNe6pbIx84T3LJRkGw2pKVEgQ_29tjUM44nZ79f_kg8Ns7wtxfra-EWr9RKSxuh14u03DTzuw1QvjaQqiuQHE5wBmNzSKc48HVlC5f7fI1Zf5CPFPEWXJaOObZYPJcO8V5sYb0HNgqaflzjggfJLtS7";

  it("normalizes localhost Google Places proxy URL to canonical relative path", () => {
    const localhostUrl = `http://127.0.0.1:54321/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`;
    const canonical = toCanonicalPlanPhoto(localhostUrl);
    expect(canonical).toBe(
      `/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`
    );
  });

  it("normalizes remote/ngrok Google Places proxy URL to canonical relative path", () => {
    const ngrokUrl = `https://random-subdomain.ngrok-free.app/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`;
    const canonical = toCanonicalPlanPhoto(ngrokUrl);
    expect(canonical).toBe(
      `/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`
    );
  });

  it("re-anchors a stored localhost URL to the active viewer SUPABASE_URL", () => {
    const storedLocalhostUrl = `http://127.0.0.1:54321/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`;
    const details = resolveImageDetails(storedLocalhostUrl, ImageType.PlanCover);

    const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
    expect(details.url).toBe(
      `${cleanBase}/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`
    );
    expect(details.bucket).toBe("none");
  });

  it("re-anchors a canonical relative path to the active viewer SUPABASE_URL", () => {
    const canonicalPath = `/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`;
    const details = resolveImageDetails(canonicalPath, ImageType.PlanCover);

    const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
    expect(details.url).toBe(
      `${cleanBase}/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`
    );
  });

  it("canonically resolves Places API (New) photo resource names", () => {
    const placePhotoResource = "places/ChIJFRa6B7YZrjsRS5uUnSDXnmQ/photos/Ac1w5XN...";
    const details = resolveImageDetails(placePhotoResource, ImageType.PlanCover);

    const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
    expect(details.url).toBe(
      `${cleanBase}/functions/v1/maps?action=photo&photo_reference=${encodeURIComponent(
        placePhotoResource
      )}&maxwidth=800`
    );
  });

  it("properly classifies Google Places photo references in classifyImageSource", () => {
    const canonicalPath = `/functions/v1/maps?action=photo&photo_reference=${photoRef}&maxwidth=800`;
    const classified = classifyImageSource(canonicalPath);
    expect(classified.sourceType).toBe("LOCAL_DEFAULT");
    expect(classified.cleanedPath).toBe(canonicalPath);

    const newPlacesRef = "places/ChIJ123/photos/photo456";
    const classifiedNew = classifyImageSource(newPlacesRef);
    expect(classifiedNew.sourceType).toBe("LOCAL_DEFAULT");
    expect(classifiedNew.cleanedPath).toBe(newPlacesRef);
  });

  it("falls back to default placeholder only when photo is genuinely absent", () => {
    const emptyDetails = resolveImageDetails("", ImageType.PlanCover);
    expect(emptyDetails.url).toContain("planimagedefault.webp");

    const nullDetails = resolveImageDetails(null, ImageType.PlanCover);
    expect(nullDetails.url).toContain("planimagedefault.webp");

    const defaultDetails = resolveImageDetails("planimagedefault.png", ImageType.PlanCover);
    expect(defaultDetails.url).toContain("planimagedefault.webp");
  });

  it("preserves non-maps external URLs as pass-through without mangling", () => {
    const unsplashUrl = "https://images.unsplash.com/photo-12345?w=800";
    const details = resolveImageDetails(unsplashUrl, ImageType.PlanCover);
    expect(details.url).toBe(unsplashUrl);

    const localAsset = "/assets/dining.webp";
    const localDetails = resolveImageDetails(localAsset, ImageType.PlanCover);
    expect(localDetails.url).toBe(localAsset);
  });
});
