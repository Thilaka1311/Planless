import React, { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { Plan } from "../../../core/types";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { EmptyState } from "../../home/components/EmptyState";
import { supabase } from "../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { SystemMessageType } from "../../../core/types";
import { HeroHeader } from "../../plans/components/HeroHeader";
import { PlanSettingsScreen } from "../../plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen";
import { PlanParticipantManagementWrapper } from "../../plans/screens/PlansScreen/PlansPreview/PlanParticipantManagementWrapper";
import { ActivityTimelineScreen } from "./ActivityTimelineScreen";
import { getPlanCover } from "../../plans/config/planCoverImages";

interface PlanChatScreenProps {
  planId: string;
  onBack: () => void;
  /** Optional: called when the user taps the header to open the Plan Details screen */
  onOpenPlanDetails?: () => void;
}

interface ChatMessage {
  id: string;
  plan_id: string;
  sender_id: string;
  message_type: "text" | "system" | "poll";
  system_message_type?: SystemMessageType | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
}

const PAGE_NAMES: { [key: number]: string } = {
  0: "Participants",
  1: "Chat",
  2: "Activity",
};

export const PlanChatScreen: React.FC<PlanChatScreenProps> = ({
  planId,
  onBack,
  onOpenPlanDetails,
}) => {
  const { plans, dbPlanParticipants, updatePlanDetails, updatePlanSettings, promoteParticipantToHost, demoteHostToParticipant, removeParticipant, moveParticipantToGoing, moveParticipantToWaitlist, moveParticipantToInvited, addParticipantsToPlan, reorderWaitlist } = usePlansStore();
  const { userProfile, activeUserId, dbUsers } = useProfileStore();

  const currentUserId = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  // Find target plan
  const plan = plans.find((p) => p.id === planId || p.dbUuid === planId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettingsScreen, setShowSettingsScreen] = useState(false);

  // ── Instagram-Style Native Motion Pager State ──
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageX = useMotionValue(-1 * (typeof window !== "undefined" ? window.innerWidth : 375));
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Floating Temporary Page Indicator State ──
  const [overlayPage, setOverlayPage] = useState<number | null>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerOverlay = (pageIndex: number) => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
    }
    setOverlayPage(pageIndex);
    overlayTimerRef.current = setTimeout(() => {
      setOverlayPage(null);
      overlayTimerRef.current = null;
    }, 800);
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    };
  }, []);

  // ── Keyboard Visibility Detection & Dismissal ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleResize = () => {
      setKeyboardOpen(vv.height < window.innerHeight * 0.78);
    };
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  // Synchronize MotionValue with screen width & active page index
  const goToPage = (pageIndex: number, showOverlay: boolean = true) => {
    if (keyboardOpen) {
      // Dismiss keyboard before completing transition if active
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    const width = containerRef.current?.offsetWidth || window.innerWidth;
    const isChange = pageIndex !== currentPage;
    setCurrentPage(pageIndex);

    if (isChange && showOverlay) {
      triggerOverlay(pageIndex);
    }

    animate(pageX, -pageIndex * width, {
      type: "spring",
      stiffness: 350,
      damping: 32,
      mass: 0.8,
    });
  };

  // Recalculate width on resize
  useEffect(() => {
    const handleWindowResize = () => {
      const width = containerRef.current?.offsetWidth || window.innerWidth;
      pageX.set(-currentPage * width);
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [currentPage, pageX]);

  // Derive host status & all hosts for HeroHeader
  const planUuid = plan ? (plan.dbUuid || plan.id) : "";
  const myParticipantRecord = useMemo(() => {
    if (!plan) return undefined;
    const userIds = new Set<string>();
    if (currentUserId) userIds.add(currentUserId);
    if (activeUserId) userIds.add(activeUserId);
    if (userProfile?.dbUuid) userIds.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) userIds.add((userProfile as any).id);
    if (userProfile?.user_id) userIds.add(userProfile.user_id);

    return dbPlanParticipants.find(
      (pp) => (pp.plan_id === planUuid || (plan.id && pp.plan_id === plan.id)) && userIds.has(pp.user_id)
    );
  }, [dbPlanParticipants, plan, planUuid, activeUserId, currentUserId, userProfile]);

  const isHost = myParticipantRecord
    ? myParticipantRecord.role === "HOST"
    : plan?.members
    ? plan.members.some(
        (m) => (m.userId === currentUserId || m.userUuid === currentUserId) && m.isHost
      )
    : false;

  const isCancelled = Boolean((plan?.status || "").toUpperCase() === "CANCELLED");

  const allHosts = useMemo(() => {
    if (!plan) return [];
    const members = plan.members || [];

    const hostMembers = members
      .filter((m) => {
        const isHostRole = (m as any).role === "HOST" || m.isHost === true;
        const status = normalizeStatus(m.joinState);
        return isHostRole && status === "JOINED";
      })
      .map((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const isCurrentUser = Boolean(currentUserId && mId === currentUserId);
        return {
          id: mId,
          name: isCurrentUser ? "You" : m.name || "Host",
          avatar: m.avatar || "",
        };
      });

    const sortAlpha = (list: typeof hostMembers) =>
      [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

    const currentUserHost = hostMembers.find(
      (h) => h.name === "You" || (currentUserId && h.id === currentUserId)
    );
    const remainingHosts = sortAlpha(hostMembers.filter((h) => h !== currentUserHost));

    return [...(currentUserHost ? [currentUserHost] : []), ...remainingHosts];
  }, [plan, currentUserId]);

  // Fetch messages from plan_messages ordered by created_at ASC
  const fetchMessages = async () => {
    if (!planId) return;
    try {
      const { data, error } = await supabase
        .from("plan_messages")
        .select("*")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching plan_messages:", error);
      } else if (data) {
        setMessages(data as ChatMessage[]);
      }
    } catch (err) {
      console.error("Exception fetching plan_messages:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [planId]);

  // Send message implementation
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending || !currentUserId || !planId) return;

    setSending(true);
    try {
      const newMessagePayload = {
        plan_id: planId,
        sender_id: currentUserId,
        content: trimmed,
        message_type: "text",
      };

      const { data, error } = await supabase
        .from("plan_messages")
        .insert(newMessagePayload)
        .select()
        .single();

      if (error) {
        console.error("Failed to send plan_message:", error);
      } else if (data) {
        setMessages((prev) => [...prev, data as ChatMessage]);
        setInputText("");
      }
    } catch (err) {
      console.error("Error inserting plan_message:", err);
    } finally {
      setSending(false);
    }
  };

  // Dynamic timeline event item (combines user messages and derived system events)
  interface TimelineItem {
    id: string;
    isSystem: boolean;
    systemType?: SystemMessageType;
    content: string;
    senderId?: string;
    createdAt: string;
  }

  // Derived timeline events combined with plan_messages
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    // 1. User messages from plan_messages
    messages.forEach((msg) => {
      items.push({
        id: msg.id,
        isSystem: msg.message_type === "system",
        systemType: msg.system_message_type || undefined,
        content: msg.content,
        senderId: msg.sender_id,
        createdAt: msg.created_at,
      });
    });

    if (plan) {
      const targetPlanId = plan.dbUuid || plan.id;

      // 2. Event 1: Plan created (from plans.created_at)
      if (plan.createdAt) {
        let hostName = (plan.creatorName || "").trim();
        if (!hostName) {
          const matchUser = dbUsers.find(
            (u) => u.id === plan.hostId || u.public_id === plan.hostId || u.id === plan.creatorId
          );
          if (matchUser?.full_name) {
            hostName = matchUser.full_name;
          } else {
            const hostMember = plan.members.find(
              (m) => m.role === "HOST" || m.isHost || m.userId === plan.hostId
            );
            if (hostMember?.name) {
              hostName = hostMember.name;
            } else if (
              plan.hostId === userProfile?.dbUuid ||
              plan.creatorId === userProfile?.dbUuid ||
              plan.hostId === activeUserId
            ) {
              hostName = userProfile?.name || "";
            }
          }
        }

        const createdMessageText = hostName && plan.title
          ? `${hostName} created ${plan.title}`
          : "Plan created";

        items.push({
          id: `sys-created-${targetPlanId}`,
          isSystem: true,
          systemType: SystemMessageType.PLAN_CREATED,
          content: createdMessageText,
          createdAt: plan.createdAt,
        });
      }

      // 3. Event 2: Participant joined (only for non-host confirmed JOINED participants)
      const targetParticipants = dbPlanParticipants.filter((pp) => {
        const isTargetPlan = pp.plan_id === targetPlanId || pp.plan_id === plan.id;
        const isJoinedStatus = normalizeStatus(pp.rsvp_status) === "JOINED";
        const isHost =
          pp.role === "HOST" ||
          pp.user_id === plan.hostId ||
          pp.user_id === plan.creatorId;

        return isTargetPlan && isJoinedStatus && !isHost;
      });

      targetParticipants.forEach((pp) => {
        // Resolve participant user name from dbUsers, plan.members, or userProfile
        let participantName = "";
        const matchUser = dbUsers.find(
          (u) => u.id === pp.user_id || u.public_id === pp.user_id
        );
        if (matchUser?.full_name) {
          participantName = matchUser.full_name;
        } else {
          const matchMember = plan.members.find(
            (m) => m.userId === pp.user_id || m.userUuid === pp.user_id
          );
          if (matchMember?.name) {
            participantName = matchMember.name;
          } else if (
            pp.user_id === userProfile?.dbUuid ||
            pp.user_id === activeUserId
          ) {
            participantName = userProfile?.name || "You";
          } else {
            participantName = "Someone";
          }
        }

        items.push({
          id: `sys-joined-${pp.id}`,
          isSystem: true,
          systemType: SystemMessageType.PARTICIPANT_JOINED,
          content: `${participantName} joined`,
          createdAt: pp.responded_at || pp.created_at || plan.createdAt,
        });
      });
    }

    // 4. Sort unified timeline chronologically by createdAt ASC
    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages, plan, dbPlanParticipants, dbUsers, userProfile, activeUserId]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none relative"
    >
      {/* MORPHIC HERO HEADER */}
      {plan && (
        <HeroHeader
          title={plan.title}
          creatorName={isHost ? "You" : plan.creatorName}
          creatorAvatar={isHost ? userProfile?.avatar : plan.creatorAvatar}
          hosts={allHosts}
          viewerId={currentUserId}
          onClose={onBack}
          isHost={isHost && !isCancelled}
          coverImage={plan.coverImage || plan.customCoverUrl || getPlanCover(plan.category, (plan as any).subcategory || (plan as any).sports_type)}
          category={plan.category}
          hideHostAttribution={true}
          onHeaderPress={onOpenPlanDetails}
          onOpenParticipants={() => goToPage(0)}
          onOpenActivity={() => goToPage(2)}
          onEditTitle={!isCancelled ? async (newTitle) => {
            try {
              await updatePlanDetails(plan.id, { title: newTitle });
            } catch (err) {
              console.error("Failed to update title:", err);
            }
          } : undefined}
          onOpenSettings={isHost && !isCancelled ? () => setShowSettingsScreen(true) : undefined}
        />
      )}

      {/* FLOATING TEMPORARY PAGE INDICATOR OVERLAY */}
      <AnimatePresence>
        {overlayPage !== null && (
          <motion.div
            key={`page-overlay-${overlayPage}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-[28%] left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <div className="px-4 py-2 rounded-full bg-zinc-900/80 backdrop-blur-md border border-white/10 shadow-2xl text-white text-xs font-medium tracking-wide">
              {PAGE_NAMES[overlayPage]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HORIZONTAL SWIPE PAGER STRIP — INSTAGRAM-STYLE NATIVE MOTION PAGER */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative w-full touch-pan-y select-none"
        style={{ touchAction: "pan-y" }}
      >
        <motion.div
          drag="x"
          dragDirectionLock={true}
          dragConstraints={{
            left: -2 * (containerRef.current?.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 375)),
            right: 0,
          }}
          dragElastic={0.05}
          dragMomentum={false}
          style={{ x: pageX, touchAction: "pan-y" }}
          onDragEnd={(_, info) => {
            const width = containerRef.current?.offsetWidth || window.innerWidth;
            const offset = info.offset.x;
            const velocity = info.velocity.x;

            let targetPage = currentPage;

            // Highly responsive Instagram-style snapping threshold: 40px drag or 200px/s velocity flick
            if ((offset < -40 || velocity < -200) && currentPage < 2) {
              targetPage = currentPage + 1;
            } else if ((offset > 40 || velocity > 200) && currentPage > 0) {
              targetPage = currentPage - 1;
            }

            goToPage(targetPage, true);
          }}
          className="flex h-full w-[300%]"
        >
          {/* PAGE 0: PARTICIPANTS */}
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0">
            {plan && userProfile && (
              <PlanParticipantManagementWrapper
                plan={plan}
                userProfile={userProfile}
                activeUserId={currentUserId}
                isHost={isHost}
                isCreatorHost={isHost}
                onBack={() => goToPage(1)}
                onMoveToGoing={(pId, uId) => moveParticipantToGoing(pId, uId)}
                onMoveToWaitlist={(pId, uId) => moveParticipantToWaitlist(pId, uId)}
                onMoveToInvited={(pId, uId) => moveParticipantToInvited(pId, uId)}
                onRemoveParticipant={(pId, uId) => removeParticipant(pId, uId)}
                onPromoteToHost={(pId, uId) => promoteParticipantToHost(pId, uId)}
                onDemoteFromHost={(pId, uId) => demoteHostToParticipant(pId, uId)}
                onUpdatePlanCapacity={(pId, capacity) => updatePlanDetails(pId, { max_participants: capacity })}
                onAddParticipants={(pId, userIds, circleIds, assignedGroup) =>
                  addParticipantsToPlan({
                    planId: pId,
                    inviteeUuids: userIds,
                    userProfile,
                    planTitle: plan.title || "",
                    assignedGroup,
                  })
                }
                onReorderWaitlist={(pId, orderedUuids) => reorderWaitlist(pId, orderedUuids)}
                onOpenActivity={() => goToPage(2)}
              />
            )}
          </div>

          {/* PAGE 1: CHAT (DEFAULT) */}
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0">
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col space-y-3">
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
                  Loading messages...
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState
                    icon={<MessageSquare className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
                    title="No messages yet"
                    description="Start planning by sending the first message."
                    py="py-12"
                  />
                </div>
              ) : (
                timelineItems.map((item) => {
                  if (item.isSystem) {
                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center justify-center py-1.5 my-1"
                      >
                        <span className="text-[12px] font-medium text-zinc-500 bg-zinc-900/60 border border-white/[0.04] px-3 py-1 rounded-full text-center tracking-wide">
                          {item.content}
                        </span>
                      </div>
                    );
                  }

                  const isMe = item.senderId === currentUserId;
                  const timeStr = new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${
                          isMe
                            ? "bg-amber-500 text-black font-medium rounded-br-xs"
                            : "bg-zinc-800 text-white rounded-bl-xs border border-white/5"
                        }`}
                      >
                        {item.content}
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 px-1">
                        {timeStr}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* MESSAGE COMPOSER */}
            <form
              onSubmit={handleSendMessage}
              className="border-t border-white/10 bg-[#0A0A0C] px-4 py-3 flex items-center gap-2 flex-shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
            >
              <input
                type="text"
                placeholder="Send a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 h-10 bg-zinc-900 border border-zinc-800 rounded-xl px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition cursor-pointer flex-shrink-0"
              >
                <Send className="w-4 h-4 fill-current stroke-[2.5]" />
              </button>
            </form>
          </div>

          {/* PAGE 2: ACTIVITY */}
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0">
            <ActivityTimelineScreen
              planId={planId}
              planTitle={plan?.title || "Plan Activity"}
              onBack={() => goToPage(1)}
              embedded={true}
            />
          </div>
        </motion.div>
      </div>

      {/* PLAN SETTINGS SCREEN OVERLAY */}
      {showSettingsScreen && plan && userProfile && (
        <PlanSettingsScreen
          plan={plan}
          userProfile={userProfile}
          isCreatorHost={isHost}
          onBack={() => setShowSettingsScreen(false)}
          onUpdateSettings={async (settings) => {
            try {
              await updatePlanSettings(plan.id, settings);
            } catch (err) {
              console.error("Failed to update plan settings:", err);
            }
          }}
          onDemoteHost={async (uId) => {
            try {
              await demoteHostToParticipant(plan.id, uId);
            } catch (err) {
              console.error("Failed to demote host:", err);
            }
          }}
          onPromoteToHost={async (uId) => {
            try {
              await promoteParticipantToHost(plan.id, uId);
            } catch (err) {
              console.error("Failed to promote to host:", err);
            }
          }}
          onRemoveParticipant={async (uId) => {
            try {
              await removeParticipant(plan.id, uId);
            } catch (err) {
              console.error("Failed to remove participant:", err);
            }
          }}
        />
      )}
    </motion.div>
  );
};
