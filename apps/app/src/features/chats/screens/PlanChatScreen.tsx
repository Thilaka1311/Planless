import React, { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Send, MessageSquare, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
import { useHorizontalPager } from "../hooks/useHorizontalPager";

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

const PAGE_NAMES: Record<number, string> = {
  0: "Participants",
  1: "Chat",
  2: "Activity",
};

export const PlanChatScreen: React.FC<PlanChatScreenProps> = ({
  planId,
  onBack,
  onOpenPlanDetails,
}) => {
  const { plans, dbPlanParticipants, dbUsers, activeUserId, moveParticipantToGoing, moveParticipantToWaitlist, moveParticipantToInvited, removeParticipant, promoteParticipantToHost, demoteHostToParticipant, addParticipantsToPlan, reorderWaitlist, updatePlanDetails, updatePlanSettings } = usePlansStore();
  const { profile: userProfile } = useProfileStore();

  const currentUserId = userProfile?.dbUuid || activeUserId || "";

  // Find target plan
  const plan = plans.find((p) => p.id === planId || p.dbUuid === planId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettingsScreen, setShowSettingsScreen] = useState(false);

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

  // ── Horizontal Motion Pager Hook ──
  const {
    currentPage,
    overlayPage,
    pageX,
    containerRef,
    goToPage,
    pagerProps,
  } = useHorizontalPager({
    initialPage: 1,
    totalPages: 3,
    keyboardOpen,
  });

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

  const isHost = useMemo(() => {
    if (!plan) return false;
    const myId = currentUserId || activeUserId || userProfile?.dbUuid || (userProfile as any)?.id;
    if (myId && (plan.hostId === myId || plan.creatorId === myId || (plan as any).creator_id === myId)) {
      return true;
    }
    if (myParticipantRecord) {
      return myParticipantRecord.role === "HOST";
    }
    if (plan.members) {
      return plan.members.some(
        (m) => (m.userId === myId || m.userUuid === myId || (m as any).id === myId) && m.isHost
      );
    }
    return false;
  }, [plan, currentUserId, activeUserId, userProfile, myParticipantRecord]);

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
        setTimeout(() => scrollToBottom(true), 50);
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
          const matchUser = (dbUsers || []).find(
            (u) => u.id === plan.hostId || u.public_id === plan.hostId || u.id === plan.creatorId
          );
          if (matchUser?.full_name) {
            hostName = matchUser.full_name;
          } else {
            const hostMember = (plan.members || []).find(
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
        const matchUser = (dbUsers || []).find(
          (u) => u.id === pp.user_id || u.public_id === pp.user_id
        );
        if (matchUser?.full_name) {
          participantName = matchUser.full_name;
        } else {
          const matchMember = (plan.members || []).find(
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

  // Ref to chat message scroll container & intelligent scroll state
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasNewUnreadMessages, setHasNewUnreadMessages] = useState(false);
  const prevItemsLengthRef = useRef(timelineItems.length);

  const scrollToBottom = (smooth = true) => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setIsScrolledUp(false);
      setHasNewUnreadMessages(false);
    }
  };

  const handleChatScroll = () => {
    if (!chatMessagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    // Consider scrolled up if more than 120px from bottom
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const scrolledAway = distanceFromBottom > 120;
    setIsScrolledUp(scrolledAway);
    if (!scrolledAway) {
      setHasNewUnreadMessages(false);
    }
  };

  // Intelligent auto-scroll effect
  useEffect(() => {
    if (loading || timelineItems.length === 0) return;

    const prevLength = prevItemsLengthRef.current;
    const isNewItemAdded = timelineItems.length > prevLength;
    prevItemsLengthRef.current = timelineItems.length;

    if (prevLength === 0) {
      // Initial load: scroll to bottom instantly
      scrollToBottom(false);
    } else if (isNewItemAdded) {
      const latestItem = timelineItems[timelineItems.length - 1];
      const isSentByMe = latestItem?.senderId === currentUserId;

      if (isSentByMe || !isScrolledUp) {
        // User sent message or was already near bottom: scroll to bottom
        scrollToBottom(true);
      } else {
        // User is reading history: preserve scroll position and show indicator
        setHasNewUnreadMessages(true);
      }
    }
  }, [loading, timelineItems, currentUserId, isScrolledUp]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none relative"
    >
      {/* 1. INDEPENDENT FIXED HERO HEADER OVERLAY — Completely isolated from pager flex/resize */}
      {plan && (
        <div className="fixed top-0 left-0 right-0 z-50 pointer-events-auto">
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
            onOpenActivity={() => goToPage(2)}
            onEditTitle={!isCancelled ? async (newTitle) => {
              try {
                await updatePlanDetails(plan.id, { title: newTitle });
              } catch (err) {
                console.error("Failed to update title:", err);
              }
            } : undefined}
            onOpenSettings={!isCancelled ? () => setShowSettingsScreen(true) : undefined}
          />
        </div>
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

      {/* 2. DEDICATED RESIZABLE PAGER CONTAINER — Only this area resizes when keyboard opens */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative w-full touch-pan-y select-none pt-[64px]"
        style={{ touchAction: "pan-y" }}
      >
        <motion.div
          {...pagerProps}
          style={{ x: pageX, touchAction: "pan-y" }}
          className="flex h-full w-[300%]"
        >
          {/* PAGE 0: PARTICIPANTS */}
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0">
            {plan && (
              <PlanParticipantManagementWrapper
                plan={plan}
                userProfile={userProfile || { id: currentUserId, dbUuid: currentUserId, name: "You" } as any}
                activeUserId={currentUserId}
                isHost={isHost}
                isCreatorHost={isHost}
                displayMode="embedded"
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
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0 relative">
            <div
              ref={chatMessagesRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto touch-pan-y px-4 py-4 flex flex-col space-y-3"
            >
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

            {/* FLOATING "NEW MESSAGES" / SCROLL-TO-BOTTOM INDICATOR BUTTON */}
            <AnimatePresence>
              {(isScrolledUp || hasNewUnreadMessages) && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-20 right-5 z-30 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900/90 border border-white/15 shadow-2xl text-white text-xs font-semibold backdrop-blur-md active:scale-95 transition cursor-pointer hover:bg-zinc-800"
                >
                  {hasNewUnreadMessages && (
                    <span className="w-2 h-2 rounded-full bg-[#FF6B2C] animate-pulse" />
                  )}
                  <span>{hasNewUnreadMessages ? "New Messages" : "Latest"}</span>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* MESSAGE COMPOSER */}
            <form
              onSubmit={handleSendMessage}
              className="bg-black/90 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex items-center flex-shrink-0"
            >
              <div className="relative w-full flex items-center h-[56px] bg-zinc-900/90 border border-white/[0.08] rounded-full px-5 focus-within:border-white/20 transition-all shadow-lg">
                <input
                  type="text"
                  placeholder="Send a message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="w-full h-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none pr-12 font-sans"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#FF6B2C] text-white flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:active:scale-100 transition cursor-pointer flex-shrink-0 shadow-md"
                >
                  <Send className="w-4 h-4 text-white fill-current stroke-[2.5]" />
                </button>
              </div>
            </form>
          </div>

          {/* PAGE 2: ACTIVITY */}
          <div className="w-1/3 h-full overflow-hidden flex flex-col flex-shrink-0">
            <ActivityTimelineScreen
              planId={planId}
              planTitle={plan?.title || "Plan Activity"}
              onBack={() => goToPage(1)}
              embedded={true}
              dragX={pageX}
            />
          </div>
        </motion.div>
      </div>

      {/* PLAN SETTINGS SCREEN OVERLAY */}
      {showSettingsScreen && plan && (
        <PlanSettingsScreen
          plan={plan}
          userProfile={userProfile || ({ id: currentUserId, dbUuid: currentUserId, name: "You" } as any)}
          mode={isHost ? "host" : "participant"}
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
          onEditTitle={async (newTitle) => {
            try {
              await updatePlanDetails(plan.id, { title: newTitle });
            } catch (err) {
              console.error("Failed to edit plan title:", err);
            }
          }}
          onEditCoverImage={async (newCoverUrl) => {
            try {
              await updatePlanDetails(plan.id, { cover_image: newCoverUrl });
            } catch (err) {
              console.error("Failed to edit plan cover image:", err);
            }
          }}
          onRemoveParticipant={async (uId) => {
            try {
              await removeParticipant(plan.id, uId);
            } catch (err) {
              console.error("Failed to remove participant:", err);
            }
          }}
          onLeavePlan={async () => {
            try {
              await removeParticipant(plan.id, currentUserId);
              setShowSettingsScreen(false);
              onBack();
            } catch (err) {
              console.error("Failed to leave plan:", err);
            }
          }}
          onCancelPlan={async () => {
            try {
              await updatePlanDetails(plan.id, { status: "CANCELLED" });
              setShowSettingsScreen(false);
              onBack();
            } catch (err) {
              console.error("Failed to cancel plan:", err);
            }
          }}
        />
      )}
    </motion.div>
  );
};
