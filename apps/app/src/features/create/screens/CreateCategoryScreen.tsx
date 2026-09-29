import React from "react";
import { motion } from "motion/react";
import { HomeHeader } from "../../../components/HomeHeader";
import { UserProfile } from "../../../core/types";
import diningCategoryIcon from "../../../assets/categories/dining.png";
import moviesCategoryIcon from "../../../assets/categories/movies.png";
import sportsCategoryIcon from "../../../assets/categories/sports.png";
import activitiesCategoryIcon from "../../../assets/Activities.png";

export interface CreateCategoryOption {
  id: "dining" | "movies" | "sports" | "activities";
  title: string;
  image: string;
  glow?: string;
}

export const CREATE_CATEGORIES: CreateCategoryOption[] = [
  {
    id: "dining",
    title: "Dining",
    image: diningCategoryIcon,
    glow: "hover:border-rose-500/30 hover:shadow-[0_0_24px_rgba(244,63,94,0.18)]",
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

interface CreateCategoryScreenProps {
  userProfile?: UserProfile | null;
  setActiveTab: (tab: any) => void;
  onSelectCategory: (category: "sports" | "movies" | "dining" | "activities" | "custom") => void;
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
      <div className="shrink-0 px-5 pt-3 pb-2 text-left">
        <p className="text-[17px] text-zinc-400 font-medium font-sans leading-snug tracking-tight text-left">
          Choose a category.
        </p>
      </div>

      {/* ── Category Cards Grid matching reference styling ── */}
      <div className="px-5 pt-2 pb-6 flex flex-col gap-3">
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
              {/* Category Illustration */}
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
    </div>
  );
};
