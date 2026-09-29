import React, { useState, useEffect } from "react";
import { Search, MapPin, Sparkles, ChevronRight, ChevronDown, Zap } from "lucide-react";
import { getSectionsByCategory, getCachedSections, clearCachedSections } from "../services/discoveryService";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { ADMIN_CONFIGS, ContentConfig } from "../services/discoveryAdminService";
import { useLongPress } from "../../../shared/hooks/useLongPress";
import { AdminContextSheet, AdminDrawer } from "./AdminDiscovery";
import { EditCard } from "../components/EditCard";
import { DiscoveryCard, RestaurantCard, SportsCard, MovieCard } from "../components/DiscoveryCard";
import { DiscoverySection } from "../components/DiscoverySection";
import { ForYouSections } from "../components/ForYouSections";
import { PlacePreviewSheet } from "../components/PlacePreviewSheet";
import { DiscoverSports } from "./DiscoverSports";
import { DiscoverMovies } from "./DiscoverMovies";
import { DiscoverDining } from "./DiscoverDining";
import { DiscoverActivities } from "./DiscoverActivities";
import { LocationSetter, DiscoveryLocation } from "./LocationSetter";
import { useUserLocation } from "../hooks/useUserLocation";
import diningCategoryIcon from "../../../assets/categories/dining.png";
import moviesCategoryIcon from "../../../assets/categories/movies.png";
import sportsCategoryIcon from "../../../assets/categories/sports.png";
import activitiesCategoryIcon from "../../../assets/Activities.png";
import { QuickPlansScreen } from "../../create/screens/QuickPlansScreen";
import { QuickPlan } from "../../../core/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscoverySubScreen = "sports" | "movies" | "dining" | "activities" | "quick-plans" | null;

interface DiscoveryProps {
  userProfile: any;
  setActiveTab: (tab: any) => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onSelectCustomPlan: () => void;
  initialSubScreen?: DiscoverySubScreen;
  onSubScreenChange?: (subScreen: DiscoverySubScreen) => void;
  onSelectCategory?: (category: "sports" | "movies" | "dining" | "activities" | "custom") => void;
  onSelectQuickPlan?: (plan: QuickPlan) => void;
  onAddQuickPlan?: (listId?: string) => void;
}

const PLANLESS_CATEGORIES = [
  {
    id: "dining" as const,
    title: "Dining",
    image: diningCategoryIcon,
    glow: "hover:border-rose-500/30 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)]",
  },
  {
    id: "movies" as const,
    title: "Movies",
    image: moviesCategoryIcon,
    glow: "hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]",
  },
  {
    id: "sports" as const,
    title: "Sports",
    image: sportsCategoryIcon,
    glow: "hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]",
  },
  {
    id: "activities" as const,
    title: "Activities",
    image: activitiesCategoryIcon,
    glow: "hover:border-pink-500/30 hover:shadow-[0_0_20px_rgba(236,72,153,0.15)]",
  },
];

// ─── Main Discovery Screen ────────────────────────────────────────────────────

export const BrowseExperiencesStep: React.FC<DiscoveryProps> = ({
  userProfile: propUserProfile,
  setActiveTab,
  onSelectDiscoveryItem,
  onSelectCustomPlan,
  initialSubScreen = null,
  onSubScreenChange,
  onSelectCategory,
  onSelectQuickPlan,
  onAddQuickPlan,
}) => {
  const { isAdmin, userProfile: storeUserProfile, activeUserUuid, activeUserId, dbUsers } = useProfileStore();
  const userProfile = propUserProfile || storeUserProfile;
  const resolvedUserId = activeUserUuid || userProfile?.dbUuid || userProfile?.user_id || activeUserId || "";
  const adminToken = userProfile?.token || storeUserProfile?.token;
  const currentUser = React.useMemo(() => {
    return dbUsers?.find((u) => u.id === activeUserUuid || u.user_id === activeUserId);
  }, [dbUsers, activeUserUuid, activeUserId]);
  const profilePhotoSrc = userProfile?.avatar || (userProfile as any)?.profile_photo || currentUser?.profile_photo || null;
  const {
    discoveryLocation,
    coordinates: activeCoordinates,
    cityName: displayCity,
    localityName: displayLocality,
    setDiscoveryLocation,
  } = useUserLocation();
  const [showLocationSetter, setShowLocationSetter] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<"all" | "sports" | "movies" | "dining" | "activities">("all");
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);
  const [sections, setSections] = useState<DiscoverySectionType[]>(() => {
    return getCachedSections(activeCoordinates) || [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    return !getCachedSections(activeCoordinates);
  });
  const [discoveryVersion, setDiscoveryVersion] = useState(0);
  const [activeSubScreen, setActiveSubScreen] = useState<DiscoverySubScreen>(initialSubScreen || null);

  const handleSubScreenChange = (screen: DiscoverySubScreen) => {
    setActiveSubScreen(screen);
    onSubScreenChange?.(screen);
  };

  const handleCategoryClick = (category: "sports" | "movies" | "dining" | "activities" | "custom") => {
    if (category === "custom") {
      onSelectCustomPlan();
      return;
    }
    if (onSelectCategory) {
      onSelectCategory(category);
    } else {
      handleSubScreenChange(category);
    }
  };

  const handleLocationSelect = (loc: DiscoveryLocation) => {
    setDiscoveryLocation(loc);
    clearCachedSections();
    setDiscoveryVersion((v) => v + 1);
    setShowLocationSetter(false);
  };

  const longPressSports = useLongPress(() => {
    if (isAdmin) {
      const sec = sections.find((s) => s.category?.toUpperCase() === "SPORTS");
      const baseConfig = { ...ADMIN_CONFIGS.turfs };
      if (sec) baseConfig.section_id = sec.id;
      setAddConfig(baseConfig);
    }
  }, { threshold: 500 });

  const longPressMovies = useLongPress(() => {
    if (isAdmin) {
      const sec = sections.find((s) => s.category?.toUpperCase() === "MOVIES");
      const baseConfig = { ...ADMIN_CONFIGS.movies };
      if (sec) baseConfig.section_id = sec.id;
      setAddConfig(baseConfig);
    }
  }, { threshold: 500 });

  const longPressDining = useLongPress(() => {
    if (isAdmin) {
      const sec = sections.find((s) => s.category?.toUpperCase() === "DINING");
      const baseConfig = { ...ADMIN_CONFIGS.dining };
      if (sec) baseConfig.section_id = sec.id;
      setAddConfig(baseConfig);
    }
  }, { threshold: 500 });

  const longPressActivities = useLongPress(() => {
    if (isAdmin) {
      const sec = sections.find((s) => s.category?.toUpperCase() === "ACTIVITIES");
      const baseConfig = { ...ADMIN_CONFIGS.activities };
      if (sec) baseConfig.section_id = sec.id;
      setAddConfig(baseConfig);
    }
  }, { threshold: 500 });

  const longPressCustom = useLongPress(() => {
    if (isAdmin) {
      const sec = sections.find((s) => s.category?.toUpperCase() === "CUSTOM");
      const baseConfig: ContentConfig = {
        type: "custom",
        title: "Custom Card",
        category: "CUSTOM",
        section_id: sec ? sec.id : "",
        fields: [
          { name: "title", label: "Card Title", type: "text", required: true, placeholder: "e.g. Board Game Night" },
          { name: "description", label: "Description", type: "textarea", placeholder: "e.g. Fun games and drinks" },
          { name: "location", label: "Location", type: "text", required: true, placeholder: "e.g. Community Clubhouse" },
          { name: "cover_image_url", label: "Cover Image", type: "image", defaultValue: "" },
          { name: "display_order", label: "Display Order", type: "number", defaultValue: 1 },
        ],
      };
      setAddConfig(baseConfig);
    }
  }, { threshold: 500 });

  // Admin overlay state
  type ContextTarget = { item: any; config: ContentConfig } | null;
  const [contextTarget, setContextTarget] = useState<ContextTarget>(null);
  const [editTarget, setEditTarget] = useState<ContextTarget>(null);
  const [addConfig, setAddConfig] = useState<ContentConfig | null>(null);

  const refresh = () => setDiscoveryVersion((v) => v + 1);

  // Load discovery sections
  useEffect(() => {
    let active = true;
    const forceRefresh = discoveryVersion > 0;
    if (forceRefresh) {
      setIsLoading(true);
    }
    getSectionsByCategory("all", forceRefresh, activeCoordinates)
      .then((data) => {
        if (active) {
          setSections(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error loading discovery sections:", err);
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [discoveryVersion, activeCoordinates.latitude, activeCoordinates.longitude]);

  // Resolve CMS config for a section
  const getAdminConfig = (section: DiscoverySectionType): ContentConfig | null => {
    const cat = section.category?.toUpperCase();
    if (cat === "SPORTS") return ADMIN_CONFIGS.turfs;
    if (cat === "MOVIES") return ADMIN_CONFIGS.movies;
    if (cat === "DINING") return ADMIN_CONFIGS.dining;
    if (cat === "ACTIVITIES") return ADMIN_CONFIGS.activities;
    return null;
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── 1. COMPACT LOCATION HEADER AT THE VERY TOP (INTERACTIVE) ── */}
      <section className="px-5 pt-3.5 pb-2 shrink-0 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowLocationSetter(true)}
          className="flex items-center gap-2 text-left group active:opacity-75 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#FF6B2C] shrink-0 group-hover:bg-[#FF6B2C]/10 group-hover:border-[#FF6B2C]/20 transition">
            <MapPin className="w-4 h-4 text-[#FF6B2C]" />
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1 leading-tight">
              <span className="text-sm font-bold text-white tracking-tight truncate max-w-[200px]">
                {displayCity}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition shrink-0" />
            </div>
            <span className="text-[11px] text-zinc-400 font-normal leading-tight truncate max-w-[200px]">
              {displayLocality}
            </span>
          </div>
        </button>

        {/* ── Top Right: Quick Plans Icon Button ── */}
        <button
          type="button"
          onClick={() => handleSubScreenChange("quick-plans")}
          className="w-8 h-8 rounded-full bg-[#FF6B2C]/10 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] active:scale-95 hover:bg-[#FF6B2C]/20 transition cursor-pointer shrink-0 shadow-sm"
          aria-label="Quick Plans"
        >
          <Zap className="w-4 h-4 fill-[#FF6B2C]" />
        </button>
      </section>

      {/* ── 2. THE FOUR PLANLESS CATEGORIES (DINING, MOVIES, SPORTS, ACTIVITIES) ── */}
      <section className="px-5 pt-1.5 pb-3.5 shrink-0">
        <div className="grid grid-cols-4 gap-2">
          {PLANLESS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id)}
              {...(cat.id === "sports" ? (isAdmin ? longPressSports : {}) :
                 cat.id === "movies" ? (isAdmin ? longPressMovies : {}) :
                 cat.id === "activities" ? (isAdmin ? longPressActivities : {}) :
                 (isAdmin ? longPressDining : {}))}
              className={`relative h-[86px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 hover:bg-[#18181f] active:scale-[0.97] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-1.5 group shadow-sm ${cat.glow}`}
            >
              {/* Category Illustration (occupying ~55-60% of card height) */}
              <div className="w-11 h-11 flex items-center justify-center shrink-0">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-200 select-none pointer-events-none"
                />
              </div>

              {/* Category Name Underneath */}
              <span className="text-[12px] font-semibold text-white/90 group-hover:text-white tracking-tight leading-tight mt-1 font-sans truncate max-w-full">
                {cat.title}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 3. DYNAMIC MULTI-SECTION DISCOVERY FEED ── */}
      {isLoading ? (
        <div className="space-y-7 pt-2">
          {["Restaurants near you", "Sports near you", "More dining spots"].map((catTitle) => (
            <div key={catTitle} className="space-y-3">
              <div className="px-6 flex items-center justify-between">
                <div className="h-4 w-32 bg-white/[0.06] rounded-md animate-pulse" />
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: "220px",
                      minWidth: "220px",
                      maxWidth: "220px",
                      height: "225px",
                      minHeight: "225px",
                    }}
                    className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden flex flex-col animate-pulse"
                  >
                    <div className="w-full h-[130px] bg-white/[0.04]" />
                    <div className="p-3 flex flex-col justify-between flex-1 space-y-2">
                      <div className="h-4 w-3/4 bg-white/[0.07] rounded" />
                      <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                      <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ForYouSections
          sections={sections}
          searchQuery={searchQuery}
          categoryFilter={selectedCategoryFilter === "movies" ? "all" : selectedCategoryFilter}
          onSelectItem={(item) => setPreviewItem(item)}
          isAdmin={isAdmin}
          userCoordinates={activeCoordinates}
          onLongPressAdmin={(item, config) => setContextTarget({ item, config })}
          onViewAllCategory={(cat) => handleSubScreenChange(cat)}
          onViewAllMovies={() => handleSubScreenChange("movies")}
        />
      )}

      {/* ── PLACE PREVIEW SHEET ── */}
      {previewItem && (
        <PlacePreviewSheet
          item={previewItem}
          userCoordinates={activeCoordinates}
          onClose={() => setPreviewItem(null)}
          onConfirmPlan={(item) => {
            setPreviewItem(null);
            onSelectDiscoveryItem(item);
          }}
        />
      )}

      {/* ── ADMIN: CONTEXT ACTION SHEET ── */}
      {isAdmin && contextTarget && (
        <AdminContextSheet
          item={contextTarget.item}
          config={contextTarget.config}
          token={adminToken}
          onClose={() => setContextTarget(null)}
          onEdit={(item) => {
            setEditTarget({ item, config: contextTarget.config });
            setContextTarget(null);
          }}
          onAdd={() => {
            setAddConfig(contextTarget.config);
            setContextTarget(null);
          }}
          onDeleted={() => {
            setContextTarget(null);
            refresh();
          }}
        />
      )}

      {/* ── ADMIN: EDIT CARD SCREEN ── */}
      {isAdmin && editTarget && (
        <EditCard
          item={editTarget.item}
          config={editTarget.config}
          token={adminToken}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      )}

      {/* ── ADMIN: ADD CARD DRAWER ── */}
      {isAdmin && addConfig && (
        <AdminDrawer
          config={addConfig}
          token={adminToken}
          onClose={() => setAddConfig(null)}
          onMutated={() => {
            setAddConfig(null);
            refresh();
          }}
        />
      )}

      {/* ── SUB-SCREEN OVERLAYS ── */}
      {activeSubScreen === "sports" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverSports
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => handleSubScreenChange(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
          />
        </div>
      )}

      {activeSubScreen === "movies" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverMovies
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => handleSubScreenChange(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
          />
        </div>
      )}

      {activeSubScreen === "dining" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverDining
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => handleSubScreenChange(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
          />
        </div>
      )}

      {activeSubScreen === "activities" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverActivities
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => handleSubScreenChange(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
          />
        </div>
      )}

      {/* ── DEDICATED QUICK PLANS SCREEN ── */}
      {activeSubScreen === "quick-plans" && (
        <div className="fixed inset-0 z-40 bg-black">
          <QuickPlansScreen
            userId={resolvedUserId}
            onBack={() => handleSubScreenChange(null)}
            onSelectQuickPlan={(plan) => {
              handleSubScreenChange(null);
              onSelectQuickPlan?.(plan);
            }}
            onAddQuickPlan={(listId) => {
              handleSubScreenChange(null);
              onAddQuickPlan?.(listId);
            }}
          />
        </div>
      )}

      {/* ── LOCATION SETTER OVERLAY ── */}
      {showLocationSetter && (
        <div className="fixed inset-0 z-50 bg-black">
          <LocationSetter
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
            onBack={() => setShowLocationSetter(false)}
            onSelectLocation={handleLocationSelect}
          />
        </div>
      )}

    </div>
  );
};
