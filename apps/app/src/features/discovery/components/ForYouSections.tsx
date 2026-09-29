import React, { useState, useEffect, useMemo } from "react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "./DiscoverySection";
import { ADMIN_CONFIGS, ContentConfig } from "../services/discoveryAdminService";
import {
  getCachedMovieSection,
  fetchDiscoverMovies,
  isMovieWithinSixMonths,
} from "../services/tmdbMovieService";
import { MoviePortraitCard } from "../screens/DiscoverMovies";

interface ForYouSectionsProps {
  sections: DiscoverySectionType[];
  searchQuery: string;
  categoryFilter?: "all" | "sports" | "dining" | "activities";
  onSelectItem: (item: DiscoveryItem) => void;
  isAdmin?: boolean;
  onLongPressAdmin?: (item: DiscoveryItem, config: ContentConfig) => void;
  onViewAllCategory?: (category: "sports" | "dining" | "activities") => void;
  onViewAllMovies?: () => void;
  userCoordinates?: { latitude: number; longitude: number } | null;
}

interface SectionDef {
  id: string;
  title: string;
  items: DiscoveryItem[];
  colorAccent?: string;
  adminConfig?: ContentConfig;
}

// ─── Movie Rail Section ───────────────────────────────────────────────────────

interface MovieRailProps {
  title: string;
  movies: DiscoveryItem[];
  isLoading: boolean;
  onSelectItem: (item: DiscoveryItem) => void;
}

const MovieRailSection: React.FC<MovieRailProps> = ({
  title,
  movies,
  isLoading,
  onSelectItem,
}) => {
  if (!isLoading && movies.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="px-6 flex items-end justify-between">
        <div className="space-y-0.5 text-left">
          <h4 className="text-sm font-bold text-white tracking-wide">{title}</h4>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5 scroll-smooth snap-x snap-mandatory">
        {isLoading && movies.length === 0
          ? [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{ width: 130, minWidth: 130 }}
                className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden animate-pulse snap-start"
              >
                <div className="w-full aspect-[2/3] bg-white/[0.04]" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3.5 w-3/4 bg-white/[0.07] rounded" />
                  <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                </div>
              </div>
            ))
          : movies.map((item) => (
              <div
                key={item.id}
                style={{ width: 130, minWidth: 130 }}
                className="shrink-0 snap-start"
              >
                <MoviePortraitCard item={item} onTap={() => onSelectItem(item)} />
              </div>
            ))}
      </div>
    </div>
  );
};

// ─── TMDB movie hook ──────────────────────────────────────────────────────────
const NOW_PLAYING_KEY = "discover_now_playing_lall_p1_gall";
const POPULAR_KEY = "discover_popular_lall_p1_gall";

function useCreateMovieSections() {
  const [nowPlaying, setNowPlaying] = useState<DiscoveryItem[]>(() =>
    getCachedMovieSection(NOW_PLAYING_KEY).filter((m) => isMovieWithinSixMonths(m.release_date))
  );
  const [popular, setPopular] = useState<DiscoveryItem[]>(() =>
    getCachedMovieSection(POPULAR_KEY).filter((m) => isMovieWithinSixMonths(m.release_date))
  );
  const [isLoading, setIsLoading] = useState(
    () =>
      getCachedMovieSection(NOW_PLAYING_KEY).length === 0 &&
      getCachedMovieSection(POPULAR_KEY).length === 0
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [npRes, popRes] = await Promise.all([
          fetchDiscoverMovies("now_playing", 1, undefined, "all"),
          fetchDiscoverMovies("popular", 1, undefined, "all"),
        ]);
        if (!active) return;
        setNowPlaying((npRes.items || []).filter((m) => isMovieWithinSixMonths(m.release_date)));
        setPopular((popRes.items || []).filter((m) => isMovieWithinSixMonths(m.release_date)));
      } catch (err) {
        console.error("[ForYouSections] Failed loading movie sections:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { nowPlaying, popular, isLoading };
}

// ─── Unified feed slot type ───────────────────────────────────────────────────

type FeedSlot =
  | { kind: "venue"; sec: SectionDef }
  | { kind: "movies_now_playing" }
  | { kind: "movies_popular" };

// ─── Main ForYouSections ──────────────────────────────────────────────────────

export const ForYouSections: React.FC<ForYouSectionsProps> = ({
  sections,
  searchQuery,
  categoryFilter = "all",
  onSelectItem,
  isAdmin = false,
  onLongPressAdmin,
  onViewAllCategory,
  onViewAllMovies,
  userCoordinates,
}) => {
  const normalizedQuery = searchQuery.toLowerCase().trim();

  const diningSection = sections.find((s) => s.category?.toUpperCase() === "DINING");
  const sportsSection = sections.find((s) => s.category?.toUpperCase() === "SPORTS");
  const activitiesSection = sections.find((s) => s.category?.toUpperCase() === "ACTIVITIES");

  const rawDiningItems = diningSection?.items || [];
  const rawSportsItems = sportsSection?.items || [];
  const rawActivitiesItems = activitiesSection?.items || [];

  const { nowPlaying, popular, isLoading: moviesLoading } = useCreateMovieSections();

  const filterByQuery = (items: DiscoveryItem[]) => {
    if (!normalizedQuery) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        (item.description && item.description.toLowerCase().includes(normalizedQuery)) ||
        (item.location && item.location.toLowerCase().includes(normalizedQuery)) ||
        (item.place_address && item.place_address.toLowerCase().includes(normalizedQuery)) ||
        (item.subcategory && item.subcategory.toLowerCase().includes(normalizedQuery))
    );
  };

  const diningItems = filterByQuery(rawDiningItems);
  const sportsItems = filterByQuery(rawSportsItems);
  const activitiesItems = filterByQuery(rawActivitiesItems);

  // ── Search mode ──────────────────────────────────────────────────────────────
  if (normalizedQuery) {
    const searchSections: SectionDef[] = [];
    if (diningItems.length > 0 && (categoryFilter === "all" || categoryFilter === "dining")) {
      searchSections.push({
        id: "search_dining",
        title: `Restaurants matching "${searchQuery}"`,
        items: diningItems,
        colorAccent: "text-rose-500",
        adminConfig: ADMIN_CONFIGS.dining,
      });
    }
    if (sportsItems.length > 0 && (categoryFilter === "all" || categoryFilter === "sports")) {
      searchSections.push({
        id: "search_sports",
        title: `Sports matching "${searchQuery}"`,
        items: sportsItems,
        colorAccent: "text-emerald-500",
        adminConfig: ADMIN_CONFIGS.turfs,
      });
    }
    if (activitiesItems.length > 0 && (categoryFilter === "all" || categoryFilter === "activities")) {
      searchSections.push({
        id: "search_activities",
        title: `Activities matching "${searchQuery}"`,
        items: activitiesItems,
        colorAccent: "text-pink-500",
        adminConfig: ADMIN_CONFIGS.activities,
      });
    }

    if (searchSections.length === 0) {
      return (
        <div className="px-6 py-16 text-center space-y-2">
          <p className="text-zinc-500 text-sm font-normal">
            No places found matching &quot;{searchQuery}&quot;.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8 pt-2">
        {searchSections.map((sec) => (
          <DiscoverySection
            key={sec.id}
            id={sec.id}
            title={sec.title}
            items={sec.items}
            colorAccent={sec.colorAccent}
            userCoordinates={userCoordinates}
            isAdmin={isAdmin}
            onSelectItem={onSelectItem}
            onLongPressAdmin={
              onLongPressAdmin && sec.adminConfig
                ? (item) => onLongPressAdmin(item, sec.adminConfig!)
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  // ── Dining/Sports/Activities single-category filter ─────────────────────────
  if (categoryFilter === "dining") {
    const secs: SectionDef[] = [];
    if (diningItems.length > 0) secs.push({ id: "dining_sec_1", title: "Restaurants near you", items: diningItems.slice(0, 12), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 12) secs.push({ id: "dining_sec_2", title: "Dining spots", items: diningItems.slice(12, 25), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 25) secs.push({ id: "dining_sec_3", title: "More restaurants", items: diningItems.slice(25, 38), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 38) secs.push({ id: "dining_sec_4", title: "More places to eat", items: diningItems.slice(38, 50), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin && sec.adminConfig ? (item) => onLongPressAdmin(item, sec.adminConfig!) : undefined} />
        ))}
      </div>
    );
  }

  if (categoryFilter === "sports") {
    const secs: SectionDef[] = [];
    if (sportsItems.length > 0) secs.push({ id: "sports_sec_1", title: "Sports near you", items: sportsItems.slice(0, 12), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 12) secs.push({ id: "sports_sec_2", title: "Turfs & courts near you", items: sportsItems.slice(12, 25), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 25) secs.push({ id: "sports_sec_3", title: "More sports facilities", items: sportsItems.slice(25, 38), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 38) secs.push({ id: "sports_sec_4", title: "More sports venues", items: sportsItems.slice(38, 50), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin && sec.adminConfig ? (item) => onLongPressAdmin(item, sec.adminConfig!) : undefined} />
        ))}
      </div>
    );
  }

  if (categoryFilter === "activities") {
    const secs: SectionDef[] = [];
    if (activitiesItems.length > 0) secs.push({ id: "activities_sec_1", title: "Activities near you", items: activitiesItems.slice(0, 12), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 12) secs.push({ id: "activities_sec_2", title: "More fun activities", items: activitiesItems.slice(12, 25), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 25) secs.push({ id: "activities_sec_3", title: "More recreational spots", items: activitiesItems.slice(25, 38), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 38) secs.push({ id: "activities_sec_4", title: "Explore more activities", items: activitiesItems.slice(38, 50), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (secs.length === 0) return <div className="px-6 py-16 text-center"><p className="text-zinc-500 text-sm">No places found in this category yet.</p></div>;
    return (
      <div className="space-y-8 pt-2">
        {secs.map((sec) => (
          <DiscoverySection key={sec.id} id={sec.id} title={sec.title} items={sec.items} colorAccent={sec.colorAccent} userCoordinates={userCoordinates} isAdmin={isAdmin} onSelectItem={onSelectItem}
            onLongPressAdmin={onLongPressAdmin && sec.adminConfig ? (item) => onLongPressAdmin(item, sec.adminConfig!) : undefined} />
        ))}
      </div>
    );
  }

  // ── "all" — Build the interleaved mixed feed ──────────────────────────────────
  //
  // Strategy: build all available venue sections first, then interleave them with
  // movie slots using a fixed template. The template defines the desired ordering
  // and is evaluated once per render based on available data (useMemo).
  // Movie slots reserve their position immediately (shown as skeleton while loading),
  // so the page layout never jumps when TMDB data arrives.

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const interleavedFeed = useMemo((): FeedSlot[] => {
    // Collect all venue section defs
    const dSecs: SectionDef[] = [];
    if (diningItems.length > 0) dSecs.push({ id: "foryou_dining_1", title: "Restaurants near you", items: diningItems.slice(0, 10), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 10) dSecs.push({ id: "foryou_dining_2", title: "More dining spots", items: diningItems.slice(10, 20), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 20) dSecs.push({ id: "foryou_dining_3", title: "More restaurants", items: diningItems.slice(20, 32), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });
    if (diningItems.length > 32) dSecs.push({ id: "foryou_dining_4", title: "More places to eat", items: diningItems.slice(32, 50), colorAccent: "text-rose-500", adminConfig: ADMIN_CONFIGS.dining });

    const sSecs: SectionDef[] = [];
    if (sportsItems.length > 0) sSecs.push({ id: "foryou_sports_1", title: "Sports near you", items: sportsItems.slice(0, 10), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 10) sSecs.push({ id: "foryou_sports_2", title: "Turfs & courts near you", items: sportsItems.slice(10, 20), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 20) sSecs.push({ id: "foryou_sports_3", title: "More sports facilities", items: sportsItems.slice(20, 32), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });
    if (sportsItems.length > 32) sSecs.push({ id: "foryou_sports_4", title: "More sports venues", items: sportsItems.slice(32, 50), colorAccent: "text-emerald-500", adminConfig: ADMIN_CONFIGS.turfs });

    const aSecs: SectionDef[] = [];
    if (activitiesItems.length > 0) aSecs.push({ id: "foryou_activities_1", title: "Activities near you", items: activitiesItems.slice(0, 10), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 10) aSecs.push({ id: "foryou_activities_2", title: "More fun activities", items: activitiesItems.slice(10, 20), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 20) aSecs.push({ id: "foryou_activities_3", title: "More recreational spots", items: activitiesItems.slice(20, 32), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });
    if (activitiesItems.length > 32) aSecs.push({ id: "foryou_activities_4", title: "Explore more activities", items: activitiesItems.slice(32, 50), colorAccent: "text-pink-500", adminConfig: ADMIN_CONFIGS.activities });

    const showMovies = nowPlaying.length > 0 || popular.length > 0 || moviesLoading;

    // Ordered venue interleaving pool:
    // [dining0, sports0, activities0, dining1, sports1, activities1, ...]
    const venueSecs: SectionDef[] = [];
    const maxLen = Math.max(dSecs.length, sSecs.length, aSecs.length);
    for (let i = 0; i < maxLen; i++) {
      if (dSecs[i]) venueSecs.push(dSecs[i]);
      if (sSecs[i]) venueSecs.push(sSecs[i]);
      if (aSecs[i]) venueSecs.push(aSecs[i]);
    }

    if (!showMovies) {
      // No movies: just return venue sections
      return venueSecs.map((sec) => ({ kind: "venue", sec }));
    }

    // Interleaved template with movies:
    // [dining0] [movies_now_playing] [sports0] [activities0] [movies_popular] [dining1] [sports1] [activities1] ...
    const feed: FeedSlot[] = [];
    const remainingVenues = [...venueSecs];

    // Slot 0: first dining section (Restaurants near you)
    if (remainingVenues.length > 0) feed.push({ kind: "venue", sec: remainingVenues.shift()! });

    // Slot 1: Latest Movies
    feed.push({ kind: "movies_now_playing" });

    // Slot 2: next venue section (Sports near you)
    if (remainingVenues.length > 0) feed.push({ kind: "venue", sec: remainingVenues.shift()! });

    // Slot 3: next venue section (Activities near you, if present)
    if (remainingVenues.length > 0) feed.push({ kind: "venue", sec: remainingVenues.shift()! });

    // Slot 4: Popular Movies
    feed.push({ kind: "movies_popular" });

    // Remaining venue sections
    while (remainingVenues.length > 0) {
      feed.push({ kind: "venue", sec: remainingVenues.shift()! });
    }

    return feed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Stable identity deps: re-evaluate when item counts change (new data), but not on every re-render
    diningItems.length,
    sportsItems.length,
    activitiesItems.length,
    nowPlaying.length,
    popular.length,
    moviesLoading,
  ]);

  const hasContent =
    interleavedFeed.length > 0 ||
    moviesLoading;

  if (!hasContent) {
    return (
      <div className="px-6 py-16 text-center space-y-2">
        <p className="text-zinc-500 text-sm font-normal">
          No places found in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-2">
      {interleavedFeed.map((slot, idx) => {
        if (slot.kind === "venue") {
          const sec = slot.sec;
          return (
            <DiscoverySection
              key={sec.id}
              id={sec.id}
              title={sec.title}
              items={sec.items}
              colorAccent={sec.colorAccent}
              userCoordinates={userCoordinates}
              isAdmin={isAdmin}
              onSelectItem={onSelectItem}
              onLongPressAdmin={
                onLongPressAdmin && sec.adminConfig
                  ? (item) => onLongPressAdmin(item, sec.adminConfig!)
                  : undefined
              }
            />
          );
        }

        if (slot.kind === "movies_now_playing") {
          return (
            <MovieRailSection
              key="movies_now_playing"
              title="Latest Movies"
              movies={nowPlaying.slice(0, 12)}
              isLoading={moviesLoading && nowPlaying.length === 0}
              onSelectItem={onSelectItem}
            />
          );
        }

        if (slot.kind === "movies_popular") {
          if (moviesLoading && popular.length === 0) return null;
          if (!moviesLoading && popular.length === 0) return null;
          return (
            <MovieRailSection
              key="movies_popular"
              title="Popular Movies"
              movies={popular.slice(0, 12)}
              isLoading={moviesLoading && popular.length === 0}
              onSelectItem={onSelectItem}
            />
          );
        }

        return null;
      })}
    </div>
  );
};
