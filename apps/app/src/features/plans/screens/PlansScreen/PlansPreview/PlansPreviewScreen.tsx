import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit,
  Crown,
  Trash,
  Clock,
  Hourglass,
  MapPin,
  IndianRupee,
  ArrowLeft,
  UtensilsCrossed,
  Compass,
  Film,
  CalendarDays,
  ChevronDown,
  Check
} from "lucide-react";
import { UserProfile, Plan } from "../../../../../core/types";
import { usePlansStore } from "../../../state/PlansContext";
import { useLivePlan } from "../../../hooks/useLivePlan";
import { useToast } from "../../../../../shared/contexts/ToastContext";
import { supabase } from "../../../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../../../lib/participantStatus";
import { getPlanCover } from "../../../config/planCoverImages";
import { formatPlanDate } from "../../../../../../lib/mappers";
import { UserAvatar } from "../../../../../IMGfromDB/UserAvatar";
import { CostBreakdownPopover } from "../../../components/CostBreakdownPopover";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import TeamOrganizerModal from "../../../../../shared/modals/TeamOrganizerModal";
import PlanCompletionModal from "../../../../../shared/modals/PlanCompletionModal";
import { ParticipantToggleBar } from "../../../../home/components/PlanDetailsCard";
import { useLiveCountdown, formatDeadlineFull, rsvpUrgencyStyles } from "../../../../home/components/PlanCard";
import { useRSVPDeadline } from "../../../utils/rsvpFormatter";
import { HeroHeader } from "../../../components/HeroHeader";
import { HeroMetadataCard } from "../../../components/HeroMetadataCard";
import { useGooglePlacesAutocomplete } from "../../../../../shared/hooks/useGooglePlacesAutocomplete";
import { PlanParticipantManagementWrapper } from "./PlanParticipantManagementWrapper";
import { InlineParticipantView } from "../../../components/InlineParticipantView";
import { PlanSettingsScreen } from "./PlanSettingsScreen";
import { RSVPCard } from "../../../components/RSVPCard";
import {
  LeavePlanBottomSheet,
  CancelPlanBottomSheet,
  RestorePlanBottomSheet,
  EditDateTimeBottomSheet,
  EditCostBottomSheet,
  EditDetailsBottomSheet,
} from "../../../components/BottomSheets";

// ==========================================
// UTILITIES & CONSTANTS
// ==========================================
const getPlanDescription = (plan: Plan) => {
  const category = plan.category?.toLowerCase();
  const subcategory = (plan as any).subcategory?.toLowerCase();
  if (category === 'sports') {
    if (subcategory === 'badminton') {
      return 'Spontaneous 2v2 badminton sessions. Intermediate level. Bring your own rackets; shuttlecocks are provided. Play Arena booked for 2 hours.';
    }
    return 'Weekend casual sports match. Friendly rotation, clean play, and high energy. Quick rotation, clean tackles. Water provided.';
  }
  if (category === 'movies') {
    return 'Late-night high-framerate action in IMAX. Pre-booking seat rows F–H. Grab some popcorn, check in 15 mins early.';
  }
  if (category === 'dining') {
    return 'Secret speakeasy crawl or dining hangout with a live modern jazz quartet. Strict classy dress code. Good spirits, great company.';
  }
  return plan.description || 'A spontaneous, tightly coordinated hangout with friends and family. Quick response required for booking slots.';
};

export function hasUserEnteredDescription(plan: any): boolean {
  if (!plan) return false;
  const desc = (plan.description || "").trim();
  if (desc.length === 0) return false;
  if (
    desc.startsWith("Spontaneous coordination thread for") ||
    desc.startsWith("Coordination thread:")
  ) {
    return false;
  }
  const lowerDesc = desc.toLowerCase();
  if (
    lowerDesc.includes("spontaneous 2v2 badminton sessions") ||
    lowerDesc.includes("spontaneous 2v2 badminton session") ||
    lowerDesc.includes("weekly 5v5 turf action") ||
    lowerDesc.includes("watching the sci-fi premier together") ||
    lowerDesc.includes("watching the sci-fi premiere together") ||
    lowerDesc.includes("secret basement speakeasy crawl") ||
    lowerDesc.includes("weekend casual sports match") ||
    lowerDesc.includes("late-night high-framerate action in imax") ||
    lowerDesc.includes("secret speakeasy crawl or dining hangout") ||
    lowerDesc.includes("a spontaneous, tightly coordinated hangout") ||
    lowerDesc.includes("spontaneous squad gathering. casual chit-chat and good food")
  ) {
    return false;
  }
  return true;
}

function PlanCategoryIcon({ plan }: { plan: any }) {
  const category = (plan.category || '').toLowerCase();
  if (category === 'movies' || category === 'cinema') {
    return <Film className="w-3 h-3 text-violet-400" strokeWidth={2} />;
  }
  if (category === 'dining' || category === 'restaurants' || category === 'restaurant' || category === 'cafe') {
    return <UtensilsCrossed className="w-3 h-3 text-rose-400" strokeWidth={2} />;
  }
  if (category === 'sports' || category === 'football' || category === 'badminton') {
    return <Compass className="w-3 h-3 text-emerald-400" strokeWidth={2} />;
  }
  return <CalendarDays className="w-3 h-3 text-zinc-400" strokeWidth={2} />;
}

// ==========================================
// SUB-COMPONENTS — PARTICIPANTS SECTION
// ==========================================
interface ParticipantsSectionProps {
  plan: Plan;
  userProfile: UserProfile;
  activeUserId?: string;
  onOpenParticipants: () => void;
}

export function ParticipantsSection({
  plan,
  userProfile,
  activeUserId,
  onOpenParticipants,
}: ParticipantsSectionProps) {
  const members = plan.members || [];
  const currentUserId = userProfile.dbUuid || activeUserId;

  const mapMemberName = (m: any) => {
    const mId = m.userId || m.userUuid || m.user_id || m.id;
    if (currentUserId && mId === currentUserId) {
      return { ...m, name: "You" };
    }
    return m;
  };

  // Group members with Current User first, then Hosts (A-Z), then Participants (A-Z)
  const hostId = plan.hostId;
  const sortAlpha = (list: any[]) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const prioritizeUserAndSort = (list: any[]) => {
    const currentUser = list.find(m => {
      const mId = m.userId || m.userUuid || m.user_id || m.id;
      return m.name === "You" || (currentUserId && mId === currentUserId);
    });
    const remaining = list.filter(m => m !== currentUser);
    const isHostCheck = (m: any) => (m.role === 'HOST' || m.isHost === true);
    const hosts = sortAlpha(remaining.filter(isHostCheck));
    const nonHosts = sortAlpha(remaining.filter(m => !isHostCheck(m)));
    return [
      ...(currentUser ? [currentUser] : []),
      ...hosts,
      ...nonHosts,
    ];
  };

  const rawGoingList = members.filter(m => normalizeStatus(m.joinState) === "JOINED").map(mapMemberName);
  const goingList = prioritizeUserAndSort(rawGoingList);

  const waitlistList = members.filter(m => normalizeStatus(m.joinState) === "WAITLISTED").map(mapMemberName);

  const rawInvitedList = members.filter(m => normalizeStatus(m.joinState) === "INVITED").map(mapMemberName);
  const invitedList = prioritizeUserAndSort(rawInvitedList);

  // Sorted list of all participants to show in avatar strip (going first, then waitlist, then invited)
  const sortedForStrip = [...goingList, ...waitlistList, ...invitedList];
  const maxAvatars = 4;
  const visibleAvatars = sortedForStrip.slice(0, maxAvatars);
  const overflowCount = sortedForStrip.length - maxAvatars;

  const maxCapacity = plan.maxSpots || plan.capacity || plan.joinLimit || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);

  return (
    <div
      id="participants_card_trigger"
      onClick={onOpenParticipants}
      className="w-full bg-[#111111] p-5 rounded-3xl border border-white/[0.08] space-y-4 hover:border-white/10 hover:bg-[#151515] transition-all duration-200 cursor-pointer text-left select-none"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-sans font-semibold tracking-wider text-white/60 uppercase">Participants</h3>
        <div className="flex items-center gap-1.5 text-white/60">
          <span className="text-xs font-mono font-medium">{goingList.length} / {maxCapacity}</span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </div>
      </div>

      {/* Overlapping Avatar Strip */}
      <div className="flex items-center">
        <div className="flex -space-x-2.5 overflow-hidden">
          {visibleAvatars.map((member, i) => (
            <div
              key={member.userId || i}
              className="w-8 h-8 rounded-full border-2 border-[#000000] bg-[#111111] overflow-hidden flex-shrink-0 flex items-center justify-center relative"
              style={{ zIndex: maxAvatars - i }}
            >
              <UserAvatar src={member.avatar} alt={member.name} size="w-full h-full" />
            </div>
          ))}
          {overflowCount > 0 && (
            <div
              className="w-8 h-8 rounded-full border-2 border-[#000000] bg-[#1A1A1A] flex items-center justify-center text-[11px] font-sans font-medium text-white/90 z-10 flex-shrink-0"
            >
              +{overflowCount}
            </div>
          )}
        </div>
      </div>

      {/* Compact Status Chips */}
      <div className="flex flex-wrap gap-2 pt-1">
        <div className="bg-emerald-950/20 border border-emerald-500/10 px-3 py-1 rounded-xl flex items-center gap-1.5 text-[11px] font-sans font-medium text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Going {goingList.length}</span>
        </div>
        <div className="bg-amber-950/20 border border-amber-500/10 px-3 py-1 rounded-xl flex items-center gap-1.5 text-[11px] font-sans font-medium text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Waitlist {waitlistList.length}</span>
        </div>
        <div className="bg-[#1A1A1A] border border-white/[0.08] px-3 py-1 rounded-xl flex items-center gap-1.5 text-[11px] font-sans font-medium text-white/60">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          <span>Invited {invitedList.length}</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================
function ActionButtons({
  selectedPlan,
  isParticipant,
  showJoinDirect,
  alreadySkipped,
  isFull,
  isWaitlist,
  isHost,
  isJoiningDirect,
  isRejoining,
  isSkipping,
  showTeams,
  handleJoinDirect,
  handleRejoin,
  handleSkip,
  setShowLeaveConfirm,
  setShowDitchConfirm,
  setShowCompletionFlow,
  setShowManageTeams,
  onClose,
}: {
  selectedPlan: Plan;
  isParticipant: boolean;
  showJoinDirect: boolean;
  alreadySkipped: boolean;
  isFull: boolean;
  isWaitlist: boolean;
  isHost: boolean;
  isJoiningDirect: boolean;
  isRejoining: boolean;
  isSkipping: boolean;
  showTeams: boolean;
  handleJoinDirect: () => void;
  handleRejoin: () => void;
  handleSkip: () => void;
  setShowLeaveConfirm: (val: boolean) => void;
  setShowDitchConfirm: (val: boolean) => void;
  setShowCompletionFlow: (val: boolean) => void;
  setShowManageTeams: (val: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div>
      {selectedPlan.status === "COMPLETED" ? (
        null
      ) : !isParticipant ? (
        <div id="immersive-actions-dock" className="px-6 pt-3 pb-6 border-t border-white/[0.05] flex flex-col gap-3 z-10 relative mt-4 text-center bg-[#050505]">
          {showJoinDirect && (
            <button
              id="immersive-join-btn"
              type="button"
              onClick={handleJoinDirect}
              disabled={isJoiningDirect || isWaitlist}
              className={`w-full py-4 px-6 rounded-[20px] text-[13px] font-sans font-black tracking-[0.14em] uppercase transition-all duration-200 text-center cursor-pointer border shadow-lg active:scale-[0.98] ${isWaitlist
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25 shadow-amber-500/5 cursor-default'
                : 'bg-[#FF6B2C] text-white hover:bg-[#FF854C] border-[#FF6B2C]/20 shadow-[#FF6B2C]/15 disabled:opacity-40'
                }`}
            >
              {isJoiningDirect ? "Joining…" : (isWaitlist ? "Waitlisted" : (isFull ? "Join Waitlist" : "Join Plan"))}
            </button>
          )}
          {alreadySkipped && (
            <button
              id="immersive-join-btn"
              type="button"
              onClick={handleRejoin}
              disabled={isRejoining}
              className="w-full py-4 px-6 rounded-[20px] text-[13px] font-sans font-black tracking-[0.14em] uppercase transition-all duration-200 text-center cursor-pointer bg-[#FF6B2C] text-white hover:bg-[#FF854C] border border-[#FF6B2C]/20 shadow-lg shadow-[#FF6B2C]/15 active:scale-[0.98] disabled:opacity-40"
            >
              {isRejoining ? "Rejoining…" : (isFull ? "Rejoin Waitlist" : "Rejoin Plan")}
            </button>
          )}
          <button
            id="immersive-skip-btn"
            type="button"
            onClick={handleSkip}
            disabled={isSkipping}
            className="w-full py-1 text-[11px] font-sans font-black tracking-[0.15em] text-[#94A3B8]/60 hover:text-white transition-colors uppercase text-center cursor-pointer active:opacity-70 disabled:opacity-30"
          >
            {isSkipping ? "Skipping…" : "Skip"}
          </button>
        </div>
      ) : (
        <div id="immersive-actions-dock-joined" className="px-6 pt-3 pb-6 border-t border-white/[0.05] flex flex-col gap-3 z-10 relative mt-4 bg-[#050505]">
          {isHost ? (
            <button
              type="button"
              onClick={() => setShowDitchConfirm(true)}
              className="w-full py-3.5 px-6 rounded-[20px] text-[11px] font-sans font-black tracking-[0.12em] text-rose-500/80 hover:text-rose-455 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 transition-all uppercase text-center cursor-pointer"
            >
              Cancel Plan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(true)}
              className="w-full py-3.5 px-6 rounded-[20px] text-[11px] font-sans font-black tracking-[0.12em] text-rose-500/80 hover:text-rose-455 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 transition-all uppercase text-center cursor-pointer"
            >
              Leave Plan
            </button>
          )}
          {isHost && selectedPlan.status === "LIVE" && (
            <button
              id="immersive-complete-plan-btn"
              type="button"
              onClick={() => setShowCompletionFlow(true)}
              className="w-full py-3.5 rounded-[20px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-[11px] font-mono font-bold uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer text-center shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            >
              Complete Plan
            </button>
          )}
          {showTeams && (
            <button
              type="button"
              onClick={() => setShowManageTeams(true)}
              className="w-full py-3.5 rounded-[20px] border border-[#ff8b66]/25 bg-[#ff8b66]/5 text-[#ff8b66] hover:bg-[#ff8b66]/10 text-xs font-mono font-bold uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer text-center"
            >
              ⚽ Team Organizer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// INLINE LOCATION EDITOR COMPONENT
// ==========================================
interface SelectedPlaceInfo {
  place_id: string;
  place_name: string;
  place_address: string;
  latitude: number | null;
  longitude: number | null;
}

interface InlineLocationEditorProps {
  isHost: boolean;
  currentLocation: string;
  isEditing: boolean;
  isSaving?: boolean;
  locationQuery: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onStartEditing: () => void;
  onQueryChange: (q: string) => void;
  onSelectPlace: (place: SelectedPlaceInfo) => void;
  onCancel: () => void;
  onRemoveLocation?: () => void;
}

function InlineLocationEditor({
  isHost,
  currentLocation,
  isEditing,
  isSaving = false,
  locationQuery,
  inputRef,
  onStartEditing,
  onQueryChange,
  onSelectPlace,
  onCancel,
  onRemoveLocation,
}: InlineLocationEditorProps) {
  const isPristine = locationQuery === currentLocation;
  const { suggestions, isLoading, clearSuggestions, getPlaceDetails } = useGooglePlacesAutocomplete(
    isPristine ? "" : locationQuery
  );
  const showDropdown = isEditing && !isPristine && (suggestions.length > 0 || (locationQuery.trim().length >= 3 && !isLoading));

  const handleSuggestionSelect = async (s: typeof suggestions[0]) => {
    // Immediately close dropdown and blur input
    clearSuggestions();

    // Try to resolve full place details (lat/lng) from the Places API
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const details = await getPlaceDetails(s.place_id);
      if (details?.geometry?.location) {
        lat = details.geometry.location.lat;
        lng = details.geometry.location.lng;
      }
    } catch {
      // lat/lng resolution is best-effort; proceed without it
    }

    onSelectPlace({
      place_id: s.place_id,
      place_name: s.structured_formatting.main_text,
      place_address: s.structured_formatting.secondary_text || s.description,
      latitude: lat,
      longitude: lng,
    });
  };

  return (
    <div className="relative">
      {/* ── Saving / Loader Mode ── */}
      {isSaving && (
        <div className="flex w-full items-center gap-3 p-1.5 -m-1.5 rounded-xl">
          <MapPin className="w-4.5 h-4.5 text-zinc-500 flex-shrink-0 animate-pulse" />
          <div className="h-3.5 w-36 bg-white/[0.08] rounded animate-pulse" />
        </div>
      )}

      {/* ── Display Row (read mode) ── */}
      {!isEditing && !isSaving && (
        <button
          type="button"
          disabled={!isHost}
          onClick={onStartEditing}
          className="flex w-full items-center gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
        >
          <MapPin className={`w-4.5 h-4.5 flex-shrink-0 ${currentLocation ? "text-red-500" : "text-zinc-500 opacity-60"}`} />
          <span className={`text-[13px] font-semibold leading-none truncate ${currentLocation ? "text-white/95" : "text-white/40"}`}>
            {currentLocation || "Add a location"}
          </span>
        </button>
      )}

      {/* ── Edit Row (input mode) ── */}
      {isEditing && (
        <div className="flex items-center gap-2 p-1.5 -m-1.5">
          <MapPin className="w-4.5 h-4.5 text-red-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={locationQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onCancel();
              }
            }}
            placeholder={currentLocation || "Search for a place…"}
            className="flex-1 bg-transparent text-[13px] font-semibold text-white/95 leading-none placeholder:text-white/30 focus:outline-none min-w-0"
          />
          {currentLocation ? (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onRemoveLocation?.();
              }}
              className="text-zinc-500 hover:text-zinc-300 transition text-xs px-2 cursor-pointer flex-shrink-0"
              aria-label="Remove Location"
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="text-zinc-500 hover:text-zinc-300 transition text-xs px-2 cursor-pointer flex-shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* ── Autocomplete Dropdown ── */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full mt-2 z-50 bg-[#111114]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto"
          >
            {suggestions.length > 0 ? (
              suggestions.map((s, idx) => (
                <button
                  key={s.place_id}
                  type="button"
                  onPointerDown={(e) => {
                    // Use onPointerDown so it fires before the input loses focus
                    e.preventDefault();
                    handleSuggestionSelect(s);
                  }}
                  className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-white/[0.06] active:bg-white/[0.1] transition cursor-pointer ${idx < suggestions.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <span className="text-[13px] font-semibold text-white/95 leading-tight truncate">
                    {s.structured_formatting.main_text}
                  </span>
                  {s.structured_formatting.secondary_text && (
                    <span className="text-[11px] text-zinc-500 leading-tight truncate">
                      {s.structured_formatting.secondary_text}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-[12px] text-zinc-500 text-center">
                {isLoading ? "Searching…" : "No locations found"}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// MAIN DETAILED PLAN SCREEN COMPONENT
// ==========================================
export interface PlansDetailsScreenProps {
  planId: string;
  onClose: () => void;
  userProfile: UserProfile;
  activeUserId?: string;
  onNavigateToCircle?: (circleId: string) => void;
  setShowPaymentSuccess?: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  onLeavePlan?: () => void;
  onPlanCancelled?: (planId: string) => void;
}

export const PlansDetailsScreen: React.FC<PlansDetailsScreenProps> = ({
  planId,
  onClose,
  userProfile,
  activeUserId,
  onNavigateToCircle,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  onLeavePlan,
  onPlanCancelled,
}) => {
  const { showToast } = useToast();
  const {
    dbPlans,
    dbPlanTeamAssignments,
    getTeamAssignments,
    dbPlanParticipants,
    skipPlan,
    leavePlan,
    rejoinPlan,
    joinPlan,
    changePlanHost,
    cancelPlan,
    removeParticipant,
    updatePlanDetails,
    moveParticipantToGoing,
    moveParticipantToWaitlist,
    moveParticipantToInvited,
    addParticipantsToPlan,
    updatePlanSettings,
    promoteParticipantToHost,
    demoteHostToParticipant,
    reorderWaitlist,
    switchToAutomaticWaitlistMode,
    swapParticipants,
    removeAndReplaceWithWaitlist,
  } = usePlansStore();
  const selectedPlan = useLivePlan(planId);

  // States
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  const [isJoiningDirect, setIsJoiningDirect] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showChangeHostList, setShowChangeHostList] = useState(false);
  const [isChangingHost, setIsChangingHost] = useState(false);
  const [showDitchConfirm, setShowDitchConfirm] = useState(false);
  const [isDitching, setIsDitching] = useState(false);

  // Bottom Sheet local editing states
  const [isEditingDateTimeSheetOpen, setIsEditingDateTimeSheetOpen] = useState(false);
  const [tempDate, setTempDate] = useState("");
  const [tempTime, setTempTime] = useState("");
  const [tempRSVPDate, setTempRSVPDate] = useState("");
  const [tempRSVPTime, setTempRSVPTime] = useState("");

  const [isEditingCostSheetOpen, setIsEditingCostSheetOpen] = useState(false);
  const [isCostPopoverOpen, setIsCostPopoverOpen] = useState(false);
  const [editTotalCostInput, setEditTotalCostInput] = useState<string>("");

  const [isEditingDetailsSheetOpen, setIsEditingDetailsSheetOpen] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [tempDescription, setTempDescription] = useState("");
  const [tempCapacity, setTempCapacity] = useState<number | "">("");
  const [tempCoverImage, setTempCoverImage] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const detailsFileInputRef = useRef<HTMLInputElement>(null);

  const [isEditingLocationInline, setIsEditingLocationInline] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const locationInputRef = useRef<HTMLInputElement>(null);

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLocalTimeString = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatDateFriendly = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimeFriendly = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = Number(hours);
    const m = Number(minutes);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayMin = String(m).padStart(2, '0');
    return `${displayHour}:${displayMin} ${ampm}`;
  };

  const handleSaveDateTime = async () => {
    if (!tempDate || !tempTime || !tempRSVPDate || !tempRSVPTime) {
      showToast("Please fill in all date and time fields.");
      return;
    }
    const eventDateTime = new Date(`${tempDate}T${tempTime}`);
    const rsvpDateTime = new Date(`${tempRSVPDate}T${tempRSVPTime}`);
    const now = new Date();

    if (eventDateTime < now) {
      showToast("Event time cannot be in the past.");
      return;
    }

    if (rsvpDateTime > eventDateTime) {
      showToast("RSVP Deadline cannot be after the event start time.");
      return;
    }

    try {
      const updates = {
        scheduled_at: eventDateTime.toISOString(),
        rsvp_deadline: rsvpDateTime.toISOString(),
      };
      await updatePlanDetails(selectedPlan.id, updates);
      showToast("✓ Date & RSVP updated");
      setIsEditingDateTimeSheetOpen(false);
    } catch (err: any) {
      console.error("Failed to update date & time:", err);
      showToast("Unable to update. Please try again.");
    }
  };


  const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSaveDetails = async () => {
    if (!tempTitle.trim()) {
      showToast("Please enter a plan title.");
      return;
    }
    const cap = tempCapacity === "" ? undefined : Number(tempCapacity);
    if (cap !== undefined && (isNaN(cap) || cap < 1)) {
      showToast("Capacity must be at least 1.");
      return;
    }

    setIsSavingDetails(true);
    try {
      let uploadedFileName: string | undefined = undefined;
      if (tempCoverImage && tempCoverImage.startsWith("data:")) {
        const blob = dataURLtoBlob(tempCoverImage);
        const fileName = `${selectedPlan.id}.jpeg`;
        const { error: uploadError } = await supabase.storage
          .from("plan-images")
          .upload(fileName, blob, { contentType: blob.type, upsert: true });
        if (uploadError) throw uploadError;
        uploadedFileName = fileName;
      }

      const updates: any = {
        title: tempTitle.trim(),
        description: tempDescription.trim(),
        max_participants: cap,
      };
      if (uploadedFileName) {
        updates.cover_image = uploadedFileName;
      }

      await updatePlanDetails(selectedPlan.id, updates);
      showToast("✓ Plan details updated");
      setIsEditingDetailsSheetOpen(false);
    } catch (err: any) {
      console.error("Failed to update plan details:", err);
      showToast("Unable to update. Please try again.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleRemoveLocation = async () => {
    setIsEditingLocationInline(false);
    setLocationQuery("");
    setIsSavingLocation(true);
    try {
      const updates = {
        place_id: null,
        place_name: null,
        place_address: null,
        latitude: null,
        longitude: null,
        updated_at: new Date().toISOString(),
      };
      await updatePlanDetails(selectedPlan.id, updates);
      showToast("✓ Location removed");
    } catch (err: any) {
      console.error("Failed to remove location:", err);
      showToast("Unable to remove location. Please try again.");
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleSelectLocationPlace = async (place: SelectedPlaceInfo) => {
    setIsEditingLocationInline(false);
    setLocationQuery("");
    if (locationInputRef.current) locationInputRef.current.blur();
    setIsSavingLocation(true);

    try {
      // Only write real DB columns — no synthetic 'location' column
      const updates: any = {
        place_id: place.place_id,
        place_name: place.place_name,
        place_address: place.place_address,
        updated_at: new Date().toISOString(),
      };
      if (place.latitude !== null) updates.latitude = place.latitude;
      if (place.longitude !== null) updates.longitude = place.longitude;

      await updatePlanDetails(selectedPlan.id, updates);
      showToast("✓ Location updated");
    } catch (err: any) {
      console.error("Failed to update location:", err);
      showToast("Unable to update. Please try again.");
    } finally {
      setIsSavingLocation(false);
    }
  };
  const [selectedNewHost, setSelectedNewHost] = useState<{ userId: string; name: string } | null>(null);
  const [showManageTeams, setShowManageTeams] = useState(false);
  const [userToRemove, setUserToRemove] = useState<{ userId: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedParticipantForActions, setSelectedParticipantForActions] = useState<any | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showParticipantManagement, setShowParticipantManagement] = useState(false);

  useEffect(() => {
    if (planId && sessionStorage.getItem('expand_participants_once') === planId) {
      setIsExpanded(true);
      sessionStorage.removeItem('expand_participants_once');
      setTimeout(() => {
        const toggleBar = document.getElementById("immersive-description-block")?.nextElementSibling;
        if (toggleBar) {
          toggleBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);
    }
  }, [planId]);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCompletionFlow, setShowCompletionFlow] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showLeavePlanConfirm, setShowLeavePlanConfirm] = useState(false);
  const [showCancelPlanConfirm, setShowCancelPlanConfirm] = useState(false);
  const [showRestorePlanConfirm, setShowRestorePlanConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPlanSettingsScreen, setShowPlanSettingsScreen] = useState(false);
  const rsvp = useRSVPDeadline(selectedPlan?.response_deadline_at);
  const urgencyColor = rsvp.color;

  const planUuid = selectedPlan ? ((selectedPlan as any).dbUuid || selectedPlan.id) : "";
  const resolvedUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  const myParticipantRecord = useMemo(() => {
    if (!selectedPlan) return undefined;
    const userIds = new Set<string>();
    if (resolvedUserUuid) userIds.add(resolvedUserUuid);
    if (activeUserId) userIds.add(activeUserId);
    if (userProfile?.dbUuid) userIds.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) userIds.add((userProfile as any).id);
    if (userProfile?.user_id) userIds.add(userProfile.user_id);

    return dbPlanParticipants.find(
      pp => (pp.plan_id === planUuid || (selectedPlan.id && pp.plan_id === selectedPlan.id)) && userIds.has(pp.user_id)
    );
  }, [dbPlanParticipants, selectedPlan, planUuid, activeUserId, resolvedUserUuid, userProfile]);

  const isHost = myParticipantRecord
    ? (myParticipantRecord.role === "HOST")
    : (selectedPlan?.members ? selectedPlan.members.some(m => (m.userId === resolvedUserUuid || m.userUuid === resolvedUserUuid) && m.isHost) : false);

  const isCancelled = Boolean((selectedPlan?.status || "").toUpperCase() === "CANCELLED");

  const isCreatorHost = isHost;

  const allHosts = useMemo(() => {
    if (!selectedPlan) return [];
    const members = selectedPlan.members || [];

    const hostMembers = members
      .filter((m) => {
        const isHostRole = (m as any).role === "HOST" || m.isHost === true;
        const status = normalizeStatus(m.joinState);
        return isHostRole && status === "JOINED";
      })
      .map((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const isCurrentUser = Boolean(resolvedUserUuid && mId === resolvedUserUuid);
        return {
          id: mId,
          name: isCurrentUser ? "You" : (m.name || "Host"),
          avatar: m.avatar || "",
        };
      });

    const sortAlpha = (list: typeof hostMembers) =>
      [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

    const currentUserHost = hostMembers.find(h => h.name === "You" || (resolvedUserUuid && h.id === resolvedUserUuid));
    const remainingHosts = sortAlpha(hostMembers.filter(h => h !== currentUserHost));

    return [
      ...(currentUserHost ? [currentUserHost] : []),
      ...remainingHosts,
    ];
  }, [selectedPlan, resolvedUserUuid]);

  const participantManagementMode = isHost
    ? "host"
    : selectedPlan?.allowParticipantInvites
      ? "invite_only"
      : "participant";

  const isParticipant = useMemo(() => {
    return isHost || normalizeStatus(myParticipantRecord?.rsvp_status) === "JOINED";
  }, [isHost, myParticipantRecord?.rsvp_status]);

  const allGoingMembers = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.members.filter(m => m.joinState === "JOINED");
  }, [selectedPlan]);

  const planAssignments = useMemo(() => {
    return dbPlanTeamAssignments.filter(a => a.plan_id === planUuid);
  }, [dbPlanTeamAssignments, planUuid]);

  const teamAMembers = useMemo(() => {
    return allGoingMembers.filter(m => {
      const a = planAssignments.find(pa => pa.user_id === (m.userUuid || m.userId));
      return a?.team === "A";
    });
  }, [allGoingMembers, planAssignments]);

  const teamBMembers = useMemo(() => {
    return allGoingMembers.filter(m => {
      const a = planAssignments.find(pa => pa.user_id === (m.userUuid || m.userId));
      return a?.team === "B";
    });
  }, [allGoingMembers, planAssignments]);

  const unassignedMembers = useMemo(() => {
    return allGoingMembers.filter(m => {
      const a = planAssignments.find(pa => pa.user_id === (m.userUuid || m.userId));
      return !a;
    });
  }, [allGoingMembers, planAssignments]);

  const isFull = useMemo(() => {
    if (!selectedPlan) return false;
    const limit = selectedPlan.joinLimit || selectedPlan.capacity || 0;
    const acceptedCount = selectedPlan.members.filter(m => m.joinState === "JOINED").length;
    return limit > 0 && acceptedCount >= limit && selectedPlan.waitlistEnabled;
  }, [selectedPlan]);

  const alreadySkipped = normalizeStatus(myParticipantRecord?.rsvp_status) === "SKIPPED";

  const eligibleParticipants = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.members.filter(
      m =>
        m.userId !== activeUserId &&
        m.userId !== userProfile.dbUuid &&
        (m.joinState === "JOINED" || m.joinState === "WAITLISTED")
    );
  }, [selectedPlan, activeUserId, userProfile.dbUuid]);

  const responseDeadlineText = useMemo(() => {
    if (!selectedPlan) return "No deadline";
    return selectedPlan.response_deadline_at
      ? new Date(selectedPlan.response_deadline_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      : "No deadline";
  }, [selectedPlan]);

  const rawDbPlan = useMemo(() => {
    return dbPlans.find(p => p.id === planUuid);
  }, [dbPlans, planUuid]);

  const hasCost = rawDbPlan ? (rawDbPlan.total_cost !== undefined && rawDbPlan.total_cost !== null && Number(rawDbPlan.total_cost) > 0) : false;
  const costText = useMemo(() => {
    if (!rawDbPlan || !hasCost) return "Free";
    const totalCostVal = Number(rawDbPlan.total_cost || 0);
    const maxCapacity = Number(rawDbPlan.max_participants || 0);
    if (totalCostVal <= 0 || maxCapacity <= 0) return "Free";
    const perPerson = Math.round((totalCostVal / maxCapacity) * 100) / 100;
    return `₹${perPerson} / person`;
  }, [rawDbPlan, hasCost]);

  const currentStatus = normalizeStatus(myParticipantRecord?.rsvp_status);
  const showJoinDirect = ["INVITED", "WAITLISTED", "new"].includes(currentStatus);
  const isWaitlist = currentStatus === "WAITLISTED";

  const showTeams = useMemo(() => {
    if (!selectedPlan) return false;
    const isFootball = (selectedPlan as any).subcategory === "football";
    return isFootball && isParticipant;
  }, [selectedPlan, isParticipant]);

  useEffect(() => {
    if (selectedPlan && (selectedPlan as any).subcategory === "football") {
      getTeamAssignments(planUuid);
    }
  }, [planUuid, selectedPlan, getTeamAssignments]);

  const handleSkip = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    setIsSkipping(true);
    try {
      await skipPlan(selectedPlan.id, activeUserId);
      showToast("You left the plan.");
      if (onLeavePlan) {
        onLeavePlan();
      } else {
        onClose();
      }
    } catch (err) {
      showToast("Failed to skip plan");
    } finally {
      setIsSkipping(false);
    }
  }, [selectedPlan, activeUserId, isSkipping, onLeavePlan, onClose, skipPlan, showToast]);

  const handleRejoin = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isRejoining) return;
    setIsRejoining(true);
    try {
      await rejoinPlan(selectedPlan.id, userProfile);
      if (isFull) {
        showToast("Added to Waitlist");
        if (setShowWaitlistSuccess) {
          setShowWaitlistSuccess(selectedPlan.id);
        }
      } else {
        showToast((selectedPlan as any).payment_required ? "Plan joined (mock checkout)" : "Plan joined");
        if (setShowPaymentSuccess) {
          setShowPaymentSuccess(selectedPlan.id);
        }
      }
      onClose();
    } catch (err) {
      showToast("Failed to join plan");
    } finally {
      setIsRejoining(false);
    }
  }, [selectedPlan, activeUserId, isRejoining, userProfile, isFull, rejoinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose, showToast]);

  const handleJoinDirect = useCallback(async () => {
    if (!selectedPlan || isJoiningDirect) return;
    setIsJoiningDirect(true);
    try {
      await joinPlan(selectedPlan.id, userProfile);
      if (isFull) {
        showToast("Added to Waitlist");
        if (setShowWaitlistSuccess) {
          setShowWaitlistSuccess(selectedPlan.id);
        }
      } else {
        showToast((selectedPlan as any).payment_required ? "Joined plan successfully! (mock checkout)" : "Joined plan successfully!");
        if (setShowPaymentSuccess) {
          setShowPaymentSuccess(selectedPlan.id);
        }
      }
      onClose();
    } catch (err) {
      showToast("Failed to join plan");
    } finally {
      setIsJoiningDirect(false);
    }
  }, [selectedPlan, isJoiningDirect, userProfile, isFull, joinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose, showToast]);

  const handleSkipConfirm = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isLeaving) return;
    setIsLeaving(true);
    try {
      await skipPlan(selectedPlan.id, activeUserId);
      showToast("You left the plan.");
      setShowLeaveConfirm(false);
      if (onLeavePlan) {
        onLeavePlan();
      } else {
        onClose();
      }
    } catch (err) {
      showToast("Failed to skip plan");
    } finally {
      setIsLeaving(false);
    }
  }, [selectedPlan, activeUserId, isLeaving, skipPlan, onLeavePlan, onClose, showToast]);

  const handleDitchConfirm = useCallback(async () => {
    if (!selectedPlan || isDitching) return;
    setIsDitching(true);
    try {
      await cancelPlan(selectedPlan.id);
      showToast("Plan cancelled.");
      setShowDitchConfirm(false);
      if (onPlanCancelled) {
        onPlanCancelled(selectedPlan.id);
      } else if (onLeavePlan) {
        onLeavePlan();
      } else {
        onClose();
      }
    } catch (err) {
      showToast("Failed to ditch plan");
    } finally {
      setIsDitching(false);
    }
  }, [selectedPlan, isDitching, cancelPlan, onPlanCancelled, onLeavePlan, onClose, showToast]);

  const handleChangeHostConfirm = useCallback(async () => {
    if (!selectedPlan || !selectedNewHost || isChangingHost || !activeUserId) return;
    setIsChangingHost(true);
    try {
      await changePlanHost(selectedPlan.id, selectedNewHost.userId, activeUserId);
      showToast(`Ownership transferred to ${selectedNewHost.name}`);
      setSelectedNewHost(null);
      setShowChangeHostList(false);
      onClose();
    } catch (err) {
      showToast("Failed to transfer ownership");
    } finally {
      setIsChangingHost(false);
    }
  }, [selectedPlan, selectedNewHost, isChangingHost, activeUserId, changePlanHost, onClose, showToast]);

  const handleRemoveParticipant = useCallback(async (userId: string, name: string) => {
    if (!selectedPlan) return;
    try {
      setIsRemoving(true);
      await removeParticipant(selectedPlan.id, userId);
      showToast(`✓ Removed ${name} from plan`);
      setUserToRemove(null);
    } catch (err: any) {
      showToast(`Error removing: ${err.message || err}`);
    } finally {
      setIsRemoving(false);
    }
  }, [selectedPlan, removeParticipant, showToast]);

  if (!selectedPlan) return null;

  if (showPlanSettingsScreen) {
    return (
      <PlanSettingsScreen
        plan={selectedPlan}
        userProfile={userProfile}
        isCreatorHost={isCreatorHost}
        onBack={() => setShowPlanSettingsScreen(false)}
        onUpdateSettings={async (newSettings) => {
          await updatePlanSettings(selectedPlan.id, newSettings);
        }}
        onUpdatePlanDetails={async (updates) => {
          await updatePlanDetails(selectedPlan.id, updates);
        }}
        onWaitlistModeChange={async (newMode) => {
          if (newMode === 'assigned') {
            await updatePlanDetails(selectedPlan.id, { participant_filtering: 'ASSIGNED' });
          } else {
            // Open Participant Management screen so validation & selection bottom sheet run cleanly
            setShowPlanSettingsScreen(false);
            setShowParticipantManagement(true);
          }
        }}
        onDemoteHost={async (userId) => {
          await demoteHostToParticipant(selectedPlan.id, userId);
        }}
        onRemoveParticipant={async (userId) => {
          await removeParticipant(selectedPlan.id, userId);
        }}
        onPromoteToHost={async (userId) => {
          await promoteParticipantToHost(selectedPlan.id, userId);
        }}
        onEditTitle={async (newTitle) => {
          await updatePlanDetails(selectedPlan.id, { title: newTitle });
        }}
        onEditCoverImage={async (newCoverUrl) => {
          await updatePlanDetails(selectedPlan.id, { cover_image: newCoverUrl });
        }}
        onLeavePlan={async () => {
          try {
            await leavePlan(selectedPlan.id, activeUserId);
            if (onLeavePlan) {
              onLeavePlan();
            } else {
              onClose();
            }
          } catch (err) {
            console.error("Failed to leave plan from PlansPreviewScreen:", err);
            throw err;
          }
        }}
        onCancelPlan={handleDitchConfirm}
      />
    );
  }

  return (
    <motion.div
      id="home_plan_details"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 bg-[#050505] z-[60] flex flex-col h-full overflow-hidden text-left"
    >
      <div id="immersive-plan-scroll-container" className="flex-1 overflow-y-auto scrollbar-none pb-20">
        <div id="immersive-plan-hero-wrapper" className="w-full">
          <div
            id="immersive-plan-hero-container"
            className="relative w-full h-[280px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[2.5rem] border-b border-white/10"
          >
            {/* Cover Image */}
            <DiscoveryImages
              id="immersive-plan-hero-image"
              src={selectedPlan.coverImage || getPlanCover(selectedPlan.category, (selectedPlan as any).subcategory || (selectedPlan as any).sports_type)}
              category={selectedPlan.category}
              alt={selectedPlan.title}
              className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
            />
            {/* Immersive gradient overlay for bottom readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none z-10" />

            {/* Hero Header component */}
            <HeroHeader
              title={selectedPlan.title}
              creatorName={isHost ? "You" : selectedPlan.creatorName}
              creatorAvatar={isHost ? userProfile.avatar : selectedPlan.creatorAvatar}
              hosts={allHosts}
              viewerId={resolvedUserUuid}
              onClose={onClose}
              isHost={isHost && !isCancelled}
              onOpenSettings={!isCancelled ? () => setShowPlanSettingsScreen(true) : undefined}
            />

            {isEditingLocationInline && (
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => {
                  setIsEditingLocationInline(false);
                  setLocationQuery("");
                  if (locationInputRef.current) locationInputRef.current.blur();
                }}
              />
            )}

            {/* Integrated Glass Details Card Repositioned */}
            <div className={`absolute left-6 right-6 bottom-0 translate-y-1/2 ${isEditingLocationInline ? "z-50 pointer-events-auto" : "z-20"}`}>
              <div className="w-full bg-black/15 backdrop-blur-3xl border border-white/[0.06] shadow-lg rounded-2xl relative">
                <div className="flex flex-col p-4.5 gap-y-3.5 text-left">
                  {/* 1. Date & Time (Row 1) */}
                  <button
                    type="button"
                    disabled={!isHost || isCancelled}
                    onClick={() => {
                      if (isCancelled) return;
                      const planDate = new Date(selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt);
                      const planRSVP = selectedPlan.response_deadline_at ? new Date(selectedPlan.response_deadline_at) : new Date(planDate.getTime() - 12 * 60 * 60 * 1000);
                      setTempDate(getLocalDateString(planDate));
                      setTempTime(getLocalTimeString(planDate));
                      setTempRSVPDate(getLocalDateString(planRSVP));
                      setTempRSVPTime(getLocalTimeString(planRSVP));
                      setIsEditingDateTimeSheetOpen(true);
                    }}
                    className="flex items-center gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <CalendarDays className="w-4.5 h-4.5 text-white/70 flex-shrink-0" />
                    <span className="text-[13px] font-semibold text-white/95 leading-none">
                      {formatPlanDate(selectedPlan.datetime || selectedPlan.createdAt)}
                    </span>
                  </button>

                  {/* 2. Location (Row 2) – inline autocomplete */}
                  <InlineLocationEditor
                    isHost={isHost && !isCancelled}
                    currentLocation={selectedPlan.location || ""}
                    isEditing={isEditingLocationInline}
                    isSaving={isSavingLocation}
                    locationQuery={locationQuery}
                    inputRef={locationInputRef}
                    onStartEditing={() => {
                      if (isHost && !isCancelled) {
                        setLocationQuery(selectedPlan.location || "");
                        setIsEditingLocationInline(true);
                        setTimeout(() => {
                          if (locationInputRef.current) {
                            locationInputRef.current.focus();
                            locationInputRef.current.select();
                          }
                        }, 50);
                      } else if (selectedPlan.location) {
                        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlan.location)}`;
                        window.open(url, "_blank");
                      }
                    }}
                    onQueryChange={setLocationQuery}
                    onSelectPlace={handleSelectLocationPlace}
                    onCancel={() => {
                      setIsEditingLocationInline(false);
                      setLocationQuery("");
                      if (locationInputRef.current) locationInputRef.current.blur();
                    }}
                    onRemoveLocation={handleRemoveLocation}
                  />

                  {/* 3. RSVP & Cost Row (Row 3) */}
                  <div className="flex items-center justify-between text-white/50 text-[11px] font-medium leading-none pt-1">
                    {/* Left part: RSVP */}
                    <button
                      type="button"
                      disabled={!isHost || isCancelled}
                      onClick={() => {
                        if (isCancelled) return;
                        const planDate = new Date(selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt);
                        const planRSVP = selectedPlan.response_deadline_at ? new Date(selectedPlan.response_deadline_at) : new Date(planDate.getTime() - 12 * 60 * 60 * 1000);
                        setTempDate(getLocalDateString(planDate));
                        setTempTime(getLocalTimeString(planDate));
                        setTempRSVPDate(getLocalDateString(planRSVP));
                        setTempRSVPTime(getLocalTimeString(planRSVP));
                        setIsEditingDateTimeSheetOpen(true);
                      }}
                      className="flex items-center gap-2 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent text-left"
                    >
                      <Hourglass className="w-3.5 h-3.5 flex-shrink-0" style={{ color: urgencyColor }} />
                      <span style={{ color: urgencyColor }}>
                        {rsvp.text}
                      </span>
                    </button>

                    {/* Right part: Cost */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsCostPopoverOpen((prev) => !prev)}
                        className="flex items-center gap-2 hover:bg-white/[0.06] active:bg-white/10 transition p-1.5 -m-1.5 rounded-xl cursor-pointer text-right text-white/90 font-semibold"
                      >
                        <span>
                          {hasCost && costText ? costText : "Free"}
                        </span>
                      </button>

                      <CostBreakdownPopover
                        totalCost={rawDbPlan?.total_cost}
                        maxParticipants={rawDbPlan?.max_participants}
                        isOpen={isCostPopoverOpen}
                        onClose={() => setIsCostPopoverOpen(false)}
                        isHost={isHost && !isCancelled}
                        onEditCost={() => {
                          if (isCancelled) return;
                          const currentCost = rawDbPlan?.total_cost;
                          setEditTotalCostInput(currentCost && Number(currentCost) > 0 ? String(currentCost) : "");
                          setIsEditingCostSheetOpen(true);
                        }}
                        position="above"
                        align="right"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="immersive-plan-scroll-content" className="px-6 pt-[80px] space-y-7">
          {selectedPlan && (
            (!isCancelled && (isHost || Boolean(selectedPlan.allowParticipantInvites || (selectedPlan as any).allow_participant_invites))) ? (
              <ParticipantsSection
                plan={selectedPlan}
                userProfile={userProfile}
                activeUserId={activeUserId}
                onOpenParticipants={() => setShowParticipantManagement(true)}
              />
            ) : (
              <InlineParticipantView plan={selectedPlan} activeUserId={activeUserId} />
            )
          )}
          <RSVPCard
            myParticipantRecord={myParticipantRecord}
            isCancelled={isCancelled}
            className={myParticipantRecord?.rsvp_status === "SKIPPED" && myParticipantRecord?.skip_reason === "LEFT" ? "!bottom-24" : ""}
            onClick={
              isHost && isCancelled
                ? () => setShowRestorePlanConfirm(true)
                : isHost
                  ? () => setShowCancelPlanConfirm(true)
                  : myParticipantRecord?.rsvp_status === "JOINED" && !alreadySkipped
                    ? () => setShowLeavePlanConfirm(true)
                    : undefined
            }
          />
          {myParticipantRecord?.rsvp_status === "SKIPPED" && myParticipantRecord?.skip_reason === "LEFT" && (
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black via-black/90 to-transparent z-40">
              <button
                type="button"
                disabled={isRejoining}
                onClick={handleRejoin}
                className="w-full py-4 bg-white hover:bg-zinc-100 active:bg-zinc-200 text-black font-semibold text-[15px] rounded-full transition cursor-pointer shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRejoining ? "Rejoining..." : "Rejoin Plan"}
              </button>
            </div>
          )}
          {hasUserEnteredDescription(selectedPlan) && (
            <div id="immersive-description-block" className="space-y-2 text-left bg-zinc-900/20 p-5 rounded-3xl border border-white/[0.02] select-text">
              <span className="text-[10px] font-sans font-bold tracking-[0.14em] text-zinc-500 uppercase">About</span>
              <p className="text-[13.5px] text-zinc-300 font-sans leading-[1.72]">{selectedPlan.description || getPlanDescription(selectedPlan)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Temporarily hide sticky ActionButtons
      <ActionButtons
        selectedPlan={selectedPlan}
        isParticipant={isParticipant}
        showJoinDirect={showJoinDirect}
        alreadySkipped={alreadySkipped}
        isFull={isFull}
        isWaitlist={isWaitlist}
        isHost={isHost}
        isJoiningDirect={isJoiningDirect}
        isRejoining={isRejoining}
        isSkipping={isSkipping}
        showTeams={showTeams}
        handleJoinDirect={handleJoinDirect}
        handleRejoin={handleRejoin}
        handleSkip={handleSkip}
        setShowLeaveConfirm={setShowLeaveConfirm}
        setShowDitchConfirm={setShowDitchConfirm}
        setShowCompletionFlow={setShowCompletionFlow}
        setShowManageTeams={setShowManageTeams}
        onClose={onClose}
      />
      */}

      {/* ── Participant Management full-screen overlay ── */}
      <AnimatePresence>
        {showParticipantManagement && !isCancelled && (
          <motion.div
            key="participant-management"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-[60] bg-[#000000] flex flex-col"
          >
            <PlanParticipantManagementWrapper
              plan={selectedPlan}
              userProfile={userProfile}
              activeUserId={activeUserId}
              isHost={isHost}
              isCreatorHost={isCreatorHost}
              onBack={() => setShowParticipantManagement(false)}
              onMoveToGoing={(planId, userId, opts) => moveParticipantToGoing(planId, userId, opts)}
              onMoveToWaitlist={(planId, userId) => moveParticipantToWaitlist(planId, userId)}
              onMoveToInvited={(planId, userId) => moveParticipantToInvited(planId, userId)}
              onSwapParticipants={(planId, goingUserId, waitlistUserId) => swapParticipants(planId, goingUserId, waitlistUserId)}
              onRemoveAndReplaceWithWaitlist={(planId, removeId, promoteId) => removeAndReplaceWithWaitlist(planId, removeId, promoteId)}
              onRemoveParticipant={(planId, userId) => removeParticipant(planId, userId)}
              onPromoteToHost={(planId, userId) => promoteParticipantToHost(planId, userId)}
              onDemoteFromHost={(planId, userId) => demoteHostToParticipant(planId, userId)}
              onUpdatePlanCapacity={(planId, capacity) => updatePlanDetails(planId, { max_participants: capacity })}
              onCancelPlan={(planId) => cancelPlan(planId)}
              onAddParticipants={(planId, userIds, circleIds, assignedGroup) => addParticipantsToPlan({
                planId,
                inviteeUuids: userIds,
                userProfile,
                planTitle: selectedPlan?.title || '',
                assignedGroup
              })}
              onReorderWaitlist={(planId, orderedUserUuids) => reorderWaitlist(planId, orderedUserUuids)}
              onSwitchToAutomaticMode={(planId, userIds) => switchToAutomaticWaitlistMode(planId, userIds)}
              onOpenSettings={() => {
                setShowParticipantManagement(false);
                setShowPlanSettingsScreen(true);
              }}
              showWaitlistMode={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showManageTeams && (
        <TeamOrganizerModal
          planId={selectedPlan.id}
          userProfile={userProfile}
          activeUserId={activeUserId}
          onClose={() => setShowManageTeams(false)}
        />
      )}

      <AnimatePresence>
        {showCompletionFlow && (
          <PlanCompletionModal
            plan={selectedPlan}
            onClose={() => setShowCompletionFlow(false)}
            activeUserId={activeUserId || ""}
            onPublish={() => {
              setShowCompletionFlow(false);
              onClose();
            }}
          />
        )}
      </AnimatePresence>

      {/* ---------------- 🚪 LEAVE PLAN CONFIRMATION SHEET ---------------- */}
      <LeavePlanBottomSheet
        isOpen={showLeavePlanConfirm}
        isSkipping={isSkipping}
        onConfirm={async () => {
          setShowLeavePlanConfirm(false);
          await handleSkip();
        }}
        onClose={() => setShowLeavePlanConfirm(false)}
      />

      {/* ---------------- 🚫 CANCEL PLAN CONFIRMATION SHEET ---------------- */}
      <CancelPlanBottomSheet
        isOpen={showCancelPlanConfirm}
        onConfirm={async () => {
          setShowCancelPlanConfirm(false);
          try {
            await cancelPlan(selectedPlan.id);
            showToast("✓ Plan cancelled");
            onClose();
          } catch (err: any) {
            showToast("Failed to cancel plan");
          }
        }}
        onClose={() => setShowCancelPlanConfirm(false)}
      />

      {/* ---------------- ↺ RESTORE PLAN CONFIRMATION SHEET ---------------- */}
      <RestorePlanBottomSheet
        isOpen={showRestorePlanConfirm}
        isRestoring={isRestoring}
        onConfirm={async () => {
          setIsRestoring(true);
          try {
            await updatePlanDetails(selectedPlan.id, { status: "LIVE" });
            showToast("✓ Plan restored");
            setShowRestorePlanConfirm(false);
          } catch (err: any) {
            console.error("Failed to restore plan:", err);
            showToast("Failed to restore plan");
          } finally {
            setIsRestoring(false);
          }
        }}
        onClose={() => setShowRestorePlanConfirm(false)}
      />

      {/* ---------------- 📅 EDIT DATE & TIME BOTTOM SHEET ---------------- */}
      <EditDateTimeBottomSheet
        isOpen={isEditingDateTimeSheetOpen}
        tempDate={tempDate}
        tempTime={tempTime}
        tempRSVPDate={tempRSVPDate}
        tempRSVPTime={tempRSVPTime}
        onTempDateChange={setTempDate}
        onTempTimeChange={setTempTime}
        onTempRSVPDateChange={setTempRSVPDate}
        onTempRSVPTimeChange={setTempRSVPTime}
        onSave={handleSaveDateTime}
        onClose={() => setIsEditingDateTimeSheetOpen(false)}
      />

      {/* ---------------- 💰 EDIT COST BOTTOM SHEET ---------------- */}
      <EditCostBottomSheet
        isOpen={isEditingCostSheetOpen}
        costInput={editTotalCostInput}
        capacity={Number(
          rawDbPlan?.max_participants ||
          selectedPlan?.joinLimit ||
          selectedPlan?.capacity ||
          selectedPlan?.maxSpots ||
          0
        )}
        onCostInputChange={setEditTotalCostInput}
        onSave={async () => {
          setIsEditingCostSheetOpen(false);
          const parsedCost = editTotalCostInput.trim() === "" ? 0 : Math.max(0, parseFloat(editTotalCostInput) || 0);
          try {
            await updatePlanDetails(selectedPlan.id, { total_cost: parsedCost });
            showToast(parsedCost > 0 ? "✓ Cost updated" : "✓ Plan updated to Free");
          } catch {
            showToast("Failed to update cost");
          }
        }}
        onClose={() => setIsEditingCostSheetOpen(false)}
      />

      {/* ---------------- 📝 EDIT DETAILS BOTTOM SHEET ---------------- */}
      <EditDetailsBottomSheet
        isOpen={isEditingDetailsSheetOpen}
        isSaving={isSavingDetails}
        tempTitle={tempTitle}
        tempDescription={tempDescription}
        tempCapacity={tempCapacity}
        tempCoverImage={tempCoverImage}
        fileInputRef={detailsFileInputRef}
        onTitleChange={setTempTitle}
        onDescriptionChange={setTempDescription}
        onCapacityChange={setTempCapacity}
        onCoverImageChange={setTempCoverImage}
        onSave={handleSaveDetails}
        onClose={() => setIsEditingDetailsSheetOpen(false)}
      />

      {/* Location bottom sheet removed – location editing is now inline */}
    </motion.div>
  );
};

export default React.memo(PlansDetailsScreen);
