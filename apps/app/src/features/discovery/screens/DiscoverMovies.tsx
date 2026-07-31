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
        transition: { type: "spring", stiffness: 350, damping: 25 }
      });
    } else {
      controls.start({
        x: 0,
        y: index * 14,
        scale: 1 - index * 0.05,
        opacity: index === 1 ? 0.8 : index === 2 ? 0.4 : 0,
        transition: { type: "spring", stiffness: 220, damping: 22 }
      });
    }
  }, [index, controls]);

  const handleDragEnd = async (event: any, info: any) => {
    const swipeThreshold = 130;
    if (isSwipable && info.offset.x > swipeThreshold) {
      await controls.start({
        x: 350,
        opacity: 0,
        rotate: 20,
        transition: { duration: 0.18, ease: "easeOut" }
      });
      onSwipe("right");
    } else if (isSwipable && info.offset.x < -swipeThreshold) {
      await controls.start({
        x: -350,
        opacity: 0,
        rotate: -20,
        transition: { duration: 0.18, ease: "easeOut" }
      });
      onSwipe("left");
    } else {
      controls.start({
        x: 0,
        rotate: 0,
        transition: { type: "spring", stiffness: 350, damping: 20 }
      });
    }
  };

  return (
    <motion.div
      animate={controls}
      style={isTop ? { x, rotate, opacity } : { pointerEvents: "none" }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      className={`absolute w-[290px] h-[370px] rounded-3xl overflow-hidden bg-[#09090b] border border-white/[0.06] shadow-2xl flex flex-col justify-between p-5 transition-shadow duration-300 ${
        isTop ? "cursor-grab active:cursor-grabbing hover:shadow-white/[0.01]" : ""
      }`}
    >
      <div className="absolute inset-0 bg-[#09090b]" />

      <DiscoveryImages
        src={item.cover_image_url}
        category={item.category}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/90" />

      <div className="z-10 flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/[0.08]">
          <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" />
          <span className="text-[9.5px] font-sans font-bold text-white tracking-wide uppercase">
            {item.featured ? "Recommended" : "Hot Show"}
          </span>
        </div>
      </div>

      <div className="z-10 flex flex-col items-center w-full text-center space-y-3.5 mt-auto">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-white leading-snug tracking-wide line-clamp-1">
            {item.title}
          </h4>
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <span className="font-semibold text-violet-450">
              {(0.8 + (item.display_order % 3) * 2.2).toFixed(1)}km
            </span>
            <span className="text-zinc-650">•</span>
            <span className="truncate max-w-[170px]">{item.location || "Bangalore"}</span>
          </div>
          <div className="inline-flex items-center gap-1 mt-1 text-[9px] font-mono font-bold text-violet-450 uppercase tracking-widest">
            🍿 Filling Fast
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/[0.08] text-white font-sans font-bold text-xs rounded-full transition active:scale-[0.97] cursor-pointer flex items-center gap-1"
        >
          Make plan
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
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
      </div>

      {isExpanded ? (
        <div className="flex overflow-x-auto gap-4 py-2 px-1 no-scrollbar scroll-smooth">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="relative shrink-0 w-[230px] h-[310px] rounded-3xl overflow-hidden bg-[#09090b] border border-white/[0.06] flex flex-col justify-end p-4 cursor-pointer hover:border-white/12 hover:scale-[1.01] transition-all duration-300 group"
            >
              <DiscoveryImages
                src={item.cover_image_url}
                category={item.category}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="z-10 space-y-1.5 text-left w-full">
                <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="truncate">{item.location || "Bangalore"}</span>
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
          <motion.div
            layoutId="subscreen-icon-movies"
            className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mr-3 shrink-0"
          >
            <Film className="w-4 h-4" />
          </motion.div>
          <h2 className="text-base font-bold text-white tracking-tight">Movies Plan</h2>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-zinc-300 hover:text-white px-3.5 py-1.5 bg-zinc-900 border border-white/[0.06] rounded-full transition active:scale-95 cursor-pointer"
        >
          {isExpanded ? "Show Stacks" : "Expand All"}
        </button>
      </div>

      <div className="px-6 py-6 flex-1 space-y-8">
        <MoviesCategorySection
          title="Theaters & Luxury Cinemas"
          items={cinemas}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <MoviesCategorySection
          title="Trending Movies"
          items={premieres}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <MoviesCategorySection
          title="Special Screenings"
          items={screenings}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
      </div>
    </div>
  );
};
