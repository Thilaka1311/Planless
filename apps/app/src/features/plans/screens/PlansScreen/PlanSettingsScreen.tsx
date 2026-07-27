import React, { useState, useMemo } from "react";
import { ChevronLeft, Crown, Users } from "lucide-react";
import { Plan, UserProfile } from "../../../../core/types";
import { UserAvatar } from "../../../../IMGfromDB/UserAvatar";
import { useToast } from "../../../../shared/contexts/ToastContext";

interface PlanSettingsScreenProps {
  plan: Plan;
  userProfile: UserProfile;
  isCreatorHost?: boolean;
  onBack: () => void;
  onUpdateSettings?: (settings: {
    allowParticipantInvites?: boolean;
    maxParticipants?: number;
  }) => Promise<void> | void;
  onDemoteHost?: (userId: string) => Promise<void> | void;
  onRemoveParticipant?: (userId: string) => Promise<void> | void;
  onSelectHost?: (hostItem: { id: string; dbUuid: string; name: string; avatar: string; isHost: boolean }) => void;
}

export const PlanSettingsScreen: React.FC<PlanSettingsScreenProps> = ({
  plan,
  userProfile,
  onBack,
  onUpdateSettings,
  onDemoteHost,
  onRemoveParticipant,
  onSelectHost,
}) => {
  const { showToast } = useToast();

  // Local Settings States
  const [allowInvites, setAllowInvites] = useState<boolean>(
    plan.allowParticipantInvites ?? false
  );

  const members = plan.members || [];
  const activeUserUuid = userProfile.dbUuid || userProfile.user_id || "";

  // Derive ALL hosts strictly from plan_participants with "You" at top and remaining sorted alphabetically
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

  // Action sheet state for host card tap inside Plan Settings
  const [selectedHost, setSelectedHost] = useState<{
    id: string;
    dbUuid: string;
    name: string;
    avatar: string;
    isHost: boolean;
    isSelf: boolean;
  } | null>(null);
  const [showConfirmRemoveHost, setShowConfirmRemoveHost] = useState(false);

  const closeHostSheet = () => {
    setSelectedHost(null);
    setShowConfirmRemoveHost(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Header */}
      <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-center">
          Plan Settings
        </h1>
        <div className="w-9" />
      </div>

      {/* Main Settings Scroll Container */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-6 pb-12">
        {/* ========================================== */}
        {/* SECTION 1 — PARTICIPANTS */}
        {/* ========================================== */}
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
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 2 — HOSTS */}
        {/* ========================================== */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Crown className="w-4 h-4 text-[#FF6B2C]" />
            <h2 className="text-xs font-bold text-zinc-400">
              Hosts
            </h2>
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
                      setSelectedHost(h);
                      setShowConfirmRemoveHost(false);
                      if (onSelectHost) onSelectHost(h);
                    }}
                    className="flex items-center justify-between p-3 bg-black/40 hover:bg-white/[0.04] active:scale-[0.99] border border-white/[0.06] rounded-xl cursor-pointer transition"
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

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
};
