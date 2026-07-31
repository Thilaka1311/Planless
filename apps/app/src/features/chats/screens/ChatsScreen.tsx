import React, { useState, useMemo } from "react";
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
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

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
      // Exclude cancelled plans
      if ((p.status || "").toUpperCase() === "CANCELLED") return false;

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

  const renderChatCard = (plan: Plan) => {
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
              src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
              category={plan.category}
              alt={plan.title}
              className="w-full h-full object-cover relative z-0 scale-100 group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Vertically Centered Title */}
          <div className="min-w-0 flex-1 flex items-center h-full">
            <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate leading-snug">
              {plan.title}
            </h3>
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
        className="h-14 shrink-0 bg-[#09090b]/99 backdrop-blur-md flex items-center justify-between px-4 z-30 select-none relative border-b border-white/5"
      >
        {/* Left Column: Avatar */}
        <div className="flex-1 flex items-center justify-start z-10">
          {userProfile && (
            <button
              onClick={() => setActiveTab?.("profile")}
              className="relative group shrink-0 block focus:outline-none cursor-pointer"
              aria-label="View Profile Settings"
            >
              <UserAvatar
                src={userProfile.avatar}
                alt={userProfile.name}
                size="w-9 h-9"
                className="border-2 border-zinc-800 hover:border-[#ff8b66] transition-colors"
              />
            </button>
          )}
        </div>

        {/* Center Column: Perfectly Centered Title */}
        <div className="flex-shrink-0 flex items-center justify-center z-10">
          <h1 className="text-stone-100 font-sans font-black text-xl tracking-[0.25em] leading-none text-center uppercase">
            CHATS
          </h1>
        </div>

        {/* Right Column: Empty spacer for horizontal balance */}
        <div className="flex-1 flex items-center justify-end z-10" />
      </header>

      {/* SEARCH BAR CONTAINER below header divider */}
      <div className="px-4 pt-4 pb-0 shrink-0 select-none z-20">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-3.5 w-4 h-4 text-zinc-550 pointer-events-none" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-9 text-sm text-white placeholder-zinc-550 focus:outline-none focus:border-zinc-700 transition select-text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer z-10"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* SCROLLABLE CHATS LIST / EMPTY STATE */}
      <div
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-3 pt-3 pb-6"
      >
        {userPlanChats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
              title="No chats yet"
              description="Create or join a plan to start chatting with your group."
              py="py-16"
            />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
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
