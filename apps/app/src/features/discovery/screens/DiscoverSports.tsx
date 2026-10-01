import React, { useState, useMemo } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { useUserLocation } from "../hooks/useUserLocation";
import { usePlacesSearch } from "../hooks/usePlacesSearch";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";
import { SearchBar } from "../../../shared/components/SearchBar";

interface DiscoverSportsProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
}

type SportsCategoryId = "all" | "turfs" | "courts" | "adventure";

interface CategoryDef {
  id: SportsCategoryId;
  label: string;
}

const SPORTS_CATEGORIES: CategoryDef[] = [
  { id: "all", label: "All" },
  { id: "turfs", label: "Turfs & Arenas" },
  { id: "courts", label: "Courts & Clubs" },
  { id: "adventure", label: "Adventure & Fun" },
];

// Premium mock data for sports when local results are limited
const defaultTurfs: DiscoveryItem[] = [
  {
    id: "sports-1",
    public_id: "sports-1",
    section_id: "default-sports",
    title: "Tiki Taka Arena",
    category: "SPORTS",
    subcategory: "Turfs & Arenas",
    description: "Premium rooftop 5-a-side football turf with floodlights.",
    cover_image_url: "sports/football.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 1500,
    suggested_capacity: 10,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sports-2",
    public_id: "sports-2",
    section_id: "default-sports",
    title: "The Gamechanger Turf",
    category: "SPORTS",
    subcategory: "Turfs & Arenas",
    description: "High quality turf for both cricket and football games.",
    cover_image_url: "sports/cricket.jpg",
    location: "Indiranagar, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 1200,
    suggested_capacity: 12,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultCourts: DiscoveryItem[] = [
  {
    id: "sports-3",
    public_id: "sports-3",
    section_id: "default-sports",
    title: "Dinks & Smashes Court",
    category: "SPORTS",
    subcategory: "Courts & Clubs",
    description: "Indoor wooden flooring badminton and pickleball courts.",
    cover_image_url: "sports/badminton.jpg",
    location: "HSR Layout, Bangalore",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 400,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 20,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sports-4",
    public_id: "sports-4",
    section_id: "default-sports",
    title: "Vantage Clay Tennis",
    category: "SPORTS",
    subcategory: "Courts & Clubs",
    description: "Professional clay courts open for recreational tennis matches.",
    cover_image_url: "sports/tennis.jpg",
    location: "Whitefield, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 600,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultAdventure: DiscoveryItem[] = [
  {
    id: "sports-5",
    public_id: "sports-5",
    section_id: "default-sports",
    title: "Play Arena",
    category: "SPORTS",
    subcategory: "Adventure & Fun",
    description: "Go-karting, bowling, laser tag, and climbing walls under one roof.",
    cover_image_url: "sports/karting.jpg",
    location: "Sarjapur Road, Bangalore",
    suggested_duration_minutes: 180,
    suggested_cost_amount: 1000,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 40,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sports-6",
    public_id: "sports-6",
    section_id: "default-sports",
    title: "Torq03 Karting",
    category: "SPORTS",
    subcategory: "Adventure & Fun",
    description: "Premier high-speed go-karting track and arcade zone.",
    cover_image_url: "sports/karting-2.jpg",
    location: "Marathahalli, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 800,
    suggested_capacity: 8,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const isTurfItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("turf") ||
    c.includes("arena") ||
    c.includes("football") ||
    c.includes("futsal") ||
    c.includes("soccer") ||
    c.includes("cricket") ||
    c.includes("ground") ||
    c.includes("pitch")
  );
};

const isCourtItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("court") ||
    c.includes("badminton") ||
    c.includes("shuttle") ||
    c.includes("pickleball") ||
    c.includes("tennis") ||
    c.includes("squash") ||
    c.includes("table tennis") ||
    c.includes("club")
  );
};

const isAdventureItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("adventure") ||
    c.includes("fun") ||
    c.includes("kart") ||
    c.includes("bowling") ||
    c.includes("fitness") ||
    c.includes("gym") ||
    c.includes("swim") ||
    c.includes("laser") ||
    c.includes("boxing") ||
    c.includes("skate")
  );
};

interface SectionItemDef {
  id: string;
  title: string;
  subtitle?: string;
  items: DiscoveryItem[];
}

export const DiscoverSports: React.FC<DiscoverSportsProps> = ({
  sections,
  isAdmin,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
  currentCity,
  currentLocality,
  currentCoordinates,
}) => {
  const { coordinates: hookCoords, cityName, localityName } = useUserLocation();
  const activeCoordinates = currentCoordinates || hookCoords;
  const resolvedCity = currentCity || cityName || "Bengaluru";

  const [selectedCategory, setSelectedCategory] = useState<SportsCategoryId>("all");
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    isSearching,
    isLoading: isSearchLoading,
    searchResults,
    searchCoordinates: activeSearchCoordinates,
    resolvedLocationName,
  } = usePlacesSearch({
    category: "SPORTS",
    searchQuery,
    subCategoryFilter: selectedCategory,
    currentCoordinates: activeCoordinates,
    currentCity: resolvedCity,
  });

  const effectiveOriginCoords = activeSearchCoordinates || activeCoordinates;

  // Extract and deduplicate all sports items across sections
  const allSportsItems = useMemo(() => {
    const raw = sections
      .filter((s) => s.category?.toUpperCase() === "SPORTS")
      .flatMap((s) => s.items || []);

    const seen = new Set<string>();
    const deduped: DiscoveryItem[] = [];
    for (const item of raw) {
      const key = item.place_id || item.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    return deduped;
  }, [sections]);

  // Categorize sports items
  const turfs = useMemo(() => {
    const matched = allSportsItems.filter(isTurfItem);
    return matched.length > 0 ? matched : defaultTurfs;
  }, [allSportsItems]);

  const courts = useMemo(() => {
    const matched = allSportsItems.filter(isCourtItem);
    return matched.length > 0 ? matched : defaultCourts;
  }, [allSportsItems]);

  const adventure = useMemo(() => {
    const matched = allSportsItems.filter(isAdventureItem);
    return matched.length > 0 ? matched : defaultAdventure;
  }, [allSportsItems]);

  const handleCategoryClick = (id: SportsCategoryId) => {
    if (selectedCategory === id) {
      setSelectedCategory("all");
    } else {
      setSelectedCategory(id);
    }
  };

  // Generate sections based on active category with clean title casing and no redundant subtitles
  const visibleSections = useMemo((): SectionItemDef[] => {
    if (selectedCategory === "all") {
      const result: SectionItemDef[] = [];
      if (turfs.length > 0) {
        result.push({
          id: "sec_turfs_all",
          title: "Turfs & Arenas",
          items: turfs.slice(0, 10),
        });
      }
      if (courts.length > 0) {
        result.push({
          id: "sec_courts_all",
          title: "Courts & Clubs",
          items: courts.slice(0, 10),
        });
      }
      if (adventure.length > 0) {
        result.push({
          id: "sec_adventure_all",
          title: "Adventure & Fun",
          items: adventure.slice(0, 10),
        });
      }
      if (turfs.length > 10) {
        result.push({
          id: "sec_more_turfs",
          title: "More Turfs Near You",
          items: turfs.slice(10, 24),
        });
      }
      if (courts.length > 10) {
        result.push({
          id: "sec_more_courts",
          title: "More Courts & Clubs",
          items: courts.slice(10, 24),
        });
      }
      return result;
    }

    if (selectedCategory === "turfs") {
      if (turfs.length > 10) {
        return [
          {
            id: "sec_turfs_1",
            title: "Top Turfs & Arenas",
            items: turfs.slice(0, 10),
          },
          {
            id: "sec_turfs_2",
            title: "More Turfs Near You",
            items: turfs.slice(10, 24),
          },
        ];
      }
      return [
        {
          id: "sec_turfs_all",
          title: "Turfs & Arenas Near You",
          items: turfs,
        },
      ];
    }

    if (selectedCategory === "courts") {
      if (courts.length > 10) {
        return [
          {
            id: "sec_courts_1",
            title: "Top Courts & Clubs",
            items: courts.slice(0, 10),
          },
          {
            id: "sec_courts_2",
            title: "More Courts & Clubs",
            items: courts.slice(10, 24),
          },
        ];
      }
      return [
        {
          id: "sec_courts_all",
          title: "Courts & Clubs Near You",
          items: courts,
        },
      ];
    }

    if (selectedCategory === "adventure") {
      if (adventure.length > 10) {
        return [
          {
            id: "sec_adventure_1",
            title: "Adventure & Fun",
            items: adventure.slice(0, 10),
          },
          {
            id: "sec_adventure_2",
            title: "More Activities & Games",
            items: adventure.slice(10, 24),
          },
        ];
      }
      return [
        {
          id: "sec_adventure_all",
          title: "Adventure & Fun Near You",
          items: adventure,
        },
      ];
    }

    return [];
  }, [selectedCategory, turfs, courts, adventure]);


  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. HEADER BAR ── */}
      <div className="w-full shrink-0 px-5 pt-3.5 pb-2 flex items-center justify-between bg-black border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-white hover:text-zinc-300 active:scale-95 transition cursor-pointer p-1 -ml-1 flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex flex-col text-left">
            <h2 className="text-base font-bold text-white tracking-tight leading-tight">
              Sports
            </h2>
            <span className="text-[11px] text-emerald-400 font-medium mt-0.5 leading-none">
              Find places to play
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. SEARCH BAR ── */}
      <div className="shrink-0 bg-[#000000] px-4 pt-2 pb-1.5 select-none">
        <SearchBar
          id="search-sports-input"
          name="searchSportsInput"
          placeholder="Search sports venues, turfs, courts..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* ── 3. CATEGORY FILTERS (Text Chips) ── */}
      <section className="px-5 pt-2 pb-2 shrink-0 border-b border-white/[0.04]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {SPORTS_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)] border border-emerald-400/40"
                    : "bg-[#121216] text-zinc-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 4. HORIZONTAL SECTIONS FEED / SEARCH RESULTS ── */}
      <div className="space-y-8 pt-4 pb-8 flex-1">
        {isSearching ? (
          isSearchLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs text-zinc-400 font-medium">
                Searching all places...
              </p>
            </div>
          ) : searchResults.length > 0 ? (
            <DiscoverySection
              id="sec_sports_search"
              title={resolvedLocationName ? `Places in ${resolvedLocationName}` : "Search Results"}
              items={searchResults}
              colorAccent="text-emerald-500"
              userCoordinates={effectiveOriginCoords}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.turfs)
                  : undefined
              }
            />
          ) : (
            <div className="px-6 py-16 text-center space-y-2">
              <p className="text-zinc-300 text-sm font-medium">
                No places found
              </p>
              <p className="text-zinc-500 text-xs">
                Try searching for another place.
              </p>
            </div>
          )
        ) : visibleSections.length > 0 ? (
          visibleSections.map((sec) => (
            <DiscoverySection
              key={sec.id}
              id={sec.id}
              title={sec.title}
              subtitle={sec.subtitle}
              items={sec.items}
              colorAccent="text-emerald-500"
              userCoordinates={activeCoordinates}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.turfs)
                  : undefined
              }
            />
          ))
        ) : (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-500 text-sm font-normal">
              No sports places found in this category near {resolvedCity}.
            </p>
          </div>
        )}
      </div>

      {/* ── 5. PLACE PREVIEW SHEET ── */}
      {previewItem && (
        <PlacePreviewSheet
          item={previewItem}
          userCoordinates={effectiveOriginCoords}
          onClose={() => setPreviewItem(null)}
          onConfirmPlan={(item) => {
            setPreviewItem(null);
            onSelectDiscoveryItem(item);
          }}
        />
      )}
    </div>
  );
};
