import defaultPlanCover from "../../../assets/planimagedefault.webp";
import sportsCover from "../../../assets/sports.webp";
import movieCover from "../../../assets/Movies.webp";
import diningCover from "../../../assets/dining.webp";
import activitiesCover from "../../../assets/categories/activity.png";

export const PLAN_COVER_IMAGES = {
  sports: sportsCover,
  football: sportsCover,
  badminton: sportsCover,
  movie: movieCover,
  dining: diningCover,
  activities: activitiesCover,
  default: defaultPlanCover,
};

export function getPlanCover(activityType?: string, subcategory?: string | null): string {
  const normActivity = (activityType || "").toLowerCase().trim();
  const normSub = (subcategory || "").toLowerCase().trim();

  // 1. Check Custom category or explicit default request
  if (!activityType || normActivity === "custom" || normSub === "custom") {
    return PLAN_COVER_IMAGES.default;
  }

  // 2. Resolve known categories
  // Activities -> Activities.png
  if (
    normActivity === "activities" ||
    normActivity === "activity" ||
    normActivity === "recreation" ||
    normActivity === "bowling" ||
    normActivity === "karting" ||
    normActivity === "arcade" ||
    normActivity === "games"
  ) {
    return PLAN_COVER_IMAGES.activities;
  }
  // Sports -> sports.webp
  if (
    normActivity === "sports" ||
    normActivity === "sport" ||
    normActivity === "football" ||
    normActivity === "soccer" ||
    normActivity === "badminton"
  ) {
    return PLAN_COVER_IMAGES.sports;
  }

  // Movies -> Movies.webp
  if (normActivity === "movies" || normActivity === "movie" || normActivity === "cinema") {
    return PLAN_COVER_IMAGES.movie;
  }

  // Dining -> dining.webp
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

  // 3. Fallback to default
  return PLAN_COVER_IMAGES.default;
}

