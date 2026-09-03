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
  CalendarClock,
  ChevronDown,
  Check,
  MessageCircle,
  Receipt,
  Users,
  AlertCircle,
  Camera
} from "lucide-react";
import { UserProfile, Plan } from "../../../../../core/types";
import { usePlansStore } from "../../../state/PlansContext";
import { useLivePlan } from "../../../hooks/useLivePlan";
import { useToast } from "../../../../../shared/contexts/ToastContext";
import { supabase } from "../../../../../../lib/supabaseClient";
import { normalizeStatus, checkHasValidWaitlistReplacement } from "../../../../../../lib/participantStatus";
import { getPlanCover } from "../../../config/planCoverImages";
import { formatPlanDate } from "../../../../../../lib/mappers";
import { UserAvatar } from "../../../../../IMGfromDB/UserAvatar";
import { getUserPlanOutstandingDues } from "../../../../wallet/services/walletService";
import { CostBreakdownPopover } from "../../../components/CostBreakdownPopover";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import TeamOrganizerModal from "../../../../../shared/modals/TeamOrganizerModal";
import PlanCompletionModal from "../../../../../shared/modals/PlanCompletionModal";
import { ParticipantToggleBar } from "../../../../home/components/PlanDetailsCard";
import { useLiveCountdown, formatDeadlineFull, rsvpUrgencyStyles } from "../../../../home/components/PlanCard";
import { useRSVPDeadline } from "../../../utils/rsvpFormatter";
import { InlineParticipantView } from "../../../components/InlineParticipantView";
import { HeroHeader } from "../../../components/HeroHeader";
import { HeroMetadataCard } from "../../../components/HeroMetadataCard";
import { PlanChatScreen } from "../../../../chats/screens/PlanChatScreen";
import { PlanDetailsScreen } from "../../../../wallet/screens/PlanBalances";
import { useGooglePlacesAutocomplete } from "../../../../../shared/hooks/useGooglePlacesAutocomplete";
import { PlanParticipantManagementWrapper } from "./PlanParticipantManagementWrapper";
import { PlanSettingsScreen } from "./PlanSettingsScreen";
import { uploadPlanImage } from "../../../../../shared/utils/imageUtils";
import { cleanPlanId } from "../../../utils/planUtils";
import { LiveActionButton } from "../../../components/LiveActionButton";
import {
  LeavePlanBottomSheet,
  MakeAnotherParticipantHostBottomSheet,
  PaidPlanLeaveConfirmationDialog,
  CancelLeaveRequestBottomSheet,
  CancelPlanBottomSheet,
  CompletePlanConfirmationBottomSheet,
  EarlyCompletePlanConfirmationBottomSheet,
  RestorePlanBottomSheet,
  EditDateTimeBottomSheet,
  EditDetailsBottomSheet,
  JoinPlanConfirmationBottomSheet,
  SkipPlanConfirmationDialog,
  EditCapacityBottomSheet,
} from "../../../components/BottomSheets";
import { SetCostScreen } from "../../../components/SetCost";
import { HostAttendanceScreen } from "../../../../completion/docs/Screens/HostAttendanceScreen";

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
  return 'A spontaneous, tightly coordinated hangout with friends and family. Quick response required for booking slots.';
};

export function hasUserEnteredDescription(plan: any): boolean {
  if (!plan) return false;
  const desc = "";
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

// Removed duplicated ParticipantsSection. We now use InlineParticipantView with variant="flat".

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
  setShowLeavePlanConfirm,
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
  setShowLeavePlanConfirm: (val: boolean) => void;
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
              onClick={() => setShowLeavePlanConfirm(true)}
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
          <MapPin className="w-4 h-4 text-zinc-500 flex-shrink-0 animate-pulse" />
          <div className="h-3.5 w-36 bg-white/[0.08] rounded animate-pulse" />
        </div>
      )}

      {/* ── Display Row (read mode) ── */}
      {!isEditing && !isSaving && (
        <button
          type="button"
          disabled={!isHost}
          onClick={onStartEditing}
          className="flex w-full items-center gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent text-left"
        >
          <MapPin className={`w-4 h-4 flex-shrink-0 ${currentLocation ? "text-red-500" : "text-zinc-500 opacity-60"}`} />
          <span className={`text-[13px] font-sans tracking-wide truncate ${currentLocation ? "text-white font-semibold" : "text-white/40 font-medium"}`}>
            {currentLocation || "Add a location"}
          </span>
        </button>
      )}

      {/* ── Edit Row (input mode) ── */}
      {isEditing && (
        <div className="flex items-center gap-3 p-1.5 -m-1.5">
          <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
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
            className="flex-1 bg-transparent text-[13px] font-sans font-semibold text-white/95 leading-none placeholder:text-white/30 focus:outline-none min-w-0"
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
            className="absolute left-0 right-0 top-full mt-2 z-[100] bg-[#161618] border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden max-h-56 overflow-y-auto pointer-events-auto"
          >
            {suggestions.length > 0 ? (
              suggestions.map((s, idx) => (
                <button
                  key={s.place_id}
                  type="button"
                  onPointerDown={(e) => {
                    // Use onPointerDown so it fires before input blur or backdrop capture
                    e.preventDefault();
                    e.stopPropagation();
                    handleSuggestionSelect(s);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSuggestionSelect(s);
                  }}
                  className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-white/[0.08] active:bg-white/[0.14] transition cursor-pointer select-none pointer-events-auto ${idx < suggestions.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                >
                  <span className="text-[13px] font-semibold text-white/95 leading-tight truncate">
                    {s.structured_formatting.main_text}
                  </span>
                  {s.structured_formatting.secondary_text && (
                    <span className="text-[11px] text-zinc-400 leading-tight truncate">
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
  planId?: string;
  plan?: Plan;
  createMode?: boolean;
  onClose: () => void;
  onBack?: () => void;
  userProfile: UserProfile;
  activeUserId?: string;
  onNavigateToCircle?: (circleId: string) => void;
  setShowPaymentSuccess?: (planId: string | null) => void;
  setShowWaitlistSuccess?: (planId: string | null) => void;
  setShowLeftSuccess?: (planId: string | null) => void;
  onLeavePlan?: () => void;
  onPlanCancelled?: (planId: string) => void;
  onOpenChat?: (planId: string) => void;
  onOpenExpenses?: (planId: string) => void;
  onEditParticipants?: () => void;
  onAddParticipants?: () => void;
  onEditTitle?: (newTitle: string) => void;
  onEditCoverImage?: () => void;
  onAdjustDate?: (eventDateTime: Date, rsvpDateTime?: Date) => void;
  onAdjustCost?: (newCost: number) => void;
  onAdjustLocation?: (locationData: { place_id?: string | null; place_name?: string | null; place_address?: string | null; latitude?: number | null; longitude?: number | null; }) => void;
  onAdjustCapacity?: (newCapacity: number) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export const PlansDetailsScreen: React.FC<PlansDetailsScreenProps> = ({
  planId,
  plan,
  createMode = false,
  onClose,
  onBack,
  userProfile,
  activeUserId,
  onNavigateToCircle,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setShowLeftSuccess,
  onLeavePlan,
  onPlanCancelled,
  onOpenChat,
  onOpenExpenses,
  onEditParticipants,
  onAddParticipants,
  onEditTitle,
  onEditCoverImage,
  onAdjustDate,
  onAdjustCost,
  onAdjustLocation,
  onAdjustCapacity,
  onSubmit,
  isSubmitting = false,
}) => {
  const { showToast } = useToast();
  const {
    dbPlans,
    dbPlanTeamAssignments,
    getTeamAssignments,
    dbPlanParticipants,
    skipPlan,
    requestPaidPlanLeave,
    requestHostLeaveWithReplacement,
    cancelPaidPlanLeaveRequest,
    leavePlan,
    rejoinPlan,
    joinPlan,
    changePlanHost,
    cancelPlan,
    completePlan,
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

    swapParticipants,
    removeAndReplaceWithWaitlist,
    replaceParticipant,
    manageCompletedPlanParticipants,
  } = usePlansStore();
  const livePlan = useLivePlan(planId || '');
  const selectedPlan = (createMode && plan) ? plan : livePlan;

  // States
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  const [isJoiningDirect, setIsJoiningDirect] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showChangeHostList, setShowChangeHostList] = useState(false);
  const [isChangingHost, setIsChangingHost] = useState(false);
  const [showDitchConfirm, setShowDitchConfirm] = useState(false);
  const [isDitching, setIsDitching] = useState(false);
  const [isManagingCompletedParticipants, setIsManagingCompletedParticipants] = useState(false);

  // Bottom Sheet local editing states
  const [isEditingDateTimeSheetOpen, setIsEditingDateTimeSheetOpen] = useState(false);
  const [tempDate, setTempDate] = useState("");
  const [tempTime, setTempTime] = useState("");
  const [tempRSVPOption, setTempRSVPOption] = useState<string | null>(null);
  const initialDateTimeRef = useRef<{ date: string; time: string; rsvpOption: string | null }>({ date: "", time: "", rsvpOption: null });

  const resolveInitialRsvpOption = (planDate: Date, rsvpDate: Date | null): string | null => {
    if (!rsvpDate) return null;
    const diffHours = (planDate.getTime() - rsvpDate.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 0) return null;
    if (diffHours <= 2) return "< 1 Hour";
    if (diffHours <= 18) return "< 12 Hours";
    return "< 24 Hours";
  };

  const [isEditingCostSheetOpen, setIsEditingCostSheetOpen] = useState(false);
  const [isCostPopoverOpen, setIsCostPopoverOpen] = useState(false);
  const [editTotalCostInput, setEditTotalCostInput] = useState<string>("");

  const [isEditingCapacitySheetOpen, setIsEditingCapacitySheetOpen] = useState(false);
  const [createValidationError, setCreateValidationError] = useState<string | null>(null);

  useEffect(() => {
    if ((selectedPlan as any)?.isDateConfigured && (selectedPlan as any)?.isCostConfigured) {
      setCreateValidationError(null);
    }
  }, [(selectedPlan as any)?.isDateConfigured, (selectedPlan as any)?.isCostConfigured]);

  // Auto-dismiss bottom validation message after 3 seconds or on tapping anywhere
  useEffect(() => {
    if (!createValidationError) return;

    const timer = setTimeout(() => {
      setCreateValidationError(null);
    }, 3000);

    const handleTapAnywhere = (e: PointerEvent | MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("#create-plan-submit-btn")) {
        return;
      }
      setCreateValidationError(null);
    };

    window.addEventListener("pointerdown", handleTapAnywhere, { capture: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", handleTapAnywhere, { capture: true });
    };
  }, [createValidationError]);

  const [isEditingDetailsSheetOpen, setIsEditingDetailsSheetOpen] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [tempCapacity, setTempCapacity] = useState<number | "">("");
  const [tempCoverImage, setTempCoverImage] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const detailsFileInputRef = useRef<HTMLInputElement>(null);

  const [isEditingLocationInline, setIsEditingLocationInline] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const locationInputRef = useRef<HTMLInputElement>(null);

  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLocalTimeString = (d: Date) => {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
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
    if (isNaN(h)) return timeStr;
    const displayHour = String(h).padStart(2, '0');
    const displayMin = isNaN(m) ? '00' : String(m).padStart(2, '0');
    return `${displayHour}:${displayMin}`;
  };

  const openDateTimeSheet = () => {
    if (isCancelled || isCompleted) return;
    const hasConfiguredDate = Boolean((selectedPlan as any).isDateConfigured || (!createMode && (selectedPlan.datetime || selectedPlan.time || (selectedPlan as any).scheduled_at)));
    let d = "";
    let t = "";
    let r: string | null = null;
    if (hasConfiguredDate) {
      const rawDateVal = (selectedPlan as any).scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt;
      const planDate = new Date(rawDateVal);
      const planRSVP = selectedPlan.response_deadline_at ? new Date(selectedPlan.response_deadline_at) : null;
      if (!isNaN(planDate.getTime())) {
        d = getLocalDateString(planDate);
        t = getLocalTimeString(planDate);
        r = resolveInitialRsvpOption(planDate, planRSVP);
      }
    }
    setTempDate(d);
    setTempTime(t);
    setTempRSVPOption(r);
    initialDateTimeRef.current = { date: d, time: t, rsvpOption: r };
    setIsEditingDateTimeSheetOpen(true);
  };

  const handleCloseDateTimeSheet = async () => {
    setIsEditingDateTimeSheetOpen(false);
    const initial = initialDateTimeRef.current;
    const hasChanged = tempDate !== initial.date || tempTime !== initial.time || tempRSVPOption !== initial.rsvpOption;
    if (!hasChanged) {
      return;
    }

    if (!tempDate || !tempTime) {
      return;
    }

    const eventDateTime = new Date(`${tempDate}T${tempTime}`);
    if (isNaN(eventDateTime.getTime())) {
      return;
    }

    let rsvpDateTime: Date;
    if (tempRSVPOption === '< 1 Hour') {
      rsvpDateTime = new Date(eventDateTime.getTime() - 1 * 60 * 60 * 1000);
    } else if (tempRSVPOption === '< 12 Hours') {
      rsvpDateTime = new Date(eventDateTime.getTime() - 12 * 60 * 60 * 1000);
    } else if (tempRSVPOption === '< 24 Hours') {
      rsvpDateTime = new Date(eventDateTime.getTime() - 24 * 60 * 60 * 1000);
    } else {
      rsvpDateTime = new Date(eventDateTime.getTime());
    }

    if (createMode) {
      if (onAdjustDate) {
        onAdjustDate(eventDateTime, rsvpDateTime);
      }
      showToast("✓ Date & RSVP updated");
      return;
    }

    try {
      const updates = {
        scheduled_at: eventDateTime.toISOString(),
        rsvp_deadline: rsvpDateTime.toISOString(),
      };
      await updatePlanDetails(selectedPlan.id, updates);
      showToast("✓ Date & RSVP updated");
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
      let uploadedCoverPath: string | undefined = undefined;
      if (tempCoverImage && tempCoverImage.startsWith("data:")) {
        const blob = dataURLtoBlob(tempCoverImage);
        const { path } = await uploadPlanImage(cleanPlanId(selectedPlan.id), blob);
        uploadedCoverPath = path;
      }

      const updates: any = {
        title: tempTitle.trim(),
        max_participants: cap,
      };
      if (uploadedCoverPath) {
        updates.cover_image = uploadedCoverPath;
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

  const handleCapacityChange = async (newCapacity: number) => {
    if (createMode) {
      onAdjustCapacity?.(newCapacity);
    } else if (selectedPlan?.id) {
      try {
        await updatePlanDetails(selectedPlan.id, { max_participants: newCapacity });
      } catch (err) {
        console.error("Failed to update plan capacity:", err);
      }
    }
  };

  const handleRemoveLocation = async () => {
    setIsEditingLocationInline(false);
    setLocationQuery("");
    setIsSavingLocation(true);
    if (createMode) {
      if (onAdjustLocation) {
        onAdjustLocation({ place_name: null, place_address: null, place_id: null, latitude: null, longitude: null });
      }
      showToast("✓ Location removed");
      setIsSavingLocation(false);
      return;
    }

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

    if (createMode) {
      if (onAdjustLocation) {
        onAdjustLocation(place);
      }
      showToast("✓ Location updated");
      setIsSavingLocation(false);
      return;
    }

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
  const [showHostLeaveReplacementSheet, setShowHostLeaveReplacementSheet] = useState(false);
  const [isSubmittingHostReplacement, setIsSubmittingHostReplacement] = useState(false);
  const [showCancelPlanConfirm, setShowCancelPlanConfirm] = useState(false);
  const [showAttendanceSheet, setShowAttendanceSheet] = useState(false);
  const [planExpense, setPlanExpense] = useState<{ total_amount: number; title?: string } | null>(null);

  useEffect(() => {
    if (showAttendanceSheet && selectedPlan?.id) {
      const fetchPlanExpense = async () => {
        try {
          const targetId = (selectedPlan as any).dbUuid || selectedPlan.id;
          const { data } = await supabase
            .from("wallet_expenses")
            .select("total_amount, title")
            .eq("plan_id", targetId)
            .or("expense_type.eq.PLAN_EXPENSE,message_id.is.null")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (data && Number(data.total_amount || 0) > 0) {
            setPlanExpense({ total_amount: Number(data.total_amount), title: data.title });
          } else {
            setPlanExpense(null);
          }
        } catch (err) {
          console.warn("[PlansPreviewScreen] Error fetching plan expense for review:", err);
          setPlanExpense(null);
        }
      };
      fetchPlanExpense();
    }
  }, [showAttendanceSheet, selectedPlan?.id]);
  const [showEarlyEndPlanConfirm, setShowEarlyEndPlanConfirm] = useState(false);
  const [isEndingPlan, setIsEndingPlan] = useState(false);
  const [showRestorePlanConfirm, setShowRestorePlanConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPlanSettingsScreen, setShowPlanSettingsScreen] = useState(false);
  const [showPlanBalancesScreen, setShowPlanBalancesScreen] = useState(false);
  const [selectedChatPlanId, setSelectedChatPlanId] = useState<string | null>(null);
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

  const isHost = createMode
    ? true
    : myParticipantRecord
      ? (myParticipantRecord.role === "HOST")
      : (selectedPlan?.members ? selectedPlan.members.some(m => (m.userId === resolvedUserUuid || m.userUuid === resolvedUserUuid) && m.isHost) : false);

  const isCancelled = Boolean((selectedPlan?.status || "").toUpperCase() === "CANCELLED");
  const isCompleted = Boolean((selectedPlan?.status || "").toUpperCase() === "COMPLETED");

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

  const isSoleHost = isHost && allHosts.length <= 1;

  const eligibleHostReplacementParticipants = useMemo(() => {
    if (!selectedPlan?.members) return [];
    return selectedPlan.members
      .filter((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const isCurrent = Boolean(resolvedUserUuid && mId === resolvedUserUuid);
        if (isCurrent) return false;

        const isHostRole = (m as any).role === "HOST" || m.isHost === true;
        if (isHostRole) return false;

        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
        return status === "JOINED";
      })
      .map((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        return {
          id: mId,
          name: m.name || (m as any).full_name || "Participant",
          avatar: m.avatar || (m as any).profile_photo_path,
          username: m.username
        };
      });
  }, [selectedPlan?.members, resolvedUserUuid]);

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
    if (createMode && plan) return plan as any;
    return dbPlans.find(p => p.id === planUuid);
  }, [dbPlans, planUuid, createMode, plan]);

  const currentTotalCost = Number(
    (createMode
      ? (selectedPlan as any)?.total_cost ?? (selectedPlan as any)?.cost ?? rawDbPlan?.total_cost
      : rawDbPlan?.total_cost ?? (selectedPlan as any)?.total_cost) || 0
  );

  const hasCost = currentTotalCost > 0;

  const costText = useMemo(() => {
    if (!hasCost || currentTotalCost <= 0) return "Free";

    const isCompleted = rawDbPlan?.status === 'COMPLETED';
    const planCapacity = Number(
      rawDbPlan?.max_participants ||
      selectedPlan?.capacity ||
      (selectedPlan as any)?.max_participants ||
      selectedPlan?.joinLimit ||
      selectedPlan?.maxSpots ||
      (selectedPlan as any)?.maxParticipants ||
      0
    );

    const totalParticipantsCount = isCompleted
      ? Number(rawDbPlan?.attended_participants ?? selectedPlan?.attended_participants ?? 0)
      : (planCapacity > 0 ? planCapacity : Number(selectedPlan?.members?.length || 1));

    const divisor = totalParticipantsCount > 0 ? totalParticipantsCount : 1;
    const perPerson = Math.round((currentTotalCost / divisor) * 100) / 100;
    const perPersonFormatted = perPerson % 1 === 0
      ? perPerson.toLocaleString("en-IN")
      : perPerson.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `₹${perPersonFormatted} / person`;
  }, [hasCost, currentTotalCost, rawDbPlan, selectedPlan]);

  const isManagementExpired = useMemo(() => {
    if (!selectedPlan) return false;
    const rawScheduled = (selectedPlan as any).scheduled_at || rawDbPlan?.scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt;
    if (!rawScheduled) return false;
    const endTimeMs = new Date(rawScheduled).getTime();
    if (isNaN(endTimeMs)) return false;
    return Date.now() >= endTimeMs + 24 * 60 * 60 * 1000;
  }, [selectedPlan, rawDbPlan]);

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

  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false);
  const [showPaidLeaveConfirmation, setShowPaidLeaveConfirmation] = useState(false);
  const [showCancelLeaveRequestConfirmation, setShowCancelLeaveRequestConfirmation] = useState(false);
  const [isSubmittingPaidLeave, setIsSubmittingPaidLeave] = useState(false);
  const [isCancellingLeaveRequest, setIsCancellingLeaveRequest] = useState(false);

  const handleConfirmCancelLeaveRequest = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isCancellingLeaveRequest) return;
    setIsCancellingLeaveRequest(true);
    try {
      await cancelPaidPlanLeaveRequest(selectedPlan.id);
      showToast("Leave request cancelled");
      setShowCancelLeaveRequestConfirmation(false);
    } catch (err) {
      console.error("[handleConfirmCancelLeaveRequest] Failed:", err);
      showToast("Failed to cancel leave request");
    } finally {
      setIsCancellingLeaveRequest(false);
    }
  }, [selectedPlan, activeUserId, isCancellingLeaveRequest, cancelPaidPlanLeaveRequest, showToast]);

  const handleConfirmPaidLeaveRequest = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSubmittingPaidLeave) return;
    setIsSubmittingPaidLeave(true);
    try {
      await requestPaidPlanLeave(selectedPlan.id);
      showToast("Leave request sent to host");
      setShowPaidLeaveConfirmation(false);
    } catch (err: any) {
      console.error("[handleConfirmPaidLeaveRequest] Failed:", err);
      showToast(err?.message || "Failed to send leave request");
    } finally {
      setIsSubmittingPaidLeave(false);
    }
  }, [selectedPlan, activeUserId, isSubmittingPaidLeave, requestPaidPlanLeave, showToast]);

  const handleConfirmSkip = useCallback(() => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    const planToSkip = selectedPlan;
    setShowSkipConfirmation(false);

    if (setShowLeftSuccess) {
      setShowLeftSuccess(planToSkip.id);
    }
    if (onLeavePlan) {
      onLeavePlan();
    } else {
      onClose();
    }

    // Perform DB skip asynchronously in background without blocking visual confirmation overlay
    skipPlan(planToSkip.id, activeUserId).catch((err) => {
      console.error("[handleSkip] Background skip failed:", err);
      showToast("Failed to sync skip status with database.");
    });
  }, [selectedPlan, activeUserId, isSkipping, onLeavePlan, onClose, skipPlan, setShowLeftSuccess, showToast]);

  const handleConfirmHostLeaveReplacement = useCallback(async (selectedReplacementId: string) => {
    if (!selectedPlan || isSubmittingHostReplacement) return;
    setIsSubmittingHostReplacement(true);
    try {
      const planUuid = (selectedPlan as any).dbUuid || selectedPlan.id;
      const res = await requestHostLeaveWithReplacement(planUuid, selectedReplacementId);
      setShowHostLeaveReplacementSheet(false);
      
      const replacementUser = eligibleHostReplacementParticipants.find(p => p.id === selectedReplacementId);
      const replacementName = replacementUser?.name || "participant";

      if (res?.leave_requested) {
        showToast(`✓ Promoted ${replacementName} to host & sent leave request`);
      } else {
        showToast(`✓ Promoted ${replacementName} to host & left the plan`);
      }
      
      if (onLeavePlan) {
        onLeavePlan();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error("[PlansPreviewScreen] Host replacement leave failed:", err);
      showToast(`Failed to leave plan: ${err.message || "Unknown error"}`);
    } finally {
      setIsSubmittingHostReplacement(false);
    }
  }, [selectedPlan, isSubmittingHostReplacement, requestHostLeaveWithReplacement, eligibleHostReplacementParticipants, onLeavePlan, onClose, showToast]);

  const handleSkip = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isSkipping) return;
    if (myParticipantRecord?.leave_requested) {
      setShowCancelLeaveRequestConfirmation(true);
      return;
    }

    const isActuallyJoined = currentStatus === "JOINED";

    if (isActuallyJoined) {
      if (isSoleHost) {
        setShowHostLeaveReplacementSheet(true);
      } else {
        setShowLeavePlanConfirm(true);
      }
    } else {
      setShowSkipConfirmation(true);
    }
  }, [selectedPlan, activeUserId, isSkipping, myParticipantRecord, currentStatus, isSoleHost]);

  const handleRejoin = useCallback(() => {
    if (!selectedPlan || !activeUserId || isRejoining) return;
    const planToJoin = selectedPlan;
    if (isFull) {
      showToast("Added to Waitlist");
      if (setShowWaitlistSuccess) {
        setShowWaitlistSuccess(planToJoin.id);
      }
    } else {
      if (setShowPaymentSuccess) {
        setShowPaymentSuccess(planToJoin.id);
      }
    }
    onClose();

    // Perform DB rejoin asynchronously in background without blocking visual confirmation overlay
    rejoinPlan(planToJoin.id, userProfile).catch((err) => {
      console.error("[handleRejoin] Background rejoin failed:", err);
      showToast("Failed to sync rejoin status with database.");
    });
  }, [selectedPlan, activeUserId, isRejoining, userProfile, isFull, rejoinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose, showToast]);

  const [showJoinConfirmation, setShowJoinConfirmation] = useState(false);

  const handleConfirmJoinDirect = useCallback(() => {
    if (!selectedPlan || isJoiningDirect) return;
    const planToJoin = selectedPlan;
    setShowJoinConfirmation(false);

    if (isFull) {
      showToast("Added to Waitlist");
      if (setShowWaitlistSuccess) {
        setShowWaitlistSuccess(planToJoin.id);
      }
    } else {
      if (setShowPaymentSuccess) {
        setShowPaymentSuccess(planToJoin.id);
      }
    }
    onClose();

    // Perform DB join asynchronously in background without blocking UI overlay
    joinPlan(planToJoin.id, userProfile).catch((err) => {
      console.error("[handleJoinDirect] Background join failed:", err);
      showToast("Failed to sync join status with database.");
    });
  }, [selectedPlan, isJoiningDirect, userProfile, isFull, joinPlan, setShowWaitlistSuccess, setShowPaymentSuccess, onClose, showToast]);

  const handleJoinDirect = useCallback(() => {
    if (!selectedPlan || isJoiningDirect) return;
    setShowJoinConfirmation(true);
  }, [selectedPlan, isJoiningDirect]);

  const handleSkipConfirm = useCallback(async () => {
    if (!selectedPlan || !activeUserId || isLeaving) return;
    setIsLeaving(true);
    try {
      await skipPlan(selectedPlan.id, activeUserId);
      showToast("You left the plan.");
      setShowLeavePlanConfirm(false);
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
      setShowLeavePlanConfirm(false);
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
        onEditCoverImage={async (newCoverUrl, blob) => {
          const targetPlanId = cleanPlanId(selectedPlan.dbUuid || selectedPlan.id);
          if (blob) {
            await uploadPlanImage(targetPlanId, blob);
          }
          await updatePlanDetails(targetPlanId, { cover_image: `${targetPlanId}.webp`, skipDbWrite: true });
        }}
        onLeavePlan={handleSkip}
        onCancelPlan={handleDitchConfirm}
      />
    );
  }

  const isFixedViewportView = (isHost || isCompleted) && !isCancelled;
  const isLiveHostView = isHost && !isCancelled && !isCompleted;

  return (
    <motion.div
      id="home_plan_details"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 bg-[#050505] z-[60] flex flex-col h-full overflow-hidden text-left"
    >
      <div id="immersive-plan-scroll-container" className={`flex-1 ${isFixedViewportView ? 'overflow-hidden flex flex-col h-full pb-20' : 'overflow-y-auto scrollbar-none pb-28'}`}>
        <div id="immersive-plan-hero-wrapper" className={`w-full flex-shrink-0 relative ${isEditingLocationInline ? 'z-50' : 'z-10'}`}>
          <div
            id="immersive-plan-hero-container"
            className="relative w-full h-[280px] flex flex-col justify-end overflow-visible flex-shrink-0 rounded-b-[2.5rem] border-b border-white/10"
          >
            {/* Cover Image */}
            <div
              onClick={createMode && onEditCoverImage ? onEditCoverImage : undefined}
              className={`absolute inset-0 w-full h-full ${createMode && onEditCoverImage ? 'cursor-pointer' : ''}`}
            >
              <DiscoveryImages
                id="immersive-plan-hero-image"
                src={selectedPlan.coverImage}
                planId={selectedPlan.dbUuid || selectedPlan.id}
                category={selectedPlan.category}
                subcategory={(selectedPlan as any).subcategory || (selectedPlan as any).sports_type}
                screen="Plan Preview"
                alt={selectedPlan.title}
                className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
              />
            </div>
            {/* Immersive gradient overlay for bottom readability */}
            <div
              onClick={createMode && onEditCoverImage ? onEditCoverImage : undefined}
              className={`absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 ${createMode && onEditCoverImage ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'} z-10`}
            />

            {/* Hero Header component */}
            <HeroHeader
              title={selectedPlan.title}
              creatorName={isHost ? "You" : selectedPlan.creatorName}
              creatorAvatar={isHost ? userProfile.avatar : selectedPlan.creatorAvatar}
              hosts={allHosts}
              viewerId={resolvedUserUuid}
              onClose={onClose}
              isCloseIcon={createMode}
              isHost={isHost && !isCancelled && !isCompleted}
              onEditTitle={createMode ? onEditTitle : undefined}
              onEditCoverImage={createMode ? onEditCoverImage : undefined}
              onOpenChat={
                createMode
                  ? undefined
                  : () => {
                    if (onOpenChat) {
                      onOpenChat(selectedPlan.id);
                    } else {
                      setSelectedChatPlanId(selectedPlan.id);
                    }
                  }
              }
              onOpenExpenses={
                createMode
                  ? undefined
                  : () => {
                    if (onOpenExpenses) {
                      onOpenExpenses(selectedPlan.id);
                    } else {
                      setShowPlanBalancesScreen(true);
                    }
                  }
              }
              onOpenSettings={
                createMode || !isHost || isCancelled || isCompleted
                  ? undefined
                  : () => setShowPlanSettingsScreen(true)
              }
            />

            {isEditingLocationInline && (
              <div
                className="fixed inset-0 z-40 bg-transparent pointer-events-auto"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setIsEditingLocationInline(false);
                  setLocationQuery("");
                  if (locationInputRef.current) locationInputRef.current.blur();
                }}
              />
            )}

            {/* Dynamic Integrated Info Card */}
            <div className={`absolute left-6 right-6 bottom-0 translate-y-1/2 ${isEditingLocationInline ? 'z-50' : 'z-20'}`}>
              <div className="w-full bg-black/15 backdrop-blur-3xl border border-white/[0.06] shadow-lg rounded-2xl relative">
                <div className="p-4 space-y-2.5">
                  {/* 1. Date & Time Row (Row 1) */}
                  <div className="w-full flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={!isHost || isCancelled || isCompleted}
                      onClick={openDateTimeSheet}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <CalendarClock className={`w-4 h-4 flex-shrink-0 ${createMode && !(selectedPlan as any).isDateConfigured ? "text-zinc-500 opacity-60" : "text-emerald-400"}`} />
                      <span className={`text-[13px] font-sans tracking-wide truncate ${createMode && !(selectedPlan as any).isDateConfigured ? "text-white/40 font-medium" : "text-white font-semibold"}`}>
                        {createMode && !(selectedPlan as any).isDateConfigured
                          ? "Set a date"
                          : formatPlanDate((selectedPlan as any).scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt)}
                      </span>
                    </button>

                    {/* Plan Size Indicator (Right side of Date & Time row / above Free) */}
                    {Boolean(selectedPlan.capacity || (selectedPlan as any).max_participants || selectedPlan.maxParticipants || selectedPlan.joinLimit || rawDbPlan?.max_participants) && (
                      createMode ? (
                        <button
                          type="button"
                          id="hero_plan_size_btn"
                          disabled={!isHost || isCancelled || isCompleted}
                          onClick={() => {
                            if (isCancelled || isCompleted) return;
                            setIsEditingCapacitySheetOpen(true);
                          }}
                          className="flex items-center gap-1.5 text-white/90 font-sans font-semibold text-[13.5px] tracking-tight shrink-0 pl-2 hover:bg-white/[0.06] active:bg-white/[0.1] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <Users className="w-4 h-4 text-white/70 flex-shrink-0" />
                          <span>{selectedPlan.capacity || (selectedPlan as any).max_participants || selectedPlan.maxParticipants || selectedPlan.joinLimit || rawDbPlan?.max_participants}</span>
                        </button>
                      ) : (
                        <div
                          id="hero_plan_size_indicator"
                          className="flex items-center gap-1.5 text-white/90 font-sans font-semibold text-[13.5px] tracking-tight shrink-0 pl-2 select-none pointer-events-none"
                        >
                          <Users className="w-4 h-4 text-white/70 flex-shrink-0" />
                          <span>{selectedPlan.capacity || (selectedPlan as any).max_participants || selectedPlan.maxParticipants || selectedPlan.joinLimit || rawDbPlan?.max_participants}</span>
                        </div>
                      )
                    )}
                  </div>

                  {/* 2. Location (Row 2) – inline autocomplete */}
                  <InlineLocationEditor
                    isHost={isHost && !isCancelled && !isCompleted}
                    currentLocation={selectedPlan.location || ""}
                    isEditing={isEditingLocationInline}
                    isSaving={isSavingLocation}
                    locationQuery={locationQuery}
                    inputRef={locationInputRef}
                    onStartEditing={() => {
                      if (isHost && !isCancelled && !isCompleted) {
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

                  {/* 3. Cost Row (Row 3) */}
                  <div className={`w-full flex items-center text-white/50 text-[11px] font-medium leading-none ${isCompleted ? "justify-start" : "justify-between"}`}>
                    {!isCompleted && (
                      <button
                        type="button"
                        disabled={!isHost || isCancelled}
                        onClick={openDateTimeSheet}
                        className="flex items-center gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer disabled:cursor-default disabled:hover:bg-transparent text-left"
                      >
                        <Hourglass className="w-4 h-4 flex-shrink-0" style={{ color: urgencyColor }} />
                        <span style={{ color: urgencyColor }}>
                          {rsvp.text}
                        </span>
                      </button>
                    )}

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (createMode) {
                            setEditTotalCostInput(hasCost && currentTotalCost > 0 ? String(currentTotalCost) : "");
                            setIsEditingCostSheetOpen(true);
                          } else {
                            setIsCostPopoverOpen((prev) => !prev);
                          }
                        }}
                        className={`flex items-center gap-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition p-1.5 -m-1.5 rounded-xl cursor-pointer ${isCompleted ? "text-left" : "text-right font-semibold"}`}
                      >
                        {isCompleted ? (
                          <>
                            <IndianRupee className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />
                            <div className="flex items-center gap-1.5">
                              <span className="text-white text-[13px] font-semibold tracking-wide">
                                {hasCost && costText && costText !== "Free" ? costText.replace(/^₹\s*/, '') : "Free"}
                              </span>
                              <span className="text-[#8E8E93] text-[11px] font-normal font-sans">per person</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <IndianRupee
                              className={`w-4 h-4 flex-shrink-0 ${
                                hasCost && costText && costText !== "Free"
                                  ? "text-emerald-400"
                                  : "text-zinc-500 opacity-60"
                              }`}
                            />
                            <span
                              className={`font-sans tracking-tight text-[13.5px] ${
                                createMode && !(selectedPlan as any).isCostConfigured && !hasCost
                                  ? "text-white/40 font-medium"
                                  : "text-white/90 font-semibold"
                              }`}
                            >
                              {createMode && !(selectedPlan as any).isCostConfigured && !hasCost
                                ? "Set a cost"
                                : (hasCost && costText && costText !== "Free" ? costText.replace(/^₹\s*/, '') : "Free")}
                            </span>
                          </div>
                        )}
                      </button>

                      <CostBreakdownPopover
                        totalCost={createMode ? (selectedPlan as any).total_cost : rawDbPlan?.total_cost}
                        maxParticipants={createMode ? (selectedPlan.capacity || (selectedPlan as any).max_participants) : rawDbPlan?.max_participants}
                        attendedParticipants={rawDbPlan?.attended_participants ?? selectedPlan?.attended_participants}
                        isCompleted={isCompleted}
                        isOpen={isCostPopoverOpen}
                        onClose={() => setIsCostPopoverOpen(false)}
                        isHost={isHost && !isCancelled && !isCompleted}
                        onEditCost={() => {
                          if (isCancelled || isCompleted) return;
                          const currentCost = createMode ? (selectedPlan as any).total_cost : rawDbPlan?.total_cost;
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

        <div id="immersive-plan-scroll-content" className={`px-6 pt-[78px] space-y-5 ${isFixedViewportView ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}`}>
          {selectedPlan && (
            <InlineParticipantView
              plan={selectedPlan}
              activeUserId={userProfile?.dbUuid || activeUserId}
              isHost={isHost}
              variant="flat"
            />
          )}

          {/* Fixed Manage Participants action for host — floating icon + text only, tightly anchored above LiveActionButton / Create Plan button */}
          {isHost && !isCancelled && (
            <div className={`fixed ${createMode ? 'bottom-[54px]' : 'bottom-[58px]'} left-6 right-6 z-40 flex items-center justify-center pointer-events-auto`}>
              <button
                type="button"
                id="host_manage_participants_btn"
                onClick={
                  createMode
                    ? () => onEditParticipants?.()
                    : isCompleted
                      ? !isManagementExpired
                        ? () => setShowAttendanceSheet(true)
                        : () => showToast("Participant management is no longer available. You can only make changes within 24 hours after the plan ends.")
                      : () => setShowParticipantManagement(true)
                }
                className="py-1 px-3 bg-transparent hover:opacity-100 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 text-[12.5px] font-sans font-semibold text-white/80 cursor-pointer select-none"
              >
                <Users className="w-4 h-4 text-white/70" />
                <span>Manage Participants</span>
              </button>
            </div>
          )}

          {createMode ? (() => {
            const isDateSet = Boolean((selectedPlan as any)?.isDateConfigured);
            const isCostSet = Boolean((selectedPlan as any)?.isCostConfigured);
            const isCreateDisabled = !isDateSet || !isCostSet;

            const handleCreatePlanClick = () => {
              if (isSubmitting) return;

              if (!isDateSet && !isCostSet) {
                const msg = "Set a date and cost to create your plan.";
                setCreateValidationError(msg);
                return;
              }
              if (!isDateSet) {
                const msg = "Set a date to create your plan.";
                setCreateValidationError(msg);
                return;
              }
              if (!isCostSet) {
                const msg = "Set a cost to create your plan.";
                setCreateValidationError(msg);
                return;
              }

              setCreateValidationError(null);
              onSubmit?.();
            };

            return (
              <div
                style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
                className="fixed bottom-0 left-0 right-0 px-6 pt-2 pb-4 bg-gradient-to-t from-black via-black/90 to-transparent z-40"
              >
                <AnimatePresence>
                  {createValidationError && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="mb-2.5 w-full flex items-center justify-center pointer-events-none"
                    >
                      <div className="bg-[#18181D]/95 border border-[#FF6B2C]/40 text-[#FF854C] px-4 py-2 rounded-2xl text-[12.5px] font-sans font-semibold shadow-2xl backdrop-blur-xl flex items-center gap-2 text-center">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#FF6B2C]" />
                        <span>{createValidationError}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  id="create-plan-submit-btn"
                  disabled={isSubmitting}
                  onClick={handleCreatePlanClick}
                  style={{ borderRadius: 9999 }}
                  className={`w-full py-3 font-sans font-bold text-[14.5px] rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer ${isCreateDisabled || isSubmitting
                      ? "bg-[#FF6B2C]/40 text-white/40 shadow-none active:scale-[0.98]"
                      : "bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-[0.98] text-white shadow-lg"
                    }`}
                >
                  {isSubmitting ? "Creating Plan…" : "Create Plan"}
                </button>
              </div>
            );
          })() : (
            <LiveActionButton
              myParticipantRecord={myParticipantRecord}
              isCancelled={isCancelled}
              isCompleted={isCompleted}
              isManagementExpired={isManagementExpired}
              className={(myParticipantRecord?.rsvp_status === "SKIPPED" && myParticipantRecord?.skip_reason === "LEFT") ? "!bottom-24" : ""}
              onClick={
                isCompleted && isHost
                  ? !isManagementExpired
                    ? () => setShowAttendanceSheet(true)
                    : () => showToast("Participant management is no longer available. You can only make changes within 24 hours after the plan ends.")
                  : isCompleted
                    ? undefined
                    : isHost && isCancelled
                      ? () => setShowRestorePlanConfirm(true)
                      : isHost
                        ? () => setShowCancelPlanConfirm(true)
                        : myParticipantRecord?.rsvp_status === "JOINED" && myParticipantRecord?.leave_requested
                          ? () => setShowCancelLeaveRequestConfirmation(true)
                          : currentStatus === "JOINED" && !alreadySkipped
                            ? () => setShowLeavePlanConfirm(true)
                            : currentStatus === "WAITLISTED" && !alreadySkipped
                              ? () => setShowSkipConfirmation(true)
                              : undefined
              }
            />
          )}
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
              <p className="text-[13.5px] text-zinc-300 font-sans leading-[1.72]">{getPlanDescription(selectedPlan)}</p>
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
        setShowLeavePlanConfirm={setShowLeavePlanConfirm}
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
              onUpdatePlanCapacity={(planId, capacity, opts) =>
                updatePlanDetails(planId, {
                  max_participants: capacity,
                  ...(opts?.totalCost !== undefined ? { total_cost: opts.totalCost } : {}),
                })
              }
              onCancelPlan={(planId) => cancelPlan(planId)}
              onAddParticipants={(planId, userIds, circleIds, assignedGroup) => addParticipantsToPlan({
                planId,
                inviteeUuids: userIds,
                userProfile,
                planTitle: selectedPlan?.title || '',
                assignedGroup
              })}
              onReorderWaitlist={(planId, orderedUserUuids) => reorderWaitlist(planId, orderedUserUuids)}

              onConfirmReplacement={(planId, targetId, replacementId) => replaceParticipant(planId, targetId, replacementId)}
              onOpenSettings={() => {
                setShowParticipantManagement(false);
                setShowPlanSettingsScreen(true);
              }}
              onLeavePlan={handleSkip}
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

      {/* 💬 PLAN CHAT OVERLAY */}
      {selectedChatPlanId && (
        <div className="fixed inset-0 z-[80] bg-[#050505]">
          <PlanChatScreen
            planId={selectedChatPlanId}
            onBack={() => setSelectedChatPlanId(null)}
            onOpenPlanDetails={() => {
              setSelectedChatPlanId(null);
            }}
          />
        </div>
      )}

      {/* 💳 PLAN BALANCES / EXPENSES OVERLAY */}
      {showPlanBalancesScreen && selectedPlan && (
        <div className="fixed inset-0 z-[80] bg-[#050505]">
          <PlanDetailsScreen
            planId={selectedPlan.id}
            onBack={() => setShowPlanBalancesScreen(false)}
            onRefreshBalances={async () => { }}
            activeUserId={activeUserId || userProfile.dbUuid || (userProfile as any)?.id || ""}
            onSelectPlan={() => { }}
            onToggleBottomNav={() => { }}
          />
        </div>
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
      <JoinPlanConfirmationBottomSheet
        isOpen={showJoinConfirmation}
        costText={costText}
        planTitle={selectedPlan?.title}
        isJoining={isJoiningDirect}
        onConfirm={handleConfirmJoinDirect}
        onClose={() => setShowJoinConfirmation(false)}
      />

      <SkipPlanConfirmationDialog
        isOpen={showSkipConfirmation}
        planTitle={selectedPlan?.title}
        isSkipping={isSkipping}
        onConfirm={handleConfirmSkip}
        onClose={() => setShowSkipConfirmation(false)}
      />

      <PaidPlanLeaveConfirmationDialog
        isOpen={showPaidLeaveConfirmation}
        planTitle={selectedPlan?.title}
        isSubmitting={isSubmittingPaidLeave}
        onConfirm={handleConfirmPaidLeaveRequest}
        onClose={() => setShowPaidLeaveConfirmation(false)}
      />

      <CancelLeaveRequestBottomSheet
        isOpen={showCancelLeaveRequestConfirmation}
        planTitle={selectedPlan?.title}
        isSubmitting={isCancellingLeaveRequest}
        onConfirm={handleConfirmCancelLeaveRequest}
        onClose={() => setShowCancelLeaveRequestConfirmation(false)}
      />

      <LeavePlanBottomSheet
        isOpen={showLeavePlanConfirm}
        isSkipping={isSkipping}
        onConfirm={async () => {
          setShowLeavePlanConfirm(false);
          const isPaidPlan = rawDbPlan && rawDbPlan.total_cost !== undefined && rawDbPlan.total_cost !== null && Number(rawDbPlan.total_cost) > 0;
          const isJoined = currentStatus === "JOINED";

          if (isPaidPlan && isJoined) {
            try {
              // Perform a fresh database query directly against plan_participants table
              const { data: freshParticipants, error: freshErr } = await (supabase as any)
                .from("plan_participants")
                .select("user_id, rsvp_status, assigned_group, waitlist_position")
                .eq("plan_id", planUuid);

              if (freshErr) {
                console.error("[LeavePlanBottomSheet] Error querying fresh database state:", freshErr);
              }

              const mode = rawDbPlan?.participant_filtering || (selectedPlan as any)?.participantFiltering || "AUTOMATIC";
              const { hasReplacement } = checkHasValidWaitlistReplacement(freshParticipants, mode);

              if (!hasReplacement) {
                // FLOW 2 — NO VALID WAITLIST REPLACEMENT -> Show second bottom sheet ("Leave request required")
                setShowPaidLeaveConfirmation(true);
                return;
              }
            } catch (err) {
              console.error("[LeavePlanBottomSheet] Error during leave decision:", err);
            }
          }

          // FLOW 1 — HAS ELIGIBLE WAITLIST / FREE PLAN / WAITLISTED PARTICIPANT -> Allow immediate leave
          handleConfirmSkip();
        }}
        onClose={() => setShowLeavePlanConfirm(false)}
      />

      <MakeAnotherParticipantHostBottomSheet
        isOpen={showHostLeaveReplacementSheet}
        eligibleParticipants={eligibleHostReplacementParticipants}
        isSubmitting={isSubmittingHostReplacement}
        onConfirm={handleConfirmHostLeaveReplacement}
        onClose={() => setShowHostLeaveReplacementSheet(false)}
      />

      {/* ---------------- 🚫 PLAN ACTIONS SHEET (CANCEL / MARK AS COMPLETE) ---------------- */}
      <CancelPlanBottomSheet
        isOpen={showCancelPlanConfirm}
        onConfirmCancel={async () => {
          setShowCancelPlanConfirm(false);
          try {
            await cancelPlan(selectedPlan.id);
            showToast("✓ Plan cancelled");
            onClose();
          } catch (err: any) {
            showToast("Failed to cancel plan");
          }
        }}
        onMarkAsComplete={() => {
          setShowCancelPlanConfirm(false);
          const rawScheduled = (selectedPlan as any).scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt;
          const planScheduledDate = new Date(rawScheduled);
          const now = new Date();
          const isEarly = !isNaN(planScheduledDate.getTime()) && now.getTime() < planScheduledDate.getTime();

          if (isEarly) {
            setShowEarlyEndPlanConfirm(true);
          } else {
            setShowAttendanceSheet(true);
          }
        }}
        onClose={() => setShowCancelPlanConfirm(false)}
      />

      {/* ---------------- 📝 HOST ATTENDANCE FULL-SCREEN SCREEN ---------------- */}
      <AnimatePresence>
        {showAttendanceSheet && (
          <motion.div
            key="host-attendance-screen"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-[70] bg-[#050505] flex flex-col"
          >
            <HostAttendanceScreen
              isOpen={showAttendanceSheet}
              members={selectedPlan?.members || []}
              hostId={selectedPlan.hostId || selectedPlan.creatorId || (selectedPlan as any).host_id || ""}
              planExpense={planExpense}
              isSubmitting={isEndingPlan || isManagingCompletedParticipants}
              isCompletedMode={selectedPlan?.status === 'COMPLETED'}
              onConfirm={async (attendanceInput, expenseMode, usersToAdd, usersToRemove) => {
                if (selectedPlan?.status === 'COMPLETED') {
                  if (isManagementExpired) {
                    showToast("Participant management is no longer available. You can only make changes within 24 hours after the plan ends.");
                    setShowAttendanceSheet(false);
                    return;
                  }
                  setIsManagingCompletedParticipants(true);
                  try {
                    await manageCompletedPlanParticipants(selectedPlan.id, usersToAdd || [], usersToRemove || [], expenseMode);
                    showToast("✓ Participants updated");
                    setShowAttendanceSheet(false);
                  } catch (err: any) {
                    showToast(err.message || "Failed to update participants");
                  } finally {
                    setIsManagingCompletedParticipants(false);
                  }
                } else {
                  setIsEndingPlan(true);
                  try {
                    // Is it early?
                    const rawScheduled = (selectedPlan as any).scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt;
                    const planScheduledDate = new Date(rawScheduled);
                    const now = new Date();
                    const isEarly = !isNaN(planScheduledDate.getTime()) && now.getTime() < planScheduledDate.getTime();

                    await completePlan(selectedPlan.id, attendanceInput, { isEarly, expenseMode });
                    showToast("✓ Plan completed");
                    setShowAttendanceSheet(false);
                    onClose();
                  } catch (err: any) {
                    showToast("Failed to complete plan");
                  } finally {
                    setIsEndingPlan(false);
                  }
                }
              }}
              onBack={() => setShowAttendanceSheet(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- ⚡ EARLY COMPLETE PLAN CONFIRMATION SHEET ---------------- */}
      <EarlyCompletePlanConfirmationBottomSheet
        isOpen={showEarlyEndPlanConfirm}
        scheduledTimeText={formatPlanDate((selectedPlan as any).scheduled_at || selectedPlan.datetime || selectedPlan.time || selectedPlan.createdAt)}
        isSubmitting={false}
        onConfirm={() => {
          setShowEarlyEndPlanConfirm(false);
          setShowAttendanceSheet(true);
        }}
        onClose={() => setShowEarlyEndPlanConfirm(false)}
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
        tempRSVPOption={tempRSVPOption}
        onTempDateChange={setTempDate}
        onTempTimeChange={setTempTime}
        onTempRSVPOptionChange={setTempRSVPOption}
        onClose={handleCloseDateTimeSheet}
      />

      {/* ---------------- 💰 SET COST FULL SCREEN ---------------- */}
      <AnimatePresence>
        {isEditingCostSheetOpen && (
          <SetCostScreen
            planTitle={selectedPlan?.title || (selectedPlan as any)?.name || "Plan"}
            planCoverImage={selectedPlan?.coverImage || (selectedPlan as any)?.cover_image || (selectedPlan as any)?.cover_photo || getPlanCover(selectedPlan?.category, (selectedPlan as any)?.subcategory)}
            initialCost={editTotalCostInput}
            participants={selectedPlan?.members || []}
            planSize={selectedPlan.capacity || (selectedPlan as any).max_participants || (selectedPlan as any).maxParticipants || selectedPlan.joinLimit || rawDbPlan?.max_participants}
            onSave={async (parsedCost: number) => {
              setIsEditingCostSheetOpen(false);
              if (createMode) {
                if (onAdjustCost) {
                  onAdjustCost(parsedCost);
                }
                showToast(parsedCost > 0 ? "✓ Cost updated" : "✓ Plan updated to Free");
                return;
              }
              try {
                await updatePlanDetails(selectedPlan.id, { total_cost: parsedCost });
                showToast(parsedCost > 0 ? "✓ Cost updated" : "✓ Plan updated to Free");
              } catch {
                showToast("Failed to update cost");
              }
            }}
            onClose={() => setIsEditingCostSheetOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ---------------- 📝 EDIT DETAILS BOTTOM SHEET ---------------- */}
      <EditDetailsBottomSheet
        isOpen={isEditingDetailsSheetOpen}
        isSaving={isSavingDetails}
        tempTitle={tempTitle}
        tempCapacity={tempCapacity}
        tempCoverImage={tempCoverImage}
        fileInputRef={detailsFileInputRef}
        onTitleChange={setTempTitle}
        onCapacityChange={setTempCapacity}
        onCoverImageChange={setTempCoverImage}
        onSave={handleSaveDetails}
        onClose={() => setIsEditingDetailsSheetOpen(false)}
      />

      {/* ---------------- 👥 EDIT CAPACITY / PLAN SIZE BOTTOM SHEET ---------------- */}
      <EditCapacityBottomSheet
        isOpen={isEditingCapacitySheetOpen}
        capacity={Number(
          selectedPlan?.capacity ||
          (selectedPlan as any)?.max_participants ||
          selectedPlan?.maxParticipants ||
          selectedPlan?.joinLimit ||
          rawDbPlan?.max_participants ||
          2
        )}
        invitedCount={
          selectedPlan?.members?.length ||
          (createMode && plan?.members ? plan.members.length : undefined)
        }
        minCapacity={2}
        maxCapacity={50}
        onCapacityChange={handleCapacityChange}
        onAddParticipants={() => {
          setIsEditingCapacitySheetOpen(false);
          if (createMode) {
            if (onAddParticipants) {
              onAddParticipants();
            } else if (onEditParticipants) {
              onEditParticipants();
            }
          } else {
            setShowParticipantManagement(true);
          }
        }}
        onClose={() => setIsEditingCapacitySheetOpen(false)}
      />

      {/* Location bottom sheet removed – location editing is now inline */}


    </motion.div>
  );
};

export default React.memo(PlansDetailsScreen);
