import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { Search, MapPin, Sparkles, ChevronRight, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { getSectionsByCategory, getCachedSections, clearCachedSections } from "../services/discoveryService";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { ADMIN_CONFIGS, ContentConfig } from "../services/discoveryAdminService";
import { ForYouSections } from "../components/ForYouSections";
import { subscribePlaceOverrides } from "../services/placeOverridesService";
import { BackToTopButton } from "../components/BackToTopButton";
import type { DiscoveryLocation } from "./LocationSetter";
import { useUserLocation } from "../hooks/useUserLocation";
import moviesCategoryIcon from "../../../assets/categories/movies.png";
import activitiesCategoryIcon from "../../../assets/categories/activity.png";
import diningCategoryIcon from "../../../assets/categories/dining.png";
import sportsCategoryIcon from "../../../assets/categories/sports.png";
import { preloadImage } from "../../../shared/imaging/preloadImage";
import { QuickPlan } from "../../../core/types";
import {
  navigateToRoute,
  navigateBack,
  parseCurrentRoute,
  listenToNavigation,
  useDismissibleOverlay,
} from "../../navigation/appRouter";
import { lazyWithRetry } from "../../../shared/utils/lazyWithRetry";

// Code-split heavy sub-screens and modals for minimal initial bundle
const DiscoverSports = lazyWithRetry(
  () => import("./DiscoverSports").then((m) => ({ default: m.DiscoverSports })),
  "DiscoverSports"
);
const DiscoverMovies = lazyWithRetry(
  () => import("./DiscoverMovies").then((m) => ({ default: m.DiscoverMovies })),
  "DiscoverMovies"
);
const DiscoverDining = lazyWithRetry(
  () => import("./DiscoverDining").then((m) => ({ default: m.DiscoverDining })),
  "DiscoverDining"
);
const DiscoverActivities = lazyWithRetry(
  () => import("./DiscoverActivities").then((m) => ({ default: m.DiscoverActivities })),
  "DiscoverActivities"
);
const QuickPlansScreen = lazyWithRetry(
  () => import("../../create/screens/QuickPlansScreen").then((m) => ({ default: m.QuickPlansScreen })),
  "QuickPlansScreen"
);
import { MasterSearchScreen } from "./MasterSearchScreen";
const LocationSetter = lazyWithRetry(
  () => import("./LocationSetter").then((m) => ({ default: m.LocationSetter })),
  "LocationSetter"
);
const PlacePreviewSheet = lazyWithRetry(
  () => import("../components/PlacePreviewSheet").then((m) => ({ default: m.PlacePreviewSheet })),
  "PlacePreviewSheet"
);
const AdminPlaceEditSheet = lazyWithRetry(
  () => import("../components/AdminPlaceEditSheet").then((m) => ({ default: m.AdminPlaceEditSheet })),
  "AdminPlaceEditSheet"
);
const AdminContextSheet = lazyWithRetry(
  () => import("./AdminDiscovery").then((m) => ({ default: m.AdminContextSheet })),
  "AdminContextSheet"
);
const EditCard = lazyWithRetry(
  () => import("../components/EditCard").then((m) => ({ default: m.EditCard })),
  "EditCard"
);

import { DiscoverySkeleton, DiscoverySectionsSkeleton } from "../components/DiscoverySkeleton";

const LazyOverlayFallback = (
  <div className="fixed inset-0 z-50 bg-black overflow-y-auto no-scrollbar pointer-events-none">
    <DiscoverySkeleton />
  </div>
);

// Eagerly pre-warm static category icons so they are instantly in memory/GPU cache
if (typeof window !== "undefined") {
  [diningCategoryIcon, moviesCategoryIcon, sportsCategoryIcon, activitiesCategoryIcon].forEach((src) => {
    if (src) preloadImage(src);
  });
}

// Module-level scroll position to preserve scroll when returning to Discovery
let savedDiscoveryScrollTop = 0;

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscoverySubScreen = "sports" | "movies" | "dining" | "activities" | "quick-plans" | "master-search" | null;

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
  onSelectQuickPlanDiscoveryItem?: (item: DiscoveryItem, targetListId?: string | null) => void;
}

const PLANLESS_CATEGORIES = [
  {
    id: "dining" as const,
    title: "Dining",
    image: diningCategoryIcon,
    glow: "hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]",
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
  onSelectQuickPlanDiscoveryItem,
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
  useDismissibleOverlay(showLocationSetter, () => setShowLocationSetter(false), 'location-setter');

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<"all" | "sports" | "movies" | "dining" | "activities">("all");
  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);

  const [sections, setSections] = useState<DiscoverySectionType[]>(() => {
    const cached = getCachedSections({
      latitude: activeCoordinates.latitude,
      longitude: activeCoordinates.longitude,
      city: displayCity,
      cityBounds: discoveryLocation?.cityBounds,
    }, displayCity);
    return cached && cached.length > 0 ? cached : [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    const cached = getCachedSections({
      latitude: activeCoordinates.latitude,
      longitude: activeCoordinates.longitude,
      city: displayCity,
      cityBounds: discoveryLocation?.cityBounds,
    }, displayCity);
    return !cached || cached.length === 0;
  });
  const [discoveryVersion, setDiscoveryVersion] = useState(0);
  const [activeSubScreen, setActiveSubScreen] = useState<DiscoverySubScreen>(() => {
    if (initialSubScreen) return initialSubScreen;
    const current = parseCurrentRoute();
    if (
      current.tab === "sports" ||
      current.tab === "dining" ||
      current.tab === "movies" ||
      current.tab === "activities"
    ) {
      return current.tab;
    }
    if (
      current.tab === "create" &&
      (current.subScreen === "master-search" || current.subScreen === "quick-plans")
    ) {
      return current.subScreen;
    }
    return null;
  });

  // Keep activeSubScreen in sync if initialSubScreen changes from parent
  useEffect(() => {
    if (initialSubScreen !== undefined && initialSubScreen !== activeSubScreen) {
      setActiveSubScreen(initialSubScreen);
    }
  }, [initialSubScreen]);

  // Synchronize activeSubScreen with browser navigation (Back / Forward / popstate)
  useEffect(() => {
    const removeListener = listenToNavigation((route) => {
      if (
        route.tab === "sports" ||
        route.tab === "dining" ||
        route.tab === "movies" ||
        route.tab === "activities"
      ) {
        setActiveSubScreen(route.tab);
      } else if (route.tab === "create") {
        if (route.subScreen === "master-search" || route.subScreen === "quick-plans") {
          setActiveSubScreen(route.subScreen);
        } else {
          setActiveSubScreen(null);
        }
      } else if (
        route.tab === "home" ||
        route.tab === "plans" ||
        route.tab === "chats" ||
        route.tab === "profile"
      ) {
        setActiveSubScreen(null);
      }
    });
    return removeListener;
  }, []);

  const handleSubScreenChange = (screen: DiscoverySubScreen) => {
    setActiveSubScreen(screen);
    onSubScreenChange?.(screen);
    if (screen === "sports" || screen === "dining" || screen === "movies" || screen === "activities") {
      setActiveTab?.(screen);
      navigateToRoute({ tab: screen });
    } else if (screen === "master-search" || screen === "quick-plans") {
      navigateToRoute({ tab: "create", subScreen: screen });
    } else if (screen === null) {
      const current = parseCurrentRoute();
      if (
        current.subScreen ||
        current.tab === "sports" ||
        current.tab === "dining" ||
        current.tab === "movies" ||
        current.tab === "activities"
      ) {
        setActiveTab?.("create");
        navigateBack({ tab: "create" });
      }
    }
  };

  const handleCategoryClick = (category: "sports" | "movies" | "dining" | "activities" | "custom") => {
    if (category === "custom") {
      onSelectCustomPlan();
      return;
    }
    if (onSelectCategory) {
      onSelectCategory(category);
    }
    handleSubScreenChange(category);
  };

  const handleLocationSelect = (loc: DiscoveryLocation) => {
    setDiscoveryLocation(loc);
    clearCachedSections();
    savedDiscoveryScrollTop = 0;
    setDiscoveryVersion((v) => v + 1);
    setShowLocationSetter(false);
  };

  // Admin overlay state
  type ContextTarget = { item: any; config: ContentConfig } | null;
  const [contextTarget, setContextTarget] = useState<ContextTarget>(null);
  const [editTarget, setEditTarget] = useState<ContextTarget>(null);
  const [adminEditPlace, setAdminEditPlace] = useState<DiscoveryItem | null>(null);

  const refresh = () => setDiscoveryVersion((v) => v + 1);

  // Subscribe to real-time place exclusions / overrides
  useEffect(() => {
    const unsubscribe = subscribePlaceOverrides(({ action, placeId }) => {
      if (action === "hide") {
        setSections((prev) =>
          prev.map((sec) => ({
            ...sec,
            items: sec.items.filter((i) => {
              const pId = i.place_id || (typeof i.id === "string" ? i.id.replace(/^place_/, "") : i.id);
              return pId !== placeId;
            }),
          }))
        );
      }
    });
    return unsubscribe;
  }, []);

  // Load discovery sections with lazy non-blocking background refresh when cache exists
  useEffect(() => {
    let active = true;
    const forceRefresh = discoveryVersion > 0;
    // Show skeleton ONLY on first-ever visit when zero sections exist, or on explicit forceRefresh
    if (sections.length === 0 || forceRefresh) {
      setIsLoading(true);
    }
    const locationParams = {
      latitude: activeCoordinates.latitude,
      longitude: activeCoordinates.longitude,
      city: displayCity,
      cityBounds: discoveryLocation?.cityBounds,
    };
    getSectionsByCategory("all", forceRefresh, locationParams)
      .then((data) => {
        if (active) {
          if (data && data.length > 0) {
            setSections(data);
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error loading discovery sections:", err);
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [discoveryVersion, activeCoordinates.latitude, activeCoordinates.longitude, displayCity]);

  // Resolve CMS config for a section
  const getAdminConfig = (section: DiscoverySectionType): ContentConfig | null => {
    const cat = section.category?.toUpperCase();
    if (cat === "SPORTS") return ADMIN_CONFIGS.turfs;
    if (cat === "MOVIES") return ADMIN_CONFIGS.movies;
    if (cat === "DINING") return ADMIN_CONFIGS.dining;
    if (cat === "ACTIVITIES") return ADMIN_CONFIGS.activities;
    return null;
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  const isNavVisibleRef = useRef<boolean>(true);

  // Scroll listener to toggle bottom nav visibility
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    savedDiscoveryScrollTop = currentScrollTop;
    const delta = currentScrollTop - lastScrollTopRef.current;

    // Always show nav if at or near top
    if (currentScrollTop <= 30) {
      if (!isNavVisibleRef.current) {
        isNavVisibleRef.current = true;
        window.dispatchEvent(new CustomEvent("planless_bottom_nav_visibility", { detail: { visible: true } }));
      }
    } else if (Math.abs(delta) > 10) {
      // Threshold check to avoid jitter
      if (delta > 0 && isNavVisibleRef.current) {
        // Scrolling down -> hide nav
        isNavVisibleRef.current = false;
        window.dispatchEvent(new CustomEvent("planless_bottom_nav_visibility", { detail: { visible: false } }));
      } else if (delta < 0 && !isNavVisibleRef.current) {
        // Scrolling up -> show nav
        isNavVisibleRef.current = true;
        window.dispatchEvent(new CustomEvent("planless_bottom_nav_visibility", { detail: { visible: true } }));
      }
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  // Restore saved scroll position when returning to Discovery
  useEffect(() => {
    if (scrollContainerRef.current && savedDiscoveryScrollTop > 0) {
      scrollContainerRef.current.scrollTop = savedDiscoveryScrollTop;
    }
  }, []);

  // Ensure bottom navigation is restored when unmounting
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("planless_bottom_nav_visibility", { detail: { visible: true } }));
    };
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-[calc(4.5rem+env(safe-area-inset-bottom,0px)+1rem)] text-left select-none relative"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── STICKY TOP HEADER (Location, Search, Quick Plans) ── */}
      <header className="sticky top-0 z-30 bg-[#000000] shrink-0 border-b border-white/[0.04]">
        {/* ── 1. COMPACT LOCATION HEADER AT THE VERY TOP (INTERACTIVE) ── */}
        <section className="px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-2.5 shrink-0 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowLocationSetter(true)}
            className="flex items-center gap-2 text-left group active:opacity-75 transition cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition shrink-0" />
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1 leading-tight">
                <span className="text-sm font-bold text-white tracking-tight truncate max-w-[200px]">
                  {displayLocality || displayCity}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition shrink-0" />
              </div>
              <span className="text-[11px] text-zinc-400 font-normal leading-tight truncate max-w-[200px]">
                {displayCity}
              </span>
            </div>
          </button>

          {/* ── Top Right: Master Search Icon + Quick Plans Icon ── */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubScreenChange("master-search")}
              className="text-white hover:text-white/80 active:scale-95 transition cursor-pointer p-1 shrink-0"
              aria-label="Search"
            >
              <Search className="w-5.5 h-5.5 text-white" />
            </button>

            <button
              type="button"
              onClick={() => handleSubScreenChange("quick-plans")}
              className="text-white hover:text-white/80 active:scale-95 transition cursor-pointer p-1 shrink-0"
              aria-label="Quick Plans"
            >
              <Zap className="w-5.5 h-5.5 text-white" />
            </button>
          </div>
        </section>
      </header>

      {/* ── 2. THE FOUR PLANLESS CATEGORIES (DINING, MOVIES, SPORTS, ACTIVITIES) ── */}
      <section className="px-5 pt-3 pb-3 shrink-0">
        <div className="grid grid-cols-4 gap-2">
          {PLANLESS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-label={cat.title}
              onClick={() => handleCategoryClick(cat.id)}
              className={`relative h-[86px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 hover:bg-[#18181f] active:scale-[0.97] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-1.5 group shadow-sm ${cat.glow}`}
            >
              {/* Category Icon / Illustration (occupying ~55-60% of card height) */}
              <div className="w-11 h-11 flex items-center justify-center shrink-0">
                <img
                  src={cat.image}
                  alt=""
                  aria-hidden="true"
                  width={44}
                  height={44}
                  loading="eager"
                  decoding="async"
                  style={{ aspectRatio: "1 / 1" }}
                  className="h-full w-auto max-w-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-200 select-none pointer-events-none"
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

      {/* ── FLOATING BACK-TO-TOP BUTTON ── */}
      <BackToTopButton scrollContainerRef={scrollContainerRef} />

      {/* ── 3. DYNAMIC MULTI-SECTION DISCOVERY FEED ── */}
      {isLoading ? (
        <DiscoverySectionsSkeleton />
      ) : (
        <ForYouSections
          sections={sections}
          searchQuery={searchQuery}
          categoryFilter={selectedCategoryFilter === "movies" ? "all" : selectedCategoryFilter}
          onSelectItem={(item) => setPreviewItem(item)}
          isAdmin={isAdmin}
          onLongPressAdmin={isAdmin ? (item) => setAdminEditPlace(item) : undefined}
          userCoordinates={activeCoordinates}
          currentCity={displayCity}
          onViewAllCategory={(cat) => handleSubScreenChange(cat)}
          onViewAllMovies={() => handleSubScreenChange("movies")}
        />
      )}

      {/* ── ADMIN: PLACE EDIT SHEET ── */}
      {isAdmin && adminEditPlace && (
        <Suspense fallback={null}>
          <AdminPlaceEditSheet
            item={adminEditPlace}
            userCoordinates={activeCoordinates}
            onClose={() => setAdminEditPlace(null)}
            onSaved={() => {
              setAdminEditPlace(null);
              refresh();
            }}
            onHidden={(hiddenPlaceId) => {
              setAdminEditPlace(null);
              setSections((prev) =>
                prev.map((sec) => ({
                  ...sec,
                  items: sec.items.filter((i) => {
                    const pId = i.place_id || (typeof i.id === "string" ? i.id.replace(/^place_/, "") : i.id);
                    return pId !== hiddenPlaceId;
                  }),
                }))
              );
              refresh();
            }}
          />
        </Suspense>
      )}

      {/* ── PLACE PREVIEW SHEET ── */}
      {previewItem && (
        <Suspense fallback={null}>
          <PlacePreviewSheet
            item={previewItem}
            userCoordinates={activeCoordinates}
            onClose={() => setPreviewItem(null)}
            onConfirmPlan={(item) => {
              setPreviewItem(null);
              onSelectDiscoveryItem(item);
            }}
          />
        </Suspense>
      )}

      {/* ── ADMIN: CONTEXT ACTION SHEET ── */}
      {isAdmin && contextTarget && (
        <Suspense fallback={null}>
          <AdminContextSheet
            item={contextTarget.item}
            config={contextTarget.config}
            token={adminToken}
            onClose={() => setContextTarget(null)}
            onEdit={(item) => {
              setEditTarget({ item, config: contextTarget.config });
              setContextTarget(null);
            }}
            onDeleted={() => {
              setContextTarget(null);
              refresh();
            }}
          />
        </Suspense>
      )}

      {/* ── ADMIN: EDIT CARD SCREEN ── */}
      {isAdmin && editTarget && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* ── SUB-SCREEN OVERLAYS ── */}
      {activeSubScreen === "sports" && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-40 bg-black">
            <DiscoverSports
              sections={sections}
              isAdmin={isAdmin}
              onBack={() => handleSubScreenChange(null)}
              onSelectDiscoveryItem={onSelectDiscoveryItem}
              onLongPressAdmin={(item) => {
                if (isAdmin) setAdminEditPlace(item);
              }}
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
            />
          </div>
        </Suspense>
      )}

      {activeSubScreen === "movies" && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-40 bg-black">
            <DiscoverMovies
              sections={sections}
              isAdmin={isAdmin}
              onBack={() => handleSubScreenChange(null)}
              onSelectDiscoveryItem={onSelectDiscoveryItem}
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
            />
          </div>
        </Suspense>
      )}

      {activeSubScreen === "dining" && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-40 bg-black">
            <DiscoverDining
              sections={sections}
              isAdmin={isAdmin}
              onBack={() => handleSubScreenChange(null)}
              onSelectDiscoveryItem={onSelectDiscoveryItem}
              onLongPressAdmin={(item) => {
                if (isAdmin) setAdminEditPlace(item);
              }}
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
            />
          </div>
        </Suspense>
      )}

      {activeSubScreen === "activities" && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-40 bg-black">
            <DiscoverActivities
              sections={sections}
              isAdmin={isAdmin}
              onBack={() => handleSubScreenChange(null)}
              onSelectDiscoveryItem={onSelectDiscoveryItem}
              onLongPressAdmin={(item) => {
                if (isAdmin) setAdminEditPlace(item);
              }}
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
            />
          </div>
        </Suspense>
      )}

      {/* ── DEDICATED QUICK PLANS SCREEN ── */}
      {activeSubScreen === "quick-plans" && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-50 bg-black">
            <QuickPlansScreen
              userId={resolvedUserId}
              onBack={() => handleSubScreenChange(null)}
              onSelectQuickPlan={(plan) => {
                handleSubScreenChange(null);
                onSelectQuickPlan?.(plan);
              }}
              onSelectDiscoveryItem={(item, targetListId) => {
                handleSubScreenChange(null);
                if (onSelectQuickPlanDiscoveryItem) {
                  onSelectQuickPlanDiscoveryItem(item, targetListId);
                } else {
                  onSelectDiscoveryItem(item);
                }
              }}
              sections={sections}
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
              isAdmin={isAdmin}
            />
          </div>
        </Suspense>
      )}

      {/* ── DEDICATED MASTER SEARCH SCREEN ── */}
      {activeSubScreen === "master-search" && (
        <div className="fixed inset-0 z-50 bg-black">
          <MasterSearchScreen
            onBack={() => handleSubScreenChange(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            currentCity={displayCity}
            currentLocality={displayLocality}
            currentCoordinates={activeCoordinates}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {showLocationSetter && (
        <Suspense fallback={LazyOverlayFallback}>
          <div className="fixed inset-0 z-50 bg-black">
            <LocationSetter
              currentCity={displayCity}
              currentLocality={displayLocality}
              currentCoordinates={activeCoordinates}
              onBack={() => setShowLocationSetter(false)}
              onSelectLocation={handleLocationSelect}
            />
          </div>
        </Suspense>
      )}

    </div>
  );
};
