import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, Crown, Users, Plus, Check, Pencil, LogOut, Trash2 } from "lucide-react";
import { Plan, UserProfile } from "../../../../../core/types";
import { UserAvatar } from "../../../../../IMGfromDB/UserAvatar";
import { useToast } from "../../../../../shared/contexts/ToastContext";
import { normalizeStatus } from "../../../../../../lib/participantStatus";
import { DiscoveryImages } from "../../../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../../../config/planCoverImages";

interface PlanSettingsScreenProps {
  plan: Plan;
  userProfile: UserProfile;
  isCreatorHost?: boolean;
  mode?: "host" | "participant";
  onBack: () => void;
  onUpdateSettings?: (settings: {
    allowParticipantInvites?: boolean;
    maxParticipants?: number;
  }) => Promise<void> | void;
  onDemoteHost?: (userId: string) => Promise<void> | void;
  onRemoveParticipant?: (userId: string) => Promise<void> | void;
  onSelectHost?: (hostItem: { id: string; dbUuid: string; name: string; avatar: string; isHost: boolean }) => void;
  onPromoteToHost?: (userId: string) => Promise<void> | void;
  onEditTitle?: (newTitle: string) => Promise<void> | void;
  onEditCoverImage?: (newCoverUrl: string) => Promise<void> | void;
  onLeavePlan?: () => Promise<void> | void;
  onCancelPlan?: () => Promise<void> | void;
}

export const PlanSettingsScreen: React.FC<PlanSettingsScreenProps> = ({
  plan,
  userProfile,
  isCreatorHost,
  mode: propMode,
  onBack,
  onUpdateSettings,
  onDemoteHost,
  onRemoveParticipant,
  onSelectHost,
  onPromoteToHost,
  onEditTitle,
  onEditCoverImage,
  onLeavePlan,
  onCancelPlan,
}) => {
  const { showToast } = useToast();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const [allowInvites, setAllowInvites] = useState<boolean>(
    plan.allowParticipantInvites ?? false
  );

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState(plan.title || "");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleSaveTitle = async () => {
    const trimmed = newTitleInput.trim();
    if (!trimmed || trimmed === plan.title) {
      setNewTitleInput(plan.title || "");
      setIsEditingTitle(false);
      return;
    }
    if (isSavingTitle) return;
    setIsSavingTitle(true);
    try {
      if (onEditTitle) {
        await onEditTitle(trimmed);
        showToast("✓ Plan title updated");
      }
      setIsEditingTitle(false);
    } catch {
      showToast("Failed to update plan title");
      setNewTitleInput(plan.title || "");
      setIsEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imageUrl = URL.createObjectURL(file);
      if (onEditCoverImage) {
        await onEditCoverImage(imageUrl);
        showToast("✓ Plan image updated");
      }
    } catch {
      showToast("Failed to update plan image");
    }
  };

  const members = plan.members || [];
  const activeUserUuid = userProfile.dbUuid || userProfile.user_id || "";

  const allHosts = useMemo(() => {
    const rawHosts = members
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

    const currentUserHost = rawHosts.find((h) => h.isSelf);
    const remainingHosts = rawHosts
      .filter((h) => !h.isSelf)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

    return [
      ...(currentUserHost ? [currentUserHost] : []),
      ...remainingHosts,
    ];
  }, [members, activeUserUuid]);

  const isHostUser = useMemo(() => {
    if (isCreatorHost) return true;
    return allHosts.some((h) => h.isSelf);
  }, [isCreatorHost, allHosts]);

  const mode: "host" | "participant" = propMode || (isHostUser ? "host" : "participant");
  const isHostMode = mode === "host";

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

  const eligibleGoingParticipants = useMemo(() => {
    return members
      .filter((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        if (hostIds.has(uId)) return false;
        const status = normalizeStatus(m.joinState || m.rsvp_status);
        return status === "JOINED";
      })
      .map((m) => {
        const uId = m.userId || m.userUuid || (m as any).user_id || m.id || "";
        const isSelf = Boolean(activeUserUuid && uId === activeUserUuid);
        return {
          id: uId,
          dbUuid: m.userUuid || uId,
          name: isSelf ? "You" : (m.name || m.displayName || "Unknown"),
          avatar: m.avatar || m.profile_photo || "",
        };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  }, [members, hostIds, activeUserUuid]);

  const handleToggleInvites = async () => {
    const previousVal = allowInvites;
    const nextVal = !allowInvites;
    setAllowInvites(nextVal);
    try {
      if (onUpdateSettings) {
        await onUpdateSettings({ allowParticipantInvites: nextVal });
      }
    } catch (err) {
      setAllowInvites(previousVal);
      showToast("Failed to update setting. Please try again.");
    }
  };

  const handleDemoteHost = async (userId: string) => {
    if (!onDemoteHost) return;
    try {
      await onDemoteHost(userId);
      showToast("✓ Host removed");
    } catch (err) {
      showToast("Failed to remove host. Please try again.");
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
    setSelectedParticipantIds((prev) =>
      prev.includes(uId) ? prev.filter((id) => id !== uId) : [...prev, uId]
    );
  };

  const handleConfirmPromoteToHosts = async () => {
    if (selectedParticipantIds.length === 0 || isPromoting || !onPromoteToHost) return;
    setIsPromoting(true);
    try {
      for (const uId of selectedParticipantIds) {
        await onPromoteToHost(uId);
      }

      if (selectedParticipantIds.length === 1) {
        const p = eligibleGoingParticipants.find((x) => x.id === selectedParticipantIds[0]);
        showToast(`✓ ${p?.name || "Participant"} is now a host`);
      } else {
        showToast(`✓ Promoted ${selectedParticipantIds.length} hosts`);
      }

      setShowAddHostPicker(false);
      setSelectedParticipantIds([]);
    } catch (err) {
      showToast("Failed to promote hosts. Please try again.");
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

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
          <div className="w-[110px] h-[110px] rounded-full overflow-hidden border-2 border-white/20 shadow-2xl relative bg-zinc-900 mb-4 flex-shrink-0">
            <DiscoveryImages
              src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
              category={plan.category}
              alt={plan.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="w-full max-w-sm px-4 flex items-center justify-center min-h-[36px]">
            {isHostMode && isEditingTitle ? (
              <div className="w-full relative flex items-center justify-center animate-in fade-in zoom-in-95 duration-150">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={newTitleInput}
                  onChange={(e) => setNewTitleInput(e.target.value.slice(0, 50))}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      titleInputRef.current?.blur();
                    } else if (e.key === "Escape") {
                      setNewTitleInput(plan.title || "");
                      setIsEditingTitle(false);
                    }
                  }}
                  maxLength={50}
                  placeholder="Plan title"
                  className="w-full bg-zinc-900 border-b-2 border-[#FF6B2C] text-2xl font-bold text-white text-center focus:outline-none py-1 transition select-text"
                />
              </div>
            ) : isHostMode ? (
              <button
                type="button"
                onClick={() => {
                  setNewTitleInput(plan.title || "");
                  setIsEditingTitle(true);
                }}
                className="group flex items-center justify-center gap-2 max-w-full hover:opacity-90 active:scale-[0.99] transition cursor-pointer"
                title="Edit Plan Name"
              >
                <h1 className="text-2xl font-bold text-white tracking-tight truncate max-w-full">
                  {plan.title}
                </h1>
                <Pencil className="w-4.5 h-4.5 text-zinc-400 group-hover:text-white transition-colors flex-shrink-0" />
              </button>
            ) : (
              <h1 className="text-2xl font-bold text-white tracking-tight truncate max-w-full">
                {plan.title}
              </h1>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 1 — PARTICIPANTS (HOST MODE ONLY) */}
        {/* ========================================== */}
        {isHostMode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-4 h-4 text-[#FF6B2C]" />
              <h2 className="text-xs font-bold text-zinc-400">
                Participants
              </h2>
            </div>

            <div className="bg-[#111111] border border-white/[0.08] rounded-2xl p-4.5">
              {/* Setting 1: Allow participants to invite others */}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 pr-2">
                  <span className="text-sm font-semibold text-white block">
                    Allow Participants to Invite Others
                  </span>
                  <span className="text-xs text-zinc-400 block leading-relaxed">
                    Participants can invite additional people to this plan.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleInvites}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer flex-shrink-0 ${allowInvites ? "bg-[#FF6B2C]" : "bg-zinc-800"
                    }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${allowInvites ? "translate-x-5" : "translate-x-0"
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SECTION 2 — HOSTS */}
        {/* ========================================== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#FF6B2C]" />
              <h2 className="text-xs font-bold text-zinc-400">
                Hosts
              </h2>
            </div>
            {/* Add Host button — only shown in Host Mode when there are eligible Going participants */}
            {isHostMode && onPromoteToHost && eligibleGoingParticipants.length > 0 && (
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

          <div className="bg-[#111111] border border-white/[0.08] rounded-2xl p-4.5 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Hosts can edit plan settings, manage waitlists, invite participants, and manage host roles.
            </p>

            <div className="space-y-2.5">
              {allHosts.length > 0 ? (
                allHosts.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => {
                      if (!isHostMode) return;
                      setSelectedHost(h);
                      setShowConfirmRemoveHost(false);
                      if (onSelectHost) onSelectHost(h);
                    }}
                    className={`flex items-center justify-between p-3 bg-black/40 border border-white/[0.06] rounded-xl transition ${isHostMode ? "hover:bg-white/[0.04] active:scale-[0.99] cursor-pointer" : ""
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
                <div className="p-3 bg-black/20 border border-dashed border-white/10 rounded-xl text-center">
                  <span className="text-xs text-zinc-500">
                    No hosts assigned.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={isLeaving}
            onClick={async () => {
              if (onLeavePlan) {
                setIsLeaving(true);
                try {
                  await onLeavePlan();
                } catch {
                  showToast("Failed to leave plan");
                } finally {
                  setIsLeaving(false);
                }
              } else if (onRemoveParticipant) {
                setIsLeaving(true);
                try {
                  await onRemoveParticipant(activeUserUuid);
                  showToast("You left the plan");
                  onBack();
                } catch {
                  showToast("Failed to leave plan");
                } finally {
                  setIsLeaving(false);
                }
              } else {
                showToast("Leave plan feature coming soon");
              }
            }}
            className="w-full bg-[#111111] hover:bg-red-500/10 active:scale-[0.99] border border-white/[0.08] hover:border-red-500/30 rounded-2xl p-4 flex items-center gap-3.5 transition cursor-pointer group text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-105 transition flex-shrink-0">
              <LogOut className="w-4.5 h-4.5 text-red-500" />
            </div>
            <span className="text-sm font-semibold text-red-500 tracking-wide">
              {isLeaving ? "Leaving Plan..." : "Leave Plan"}
            </span>
          </button>

          {isHostMode && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="w-full bg-[#111111] hover:bg-red-500/10 active:scale-[0.99] border border-white/[0.08] hover:border-red-500/30 rounded-2xl p-4 flex items-center gap-3.5 transition cursor-pointer group text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-105 transition flex-shrink-0">
                <Trash2 className="w-4.5 h-4.5 text-red-500" />
              </div>
              <span className="text-sm font-semibold text-red-500 tracking-wide">
                Cancel Plan
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Participant Action Bottom Sheet for Host Cards in Plan Settings ── */}
      {selectedHost && (
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
                        showToast(selectedHost.isSelf ? "You left the plan" : "✓ Participant removed");
                      } catch {
                        showToast("Failed to remove participant");
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

      {/* Cancel Plan Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white tracking-tight">
              Cancel this plan?
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This action cannot be undone. All participants will be notified that the plan has been cancelled.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={async () => {
                  setIsCancelling(true);
                  try {
                    if (onCancelPlan) {
                      await onCancelPlan();
                    } else {
                      // Fallback / TODO placeholder
                      showToast("Plan cancellation feature coming soon");
                    }
                    setShowCancelModal(false);
                    onBack();
                  } catch {
                    showToast("Failed to cancel plan");
                  } finally {
                    setIsCancelling(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition cursor-pointer shadow-md"
              >
                {isCancelling ? "Cancelling..." : "Cancel Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
};
