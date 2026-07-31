import React, { useState } from "react";
import { ChevronLeft, Sparkles, Bookmark, MapPin, ChevronRight } from "lucide-react";
import { motion, useMotionValue, useTransform, AnimatePresence, useAnimation } from "motion/react";
import { DiscoverySection as DiscoverySectionType, DiscoveryItem } from "../../../core/types/discovery";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface DiscoverDiningProps {
  sections: DiscoverySectionType[];
  isAdmin: boolean;
  onBack: () => void;
  onSelectDiscoveryItem: (item: DiscoveryItem) => void;
  onLongPressAdmin: (item: DiscoveryItem, config: any) => void;
}

// Premium mock data for dining subcategories when the database lists are empty
const defaultCafes: DiscoveryItem[] = [
  {
    id: "cafe-1",
    public_id: "cafe-1",
    section_id: "default-dining",
    title: "Glen's Bakehouse",
    category: "DINING",
    subcategory: "cafe",
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
    subcategory: "cafe",
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
    subcategory: "cafe",
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
  }
];

const defaultFineDines: DiscoveryItem[] = [
  {
    id: "fine-1",
    public_id: "fine-1",
    section_id: "default-dining",
    title: "The Karavalli",
    category: "DINING",
    subcategory: "fine dine",
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
    subcategory: "fine dine",
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
  }
];

const defaultPubs: DiscoveryItem[] = [
  {
    id: "pub-1",
    public_id: "pub-1",
    section_id: "default-dining",
    title: "Toit Beer Co.",
    category: "DINING",
    subcategory: "pubs",
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
    subcategory: "pubs",
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
    subcategory: "pubs",
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
  }
];

// Swipable Card component using Framer Motion
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

  // Keep anim controls in sync with stack index changes
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
      // Fly off to the right
      await controls.start({
        x: 350,
        opacity: 0,
        rotate: 20,
        transition: { duration: 0.18, ease: "easeOut" }
      });
      onSwipe("right");
    } else if (isSwipable && info.offset.x < -swipeThreshold) {
      // Fly off to the left
      await controls.start({
        x: -350,
        opacity: 0,
        rotate: -20,
        transition: { duration: 0.18, ease: "easeOut" }
      });
      onSwipe("left");
    } else {
      // Snap back to center
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
      className={`absolute w-[290px] h-[370px] rounded-3xl overflow-hidden bg-[#09090b] border border-white/[0.06] shadow-2xl flex flex-col justify-between p-5 transition-shadow duration-300 ${isTop ? "cursor-grab active:cursor-grabbing hover:shadow-white/[0.01]" : ""
        }`}
    >
      {/* Solid Background container (ensures card is fully opaque) */}
      <div className="absolute inset-0 bg-[#09090b]" />

      {/* Cover Image */}
      <DiscoveryImages
        src={item.cover_image_url}
        category={item.category}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/90" />

      {/* Top Header Row */}
      <div className="z-10 flex items-center justify-between w-full">
        {/* Hot off the press badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/[0.08]">
          <Sparkles className="w-3 h-3 text-rose-400 animate-pulse" />
          <span className="text-[9.5px] font-sans font-bold text-white tracking-wide uppercase">
            {item.featured ? "Hot off the press" : "Trending"}
          </span>
        </div>
      </div>

      {/* Bottom Content Row */}
      <div className="z-10 flex flex-col items-center w-full text-center space-y-3.5 mt-auto">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-white leading-snug tracking-wide line-clamp-1">
            {item.title}
          </h4>
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">
              {(1.2 + (item.display_order % 5) * 1.5).toFixed(1)}km
            </span>
            <span className="text-zinc-650">•</span>
            <span className="truncate max-w-[170px]">{item.location || "Bangalore"}</span>
          </div>
          {/* Subtle benefits badge */}
          <div className="inline-flex items-center gap-1 mt-1 text-[9px] font-mono font-bold text-rose-450 uppercase tracking-widest">
            🏷️ Bank benefits
          </div>
        </div>

        {/* Make plan button */}
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

// Dining Category Section incorporating stacks or sideways scrolling
interface DiningCategorySectionProps {
  title: string;
  items: DiscoveryItem[];
  isExpanded: boolean;
  onSelect: (item: DiscoveryItem) => void;
}

const DiningCategorySection: React.FC<DiningCategorySectionProps> = ({
  title,
  items,
  isExpanded,
  onSelect,
}) => {
  const [stack, setStack] = useState<DiscoveryItem[]>(items);

  // Keep stack state in sync with items from props
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
      {/* Title */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 px-1">
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          {title} ({items.length})
        </h4>
      </div>

      {/* Expanded Row vs Card Stack */}
      {isExpanded ? (
        <div className="flex overflow-x-auto gap-4 py-2 px-1 no-scrollbar scroll-smooth">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="relative shrink-0 w-[230px] h-[310px] rounded-3xl overflow-hidden bg-zinc-950 border border-white/[0.06] flex flex-col justify-end p-4 cursor-pointer hover:border-white/12 hover:scale-[1.01] transition-all duration-300 group"
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

export const DiscoverDining: React.FC<DiscoverDiningProps> = ({
  sections,
  isAdmin,
  onBack,
  onSelectDiscoveryItem,
  onLongPressAdmin,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Group dining items from sections
  const allDiningItems = React.useMemo(() => {
    return sections
      .filter((s) => s.category?.toUpperCase() === "DINING")
      .flatMap((s) => s.items || []);
  }, [sections]);

  // Subcategory partitioning (with default fallback fallback items to ensure a filled premium view)
  const cafes = React.useMemo(() => {
    const list = allDiningItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("cafe") || title.includes("cafe") || (!sub.includes("pub") && !sub.includes("fine") && !sub.includes("dine") && !sub.includes("bar") && !sub.includes("brewery"));
    });
    return list.length > 0 ? list : defaultCafes;
  }, [allDiningItems]);

  const fineDines = React.useMemo(() => {
    const list = allDiningItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("fine") || sub.includes("dine") || title.includes("fine") || title.includes("dine") || title.includes("restaurant");
    });
    return list.length > 0 ? list : defaultFineDines;
  }, [allDiningItems]);

  const pubs = React.useMemo(() => {
    const list = allDiningItems.filter((item) => {
      const sub = (item.subcategory || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      return sub.includes("pub") || sub.includes("bar") || sub.includes("brewery") || sub.includes("drink") || title.includes("pub") || title.includes("bar") || title.includes("brewery") || title.includes("lounge");
    });
    return list.length > 0 ? list : defaultPubs;
  }, [allDiningItems]);

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
          <h2 className="text-base font-bold text-white tracking-tight">Dining Plan</h2>
        </div>
        {/* Toggle Expansion Option */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-zinc-300 hover:text-white px-3.5 py-1.5 bg-zinc-900 border border-white/[0.06] rounded-full transition active:scale-95 cursor-pointer"
        >
          {isExpanded ? "Show Stacks" : "Expand All"}
        </button>
      </div>

      {/* Categories Content */}
      <div className="px-6 py-6 flex-1 space-y-8">
        <DiningCategorySection
          title="Cafes"
          items={cafes}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <DiningCategorySection
          title="Fine Dine"
          items={fineDines}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
        <DiningCategorySection
          title="Pubs & Breweries"
          items={pubs}
          isExpanded={isExpanded}
          onSelect={onSelectDiscoveryItem}
        />
      </div>
    </div>
  );
};
