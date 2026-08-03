import React, { useState } from "react";
import { ChevronLeft, Sparkles, MapPin, ChevronRight, Film } from "lucide-react";
import { motion, useMotionValue, useTransform, AnimatePresence, useAnimation } from "motion/react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface DiscoverMoviesProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin: (item: DiscoveryItem, config: any) => void;
}

// Premium mock data for movies when the database is empty
const defaultCinemas: DiscoveryItem[] = [
  {
    id: "movies-1",
    public_id: "movies-1",
    section_id: "default-movies",
    title: "PVR Director's Cut",
    category: "MOVIES",
    subcategory: "cinemas",
    description: "Ultra luxury movie screening experience with gourmet food service.",
    cover_image_url: "movies/director_cut.jpg",
    location: "Ambience Mall, Vasant Kunj",
    suggested_duration_minutes: 180,
    suggested_cost_amount: 1500,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "movies-2",
    public_id: "movies-2",
    section_id: "default-movies",
    title: "INOX Insignia",
    category: "MOVIES",
    subcategory: "cinemas",
    description: "Recliners, laser projection, and curated butler service.",
    cover_image_url: "movies/insignia.jpg",
    location: "Lulu Mall, Bangalore",
    suggested_duration_minutes: 150,
    suggested_cost_amount: 1000,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 30,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const defaultPremieres: DiscoveryItem[] = [
  {
    id: "movies-3",
    public_id: "movies-3",
    section_id: "default-movies",
    title: "Kalki 2898 AD",
    category: "MOVIES",
    subcategory: "premieres",
    description: "Sci-fi mythology masterpiece directed by Nag Ashwin.",
    cover_image_url: "movies/kalki.jpg",
    location: "IMAX Screen 1",
    suggested_duration_minutes: 180,
    suggested_cost_amount: 500,
    suggested_capacity: 6,
    default_rsvp_offset_minutes: 20,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "movies-4",
    public_id: "movies-4",
    section_id: "default-movies",
    title: "Deadpool & Wolverine",
    category: "MOVIES",
    subcategory: "premieres",
    description: "The ultimate chaotic superhero matchup of the season.",
    cover_image_url: "movies/deadpool.jpg",
    location: "Standard & IMAX Screens",
    suggested_duration_minutes: 130,
    suggested_cost_amount: 450,
    suggested_capacity: 4,
    default_rsvp_offset_minutes: 15,
    display_order: 2,
    featured: false,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const defaultScreenings: DiscoveryItem[] = [
  {
    id: "movies-5",
    public_id: "movies-5",
    section_id: "default-movies",
    title: "Sunset Cinema Club",
    category: "MOVIES",
    subcategory: "screenings",
    description: "Open-air movie screening under the stars with beanbags.",
    cover_image_url: "movies/sunset_cinema.jpg",
    location: "Rooftop, HSR Layout",
    suggested_duration_minutes: 150,
    suggested_cost_amount: 800,
    suggested_capacity: 2,
    default_rsvp_offset_minutes: 30,
    display_order: 1,
    featured: true,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

interface SwipableCardProps {
  item: DiscoveryItem;
  index: number;
  onSwipe: (direction: "left" | "right") => void;
  onTap: () => void;
  isSwipable?: boolean;
}

const SwipableCard: React.FC<SwipableCardProps> = ({
  item,
  index,
  onSwipe,
  onTap,
  isSwipable = true,
}) => {
  const isTop = index === 0;
  const controls = useAnimation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-15, 15]);
  const opacity = useTransform(x, [-250, -150, 0, 150, 250], [0.3, 1, 1, 1, 0.3]);

  React.useEffect(() => {
    if (index === 0) {
      controls.start({
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        transition: { type: "spring", stiffness: 450, damping: 30 }
      });
    } else {
      x.set(0);
      controls.start({
        x: 0,
        y: index * 14,
        scale: 1 - index * 0.05,
        opacity: index <= 2 ? 1 : 0,
        transition: { type: "spring", stiffness: 400, damping: 30 }
      });
    }
  }, [index, controls, x]);

  const handleDragEnd = async (event: any, info: any) => {
    const swipeThreshold = 40;
    const velocityThreshold = 200;
    if (isSwipable && (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold)) {
      controls.start({
        x: 380,
        opacity: 0,
        rotate: 20,
        transition: { duration: 0.15, ease: "easeOut" }
      });
      setTimeout(() => onSwipe("right"), 140);
    } else if (isSwipable && (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold)) {
      controls.start({
        x: -380,
        opacity: 0,
        rotate: -20,
        transition: { duration: 0.15, ease: "easeOut" }
      });
      setTimeout(() => onSwipe("left"), 140);
    } else {
      controls.start({
        x: 0,
        rotate: 0,
        transition: { type: "spring", stiffness: 400, damping: 25 }
      });
    }
  };

  return (
    <motion.div
      animate={controls}
      initial={{
        x: 0,
        y: index * 14,
        scale: 1 - index * 0.05,
        opacity: index <= 2 ? 1 : 0,
      }}
      style={{
        x,
        rotate,
        opacity: isTop ? opacity : undefined,
        pointerEvents: isTop ? "auto" : "none",
        touchAction: "pan-y"
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      onTap={() => {
        if (isTop && Math.abs(x.get()) < 10) {
          onTap();
        }
      }}
      whileTap={isTop ? { scale: 0.98 } : undefined}
      className={`absolute w-[290px] h-[370px] rounded-3xl overflow-hidden bg-[#09090b] border border-white/[0.06] shadow-2xl flex flex-col justify-end p-6 transition-colors duration-200 ${isTop ? "cursor-pointer hover:border-white/[0.16]" : ""
        }`}
    >
      <div className="absolute inset-0 bg-[#09090b]" />

      {/* Dimming overlay for stacked background cards to prevent visual bleed-through */}
      {index > 0 && (
        <div
          className="absolute inset-0 bg-black z-20 pointer-events-none transition-opacity duration-300"
          style={{ opacity: index === 1 ? 0.35 : 0.7 }}
        />
      )}

      <DiscoveryImages
        src={item.cover_image_url}
        category={item.category}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/90" />

      {/* Content details at bottom, no buttons or badges */}
      <div className="z-10 flex flex-col items-center w-full text-center pb-2">
        <h4 className="text-lg font-extrabold text-white leading-snug tracking-wide line-clamp-1">
          {item.title}
        </h4>
        <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-300 mt-1">
          <span className="font-semibold text-violet-400">
            {(0.8 + (item.display_order % 3) * 2.2).toFixed(1)}km
          </span>
          <span className="text-zinc-600">•</span>
          <span className="truncate max-w-[170px]">{item.location || "Bangalore"}</span>
        </div>
      </div>
    </motion.div>
  );
};

interface MoviesCategorySectionProps {
  title: string;
  items: DiscoveryItem[];
  isExpanded: boolean;
  onSelect: (item: DiscoveryItem) => void;
}

const MoviesCategorySection: React.FC<MoviesCategorySectionProps> = ({
  title,
  items,
  isExpanded,
  onSelect,
}) => {
  const [stack, setStack] = useState<DiscoveryItem[]>(items);

  React.useEffect(() => {
    setStack(items);
  }, [items]);

  const handleSwipe = (direction: "left" | "right") => {
    if (stack.length <= 1) return;
    setStack((prev) => {
      const [first, ...rest] = prev;
      return [...rest, first];
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 px-1">
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          {title} ({items.length})
        </h4>
      </div>      {isExpanded ? (
        <div className="grid grid-rows-2 grid-flow-col gap-3.5 overflow-x-auto py-2 px-1 no-scrollbar scroll-smooth">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="relative shrink-0 w-[135px] h-[175px] rounded-2xl overflow-hidden bg-[#09090b] border border-white/[0.06] shadow-lg flex flex-col justify-end p-3 cursor-pointer hover:border-white/[0.16] hover:scale-[1.01] transition-all duration-300 group"
            >
              <div className="absolute inset-0 bg-[#09090b]" />
              <DiscoveryImages
                src={item.cover_image_url}
                category={item.category}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/90" />
              <div className="z-10 flex flex-col w-full text-left">
                <h4 className="text-xs font-bold text-white leading-tight line-clamp-1">
                  {item.title}
                </h4>
                <div className="flex items-center gap-1 text-[9px] text-zinc-300 mt-0.5">
                  <span className="font-semibold text-violet-400">
                    {(0.8 + (item.display_order % 3) * 2.2).toFixed(1)}km
                  </span>
                  <span className="text-zinc-500">•</span>
                  <span className="truncate max-w-[70px]">{item.location || "Bangalore"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative h-[395px] flex justify-center items-start pt-2">
          {stack
            .slice(0, 3)
            .map((item, idx) => ({ item, idx }))
            .reverse()
            .map(({ item, idx }) => (
              <SwipableCard
                key={item.id}
                item={item}
                index={idx}
                onSwipe={handleSwipe}
                onTap={() => onSelect(item)}
                isSwipable={stack.length > 1}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export const DiscoverMovies: React.FC<DiscoverMoviesProps> = ({
  sections,
  isAdmin,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const allMoviesItems = React.useMemo(() => {
    return sections
      .filter((s) => s.category?.toUpperCase() === "MOVIES")
      .flatMap((s) => s.items || []);
  }, [sections]);

  const cinemas = React.useMemo(() => {
    const list = allMoviesItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("cinema") || sub.includes("theater") || title.includes("pvr") || title.includes("inox") || title.includes("cinema") || title.includes("screen");
    });
    return list.length > 0 ? list : defaultCinemas;
  }, [allMoviesItems]);

  const premieres = React.useMemo(() => {
    const list = allMoviesItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("premiere") || sub.includes("show") || sub.includes("movie") || (!sub.includes("cinema") && !sub.includes("theater") && !sub.includes("screening"));
    });
    return list.length > 0 ? list : defaultPremieres;
  }, [allMoviesItems]);

  const screenings = React.useMemo(() => {
    const list = allMoviesItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("screening") || sub.includes("open") || sub.includes("drive");
    });
    return list.length > 0 ? list : defaultScreenings;
  }, [allMoviesItems]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#000000] overflow-y-auto no-scrollbar pb-24 text-left select-none"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Header Bar */}
      <div className="w-full shrink-0 px-5 flex items-center justify-between bg-[#000000] border-b border-white/[0.08]" style={{ height: "72px" }}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="mr-4 flex items-center justify-center text-white bg-none border-none cursor-pointer p-0"
            style={{ width: "24px", height: "24px" }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div
            className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mr-3 shrink-0"
          >
            <Film className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-white tracking-tight">Movies Plan</h2>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-zinc-300 hover:text-white px-3.5 py-1.5 bg-zinc-900 border border-white/[0.06] rounded-full transition active:scale-95 cursor-pointer"
        >
          {isExpanded ? "Show Stacks" : "Expand All"}
        </button>
      </div>

      {/* Index Navigation Bar */}
      <div className="w-full shrink-0 px-6 py-2.5 bg-[#000000] border-b border-white/[0.04] flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
        <button
          onClick={() => scrollToSection("movies-section-cinemas")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          🎭 Luxury Cinemas
        </button>
        <button
          onClick={() => scrollToSection("movies-section-premieres")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          🎬 Premieres
        </button>
        <button
          onClick={() => scrollToSection("movies-section-screenings")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          🎥 Special Screenings
        </button>
      </div>

      {/* Categories Content */}
      <div className="px-6 py-6 flex-1 space-y-8">
        <div id="movies-section-cinemas">
          <MoviesCategorySection
            title="Theaters & Luxury Cinemas"
            items={cinemas}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
        <div id="movies-section-premieres">
          <MoviesCategorySection
            title="Trending Movies"
            items={premieres}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
        <div id="movies-section-screenings">
          <MoviesCategorySection
            title="Special Screenings"
            items={screenings}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
      </div>
    </div>
  );
};
