import React from "react";
import { motion } from "motion/react";
import { HomeHeader } from "../../../components/HomeHeader";
import { UserProfile } from "../../../core/types";
import sportsImage from "../../../assets/sports.png";
import moviesImage from "../../../assets/Movies.png";
import diningImage from "../../../assets/dining.png";
import defaultPlanCover from "../../../assets/planimagedefault.png";

export interface CreateCategoryOption {
  id: "sports" | "movies" | "dining" | "custom";
  title: string;
  image: string;
}

export const CREATE_CATEGORIES: CreateCategoryOption[] = [
  {
    id: "sports",
    title: "Sports",
    image: sportsImage,
  },
  {
    id: "movies",
    title: "Movies",
    image: moviesImage,
  },
  {
    id: "dining",
    title: "Dining",
    image: diningImage,
  },
  {
    id: "custom",
    title: "Custom",
    image: defaultPlanCover,
  },
];

interface CreateCategoryScreenProps {
  userProfile?: UserProfile | null;
  setActiveTab: (tab: any) => void;
  onSelectCategory: (category: "sports" | "movies" | "dining" | "custom") => void;
}

export const CreateCategoryScreen: React.FC<CreateCategoryScreenProps> = ({
  userProfile,
  setActiveTab,
  onSelectCategory,
}) => {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full bg-[#050505] text-left select-none">
      {/* ── Fixed Header matching Planless screens ── */}
      {userProfile && (
        <HomeHeader
          userProfile={userProfile}
          setActiveTab={setActiveTab}
          pendingMemoryCount={0}
          title="Create"
          hideNotificationsIcon={true}
        />
      )}

      {/* ── Section Instruction ── */}
      <div className="shrink-0 px-4 pt-2 pb-2 text-center">
        <p className="text-[18px] text-zinc-400 font-medium font-sans leading-snug tracking-tight text-center">
          Choose a category.
        </p>
      </div>

      {/* ── Dynamic Category Cards Grid (Fills available space above bottom nav) ── */}
      <div className="flex-1 min-h-0 px-4 pt-1 pb-[calc(80px+env(safe-area-inset-bottom,12px)+8px)] flex flex-col">
        <div className="grid grid-cols-2 grid-rows-2 gap-3.5 flex-1 min-h-0 w-full h-full">
          {CREATE_CATEGORIES.map((category, index) => (
            <motion.button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              className="relative w-full h-full min-h-0 rounded-[22px] overflow-hidden border border-white/[0.08] bg-[#121216] cursor-pointer group active:scale-[0.98] transition-all text-left shadow-lg"
            >
              {/* Category Background Image */}
              <img
                src={category.image}
                alt={category.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none"
              />

              {/* Gradient Overlay for Contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5 transition-opacity" />

              {/* Category Title */}
              <div className="absolute inset-0 p-4 flex flex-col justify-end z-10">
                <h3 className="text-[17px] font-bold text-white font-sans tracking-tight leading-tight drop-shadow-md">
                  {category.title}
                </h3>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};
