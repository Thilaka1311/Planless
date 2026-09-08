import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, MessageSquare, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Plan, UserProfile } from "../../core/types";
import { usePlansStore } from "../../features/plans/state/PlansContext";
import { useLivePlan } from "../../features/plans/hooks/useLivePlan";
import { UserAvatar } from "../../IMGfromDB/UserAvatar";

interface TeamOrganizerModalProps {
  planId: string;
  userProfile: UserProfile;
  activeUserId?: string;
  onClose: () => void;
}

export default function TeamOrganizerModal({
  planId,
  userProfile,
  activeUserId,
  onClose,
}: TeamOrganizerModalProps) {
  const plan = useLivePlan(planId);
  useEffect(() => {
    
  }, [planId, plan]);
  if (!plan) return null;

  return (
    <TeamOrganizerModalContent
      plan={plan}
      userProfile={userProfile}
      activeUserId={activeUserId}
      onClose={onClose}
    />
  );
}

interface TeamOrganizerModalContentProps {
  plan: Plan;
  userProfile: UserProfile;
  activeUserId?: string;
  onClose: () => void;
}

function TeamOrganizerModalContent({
  plan,
  userProfile,
  activeUserId,
  onClose,
}: TeamOrganizerModalContentProps) {
  const { dbPlanTeamAssignments, getTeamAssignments, assignTeam, unassignTeam, removeParticipant } = usePlansStore();
  const planUuid = plan.dbUuid || plan.id;
  const [messages, setMessages] = useState<{ id: string; senderId: string; senderName?: string; sender?: { avatar?: string; name?: string }; content: string; timestamp: string; isOwn?: boolean; type?: string }[]>([]);
  const sendMessage = async (text: string) => {
    setMessages(prev => [...prev, {
      id: `msg_${Date.now()}`,
      senderId: (userProfile as any).dbUuid || (userProfile as any).id || "",
      senderName: userProfile.name || "Me",
      sender: { avatar: userProfile.avatar, name: userProfile.name || "Me" },
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true
    }]);
  };

  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeActionsUser, setActiveActionsUser] = useState<{ userId: string; userUuid: string; name: string; avatar: string } | null>(null);
  const [userToRemove, setUserToRemove] = useState<{ userId: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Local draft state for Kanban drag & drop
  const [draftAssignments, setDraftAssignments] = useState<Record<string, "A" | "B" | null>>({});
  const [savingTeams, setSavingTeams] = useState(false);

  // Setup team assignments on mount
  useEffect(() => {
    getTeamAssignments(planUuid).finally(() => setLoading(false));
  }, [planUuid]);

  // Load backend assignments into draft state when loaded or database state updates
  const planAssignments = useMemo(
    () => dbPlanTeamAssignments.filter((a) => a.plan_id === planUuid),
    [dbPlanTeamAssignments, planUuid]
  );

  useEffect(() => {
    const mapping: Record<string, "A" | "B" | null> = {};
    planAssignments.forEach((a) => {
      mapping[a.user_id] = a.team;
    });
    setDraftAssignments(mapping);
  }, [planAssignments]);

  const goingMembers = useMemo(
    () => plan.members.filter((m) => m.joinState === "JOINED"),
    [plan.members]
  );

  const waitlistMembers = useMemo(
    () => plan.members.filter((m) => m.joinState === "WAITLISTED"),
    [plan.members]
  );

  const resolvedUserUuid = userProfile.dbUuid || activeUserId;
  const isHost = plan.hostId === resolvedUserUuid;

  const hasChanges = useMemo(() => {
    // Check if draft state differs from database assignments
    const userUuids = new Set([...goingMembers.map(m => m.userUuid || m.userId), ...planAssignments.map(a => a.user_id)]);
    for (const uuid of userUuids) {
      const dbTeam = planAssignments.find(a => a.user_id === uuid)?.team || null;
      const draftTeam = draftAssignments[uuid] || null;
      if (dbTeam !== draftTeam) return true;
    }
    return false;
  }, [draftAssignments, planAssignments, goingMembers]);

  // Distribute going players into Team A, Team B, and Unassigned
  const teamA = useMemo(() => goingMembers.filter(m => draftAssignments[m.userUuid || m.userId] === "A"), [goingMembers, draftAssignments]);
  const teamB = useMemo(() => goingMembers.filter(m => draftAssignments[m.userUuid || m.userId] === "B"), [goingMembers, draftAssignments]);
  const unassigned = useMemo(() => goingMembers.filter(m => !draftAssignments[m.userUuid || m.userId]), [goingMembers, draftAssignments]);

  // Auto Balance logic - Distributes players evenly between Team A and Team B based on player count alone
  const handleAutoBalance = () => {
    const players = goingMembers.map(m => m.userUuid || m.userId);

    const newTeams: Record<string, "A" | "B" | null> = {};
    players.forEach((uuid, idx) => {
      newTeams[uuid] = idx % 2 === 0 ? "A" : "B";
    });

    setDraftAssignments(newTeams);
  };

  const handleSaveTeams = async () => {
    setSavingTeams(true);
    try {
      // Determine what database updates are needed
      for (const m of goingMembers) {
        const uuid = m.userUuid || m.userId;
        const currentDraft = draftAssignments[uuid] || null;
        const currentDb = planAssignments.find(a => a.user_id === uuid)?.team || null;

        if (currentDraft !== currentDb) {
          if (currentDraft === null) {
            await unassignTeam(planUuid, uuid);
          } else {
            await assignTeam(planUuid, uuid, currentDraft);
          }
        }
      }
    } catch (err) {
      // error handled silently
    } finally {
      setSavingTeams(false);
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, userUuid: string) => {
    e.dataTransfer.setData("text/plain", userUuid);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, targetTeam: "A" | "B" | null) => {
    e.preventDefault();
    const userUuid = e.dataTransfer.getData("text/plain");
    if (userUuid) {
      setDraftAssignments(prev => ({
        ...prev,
        [userUuid]: targetTeam
      }));
    }
  };

  // Chat message send state
  const [chatInput, setChatInput] = useState("");
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msgText = chatInput;
    setChatInput("");
    await sendMessage(msgText);
  };

  // Helper trigger removal dialog
  const onRemoveParticipantAction = (userId: string, name: string) => {
    // Standard host removal protection
    const isPlanHost = userId === plan.hostId;
    if (isPlanHost) {
      return;
    }
    if (!isHost) {
      return;
    }
    setUserToRemove({ userId, name });
  };

  return (
    <div
      id="team_organizer_modal"
      className="absolute inset-0 bg-[#070709] z-50 flex flex-col animate-fade-in text-zinc-100 selection:bg-[#ff8b66]/30 overflow-hidden"
    >
      {/* 1. COLLAPSED COMPACT HEADER */}
      <div className="bg-[#0C0C10] border-b border-zinc-900 shrink-0">
        <div className="p-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white flex items-center gap-1.5 text-xs focus:outline-none transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-center">
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-[#ff8b66]">
              Team Draft
            </span>
            <h2 className="text-sm font-sans font-black text-white leading-tight mt-0.5">{plan.title}</h2>
          </div>
          <div className="w-14" />
        </div>

        {/* Dense details and expand button */}
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="truncate max-w-[220px]">
              <span className="font-semibold text-zinc-200">{plan.location}</span> • {plan.time}
            </div>
            <div className="shrink-0 text-zinc-500 font-mono text-[10px]">
              {teamA.length + teamB.length} Assigned • {unassigned.length} Remaining
            </div>
          </div>
        </div>
      </div>

      {/* Main Kanban Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-28 no-scrollbar">
        {/* TEAM A CARD */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, "A")}
          className="bg-[#0f0f13] border-t-4 border-t-emerald-500 border border-zinc-900 rounded-3xl p-4 shadow-xl space-y-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-xs font-mono font-bold tracking-widest text-emerald-400 uppercase">Team A</h3>
            </div>
            <span className="text-[10px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
              {teamA.length} Players
            </span>
          </div>

          <div className="space-y-2">
            {teamA.length === 0 ? (
              <div className="py-8 text-center text-[10px] font-mono text-zinc-650 border border-dashed border-zinc-800 rounded-2xl">
                Drag players here to build Team A
              </div>
            ) : (
              teamA.map((m) => (
                <PlayerCard
                  key={m.userId}
                  member={m}
                  onDragStart={(e) => handleDragStart(e, m.userUuid || m.userId)}
                  onTap={() => setActiveActionsUser({ userId: m.userId, userUuid: m.userUuid || m.userId, name: m.name, avatar: m.avatar })}
                />
              ))
            )}
          </div>
        </div>

        {/* TEAM B CARD */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, "B")}
          className="bg-[#0f0f13] border-t-4 border-t-purple-500 border border-zinc-900 rounded-3xl p-4 shadow-xl space-y-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
              <h3 className="text-xs font-mono font-bold tracking-widest text-purple-400 uppercase">Team B</h3>
            </div>
            <span className="text-[10px] font-mono bg-purple-950/40 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold">
              {teamB.length} Players
            </span>
          </div>

          <div className="space-y-2">
            {teamB.length === 0 ? (
              <div className="py-8 text-center text-[10px] font-mono text-zinc-650 border border-dashed border-zinc-800 rounded-2xl">
                Drag players here to build Team B
              </div>
            ) : (
              teamB.map((m) => (
                <PlayerCard
                  key={m.userId}
                  member={m}
                  onDragStart={(e) => handleDragStart(e, m.userUuid || m.userId)}
                  onTap={() => setActiveActionsUser({ userId: m.userId, userUuid: m.userUuid || m.userId, name: m.name, avatar: m.avatar })}
                />
              ))
            )}
          </div>
        </div>

        {/* DRAFT POOL (AVAILABLE PLAYERS) */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, null)}
          className="bg-[#0C0C0F] border border-zinc-900 rounded-3xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase">Draft Pool</h3>
            <span className="text-[10px] font-mono bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded-full font-bold">
              {unassigned.length} Available
            </span>
          </div>

          <div className="space-y-2">
            {unassigned.length === 0 ? (
              <div className="py-4 text-center text-[10px] font-mono text-zinc-650">
                All players have been drafted
              </div>
            ) : (
              unassigned.map((m) => (
                <PlayerCard
                  key={m.userId}
                  member={m}
                  onDragStart={(e) => handleDragStart(e, m.userUuid || m.userId)}
                  onTap={() => setActiveActionsUser({ userId: m.userId, userUuid: m.userUuid || m.userId, name: m.name, avatar: m.avatar })}
                />
              ))
            )}
          </div>
        </div>

        {/* Waitlist (Informational, read-only stats) */}
        {waitlistMembers.length > 0 && (
          <div className="bg-[#0C0C0F]/40 border border-zinc-900/60 rounded-3xl p-4 space-y-3 opacity-60">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-mono tracking-widest text-amber-500/80 uppercase">Waitlist</h3>
              <span className="text-[9px] font-mono text-amber-500/80 px-2 py-0.5">
                {waitlistMembers.length} Queued
              </span>
            </div>
            <div className="space-y-1.5">
              {waitlistMembers.map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5 p-2 rounded-xl bg-zinc-950/20">
                  <UserAvatar src={m.avatar} alt={m.name} size="w-5 h-5" className="grayscale" />
                  <span className="text-[11px] font-semibold text-zinc-500">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. CHAT BOTTOM TRIGGER BAR */}
      <div className="absolute bottom-[72px] inset-x-0 z-35 px-4">
        <button
          onClick={() => setChatOpen(true)}
          className="w-full bg-[#111116]/95 border border-zinc-900/90 shadow-2xl backdrop-blur-md h-12 rounded-2xl flex items-center justify-between px-4 text-xs font-semibold text-zinc-300 hover:text-white transition-all active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4.5 h-4.5 text-[#ff8b66]" />
            <span>Coordination Chat</span>
          </div>
          <span className="font-mono bg-[#ff8b66]/10 text-[#ff8b66] px-2 py-0.5 rounded-full text-[10px]">
            {messages.length} Messages
          </span>
        </button>
      </div>

      {/* 3. LOCK TEAMS ACTION BAR */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ translateY: "100%", opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            exit={{ translateY: "100%", opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-0 inset-x-0 bg-[#0A0A0C]/98 border-t border-zinc-900 p-4 pb-6 flex items-center gap-3 z-30 shadow-2xl"
          >
            <div className="flex-1 flex flex-col justify-center">
              <span className="text-[10px] font-mono uppercase text-[#ff8b66] tracking-wider font-bold">Draft Modified</span>
              <span className="text-[9px] text-zinc-500 mt-0.5">Lock selections when satisfied.</span>
            </div>
            <button
              onClick={handleAutoBalance}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900 text-zinc-350 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#ff8b66]" />
              Auto Balance
            </button>
            <button
              onClick={handleSaveTeams}
              disabled={savingTeams}
              className="px-4 py-2.5 rounded-xl bg-[#ff8b66] hover:bg-[#ff7b52] text-black text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1 shrink-0"
            >
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
              {savingTeams ? "Locking…" : "Lock Teams"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. CHAT BOTTOM SHEET */}
      <AnimatePresence>
        {chatOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />

            {/* Slide up sheet */}
            <motion.div
              initial={{ translateY: "100%" }}
              animate={{ translateY: 0 }}
              exit={{ translateY: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 top-18 bg-[#09090C] border-t border-zinc-900 rounded-t-[32px] flex flex-col z-45 overflow-hidden"
            >
              {/* Sheet Handle / Header */}
              <div className="shrink-0 p-4 border-b border-zinc-900/60 flex items-center justify-between bg-[#0C0C10]">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#ff8b66] flex items-center gap-2">
                  <MessageSquare className="w-4.5 h-4.5" /> Team Coordination
                </h3>
                <button
                  onClick={() => setChatOpen(false)}
                  className="text-zinc-500 hover:text-white text-[10px] font-mono font-bold uppercase tracking-wider focus:outline-none"
                >
                  Close
                </button>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar flex flex-col-reverse">
                <div className="flex flex-col space-y-3 justify-end min-h-full">
                  {messages.map((msg) => {
                    const isOwn = msg.isOwn;
                    if (msg.type === "system") {
                      return (
                        <div key={msg.id} className="flex items-center justify-center gap-2 py-2 w-full px-4 select-none">
                          <div className="h-[1px] bg-zinc-900/60 grow"></div>
                          <span className="text-[10px] text-zinc-500 font-sans px-2 text-center">
                            {msg.content}
                          </span>
                          <div className="h-[1px] bg-zinc-900/60 grow"></div>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={`flex items-start gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                        <UserAvatar src={msg.sender?.avatar} alt={msg.sender?.name || ""} size="w-7 h-7" className="border border-zinc-800 shrink-0" />
                        <div className={`flex flex-col max-w-[240px] ${isOwn ? "items-end" : ""}`}>
                          <span className="text-[9px] text-zinc-500 font-mono mb-0.5">{msg.sender?.name}</span>
                          <div className={`p-3 rounded-2xl text-[11.5px] font-sans leading-normal ${isOwn ? "bg-[#ff8b66] text-black rounded-tr-none font-medium" : "bg-[#111115] text-zinc-200 border border-zinc-900/80 rounded-tl-none"}`}>
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chat Send Input Box */}
              <form onSubmit={handleSendChatMessage} className="shrink-0 p-4 border-t border-zinc-900 bg-[#0C0C10] flex gap-2.5 pb-6">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Coordinate positions or balance teams..."
                  className="flex-1 bg-zinc-950 border border-zinc-900 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-[#ff8b66] transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 bg-[#ff8b66] hover:bg-[#ff7b52] text-black font-mono font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Send
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 5. TAP ACTION ACTION OVERLAY MENU */}
      <AnimatePresence>
        {activeActionsUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveActionsUser(null)}
              className="fixed inset-0 bg-black z-50"
            />
            <motion.div
              initial={{ translateY: "100%" }}
              animate={{ translateY: 0 }}
              exit={{ translateY: "100%" }}
              className="fixed bottom-0 inset-x-0 bg-[#0c0c10] border-t border-zinc-900 rounded-t-3xl p-5 pb-7 space-y-4 z-55 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <UserAvatar src={activeActionsUser.avatar} alt={activeActionsUser.name} size="w-10 h-10" className="border border-zinc-800" />
                <div>
                  <h4 className="text-sm font-sans font-black text-white">{activeActionsUser.name}</h4>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setDraftAssignments(prev => ({ ...prev, [activeActionsUser.userUuid]: "A" }));
                    setActiveActionsUser(null);
                  }}
                  className="py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Move to Team A
                </button>
                <button
                  onClick={() => {
                    setDraftAssignments(prev => ({ ...prev, [activeActionsUser.userUuid]: "B" }));
                    setActiveActionsUser(null);
                  }}
                  className="py-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-400 text-xs font-mono font-bold uppercase tracking-wider hover:bg-purple-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Move to Team B
                </button>
                <button
                  onClick={() => {
                    setDraftAssignments(prev => ({ ...prev, [activeActionsUser.userUuid]: null }));
                    setActiveActionsUser(null);
                  }}
                  className="py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-350 text-xs font-mono font-bold uppercase tracking-wider hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Unassign (Draft Pool)
                </button>
                <button
                  onClick={() => {
                    // Triggers the standard participant removal
                    setActiveActionsUser(null);
                    onRemoveParticipantAction(activeActionsUser.userId, activeActionsUser.name);
                  }}
                  className="py-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-mono font-bold uppercase tracking-wider hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Remove From Match
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Participant Removal Confirmation Dialog */}
      {userToRemove && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-6 z-55 animate-fade-in text-center">
          <div className="bg-[#0C0C0E]/90 backdrop-blur-md border border-zinc-900 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-2xl">
            <h3 className="text-base font-display font-black text-white uppercase tracking-wider">
              Remove Participant?
            </h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to remove <span className="text-zinc-200 font-semibold">{userToRemove.name}</span> from this plan? This will free up their slot.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToRemove(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 text-zinc-400 text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-zinc-900 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsRemoving(true);
                    await removeParticipant(plan.id, userToRemove.userId);
                    setUserToRemove(null);
                  } catch (err: any) {
                    // error handled silently
                  } finally {
                    setIsRemoving(false);
                  }
                }}
                disabled={isRemoving}
                className="flex-1 py-2.5 rounded-xl bg-rose-650 hover:bg-rose-600 text-white text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
              >
                {isRemoving ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface PlayerCardProps {
  key?: any;
  member: any;
  onDragStart: (e: React.DragEvent) => void;
  onTap: () => void;
}

function PlayerCard({ member, onDragStart, onTap }: PlayerCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onTap}
      className="flex items-center justify-between p-3.5 rounded-2xl bg-[#141419]/90 border border-zinc-900 hover:border-zinc-800 active:scale-[0.98] transition-all cursor-grab active:cursor-grabbing shadow-sm"
    >
      <div className="flex items-center gap-3">
        <UserAvatar src={member.avatar} alt={member.name} size="w-8 h-8" className="border border-zinc-850" />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-zinc-200">{member.name}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-650">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
      </div>
    </div>
  );
}
