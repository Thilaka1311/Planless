import React, { useState, useEffect } from "react";
import { Search, Compass, Film, UtensilsCrossed, CalendarDays, Star, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { getSectionsByCategory, getCachedSections } from "../services/discoveryService";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { HomeHeader } from "../../../components/HomeHeader";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { ADMIN_CONFIGS, ContentConfig } from "../services/discoveryAdminService";
import { useLongPress } from "../../../shared/hooks/useLongPress";
import { AdminContextSheet, AdminDrawer } from "./AdminDiscovery";
import { EditCard } from "../components/EditCard";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { DiscoverSports } from "./DiscoverSports";
import { DiscoverMovies } from "./DiscoverMovies";
import { DiscoverDining } from "./DiscoverDining";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscoveryProps {
  userProfile: any;
  setActiveTab: (tab: any) => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onSelectCustomPlan: () => void;
}

// ─── Main Discovery Screen ────────────────────────────────────────────────────

export const BrowseExperiencesStep: React.FC<DiscoveryProps> = ({
  userProfile: propUserProfile,
  setActiveTab,
  onSelectDiscoveryItem,
  onSelectCustomPlan,
}) => {
  const { isAdmin, userProfile: storeUserProfile } = useProfileStore();
  const userProfile = propUserProfile || storeUserProfile;
  const adminToken = userProfile?.token || storeUserProfile?.token;
  const [searchQuery, setSearchQuery] = useState("");
  const [sections, setSections] = useState<DiscoverySectionType[]>(() => {
    return getCachedSections() || [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    return !getCachedSections();
  });
  const [discoveryVersion, setDiscoveryVersion] = useState(0);
  const [activeSubScreen, setActiveSubScreen] = useState<"sports" | "movies" | "dining" | null>(null);

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
    getSectionsByCategory("all", forceRefresh)
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
  }, [discoveryVersion]);

  // Filter by search query
  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.subcategory && item.subcategory.toLowerCase().includes(q))
        );
      }),
    }))
    .filter((s) => s.items.length > 0);

  // Resolve CMS config for a section
  const getAdminConfig = (section: DiscoverySectionType): ContentConfig | null => {
    const cat = section.category?.toUpperCase();
    if (cat === "SPORTS") return ADMIN_CONFIGS.turfs;
    if (cat === "MOVIES") return ADMIN_CONFIGS.movies;
    if (cat === "DINING") return ADMIN_CONFIGS.dining;
    return null;
  };
  // Render Sub-Screens if active resolved at the end of the hook to prevent hook-count mismatches

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >

      {/* ── 1. HOME HEADER ── */}
      {userProfile && (
        <HomeHeader
          userProfile={userProfile}
          setActiveTab={setActiveTab}
          pendingMemoryCount={0}
        />
      )}

      {/* ── 2. SEARCH BAR ── */}
      <section className="px-6 py-2 shrink-0">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-zinc-500" />
          </span>
          <input
            id="discovery-search-input"
            name="discoverySearchInput"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activities, movies, restaurants..."
            className="w-full h-13 pl-11 pr-4 bg-[#111111] border border-white/[0.04] rounded-full text-sm font-normal text-white placeholder-zinc-500 focus:outline-none focus:border-white/10 transition-all duration-300 shadow-inner"
          />
        </div>
      </section>

      {/* ── 3. CATEGORY GRID ── */}
      <section className="px-6 py-4 shrink-0">
        <div className="grid grid-cols-2 gap-3">

          <button
            onClick={() => setActiveSubScreen("sports")}
            {...useLongPress(() => {
              if (isAdmin) {
                const sec = sections.find((s) => s.category?.toUpperCase() === "SPORTS");
                const baseConfig = { ...ADMIN_CONFIGS.turfs };
                if (sec) baseConfig.section_id = sec.id;
                setAddConfig(baseConfig);
              }
            }, { threshold: 500 })}
            className="h-[100px] rounded-2xl bg-[#111111] hover:bg-[#151515] border border-white/[0.04] hover:border-emerald-500/20 p-4 flex flex-col justify-between text-left transition duration-300 active:scale-97 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-4xl opacity-10 group-hover:scale-110 transition duration-300">⚽</div>
            <motion.div
              layoutId="subscreen-icon-sports"
              className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"
            >
              <Compass className="w-4 h-4" />
            </motion.div>
            <div>
              <span className="text-xs font-semibold text-white block tracking-wide">Sports</span>
              <span className="text-[9px] text-zinc-500 block font-normal">Turfs & Courts</span>
            </div>
          </button>

          <button
            onClick={() => setActiveSubScreen("movies")}
            {...useLongPress(() => {
              if (isAdmin) {
                const sec = sections.find((s) => s.category?.toUpperCase() === "MOVIES");
                const baseConfig = { ...ADMIN_CONFIGS.movies };
                if (sec) baseConfig.section_id = sec.id;
                setAddConfig(baseConfig);
              }
            }, { threshold: 500 })}
            className="h-[100px] rounded-2xl bg-[#111111] hover:bg-[#151515] border border-white/[0.04] hover:border-violet-500/20 p-4 flex flex-col justify-between text-left transition duration-300 active:scale-97 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-4xl opacity-10 group-hover:scale-110 transition duration-300">🎬</div>
            <motion.div
              layoutId="subscreen-icon-movies"
              className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400"
            >
              <Film className="w-4 h-4" />
            </motion.div>
            <div>
              <span className="text-xs font-semibold text-white block tracking-wide">Movies</span>
              <span className="text-[9px] text-zinc-500 block font-normal">Trending Premieres</span>
            </div>
          </button>

          <button
            onClick={() => setActiveSubScreen("dining")}
            {...useLongPress(() => {
              if (isAdmin) {
                const sec = sections.find((s) => s.category?.toUpperCase() === "DINING");
                const baseConfig = { ...ADMIN_CONFIGS.dining };
                if (sec) baseConfig.section_id = sec.id;
                setAddConfig(baseConfig);
              }
            }, { threshold: 500 })}
            className="h-[100px] rounded-2xl bg-[#111111] hover:bg-[#151515] border border-white/[0.04] hover:border-rose-500/20 p-4 flex flex-col justify-between text-left transition duration-300 active:scale-97 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-4xl opacity-10 group-hover:scale-110 transition duration-300">🍝</div>
            <motion.div
              layoutId="subscreen-icon-dining"
              className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400"
            >
              <UtensilsCrossed className="w-4 h-4" />
            </motion.div>
            <div>
              <span className="text-xs font-semibold text-white block tracking-wide">Dining</span>
              <span className="text-[9px] text-zinc-500 block font-normal">Popular Cafes</span>
            </div>
          </button>

          <button
            onClick={onSelectCustomPlan}
            {...useLongPress(() => {
              if (isAdmin) {
                const sec = sections.find((s) => s.category?.toUpperCase() === "CUSTOM");
                // For custom config: build a lightweight config skeleton targeting Custom section_id
                const baseConfig: ContentConfig = {
                  type: "custom",
                  title: "Custom Card",
                  category: "CUSTOM",
                  section_id: sec ? sec.id : "",
                  fields: [
                    { name: 'title', label: 'Card Title', type: 'text', required: true, placeholder: 'e.g. Board Game Night' },
                    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'e.g. Fun games and drinks' },
                    { name: 'location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. Community Clubhouse' },
                    { name: 'cover_image_url', label: 'Cover Image', type: 'image', defaultValue: '' },
                    { name: 'display_order', label: 'Display Order', type: 'number', defaultValue: 1 },
                  ]
                };
                setAddConfig(baseConfig);
              }
            }, { threshold: 500 })}
            className="h-[100px] rounded-2xl bg-[#111111] hover:bg-[#151515] border border-white/[0.04] hover:border-zinc-500/20 p-4 flex flex-col justify-between text-left transition duration-300 active:scale-97 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute -right-3 -bottom-3 text-4xl opacity-10 group-hover:scale-110 transition duration-300">✨</div>
            <div className="w-8 h-8 rounded-xl bg-zinc-500/10 border border-white/10 flex items-center justify-center text-zinc-400">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-white block tracking-wide">Custom</span>
              <span className="text-[9px] text-zinc-500 block font-normal">Create Scratch</span>
            </div>
          </button>

        </div>
      </section>

      {/* ── 4. DISCOVERY SECTIONS ── */}
      {isLoading ? (
        <div className="px-6 py-12 flex flex-col items-center justify-center space-y-3">
          <div className="w-6 h-6 border-2 border-[#FF6B2C] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Coordinating matches...</span>
        </div>
      ) : filteredSections.length === 0 ? (
        <div className="px-6 py-16 text-center space-y-2">
          <p className="text-zinc-500 text-sm font-normal">No suggestions found matching your vibe.</p>
          <button
            onClick={() => setSearchQuery("")}
            className="text-xs font-semibold text-[#FF6B2C] uppercase tracking-wider"
          >
            Clear Search Filter
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredSections.map((section) => {
            const categoryUpper = section.category?.toUpperCase() || "CUSTOM";
            let colorAccent = "text-amber-500";
            let badgeBg = "bg-amber-500/10 border-amber-500/20";
            if (categoryUpper === "SPORTS") {
              colorAccent = "text-emerald-500";
              badgeBg = "bg-emerald-500/10 border-emerald-500/20";
            } else if (categoryUpper === "MOVIES") {
              colorAccent = "text-violet-500";
              badgeBg = "bg-violet-500/10 border-violet-500/20";
            } else if (categoryUpper === "DINING") {
              colorAccent = "text-rose-500";
              badgeBg = "bg-rose-500/10 border-rose-500/20";
            }

            const adminConfig = getAdminConfig(section);

            return (
              <div key={section.id} className="space-y-3.5">

                {/* Section header — clean, no admin buttons */}
                <div className="px-6 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white tracking-widest">
                    {section.title}
                  </h4>
                </div>

                {/* Horizontal card scroll */}
                <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 pb-2.5 scroll-smooth">
                  {section.items.map((item) => (
                    <DiscoveryCard
                      key={item.id}
                      item={item}
                      colorAccent={colorAccent}
                      badgeBg={badgeBg}
                      isAdmin={isAdmin && !!adminConfig}
                      onTap={() => onSelectDiscoveryItem(item)}
                      onLongPressAdmin={() => {
                        if (adminConfig) {
                          setContextTarget({ item, config: adminConfig });
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
            onBack={() => setActiveSubScreen(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
          />
        </div>
      )}

      {activeSubScreen === "movies" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverMovies
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => setActiveSubScreen(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
          />
        </div>
      )}

      {activeSubScreen === "dining" && (
        <div className="fixed inset-0 z-40 bg-black">
          <DiscoverDining
            sections={sections}
            isAdmin={isAdmin}
            onBack={() => setActiveSubScreen(null)}
            onSelectDiscoveryItem={onSelectDiscoveryItem}
            onLongPressAdmin={(item, section) => {
              const config = getAdminConfig(section);
              if (config) setContextTarget({ item, config });
            }}
          />
        </div>
      )}

    </div>
  );
};
