import React, { useState, useEffect, useMemo } from "react";
import { resolveImageDetails, ImageType, subscribeToImageCache, getPlanCachedImage } from "../shared/imaging/imageResolver";
import { getPlanCover, PLAN_COVER_IMAGES } from "../features/plans/config/planCoverImages";
import placeholderCoverSrc from "../assets/placeholder.webp";

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
  /** Explicit width for aspect ratio reservation */
  width?: number | string;
  /** Explicit height for aspect ratio reservation */
  height?: number | string;
  /** Image loading strategy - defaults to lazy */
  loading?: "lazy" | "eager";
  /** Image decoding strategy - defaults to async */
  decoding?: "async" | "sync" | "auto";
  /** Extra CSS styles */
  className?: string;
  /** Draggable attribute */
  draggable?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onError?: () => void;
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
  if (
    planId &&
    (getPlanCachedImage(planId) === "placeholder.webp" ||
      getPlanCachedImage(planId) === "planimagedefault.png" ||
      getPlanCachedImage(planId) === "planimagedefault.webp")
  ) {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }

  if (
    !src ||
    !src.trim() ||
    src === "null" ||
    src === "undefined" ||
    src === "default" ||
    src === "placeholder.webp" ||
    src === "planimagedefault.png" ||
    src === "planimagedefault.webp" ||
    src.includes("placeholder") ||
    src.includes("planimagedefault")
  ) {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }
  const raw = src.trim();

  // If the raw path itself is cached as placeholder/planimagedefault, points to obsolete plan-covers, or points to obsolete .png category assets
  if (
    getPlanCachedImage(raw) === "placeholder.webp" ||
    getPlanCachedImage(raw) === "planimagedefault.png" ||
    getPlanCachedImage(raw) === "planimagedefault.webp" ||
    raw.includes("plan-covers") ||
    raw.endsWith("Movies.png") ||
    raw.endsWith("sports.png") ||
    raw.endsWith("dining.png") ||
    (raw.startsWith("/src/assets/") && raw.endsWith(".png"))
  ) {
    return { sourceType: "LOCAL_DEFAULT", cleanedPath: "" };
  }

  // 1. Local default or asset paths / external URLs / Maps proxy URLs
  if (
    raw.includes("/functions/v1/maps") ||
    raw.includes("action=photo") ||
    raw.includes("photo_reference=") ||
    (raw.startsWith("places/") && raw.includes("/photos/")) ||
    raw.startsWith("/assets/") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://")
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
  width,
  height,
  loading = "lazy",
  decoding = "async",
  className = "",
  onClick,
  onError,
  style,
}) => {
  const [version, setVersion] = useState<number>(0);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  const [planFailed, setPlanFailed] = useState(false);

  const isStrictDiscoveryCategory = ["SPORTS", "DINING", "ACTIVITIES"].includes(
    (category || "").toUpperCase()
  );

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
        evictedPath === "placeholder.webp" ||
        evictedPath === "planimagedefault.png" ||
        evictedPath === "planimagedefault.webp"
      ) {
        setCatalogFailed(false);
        setLocalFailed(false);
        setPlanFailed(false);
        setVersion(newVersion || Date.now());
      }
    });
  }, [src, planId]);

  // Reset state when src or planId changes
  useEffect(() => {
    setCatalogFailed(false);
    setLocalFailed(false);
    setPlanFailed(false);
  }, [src, planId]);

  const { sourceType, cleanedPath } = useMemo(
    () => classifyImageSource(src, planId),
    [src, planId, version]
  );

  const { resolvedPath, resolvedUrl } = useMemo(() => {
    const isDiscoveryCard = screen === "Discovery Card" || (!planId && !screen);
    const defaultAsset = getPlanCover(category, subcategory) || placeholderCoverSrc;

    if (sourceType === "PLAN") {
      if (planFailed) {
        return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
      }
      const details = resolveImageDetails(cleanedPath, ImageType.PlanCover);
      return { resolvedPath: cleanedPath, resolvedUrl: details.url || defaultAsset };
    }

    if (sourceType === "CATALOG") {
      if (catalogFailed) {
        if (isDiscoveryCard && isStrictDiscoveryCategory) {
          return { resolvedPath: "", resolvedUrl: "" };
        }
        return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
      }
      const details = resolveImageDetails(cleanedPath, ImageType.DiscoveryCover);
      return { resolvedPath: cleanedPath, resolvedUrl: details.url || defaultAsset };
    }

    // LOCAL_DEFAULT (cover_image absent, deleted, or placeholder)
    if (localFailed) {
      if (isDiscoveryCard && isStrictDiscoveryCategory) {
        return { resolvedPath: "", resolvedUrl: "" };
      }
      return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
    }

    if (cleanedPath) {
      const details = resolveImageDetails(cleanedPath, ImageType.PlanCover);
      return { resolvedPath: details.objectKey, resolvedUrl: details.url || defaultAsset };
    }

    if (isDiscoveryCard && isStrictDiscoveryCategory) {
      return { resolvedPath: "", resolvedUrl: "" };
    }

    return { resolvedPath: defaultAsset, resolvedUrl: defaultAsset };
  }, [sourceType, cleanedPath, catalogFailed, localFailed, planFailed, category, subcategory, version, isStrictDiscoveryCategory, screen, planId]);

  useEffect(() => {
    if (isStrictDiscoveryCategory && (!resolvedUrl || resolvedUrl === "")) {
      onError?.();
    }
  }, [isStrictDiscoveryCategory, resolvedUrl, onError]);

  const handleLoadSuccess = () => {
    // silent
  };

  const handleLoadFailure = () => {
    if (sourceType === "PLAN") {
      setPlanFailed(true);
    } else if (sourceType === "CATALOG") {
      setCatalogFailed(true);
    } else if (sourceType === "LOCAL_DEFAULT") {
      setLocalFailed(true);
    }
    if (onError) {
      onError();
    }
  };

  return (
    <img
      id={id}
      src={resolvedUrl}
      alt={alt || ""}
      width={width}
      height={height}
      loading={loading || "lazy"}
      decoding={decoding || "async"}
      className={className}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onLoad={handleLoadSuccess}
      onError={handleLoadFailure}
      onClick={onClick}
      style={{
        ...style,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      referrerPolicy="no-referrer"
    />
  );
};
