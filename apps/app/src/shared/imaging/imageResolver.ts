/**
 * imageResolver.ts
 *
 * Planless shared image resolution layer.
 *
 * This is the single place in the application that knows:
 *   - which storage bucket holds which type of image
 *   - how to convert a stored path into a renderable public URL
 *   - what placeholder to show when an image is absent or broken
 *   - how to support legacy paths alongside the new canonical format
 *
 * Every component and feature that renders an image should obtain its URL
 * from this module. No feature should ever call supabase.storage.getPublicUrl(),
 * hard-code a bucket name, or construct a Supabase storage URL directly.
 *
 * Future capabilities (signed URLs, CDN domains, image transforms, cache-busting)
 * can be implemented here without changing any caller.
 *
 * Usage:
 *   import { resolveImage, ImageType } from "@/shared/imaging/imageResolver";
 *
 *   // Explicit type — preferred
 *   const url = resolveImage(storagePath, ImageType.DiscoveryCover);
 *
 *   // Auto-detect from path structure — legacy / unknown
 *   const url = resolveImage(storagePath);
 */

import { supabase } from "../../../lib/supabaseClient";

// ─── Image types ──────────────────────────────────────────────────────────────

/**
 * Discriminator passed by callers so the resolver knows which bucket / fallback
 * to use. Extend this enum when adding new image contexts (circles, events, etc.)
 * without changing any existing caller.
 */
export enum ImageType {
  /** User profile avatar — resolves via the `avatars` bucket */
  Avatar = "avatar",
  /** Discovery card cover — resolves via `discovery-images` */
  DiscoveryCover = "discovery",
  /** Plan / event cover — resolves via `plan-images` (legacy) */
  PlanCover = "plan",
  /**
   * Unknown / auto-detect.
   * The resolver will inspect the path prefix to determine the correct bucket.
   * Use when migrating call sites that don't yet know the image type.
   */
  Unknown = "unknown",
}

// ─── Bucket registry ──────────────────────────────────────────────────────────

/**
 * Central registry that maps every ImageType to its Supabase bucket name.
 * Bucket names are defined in exactly one place in the entire codebase.
 */
const BUCKET_REGISTRY: Record<Exclude<ImageType, ImageType.Unknown>, string> = {
  [ImageType.Avatar]: "avatars",
  [ImageType.DiscoveryCover]: "discovery-images",
  [ImageType.PlanCover]: "plan-images",
};

/**
 * Known path prefixes stored in the database that indicate the bucket.
 * Used for auto-detection when ImageType.Unknown is passed.
 */
const PREFIX_TO_BUCKET: Record<string, string> = {
  "avatars/": "avatars",
  "discovery-images/": "discovery-images",
  "plan-images/": "plan-images",
  // common category prefixes written by adminUploadImage (sports/, movies/, dining/)
  "sports/": "discovery-images",
  "movies/": "discovery-images",
  "dining/": "discovery-images",
  "drinks/": "discovery-images",
  "custom/": "discovery-images",
};

// ─── Placeholder registry ─────────────────────────────────────────────────────

/**
 * Import placeholders here. Components receive the resolved URL and never need
 * to import asset files themselves.
 */
import defaultAvatarSrc from "../../assets/default_avatar.png";
import placeholderCoverSrc from "../../assets/placeholder.png";
import defaultPlanCoverSrc from "../../assets/planimagedefault.png";

const PLACEHOLDER_REGISTRY: Record<ImageType, string> = {
  [ImageType.Avatar]: defaultAvatarSrc,
  [ImageType.DiscoveryCover]: placeholderCoverSrc,
  [ImageType.PlanCover]: defaultPlanCoverSrc,
  [ImageType.Unknown]: defaultPlanCoverSrc,
};

// ─── URL cache ────────────────────────────────────────────────────────────────

/** Memoises resolved public URLs so repeated calls are synchronous after first resolution. */
const urlCache = new Map<string, string>();

/** In-memory version registry for cache-busting after image updates */
const imageVersions = new Map<string, number>();

/**
 * Canonical plan-to-image cache mapping.
 * Maps planId (and storagePath) -> active resolved cover image ("planimagedefault.png" or custom key).
 */
const planImageCache = new Map<string, string>();

/**
 * Get currently cached image name for a plan.
 */
export function getPlanCachedImage(planId?: string): string | undefined {
  if (!planId) return undefined;
  const cleanId = planId.trim().replace(/\.webp$/i, "").replace(/^plan-images\//, "").split("/")[0];
  return planImageCache.get(cleanId) || planImageCache.get(`${cleanId}.webp`);
}

/**
 * Update the plan's cached image mapping.
 */
export function setPlanCachedImage(planId: string, imagePath: string): void {
  const cleanId = planId.trim().replace(/\.webp$/i, "").replace(/^plan-images\//, "").split("/")[0];
  planImageCache.set(cleanId, imagePath);
  planImageCache.set(`${cleanId}.webp`, imagePath);
  planImageCache.set(`plan-images/${cleanId}.webp`, imagePath);
  planImageCache.set(imagePath, imagePath);
  if (imagePath.startsWith("plan-images/")) {
    planImageCache.set(imagePath.slice("plan-images/".length), imagePath);
  }
}

/**
 * Evict old plan image and synchronously update cache/state to planimagedefault.png.
 */
export function evictPlanImage(planId: string): void {
  const cleanId = planId.trim().replace(/\.webp$/i, "").replace(/^plan-images\//, "").split("/")[0];
  const storagePath = `${cleanId}.webp`;

  // 1. Remove all possible old discriminator cache keys in urlCache and populate with default asset
  for (const t of [ImageType.PlanCover, ImageType.DiscoveryCover, ImageType.Avatar, ImageType.Unknown]) {
    urlCache.delete(`${t}:${storagePath}`);
    urlCache.delete(`${t}:${cleanId}`);
    urlCache.delete(`${t}:plan-images/${storagePath}`);
    for (const key of Array.from(urlCache.keys())) {
      if (key.includes(cleanId)) {
        urlCache.delete(key);
      }
    }
    urlCache.set(`${t}:${storagePath}`, defaultPlanCoverSrc);
    urlCache.set(`${t}:${cleanId}`, defaultPlanCoverSrc);
    urlCache.set(`${t}:plan-images/${storagePath}`, defaultPlanCoverSrc);
    urlCache.set(`${t}:planimagedefault.png`, defaultPlanCoverSrc);
  }

  // 2. Clear old imageVersions for this plan
  for (const key of Array.from(imageVersions.keys())) {
    if (key.includes(cleanId)) {
      imageVersions.delete(key);
    }
  }

  // 3. Mark planImageCache as strictly planimagedefault.png
  setPlanCachedImage(cleanId, "planimagedefault.png");

  // 4. Invalidate browser Cache API if available
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      window.caches.keys().then((keys) => {
        keys.forEach((key) => {
          window.caches.open(key).then((cache) => {
            cache.delete(storagePath);
            cache.delete(`plan-images/${storagePath}`);
          });
        });
      });
    } catch {
      // Ignore in non-browser environments
    }
  }

  // 5. Notify all active listeners
  cacheListeners.forEach((listener) => {
    try {
      listener(storagePath, 0);
      listener("planimagedefault.png", 0);
      listener(cleanId, 0);
    } catch {
      // silent
    }
  });
}

type ImageCacheListener = (path: string, version: number) => void;
const cacheListeners = new Set<ImageCacheListener>();

/**
 * Subscribe to image cache updates (called when an image is evicted/updated).
 */
export function subscribeToImageCache(listener: ImageCacheListener): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

/**
 * Get current version number for a storage path.
 */
export function getImageVersion(storagePath?: string): number | undefined {
  if (!storagePath) return undefined;
  const raw = storagePath.trim();
  const fileName = raw.split("/").pop();
  return imageVersions.get(raw) || (fileName ? imageVersions.get(fileName) : undefined);
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a stored image path into a renderable public URL.
 *
 * @param storagePath  The raw value stored in the database column.
 *                     Accepted formats:
 *                       - null / undefined / ""    → returns placeholder
 *                       - "planimagedefault.png"   → returns bundled planimagedefault.png
 *                       - "https://..."            → returned as-is
 *                       - "data:..."               → returned as-is
 *                       - "/assets/..."            → returned as-is
 *                       - "avatars/<key>"          → resolved via avatars bucket
 *                       - "sports/<key>"           → resolved via discovery-images
 *                       - "<key>"                  → resolved via imageType bucket
 * @param imageType    Tells the resolver which bucket to use. Defaults to Unknown
 *                     (auto-detect). Pass an explicit ImageType for best performance.
 * @returns            A URL string safe to pass directly to an <img src=>.
 */
export interface ResolvedImageDetails {
  bucket: string;
  objectKey: string;
  url: string;
}

/**
 * Resolve full details (bucket, objectKey, url) for a stored image path.
 */
export function resolveImageDetails(
  storagePath: string | null | undefined,
  imageType: ImageType = ImageType.Unknown
): ResolvedImageDetails {
  const placeholder = PLACEHOLDER_REGISTRY[imageType];

  // ── 1. Empty / missing / default plan image path → local asset ───────────────────
  if (
    !storagePath ||
    !storagePath.trim() ||
    storagePath.trim() === "default" ||
    storagePath.trim() === "planimagedefault.png" ||
    storagePath.trim().includes("planimagedefault")
  ) {
    return { bucket: "none", objectKey: "planimagedefault.png", url: defaultPlanCoverSrc };
  }

  const raw = storagePath.trim();
  const cleanKey = raw.replace(/\.webp$/i, "").replace(/^plan-images\//, "");

  // Check if planImageCache has mapped this plan or path to planimagedefault.png
  if (
    planImageCache.get(raw) === "planimagedefault.png" ||
    planImageCache.get(cleanKey) === "planimagedefault.png" ||
    planImageCache.get(`${cleanKey}.webp`) === "planimagedefault.png"
  ) {
    return { bucket: "none", objectKey: "planimagedefault.png", url: defaultPlanCoverSrc };
  }

  // ── 2. Already a full URL, blob URL, data URI, or local asset → passthrough ─────────
  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:") ||
    raw.startsWith("/assets/") ||
    raw.startsWith("/")
  ) {
    return { bucket: "none", objectKey: raw, url: raw };
  }

  // ── 3. Determine bucket ───────────────────────────────────────────────────
  let bucket: string;
  let objectKey: string;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(raw) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/plancoverimage\d+\.webp$/i.test(raw) ||
    raw.startsWith("plan-images/")
  ) {
    bucket = "plan-images";
    objectKey = raw.startsWith("plan-images/") ? raw.slice("plan-images/".length) : raw;
  } else if (imageType !== ImageType.Unknown) {
    // Caller knows the type — use the registry directly.
    bucket = BUCKET_REGISTRY[imageType];

    // If the stored path includes the bucket prefix, strip it.
    const bucketPrefix = bucket + "/";
    objectKey = raw.startsWith(bucketPrefix) ? raw.slice(bucketPrefix.length) : raw;
  } else {
    // Auto-detect: walk PREFIX_TO_BUCKET entries
    const matched = Object.entries(PREFIX_TO_BUCKET).find(([prefix]) =>
      raw.startsWith(prefix)
    );

    if (matched) {
      bucket = matched[1];
      objectKey = raw.slice(matched[0].length);
    } else {
      // Last resort: treat as a bare key in the first slash-delimited bucket
      const slashIdx = raw.indexOf("/");
      if (slashIdx !== -1) {
        bucket = raw.slice(0, slashIdx);
        objectKey = raw.slice(slashIdx + 1);
      } else {
        // Single segment with no slash — cannot determine bucket; return placeholder
        return { bucket: "none", objectKey: raw, url: placeholder };
      }
    }
  }

  // ── 4. Rewrite extensions for discovery images to .webp ──────────────────
  if (bucket === "discovery-images" && !objectKey.toLowerCase().endsWith(".webp")) {
    const extIdx = objectKey.lastIndexOf(".");
    if (extIdx !== -1) {
      objectKey = objectKey.slice(0, extIdx) + ".webp";
    } else {
      objectKey = objectKey + ".webp";
    }
  }

  // ── 5. Generate public URL ─────────────────────────────────────────────────
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  let resolved = data.publicUrl || placeholder;

  if (resolved && resolved.startsWith("http")) {
    const version = imageVersions.get(raw) || imageVersions.get(objectKey);
    if (version) {
      resolved = `${resolved}?v=${version}`;
    }
  }

  return { bucket, objectKey, url: resolved };
}

/**
 * Resolve a stored image path into a renderable public URL.
 */
export function resolveImage(
  storagePath: string | null | undefined,
  imageType: ImageType = ImageType.Unknown
): string {
  if (!storagePath || !storagePath.trim()) {
    return PLACEHOLDER_REGISTRY[imageType];
  }

  const raw = storagePath.trim();
  const cleanKey = raw.replace(/\.webp$/i, "").replace(/^plan-images\//, "");

  if (
    raw === "planimagedefault.png" ||
    raw === "default" ||
    raw.includes("planimagedefault") ||
    planImageCache.get(raw) === "planimagedefault.png" ||
    planImageCache.get(cleanKey) === "planimagedefault.png" ||
    planImageCache.get(`${cleanKey}.webp`) === "planimagedefault.png"
  ) {
    return defaultPlanCoverSrc;
  }

  const cacheKey = `${imageType}:${raw}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  const details = resolveImageDetails(raw, imageType);
  urlCache.set(cacheKey, details.url);
  return details.url;
}

/**
 * Clear the internal URL cache.
 * Call after an image is replaced so the new version is picked up immediately.
 *
 * @param storagePath  Specific path to evict, or omit to clear everything.
 * @param imageType    Must match the type used when the entry was cached.
 */
export function evictImageCache(
  storagePath?: string,
  imageType: ImageType = ImageType.Unknown
): void {
  if (!storagePath) {
    urlCache.clear();
    imageVersions.clear();
    planImageCache.clear();
    return;
  }
  const raw = storagePath.trim();
  const fileName = raw.split("/").pop();

  // Clear all possible discriminator cache keys for this path
  for (const t of [ImageType.PlanCover, ImageType.DiscoveryCover, ImageType.Avatar, ImageType.Unknown, imageType]) {
    urlCache.delete(`${t}:${raw}`);
    if (raw.startsWith("plan-images/")) {
      urlCache.delete(`${t}:${raw.slice("plan-images/".length)}`);
    } else {
      urlCache.delete(`${t}:plan-images/${raw}`);
    }
    if (fileName) {
      urlCache.delete(`${t}:${fileName}`);
      urlCache.delete(`${t}:plan-images/${fileName}`);
    }
  }

  const now = Date.now();
  imageVersions.set(raw, now);
  if (raw.startsWith("plan-images/")) {
    imageVersions.set(raw.slice("plan-images/".length), now);
  } else {
    imageVersions.set(`plan-images/${raw}`, now);
  }
  if (fileName) {
    imageVersions.set(fileName, now);
    imageVersions.set(`plan-images/${fileName}`, now);
  }

  // Notify all subscribed UI components immediately so they re-render with new version
  cacheListeners.forEach(listener => {
    try {
      listener(storagePath || "", now);
    } catch {
      // silent
    }
  });
}

/**
 * Return the placeholder URL for a given image type.
 * Useful when a component needs the placeholder before it knows whether
 * a real image exists.
 */
export function getPlaceholder(imageType: ImageType = ImageType.Unknown): string {
  return PLACEHOLDER_REGISTRY[imageType];
}
