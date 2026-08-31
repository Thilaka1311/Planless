import defaultPlanCover from "../../../assets/planimagedefault.png";

export const PLAN_COVER_IMAGES = {
  football: "/assets/plan-covers/football.png",
  badminton: "/assets/plan-covers/badminton.png",
  movie: "/assets/plan-covers/movie.png",
  dining: "/assets/plan-covers/dining.png",
  default: defaultPlanCover,
};

export function getPlanCover(activityType?: string, subcategory?: string | null): string {
  const normActivity = (activityType || "").toLowerCase().trim();
  const normSub = (subcategory || "").toLowerCase().trim();

  // 1. Check Custom category
  if (normActivity === "custom" || normSub === "custom") {
    return PLAN_COVER_IMAGES.default;
  }

  // 2. Resolve known categories
  // Sports -> Football / Soccer
  if (
    normActivity === "football" || 
    normActivity === "soccer" || 
    ((normActivity === "sports" || normActivity === "sport") && (normSub === "football" || normSub === "soccer"))
  ) {
    return PLAN_COVER_IMAGES.football;
  }

  // Sports -> Badminton
  if (
    normActivity === "badminton" || 
    ((normActivity === "sports" || normActivity === "sport") && normSub === "badminton")
  ) {
    return PLAN_COVER_IMAGES.badminton;
  }

  // Movies
  if (normActivity === "movies" || normActivity === "movie" || normActivity === "cinema") {
    return PLAN_COVER_IMAGES.movie;
  }

  // Dining
  if (
    normActivity === "dining" ||
    normActivity === "restaurants" ||
    normActivity === "restaurant" ||
    normActivity === "cafe" ||
    normActivity === "brunch" ||
    normActivity === "coffee"
  ) {
    return PLAN_COVER_IMAGES.dining;
  }

  // 3. Unresolved non-custom activity mapping -> Log development warning and fallback to default
  console.warn(`Missing cover image mapping for activity:\n${activityType}`);
  return PLAN_COVER_IMAGES.default;
}
