import defaultPlanCover from "../../../assets/planimagedefault.png";
import { getPlanCover } from "../../plans/config/planCoverImages";

export const CATEGORY_EMOJI: Record<string, string> = {
  sports: "⚽",
  movies: "🎬",
  dining: "🍝",
  custom: "✨",
};

/**
 * @deprecated Use getPlanCover from features/plans/config/planCoverImages directly instead.
 */
export const getCategoryImage = (cat: string, sub: string | null): string => {
  return getPlanCover(cat, sub);
};

export const RECENT_PLACES = [
  'Play Arena HSR',
  'Toit Indiranagar',
  'Nexus IMAX',
  'Social Indiranagar'
];

export const RSVP_DEADLINE_OPTIONS = [
  '1 hour before',
  '3 hours before',
  '6 hours before',
  '12 hours before',
  '24 hours before',
  'Custom'
];
