import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Category-scoped memory store preserving seen item IDs across sub-screen switches
const categorySeenStore = new Map<string, Set<string>>();

/**
 * Returns the Set of seen item IDs for a given category.
 */
export function getCategorySeenSet(category: string): Set<string> {
  let s = categorySeenStore.get(category);
  if (!s) {
    s = new Set<string>();
    categorySeenStore.set(category, s);
  }
  return s;
}

/**
 * Resets the seen items for a specific category (e.g., on manual refresh or location switch).
 */
export function resetCategorySeenSet(category: string): void {
  categorySeenStore.delete(category);
}

/**
 * Clears all category seen caches.
 */
export function clearAllCategorySeenSets(): void {
  categorySeenStore.clear();
}

export interface UseDiscoverySeenTrackerOptions {
  category: "dining" | "sports" | "activities" | "movies" | "all";
  containerRef?: React.RefObject<HTMLElement | null>;
  itemIds?: string[];
  threshold?: number;
}

export interface UseDiscoverySeenTrackerResult {
  seenItemIds: Set<string>;
  hasSeenAllAvailable: boolean;
  seenCount: number;
  markItemSeen: (id: string) => void;
  resetSeen: () => void;
}

/**
 * useDiscoverySeenTracker
 *
 * Tracks individual discovery cards as they enter the user's viewport.
 * - Does not mark items as seen merely because they were fetched.
 * - Enforces an intersection threshold (default 25%) so cards must actually be viewed.
 * - Isolates seen tracking per category to prevent state leaking between feeds.
 * - Preserves category seen state across tab/screen switches.
 */
export function useDiscoverySeenTracker({
  category,
  containerRef,
  itemIds = [],
  threshold = 0.25,
}: UseDiscoverySeenTrackerOptions): UseDiscoverySeenTrackerResult {
  const [seenItemIds, setSeenItemIds] = useState<Set<string>>(() => {
    return new Set(getCategorySeenSet(category));
  });

  const markItemSeen = useCallback(
    (id: string) => {
      if (!id) return;
      const store = getCategorySeenSet(category);
      if (!store.has(id)) {
        store.add(id);
        setSeenItemIds(new Set(store));
      }
    },
    [category]
  );

  const resetSeen = useCallback(() => {
    resetCategorySeenSet(category);
    setSeenItemIds(new Set());
  }, [category]);

  // Viewport intersection observer to track cards becoming visible
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        const store = getCategorySeenSet(category);
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            const itemId = entry.target.getAttribute("data-discovery-item-id");
            if (itemId && !store.has(itemId)) {
              store.add(itemId);
              changed = true;
            }
          }
        });
        if (changed) {
          setSeenItemIds(new Set(store));
        }
      },
      {
        root: container,
        threshold: [threshold],
      }
    );

    const observeItems = () => {
      const items = container.querySelectorAll("[data-discovery-item-id]");
      items.forEach((el) => observer.observe(el));
    };

    observeItems();

    // Observe newly mounted nodes from pagination
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        observeItems();
      });
      mutationObserver.observe(container, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [category, containerRef, threshold, itemIds.length]);

  const hasSeenAllAvailable = useMemo(() => {
    if (itemIds.length === 0) return false;
    const store = getCategorySeenSet(category);
    return itemIds.every((id) => store.has(id));
  }, [category, itemIds, seenItemIds]);

  return {
    seenItemIds,
    hasSeenAllAvailable,
    seenCount: seenItemIds.size,
    markItemSeen,
    resetSeen,
  };
}
