import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, Crown, Users, Plus, Check, Settings, LogOut } from "lucide-react";
import { Plan, UserProfile } from "../../../../../core/types";
import { UserAvatar } from "../../../../../IMGfromDB/UserAvatar";
import { normalizeStatus } from "../../../../../../lib/participantStatus";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../../../config/planCoverImages";
import { usePlansStore } from "../../../state/PlansContext";
import { MakeAnotherParticipantHostBottomSheet, CancelPlanBottomSheet } from "../../../components/BottomSheets";
import { EditPlanImageScreen } from "./EditPlanImageScreen";
import { cleanPlanId } from "../../../utils/planUtils";
import { supabase } from "../../../../../../lib/supabaseClient";

interface PlanSettingsScreenProps {
  plan: Plan;
  userProfile: UserProfile;
  isCreatorHost?: boolean;
  isPlanSettingsForParticipant?: boolean;
  mode?: "host" | "participant";
  onBack: () => void;
  onUpdateSettings?: (settings: {
    allowParticipantInvites?: boolean;
    maxParticipants?: number;
  }) => Promise<void> | void;
  onUpdatePlanDetails?: (updates: any) => Promise<void> | void;
  onDemoteHost?: (userId: string) => Promise<void> | void;
  onRemoveParticipant?: (userId: string) => Promise<void> | void;
  onSelectHost?: (hostItem: { id: string; dbUuid: string; name: string; avatar: string; isHost: boolean }) => void;
  onPromoteToHost?: (userId: string) => Promise<void> | void;
  onEditTitle?: (newTitle: string) => Promise<void> | void;
  onEditCoverImage?: (newCoverUrl: string, blob?: Blob) => Promise<void> | void;
  onLeavePlan?: () => Promise<void> | void;
  onCancelPlan?: () => Promise<void> | void;
}

export const PlanSettingsScreen: React.FC<PlanSettingsScreenProps> = ({
  plan,
  userProfile,
  isCreatorHost,
  isPlanSettingsForParticipant: propIsPlanSettingsForParticipant,
  mode: propMode,
  onBack,
  onUpdateSettings,
  onUpdatePlanDetails,
  onDemoteHost,
  onRemoveParticipant,
  onSelectHost,
  onPromoteToHost,
  onEditTitle,
  onEditCoverImage,
  onLeavePlan,
  onCancelPlan,
}) => {

  const [showManagePlanSheet, setShowManagePlanSheet] = useState(false);
  const [showPromoteHostToLeaveModal, setShowPromoteHostToLeaveModal] = useState(false);
  const [promotingToLeaveUserId, setPromotingToLeaveUserId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Edit Image Screen navigation & state
  const [showEditImageScreen, setShowEditImageScreen] = useState(false);
  const [currentCoverImage, setCurrentCoverImage] = useState<string | null | undefined>(plan.coverImage);

  useEffect(() => {
    setCurrentCoverImage(plan.coverImage);
  }, [plan.coverImage]);

  const [allowInvites, setAllowInvites] = useState<boolean>(
    plan.allowParticipantInvites ?? false
  );

  const [newTitleInput, setNewTitleInput] = useState(plan.title || "");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNewTitleInput(plan.title || "");
  }, [plan.title]);

  useEffect(() => {
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = "auto";
      titleTextareaRef.current.style.height = `${titleTextareaRef.current.scrollHeight}px`;
    }
  }, [newTitleInput]);

  const members = plan.members || [];
  const activeUserUuid = userProfile.dbUuid || (userProfile as any).id || userProfile.user_id || "";

  // Single unified role flag controlling all participant vs host behavior
  const isPlanSettingsForParticipant = useMemo(() => {
    if (propIsPlanSettingsForParticipant !== undefined) {
      return propIsPlanSettingsForParticipant;
    }
    if (propMode === "participant") return true;
    if (propMode === "host") return false;
    if (isCreatorHost) return false;

    const userIds = new Set<string>();
    if (activeUserUuid) userIds.add(activeUserUuid);
    if (userProfile?.dbUuid) userIds.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) userIds.add((userProfile as any).id);
    if (userProfile?.user_id) userIds.add(userProfile.user_id);

    // Check if user is the creator or hostId of the plan
    if (plan.hostId && userIds.has(plan.hostId)) return false;
    if (plan.creatorId && userIds.has(plan.creatorId)) return false;

    // Check members list for isHost or role === 'HOST'
    const memberMatch = plan.members?.find((m) => {
      const uId = m.userId || m.userUuid || (m as any).user_id || m.id;
      return uId && userIds.has(uId);
    });

    if (memberMatch) {
      const isHostRole = Boolean(
        memberMatch.isHost ||
        (memberMatch.role && memberMatch.role.toUpperCase() === "HOST")
      );
      return !isHostRole;
    }

    return true;
  }, [propIsPlanSettingsForParticipant, propMode, isCreatorHost, userProfile, activeUserUuid, plan.hostId, plan.creatorId, plan.members]);

  const handleSaveTitle = async () => {
    if (isPlanSettingsForParticipant) return;
    const trimmed = newTitleInput.trim();
    if (!trimmed || trimmed === plan.title) {
      setNewTitleInput(plan.title || "");
      return;
    }
    if (isSavingTitle) return;
    setIsSavingTitle(true);
    try {
      if (onEditTitle) {
        await onEditTitle(trimmed);
      }
    } catch {
      setNewTitleInput(plan.title || "");
    } finally {
      setIsSavingTitle(false);
    }
  };

  const planCapacity = plan.plan_size ?? (plan as any).planSize ?? plan.maxParticipants ?? (plan as any).max_participants ?? (plan as any).joinLimit ?? (plan as any).capacity ?? 0;
  const waitlistCount = useMemo(() => {
    return members.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status || (m as any).status);
      const group = (m as any).assignedGroup || (m as any).assigned_group;
      return status === "WAITLISTED" || (status as string) === "WAITLIST" || group === "WAITLIST";
    }).length;
  }, [members]);

  const totalJoinedOrWaitlisted = useMemo(() => {
    return members.filter((m) => {
      const status = normalizeStatus(m.joinState || m.rsvp_status || (m as any).status);
      return status === "JOINED" || status === "WAITLISTED" || (status as string) === "WAITLIST";
    }).length;
  }, [members]);

  const allHosts = useMemo(() => {
    let rawHosts = members
      .filter((m) => Boolean(m.isHost || (m as any).role === "HOST"))
      .map((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        const isSelf = Boolean(activeUserUuid && (uId === activeUserUuid || m.userUuid === activeUserUuid || m.userId === activeUserUuid));
        return {
          id: uId,
          dbUuid: m.userUuid || uId,
          name: isSelf ? "You" : (m.name || "Host"),
          avatar: m.avatar || "",
          isHost: true,
          isSelf,
        };
      });

    if (rawHosts.length === 0 && (plan.hostId || plan.creatorId || plan.creatorName)) {
      const hostId = plan.hostId || plan.creatorId || "";
      const isSelf = Boolean(activeUserUuid && (hostId === activeUserUuid));
      rawHosts = [{
        id: hostId,
        dbUuid: hostId,
        name: isSelf ? "You" : (plan.creatorName || "Host"),
        avatar: plan.creatorAvatar || "",
        isHost: true,
        isSelf,
      }];
    }

    const currentUserHost = rawHosts.find((h) => h.isSelf);
    const remainingHosts = rawHosts
      .filter((h) => !h.isSelf)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

    return [
      ...(currentUserHost ? [currentUserHost] : []),
      ...remainingHosts,
    ];
  }, [members, activeUserUuid, plan.hostId, plan.creatorId, plan.creatorName, plan.creatorAvatar]);

  const allParticipants = useMemo(() => {
    return members
      .filter((m) => {
        const status = normalizeStatus(m.joinState || m.rsvp_status);
        return status === "JOINED" || status === "WAITLISTED" || status === "INVITED";
      })
      .map((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        const isSelf = Boolean(activeUserUuid && (uId === activeUserUuid || m.userUuid === activeUserUuid || m.userId === activeUserUuid));
        return {
          id: uId,
          name: isSelf ? "You" : (m.name || m.displayName || "Participant"),
          avatar: m.avatar || m.profile_photo || "",
          isSelf,
        };
      })
      .sort((a, b) => {
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;
        return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
      });
  }, [members, activeUserUuid]);

  const hostIds = useMemo(() => new Set(allHosts.map((h) => h.id)), [allHosts]);

  const nonHostParticipants = useMemo(() => {
    return allParticipants.filter((p) => !hostIds.has(p.id));
  }, [allParticipants, hostIds]);

  const { requestHostLeaveWithReplacement, stopHostingWithReplacement } = usePlansStore();
  const [isPromotingToLeave, setIsPromotingToLeave] = useState(false);
  const [hostReplacementMode, setHostReplacementMode] = useState<'leave' | 'stop_hosting'>('leave');

  const eligibleGoingParticipants = useMemo(() => {
    return members
      .filter((m) => {
        const status = normalizeStatus(m.joinState || m.rsvp_status || (m as any).status);
        const isHost = Boolean(m.isHost || (m as any).role === "HOST");
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        const isSelf = Boolean(
          activeUserUuid &&
            (uId === activeUserUuid ||
              m.userUuid === activeUserUuid ||
              m.userId === activeUserUuid)
        );
        return status === "JOINED" && !isHost && !isSelf;
      })
      .map((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        return {
          id: uId,
          dbUuid: m.userUuid || uId,
          name: m.name || m.displayName || "Participant",
          avatar: m.avatar || m.profile_photo || "",
          username: m.username
        };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  }, [members, hostIds, activeUserUuid]);

  const isSoleHost = allHosts.length <= 1 && !isPlanSettingsForParticipant;

  const myParticipantRecord = useMemo(() => {
    return members.find((m) => {
      const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
      return activeUserUuid && (uId === activeUserUuid || m.userUuid === activeUserUuid || m.userId === activeUserUuid);
    });
  }, [members, activeUserUuid]);

  const isLeaveRequested = myParticipantRecord?.leave_requested === true || (myParticipantRecord as any)?.leaveRequested === true;

  const executeLeavePlanFlow = async () => {
    if (isLeaveRequested) {
      return;
    }
    setIsLeaving(true);
    try {
      if (onLeavePlan) {
        await onLeavePlan();
        onBack();
      } else if (onRemoveParticipant) {
        await onRemoveParticipant(activeUserUuid);
        onBack();
      }
    } catch (err) {
      // error handled silently
    } finally {
      setIsLeaving(false);
    }
  };

  const handleConfirmHostReplacement = async (selectedReplacementId: string) => {
    setIsPromotingToLeave(true);
    try {
      const planUuid = (plan as any).dbUuid || plan.id;
      const replacementUser = eligibleGoingParticipants.find(p => p.id === selectedReplacementId);
      const replacementName = replacementUser?.name || "participant";

      if (hostReplacementMode === 'stop_hosting') {
        await stopHostingWithReplacement(planUuid, selectedReplacementId);
        setShowPromoteHostToLeaveModal(false);
      } else {
        await requestHostLeaveWithReplacement(planUuid, selectedReplacementId);
        setShowPromoteHostToLeaveModal(false);
        onBack();
      }
    } catch (err: any) {
      console.error("[PlanSettingsScreen] Host replacement failed:", err);
    } finally {
      setIsPromotingToLeave(false);
    }
  };

  const handleToggleInvites = async () => {
    if (isPlanSettingsForParticipant) return;
    const previousVal = allowInvites;
    const nextVal = !allowInvites;
    setAllowInvites(nextVal);
    try {
      if (onUpdateSettings) {
        await onUpdateSettings({ allowParticipantInvites: nextVal });
      }
    } catch (err) {
      setAllowInvites(previousVal);
    }
  };

  const handleDemoteHost = async (userIdToDemote: string) => {
    if (isPlanSettingsForParticipant) return;
    const isSelfHost = Boolean(
      activeUserUuid &&
      (userIdToDemote === activeUserUuid ||
        selectedHost?.isSelf ||
        selectedHost?.dbUuid === activeUserUuid ||
        selectedHost?.id === activeUserUuid)
    );

    if (isSelfHost && isSoleHost) {
      setHostReplacementMode('stop_hosting');
      setShowPromoteHostToLeaveModal(true);
      return;
    }

    if (!onDemoteHost) return;
    try {
      await onDemoteHost(userIdToDemote);
    } catch (err: any) {
      console.error("[PlanSettingsScreen handleDemoteHost] error:", err);
    }
  };

  const [selectedHost, setSelectedHost] = useState<{
    id: string;
    dbUuid: string;
    name: string;
    avatar: string;
    isHost: boolean;
    isSelf?: boolean;
  } | null>(null);
  const [showConfirmRemoveHost, setShowConfirmRemoveHost] = useState(false);

  const closeHostSheet = () => {
    setSelectedHost(null);
    setShowConfirmRemoveHost(false);
  };

  const [showAddHostPicker, setShowAddHostPicker] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [isPromoting, setIsPromoting] = useState(false);

  const toggleSelectParticipant = (uId: string) => {
    if (isPlanSettingsForParticipant) return;
    setSelectedParticipantIds((prev) =>
      prev.includes(uId) ? prev.filter((id) => id !== uId) : [...prev, uId]
    );
  };

  const handleConfirmPromoteToHosts = async () => {
    if (isPlanSettingsForParticipant || selectedParticipantIds.length === 0 || isPromoting || !onPromoteToHost) return;
    setIsPromoting(true);
    try {
      for (const uId of selectedParticipantIds) {
        await onPromoteToHost(uId);
      }

      setShowAddHostPicker(false);
      setSelectedParticipantIds([]);
    } catch (err) {
      // error handled silently
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Header Bar with Left-Aligned Back Arrow and Title */}
      <div className="px-4 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-2 flex items-center gap-2 flex-shrink-0 relative z-30 min-h-[48px]">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-white tracking-tight">
          Plan Settings
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-6 pb-12">
        <div className="flex flex-col items-center justify-center pt-2 pb-6 text-center border-b border-white/10">
          <div
            onClick={!isPlanSettingsForParticipant ? () => setShowEditImageScreen(true) : undefined}
            className={`w-[110px] h-[110px] rounded-full overflow-hidden border-2 border-white/20 shadow-2xl relative bg-zinc-900 mb-4 flex-shrink-0 ${
              !isPlanSettingsForParticipant ? "cursor-pointer hover:border-white/40 active:scale-95 transition-all" : ""
            }`}
            title={!isPlanSettingsForParticipant ? "Edit Image" : undefined}
          >
            <DiscoveryImages
              src={currentCoverImage}
              planId={plan.dbUuid || plan.id}
              category="CUSTOM"
              subcategory={null}
              screen="Plan Settings"
              alt={plan.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="w-full max-w-sm px-4 flex items-center justify-center min-h-[36px]">
            {!isPlanSettingsForParticipant ? (
              <textarea
                ref={titleTextareaRef}
                value={newTitleInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[\r\n]+/g, " ").slice(0, 50);
                  setNewTitleInput(val);
                }}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    titleTextareaRef.current?.blur();
                  } else if (e.key === "Escape") {
                    setNewTitleInput(plan.title || "");
                    titleTextareaRef.current?.blur();
                  }
                }}
                maxLength={50}
                rows={1}
                placeholder="Plan title"
                className="w-full max-w-sm bg-transparent text-[22px] sm:text-2xl font-bold text-white tracking-tight text-center focus:outline-none border-none outline-none shadow-none appearance-none cursor-text caret-[#FF6B2C] resize-none overflow-hidden leading-tight p-0 m-0"
              />
            ) : (
              <h1 className="w-full max-w-sm text-[22px] sm:text-2xl font-bold text-white tracking-tight text-center leading-tight line-clamp-2 break-words p-0 m-0 select-text">
                {plan.title}
              </h1>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 1 — PARTICIPANTS */}
        {/* ========================================== */}
        <div className="space-y-3 px-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF6B2C]" />
            <h2 className="text-xs font-bold text-zinc-400">
              Participants
            </h2>
          </div>

          {/* Setting 1: Allow participants to invite others (Host only) */}
          {!isPlanSettingsForParticipant && (
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm font-semibold text-white block pr-2">
                Allow Participants to Invite Others
              </span>
              <button
                type="button"
                onClick={handleToggleInvites}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  allowInvites ? "bg-[#FF6B2C]" : "bg-zinc-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                    allowInvites ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Participant list if any participants exist */}
          {nonHostParticipants.length > 0 ? (
            <div className="space-y-2 py-1">
              {nonHostParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <UserAvatar
                        src={p.avatar}
                        alt={p.name}
                        size="w-9 h-9"
                        className="border border-white/10"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-white truncate block">
                        {p.name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : isPlanSettingsForParticipant ? (
            <div className="py-2">
              <span className="text-xs text-zinc-500">
                No participants yet.
              </span>
            </div>
          ) : null}
        </div>

        {/* ========================================== */}
        {/* SECTION 2 — HOSTS */}
        {/* ========================================== */}
        <div className="space-y-3 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#FF6B2C]" />
              <h2 className="text-xs font-bold text-zinc-400">
                Hosts
              </h2>
            </div>
            {/* Add Host button — only shown in Host Mode when there are eligible Going participants */}
            {!isPlanSettingsForParticipant && onPromoteToHost && eligibleGoingParticipants.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAddHostPicker(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.1] text-white text-[11px] font-semibold cursor-pointer active:scale-95 transition hover:bg-white/[0.10]"
              >
                <Plus className="w-3 h-3" />
                Add Host
              </button>
            )}
          </div>

          <div className="space-y-2 py-1">
            <div className="space-y-2">
              {allHosts.length > 0 ? (
                allHosts.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => {
                      if (isPlanSettingsForParticipant) return;
                      setSelectedHost(h);
                      setShowConfirmRemoveHost(false);
                      if (onSelectHost) onSelectHost(h);
                    }}
                    className={`flex items-center justify-between py-2 transition ${
                      !isPlanSettingsForParticipant ? "hover:opacity-80 active:scale-[0.99] cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <UserAvatar
                          src={h.avatar}
                          alt={h.name}
                          size="w-9 h-9"
                          className="border border-white/10"
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-white truncate block">
                          {h.name}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-2 text-center">
                  <span className="text-xs text-zinc-500">
                    No hosts assigned.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 3 — ACTIONS */}
        {/* ========================================== */}
        <div className="pt-2 space-y-3 px-1">
          {isPlanSettingsForParticipant ? (
            /* Participant: red Leave Plan button */
            <button
              type="button"
              disabled={isLeaving}
              onClick={() => {
                if (isSoleHost) {
                  setHostReplacementMode('leave');
                  setShowPromoteHostToLeaveModal(true);
                } else {
                  executeLeavePlanFlow();
                }
              }}
              className="w-full py-2.5 flex items-center gap-3.5 transition cursor-pointer active:scale-[0.99] group text-left"
            >
              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center group-hover:scale-105 transition flex-shrink-0">
                <LogOut className="w-4.5 h-4.5 text-red-500" />
              </div>
              <span className="text-sm font-semibold text-red-500 tracking-wide">
                {isLeaving ? "Leaving Plan..." : "Leave Plan"}
              </span>
            </button>
          ) : (
            /* Host: white Manage This Plan button */
            <button
              type="button"
              onClick={() => setShowManagePlanSheet(true)}
              className="w-full py-2.5 flex items-center gap-3.5 transition cursor-pointer active:scale-[0.99] group text-left"
            >
              <div className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-white group-hover:scale-105 transition flex-shrink-0">
                <Settings className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">
                Manage This Plan
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Participant Action Bottom Sheet for Host Cards in Plan Settings ── */}
      {!isPlanSettingsForParticipant && selectedHost && (
        <div
          onClick={closeHostSheet}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: '#1C1C1E',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '16px 20px 32px',
              color: '#FFFFFF',
              boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
              animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255, 255, 255, 0.15)' }} />
            </div>

            {/* Person header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <UserAvatar src={selectedHost.avatar} alt={selectedHost.name} size="w-10 h-10" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{selectedHost.name}</span>
                <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)' }}>
                  Host
                </span>
              </div>
            </div>

            {!showConfirmRemoveHost ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Stop Hosting / Remove Host */}
                {onDemoteHost && (
                  <button
                    type="button"
                    onClick={async () => {
                      const hostIdToDemote = selectedHost.id;
                      closeHostSheet();
                      await handleDemoteHost(hostIdToDemote);
                    }}
                    style={{ width: '100%', padding: '14px', background: 'rgba(245,158,11,0.08)', border: 'none', borderRadius: 12, color: '#F59E0B', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  >
                    {selectedHost.isSelf ? "Stop Hosting" : "Remove Host"}
                  </button>
                )}

                {/* Leave Plan / Remove from Plan */}
                {(onRemoveParticipant || onDemoteHost) && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmRemoveHost(true)}
                    style={{ width: '100%', padding: '14px', background: 'rgba(239,68,68,0.08)', border: 'none', borderRadius: 12, color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  >
                    {selectedHost.isSelf ? "Leave Plan" : "Remove from Plan"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeHostSheet}
                  style={{ width: '100%', padding: '14px', background: 'none', border: 'none', borderRadius: 12, color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'center', marginTop: 8 }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', margin: '8px 0' }}>
                  {selectedHost.isSelf
                    ? "Leave this plan?"
                    : `Remove "${selectedHost.name}" from this plan?`}
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowConfirmRemoveHost(false)}
                    style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const hostIdToRemove = selectedHost.id;
                      closeHostSheet();
                      try {
                        if (onRemoveParticipant) {
                          await onRemoveParticipant(hostIdToRemove);
                        } else if (onDemoteHost) {
                          await onDemoteHost(hostIdToRemove);
                        }
                      } catch {
                        // error handled silently
                      }
                    }}
                    style={{ flex: 1, padding: '14px', background: '#EF4444', border: 'none', borderRadius: 12, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {selectedHost.isSelf ? "Leave" : "Remove"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Host Picker Bottom Sheet ── */}
      {showAddHostPicker && (
        <div
          onClick={() => setShowAddHostPicker(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'flex-end',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: '#1C1C1E',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '16px 0 32px',
              color: '#FFFFFF',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              animation: 'slideUp 0.28s cubic-bezier(0.25,1,0.5,1)',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 16px' }}>
              <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* Header */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
                Add Host
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}>
                Select a Going participant to promote to host.
              </p>
            </div>

            {/* Participant list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {eligibleGoingParticipants.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                  No eligible participants.
                </div>
              ) : (
                eligibleGoingParticipants.map((p) => {
                  const isSelected = selectedParticipantIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isPromoting}
                      onClick={() => toggleSelectParticipant(p.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 12,
                        cursor: isPromoting ? 'default' : 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      <UserAvatar src={p.avatar} alt={p.name} size="w-10 h-10" className="flex-shrink-0" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', display: 'block', fontFamily: 'Inter, sans-serif' }}>
                          {p.name}
                        </span>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}>
                          Going
                        </span>
                      </div>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.2)',
                          background: isSelected ? '#FF6B2C' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Action (Continue) */}
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                disabled={selectedParticipantIds.length === 0 || isPromoting}
                onClick={handleConfirmPromoteToHosts}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: selectedParticipantIds.length > 0 && !isPromoting ? '#FF6B2C' : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: 14,
                  color: selectedParticipantIds.length > 0 && !isPromoting ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: selectedParticipantIds.length > 0 && !isPromoting ? 'pointer' : 'not-allowed',
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.15s',
                }}
              >
                {isPromoting ? 'Promoting…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage This Plan Bottom Sheet */}
      <CancelPlanBottomSheet
        isOpen={showManagePlanSheet}
        plan={plan}
        onConfirmCancel={async () => {
          setShowManagePlanSheet(false);
          if (onCancelPlan) {
            await onCancelPlan();
          }
          onBack();
        }}
        onClose={() => setShowManagePlanSheet(false)}
      />

      {/* Promote a New Host Before Leaving / Stopping Hosting Modal (Sole Host Guard) */}
      {!isPlanSettingsForParticipant && (
        <MakeAnotherParticipantHostBottomSheet
          isOpen={showPromoteHostToLeaveModal}
          eligibleParticipants={eligibleGoingParticipants}
          isSubmitting={isPromotingToLeave}
          onConfirm={handleConfirmHostReplacement}
          onClose={() => setShowPromoteHostToLeaveModal(false)}
        />
      )}

      {/* ── Edit Image Screen ── */}
      {!isPlanSettingsForParticipant && showEditImageScreen && (
        <EditPlanImageScreen
          planId={cleanPlanId(plan.dbUuid || (plan as any).public_id || plan.id)}
          currentCoverImage={currentCoverImage}
          category={plan.category}
          subcategory={(plan as any).subcategory}
          title={plan.title}
          onBack={() => setShowEditImageScreen(false)}
          onImageUpdated={(newImage, newCardImage) => {
            setCurrentCoverImage(newImage);
            // If the parent wants to know about the card image update, pass it along
            if (onUpdatePlanDetails && newCardImage !== undefined) {
              onUpdatePlanDetails({ cover_card_image: newCardImage, skipDbWrite: true });
            }
          }}
          onUpdatePlanDetails={onUpdatePlanDetails}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
};
