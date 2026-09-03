import React, { useState, useEffect, useMemo } from "react";
import { resolveImageDetails, ImageType, subscribeToImageCache, getPlanCachedImage } from "../shared/imaging/imageResolver";
import { getPlanCover, PLAN_COVER_IMAGES } from "../features/plans/config/planCoverImages";

export interface DiscoveryImagesProps {
  id?: string;
  /** The storage path or full URL of the cover image. */
  src?: string | null;
  /** Plan ID for logging and cache identification */
  planId?: string;
  /** Category to determine fallback covers */
  category?: string;
  /** Subcategory for granular sport/dining fallback */
  subcategory?: string | null;
  /** Screen name for explicit logging */
  screen?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Extra CSS styles */
  className?: string;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  style?: React.CSSProperties;
}

export type ImageSourceType = "PLAN" | "CATALOG" | "LOCAL_DEFAULT";

export function classifyImageSource(
  src: string | null | undefined,
  planId?: string
): {
  sourceType: ImageSourceType;
  cleanedPath: string;
} {
  // If this plan has been evicted/reset to default, classify directly as LOCAL_DEFAULT
  if (planId && getPlanCachedImage(planId) === "planimagedefault.png") {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }

  if (
    !src ||
    !src.trim() ||
    src === "null" ||
    src === "undefined" ||
    src === "default" ||
    src === "planimagedefault.png" ||
    src.includes("planimagedefault")
  ) {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }
  const raw = src.trim();

  // If the raw path itself is cached as planimagedefault.png
  if (getPlanCachedImage(raw) === "planimagedefault.png") {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }

  // 1. Local default or asset paths
  if (
    raw.startsWith("/assets/") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/")
  ) {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: raw };
  }

  // 2. Plan-specific user image: <uuid>.webp, <uuid>/plancoverimageN.webp, or plan-images/...
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(raw) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/plancoverimage\d+\.webp$/i.test(raw) ||
    raw.startsWith("plan-images/")
  ) {
    const objectKey = raw.startsWith("plan-images/") ? raw.slice("plan-images/".length) : raw;
    return { sourceType: "PLAN", cleanedPath: objectKey };
  }

  // 3. Existing catalog / discovery image: e.g. movies/..., dining/..., sports/...
  if (
    raw.startsWith("movies/") ||
    raw.startsWith("dining/") ||
    raw.startsWith("sports/") ||
    raw.startsWith("discovery-images/") ||
    raw.includes("/")
  ) {
    return { sourceType: "CATALOG", cleanedPath: raw };
  }

  return { sourceType: "LOCAL_DEFAULT", cleanedPath: raw };
}

/**
 * DiscoveryImages
 *
 * THE REQUIRED RULE:
 * If: plans.cover_image points to a plan-specific image (sourceType === "PLAN")
 * then ONLY load from the plan-images bucket.
 * DO NOT try category images or any fallback. If loading fails, keep the failed state visible.
 *
 * If cover_image is absent: use category / default image.
 */
export const DiscoveryImages: React.FC<DiscoveryImagesProps> = ({
  id,
  src,
  planId,
  category = "CUSTOM",
  subcategory,
  screen = "Plan Image",
  alt = "Discovery Preview",
  className = "",
  onClick,
  style,
}) => {
  const [version, setVersion] = useState<number>(0);
  const [catalogFailed, setCatalogFailed] = useState(false);

  // Subscribe to image cache updates
  useEffect(() => {
    return subscribeToImageCache((evictedPath, newVersion) => {
      const cleanSrc = (src || "").trim();
      const fileName = cleanSrc.split("/").pop();
      const evictedFile = evictedPath.split("/").pop();
      const cleanPlan = (planId || "").trim();
      if (
        !evictedPath ||
        cleanSrc.includes(evictedPath) ||
        evictedPath.includes(cleanSrc) ||
        (fileName && fileName === evictedFile) ||
        (cleanPlan && (evictedPath.includes(cleanPlan) || cleanPlan.includes(evictedPath))) ||
        evictedPath === "planimagedefault.png"
      ) {
        setCatalogFailed(false);
        setVersion(newVersion || Date.now());
      }
    });
  }, [src, planId]);

  // Reset state when src changes
  useEffect(() => {
    setCatalogFailed(false);
  }, [src]);

  const { sourceType, cleanedPath } = useMemo(
    () => classifyImageSource(src, planId),
    [src, planId, version]
  );

  const { resolvedPath, resolvedUrl } = useMemo(() => {
    if (sourceType === "PLAN") {
      // ONLY load from plan-images bucket. Never fallback.
      const details = resolveImageDetails(cleanedPath, ImageType.PlanCover);
      return { resolvedPath: cleanedPath, resolvedUrl: details.url };
    }

    if (sourceType === "CATALOG") {
      if (catalogFailed) {
        const defaultAsset = getPlanCover(category, subcategory);
        return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
      }
      const details = resolveImageDetails(cleanedPath, ImageType.DiscoveryCover);
      return { resolvedPath: cleanedPath, resolvedUrl: details.url };
    }

    // LOCAL_DEFAULT (cover_image absent, deleted, or planimagedefault.png)
    const defaultAsset = cleanedPath && (cleanedPath.startsWith("/assets/") || cleanedPath.startsWith("/"))
      ? cleanedPath
      : PLAN_COVER_IMAGES.default;
    return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
  }, [sourceType, cleanedPath, catalogFailed, category, subcategory, version]);

  const handleLoadSuccess = () => {
    // silent
  };

  const handleLoadFailure = () => {
    // If sourceType is PLAN: DO NOT FALLBACK. Keep failed state visible.
    if (sourceType === "CATALOG") {
      setCatalogFailed(true);
    }
  };

  return (
    <img
      id={id}
      src={resolvedUrl}
      alt={alt}
      className={className}
      onLoad={handleLoadSuccess}
      onError={handleLoadFailure}
      onClick={onClick}
      style={style}
      referrerPolicy="no-referrer"
    />
  );
};
