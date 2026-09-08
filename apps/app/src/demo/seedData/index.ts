import { 
  User, DbPlan, DbPlanParticipant, DbTransaction,
  NotificationItem, UserProfile, Plan, Transaction 
} from "../../core/types";

// Generates an elegant SVG initials avatar with consistent flat-gradient highlights 
// to align with the required 'Opal design philosophy' and prevent random placeholder noise.
export function getInitialsAvatar(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const initials = parts.map(p => p[0]).slice(0, 2).join("").toUpperCase();
  
  // Consistent color selection based on initials hash code
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  // Elegant high contrast desaturated pastel hues
  const bgGradientStart = `hsl(${hue}, 40%, 35%)`;
  const bgGradientEnd = `hsl(${(hue + 45) % 360}, 45%, 22%)`;
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="g_${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradientStart}"/>
        <stop offset="100%" stop-color="${bgGradientEnd}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#g_${initials})"/>
    <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" font-size="34" fill="#f4f4f5" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.03em">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ----------------------------------------------------
// 1. USERS TABLE
// ----------------------------------------------------
export const initialUsers: User[] = [
  {
    user_id: "U001",
    username: "thilak",
    full_name: "VR Thilaka Sundar",
    phone_number: "+91 90002 00001",
    profile_url: getInitialsAvatar("VR Thilaka Sundar"),
    bio: "Always spontaneous, never planless • Looking for movies/football.",
    college_or_work: "SRM Chennai",
    created_at: "2026-05-10T12:00:00Z",
    wallet_balance: 580,
    active_status: true,
  },
  {
    user_id: "U002",
    username: "keval",
    full_name: "Keval",
    phone_number: "+91 90001 00002",
    profile_url: getInitialsAvatar("Keval"),
    bio: "Semi-pro midfielder. Turf organizer on New Bel Road.",
    college_or_work: "MSRIT Bangalore",
    created_at: "2026-05-11T09:15:00Z",
    wallet_balance: 320,
    active_status: true,
  },
  {
    user_id: "U003",
    username: "medhaj",
    full_name: "Medhaj",
    phone_number: "+91 90001 00001",
    profile_url: getInitialsAvatar("Medhaj"),
    bio: "Left winger. Spontaneous plans and strong filter coffee.",
    college_or_work: "PES University",
    created_at: "2026-05-11T14:30:00Z",
    wallet_balance: 450,
    active_status: true,
  },
  {
    user_id: "U004",
    username: "guhan",
    full_name: "Guhan",
    phone_number: "+91 90003 00001",
    profile_url: getInitialsAvatar("Guhan"),
    bio: "Weekend drives & cafe hopper. Glen's critic.",
    college_or_work: "SRM University",
    created_at: "2026-05-12T10:00:00Z",
    wallet_balance: 1200,
    active_status: true,
  },
  {
    user_id: "U005",
    username: "rahul",
    full_name: "Rahul",
    phone_number: "+91 90002 00002",
    profile_url: getInitialsAvatar("Rahul"),
    bio: "Sunset chaser & late night highway drives.",
    college_or_work: "VIT Chennai",
    created_at: "2026-05-12T11:45:00Z",
    wallet_balance: 200,
    active_status: true,
  },
  {
    user_id: "U006",
    username: "sudeshna",
    full_name: "Sudeshna",
    phone_number: "+91 90003 00004",
    profile_url: getInitialsAvatar("Sudeshna"),
    bio: "Loves book cafes, live gigs, and spontaneous street food runs.",
    college_or_work: "Stella Maris College",
    created_at: "2026-05-13T08:00:00Z",
    wallet_balance: 650,
    active_status: true,
  },
  {
    user_id: "U007",
    username: "raghavan",
    full_name: "Raghavan",
    phone_number: "+91 90002 00003",
    profile_url: getInitialsAvatar("Raghavan"),
    bio: "Talk movies and acoustic music.",
    college_or_work: "IIT Madras",
    created_at: "2026-05-13T09:30:00Z",
    wallet_balance: 380,
    active_status: true,
  },
  {
    user_id: "U008",
    username: "pratyush",
    full_name: "Pratyush",
    phone_number: "+91 90002 00004",
    profile_url: getInitialsAvatar("Pratyush"),
    bio: "Design is how it works. Coffee enthusiast.",
    college_or_work: "NID Ahmedabad",
    created_at: "2026-05-13T16:20:00Z",
    wallet_balance: 750,
    active_status: true,
  },
  {
    user_id: "U009",
    username: "neelesh",
    full_name: "Neelesh",
    phone_number: "+91 90002 00005",
    profile_url: getInitialsAvatar("Neelesh"),
    bio: "Always down for spontaneous road trips.",
    college_or_work: "LPU Jalandhar",
    created_at: "2026-05-14T11:00:00Z",
    wallet_balance: 140,
    active_status: true,
  },
  {
    user_id: "U010",
    username: "ravi",
    full_name: "Ravi",
    phone_number: "+91 90003 00003",
    profile_url: getInitialsAvatar("Ravi"),
    bio: "Hot chocolate and indie games.",
    college_or_work: "BITS Pilani",
    created_at: "2026-05-14T15:30:00Z",
    wallet_balance: 500,
    active_status: true,
  },
  {
    user_id: "U011",
    username: "vinod",
    full_name: "Vinod",
    phone_number: "+91 90002 00006",
    profile_url: getInitialsAvatar("Vinod"),
    bio: "Popcorn & cinematography debates.",
    college_or_work: "Satyajit Ray Film Inst",
    created_at: "2026-05-15T12:00:00Z",
    wallet_balance: 300,
    active_status: true,
  },
  {
    user_id: "U012",
    username: "renjith",
    full_name: "Renjith",
    phone_number: "+91 90001 00008",
    profile_url: getInitialsAvatar("Renjith"),
    bio: "Late night drives, old music, football on weekends.",
    college_or_work: "GCE Trivandrum",
    created_at: "2026-05-15T14:00:00Z",
    wallet_balance: 400,
    active_status: true,
  },
  {
    user_id: "U013",
    username: "maanas",
    full_name: "Maanas",
    phone_number: "+91 90004 00004",
    profile_url: getInitialsAvatar("Maanas"),
    bio: "Spontaneous explorer • Always ready for coffee, roadtrips and turf runs.",
    college_or_work: "PES University",
    created_at: "2026-05-16T10:00:00Z",
    wallet_balance: 600,
    active_status: true,
  }
];

// Current Session Profile compatibility wrapper
export const initialUserProfile = {
  user_id: "U001",
  name: "VR Thilaka Sundar",
  phone: "+91 90002 00001",
  bio: "Always spontaneous, never planless • Looking for movies/football.",
  avatar: getInitialsAvatar("VR Thilaka Sundar"),
  joined: true,
  college_or_work: "SRM Chennai",
};

// ----------------------------------------------------
// 2. PLANS TABLE (Central focal point)
// ----------------------------------------------------
export const initialPlans: DbPlan[] = [
  {
    id: "P001",
    public_id: "P000001",
    host_id: "U002",
    category: "SPORTS",
    subcategory: "FOOTBALL",
    title: "Football Tonight",
    description: "Turf Booking on New Bel Road. Format: 7v7, 14 players on field. Arrive by 19:45.",
    place_id: "navkis-turf-001",
    place_name: "New Bel Road Turf Arena",
    place_address: "New BEL Road, Bangalore",
    scheduled_at: "2026-05-23T20:00:00Z",
    rsvp_deadline: "2026-05-23T18:00:00Z",
    max_participants: 14,
    total_cost: 350,
    status: "LIVE",
    created_at: "2026-05-23T10:00:00Z",
    updated_at: "2026-05-23T10:00:00Z"
  },
  {
    id: "P002",
    public_id: "P000002",
    host_id: "U005",
    category: "ENTERTAINMENT",
    subcategory: "ROAD_TRIP",
    title: "Midnight Masala Drive & Sunset",
    description: "Late night drive to Marina Beach breeze point. Spark spontaneous ocean conversations.",
    place_id: "marina-beach-001",
    place_name: "Marina Beach Breeze Point",
    place_address: "Marina Beach, Chennai",
    scheduled_at: "2026-05-23T22:30:00Z",
    rsvp_deadline: "2026-05-23T21:00:00Z",
    max_participants: 9,
    total_cost: 150,
    status: "LIVE",
    created_at: "2026-05-23T12:00:00Z",
    updated_at: "2026-05-23T12:00:00Z"
  },
  {
    id: "P003",
    public_id: "P000003",
    host_id: "U004",
    category: "DINING",
    subcategory: "CAFE",
    title: "Jobis Late Night Waffles",
    description: "Late-night waffle discussions and hot coffee at Glen's.",
    place_id: "glens-bakehouse-001",
    place_name: "Glen's Bakehouse",
    place_address: "New Bel Road, Bangalore",
    scheduled_at: "2026-05-22T23:30:00Z",
    rsvp_deadline: "2026-05-22T22:00:00Z",
    max_participants: 14,
    total_cost: 250,
    status: "COMPLETED",
    created_at: "2022-05-22T15:00:00Z",
    updated_at: "2026-05-23T00:30:00Z"
  },
  {
    id: "P005",
    public_id: "P000005",
    host_id: "U002",
    category: "DINING",
    subcategory: "RESTAURANT",
    title: "The Spice Room",
    description: "Spontaneous North Indian feast! Warm curries and freshly baked garlic naans under outdoor lights.",
    place_id: "spice-room-koramangala",
    place_name: "The Spice Room",
    place_address: "Koramangala, Bangalore",
    scheduled_at: "2026-05-24T20:00:00Z",
    rsvp_deadline: "2026-05-24T18:00:00Z",
    max_participants: 8,
    total_cost: 700,
    status: "LIVE",
    created_at: "2026-05-23T14:00:00Z",
    updated_at: "2026-05-23T14:00:00Z"
  },
  {
    id: "P006",
    public_id: "P000006",
    host_id: "U002",
    category: "SPORTS",
    subcategory: "FOOTBALL",
    title: "Turf Session",
    description: "Friendly match format. Fast paced spontaneous turf session on New Bel Road. Bring a dark jersey.",
    place_id: "navkis-turf-001",
    place_name: "New Bel Road Turf Arena",
    place_address: "New BEL Road, Bangalore",
    scheduled_at: "2026-05-24T18:30:00Z",
    rsvp_deadline: "2026-05-24T16:00:00Z",
    max_participants: 14,
    total_cost: 350,
    status: "LIVE",
    created_at: "2026-05-23T15:00:00Z",
    updated_at: "2026-05-23T15:00:00Z"
  },
  {
    id: "P007",
    public_id: "P000007",
    host_id: "U007",
    category: "MOVIES",
    subcategory: "MOVIE",
    title: "Movie Night",
    description: "Catching the IMAX screening of Dune: Part Two! Grab popcorn and meet us in the lounge early.",
    place_id: "pvr-imax-forum",
    place_name: "PVR IMAX Forum Koramangala",
    place_address: "Forum Mall, Koramangala, Bangalore",
    scheduled_at: "2026-05-23T21:15:00Z",
    rsvp_deadline: "2026-05-23T19:00:00Z",
    max_participants: 8,
    total_cost: 380,
    status: "LIVE",
    created_at: "2026-05-23T16:00:00Z",
    updated_at: "2026-05-23T16:00:00Z"
  },
  {
    id: "P008",
    public_id: "P000008",
    host_id: "U005",
    category: "DINING",
    subcategory: "CAFE",
    title: "Late Night Chai",
    description: "Late night drives call for strong roadside ginger chai. Spontaneous highway catchups.",
    place_id: "tea-joint-hsr",
    place_name: "Tea Joint",
    place_address: "HSR Layout, Bangalore",
    scheduled_at: "2026-05-23T23:45:00Z",
    rsvp_deadline: "2026-05-23T22:00:00Z",
    max_participants: 12,
    total_cost: 0,
    status: "LIVE",
    created_at: "2026-05-23T17:00:00Z",
    updated_at: "2026-05-23T17:00:00Z"
  },
  {
    id: "P009",
    public_id: "P000009",
    host_id: "U001",
    category: "STUDY",
    subcategory: "STUDY_SESSION",
    title: "Library Meetup",
    description: "Spontaneous exam prep sprint. Grabbing coffee afterwards to celebrate surviving midterm weeks.",
    place_id: "srm-central-library",
    place_name: "Central Library, SRM Campus",
    place_address: "SRM University, Kattankulathur",
    scheduled_at: "2026-05-24T10:00:00Z",
    rsvp_deadline: "2026-05-24T08:00:00Z",
    max_participants: 6,
    total_cost: 0,
    status: "LIVE",
    created_at: "2026-05-23T18:00:00Z",
    updated_at: "2026-05-23T18:00:00Z"
  },
  {
    id: "P010",
    public_id: "P000010",
    host_id: "U002",
    category: "DINING",
    subcategory: "RESTAURANT",
    title: "Random Dinner Run",
    description: "Late night biryani cravings require instant midnight Empire runs. Split equally.",
    place_id: "empire-new-bel-road",
    place_name: "Empire Restaurant",
    place_address: "New Bel Road, Bangalore",
    scheduled_at: "2026-05-24T21:00:00Z",
    rsvp_deadline: "2026-05-24T19:00:00Z",
    max_participants: 8,
    total_cost: 450,
    status: "LIVE",
    created_at: "2026-05-23T19:00:00Z",
    updated_at: "2026-05-23T19:00:00Z"
  },
  {
    id: "P011",
    public_id: "P000011",
    host_id: "U003",
    category: "SPORTS",
    subcategory: "FOOTBALL",
    title: "Sunday Football Matchday",
    description: "Spontaneous weekend turf action. Settle format, high energy levels expected.",
    place_id: "hsr-turf-park",
    place_name: "HSR Turf Park",
    place_address: "HSR Layout, Bangalore",
    scheduled_at: "2026-05-25T16:00:00Z",
    rsvp_deadline: "2026-05-25T14:00:00Z",
    max_participants: 14,
    total_cost: 300,
    status: "LIVE",
    created_at: "2026-05-23T20:00:00Z",
    updated_at: "2026-05-23T20:00:00Z"
  },
  {
    id: "P012",
    public_id: "P000012",
    host_id: "U004",
    category: "DINING",
    subcategory: "CAFE",
    title: "Café Meetup",
    description: "Spontaneous filter coffee and study session anchor. Third Wave coffee catchups.",
    place_id: "third-wave-new-bel-road",
    place_name: "Third Wave Coffee",
    place_address: "New Bel Road, Bangalore",
    scheduled_at: "2026-05-24T16:30:00Z",
    rsvp_deadline: "2026-05-24T15:00:00Z",
    max_participants: 10,
    total_cost: 200,
    status: "LIVE",
    created_at: "2026-05-23T21:00:00Z",
    updated_at: "2026-05-23T21:00:00Z"
  },
  {
    id: "P013",
    public_id: "P000013",
    host_id: "U001",
    category: "DINING",
    subcategory: "RESTAURANT",
    title: "Majaa Thindi Breakfast Run",
    description: "Spontaneous breakfast meet! Enjoy delicious idlis, crispy dosas, and strong filter coffee.",
    place_id: "majaa-thindi-vidyaranyapura",
    place_name: "Majaa Thindi",
    place_address: "Vidyaranyapura, Bangalore",
    scheduled_at: "2026-05-28T09:00:00Z",
    rsvp_deadline: "2026-05-28T07:00:00Z",
    max_participants: 10,
    total_cost: 200,
    status: "LIVE",
    created_at: "2026-05-27T18:00:00Z",
    updated_at: "2026-05-27T18:00:00Z"
  }
];
// ----------------------------------------------------
// 5. PLAN_PARTICIPANTS TABLE
// ----------------------------------------------------
export const initialPlanParticipants: DbPlanParticipant[] = [
  // Navkis Matchday P001 attendees (12 members)
  { id: "PP001", plan_id: "P001", user_id: "U002", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T10:05:00Z", created_at: "2026-05-23T10:05:00Z", updated_at: "2026-05-23T10:05:00Z" }, // Keval (Host)
  { id: "PP002", plan_id: "P001", user_id: "U003", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:10:00Z", created_at: "2026-05-23T10:10:00Z", updated_at: "2026-05-23T10:10:00Z" }, // Medhaj
  { id: "PP003", plan_id: "P001", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T10:15:00Z", updated_at: "2026-05-23T10:15:00Z" }, // Thilaka
  { id: "PP004", plan_id: "P001", user_id: "U012", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:20:00Z", created_at: "2026-05-23T10:20:00Z", updated_at: "2026-05-23T10:20:00Z" }, // Renjith
  { id: "PP005", plan_id: "P001", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:25:00Z", created_at: "2026-05-23T10:25:00Z", updated_at: "2026-05-23T10:25:00Z" }, // Guhan
  { id: "PP006", plan_id: "P001", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:30:00Z", created_at: "2026-05-23T10:30:00Z", updated_at: "2026-05-23T10:30:00Z" }, // Rahul
  { id: "PP007", plan_id: "P001", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:35:00Z", created_at: "2026-05-23T10:35:00Z", updated_at: "2026-05-23T10:35:00Z" }, // Sudeshna
  { id: "PP008", plan_id: "P001", user_id: "U007", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:40:00Z", created_at: "2026-05-23T10:40:00Z", updated_at: "2026-05-23T10:40:00Z" }, // Raghavan
  { id: "PP009", plan_id: "P001", user_id: "U008", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:45:00Z", created_at: "2026-05-23T10:45:00Z", updated_at: "2026-05-23T10:45:00Z" }, // Pratyush
  { id: "PP010", plan_id: "P001", user_id: "U009", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:50:00Z", created_at: "2026-05-23T10:50:00Z", updated_at: "2026-05-23T10:50:00Z" }, // Neelesh
  { id: "PP011", plan_id: "P001", user_id: "U010", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T10:55:00Z", created_at: "2026-05-23T10:55:00Z", updated_at: "2026-05-23T10:55:00Z" }, // Ravi
  { id: "PP012", plan_id: "P001", user_id: "U011", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T11:00:00Z", created_at: "2026-05-23T11:00:00Z", updated_at: "2026-05-23T11:00:00Z" }, // Vinod

  // Midnight Masala P002 attendees
  { id: "PP101", plan_id: "P002", user_id: "U005", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T12:05:00Z", created_at: "2026-05-23T12:05:00Z", updated_at: "2026-05-23T12:05:00Z" }, // Rahul (Host)
  { id: "PP102", plan_id: "P002", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T12:10:00Z", updated_at: "2026-05-23T12:10:00Z" }, // Thilaka
  { id: "PP103", plan_id: "P002", user_id: "U007", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T12:12:00Z", created_at: "2026-05-23T12:12:00Z", updated_at: "2026-05-23T12:12:00Z" }, // Raghavan
  { id: "PP104", plan_id: "P002", user_id: "U008", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T12:15:00Z", created_at: "2026-05-23T12:15:00Z", updated_at: "2026-05-23T12:15:00Z" }, // Pratyush
  { id: "PP105", plan_id: "P002", user_id: "U009", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T12:20:00Z", created_at: "2026-05-23T12:20:00Z", updated_at: "2026-05-23T12:20:00Z" }, // Neelesh

  // Jobis P003 attendees
  { id: "PP201", plan_id: "P003", user_id: "U004", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-22T15:10:00Z", created_at: "2026-05-22T15:10:00Z", updated_at: "2026-05-22T15:10:00Z" }, // Guhan (Host)
  { id: "PP202", plan_id: "P003", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-22T15:15:00Z", updated_at: "2026-05-22T15:15:00Z" }, // Thilaka (You)
  { id: "PP203", plan_id: "P003", user_id: "U010", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-22T15:20:00Z", created_at: "2026-05-22T15:20:00Z", updated_at: "2026-05-22T15:20:00Z" }, // Ravi
  { id: "PP204", plan_id: "P003", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-22T15:25:00Z", created_at: "2026-05-22T15:25:00Z", updated_at: "2026-05-22T15:25:00Z" }, // Sudeshna

  // The Spice Room P005 attendees
  { id: "PP401", plan_id: "P005", user_id: "U002", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T14:05:00Z", created_at: "2026-05-23T14:05:00Z", updated_at: "2026-05-23T14:05:00Z" }, // Keval (Host)
  { id: "PP402", plan_id: "P005", user_id: "U003", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T14:10:00Z", created_at: "2026-05-23T14:10:00Z", updated_at: "2026-05-23T14:10:00Z" }, // Medhaj
  { id: "PP403", plan_id: "P005", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T14:15:00Z", created_at: "2026-05-23T14:15:00Z", updated_at: "2026-05-23T14:15:00Z" }, // Guhan
  { id: "PP404", plan_id: "P005", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T14:20:00Z", created_at: "2026-05-23T14:20:00Z", updated_at: "2026-05-23T14:20:00Z" }, // Rahul

  // Turf Session P006 attendees (5 players)
  { id: "PP501", plan_id: "P006", user_id: "U002", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T15:05:00Z", created_at: "2026-05-23T15:05:00Z", updated_at: "2026-05-23T15:05:00Z" }, // Keval (Host)
  { id: "PP502", plan_id: "P006", user_id: "U003", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T15:10:00Z", created_at: "2026-05-23T15:10:00Z", updated_at: "2026-05-23T15:10:00Z" }, // Medhaj
  { id: "PP503", plan_id: "P006", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T15:15:00Z", created_at: "2026-05-23T15:15:00Z", updated_at: "2026-05-23T15:15:00Z" }, // Rahul
  { id: "PP504", plan_id: "P006", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T15:20:00Z", created_at: "2026-05-23T15:20:00Z", updated_at: "2026-05-23T15:20:00Z" }, // Guhan
  { id: "PP505", plan_id: "P006", user_id: "U012", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T15:25:00Z", created_at: "2026-05-23T15:25:00Z", updated_at: "2026-05-23T15:25:00Z" }, // Renjith
  { id: "PP506", plan_id: "P006", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T15:30:00Z", updated_at: "2026-05-23T15:30:00Z" }, // Thilaka (Self)

  // IMAX Movie Night P007 attendees (8/8 full!)
  { id: "PP601", plan_id: "P007", user_id: "U007", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T16:05:00Z", created_at: "2026-05-23T16:05:00Z", updated_at: "2026-05-23T16:05:00Z" }, // Raghavan (Host)
  { id: "PP602", plan_id: "P007", user_id: "U002", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:10:00Z", created_at: "2026-05-23T16:10:00Z", updated_at: "2026-05-23T16:10:00Z" }, // Keval
  { id: "PP603", plan_id: "P007", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:15:00Z", created_at: "2026-05-23T16:15:00Z", updated_at: "2026-05-23T16:15:00Z" }, // Rahul
  { id: "PP604", plan_id: "P007", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:20:00Z", created_at: "2026-05-23T16:20:00Z", updated_at: "2026-05-23T16:20:00Z" }, // Guhan
  { id: "PP605", plan_id: "P007", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:25:00Z", created_at: "2026-05-23T16:25:00Z", updated_at: "2026-05-23T16:25:00Z" }, // Sudeshna
  { id: "PP606", plan_id: "P007", user_id: "U011", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:30:00Z", created_at: "2026-05-23T16:30:00Z", updated_at: "2026-05-23T16:30:00Z" }, // Vinod
  { id: "PP607", plan_id: "P007", user_id: "U010", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:35:00Z", created_at: "2026-05-23T16:35:00Z", updated_at: "2026-05-23T16:35:00Z" }, // Ravi
  { id: "PP608", plan_id: "P007", user_id: "U008", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T16:40:00Z", created_at: "2026-05-23T16:40:00Z", updated_at: "2026-05-23T16:40:00Z" }, // Pratyush

  // Late Night Chai Run P008 attendees (4 going)
  { id: "PP701", plan_id: "P008", user_id: "U005", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T17:05:00Z", created_at: "2026-05-23T17:05:00Z", updated_at: "2026-05-23T17:05:00Z" }, // Rahul (Host)
  { id: "PP702", plan_id: "P008", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T17:10:00Z", created_at: "2026-05-23T17:10:00Z", updated_at: "2026-05-23T17:10:00Z" }, // Guhan
  { id: "PP703", plan_id: "P008", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T17:15:00Z", updated_at: "2026-05-23T17:15:00Z" }, // Thilaka (Self)
  { id: "PP704", plan_id: "P008", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T17:20:00Z", created_at: "2026-05-23T17:20:00Z", updated_at: "2026-05-23T17:20:00Z" }, // Sudeshna

  // SRM Library Grind P009 attendees (3 going)
  { id: "PP801", plan_id: "P009", user_id: "U001", role: "HOST",        rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T18:05:00Z", updated_at: "2026-05-23T18:05:00Z" }, // Thilaka (Host / Self)
  { id: "PP802", plan_id: "P009", user_id: "U003", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T18:10:00Z", created_at: "2026-05-23T18:10:00Z", updated_at: "2026-05-23T18:10:00Z" }, // Medhaj
  { id: "PP803", plan_id: "P009", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T18:15:00Z", created_at: "2026-05-23T18:15:00Z", updated_at: "2026-05-23T18:15:00Z" }, // Guhan

  // Random Dinner Run P010 attendees (4 going)
  { id: "PP901", plan_id: "P010", user_id: "U002", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T19:05:00Z", created_at: "2026-05-23T19:05:00Z", updated_at: "2026-05-23T19:05:00Z" }, // Keval (Host)
  { id: "PP902", plan_id: "P010", user_id: "U003", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T19:10:00Z", created_at: "2026-05-23T19:10:00Z", updated_at: "2026-05-23T19:10:00Z" }, // Medhaj
  { id: "PP903", plan_id: "P010", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T19:15:00Z", created_at: "2026-05-23T19:15:00Z", updated_at: "2026-05-23T19:15:00Z" }, // Guhan
  { id: "PP904", plan_id: "P010", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T19:20:00Z", updated_at: "2026-05-23T19:20:00Z" }, // Thilaka (Self)

  // Sunday Football P011 attendees (10 going)
  { id: "PPa01", plan_id: "P011", user_id: "U003", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T20:05:00Z", created_at: "2026-05-23T20:05:00Z", updated_at: "2026-05-23T20:05:00Z" }, // Medhaj (Host)
  { id: "PPa02", plan_id: "P011", user_id: "U002", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:10:00Z", created_at: "2026-05-23T20:10:00Z", updated_at: "2026-05-23T20:10:00Z" }, // Keval
  { id: "PPa03", plan_id: "P011", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:15:00Z", created_at: "2026-05-23T20:15:00Z", updated_at: "2026-05-23T20:15:00Z" }, // Rahul
  { id: "PPa04", plan_id: "P011", user_id: "U004", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:20:00Z", created_at: "2026-05-23T20:20:00Z", updated_at: "2026-05-23T20:20:00Z" }, // Guhan
  { id: "PPa05", plan_id: "P011", user_id: "U012", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:25:00Z", created_at: "2026-05-23T20:25:00Z", updated_at: "2026-05-23T20:25:00Z" }, // Renjith
  { id: "PPa06", plan_id: "P011", user_id: "U011", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:30:00Z", created_at: "2026-05-23T20:30:00Z", updated_at: "2026-05-23T20:30:00Z" }, // Vinod
  { id: "PPa07", plan_id: "P011", user_id: "U010", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:35:00Z", created_at: "2026-05-23T20:35:00Z", updated_at: "2026-05-23T20:35:00Z" }, // Ravi
  { id: "PPa08", plan_id: "P011", user_id: "U008", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:40:00Z", created_at: "2026-05-23T20:40:00Z", updated_at: "2026-05-23T20:40:00Z" }, // Pratyush
  { id: "PPa09", plan_id: "P011", user_id: "U009", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:45:00Z", created_at: "2026-05-23T20:45:00Z", updated_at: "2026-05-23T20:45:00Z" }, // Neelesh
  { id: "PPa10", plan_id: "P011", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T20:50:00Z", created_at: "2026-05-23T20:50:00Z", updated_at: "2026-05-23T20:50:00Z" }, // Sudeshna
  { id: "PPa11", plan_id: "P011", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T20:55:00Z", updated_at: "2026-05-23T20:55:00Z" }, // Thilaka (Self)

  // Third Wave Cafe Meetup P012 attendees (5 going)
  { id: "PPb01", plan_id: "P012", user_id: "U004", role: "HOST",        rsvp_status: "JOINED",  responded_at: "2026-05-23T21:05:00Z", created_at: "2026-05-23T21:05:00Z", updated_at: "2026-05-23T21:05:00Z" }, // Guhan (Host)
  { id: "PPb02", plan_id: "P012", user_id: "U001", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-23T21:10:00Z", updated_at: "2026-05-23T21:10:00Z" }, // Thilaka (Self)
  { id: "PPb03", plan_id: "P012", user_id: "U010", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T21:15:00Z", created_at: "2026-05-23T21:15:00Z", updated_at: "2026-05-23T21:15:00Z" }, // Ravi
  { id: "PPb04", plan_id: "P012", user_id: "U006", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T21:20:00Z", created_at: "2026-05-23T21:20:00Z", updated_at: "2026-05-23T21:20:00Z" }, // Sudeshna
  { id: "PPb05", plan_id: "P012", user_id: "U011", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-23T21:25:00Z", created_at: "2026-05-23T21:25:00Z", updated_at: "2026-05-23T21:25:00Z" }, // Vinod

  // Majaa Thindi Breakfast Run P013 attendees
  { id: "PPc01", plan_id: "P013", user_id: "U001", role: "HOST",        rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-27T18:05:00Z", updated_at: "2026-05-27T18:05:00Z" }, // Thilaka (Host)
  { id: "PPc02", plan_id: "P013", user_id: "U012", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-27T18:10:00Z", created_at: "2026-05-27T18:10:00Z", updated_at: "2026-05-27T18:10:00Z" }, // Renjith
  { id: "PPc03", plan_id: "P013", user_id: "U005", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-27T18:15:00Z", created_at: "2026-05-27T18:15:00Z", updated_at: "2026-05-27T18:15:00Z" }, // Rahul
  { id: "PPc04", plan_id: "P013", user_id: "U011", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-27T18:20:00Z", created_at: "2026-05-27T18:20:00Z", updated_at: "2026-05-27T18:20:00Z" }, // Vinod
  { id: "PPc05", plan_id: "P013", user_id: "U009", role: "PARTICIPANT", rsvp_status: "JOINED",  responded_at: "2026-05-27T18:25:00Z", created_at: "2026-05-27T18:25:00Z", updated_at: "2026-05-27T18:25:00Z" }, // Neelesh
  { id: "PPc06", plan_id: "P013", user_id: "U007", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-27T18:30:00Z", updated_at: "2026-05-27T18:30:00Z" }, // Raghavan (not accepted)
  { id: "PPc07", plan_id: "P013", user_id: "U008", role: "PARTICIPANT", rsvp_status: "INVITED", responded_at: null,                   created_at: "2026-05-27T18:35:00Z", updated_at: "2026-05-27T18:35:00Z" }  // Pratyush (not accepted)
];

// ----------------------------------------------------
// 6. TRANSACTIONS TABLE
// ----------------------------------------------------
export const initialTransactions: DbTransaction[] = [
  {
    transaction_id: "T001",
    sender_id: "SYSTEM",
    receiver_id: "U001",
    plan_id: null,
    amount: 1000,
    transaction_type: "deposit",
    status: "success",
    timestamp: "May 23, 2026"
  },
  {
    transaction_id: "T002",
    sender_id: "U001",
    receiver_id: "U004", // paid Guhan
    plan_id: "P003",
    amount: 250,
    transaction_type: "split_payment",
    status: "success",
    timestamp: "May 23, 2026"
  },
  {
    transaction_id: "T003",
    sender_id: "U001",
    receiver_id: "U002", // booked Keval's 7v7 slot
    plan_id: "P001",
    amount: 350,
    transaction_type: "split_payment",
    status: "success",
    timestamp: "May 22, 2026"
  }
];



// Auxiliary Mock notifications for the tray
export const initialNotifications: NotificationItem[] = [
  {
    id: "n1",
    type: "invitation",
    title: "Keval invited you to Navkis Matchday 7v7",
    relativeTime: "1m",
    actionText: "Accept & Join",
    planId: "P001"
  },
  {
    id: "n2",
    type: "urgency",
    title: "Midnight Masala is filling up - 3 SPOTS LEFT",
    relativeTime: "12m",
    planId: "P002"
  },
  {
    id: "n3",
    type: "urgency",
    title: "Navkis kickoff is in 1 hour - ARRIVE BY 19:45",
    relativeTime: "30m",
    planId: "P001"
  },
  {
    id: "n4",
    type: "payment",
    title: "You owe Guhan ₹250 for waffles - TAP TO SETTLE",
    relativeTime: "2h",
    actionText: "Instant Settle",
    planId: "P003",
    cost: 250,
    settled: false
  },
  {
    id: "n5",
    type: "general",
    title: "Guhan created a new meetup thread: Jobis",
    relativeTime: "1d"
  }
];
