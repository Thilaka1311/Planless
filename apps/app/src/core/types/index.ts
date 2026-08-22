// Canonical schema aligning strictly with the user requested Planless database architecture
// Prefixed with Db for Relational Tables, with UI compatibility mappings for React views.

// ---------------------------------------------
// 7 CANONICAL DATABASE TABLES
// ---------------------------------------------

// 1. USERS TABLE
export interface User {
  id?: string;          // UUID primary key (users.id) — used for all FK relationships
  user_id: string;      // Sequential display identifier e.g. "U001" — display only, NOT a FK
  username: string;
  full_name: string;
  phone_number: string;
  password_hash?: string;
  profile_photo?: string;
  profile_url?: string;
  profile_photo_path?: string;
  bio: string;
  college_or_work: string;
  created_at: string; // ISO format
  wallet_balance: number;
  active_status: boolean;
  friends?: number;
}


// 2. CIRCLES TABLE
export interface DbCircle {
  id?: string; // UUID primary key
  circle_id: string;
  name: string;
  description: string;
  category: string;
  created_by: string; // user_id U001 etc.
  cover_image: string;
  location_anchor: string;
  privacy: "public" | "private";
  allow_member_edit?: boolean;
  allow_member_host?: boolean;
  allow_member_invite?: boolean;
  allow_auto_join?: boolean;
  created_at: string;
}

// 3. CIRCLE_MEMBERS TABLE (Relationship table connecting users to circles)
export interface DbCircleMember {
  circle_id: string;
  user_id: string;
  role: "admin" | "member";
  auto_join_enabled?: boolean;
  joined_at: string;
}

// 4. PLANS TABLE (The central focus object of everything in Planless)
export interface DbPlan {
  id: string;
  public_id: string;
  host_id: string;
  discovery_item_id?: string | null;
  discovery_items?: { category: string; subcategory: string | null } | null;
  category?: string;
  subcategory?: string;
  title: string;
  description: string;
  place_id: string;
  place_name: string;
  place_address: string;
  scheduled_at: string;
  rsvp_deadline: string;
  max_participants: number | null;
  total_cost: number;
  status: 'LIVE' | 'COMPLETED' | 'CANCELLED';
  cover_image?: string | null;
  created_at: string;
  updated_at: string;
  circle_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  allow_participant_invites?: boolean;
  participant_filtering?: 'AUTOMATIC' | 'ASSIGNED';
  waitlist_order_mode?: 'AUTO' | 'CUSTOM';
}

// 5. PLAN_PARTICIPANTS TABLE (Attendance & payment status)
export interface DbPlanParticipant {
  id: string;
  plan_id: string;
  user_id: string;
  role: 'HOST' | 'PARTICIPANT';
  rsvp_status: 'INVITED' | 'JOINED' | 'SKIPPED' | 'WAITLISTED';
  delivery_status?: 'DELIVERED';
  skip_reason?: 'LEFT' | 'REMOVED' | 'REPLACED' | 'PAYMENT_KEPT' | null;
  responded_at: string | null;
  joined_queue_at?: string;
  assigned_group?: 'GOING' | 'WAITLIST' | null;
  waitlist_position?: number | null;
  cost_per_participant?: number | null;
  circle_id?: string | null;
  leave_requested?: boolean;
  leave_requested_at?: string | null;
}

export enum SystemMessageType {
  PLAN_CREATED = "plan_created",
  PARTICIPANT_JOINED = "participant_joined",
  PARTICIPANT_LEFT = "participant_left",
  TITLE_CHANGED = "title_changed",
  DESCRIPTION_CHANGED = "description_changed",
  DATE_CHANGED = "date_changed",
  TIME_CHANGED = "time_changed",
  VENUE_CHANGED = "venue_changed",
  PLAN_CANCELLED = "plan_cancelled",
  PLAN_RESTORED = "plan_restored",
  PLAN_COMPLETED = "plan_completed",
}

// 5b. PLAN_MESSAGES TABLE (Stores plan chat messages)
export interface DbPlanMessage {
  id: string;
  plan_id: string;
  sender_id: string;
  message_type: 'text' | 'system' | 'poll' | 'cost';
  system_message_type?: SystemMessageType | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
}

export type PlanActivityType =
  | 'plan_created'
  | 'participant_invited'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_waitlisted'
  | 'participant_promoted'
  | 'participant_removed'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'capacity_changed'
  | 'title_changed'
  | 'description_changed'
  | 'date_changed'
  | 'time_changed'
  | 'location_changed'
  | 'host_transferred'
  | 'plan_cancelled'
  | 'plan_restored'
  | 'plan_completed'
  | 'host_promoted'
  | 'participants_swapped'
  | 'participant_added'
  | 'participant_invite_others'
  | 'participant_moved'
  | 'leave_requested';

// 5c. PLAN_ACTIVITY TABLE (Append-only historical audit log)
export interface DbPlanActivity {
  id: string;
  plan_id: string;
  actor_id?: string | null;
  target_user_id?: string | null;
  activity_type: PlanActivityType;
  metadata: Record<string, any>;
  created_at: string;
}

// 6. TRANSACTIONS TABLE (Handles spontaneous social splits/obligations)
export interface DbTransaction {
  id?: string; // UUID primary key
  transaction_id: string;
  public_id?: string;
  sender_id: string | null; // UUID → users.id (or special values: "SYSTEM", "UPI", null)
  receiver_id: string | null; // UUID → users.id (or special values: "SYSTEM", null)
  plan_id: string | null;
  amount: number;
  transaction_type: string; // "split_payment" | "deposit" | "settlement"
  status: "success" | "pending" | "failed";
  timestamp: string;
}

// 7. PLAN MEMORY INFO (Derived from plans + plan_participants — replaces DbMemory/DbMemoryAttendee)
export interface PlanMemoryInfo {
  planId: string;           // plan.dbUuid || plan.id
  memoryType: string;       // derived from category/activity_type
  editableUntil: string;    // far future (Option A for MVP)
  completedAt: string;
  attendeeUserIds: string[]; // plan_participants filtered to rsvp_status === "JOINED"
}

export interface DbPlanOutcome {
  id?: string;
  plan_id: string;
  submitted_by_user_id: string;
  outcome_type: string;
  payload: any;
  created_at?: string;
}

export interface DbMemory {
  id?: string;
  plan_id: string;
  memory_type: 'football' | 'badminton' | 'movies' | 'dining';
  status: string;
  created_at?: string;
  locked_at?: string | null;
  editable_until: string;
}

export interface DbMemoryResult {
  id?: string;
  memory_id: string;
  score_home?: number | null;
  score_away?: number | null;
  mvp_user_id?: string | null;
  average_rating?: number | null;
  review?: string | null;
  created_at?: string;
}

export interface DbFriendship {
  id?: string; // UUID primary key
  user_1_id: string; // UUID -> users.id (lexicographically smaller)
  user_2_id: string; // UUID -> users.id (lexicographically larger)
  requested_by: string; // UUID -> users.id (who sent the request)
  created_from_plan_id?: string | null; // UUID -> plans.id
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at?: string;
  responded_at?: string | null;
}

// 8. PLAN_TEAM_ASSIGNMENTS TABLE (Football Team Organizer)
export interface DbPlanTeamAssignment {
  id?: string;       // UUID primary key
  plan_id: string;   // UUID → plans.id
  user_id: string;   // UUID → users.id
  team: "A" | "B";
  created_at?: string;
}

// ---------------------------------------------
// COMPATIBLE FRONTEND INTERACTIVES VIEW MODELS
// ---------------------------------------------

export type PlanState = "JOINED" | "WAITLISTED" | "SKIPPED" | "INVITED" | "passed" | "unanswered";

export interface PlanMember {
  userId: string;
  userUuid?: string;
  name: string;
  avatar: string;
  role?: 'HOST' | 'PARTICIPANT';
  isHost?: boolean;
  joinState: PlanState;
  reminderState: "sent" | "none";
  joinedAt: string;
  joinedQueueAt?: string;
  waitlistedAt?: string;
  assignedGroup?: 'GOING' | 'WAITLIST' | null;
  waitlistPosition?: number | null;
  skippedAt?: string;
  deliveredAt?: string;
  updatedAt?: string;
  createdAt?: string;
  checkedIn?: boolean;
}

// Backward compatibility alias for UI
export type JoinedUser = PlanMember;

export interface Plan {
  // Strict Backend Contracts
  id: string;
  dbUuid?: string;
  publicId?: string;
  title: string;
  groupId: string | null;
  hostId: string;
  members: PlanMember[];
  capacity?: number;
  date: string;
  time: string;
  location: string;
  paymentAmount: number;
  status: "LIVE" | "COMPLETED" | "CANCELLED" | "PENDING" | "BOOKING_READY" | "CONFIRMED" | "SLOT_UNAVAILABLE";
  datetime?: string;
  createdAt: string;
  waitlistEnabled?: boolean;
  joinLimit?: number;
  participantFiltering?: 'AUTOMATIC' | 'ASSIGNED';
  participant_filtering?: 'AUTOMATIC' | 'ASSIGNED';
  waitlistOrderMode?: 'AUTO' | 'CUSTOM';
  waitlist_order_mode?: 'AUTO' | 'CUSTOM';

  // UI Legacy Properties (Synced with Strict Contracts)
  category: "movies" | "sports" | "restaurants" | "custom";
  cost: number;
  confirmedCount: number;
  maxSpots?: number;
  coverImage: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  joinedUsers: JoinedUser[];
  timeline: "today" | "tomorrow" | "weekend";
  description?: string;
  theatre?: string;
  seatsLeft?: number;
  notes?: string;
  coordinatedSeat?: string;
  userRating?: number;
  userReaction?: string;
  isHappened?: boolean;
  isActive?: boolean;
  reminderNotificationSent?: boolean;
  circleId?: string | null;
  circleName?: string | null;
  isCircleHydrating?: boolean;
  response_cutoff_hours?: number;
  response_deadline_at?: string;
  allowParticipantInvites?: boolean;

  // Sports Plan fields
  sports_type?: "Football" | "Badminton" | "Basketball";
  venue_id?: string;
  venue_cost?: number;
  required_confirmations?: number;
  slot_label?: string;
  skillLevel?: string;
  matchFormat?: string;
  waitlistUsers?: JoinedUser[];
  enteredScore?: string;
  votedMvp?: string;
  mvpVotes?: { name: string; votes: number }[];
  attendanceLogged?: boolean;

  // Restaurant Plan fields
  cuisineType?: string;
  tableAvailability?: string;
  estimatedCost?: string;
  interestedUsers?: JoinedUser[];
  foodReaction?: string;
}

export interface Circle {
  id: string;
  dbUuid?: string;
  name: string;
  membersCount: number;
  avatars: string[];
  groupImage?: string;
  lastSpontaneousActivity: string;
  description: string;
  type: string;
  location: string;
  format: string;
  playersOnField: number;
  timeWindow: string;
  membersList: {
    name: string;
    phone: string;
    avatar: string;
  }[];
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "credit" | "debit";
  timestamp: string;
  settled: boolean;
  status?: string;
  transactionType?: string;
  planTitle?: string | null;
}

export interface NotificationItem {
  id: string;
  type: "PLAN_INVITATION" | "WAITLIST_PROMOTED" | "PLAN_CANCELLED" | "PLAN_UPDATED" | "HOST_TRANSFERRED" | "PARTICIPANT_JOINED" | "PARTICIPANT_SKIPPED" | "invitation" | "urgency" | "payment" | "general" | string;
  title: string;
  body?: string;
  relativeTime: string;
  actionText?: string;
  planId?: string;
  settled?: boolean;
  cost?: number;
  creatorId?: string;
  createdAt?: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  bio: string;
  avatar: string;
  joined: boolean;
  college_or_work?: string;
  user_id?: string;
  dbUuid?: string;
  token?: string;
  profile_completed?: boolean;
  role?: string;
}

export type ActivityType = "Football" | "Badminton" | "Movie" | "Dinner" | "Cafe" | "Pub" | "Sports" | "Movies" | "Dining";

export interface ActivityTimeSlot {
  label: string;
  iso: string;
  locked?: boolean;
}

export interface ActivityVenue {
  id: string;
  name: string;
  costPerPerson: number;
  timeSlots: ActivityTimeSlot[];
  tags: string[];
  distance: string;
  image: string;
  venue_cost: number;
}

export interface ChatMessage {
  id: string;
  circleId: string;
  sender: {
    id: string;
    name: string;
    avatar: string;
  } | null;
  content: string;
  createdAt: string;
  isOwn: boolean;
}

