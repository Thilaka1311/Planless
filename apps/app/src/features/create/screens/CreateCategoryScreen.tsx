import React, { useState, useEffect, Suspense } from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { HomeHeader } from "../../../components/HomeHeader";
import { UserProfile } from "../../../core/types";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { ForYouSections } from "../../discovery/components/ForYouSections";
import { PlacePreviewSheet } from "../../discovery/components/PlacePreviewSheet";
import { getCachedSections, getSectionsByCategory } from "../../discovery/services/discoveryService";
import { useUserLocation } from "../../discovery/hooks/useUserLocation";
import { useProfileStore } from "../../profile/state/ProfileContext";
import moviesCategoryIcon from "../../../assets/categories/movies.png";
import activitiesCategoryIcon from "../../../assets/categories/activity.png";
import diningCategoryIcon from "../../../assets/categories/dining.png";
import sportsCategoryIcon from "../../../assets/categories/sports.png";

export interface CreateCategoryOption {
  id: "dining" | "movies" | "sports" | "activities";
  title: string;
  image?: string;
  glow?: string;
}

export const CREATE_CATEGORIES: CreateCategoryOption[] = [
  {
    id: "dining",
    title: "Dining",
    image: diningCategoryIcon,
    glow: "hover:border-red-500/30 hover:shadow-[0_0_24px_rgba(239,68,68,0.18)]",
  },
  {
    id: "movies",
    title: "Movies",
    image: moviesCategoryIcon,
    glow: "hover:border-purple-500/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.18)]",
  },
  {
    id: "sports",
    title: "Sports",
    image: sportsCategoryIcon,
    glow: "hover:border-emerald-500/30 hover:shadow-[0_0_24px_rgba(16,185,129,0.18)]",
  },
  {
    id: "activities",
    title: "Activities",
    image: activitiesCategoryIcon,
    glow: "hover:border-pink-500/30 hover:shadow-[0_0_24px_rgba(236,72,153,0.18)]",
  },
];

export interface CreateCategoryScreenProps {
  userProfile?: UserProfile | null;
  setActiveTab?: (tab: any) => void;
  title?: string;
  onBack?: () => void;
  onSelectCategory: (category: "sports" | "movies" | "dining" | "activities" | "custom") => void;
  onSelectDiscoveryItem?: (item: DiscoveryItem) => void;
  sections?: DiscoverySectionType[];
  currentCity?: string;
  currentLocality?: string;
  currentCoordinates?: { latitude: number; longitude: number };
  isAdmin?: boolean;
}

export const CreateCategoryScreen: React.FC<CreateCategoryScreenProps> = ({
  userProfile,
  setActiveTab,
  title = "Quick Plan",
  onBack,
  onSelectCategory,
  onSelectDiscoveryItem,
  sections: propSections,
  currentCity: propCity,
  currentLocality,
  currentCoordinates: propCoordinates,
  isAdmin: propIsAdmin,
}) => {
  const { isAdmin: storeIsAdmin } = useProfileStore();
  const isAdmin = Boolean(propIsAdmin || storeIsAdmin);

  const { coordinates: hookCoords, cityName } = useUserLocation();
  const activeCoordinates = propCoordinates || hookCoords;
  const resolvedCity = propCity || cityName || "Bengaluru";

  const [previewItem, setPreviewItem] = useState<DiscoveryItem | null>(null);

  const [sections, setSections] = useState<DiscoverySectionType[]>(() => {
    if (propSections && propSections.length > 0) return propSections;
    const cached = getCachedSections(activeCoordinates, resolvedCity);
    return cached && cached.length > 0 ? cached : [];
  });

  const [isLoading, setIsLoading] = useState(() => {
    if (propSections && propSections.length > 0) return false;
    const cached = getCachedSections(activeCoordinates, resolvedCity);
    return !cached || cached.length === 0;
  });

  useEffect(() => {
    if (propSections && propSections.length > 0) {
      setSections(propSections);
      setIsLoading(false);
      return;
    }
    let active = true;
    const locationParams = {
      latitude: activeCoordinates.latitude,
      longitude: activeCoordinates.longitude,
      city: resolvedCity,
    };
    getSectionsByCategory("all", false, locationParams)
      .then((data) => {
        if (active) {
          if (data && data.length > 0) {
            setSections(data);
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[CreateCategoryScreen] Error loading sections:", err);
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [propSections, activeCoordinates.latitude, activeCoordinates.longitude, resolvedCity]);

  return (
    <div
      className="flex-1 flex flex-col relative h-full bg-[#050505] text-left select-none overflow-y-auto no-scrollbar pb-8 pb-[max(2rem,env(safe-area-inset-bottom,0px))]"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── Fixed Header matching Planless screens ── */}
      {onBack ? (
        <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-3 shrink-0 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="p-1 -ml-1 text-white hover:text-zinc-300 active:scale-95 transition flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <h2 className="text-lg font-bold text-white tracking-tight font-sans truncate select-none">
              {title}
            </h2>
          </div>
        </div>
      ) : userProfile && setActiveTab && title === "Create" ? (
        <HomeHeader
          userProfile={userProfile}
          setActiveTab={setActiveTab}
          pendingMemoryCount={0}
          title="Create"
          hideNotificationsIcon={true}
        />
      ) : (
        <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-3 shrink-0 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white tracking-tight font-sans truncate select-none">
              {title}
            </h2>
          </div>
        </div>
      )}

      {/* ── Section Instruction ── */}
      <div className="shrink-0 px-5 pt-3 pb-2 text-left">
        <p className="text-[17px] text-zinc-400 font-medium font-sans leading-snug tracking-tight text-left">
          Choose a category.
        </p>
      </div>

      {/* ── Category Cards Grid matching reference styling ── */}
      <div className="px-5 pt-2 pb-5 flex flex-col gap-3 shrink-0">
        <div className="grid grid-cols-4 gap-2">
          {CREATE_CATEGORIES.map((category, index) => (
            <motion.button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              className={`relative h-[96px] rounded-2xl border border-white/[0.08] bg-[#121216]/90 hover:bg-[#18181f] active:scale-[0.97] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-2.5 group shadow-md ${category.glow || ""}`}
            >
              {/* Category Icon / Illustration */}
              <div className="w-13 h-13 flex items-center justify-center shrink-0">
                <img
                  src={category.image}
                  alt={category.title}
                  className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-200 select-none pointer-events-none"
                />
              </div>

              {/* Category Name Underneath */}
              <span className="text-[13px] font-semibold text-white/90 group-hover:text-white tracking-tight leading-tight mt-1.5 font-sans">
                {category.title}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Discovery Content Feed underneath Category Selector ── */}
      {isLoading ? (
        <div className="space-y-7 pt-2">
          {["Dining", "Sports", "Movies", "Activities"].map((catTitle) => {
            const isMovieCat = catTitle === "Movies";
            return (
              <div key={catTitle} className="space-y-3">
                <div className="px-6 flex items-center justify-between">
                  <div className="h-4 w-32 bg-white/[0.06] rounded-md animate-pulse" />
                </div>
                <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2.5">
                  {[1, 2, 3, 4, 5].slice(0, isMovieCat ? 5 : 4).map((i) => (
                    <div
                      key={i}
                      style={
                        isMovieCat
                          ? { width: 130, minWidth: 130, height: 235 }
                          : {
                              width: "220px",
                              minWidth: "220px",
                              maxWidth: "220px",
                              height: "225px",
                              minHeight: "225px",
                            }
                      }
                      className="shrink-0 rounded-2xl bg-[#121216] border border-white/[0.06] overflow-hidden flex flex-col animate-pulse"
                    >
                      <div className={isMovieCat ? "w-full aspect-[2/3] bg-white/[0.04]" : "w-full h-[130px] bg-white/[0.04]"} />
                      <div className="p-3 flex flex-col justify-between flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-white/[0.07] rounded" />
                        <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                        {!isMovieCat && <div className="h-3 w-2/3 bg-white/[0.04] rounded" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ForYouSections
          sections={sections}
          searchQuery=""
          categoryFilter="all"
          onSelectItem={(item) => setPreviewItem(item)}
          isAdmin={isAdmin}
          userCoordinates={activeCoordinates}
          currentCity={resolvedCity}
          onViewAllCategory={(cat) => onSelectCategory(cat)}
          onViewAllMovies={() => onSelectCategory("movies")}
        />
      )}

      {/* ── Place Preview Bottom Sheet ── */}
      {previewItem && (
        <Suspense fallback={null}>
          <PlacePreviewSheet
            item={previewItem}
            userCoordinates={activeCoordinates}
            onClose={() => setPreviewItem(null)}
            onConfirmPlan={(item) => {
              setPreviewItem(null);
              onSelectDiscoveryItem?.(item);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
