import React, { useState, useMemo, useEffect } from "react";
import { MessageSquare, Search, X, Inbox } from "lucide-react";
import { motion } from "motion/react";
import { Plan, DbPlanParticipant } from "../../../core/types";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { formatPlanDate } from "../../../../lib/mappers";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { EmptyState } from "../../home/components/EmptyState";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { SearchBar } from "../../../shared/components/SearchBar";
import { formatChatListTimestamp, subscribeToChatReadEvents } from "../utils/chatReads";
import { appendMessageToCache, getCachedMessages, getCachedUnreadInfo, setCachedUnreadInfo, ChatMessage } from "../hooks/useChatCache";

interface ChatsScreenProps {
  onSelectChatPlan: (planId: string) => void;
  onScroll?: (y: number) => void;
  setActiveTab?: (tab: string) => void;
}

export const ChatsScreen: React.FC<ChatsScreenProps> = React.memo(({
  onSelectChatPlan,
  onScroll,
  setActiveTab,
}) => {
  const { plans, dbPlanParticipants } = usePlansStore();
  const { userProfile, activeUserId } = useProfileStore();

  const [searchQuery, setSearchQuery] = useState("");

  const userUuid = userProfile?.dbUuid || (userProfile as any)?.id || activeUserId || "";

  // Helper to parse plan scheduled date and time into JavaScript Date
  const getPlanScheduledDateTime = (plan: Plan): Date => {
    const now = new Date();

    if (plan.datetime && plan.datetime.includes("T") && plan.datetime.includes("-")) {
      const d = new Date(plan.datetime);
      if (!isNaN(d.getTime())) return d;
    }

    const dateStr = (plan.date || "").trim().toUpperCase();
    const timeStr = (plan.time || "").trim().toUpperCase().replace(/⏰/g, "");

    let targetDate = new Date();
    if (dateStr === "TOMORROW") {
      targetDate.setDate(now.getDate() + 1);
    } else if (dateStr !== "TODAY" && dateStr !== "") {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }

    if (timeStr) {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3];
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        targetDate.setHours(hours, minutes, 0, 0);
        return targetDate;
      }
    }

    if (plan.createdAt) {
      const d = new Date(plan.createdAt);
      if (!isNaN(d.getTime())) return d;
    }

    return targetDate;
  };

  const allMyUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (userUuid) ids.add(userUuid);
    if (activeUserId) ids.add(activeUserId);
    if (userProfile?.dbUuid) ids.add(userProfile.dbUuid);
    if ((userProfile as any)?.id) ids.add((userProfile as any).id);
    if (userProfile?.user_id) ids.add(userProfile.user_id);
    return ids;
  }, [userUuid, activeUserId, userProfile]);

  // Build efficient participant lookup for current user
  const participantMap = useMemo(() => {
    const map = new Map<string, DbPlanParticipant>();
    (dbPlanParticipants || []).forEach((pp) => {
      if (pp.user_id && allMyUserIds.has(pp.user_id) && pp.plan_id) {
        map.set(pp.plan_id, pp);
      }
    });
    return map;
  }, [dbPlanParticipants, allMyUserIds]);

  const { dbUsers } = useProfileStore();

  // State to hold unread counts and latest message preview per plan_id (seeded immediately from local cache)
  const [chatSummaries, setChatSummaries] = useState<Record<string, {
    unreadCount: number;
    senderName: string;
    isCurrentUser: boolean;
    content: string;
    createdAt?: string | null;
    messageType?: string;
  }>>(() => {
    const initialMap: Record<string, any> = {};
    for (const p of plans || []) {
      const pid = p.dbUuid || p.id;
      const cached = getCachedMessages(pid);
      const unread = getCachedUnreadInfo(pid);
      if (cached.length > 0 || unread) {
        const lastMsg = cached.length > 0 ? cached[cached.length - 1] : undefined;
        const isMe = Boolean(userUuid && lastMsg && (lastMsg.sender_id === userUuid || allMyUserIds.has(lastMsg.sender_id)));
        initialMap[pid] = {
          unreadCount: unread?.count || 0,
          senderName: isMe ? "You" : "User",
          isCurrentUser: isMe,
          content: lastMsg?.content || "",
          createdAt: lastMsg?.created_at || null,
          messageType: lastMsg?.message_type,
        };
      }
    }
    return initialMap;
  });

  // Helper to determine latest message/activity timestamp for dynamic descending sort
  const getPlanLatestActivityTime = (plan: Plan): number => {
    const planId = plan.dbUuid || plan.id;
    const altPlanId = plan.id;

    // 1. Check chatSummaries state (populated by cache, RPC, or realtime)
    const summary = chatSummaries[planId] || chatSummaries[altPlanId];
    if (summary?.createdAt) {
      const t = new Date(summary.createdAt).getTime();
      if (!isNaN(t)) return t;
    }

    // 2. Check local in-memory chat cache (useChatCache / getCachedMessages)
    const cached = getCachedMessages(planId);
    const altCached = altPlanId !== planId ? getCachedMessages(altPlanId) : [];
    const allCached = cached.length > 0 ? cached : altCached;
    if (allCached.length > 0) {
      const lastMsg = allCached[allCached.length - 1];
      if (lastMsg?.created_at) {
        const t = new Date(lastMsg.created_at).getTime();
        if (!isNaN(t)) return t;
      }
    }

    // 3. Fallback to plan creation timestamp
    const rawCreation = plan.createdAt || (plan as any).created_at || plan.datetime || (plan as any).scheduled_at;
    if (rawCreation) {
      const t = new Date(rawCreation).getTime();
      if (!isNaN(t)) return t;
    }

    return 0;
  };

  // Retrieve every plan where the authenticated user is a participant (Hosted, Joined, Waitlisted, Invited)
  // excluding cancelled plans. Dynamically sorted by latest message/activity DESC (newest activity first).
  const userPlanChats = useMemo(() => {
    const userInvolvedPlans = plans.filter((p) => {
      // Exclude cancelled and completed plans from active chat list
      if ((p.status || "").toUpperCase() === "CANCELLED" || (p.status || "").toUpperCase() === "COMPLETED") return false;

      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const isHostRole = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      const isMember = p.members.some((m) => m.userUuid && allMyUserIds.has(m.userUuid));

      return Boolean(myParticipant || isHostRole || isMember);
    });

    // Dynamic sort descending by latest message/activity timestamp (newest activity first)
    return userInvolvedPlans.sort((a, b) => {
      const timeA = getPlanLatestActivityTime(a);
      const timeB = getPlanLatestActivityTime(b);
      return timeB - timeA;
    });
  }, [plans, participantMap, userUuid, allMyUserIds, chatSummaries]);

  // Real-time title search filtering while preserving latest-activity DESC sort order
  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return userPlanChats;

    return userPlanChats.filter((plan) =>
      plan.title.toLowerCase().includes(query)
    );
  }, [userPlanChats, searchQuery]);

  // Fetch unread counts and latest message preview for all involved plans
  useEffect(() => {
    if (!userUuid) return;

    let isMounted = true;

    const fetchSummaries = async () => {
      try {
        const { data, error } = await supabase.rpc("get_user_chat_summaries", {
          p_user_id: userUuid,
        });

        if (error) {
          console.error("Error fetching chat summaries:", error);
          return;
        }

        if (data && Array.isArray(data) && isMounted) {
          const map: Record<string, {
            unreadCount: number;
            senderName: string;
            isCurrentUser: boolean;
            content: string;
            createdAt?: string | null;
            messageType?: string;
          }> = {};

          for (const row of data) {
            if (!row.plan_id) continue;
            const isMe = Boolean(userUuid && (row.latest_sender_id === userUuid || allMyUserIds.has(row.latest_sender_id)));
            let senderName = "User";

            if (isMe) {
              senderName = "You";
            } else if (row.latest_sender_id) {
              const foundUser = (dbUsers || []).find(
                (u) => u.id === row.latest_sender_id || u.user_id === row.latest_sender_id
              );
              if (foundUser) {
                senderName = foundUser.full_name || foundUser.username || "User";
              }
            }

            let previewContent = row.latest_content || "";
            if (row.latest_message_type === "cost") {
              previewContent = isMe ? "You added an expense" : `${senderName} added an expense`;
            } else if (row.latest_message_type === "poll") {
              previewContent = isMe ? "You created a poll" : `${senderName} created a poll`;
            } else if (row.latest_message_type === "system") {
              previewContent = row.latest_content || "";
            }

            const unreadCount = Number(row.unread_count || 0);
            map[row.plan_id] = {
              unreadCount,
              senderName,
              isCurrentUser: isMe,
              content: previewContent,
              createdAt: row.latest_created_at,
              messageType: row.latest_message_type,
            };

            const existingCache = getCachedUnreadInfo(row.plan_id);
            if (!existingCache || unreadCount === 0) {
              setCachedUnreadInfo(row.plan_id, {
                count: unreadCount,
                firstUnreadId: existingCache?.firstUnreadId || null,
                latestUnreadId: (row.latest_message_id as string) || null,
                lastReadAt: null,
                lastReadMessageId: null,
              });
            }
          }

          setChatSummaries(map);
        }
      } catch (err) {
        console.error("Exception fetching chat summaries:", err);
      }
    };

    fetchSummaries();

    // 1. Subscribe to Realtime inserts on plan_messages (including system messages)
    const messagesChannel = supabase
      .channel("public:plan_messages_chats_preview")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "plan_messages",
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || !newMsg.plan_id) return;
          if (!["text", "cost", "poll", "system"].includes(newMsg.message_type)) return;

          // Keep in-memory chat cache and unread info warm in background
          appendMessageToCache(newMsg as ChatMessage, userUuid);

          const isMe = Boolean(userUuid && (newMsg.sender_id === userUuid || allMyUserIds.has(newMsg.sender_id)));
          let senderName = "User";

          if (isMe) {
            senderName = "You";
          } else if (newMsg.sender_id) {
            const foundUser = (dbUsers || []).find(
              (u) => u.id === newMsg.sender_id || u.user_id === newMsg.sender_id
            );
            if (foundUser) {
              senderName = foundUser.full_name || foundUser.username || "User";
            }
          }

          let previewContent = newMsg.content || "";
          if (newMsg.message_type === "cost") {
            previewContent = isMe ? "You added an expense" : `${senderName} added an expense`;
          } else if (newMsg.message_type === "poll") {
            previewContent = isMe ? "You created a poll" : `${senderName} created a poll`;
          } else if (newMsg.message_type === "system") {
            previewContent = newMsg.content || "";
          }

          setChatSummaries((prev) => {
            const existing = prev[newMsg.plan_id];
            const currentUnread = existing ? existing.unreadCount : 0;
            // System messages count as unread! For user-authored messages, only from others
            const shouldIncrement = newMsg.message_type === "system" || !isMe;
            const nextUnread = shouldIncrement ? currentUnread + 1 : currentUnread;

            return {
              ...prev,
              [newMsg.plan_id]: {
                unreadCount: nextUnread,
                senderName,
                isCurrentUser: isMe,
                content: previewContent,
                createdAt: newMsg.created_at || new Date().toISOString(),
                messageType: newMsg.message_type,
              },
            };
          });
        }
      )
      .subscribe();

    // 2. Subscribe to Realtime updates on plan_chat_reads for current user
    const readsChannel = supabase
      .channel(`public:plan_chat_reads:${userUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plan_chat_reads",
          filter: `user_id=eq.${userUuid}`,
        },
        (payload) => {
          const readRecord = payload.new as any;
          if (readRecord && readRecord.plan_id) {
            setChatSummaries((prev) => {
              const existing = prev[readRecord.plan_id];
              if (!existing) return prev;
              return {
                ...prev,
                [readRecord.plan_id]: {
                  ...existing,
                  unreadCount: 0,
                },
              };
            });
          }
        }
      )
      .subscribe();

    // 3. Subscribe to synchronous local chat read events (clears badge instantly upon opening chat)
    const unsubscribeLocalReads = subscribeToChatReadEvents((readPlanId) => {
      setChatSummaries((prev) => {
        const targetKey = prev[readPlanId] ? readPlanId : Object.keys(prev).find((k) => k === readPlanId);
        if (!targetKey || !prev[targetKey]) return prev;
        return {
          ...prev,
          [targetKey]: {
            ...prev[targetKey],
            unreadCount: 0,
          },
        };
      });
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(readsChannel);
      unsubscribeLocalReads();
    };
  }, [userUuid, allMyUserIds, dbUsers]);

  // Helper to determine host display name for fallback subtitle
  const getHostDisplayName = (plan: Plan): string => {
    if (plan.creatorId && allMyUserIds.has(plan.creatorId)) {
      return "You";
    }
    if (plan.hostId && allMyUserIds.has(plan.hostId)) {
      return "You";
    }

    if (plan.creatorName) return plan.creatorName;

    // Check host member record
    const hostMember = (plan.members || []).find(
      (m) => (m as any).role === "HOST" || m.isHost === true
    );
    if (hostMember) {
      const mId = hostMember.userId || hostMember.userUuid || (hostMember as any).user_id;
      if (mId && allMyUserIds.has(mId)) return "You";
      if (hostMember.name) return hostMember.name;
    }

    // Check dbUsers lookup by hostId or creatorId
    const targetHostId = plan.hostId || plan.creatorId;
    if (targetHostId) {
      const foundUser = (dbUsers || []).find(
        (u) => u.id === targetHostId || u.user_id === targetHostId
      );
      if (foundUser) return foundUser.full_name || foundUser.username || "Host";
    }

    return "Host";
  };

  const renderChatCard = (plan: Plan) => {
    const summary = chatSummaries[plan.id] || (plan.dbUuid ? chatSummaries[plan.dbUuid] : undefined);
    const unreadCount = summary?.unreadCount || 0;
    const hasLatestMsg = Boolean(summary && summary.content);

    let subtitleText = "";
    if (hasLatestMsg && summary) {
      if (
        summary.messageType === "system" ||
        summary.content.startsWith(`${summary.senderName} `) ||
        summary.content.startsWith("You ") ||
        summary.content.startsWith("Hosted by")
      ) {
        subtitleText = summary.content;
      } else {
        subtitleText = `${summary.senderName}: ${summary.content}`;
      }
    } else {
      const hostName = getHostDisplayName(plan);
      subtitleText = `Hosted by ${hostName}`;
    }

    const rawTimestamp = summary?.createdAt || plan.createdAt || (plan as any).created_at;
    const formattedTime = rawTimestamp ? formatChatListTimestamp(rawTimestamp) : "";

    return (
      <motion.div
        key={plan.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => onSelectChatPlan(plan.id)}
        className="w-full h-[70px] px-2 py-2 flex items-center hover:bg-white/[0.03] active:bg-white/[0.05] rounded-xl transition-all duration-150 cursor-pointer group active:scale-[0.99] select-none text-left"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1 h-full">
          {/* Leading: 50px Compact Plan Avatar */}
          <div className="w-[50px] h-[50px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900">
            <div className="absolute inset-0 bg-black/20 z-10" />
            <DiscoveryImages
              src={plan.coverImage}
              planId={plan.dbUuid || plan.id}
              category={plan.category}
              subcategory={(plan as any).subcategory}
              screen="Chats Screen"
              alt={plan.title}
              className="w-full h-full object-cover relative z-0 scale-100 group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Title & Subtitle Container with WhatsApp-style Right Meta */}
          <div className="min-w-0 flex-1 flex flex-col justify-center h-full space-y-1">
            {/* Top row: Plan Title & Latest Timestamp */}
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate leading-snug flex-1 min-w-0">
                {plan.title}
              </h3>
              {formattedTime && (
                <span
                  className={`shrink-0 text-[11px] font-medium leading-none ${
                    unreadCount > 0 ? "text-emerald-400 font-semibold" : "text-zinc-500"
                  }`}
                >
                  {formattedTime}
                </span>
              )}
            </div>

            {/* Bottom row: Subtitle preview & Unread Count Badge */}
            <div className="flex items-center justify-between gap-2">
              <p
                className={`font-sans text-[12px] truncate leading-tight flex-1 min-w-0 ${
                  unreadCount > 0 ? "text-zinc-200 font-medium" : "text-zinc-400"
                }`}
              >
                {subtitleText}
              </p>

              {/* WhatsApp-Style Numeric Unread Badge */}
              {unreadCount > 0 && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#10B981] text-zinc-950 font-bold text-[11px] flex items-center justify-center leading-none shadow-sm">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full bg-[#050505] text-left">
      {/* TOP HEADER: Matching Home & Plans layout */}
      <header
        id="chats_screen_header"
        className="h-14 shrink-0 bg-[#050505] flex items-center justify-between px-6 z-30 select-none relative"
      >
        {/* Left Column: Title */}
        <div className="flex-1 flex items-center justify-start z-10 min-w-0">
          <h1 className="text-stone-100 font-sans font-bold text-xl tracking-tight leading-none text-left truncate">
            Chats
          </h1>
        </div>

        {/* Right Column: Empty spacer for horizontal balance */}
        <div className="flex-1 flex items-center justify-end z-10" />
      </header>

      {/* STICKY SEARCH BAR CONTAINER */}
      <div
        className="shrink-0 bg-[#050505] px-4 pt-0.5 pb-2.5 z-20 select-none"
        style={{ boxSizing: 'border-box' }}
      >
        <SearchBar
          id="search-chats-input"
          name="searchChatsInput"
          placeholder="Search chats..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* SCROLLABLE CHATS LIST (Begins below sticky search bar) */}
      <div
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-3 pt-0.5 pb-28"
      >
        {userPlanChats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center pt-12">
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
              title="No chats yet"
              description="Create or join a plan to start chatting with your group."
              ctaButton={
                <button
                  type="button"
                  onClick={() => setActiveTab?.('create')}
                  className="py-3 px-7 bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-sans font-semibold text-[13.5px] tracking-wide rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-md shadow-[#FF6B2C]/20 flex items-center justify-center"
                >
                  Create Plan
                </button>
              }
              py="py-16"
            />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center pt-12">
            <EmptyState
              icon={<Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />}
              title="No chats found"
              description="Try searching with a different plan name."
              py="py-16"
            />
          </div>
        ) : (
          <div className="space-y-1">
            {filteredChats.map((plan) => renderChatCard(plan))}
          </div>
        )}
      </div>
    </div>
  );
});
