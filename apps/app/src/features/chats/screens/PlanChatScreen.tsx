import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, SendHorizontal, MessageSquare, ChevronDown, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Plan } from "../../../core/types";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { EmptyState } from "../../home/components/EmptyState";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { supabase } from "../../../../lib/supabaseClient";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { SystemMessageType } from "../../../core/types";
import { HeroHeader } from "../../plans/components/HeroHeader";
import { PlanSettingsScreen } from "../../plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen";
import { PlanParticipantManagementWrapper } from "../../plans/screens/PlansScreen/PlansPreview/PlanParticipantManagementWrapper";
import { ActivityTimelineScreen } from "./ActivityTimelineScreen";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { useHorizontalPager } from "../hooks/useHorizontalPager";
import { useChatCache, ChatMessage } from "../hooks/useChatCache";

interface PlanChatScreenProps {
  planId: string;
  onBack: () => void;
  /** Optional: called when the user taps the header to open the Plan Details screen */
  onOpenPlanDetails?: () => void;
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
  const { plans, dbPlanParticipants, dbUsers, activeUserId, moveParticipantToGoing, moveParticipantToWaitlist, moveParticipantToInvited, removeParticipant, promoteParticipantToHost, demoteHostToParticipant, addParticipantsToPlan, reorderWaitlist, switchToAutomaticWaitlistMode, swapParticipants, removeAndReplaceWithWaitlist, updatePlanDetails, updatePlanSettings, leavePlan, changePlanHost } = usePlansStore();
  const { profile: userProfile, activeUserUuid } = useProfileStore();

  // Robust sender UUID resolution across all possible user state sources
  const senderUuid =
    userProfile?.dbUuid ||
    activeUserUuid ||
    (userProfile as any)?.id ||
    (userProfile as any)?.user_id ||
    activeUserId ||
    "";

  const currentUserId = senderUuid;

  // Find target plan
  const plan = plans.find((p) => p.id === planId || p.dbUuid === planId);

  // Resolved target database UUID for plan (must be a valid UUID)
  const targetPlanUuid = useMemo(() => {
    if (plan?.dbUuid) return plan.dbUuid;
    if (planId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
      return planId;
    }
    return plan?.id || planId;
  }, [plan, planId]);

  // Centralized persistent in-memory chat cache hook
  const {
    messages,
    loading,
    appendOptimisticMessage,
    removeOptimisticMessage,
    replaceOptimisticMessage,
  } = useChatCache(targetPlanUuid);

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettingsScreen, setShowSettingsScreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Keyboard Visibility State (Used to lock pager gestures & bound Chat Page height) ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handleViewportChange = () => {
      const isKeyboardActive = vv.height < window.innerHeight * 0.85;
      setKeyboardOpen(isKeyboardActive);
      setViewportHeight(vv.height);
    };

    vv.addEventListener("resize", handleViewportChange);
    vv.addEventListener("scroll", handleViewportChange);
    handleViewportChange();

    return () => {
      vv.removeEventListener("resize", handleViewportChange);
      vv.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  const [isEditingPlanSize, setIsEditingPlanSize] = useState(false);

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
    disabled: isEditingPlanSize,
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

  // Send message implementation with optimistic UI update
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();

    let effectiveSenderUuid = senderUuid;
    if (!effectiveSenderUuid) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          effectiveSenderUuid = authData.user.id;
        }
      } catch (err) {
        console.error("Failed async auth user fallback:", err);
      }
    }

    if (!effectiveSenderUuid) {
      console.error("[PlanChatScreen Diagnostics] Cannot send message: senderUuid is empty after auth fallback.", {
        userProfile,
        activeUserId,
        activeUserUuid,
        resolvedSenderUuid: effectiveSenderUuid,
        planId,
        targetPlanUuid,
      });
      return;
    }

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      plan_id: targetPlanUuid,
      sender_id: effectiveSenderUuid,
      message_type: "text",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    // Optimistically update shared cache & clear input
    appendOptimisticMessage(optimisticMsg);
    setInputText("");
    scrollToBottom(false);
    inputRef.current?.focus();

    try {
      const newMessagePayload = {
        plan_id: targetPlanUuid,
        sender_id: effectiveSenderUuid,
        content: trimmed,
        message_type: "text" as const,
      };

      const { data, error } = await supabase
        .from("plan_messages")
        .insert(newMessagePayload)
        .select()
        .single();

      if (error) {
        console.error("[PlanChatScreen] Failed to insert plan_message:", error);
        // Rollback optimistic message & restore input text on error
        removeOptimisticMessage(tempId);
        setInputText(trimmed);
      } else if (data) {
        // Replace temp message with actual inserted row in shared cache
        replaceOptimisticMessage(tempId, data as ChatMessage);
        scrollToBottom(false);
      }
    } catch (err) {
      console.error("[PlanChatScreen] Exception inserting plan_message:", err);
      removeOptimisticMessage(tempId);
      setInputText(trimmed);
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

      targetParticipants.forEach((pp, pIdx) => {
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

        const stablePartId = pp.id || (pp as any).dbUuid || pp.user_id || `pIdx-${pIdx}`;
        const generatedKey = `sys-joined-${stablePartId}`;

        items.push({
          id: generatedKey,
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

  const scrollToBottom = (smooth = false) => {
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

  // Track initial scroll completion per plan
  const hasInitiallyScrolledRef = useRef<string | null>(null);

  // Sync scroll to bottom before DOM paint when entering chat or receiving new messages
  useLayoutEffect(() => {
    if (loading || timelineItems.length === 0) return;

    const isNewPlanEntry = hasInitiallyScrolledRef.current !== targetPlanUuid;
    const prevLength = prevItemsLengthRef.current;
    const isNewItemAdded = timelineItems.length > prevLength;
    prevItemsLengthRef.current = timelineItems.length;

    if (isNewPlanEntry) {
      hasInitiallyScrolledRef.current = targetPlanUuid;
      scrollToBottom(false);
      // Double frame fallback to handle layout calculation after initial render
      requestAnimationFrame(() => {
        scrollToBottom(false);
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      });
      return;
    }

    if (isNewItemAdded) {
      const latestItem = timelineItems[timelineItems.length - 1];
      const isSentByMe = latestItem?.senderId === currentUserId;

      if (isSentByMe || !isScrolledUp) {
        scrollToBottom(false);
      } else {
        setHasNewUnreadMessages(true);
      }
    }
  }, [loading, timelineItems, targetPlanUuid, currentUserId, isScrolledUp]);

  // Instant scroll to latest message when keyboard opens / viewport resizes
  useEffect(() => {
    if (keyboardOpen) {
      scrollToBottom(false);
      const timer = setTimeout(() => {
        scrollToBottom(false);
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [keyboardOpen, viewportHeight]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col w-full h-[100dvh] overflow-hidden text-left font-sans select-none"
    >
      {/* 1. INDEPENDENT FIXED HERO HEADER OVERLAY — Completely isolated from pager flex/resize */}
      {plan && (
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-auto">
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
            className="absolute top-[calc(64px+14px+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-40 pointer-events-none"
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
                onMoveToGoing={(pId, uId, opts) => moveParticipantToGoing(pId, uId, opts)}
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
                onSwapParticipants={(pId, goingId, waitlistId) => swapParticipants(pId, goingId, waitlistId)}
                onRemoveAndReplaceWithWaitlist={(pId, removeId, promoteId) => removeAndReplaceWithWaitlist(pId, removeId, promoteId)}
                onReorderWaitlist={(pId, orderedUuids) => reorderWaitlist(pId, orderedUuids)}
                onSwitchToAutomaticMode={(pId, userIds) => switchToAutomaticWaitlistMode(pId, userIds)}
                onOpenActivity={() => goToPage(2)}
                onPlanSizeEditingChange={setIsEditingPlanSize}
                showWaitlistMode={false}
              />
            )}
          </div>

          {/* PAGE 1: CHAT (DEFAULT) */}
          <div
            className="w-1/3 h-full overflow-hidden flex flex-col justify-between flex-shrink-0 relative"
            style={{
              height: keyboardOpen && viewportHeight ? `${viewportHeight - 64}px` : "100%",
            }}
          >
            <div
              ref={chatMessagesRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto touch-pan-y pl-6 pr-4 pt-4 pb-3 flex flex-col"
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
                timelineItems.map((item, index) => {
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
                  const date = new Date(item.createdAt);
                  const hours = date.getHours();
                  const minutes = date.getMinutes().toString().padStart(2, "0");
                  const timeStr = `${hours}:${minutes}`;

                  // Sender grouping: pure sender identity match (no time-gap splitting)
                  const prevItem = index > 0 ? timelineItems[index - 1] : null;
                  const nextItem = index < timelineItems.length - 1 ? timelineItems[index + 1] : null;

                  const isPrevSameSender = Boolean(
                    prevItem &&
                      !prevItem.isSystem &&
                      prevItem.senderId === item.senderId
                  );

                  const isNextSameSender = Boolean(
                    nextItem &&
                      !nextItem.isSystem &&
                      nextItem.senderId === item.senderId
                  );

                  const isFirstInGroup = !isPrevSameSender && isNextSameSender;
                  const isMiddleInGroup = isPrevSameSender && isNextSameSender;
                  const isLastInGroup = isPrevSameSender && !isNextSameSender;
                  const isSingleInGroup = !isPrevSameSender && !isNextSameSender;

                  const showAvatar = !isMe && (isFirstInGroup || isSingleInGroup);

                  // Resolve sender profile, name, and avatar from plan.members or dbUsers
                  let senderName = "";
                  let senderAvatarSrc = "";
                  if (!isMe && item.senderId && plan) {
                    const memberMatch = (plan.members || []).find((m) => {
                      const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
                      return mId === item.senderId;
                    });
                    if (memberMatch) {
                      senderName = memberMatch.name || "";
                      senderAvatarSrc = memberMatch.avatar || "";
                    } else {
                      const userMatch = (dbUsers || []).find(
                        (u) => u.id === item.senderId || u.public_id === item.senderId
                      );
                      if (userMatch) {
                        senderName = userMatch.full_name || userMatch.name || "";
                        senderAvatarSrc = userMatch.avatar_url || "";
                      }
                    }
                  }
                  if (!senderName) senderName = "Member";

                  // Group spacing: 1.5–2px gap between grouped messages from same sender, 10px between different senders
                  const topMarginClass = isPrevSameSender ? "mt-[2px]" : "mt-2.5";

                  // WhatsApp corner radius matrix: First message has integrated tail corner; subsequent messages are perfectly symmetrical rounded-2xl
                  let outgoingBorderRadiusClass = "rounded-2xl rounded-tr-none";
                  if (isFirstInGroup || isSingleInGroup) outgoingBorderRadiusClass = "rounded-2xl rounded-tr-none";
                  else outgoingBorderRadiusClass = "rounded-2xl";

                  let incomingBorderRadiusClass = "rounded-2xl rounded-tl-none";
                  if (isFirstInGroup || isSingleInGroup) incomingBorderRadiusClass = "rounded-2xl rounded-tl-none";
                  else incomingBorderRadiusClass = "rounded-2xl";

                  const isFirstOutgoing = isMe && (isFirstInGroup || isSingleInGroup);

                  // Helper: Detect if content contains ONLY emojis (1-3 emojis)
                  const getEmojiCount = (str: string): number => {
                    const trimmed = str.trim();
                    if (!trimmed) return 0;
                    // Remove variation selectors (\ufe0f) and zero-width joiners (\u200d) for clean testing
                    const cleanStr = trimmed.replace(/[\ufe0f\u200d\u1f3fb-\u1f3ff]/g, "");
                    // Test if string contains ONLY emojis using Extended_Pictographic property
                    try {
                      if (!/^\p{Extended_Pictographic}+$/u.test(cleanStr)) return 0;
                    } catch {
                      // Fallback regex if \p{Extended_Pictographic} isn't supported
                      if (!/^[\u1F300-\u1F9FF\u2600-\u26FF\u2700-\u27BF]+$/.test(cleanStr)) return 0;
                    }
                    // Count unicode grapheme clusters
                    const segmenter = typeof Intl !== "undefined" && (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: "grapheme" }) : null;
                    const count = segmenter ? Array.from(segmenter.segment(trimmed)).length : Array.from(trimmed).length;
                    return count >= 1 && count <= 3 ? count : 0;
                  };

                  const emojiCount = getEmojiCount(item.content);

                  // Dynamic text & bubble classes for emoji-only messages vs standard text
                  const emojiTextClass =
                    emojiCount === 1
                      ? "text-[32px] leading-[1.2]"
                      : emojiCount === 2
                      ? "text-[28px] leading-[1.2]"
                      : emojiCount === 3
                      ? "text-[24px] leading-[1.2]"
                      : "text-[13.5px] leading-[1.4]";

                  const bubblePaddingClass =
                    emojiCount > 0
                      ? "px-3.5 pt-2.5 pb-2 min-h-[44px]"
                      : "pl-3 pr-3 pt-2 pb-1.5 min-h-[36px]";

                  const spacerWidthClass = emojiCount > 0 ? "w-[44px]" : "w-[38px]";

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"} ${topMarginClass}`}
                    >
                      {isMe ? (
                        /* Outgoing Message Bubble */
                        <div
                          className={`max-w-[87%] sm:max-w-[80%] w-fit ${bubblePaddingClass} ${emojiTextClass} break-words relative flex flex-col bg-[#C46A2C] text-white ${outgoingBorderRadiusClass} ${
                            isFirstOutgoing
                              ? "before:content-[''] before:absolute before:top-0 before:-right-[6px] before:w-[6px] before:h-[8px] before:bg-[#C46A2C] before:[clip-path:polygon(0_0,100%_0,0_100%)]"
                              : ""
                          }`}
                        >
                          <div className="font-normal whitespace-pre-line break-words inline-block">
                            {item.content}
                            <span className={`inline-block ${spacerWidthClass} h-0 align-baseline pointer-events-none`} />
                          </div>
                          <div
                            className="absolute bottom-1 right-2.5 flex items-center gap-1 select-none pointer-events-none text-white/60 leading-none"
                            style={{ fontSize: "11px", fontWeight: 400 }}
                          >
                            <span className="whitespace-nowrap">{timeStr}</span>
                            <span className="w-0 inline-block" />
                          </div>
                        </div>
                      ) : (
                        /* Incoming message (Left-aligned) */
                        <div className="flex flex-col max-w-[93%] sm:max-w-[85%] w-fit">
                          {/* Sender Name: Rendered 2px above the first bubble of a sender group */}
                          {showAvatar && (
                            <span className="text-[13px] font-medium text-white mb-[2px] pl-[34px] tracking-wide select-none">
                              {senderName}
                            </span>
                          )}

                          {/* Row container: Avatar + Message Bubble (Top-aligned with first bubble) */}
                          <div className="flex items-start gap-1.5 max-w-full">
                            {/* Avatar Column: Fixed 28px width, top-aligned with first bubble */}
                            <div className="w-[28px] h-[28px] flex-shrink-0">
                              {showAvatar ? (
                                <div className="w-[28px] h-[28px] rounded-full border border-white/10 overflow-hidden bg-zinc-800 flex items-center justify-center">
                                  <UserAvatar src={senderAvatarSrc} alt={senderName} size="w-full h-full" />
                                </div>
                              ) : (
                                /* Empty spacer so follow-up bubbles align under the first bubble */
                                <div className="w-[28px] h-[28px]" />
                              )}
                            </div>

                            {/* Incoming Message Bubble */}
                            <div
                              className={`w-fit max-w-[calc(100%-34px)] ${bubblePaddingClass} ${emojiTextClass} break-words relative flex flex-col bg-[#1f2c34] text-white min-w-0 ${incomingBorderRadiusClass} ${
                                showAvatar
                                  ? "before:content-[''] before:absolute before:top-0 before:-left-[6px] before:w-[6px] before:h-[8px] before:bg-[#1f2c34] before:[clip-path:polygon(100%_0,0_0,100%_100%)]"
                                  : ""
                              }`}
                            >
                              <div className="font-normal whitespace-pre-line break-words inline-block">
                                {item.content}
                                <span className={`inline-block ${spacerWidthClass} h-0 align-baseline pointer-events-none`} />
                              </div>
                              <div
                                className="absolute bottom-1 right-2.5 flex items-center gap-1 select-none pointer-events-none text-white/50 leading-none"
                                style={{ fontSize: "11px", fontWeight: 400 }}
                              >
                                <span className="whitespace-nowrap">{timeStr}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* MESSAGE COMPOSER */}
            <form
              onSubmit={handleSendMessage}
              className={`bg-black/90 px-4 pt-1.5 ${
                keyboardOpen ? "pb-1.5" : "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
              } flex items-center flex-shrink-0`}
            >
              <div className="relative w-full flex items-center h-[46px] bg-zinc-900/90 border border-white/[0.08] rounded-full px-5 focus-within:border-white/20 transition-all shadow-lg">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Send a message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => {
                    scrollToBottom(false);
                  }}
                  className="w-full h-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none pr-10 font-sans"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  onMouseDown={(e) => e.preventDefault()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#C46A2C] text-white flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:active:scale-100 transition cursor-pointer flex-shrink-0 shadow-md"
                >
                  <SendHorizontal className="w-4 h-4 text-white stroke-[2]" />
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
          onUpdatePlanDetails={async (updates) => {
            try {
              await updatePlanDetails(plan.id, updates as any);
            } catch (err) {
              console.error("Failed to update plan details:", err);
            }
          }}
          onWaitlistModeChange={async (newMode) => {
            if (newMode === 'assigned') {
              await updatePlanDetails(plan.id, { participant_filtering: 'ASSIGNED' });
            } else {
              goToPage(0); // Switch to Participants tab to initiate validation & selection sheet
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
              throw err;
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
              await leavePlan(plan.id, currentUserId);
              setShowSettingsScreen(false);
              onBack();
            } catch (err) {
              console.error("PlanChatScreen onLeavePlan error:", err);
              throw err;
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
