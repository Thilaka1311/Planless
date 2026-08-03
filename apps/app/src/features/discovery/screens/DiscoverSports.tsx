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
          <span className="font-semibold text-emerald-400">
            {(1.0 + (item.display_order % 4) * 1.8).toFixed(1)}km
          </span>
          <span className="text-zinc-600">•</span>
          <span className="truncate max-w-[170px]">{item.location || "Bangalore"}</span>
        </div>
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
                  <span className="font-semibold text-emerald-400">
                    {(1.0 + (item.display_order % 4) * 1.8).toFixed(1)}km
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
            className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mr-3 shrink-0"
          >
            <Compass className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-white tracking-tight">Sports Plan</h2>
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
          onClick={() => scrollToSection("sports-section-turfs")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          ⚽ Turfs & Arenas
        </button>
        <button
          onClick={() => scrollToSection("sports-section-courts")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          🏸 Courts & Clubs
        </button>
        <button
          onClick={() => scrollToSection("sports-section-adventure")}
          className="text-xs font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full border border-white/[0.04] active:scale-95 transition cursor-pointer shrink-0"
        >
          🧗 Adventure & Fun
        </button>
      </div>

      {/* Categories Content */}
      <div className="px-6 py-6 flex-1 space-y-8">
        <div id="sports-section-turfs">
          <SportsCategorySection
            title="Turfs & Arenas"
            items={turfs}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
        <div id="sports-section-courts">
          <SportsCategorySection
            title="Courts"
            items={courts}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
        <div id="sports-section-adventure">
          <SportsCategorySection
            title="Adventure & Fun"
            items={adventure}
            isExpanded={isExpanded}
            onSelect={onSelectDiscoveryItem}
          />
        </div>
      </div>
    </div>
  );
};
