import defaultPlanCover from "../../../assets/planimagedefault.png";

export const CATEGORY_EMOJI: Record<string, string> = {
  sports: "⚽",
  movies: "🎬",
  dining: "🍝",
  custom: "✨",
};

export const getCategoryImage = (cat: string, sub: string | null): string => {
  if (cat === 'sports') {
    switch (sub) {
      case 'football': return "/assets/plan-covers/football.png";
      case 'badminton': return "/assets/plan-covers/badminton.png";
      default: return "/assets/plan-covers/football.png";
    }
  }
  if (cat === 'movies') return "/assets/plan-covers/movie.png";
  if (cat === 'dining') return "/assets/plan-covers/dining.png";
  return defaultPlanCover;
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
