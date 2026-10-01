import React from "react";
import { Trophy, Utensils, Film, Sparkles, CalendarDays } from "lucide-react";

export type PlanCategoryType = "sports" | "dining" | "movies" | "activities" | "custom" | string;

export interface CategoryTheme {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  color: string;
  textColorClass: string;
  bgColorClass: string;
  borderColorClass: string;
  glowColor: string;
}

export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  sports: {
    label: "Sports",
    icon: Trophy,
    color: "#10B981", // green (Emerald-500)
    textColorClass: "text-[#10B981]",
    bgColorClass: "bg-[#10B981]/15",
    borderColorClass: "border-[#10B981]/30",
    glowColor: "rgba(16, 185, 129, 0.3)",
  },
  dining: {
    label: "Dining",
    icon: Utensils,
    color: "#EF4444", // red (Red-500)
    textColorClass: "text-[#EF4444]",
    bgColorClass: "bg-[#EF4444]/15",
    borderColorClass: "border-[#EF4444]/30",
    glowColor: "rgba(239, 68, 68, 0.3)",
  },
  movies: {
    label: "Movies",
    icon: Film,
    color: "#8B5CF6", // violet
    textColorClass: "text-[#8B5CF6]",
    bgColorClass: "bg-[#8B5CF6]/15",
    borderColorClass: "border-[#8B5CF6]/30",
    glowColor: "rgba(139, 92, 246, 0.3)",
  },
  activities: {
    label: "Activities",
    icon: Sparkles,
    color: "#EC4899", // pink
    textColorClass: "text-[#EC4899]",
    bgColorClass: "bg-[#EC4899]/15",
    borderColorClass: "border-[#EC4899]/30",
    glowColor: "rgba(236, 72, 153, 0.3)",
  },
  custom: {
    label: "Custom",
    icon: CalendarDays,
    color: "#A1A1AA", // zinc
    textColorClass: "text-[#A1A1AA]",
    bgColorClass: "bg-white/[0.08]",
    borderColorClass: "border-white/[0.12]",
    glowColor: "rgba(161, 161, 170, 0.2)",
  },
};

export function getCategoryTheme(category?: string | null): CategoryTheme {
  if (!category) return CATEGORY_THEMES.custom;
  const normalized = category.toLowerCase().trim();

  if (
    normalized === "sports" ||
    normalized === "sport" ||
    normalized === "football" ||
    normalized === "badminton" ||
    normalized === "turf" ||
    normalized === "cricket"
  ) {
    return CATEGORY_THEMES.sports;
  }

  if (
    normalized === "dining" ||
    normalized === "restaurants" ||
    normalized === "restaurant" ||
    normalized === "cafe" ||
    normalized === "food" ||
    normalized === "drinks"
  ) {
    return CATEGORY_THEMES.dining;
  }

  if (normalized === "movies" || normalized === "movie" || normalized === "cinema") {
    return CATEGORY_THEMES.movies;
  }

  if (normalized === "activities" || normalized === "activity" || normalized === "recreation") {
    return CATEGORY_THEMES.activities;
  }

  return CATEGORY_THEMES.custom;
}

export interface CategoryIconProps {
  category?: string | null;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  category,
  className = "w-4 h-4",
  strokeWidth = 2,
  style,
}) => {
  const theme = getCategoryTheme(category);
  const IconComponent = theme.icon;

  return (
    <IconComponent
      className={`${theme.textColorClass} ${className}`}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
};
