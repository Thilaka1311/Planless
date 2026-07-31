import React, { useState } from "react";
import { ChevronLeft, Sparkles, MapPin, ChevronRight, Compass } from "lucide-react";
import { motion, useMotionValue, useTransform, AnimatePresence, useAnimation } from "motion/react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface DiscoverSportsProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin: (item: DiscoveryItem, config: any) => void;
}

// Premium mock data for sports when the database is empty
const defaultTurfs: DiscoveryItem[] = [
  {
    id: "sports-1",
    public_id: "sports-1",
    section_id: "default-sports",
    title: "Tiki Taka Arena",
    category: "SPORTS",
    subcategory: "turfs",
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
    subcategory: "turfs",
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
  }
];

const defaultCourts: DiscoveryItem[] = [
  {
    id: "sports-3",
    public_id: "sports-3",
    section_id: "default-sports",
    title: "Dinks & Smashes Court",
    category: "SPORTS",
    subcategory: "courts",
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
    subcategory: "courts",
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
  }
];

const defaultAdventure: DiscoveryItem[] = [
  {
    id: "sports-5",
    public_id: "sports-5",
    section_id: "default-sports",
    title: "Play Arena",
    category: "SPORTS",
    subcategory: "adventure",
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
          <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-[9.5px] font-sans font-bold text-white tracking-wide uppercase">
            {item.featured ? "Featured Turf" : "Popular"}
          </span>
        </div>
      </div>

      <div className="z-10 flex flex-col items-center w-full text-center space-y-3.5 mt-auto">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-white leading-snug tracking-wide line-clamp-1">
            {item.title}
          </h4>
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <span className="font-semibold text-emerald-450">
              {(1.0 + (item.display_order % 4) * 1.8).toFixed(1)}km
            </span>
            <span className="text-zinc-650">•</span>
            <span className="truncate max-w-[170px]">{item.location || "Bangalore"}</span>
          </div>
          <div className="inline-flex items-center gap-1 mt-1 text-[9px] font-mono font-bold text-emerald-450 uppercase tracking-widest">
            ⚽ High Ratings
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

interface SportsCategorySectionProps {
  title: string;
  items: DiscoveryItem[];
  isExpanded: boolean;
  onSelect: (item: DiscoveryItem) => void;
}

const SportsCategorySection: React.FC<SportsCategorySectionProps> = ({
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

export const DiscoverSports: React.FC<DiscoverSportsProps> = ({
  sections,
  isAdmin,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const allSportsItems = React.useMemo(() => {
    return sections
      .filter((s) => s.category?.toUpperCase() === "SPORTS")
      .flatMap((s) => s.items || []);
  }, [sections]);

  const turfs = React.useMemo(() => {
    const list = allSportsItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("turf") || title.includes("turf") || title.includes("arena");
    });
    return list.length > 0 ? list : defaultTurfs;
  }, [allSportsItems]);

  const courts = React.useMemo(() => {
    const list = allSportsItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("court") || sub.includes("badminton") || sub.includes("pickleball") || sub.includes("tennis");
    });
    return list.length > 0 ? list : defaultCourts;
  }, [allSportsItems]);

  const adventure = React.useMemo(() => {
    const list = allSportsItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("adventure") || sub.includes("fun") || sub.includes("kart") || sub.includes("bowling");
    });
    return list.length > 0 ? list : defaultAdventure;
  }, [allSportsItems]);

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
            layoutId="subscreen-icon-sports"
            className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mr-3 shrink-0"
          >
            <Compass className="w-4 h-4" />
          </motion.div>
          <h2 className="text-base font-bold text-white tracking-tight">Sports Plan</h2>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-zinc-300 hover:text-white px-3.5 py-1.5 bg-zinc-900 border border-white/[0.06] rounded-full transition active:scale-95 cursor-pointer"
        >
          {isExpanded ? "Show Stacks" : "Expand All"}
        </button>
      </div>

      <div className="px-6 py-6 flex-1 space-y-8">
        <SportsCategorySection
          title="Turfs & Arenas"
          items={turfs}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <SportsCategorySection
          title="Courts"
          items={courts}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <SportsCategorySection
          title="Adventure & Fun"
          items={adventure}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
      </div>
    </div>
  );
};
