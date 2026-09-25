import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, SendHorizontal, MessageSquare, ChevronDown, CheckCheck, Check } from "lucide-react";
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
import { uploadPlanImage } from "../../../shared/utils/imageUtils";
import { cleanPlanId } from "../../plans/utils/planUtils";
import { findPlanBySlugOrId } from "../../plans/utils/planSlugUtils";
import { PlanParticipantManagementWrapper } from "../../plans/screens/PlansScreen/PlansPreview/PlanParticipantManagementWrapper";
import { PlanDetailsScreen } from "../../wallet/screens/PlanBalances";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { useHorizontalPager } from "../hooks/useHorizontalPager";
import { useChatCache, ChatMessage, getCachedUnreadInfo, setCachedUnreadInfo } from "../hooks/useChatCache";
import { AddCost } from "../../wallet/screens/AddCost";
import { markPlanChatAsRead } from "../utils/chatReads";

interface PlanChatScreenProps {
  planId: string;
  onBack: () => void;
  /** Optional: called when the user taps the header to open the Plan Details screen */
  onOpenPlanDetails?: () => void;
}

const PAGE_NAMES: Record<number, string> = {
  0: "Participants",
  1: "Chat",
};

export const PlanChatScreen: React.FC<PlanChatScreenProps> = ({
  planId,
  onBack,
  onOpenPlanDetails,
}) => {
  const { plans, dbPlanParticipants, moveParticipantToGoing, moveParticipantToWaitlist, moveParticipantToInvited, removeParticipant, promoteParticipantToHost, demoteHostToParticipant, addParticipantsToPlan, reorderWaitlist, swapParticipants, removeAndReplaceWithWaitlist, resolvePaidPlanLeaveRequest, replaceParticipant, updatePlanDetails, updatePlanSettings, leavePlan, changePlanHost, cancelPlan } = usePlansStore();
  const { userProfile, activeUserId, activeUserUuid, dbUsers } = useProfileStore();

  const rawSenderId =
    userProfile?.dbUuid ||
    activeUserUuid ||
    (userProfile as any)?.id ||
    (userProfile as any)?.user_id ||
    activeUserId ||
    "";

  const currentUserId = useMemo(() => {
    if (rawSenderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSenderId)) {
      return rawSenderId;
    }
    const match = (dbUsers || []).find(
      (u: any) => u.id === rawSenderId || u.public_id === rawSenderId || u.user_id === rawSenderId
    );
    return match?.id || rawSenderId;
  }, [rawSenderId, dbUsers]);
  const senderUuid = currentUserId;
  const plan = useMemo(() => {
    return findPlanBySlugOrId(plans, planId) || plans.find((p) => p.id === planId || p.dbUuid === planId);
  }, [plans, planId]);
  const isPlanCompleted = String(plan?.status || "").toUpperCase() === "COMPLETED";

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
  const [showBalancesScreen, setShowBalancesScreen] = useState(false);
  const [replaceTargetUserId, setReplaceTargetUserId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = textareaRef;

  // ── Keyboard Visibility & Visual Viewport State ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const maxHeightRef = useRef<number>(
    typeof window !== "undefined"
      ? window.visualViewport
        ? Math.max(window.visualViewport.height, window.innerHeight)
        : window.innerHeight
      : 800
  );
  const [viewportHeight, setViewportHeight] = useState<number | null>(() => {
    if (typeof window !== "undefined" && window.visualViewport) {
      return window.visualViewport.height;
    }
    return null;
  });
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (vv) {
        const currentHeight = Math.round(vv.height);
        const currentTop = Math.round(vv.offsetTop || 0);

        // Track max unconstrained height (e.g. when keyboard is closed)
        if (currentHeight > maxHeightRef.current) {
          maxHeightRef.current = currentHeight;
        }

        const keyboardGap = Math.max(0, maxHeightRef.current - currentHeight);
        const isInputFocused = document.activeElement === textareaRef.current;
        const isHeightReduced = keyboardGap > 100;
        const isKbActive = Boolean(isHeightReduced || (isInputFocused && keyboardGap > 60));

        setViewportHeight(currentHeight);
        setViewportOffsetTop(currentTop);
        setKeyboardOpen(isKbActive);

        if (window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }
      } else {
        const currentHeight = window.innerHeight;
        if (currentHeight > maxHeightRef.current) {
          maxHeightRef.current = currentHeight;
        }
        const isInputFocused = document.activeElement === textareaRef.current;
        const isHeightReduced = (maxHeightRef.current - currentHeight) > 100;
        setViewportHeight(currentHeight);
        setViewportOffsetTop(0);
        setKeyboardOpen(Boolean(isHeightReduced || isInputFocused));
      }
    };

    handleViewportChange();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", handleViewportChange);
      vv.addEventListener("scroll", handleViewportChange);
    }
    window.addEventListener("resize", handleViewportChange);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", handleViewportChange);
        vv.removeEventListener("scroll", handleViewportChange);
      }
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  const [isEditingPlanSize, setIsEditingPlanSize] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [showAddCostSheet, setShowAddCostSheet] = useState(false);

  const isAnySheetOpen = isBottomSheetOpen || showAddCostSheet;

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
    totalPages: 2,
    keyboardOpen,
    disabled: isEditingPlanSize || isAnySheetOpen,
  });

  const handleOpenReplacePicker = useCallback((targetUserId: string) => {
    setReplaceTargetUserId(targetUserId);
    goToPage(0); // Switch to participants page where replacement selection happens
  }, [goToPage]);

  // ── Track Previous Read Position & Dynamic In-Chat Unread Divider ──
  // Cache-first: initialize unreadDivider synchronously from getCachedUnreadInfo
  const initialCachedUnread = targetPlanUuid ? getCachedUnreadInfo(targetPlanUuid) : undefined;
  const [unreadDivider, setUnreadDivider] = useState<{
    firstUnreadId: string | null;
    latestUnreadId: string | null;
    count: number;
    isVisible: boolean;
  }>(() => {
    if (initialCachedUnread && initialCachedUnread.count > 0) {
      return {
        firstUnreadId: initialCachedUnread.firstUnreadId,
        latestUnreadId: initialCachedUnread.latestUnreadId,
        count: initialCachedUnread.count,
        isVisible: true,
      };
    }
    return { firstUnreadId: null, latestUnreadId: null, count: 0, isVisible: false };
  });

  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const latestUnreadMsgRef = useRef<HTMLDivElement>(null);
  const initialUnreadFetchedRef = useRef<string | null>(null);
  const hasInitiallyPositionedRef = useRef<string | null>(null);
  const targetPlanUuidRef = useRef(targetPlanUuid);
  const currentUserIdRef = useRef(currentUserId);
  const latestMessageRef = useRef<ChatMessage | null>(null);

  // Keep latest refs updated for unmount and exit handlers
  useEffect(() => {
    targetPlanUuidRef.current = targetPlanUuid;
    currentUserIdRef.current = currentUserId;
    latestMessageRef.current = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  });

  // Fetch / synchronize unread position & count upon entering this plan in background
  useEffect(() => {
    if (!targetPlanUuid || !currentUserId) return;
    let isMounted = true;
    initialUnreadFetchedRef.current = null;
    hasInitiallyPositionedRef.current = null;

    // Synchronize cache-first state if available
    const cached = getCachedUnreadInfo(targetPlanUuid);
    if (cached && cached.count > 0) {
      setUnreadDivider({
        firstUnreadId: cached.firstUnreadId,
        latestUnreadId: cached.latestUnreadId,
        count: cached.count,
        isVisible: true,
      });
    }

    const fetchUnreadStatus = async () => {
      try {
        // 1. Primary: Call RPC get_plan_unread_info for high-performance exact calculation
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_plan_unread_info", {
          p_user_id: currentUserId,
          p_plan_id: targetPlanUuid,
        } as any);

        if (!isMounted) return;

        const info = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcError && info) {
          const count = Number(info.unread_count || 0);
          const firstId = info.first_unread_message_id || null;
          const latestId = (info as any).latest_unread_message_id || null;
          initialUnreadFetchedRef.current = targetPlanUuid;

          // Update cache store
          setCachedUnreadInfo(targetPlanUuid, {
            count,
            firstUnreadId: firstId,
            latestUnreadId: latestId,
            lastReadAt: info.last_read_at || null,
            lastReadMessageId: info.last_read_message_id || null,
          });

          if (count > 0) {
            setUnreadDivider((prev) => {
              if (prev.isVisible && prev.firstUnreadId === firstId && prev.count === count) {
                return prev;
              }
              if (prev.firstUnreadId !== firstId) {
                // If unread boundary changed, allow repositioning
                hasInitiallyPositionedRef.current = null;
              }
              return {
                firstUnreadId: firstId,
                latestUnreadId: latestId,
                count,
                isVisible: true,
              };
            });
            return;
          } else {
            // If count is 0, only clear divider if it wasn't already visible from this chat session
            setUnreadDivider((prev) => {
              if (prev.isVisible) {
                return prev; // "The divider remains visible for the entire chat session."
              }
              return { firstUnreadId: null, latestUnreadId: null, count: 0, isVisible: false };
            });
            return;
          }
        }

        // 2. Fallback: Query plan_chat_reads directly
        const { data: readData } = await supabase
          .from("plan_chat_reads")
          .select("last_read_at, last_read_message_id")
          .eq("plan_id", targetPlanUuid)
          .eq("user_id", currentUserId)
          .maybeSingle();

        if (!isMounted) return;

        const lastReadAt = readData?.last_read_at || null;
        const unreadMsgs = messages.filter((m) => {
          if (m.sender_id === currentUserId) return false;
          if (m.message_type === "system") return false;
          if (!lastReadAt) return true;
          return new Date(m.created_at).getTime() > new Date(lastReadAt).getTime();
        });

        initialUnreadFetchedRef.current = targetPlanUuid;
        if (unreadMsgs.length > 0) {
          const firstId = unreadMsgs[0].id;
          const latestId = unreadMsgs[unreadMsgs.length - 1].id;
          setCachedUnreadInfo(targetPlanUuid, {
            count: unreadMsgs.length,
            firstUnreadId: firstId,
            latestUnreadId: latestId,
            lastReadAt,
            lastReadMessageId: readData?.last_read_message_id || null,
          });
          setUnreadDivider((prev) => {
            if (prev.firstUnreadId !== firstId) {
              hasInitiallyPositionedRef.current = null;
            }
            return {
              firstUnreadId: firstId,
              latestUnreadId: latestId,
              count: unreadMsgs.length,
              isVisible: true,
            };
          });
        } else {
          setUnreadDivider((prev) => {
            if (prev.isVisible) return prev;
            return { firstUnreadId: null, latestUnreadId: null, count: 0, isVisible: false };
          });
        }
      } catch (err) {
        if (isMounted) {
          initialUnreadFetchedRef.current = targetPlanUuid;
        }
      }
    };

    fetchUnreadStatus();

    return () => {
      isMounted = false;
    };
  }, [targetPlanUuid, currentUserId]);

  // Handle explicit Back button exit from PlanChatScreen (marks chat read up to latest message when leaving)
  const handleExitChat = useCallback(async () => {
    if (targetPlanUuid && currentUserId) {
      const latestMsg = latestMessageRef.current;
      await markPlanChatAsRead(targetPlanUuid, latestMsg ? latestMsg.id : null, currentUserId);
    }
    onBack();
  }, [targetPlanUuid, currentUserId, onBack]);

  // Sync mark-as-read on unmount ONLY (runs when leaving chat / closing screen)
  useEffect(() => {
    return () => {
      const planUuid = targetPlanUuidRef.current;
      const userId = currentUserIdRef.current;
      const latestMsg = latestMessageRef.current;
      if (planUuid && userId) {
        markPlanChatAsRead(planUuid, latestMsg ? latestMsg.id : null, userId);
      }
    };
  }, []);

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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
      textareaRef.current.focus();
    }
    scrollToBottom(false);

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
    messageType?: "text" | "system" | "poll" | "cost";
    content: string;
    senderId?: string;
    createdAt: string;
  }

  // Derived timeline events combined with plan_messages
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    // 1. User messages from plan_messages
    messages.forEach((msg) => {
      const isSystemMsg = msg.message_type === "system";
      const sysType = msg.system_message_type;

      if (isSystemMsg) {
        // Do NOT display participant join or leave system messages in Plan Chat
        const isJoinOrLeave =
          sysType === SystemMessageType.PARTICIPANT_JOINED ||
          sysType === SystemMessageType.PARTICIPANT_LEFT ||
          sysType === ("PARTICIPANT_JOINED" as any) ||
          sysType === ("PARTICIPANT_LEFT" as any) ||
          (msg.content && (/\bjoined\b/i.test(msg.content) || /\bleft\b/i.test(msg.content)));

        if (isJoinOrLeave) {
          return;
        }

        let content = msg.content;
        const isSenderCurrentUser = Boolean(
          (currentUserId && msg.sender_id && String(currentUserId).toLowerCase() === String(msg.sender_id).toLowerCase()) ||
          (activeUserId && msg.sender_id && String(activeUserId).toLowerCase() === String(msg.sender_id).toLowerCase())
        );

        const isCreatedMsg =
          sysType === SystemMessageType.PLAN_CREATED ||
          sysType === ("PLAN_CREATED" as any) ||
          (msg.content && /\bcreated\b/i.test(msg.content));

        if (isCreatedMsg && isSenderCurrentUser) {
          if (plan?.title && content.includes(plan.title)) {
            content = `You created ${plan.title}`;
          } else {
            content = content.replace(/^[^\s]+(\s+[^\s]+)?\s+created/i, "You created");
          }
        }

        items.push({
          id: msg.id,
          isSystem: true,
          systemType: msg.system_message_type || undefined,
          messageType: msg.message_type,
          content,
          senderId: msg.sender_id,
          createdAt: msg.created_at,
        });
        return;
      }

      items.push({
        id: msg.id,
        isSystem: false,
        systemType: undefined,
        messageType: msg.message_type,
        content: msg.content,
        senderId: msg.sender_id,
        createdAt: msg.created_at,
      });
    });

    if (plan) {
      const targetPlanId = plan.dbUuid || plan.id;

      // 2. Event: Plan created (from plans.created_at)
      if (plan.createdAt) {
        const hasDbPlanCreatedMsg = items.some(
          (item) =>
            item.isSystem &&
            (item.systemType === SystemMessageType.PLAN_CREATED ||
              (item.content && item.content.toLowerCase().includes("created")))
        );

        if (!hasDbPlanCreatedMsg) {
          const hostOrCreatorId = plan.hostId || plan.creatorId || (plan as any).creator_id || (plan as any).host_id;

          const isCurrentUserCreator = Boolean(
            (currentUserId && hostOrCreatorId && String(currentUserId).toLowerCase() === String(hostOrCreatorId).toLowerCase()) ||
            (userProfile?.dbUuid && hostOrCreatorId && String(userProfile.dbUuid).toLowerCase() === String(hostOrCreatorId).toLowerCase()) ||
            (activeUserId && hostOrCreatorId && String(activeUserId).toLowerCase() === String(hostOrCreatorId).toLowerCase())
          );

          let createdMessageText = "";
          if (isCurrentUserCreator) {
            createdMessageText = plan.title ? `You created ${plan.title}` : "You created a plan";
          } else {
            let hostName = (plan.creatorName || "").trim();
            if (!hostName) {
              const matchUser = (dbUsers || []).find(
                (u: any) => u.id === hostOrCreatorId || u.public_id === hostOrCreatorId
              );
              if (matchUser?.full_name) {
                hostName = matchUser.full_name;
              } else {
                const hostMember = (plan.members || []).find(
                  (m) => m.role === "HOST" || m.isHost || m.userId === hostOrCreatorId || m.userUuid === hostOrCreatorId
                );
                if (hostMember?.name) {
                  hostName = hostMember.name;
                }
              }
            }
            createdMessageText = hostName && plan.title
              ? `${hostName} created ${plan.title}`
              : "Plan created";
          }

          items.push({
            id: `sys-created-${targetPlanId}`,
            isSystem: true,
            systemType: SystemMessageType.PLAN_CREATED,
            content: createdMessageText,
            createdAt: plan.createdAt,
          });
        }
      }
    }

    // 3. Sort unified timeline chronologically by createdAt ASC
    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages, plan, dbUsers, userProfile, activeUserId, currentUserId]);

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

  // Find indices of first and latest unread messages in timelineItems
  const { firstUnreadIndex, latestUnreadIndex } = useMemo(() => {
    if (!unreadDivider.isVisible || unreadDivider.count <= 0 || timelineItems.length === 0) {
      return { firstUnreadIndex: -1, latestUnreadIndex: -1 };
    }

    let firstIdx = -1;
    let latestIdx = -1;

    // 1. Direct match by message UUIDs
    if (unreadDivider.firstUnreadId) {
      firstIdx = timelineItems.findIndex((it) => it.id === unreadDivider.firstUnreadId);
    }
    if (unreadDivider.latestUnreadId) {
      latestIdx = timelineItems.findIndex((it) => it.id === unreadDivider.latestUnreadId);
    }

    // 2. Fallback: match among incoming messages from other participants (excluding system messages)
    const otherIndices: number[] = [];
    timelineItems.forEach((it, idx) => {
      if (!it.isSystem && it.senderId !== currentUserId) {
        otherIndices.push(idx);
      }
    });

    if (otherIndices.length > 0) {
      const count = Math.min(unreadDivider.count, otherIndices.length);
      const fallbackFirst = otherIndices[otherIndices.length - count];
      const fallbackLatest = otherIndices[otherIndices.length - 1];

      if (firstIdx === -1) firstIdx = fallbackFirst;
      if (latestIdx === -1) latestIdx = fallbackLatest;
    }

    return { firstUnreadIndex: firstIdx, latestUnreadIndex: latestIdx };
  }, [
    unreadDivider.isVisible,
    unreadDivider.count,
    unreadDivider.firstUnreadId,
    unreadDivider.latestUnreadId,
    timelineItems,
    currentUserId,
  ]);

  // Centering helper: centers the unread divider around the vertical center of the chat viewport
  const centerUnreadDivider = useCallback(() => {
    const container = chatMessagesRef.current;
    const divider = unreadDividerRef.current;
    if (!container || !divider) return false;

    // 1. Native scrollIntoView center
    divider.scrollIntoView({ block: "center", behavior: "auto" });

    // 2. Precise vertical pixel centering
    const containerRect = container.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    const currentScroll = container.scrollTop;
    const offsetFromContainerTop = dividerRect.top - containerRect.top;
    const targetOffset = (containerRect.height - dividerRect.height) / 2;
    const delta = offsetFromContainerTop - targetOffset;

    if (Math.abs(delta) > 1) {
      container.scrollTop = currentScroll + delta;
    }
    return true;
  }, []);

  // Initial scroll positioning upon entering chat:
  // - If unread messages exist: center unread divider in viewport
  // - If no unread messages: open at latest message / bottom
  useLayoutEffect(() => {
    if (loading || timelineItems.length === 0) return;
    if (hasInitiallyPositionedRef.current === targetPlanUuid) return;

    // Case A: Unread messages exist -> position around VERTICAL CENTER of the UNREAD DIVIDER
    if (unreadDivider.isVisible && unreadDivider.count > 0 && firstUnreadIndex >= 0) {
      if (unreadDividerRef.current) {
        hasInitiallyPositionedRef.current = targetPlanUuid;
        centerUnreadDivider();
        requestAnimationFrame(() => {
          centerUnreadDivider();
          requestAnimationFrame(() => {
            centerUnreadDivider();
          });
        });
      }
      return;
    }

    // Case B: No unread messages -> open normally at the latest message / bottom
    if (
      (initialUnreadFetchedRef.current === targetPlanUuid || initialCachedUnread !== undefined) &&
      !unreadDivider.isVisible
    ) {
      hasInitiallyPositionedRef.current = targetPlanUuid;
      scrollToBottom(false);
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [
    loading,
    timelineItems.length,
    unreadDivider.isVisible,
    unreadDivider.count,
    firstUnreadIndex,
    targetPlanUuid,
    centerUnreadDivider,
    initialCachedUnread,
  ]);

  // Fallback effect when divider DOM node mounts
  useEffect(() => {
    if (loading || timelineItems.length === 0) return;
    if (hasInitiallyPositionedRef.current === targetPlanUuid) return;

    if (unreadDivider.isVisible && unreadDivider.count > 0 && firstUnreadIndex >= 0 && unreadDividerRef.current) {
      hasInitiallyPositionedRef.current = targetPlanUuid;
      centerUnreadDivider();
      requestAnimationFrame(() => {
        centerUnreadDivider();
      });
    }
  }, [
    loading,
    timelineItems.length,
    unreadDivider.isVisible,
    unreadDivider.count,
    firstUnreadIndex,
    targetPlanUuid,
    centerUnreadDivider,
  ]);

  // Maintain scroll position when new messages arrive while inside chat
  useLayoutEffect(() => {
    if (loading || timelineItems.length === 0) return;

    const prevLength = prevItemsLengthRef.current;
    const isNewItemAdded = timelineItems.length > prevLength;
    prevItemsLengthRef.current = timelineItems.length;

    // If new item was added after initial positioning, scroll to bottom if sent by me or already at bottom
    if (isNewItemAdded && hasInitiallyPositionedRef.current === targetPlanUuid) {
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

  // ── Multi-line Textarea Auto-expand (Up to 10 lines, then vertical scroll) ──
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to 'auto' to correctly re-measure scrollHeight when text wraps or is deleted
    textarea.style.height = "auto";

    // 10 visible lines max: 20px line-height * 10 = 200px
    const computed = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const maxContentHeight = lineHeight * 10;
    const maxHeight = maxContentHeight + paddingTop + paddingBottom;

    const scrollH = textarea.scrollHeight;
    if (scrollH > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.height = `${scrollH}px`;
      textarea.style.overflowY = "hidden";
    }
  }, [inputText]);

  // When input text changes and composer expands upward, keep messages visible if already at bottom
  useLayoutEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom(false);
    }
  }, [inputText, isScrolledUp]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
      if (!isTouch) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      style={{
        height: viewportHeight ? `${viewportHeight}px` : "100dvh",
        top: viewportOffsetTop ? `${viewportOffsetTop}px` : 0,
      }}
      className="fixed left-0 right-0 z-50 bg-[#050505] flex flex-col w-full overflow-hidden text-left font-sans select-none"
    >
      {/* 1. INDEPENDENT FIXED HERO HEADER OVERLAY — Completely isolated from pager flex/resize */}
      {plan && (
        <div className={`absolute top-0 left-0 right-0 z-50 ${isAnySheetOpen ? "pointer-events-none select-none" : "pointer-events-auto"}`}>
          <HeroHeader
            title={plan.title}
            creatorName={isHost ? "You" : plan.creatorName}
            creatorAvatar={isHost ? userProfile?.avatar : plan.creatorAvatar}
            hosts={allHosts}
            viewerId={currentUserId}
            onClose={isAnySheetOpen ? undefined : handleExitChat}
            isHost={isHost && !isCancelled}
            coverImage={plan.coverImage}
            category={plan.category}
            hideHostAttribution={true}
            onHeaderPress={isAnySheetOpen ? undefined : onOpenPlanDetails}
            currentPage={currentPage}
            onSelectPage={(pageIdx) => { if (!isAnySheetOpen) goToPage(pageIdx); }}
            onOpenParticipants={() => { if (!isAnySheetOpen) goToPage(0); }}
            onOpenExpenses={() => { if (!isAnySheetOpen) setShowBalancesScreen(true); }}
            onEditTitle={!isCancelled && !isAnySheetOpen ? async (newTitle) => {
              try {
                await updatePlanDetails(plan.id, { title: newTitle });
              } catch (err) {
                console.error("Failed to update title:", err);
              }
            } : undefined}
            onOpenSettings={!isCancelled && !isAnySheetOpen ? () => setShowSettingsScreen(true) : undefined}
          />
        </div>
      )}

      {/* 2. DEDICATED RESIZABLE PAGER CONTAINER — Only this area resizes when keyboard opens */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative w-full touch-pan-y select-none pt-[calc(96px+env(safe-area-inset-top,0px))]"
        style={{ touchAction: isAnySheetOpen ? "none" : "pan-y" }}
      >
        <motion.div
          {...pagerProps}
          style={{ x: pageX, touchAction: "pan-y" }}
          className="flex h-full w-[200%]"
        >
          {/* PAGE 0: PARTICIPANTS */}
          <div className="w-1/2 h-full overflow-hidden flex flex-col flex-shrink-0 relative">
            {plan && (
              <PlanParticipantManagementWrapper
                plan={plan}
                userProfile={userProfile || { id: currentUserId, dbUuid: currentUserId, name: "You" } as any}
                activeUserId={currentUserId}
                isHost={isHost}
                isCreatorHost={isHost}
                displayMode="embedded"
                currentPage={currentPage}
                onBack={() => goToPage(1)}
                onMoveToGoing={(pId, uId, opts) => moveParticipantToGoing(pId, uId, opts)}
                onMoveToWaitlist={(pId, uId) => moveParticipantToWaitlist(pId, uId)}
                onMoveToInvited={(pId, uId) => moveParticipantToInvited(pId, uId)}
                onRemoveParticipant={(pId, uId) => removeParticipant(pId, uId)}
                onPromoteToHost={(pId, uId) => promoteParticipantToHost(pId, uId)}
                onDemoteFromHost={(pId, uId) => demoteHostToParticipant(pId, uId)}
                onUpdatePlanCapacity={(pId, capacity, opts) =>
                  updatePlanDetails(
                    pId,
                    {
                      plan_size: capacity,
                      ...(opts?.totalCost !== undefined ? { total_cost: opts.totalCost } : {}),
                    },
                    opts
                  )
                }
                onCancelPlan={(pId) => cancelPlan(pId)}
                onAddParticipants={(pId, userIds, assignedGroup) =>
                  addParticipantsToPlan({
                    planId: pId,
                    inviteeUuids: userIds,
                    userProfile,
                    planTitle: plan.title || "",
                    assignedGroup,
                  })
                }
                onSwapParticipants={(pId, goingId, waitlistId) => swapParticipants(pId, goingId, waitlistId)}
                onRemoveAndReplaceWithWaitlist={(pId, removeId, promoteId) => {
                  if (replaceTargetUserId) {
                    const targetId = replaceTargetUserId;
                    setReplaceTargetUserId(null);
                    return resolvePaidPlanLeaveRequest(pId, targetId, 'REPLACED', promoteId);
                  }
                  return removeAndReplaceWithWaitlist(pId, removeId, promoteId);
                }}
                onReorderWaitlist={(pId, orderedUuids) => reorderWaitlist(pId, orderedUuids)}

                onPlanSizeEditingChange={setIsEditingPlanSize}
                onBottomSheetStateChange={setIsBottomSheetOpen}
                replaceTargetUserId={replaceTargetUserId}
                onCancelReplacement={() => setReplaceTargetUserId(null)}
                onConfirmReplacement={(pId, targetId, replacementId) => replaceParticipant(pId, targetId, replacementId)}
              />
            )}
          </div>

          {/* PAGE 1: CHAT (DEFAULT) */}
          <div className="w-1/2 h-full overflow-hidden flex flex-col justify-between flex-shrink-0 relative">
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
                  const isUnreadFirst = index === firstUnreadIndex;
                  const isLatestUnread = index === latestUnreadIndex;

                  const renderDivider = () => (
                    <AnimatePresence>
                      {isUnreadFirst && unreadDivider.isVisible && (
                        <motion.div
                          key="unread-messages-divider"
                          ref={unreadDividerRef}
                          initial={{ opacity: 0, scale: 0.96, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                          transition={{ duration: 0.35, ease: "easeInOut" }}
                          className="w-full flex items-center justify-center my-4 gap-3 select-none px-2"
                        >
                          <div className="flex-1 h-[1px] bg-white/[0.08]" />
                          <div className="flex items-center px-4 py-1.5 rounded-full bg-[#181a1c] border border-white/[0.08] shadow-sm">
                            <span className="text-[12px] font-medium text-[#2ebb64]/90 tracking-wide leading-none">
                              {unreadDivider.count} {unreadDivider.count === 1 ? "unread message" : "unread messages"}
                            </span>
                          </div>
                          <div className="flex-1 h-[1px] bg-white/[0.08]" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  );

                  if (item.isSystem) {
                    return (
                      <React.Fragment key={item.id}>
                        {isUnreadFirst && renderDivider()}
                        <div
                          ref={isLatestUnread ? latestUnreadMsgRef : undefined}
                          className="w-full flex items-center justify-center py-1.5 my-1"
                        >
                          <span className="text-[12px] font-medium text-zinc-500 bg-zinc-900/60 border border-white/[0.04] px-3 py-1 rounded-full text-center tracking-wide">
                            {item.content}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  }

                  const isMe = item.senderId === currentUserId;
                  const date = new Date(item.createdAt);
                  const hours = date.getHours();
                  const minutes = date.getMinutes().toString().padStart(2, "0");
                  const timeStr = `${hours}:${minutes}`;

                  // Sender grouping: pure sender identity match (no time-gap splitting).
                  // If this item starts with an unread divider, treat it as a fresh group start.
                  const prevItem = index > 0 ? timelineItems[index - 1] : null;
                  const nextItem = index < timelineItems.length - 1 ? timelineItems[index + 1] : null;

                  const isPrevSameSender = !isUnreadFirst && Boolean(
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
                        (u: any) => u.id === item.senderId || u.public_id === item.senderId
                      );
                      if (userMatch) {
                        senderName = (userMatch as any).full_name || (userMatch as any).name || "";
                        senderAvatarSrc = (userMatch as any).avatar_url || (userMatch as any).profile_photo_path || "";
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

                  // Helper to safely parse cost content JSON
                  const renderCostCard = () => {
                    let costTitleStr = "Expense";
                    let costAmountVal = 0;
                    let splitCount = 0;
                    let costPerPersonVal = 0;

                    try {
                      const parsed = JSON.parse(item.content);
                      if (parsed && typeof parsed === "object") {
                        costTitleStr = parsed.title || "Expense";
                        costAmountVal = Number(parsed.amount) || 0;
                        if (Array.isArray(parsed.splitWith)) {
                          splitCount = parsed.splitWith.length;
                        }
                        if (parsed.costPerPerson) {
                          costPerPersonVal = Number(parsed.costPerPerson);
                        } else if (splitCount > 0) {
                          costPerPersonVal = Math.round((costAmountVal / splitCount) * 100) / 100;
                        }
                      }
                    } catch {
                      costTitleStr = item.content || "Expense";
                    }

                    const formattedCost = costAmountVal.toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    });

                    const formattedPerPerson = costPerPersonVal.toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    });

                    return (
                      <div className="w-64 p-3.5 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-md my-1 text-left">
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2 mb-2">
                          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                            Added Expense
                          </span>
                          <span className="text-xs font-bold text-[#ff8b66]">
                            {formattedCost}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate">
                          {costTitleStr}
                        </p>
                        {splitCount > 0 && (
                          <div className="mt-2 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[11px] font-sans text-zinc-400">
                            <span>Split with {splitCount} {splitCount === 1 ? "person" : "people"}</span>
                            <span className="font-mono font-semibold text-zinc-300">{formattedPerPerson}/ea</span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (item.messageType === "cost") {
                    return (
                      <React.Fragment key={item.id}>
                        {isUnreadFirst && renderDivider()}
                        <div
                          ref={isLatestUnread ? latestUnreadMsgRef : undefined}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"} ${topMarginClass}`}
                        >
                          {!isMe && showAvatar && (
                            <span className="text-[13px] font-medium text-white mb-[2px] pl-[34px] tracking-wide select-none">
                              {senderName}
                            </span>
                          )}
                          <div className="flex items-start gap-1.5 max-w-full">
                            {!isMe && (
                              <div className="w-[28px] h-[28px] flex-shrink-0">
                                {showAvatar ? (
                                  <div className="w-[28px] h-[28px] rounded-full border border-white/10 overflow-hidden bg-zinc-800 flex items-center justify-center">
                                    <UserAvatar src={senderAvatarSrc} alt={senderName} size="w-full h-full" />
                                  </div>
                                ) : (
                                  <div className="w-[28px] h-[28px]" />
                                )}
                              </div>
                            )}
                            <div>
                              {renderCostCard()}
                              <span className="text-[10px] text-zinc-500 block px-1 mt-0.5">
                                {timeStr}
                              </span>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  }

                  return (
                    <React.Fragment key={item.id}>
                      {isUnreadFirst && renderDivider()}
                      <div
                        ref={isLatestUnread ? latestUnreadMsgRef : undefined}
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
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* ARCHIVED INDICATOR / MESSAGE COMPOSER */}
            {isPlanCompleted ? (
              <div
                className={`bg-black/95 px-4 pt-3.5 ${
                  keyboardOpen ? "pb-3.5" : "pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]"
                } flex items-center justify-center flex-shrink-0 border-t border-white/[0.06] select-none`}
              >
                <div className="px-4 py-2 rounded-full bg-zinc-900/80 border border-white/[0.08] text-xs font-medium text-zinc-400 tracking-wide flex items-center justify-center shadow-inner">
                  <span>Chat archived</span>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className={`bg-black/90 px-4 pt-1.5 ${
                  keyboardOpen ? "pb-2" : "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
                } flex items-end gap-2.5 flex-shrink-0`}
              >
                <div className="relative flex-1 flex items-center min-h-[46px] max-h-[224px] bg-zinc-900/90 border border-white/[0.08] rounded-[24px] px-4 py-2 focus-within:border-white/20 transition-[border-color] shadow-lg min-w-0">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Message"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      setKeyboardOpen(true);
                      scrollToBottom(false);
                      setTimeout(() => scrollToBottom(false), 80);
                      setTimeout(() => scrollToBottom(false), 200);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const vv = window.visualViewport;
                        if (vv) {
                          const currentHeight = Math.round(vv.height);
                          const keyboardGap = Math.max(0, maxHeightRef.current - currentHeight);
                          setKeyboardOpen(keyboardGap > 100);
                        } else {
                          const currentHeight = window.innerHeight;
                          const keyboardGap = Math.max(0, maxHeightRef.current - currentHeight);
                          setKeyboardOpen(keyboardGap > 100);
                        }
                      }, 100);
                    }}
                    className="w-full bg-transparent text-[16px] sm:text-sm text-white placeholder-zinc-500 focus:outline-none font-sans resize-none leading-[20px] py-[3px] max-h-[200px]"
                    style={{
                      height: "auto",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  onMouseDown={(e) => {
                    if (inputText.trim()) e.preventDefault();
                  }}
                  title="Send Message"
                  aria-label="Send Message"
                  className="w-[46px] h-[46px] rounded-full bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-95 text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none disabled:active:scale-100 disabled:shadow-none transition-all cursor-pointer flex-shrink-0 shadow-lg shadow-[#FF6B2C]/30 border border-white/10 relative overflow-hidden"
                >
                  <SendHorizontal className="w-5 h-5 text-white stroke-[2.2]" />
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>

      {/* EXISTING WALLET ADD COST FLOW COMPONENT */}
      <AddCost
        isOpen={showAddCostSheet}
        onClose={() => setShowAddCostSheet(false)}
        onRefreshBalances={() => {}}
        activeUserId={currentUserId}
        entryPoint="plan"
        initialPlanId={targetPlanUuid}
        relevantPlans={plan ? [{ id: targetPlanUuid, title: plan.title, cover_image: (plan.coverImage || (plan as any).customCoverUrl) }] : []}
        dbPlanParticipants={dbPlanParticipants}
        dbUsers={dbUsers}
        dbProfiles={dbUsers}
      />

      {/* PLAN SETTINGS SCREEN OVERLAY */}
      {showSettingsScreen && plan && (
        <PlanSettingsScreen
          plan={plan}
          userProfile={userProfile || ({ id: currentUserId, dbUuid: currentUserId, name: "You" } as any)}
          isPlanSettingsForParticipant={!isHost}
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
          onEditCoverImage={async (newCoverUrl, blob) => {
            const targetPlanId = cleanPlanId(plan.dbUuid || plan.id);
            if (blob) {
              await uploadPlanImage(targetPlanId, blob);
            }
            await updatePlanDetails(targetPlanId, { cover_image: `${targetPlanId}.webp`, skipDbWrite: true });
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

      {/* PLAN BALANCES SCREEN OVERLAY */}
      {showBalancesScreen && (
        <div className="fixed inset-0 z-[60] bg-[#050505] flex flex-col w-full h-[100dvh] overflow-hidden">
          <PlanDetailsScreen
            planId={targetPlanUuid}
            onBack={() => setShowBalancesScreen(false)}
            onRefreshBalances={() => {}}
            activeUserId={activeUserId || currentUserId}
            onSelectPlan={() => {}}
          />
        </div>
      )}
    </motion.div>
  );
};
