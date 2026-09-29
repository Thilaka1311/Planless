import React, { useState, useMemo } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoverySection } from "../components/DiscoverySection";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { useUserLocation } from "../hooks/useUserLocation";
import { usePlacesSearch } from "../hooks/usePlacesSearch";
import { ADMIN_CONFIGS } from "../services/discoveryAdminService";
import { SearchBar } from "../../../shared/components/SearchBar";

interface DiscoverDiningProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin?: (item: DiscoveryItem, config: any) => void;
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
}

type DiningCategoryId =
  | "all"
  | "cafes"
  | "restaurants"
  | "fine-dining"
  | "fast-food"
  | "pubs-breweries";

interface CategoryDef {
  id: DiningCategoryId;
  label: string;
}

const DINING_CATEGORIES: CategoryDef[] = [
  { id: "all", label: "All" },
  { id: "cafes", label: "Cafes" },
  { id: "restaurants", label: "Restaurants" },
  { id: "fine-dining", label: "Fine Dining" },
  { id: "fast-food", label: "Fast Food" },
  { id: "pubs-breweries", label: "Pubs & Breweries" },
];

// Curated fallbacks to guarantee rich content if local area has limited results
const defaultCafes: DiscoveryItem[] = [
  {
    id: "cafe-1",
    public_id: "cafe-1",
    section_id: "default-dining",
    title: "Glen's Bakehouse",
    category: "DINING",
    subcategory: "Cafe",
    description: "Famous for red velvet cupcakes and cozy outdoor seating.",
    cover_image_url: "dining/glens.jpg",
    location: "Indiranagar, Bangalore",
    suggested_duration_minutes: 60,
    suggested_cost_amount: 500,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cafe-2",
    public_id: "cafe-2",
    section_id: "default-dining",
    title: "Third Wave Coffee",
    category: "DINING",
    subcategory: "Cafe",
    description: "Artisanal coffee and a great workspace vibe.",
    cover_image_url: "dining/thirdwave.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 90,
    suggested_cost_amount: 400,
    suggested_capacity: 2,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cafe-3",
    public_id: "cafe-3",
    section_id: "default-dining",
    title: "The Hole in the Wall Cafe",
    category: "DINING",
    subcategory: "Cafe",
    description: "All-day English breakfast in a quirky, rustic space.",
    cover_image_url: "dining/holeinwall.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 75,
    suggested_cost_amount: 600,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 3,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultFineDines: DiscoveryItem[] = [
  {
    id: "fine-1",
    public_id: "fine-1",
    section_id: "default-dining",
    title: "The Karavalli",
    category: "DINING",
    subcategory: "Fine Dining",
    description: "Authentic coastal food set in a heritage backyard setting.",
    cover_image_url: "dining/karavalli.jpg",
    location: "Residency Road, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 2500,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 45,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "fine-2",
    public_id: "fine-2",
    section_id: "default-dining",
    title: "Toscano",
    category: "DINING",
    subcategory: "Fine Dining",
    description: "Fine Italian dining with an extensive wine selection.",
    cover_image_url: "dining/toscano.jpg",
    location: "UB City, Bangalore",
    suggested_duration_minutes: 100,
    suggested_cost_amount: 1800,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultPubs: DiscoveryItem[] = [
  {
    id: "pub-1",
    public_id: "pub-1",
    section_id: "default-dining",
    title: "Toit Beer Co.",
    category: "DINING",
    subcategory: "Pubs & Breweries",
    description: "Iconic microbrewery known for its craft beers and wood-fired pizzas.",
    cover_image_url: "dining/toit.jpg",
    location: "Indiranagar, Bangalore",
    suggested_duration_minutes: 150,
    suggested_cost_amount: 1500,
    suggested_capacity: 8,
    default_rsvp_offset_minutes: 45,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "pub-2",
    public_id: "pub-2",
    section_id: "default-dining",
    title: "Arbor Brewing Company",
    category: "DINING",
    subcategory: "Pubs & Breweries",
    description: "American style pub with an industrial-chic setting and great IPAs.",
    cover_image_url: "dining/arbor.jpg",
    location: "Allied Grand Plaza, Bangalore",
    suggested_duration_minutes: 120,
    suggested_cost_amount: 1200,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "pub-3",
    public_id: "pub-3",
    section_id: "default-dining",
    title: "Windmills Craftworks",
    category: "DINING",
    subcategory: "Pubs & Breweries",
    description: "A jazz theater, microbrewery, and library combined.",
    cover_image_url: "dining/windmills.jpg",
    location: "Whitefield, Bangalore",
    suggested_duration_minutes: 180,
    suggested_cost_amount: 2000,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 45,
    display_order: 3,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const defaultFastFood: DiscoveryItem[] = [
  {
    id: "fastfood-1",
    public_id: "fastfood-1",
    section_id: "default-dining",
    title: "Truffles",
    category: "DINING",
    subcategory: "Fast Food",
    description: "Famous burgers, steaks, and decadent shakes.",
    cover_image_url: "dining/truffles.jpg",
    location: "Koramangala, Bangalore",
    suggested_duration_minutes: 45,
    suggested_cost_amount: 600,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "fastfood-2",
    public_id: "fastfood-2",
    section_id: "default-dining",
    title: "Leon's Burgers & Wings",
    category: "DINING",
    subcategory: "Fast Food",
    description: "Gourmet fried chicken, peri-peri wings, and loaded fries.",
    cover_image_url: "dining/leons.jpg",
    location: "Indiranagar, Bangalore",
    suggested_duration_minutes: 30,
    suggested_cost_amount: 450,
    suggested_capacity: 2,
    default_rsvp_offset_minutes: 20,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const isCafeItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("cafe") ||
    c.includes("coffee") ||
    c.includes("tea") ||
    c.includes("chai") ||
    c.includes("bake") ||
    c.includes("bakery") ||
    c.includes("dessert") ||
    c.includes("waffle") ||
    c.includes("roaster")
  );
};

const isFastFoodItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("burger") ||
    c.includes("pizza") ||
    c.includes("chicken") ||
    c.includes("fast food") ||
    c.includes("roll") ||
    c.includes("shawarma") ||
    c.includes("momo") ||
    c.includes("fries") ||
    c.includes("takeaway") ||
    c.includes("bites") ||
    c.includes("sandwich") ||
    c.includes("snack")
  );
};

const isPubItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("pub") ||
    c.includes("bar") ||
    c.includes("brewery") ||
    c.includes("taproom") ||
    c.includes("lounge") ||
    c.includes("beer") ||
    c.includes("drink") ||
    c.includes("cocktail") ||
    c.includes("club")
  );
};

const isFineDiningItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("fine") ||
    c.includes("pavilion") ||
    c.includes("grand") ||
    c.includes("palace") ||
    c.includes("marriott") ||
    c.includes("taj") ||
    c.includes("sheraton") ||
    c.includes("karavalli") ||
    c.includes("leela") ||
    c.includes("itc") ||
    c.includes("oberoi") ||
    (typeof it.suggested_cost_amount === "number" && it.suggested_cost_amount >= 2000)
  );
};

const isRestaurantItem = (it: DiscoveryItem): boolean => {
  const t = (it.title || "").toLowerCase();
  const s = (it.subcategory || "").toLowerCase();
  const d = (it.description || "").toLowerCase();
  const c = `${t} ${s} ${d}`;
  return (
    c.includes("restaurant") ||
    c.includes("dining") ||
    c.includes("kitchen") ||
    c.includes("diner") ||
    c.includes("bhojanalaya") ||
    c.includes("mess") ||
    c.includes("punjab") ||
    c.includes("south indian") ||
    c.includes("north indian") ||
    c.includes("biryani") ||
    c.includes("dhaba") ||
    c.includes("bhavan") ||
    c.includes("sagar") ||
    c.includes("darshini") ||
    (!c.includes("pub") && !c.includes("bar") && !c.includes("brewery") && !c.includes("cafe"))
  );
};

interface SectionItemDef {
  id: string;
  title: string;
  subtitle?: string;
  items: DiscoveryItem[];
}

export const DiscoverDining: React.FC<DiscoverDiningProps> = ({
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

  const [selectedCategory, setSelectedCategory] = useState<DiningCategoryId>("all");
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    isSearching,
    isLoading: isSearchLoading,
    searchResults,
    searchCoordinates: activeSearchCoordinates,
    resolvedLocationName,
  } = usePlacesSearch({
    category: "DINING",
    searchQuery,
    subCategoryFilter: selectedCategory,
    currentCoordinates: activeCoordinates,
    currentCity: resolvedCity,
  });

  const effectiveOriginCoords = activeSearchCoordinates || activeCoordinates;

  // Extract and deduplicate all dining items across sections
  const allDiningItems = useMemo(() => {
    const raw = sections
      .filter((s) => s.category?.toUpperCase() === "DINING")
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

  // Categorize items
  const cafes = useMemo(() => {
    const matched = allDiningItems.filter(isCafeItem);
    return matched.length > 0 ? matched : defaultCafes;
  }, [allDiningItems]);

  const restaurants = useMemo(() => {
    const matched = allDiningItems.filter(isRestaurantItem);
    return matched.length > 0 ? matched : allDiningItems;
  }, [allDiningItems]);

  const fineDines = useMemo(() => {
    const matched = allDiningItems.filter(isFineDiningItem);
    return matched.length > 0 ? matched : defaultFineDines;
  }, [allDiningItems]);

  const fastFoods = useMemo(() => {
    const matched = allDiningItems.filter(isFastFoodItem);
    return matched.length > 0 ? matched : defaultFastFood;
  }, [allDiningItems]);

  const pubs = useMemo(() => {
    const matched = allDiningItems.filter(isPubItem);
    return matched.length > 0 ? matched : defaultPubs;
  }, [allDiningItems]);

  const handleCategoryClick = (id: DiningCategoryId) => {
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
      if (restaurants.length > 0) {
        result.push({
          id: "sec_restaurants_all",
          title: "Restaurants",
          items: restaurants.slice(0, 10),
        });
      }
      if (cafes.length > 0) {
        result.push({
          id: "sec_cafes_all",
          title: "Cafes",
          items: cafes.slice(0, 10),
        });
      }
      if (fineDines.length > 0) {
        result.push({
          id: "sec_fine_dining_all",
          title: "Fine Dining",
          items: fineDines.slice(0, 10),
        });
      }
      if (fastFoods.length > 0) {
        result.push({
          id: "sec_fast_food_all",
          title: "Fast Food",
          items: fastFoods.slice(0, 10),
        });
      }
      if (pubs.length > 0) {
        result.push({
          id: "sec_pubs_all",
          title: "Pubs & Breweries",
          items: pubs.slice(0, 10),
        });
      }
      if (restaurants.length > 10) {
        result.push({
          id: "sec_more_restaurants",
          title: "More Dining Spots",
          items: restaurants.slice(10, 24),
        });
      }
      return result;
    }

    if (selectedCategory === "cafes") {
      if (cafes.length > 10) {
        return [
          {
            id: "sec_cafes_1",
            title: "Top Cafes",
            items: cafes.slice(0, 10),
          },
          {
            id: "sec_cafes_2",
            title: "More Cafes & Bakes",
            items: cafes.slice(10, 24),
          },
        ];
      }
      return [
        {
          id: "sec_cafes_all",
          title: "Cafes Near You",
          items: cafes,
        },
      ];
    }

    if (selectedCategory === "restaurants") {
      if (restaurants.length > 10) {
        return [
          {
            id: "sec_restaurants_1",
            title: "Restaurants Near You",
            items: restaurants.slice(0, 10),
          },
          {
            id: "sec_restaurants_2",
            title: "Popular Dining Spots",
            items: restaurants.slice(10, 22),
          },
          {
            id: "sec_restaurants_3",
            title: "More Eateries",
            items: restaurants.slice(22, 36),
          },
        ];
      }
      return [
        {
          id: "sec_restaurants_all",
          title: "Restaurants Near You",
          items: restaurants,
        },
      ];
    }

    if (selectedCategory === "fine-dining") {
      if (fineDines.length > 10) {
        return [
          {
            id: "sec_finedine_1",
            title: "Fine Dining Experiences",
            items: fineDines.slice(0, 10),
          },
          {
            id: "sec_finedine_2",
            title: "More Luxury Dining",
            items: fineDines.slice(10, 20),
          },
        ];
      }
      return [
        {
          id: "sec_finedine_all",
          title: "Fine Dining Near You",
          items: fineDines,
        },
      ];
    }

    if (selectedCategory === "fast-food") {
      if (fastFoods.length > 10) {
        return [
          {
            id: "sec_fastfood_1",
            title: "Fast Food & Quick Bites",
            items: fastFoods.slice(0, 10),
          },
          {
            id: "sec_fastfood_2",
            title: "More Quick Bites",
            items: fastFoods.slice(10, 20),
          },
        ];
      }
      return [
        {
          id: "sec_fastfood_all",
          title: "Fast Food Near You",
          items: fastFoods,
        },
      ];
    }

    if (selectedCategory === "pubs-breweries") {
      if (pubs.length > 10) {
        return [
          {
            id: "sec_pubs_1",
            title: "Pubs & Breweries",
            items: pubs.slice(0, 10),
          },
          {
            id: "sec_pubs_2",
            title: "Bars & Lounges",
            items: pubs.slice(10, 20),
          },
        ];
      }
      return [
        {
          id: "sec_pubs_all",
          title: "Pubs & Breweries Near You",
          items: pubs,
        },
      ];
    }

    return [];
  }, [selectedCategory, restaurants, cafes, fineDines, fastFoods, pubs]);


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
              Dining
            </h2>
            <span className="text-[11px] text-red-500 font-medium mt-0.5 leading-none">
              Discover places to eat
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. SEARCH BAR ── */}
      <div className="shrink-0 bg-[#000000] px-4 pt-2 pb-1.5 select-none">
        <SearchBar
          id="search-dining-input"
          name="searchDiningInput"
          placeholder="Search restaurants, cafes, places..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* ── 3. CATEGORY FILTERS (Text Chips) ── */}
      <section className="px-5 pt-2 pb-2 shrink-0 border-b border-white/[0.04]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {DINING_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.35)] border border-red-400/40"
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
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <p className="text-xs text-zinc-400 font-medium">
                Searching places for &quot;{searchQuery.trim()}&quot;...
              </p>
            </div>
          ) : searchResults.length > 0 ? (
            <DiscoverySection
              id="sec_dining_search"
              title={resolvedLocationName ? `Places in ${resolvedLocationName}` : "Search Results"}
              items={searchResults}
              colorAccent="text-rose-500"
              userCoordinates={effectiveOriginCoords}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.dining)
                  : undefined
              }
            />
          ) : (
            <div className="px-6 py-16 text-center space-y-2">
              <p className="text-zinc-400 text-sm font-medium">
                No dining places found for &quot;{searchQuery}&quot;.
              </p>
              <p className="text-zinc-500 text-xs">
                Try searching for a different area, landmark, or dining category.
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
              colorAccent="text-rose-500"
              userCoordinates={activeCoordinates}
              isAdmin={isAdmin}
              onSelectItem={(item) => setPreviewItem(item)}
              onLongPressAdmin={
                onLongPressAdmin
                  ? (item) => onLongPressAdmin(item, ADMIN_CONFIGS.dining)
                  : undefined
              }
            />
          ))
        ) : (
          <div className="px-6 py-16 text-center space-y-2">
            <p className="text-zinc-500 text-sm font-normal">
              No dining places found in this category near {resolvedCity}.
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
