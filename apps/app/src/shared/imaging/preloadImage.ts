// ============================================================================
// SHARED IMAGE PRELOADING & DECODING UTILITY
// Preloads image assets into browser HTTP cache and decodes them into memory/GPU
// textures ahead of time to eliminate loading delays and blank frame flashes.
// ============================================================================

const imagePreloadCache = new Map<string, Promise<boolean>>();

/**
 * Preloads and decodes an image resource. Returns a cached Promise so repeated
 * requests for the same source resolve immediately without redundant operations.
 */
export function preloadImage(src: string): Promise<boolean> {
  if (!src) return Promise.resolve(false);

  if (imagePreloadCache.has(src)) {
    return imagePreloadCache.get(src)!;
  }

  const promise = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(true);
      return;
    }

    const img = new Image();
    img.src = src;

    const onComplete = () => {
      if ("decode" in img) {
        img
          .decode()
          .then(() => resolve(true))
          .catch(() => resolve(true));
      } else {
        resolve(true);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      onComplete();
    } else {
      img.onload = onComplete;
      img.onerror = () => resolve(false);
    }
  });

  imagePreloadCache.set(src, promise);
  return promise;
}

/**
 * Helper to check if an image URL is already in the preload cache.
 */
export function isImagePreloaded(src: string): boolean {
  return imagePreloadCache.has(src);
}
