import React, { useState, useMemo } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { useUserLocation } from "../hooks/useUserLocation";
import { usePlacesSearch } from "../hooks/usePlacesSearch";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";
import { SearchBar } from "../../../shared/components/SearchBar";

interface DiscoverActivitiesProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
}

export type ActivityCategoryId =
  | "all"
  | "bowling"
  | "mystery-rooms"
  | "mini-golf"
  | "go-karting"
  | "amusement-parks"
  | "arcades"
  | "adventure-fun";

interface CategoryDef {
  id: ActivityCategoryId;
  label: string;
}

const ACTIVITY_CATEGORIES: CategoryDef[] = [
  { id: "all", label: "All" },
  { id: "bowling", label: "Bowling" },
  { id: "mystery-rooms", label: "Mystery Rooms" },
  { id: "mini-golf", label: "Mini Golf" },
  { id: "go-karting", label: "Go-Karting" },
  { id: "amusement-parks", label: "Amusement Parks" },
  { id: "arcades", label: "Arcades" },
  { id: "adventure-fun", label: "Adventure & Fun" },
];

// Curated fallbacks to guarantee rich content if local area has limited results
const defaultBowling: DiscoveryItem[] = [
  {
    id: "activity-bowl-1",
    public_id: "activity-bowl-1",
    section_id: "default-activities",
    title: "Amoeba Bowling",
    category: "ACTIVITIES",
    subcategory: "Bowling",
    description: "Multi-lane cosmic bowling alley with music, food, and arcade games.",
    cover_image_url: "/assets/Activities.png",
    location: "Church Street, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 350,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "activity-bowl-2",
    public_id: "activity-bowl-2",
    section_id: "default-activities",
    title: "Smaaash Bowling & Arena",
    category: "ACTIVITIES",
    subcategory: "Bowling",
    description: "UV-lit bowling lanes combined with interactive sports simulators.",
    cover_image_url: "/assets/Activities.png",
    location: "1 MG Mall, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 500,
    suggested_capacity: 8,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultMysteryRooms: DiscoveryItem[] = [
  {
    id: "activity-mystery-1",
    public_id: "activity-mystery-1",
    section_id: "default-activities",
    title: "Mystery Rooms",
    category: "ACTIVITIES",
    subcategory: "Mystery Rooms",
    description: "Challenging real-life escape games where teams solve clues to breakout.",
    cover_image_url: "/assets/Activities.png",
    location: "Indiranagar, Bangalore",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 900,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "activity-mystery-2",
    public_id: "activity-mystery-2",
    section_id: "default-activities",
    title: "Breakout Escape Games",
    category: "ACTIVITIES",
    subcategory: "Mystery Rooms",
    description: "Immersive cinematic escape room experiences with varied difficulty levels.",
    cover_image_url: "/assets/Activities.png",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 850,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultGoKarting: DiscoveryItem[] = [
  {
    id: "activity-kart-1",
    public_id: "activity-kart-1",
    section_id: "default-activities",
    title: "Torq03 Go-Karting",
    category: "ACTIVITIES",
    subcategory: "Go-Karting",
    description: "Asphalt karting track with fast karts, timing systems, and trackside cafe.",
    cover_image_url: "/assets/Activities.png",
    location: "Marathahalli, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 750,
    suggested_capacity: 8,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "activity-kart-2",
    public_id: "activity-kart-2",
    section_id: "default-activities",
    title: "Meco Kartopia",
    category: "ACTIVITIES",
    subcategory: "Go-Karting",
    description: "International standard outdoor karting circuit suitable for groups.",
    cover_image_url: "/assets/Activities.png",
    location: "Hennur, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 900,
    suggested_capacity: 10,
    default_rsvp_offset_minutes: 45,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultAmusement: DiscoveryItem[] = [
  {
    id: "activity-amuse-1",
    public_id: "activity-amuse-1",
    section_id: "default-activities",
    title: "Wonderla Amusement Park",
    category: "ACTIVITIES",
    subcategory: "Amusement Parks",
    description: "Exciting roller coasters, water slides, and thrilling rides for groups.",
    cover_image_url: "/assets/Activities.png",
    location: "Mysore Road, Bangalore",
    suggested_duration_minutes: 300,
    suggested_cost_amount: 1400,
    suggested_capacity: 12,
    default_rsvp_offset_minutes: 60,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "activity-amuse-2",
    public_id: "activity-amuse-2",
    section_id: "default-activities",
    title: "Snow City",
    category: "ACTIVITIES",
    subcategory: "Amusement Parks",
    description: "Indoor sub-zero snow theme park with sliding, rafting, and snow castles.",
    cover_image_url: "/assets/Activities.png",
    location: "Jayachamarajendra, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 650,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultArcades: DiscoveryItem[] = [
  {
    id: "activity-arcade-1",
    public_id: "activity-arcade-1",
    section_id: "default-activities",
    title: "Timezone Gaming Zone",
    category: "ACTIVITIES",
    subcategory: "Arcades",
    description: "Modern arcade with VR experiences, claw games, laser tag, and prizes.",
    cover_image_url: "/assets/Activities.png",
    location: "Phoenix Marketcity, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 500,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultAdventure: DiscoveryItem[] = [
  {
    id: "activity-adv-1",
    public_id: "activity-adv-1",
    section_id: "default-activities",
    title: "Play Arena",
    category: "ACTIVITIES",
    subcategory: "Adventure & Fun",
    description: "Comprehensive recreation park with bowling, laser tag, go-karting, and climbing.",
    cover_image_url: "/assets/Activities.png",
    location: "Sarjapur Road, Bangalore",
    suggested_duration_minutes: 180,
    suggested_cost_amount: 1000,
    suggested_capacity: 8,
    default_rsvp_offset_minutes: 40,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "activity-adv-2",
    public_id: "activity-adv-2",
    section_id: "default-activities",
    title: "Bounce Trampoline Park",
    category: "ACTIVITIES",
    subcategory: "Adventure & Fun",
    description: "Freestyle terrain with interconnected trampolines, dodgeball, and slam dunk zones.",
    cover_image_url: "/assets/Activities.png",
    location: "Orion Mall, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 800,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const isBowlingItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return c.includes("bowl") || c.includes("bowling");
};

const isMysteryRoomItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("escape") ||
    c.includes("mystery") ||
    c.includes("breakout") ||
    c.includes("puzzle room") ||
    c.includes("lock")
  );
};

const isMiniGolfItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return c.includes("mini golf") || c.includes("putt") || (c.includes("golf") && !c.includes("clubhouse"));
};

const isGoKartItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return c.includes("kart") || c.includes("karting") || c.includes("go-kart");
};

const isAmusementItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("amusement") ||
    c.includes("theme park") ||
    c.includes("water park") ||
    c.includes("wonderla") ||
    c.includes("snow city") ||
    c.includes("waterpark")
  );
};

const isArcadeItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("arcade") ||
    c.includes("gaming") ||
    c.includes("game zone") ||
    c.includes("smaash") ||
    c.includes("timezone") ||
    c.includes("vr") ||
    c.includes("virtual reality")
  );
};

const isAdventureItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("adventure") ||
    c.includes("trampoline") ||
    c.includes("bounce") ||
    c.includes("laser") ||
    c.includes("paintball") ||
    c.includes("skat") ||
    c.includes("climb") ||
    c.includes("play arena") ||
    c.includes("zipline")
  );
};

interface SectionItemDef {
  id: string;
  title: string;
  subtitle?: string;
  items: DiscoveryItem[];
}

export const DiscoverActivities: React.FC<DiscoverActivitiesProps> = ({
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

  const [selectedCategory, setSelectedCategory] = useState<ActivityCategoryId>("all");
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    searchResults,
    isSearching,
    isSearchLoading,
    resolvedLocationName,
    activeSearchCoordinates,
  } = usePlacesSearch({
    category: "ACTIVITIES",
    searchQuery,
    subCategoryFilter: selectedCategory,
    currentCoordinates: activeCoordinates,
    currentCity: resolvedCity,
  });

  const effectiveOriginCoords = activeSearchCoordinates || activeCoordinates;

  // Extract and deduplicate all activity items across sections
  const allActivityItems = useMemo(() => {
    const raw = sections
      .filter((s) => s.category?.toUpperCase() === "ACTIVITIES")
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

  // Categorize activity items with guaranteed fallbacks
  const bowling = useMemo(() => {
    const matched = allActivityItems.filter(isBowlingItem);
    return matched.length > 0 ? matched : defaultBowling;
  }, [allActivityItems]);

  const mysteryRooms = useMemo(() => {
    const matched = allActivityItems.filter(isMysteryRoomItem);
    return matched.length > 0 ? matched : defaultMysteryRooms;
  }, [allActivityItems]);

  const miniGolf = useMemo(() => {
    const matched = allActivityItems.filter(isMiniGolfItem);
    return matched.length > 0 ? matched : defaultAdventure;
  }, [allActivityItems]);

  const goKarting = useMemo(() => {
    const matched = allActivityItems.filter(isGoKartItem);
    return matched.length > 0 ? matched : defaultGoKarting;
  }, [allActivityItems]);

  const amusementParks = useMemo(() => {
    const matched = allActivityItems.filter(isAmusementItem);
    return matched.length > 0 ? matched : defaultAmusement;
  }, [allActivityItems]);

  const arcades = useMemo(() => {
    const matched = allActivityItems.filter(isArcadeItem);
    return matched.length > 0 ? matched : defaultArcades;
  }, [allActivityItems]);

  const adventure = useMemo(() => {
    const matched = allActivityItems.filter(isAdventureItem);
    return matched.length > 0 ? matched : defaultAdventure;
  }, [allActivityItems]);

  const handleCategoryClick = (id: ActivityCategoryId) => {
    if (selectedCategory === id) {
      setSelectedCategory("all");
    } else {
      setSelectedCategory(id);
    }
  };

  // Generate sections based on active category with clean Title Casing
  const visibleSections = useMemo((): SectionItemDef[] => {
    if (selectedCategory === "all") {
      const result: SectionItemDef[] = [];
      if (mysteryRooms.length > 0) {
        result.push({
          id: "sec_mystery_all",
          title: "Mystery & Escape Rooms",
          items: mysteryRooms.slice(0, 10),
        });
      }
      if (bowling.length > 0) {
        result.push({
          id: "sec_bowling_all",
          title: "Bowling Alleys",
          items: bowling.slice(0, 10),
        });
      }
      if (goKarting.length > 0) {
        result.push({
          id: "sec_gokart_all",
          title: "Go-Karting Tracks",
          items: goKarting.slice(0, 10),
        });
      }
      if (amusementParks.length > 0) {
        result.push({
          id: "sec_amusement_all",
          title: "Amusement & Theme Parks",
          items: amusementParks.slice(0, 10),
        });
      }
      if (arcades.length > 0) {
        result.push({
          id: "sec_arcades_all",
          title: "Arcades & Gaming Zones",
          items: arcades.slice(0, 10),
        });
      }
      if (adventure.length > 0) {
        result.push({
          id: "sec_adventure_all",
          title: "Adventure & Fun",
          items: adventure.slice(0, 10),
        });
      }
      if (allActivityItems.length > 10) {
        result.push({
          id: "sec_more_activities",
          title: "More Activities Near You",
          items: allActivityItems.slice(10, 24),
        });
      }
      return result;
    }

    if (selectedCategory === "bowling") {
      if (bowling.length > 10) {
        return [
          { id: "sec_bowling_1", title: "Top Bowling Alleys", items: bowling.slice(0, 10) },
          { id: "sec_bowling_2", title: "More Bowling Places", items: bowling.slice(10, 24) },
        ];
      }
      return [{ id: "sec_bowling_all", title: "Bowling Alleys Near You", items: bowling }];
    }

    if (selectedCategory === "mystery-rooms") {
      if (mysteryRooms.length > 10) {
        return [
          { id: "sec_mystery_1", title: "Top Escape Rooms", items: mysteryRooms.slice(0, 10) },
          { id: "sec_mystery_2", title: "More Mystery Games", items: mysteryRooms.slice(10, 24) },
        ];
      }
      return [{ id: "sec_mystery_all", title: "Mystery & Escape Rooms Near You", items: mysteryRooms }];
    }

    if (selectedCategory === "mini-golf") {
      return [{ id: "sec_minigolf_all", title: "Mini Golf Near You", items: miniGolf }];
    }

    if (selectedCategory === "go-karting") {
      if (goKarting.length > 10) {
        return [
          { id: "sec_gokart_1", title: "Top Karting Circuits", items: goKarting.slice(0, 10) },
          { id: "sec_gokart_2", title: "More Go-Karting Places", items: goKarting.slice(10, 24) },
        ];
      }
      return [{ id: "sec_gokart_all", title: "Go-Karting Tracks Near You", items: goKarting }];
    }

    if (selectedCategory === "amusement-parks") {
      return [{ id: "sec_amusement_all", title: "Amusement & Theme Parks Near You", items: amusementParks }];
    }

    if (selectedCategory === "arcades") {
      if (arcades.length > 10) {
        return [
          { id: "sec_arcades_1", title: "Top Gaming Zones", items: arcades.slice(0, 10) },
          { id: "sec_arcades_2", title: "More Arcades & Games", items: arcades.slice(10, 24) },
        ];
      }
      return [{ id: "sec_arcades_all", title: "Arcades & Gaming Zones Near You", items: arcades }];
    }

    if (selectedCategory === "adventure-fun") {
      if (adventure.length > 10) {
        return [
          { id: "sec_adventure_1", title: "Top Adventure Experiences", items: adventure.slice(0, 10) },
          { id: "sec_adventure_2", title: "More Fun Activities", items: adventure.slice(10, 24) },
        ];
      }
      return [{ id: "sec_adventure_all", title: "Adventure & Fun Near You", items: adventure }];
    }

    return [];
  }, [selectedCategory, mysteryRooms, bowling, goKarting, amusementParks, arcades, adventure, miniGolf, allActivityItems]);


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
              Activities
            </h2>
            <span className="text-[11px] text-pink-400 font-medium mt-0.5 leading-none">
              Discover fun things to do
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. SEARCH BAR ── */}
      <div className="shrink-0 bg-[#000000] px-4 pt-2 pb-1.5 select-none">
        <SearchBar
          id="search-activities-input"
          name="searchActivitiesInput"
          placeholder="Search activities, places..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* ── 3. CATEGORY FILTERS (Text Chips with Pink Accent) ── */}
      <section className="px-5 pt-2 pb-2 shrink-0 border-b border-white/[0.04]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {ACTIVITY_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-pink-500 text-white shadow-[0_0_12px_rgba(236,72,153,0.35)] border border-pink-400/40"
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
              <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
              <p className="text-xs text-zinc-400 font-medium">
                Searching places for &quot;{searchQuery.trim()}&quot;...
              </p>
            </div>
          ) : searchResults.length > 0 ? (
            <DiscoverySection
              id="sec_activities_search"
              title={resolvedLocationName ? `Places in ${resolvedLocationName}` : "Search Results"}
              items={searchResults}
              colorAccent="text-pink-500"
              userCoordinates={effectiveOriginCoords}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.activities)
                  : undefined
              }
            />
          ) : (
            <div className="px-6 py-16 text-center space-y-2">
              <p className="text-zinc-400 text-sm font-medium">
                No activities found for &quot;{searchQuery}&quot;.
              </p>
              <p className="text-zinc-500 text-xs">
                Try searching for a different area, landmark, or activity category.
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
              colorAccent="text-pink-500"
              userCoordinates={activeCoordinates}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.activities)
                  : undefined
              }
            />
          ))
        ) : (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-500 text-sm font-normal">
              No activities found in this category near {resolvedCity}.
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

