import defaultPlanCover from "../../../assets/planimagedefault.png";
import sportsCover from "../../../assets/sports.png";
import movieCover from "../../../assets/Movies.png";
import diningCover from "../../../assets/dining.png";

export const PLAN_COVER_IMAGES = {
  sports: sportsCover,
  football: sportsCover,
  badminton: sportsCover,
  movie: movieCover,
  dining: diningCover,
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
  // Sports -> sports.png
  if (
    normActivity === "sports" ||
    normActivity === "sport" ||
    normActivity === "football" ||
    normActivity === "soccer" ||
    normActivity === "badminton"
  ) {
    return PLAN_COVER_IMAGES.sports;
  }

  // Movies -> Movies.png
  if (normActivity === "movies" || normActivity === "movie" || normActivity === "cinema") {
    return PLAN_COVER_IMAGES.movie;
  }

  // Dining -> dining.png
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

