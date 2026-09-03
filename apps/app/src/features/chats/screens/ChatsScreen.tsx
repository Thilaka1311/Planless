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

  // Retrieve every plan where the authenticated user is a participant (Hosted, Joined, Waitlisted, Invited)
  // excluding cancelled plans. Sorted by scheduled_at ASC (occurring sooner first).
  const userPlanChats = useMemo(() => {
    const userInvolvedPlans = plans.filter((p) => {
      // Exclude cancelled and completed plans from active chat list
      if ((p.status || "").toUpperCase() === "CANCELLED" || (p.status || "").toUpperCase() === "COMPLETED") return false;

      const myParticipant = participantMap.get(p.id) || (p.dbUuid ? participantMap.get(p.dbUuid) : undefined);
      const isHostRole = myParticipant?.role === "HOST" || p.hostId === userUuid || p.creatorId === userUuid;
      const isMember = p.members.some((m) => m.userUuid && allMyUserIds.has(m.userUuid));

      return Boolean(myParticipant || isHostRole || isMember);
    });

    // Sort by scheduled_at ASC (sooner plans first)
    return userInvolvedPlans.sort((a, b) => {
      return getPlanScheduledDateTime(a).getTime() - getPlanScheduledDateTime(b).getTime();
    });
  }, [plans, participantMap, userUuid, allMyUserIds]);

  // Real-time title search filtering while preserving scheduled_at ASC sort order
  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return userPlanChats;

    return userPlanChats.filter((plan) =>
      plan.title.toLowerCase().includes(query)
    );
  }, [userPlanChats, searchQuery]);

  const { dbUsers } = useProfileStore();

  // State to hold latest user text message preview per plan_id
  const [latestMessages, setLatestMessages] = useState<Record<string, { senderName: string; isCurrentUser: boolean; content: string }>>({});

  // Fetch the latest user text message for all involved plans
  useEffect(() => {
    if (userPlanChats.length === 0) return;

    const planIds = userPlanChats.map((p) => p.id).filter(Boolean);
    if (planIds.length === 0) return;

    const fetchLatestMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("plan_messages")
          .select("id, plan_id, sender_id, message_type, content, created_at")
          .in("plan_id", planIds)
          .eq("message_type", "text")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching latest plan messages:", error);
          return;
        }

        if (data && data.length > 0) {
          const map: Record<string, { senderName: string; isCurrentUser: boolean; content: string }> = {};

          // Data is sorted DESC, so first hit per plan_id is the most recent text message
          for (const msg of data) {
            if (!map[msg.plan_id]) {
              const isMe = Boolean(userUuid && (msg.sender_id === userUuid || allMyUserIds.has(msg.sender_id)));
              let senderName = "User";

              if (isMe) {
                senderName = "You";
              } else {
                const foundUser = (dbUsers || []).find(
                  (u) => u.id === msg.sender_id || u.user_id === msg.sender_id
                );
                if (foundUser) {
                  senderName = foundUser.full_name || foundUser.username || "User";
                }
              }

              map[msg.plan_id] = {
                senderName,
                isCurrentUser: isMe,
                content: msg.content || "",
              };
            }
          }

          setLatestMessages(map);
        }
      } catch (err) {
        console.error("Exception fetching latest plan messages:", err);
      }
    };

    fetchLatestMessages();

    // Subscribe to Realtime updates for plan_messages
    const channel = supabase
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
          if (newMsg && newMsg.message_type === "text" && newMsg.plan_id) {
            const isMe = Boolean(userUuid && (newMsg.sender_id === userUuid || allMyUserIds.has(newMsg.sender_id)));
            let senderName = "User";

            if (isMe) {
              senderName = "You";
            } else {
              const foundUser = (dbUsers || []).find(
                (u) => u.id === newMsg.sender_id || u.user_id === newMsg.sender_id
              );
              if (foundUser) {
                senderName = foundUser.full_name || foundUser.username || "User";
              }
            }

            setLatestMessages((prev) => ({
              ...prev,
              [newMsg.plan_id]: {
                senderName,
                isCurrentUser: isMe,
                content: newMsg.content || "",
              },
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userPlanChats, userUuid, allMyUserIds, dbUsers]);

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
    const latestMsg = latestMessages[plan.id];
    let subtitleText = "";

    if (latestMsg) {
      subtitleText = `${latestMsg.senderName}: ${latestMsg.content}`;
    } else {
      const hostName = getHostDisplayName(plan);
      subtitleText = `Hosted by ${hostName}`;
    }

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

          {/* Title & Subtitle Container */}
          <div className="min-w-0 flex-1 flex flex-col justify-center h-full space-y-0.5">
            <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate leading-snug">
              {plan.title}
            </h3>
            <p className="font-sans text-[12px] text-zinc-400 truncate leading-tight">
              {subtitleText}
            </p>
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
        className="h-14 shrink-0 bg-[#050505] flex items-center justify-between px-4 z-30 select-none relative"
      >
        {/* Left Column: Layout Balance Spacer */}
        <div className="flex-1 flex items-center justify-start z-10" />

        {/* Center Column: Perfectly Centered Title */}
        <div className="flex-shrink-0 flex items-center justify-center z-10">
          <h1 className="text-stone-100 font-sans font-bold text-xl tracking-tight leading-none text-center">
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
        {/* UNIFIED ELLIPTICAL / PILL-SHAPED SEARCH BOX */}
        <div
          className="w-full flex items-center rounded-full bg-[#18181B] border border-white/[0.08] px-3.5 transition-all focus-within:border-white/20 focus-within:bg-[#202024]"
          style={{ height: '46px' }}
        >
          {/* SEARCH ICON */}
          <Search className="w-5 h-5 text-white/50 stroke-[2] mr-2.5 shrink-0" />

          {/* SEARCH INPUT */}
          <input
            id="search-chats-input"
            name="searchChatsInput"
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 500,
              color: '#FFFFFF',
              border: 'none',
              outline: 'none',
              fontFamily: 'Inter, sans-serif'
            }}
            className="placeholder-zinc-500 min-w-0 select-text"
          />

          {/* CLEAR SEARCH BUTTON */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="p-1 text-zinc-400 hover:text-white transition shrink-0 mr-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
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
