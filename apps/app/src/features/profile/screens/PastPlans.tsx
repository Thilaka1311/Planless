import React, { useMemo } from "react";
import { ArrowLeft, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { EmptyState } from "../../home/components/EmptyState";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../state/ProfileContext";
import { CancelPlanBottomSheet, EarlyCompletePlanConfirmationBottomSheet } from "../../plans/components/BottomSheets";
import { HostAttendanceScreen } from "../../completion/Screens/HostAttendanceScreen";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { formatPlanDate } from "../../../../lib/mappers";

interface PastPlansProps {
  onBack: () => void;
  setSelectedPlanId?: (planId: string | null) => void;
}

const getMemberFinalState = (member: any): 'JOINED' | 'SKIPPED' => {
  if (!member) return 'SKIPPED';
  const raw = member.final_state || member.finalState || member.final_attendance || member.finalAttendance;
  if (raw) {
    const s = String(raw).toUpperCase();
    if (s === 'JOINED' || s === 'ATTENDED') return 'JOINED';
    if (s === 'SKIPPED' || s === 'DID_NOT_ATTEND') return 'SKIPPED';
  }
  const norm = normalizeStatus(member.joinState || member.rsvp_status);
  if (norm === 'JOINED') return 'JOINED';
  return 'SKIPPED';
};

const getPlanDateTime = (plan: any): Date => {
  const raw = plan.datetime || (plan as any).scheduled_at || (plan as any).event_date;
  if (raw && typeof raw === 'string' && raw.includes('-')) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }

  const baseDate = plan.createdAt ? new Date(plan.createdAt) : new Date();
  const dateStr = (plan.date || '').trim();
  const timeStr = (plan.time || '').trim().replace(/⏰/g, '');

  let targetDate = new Date(baseDate);

  if (dateStr) {
    const upper = dateStr.toUpperCase();
    if (upper === 'TODAY') {
      targetDate = new Date(baseDate);
    } else if (upper === 'TOMORROW') {
      targetDate = new Date(baseDate);
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }
  }

  if (timeStr) {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
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

export const PastPlans: React.FC<PastPlansProps> = React.memo(({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans, cancelPlan, updatePlanDetails, completePlan } = usePlansStore();
  const { activeUserUuid, activeUserId, userProfile } = useProfileStore();

  const [holdPlan, setHoldPlan] = React.useState<any | null>(null);
  const [showHoldSheet, setShowHoldSheet] = React.useState(false);
  const [completingPlan, setCompletingPlan] = React.useState<any | null>(null);
  const [showAttendanceSheet, setShowAttendanceSheet] = React.useState(false);
  const [showEarlyEndPlanConfirm, setShowEarlyEndPlanConfirm] = React.useState(false);
  const [isEndingPlan, setIsEndingPlan] = React.useState(false);
  const holdTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isHoldTriggeredRef = React.useRef(false);

  const isPlanHost = React.useCallback((plan: any) => {
    if (!plan) return false;
    const myMember = (plan.members || []).find((m: any) => {
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      return (
        (activeUserUuid && mId === activeUserUuid) ||
        (activeUserId && mId === activeUserId) ||
        (userProfile?.dbUuid && mId === userProfile.dbUuid) ||
        ((userProfile as any)?.id && mId === (userProfile as any).id)
      );
    });

    return Boolean(
      (plan.hostId && activeUserUuid && plan.hostId === activeUserUuid) ||
      ((plan as any).host_id && activeUserUuid && (plan as any).host_id === activeUserUuid) ||
      (plan.hostId && activeUserId && plan.hostId === activeUserId) ||
      ((plan as any).host_id && activeUserId && (plan as any).host_id === activeUserId) ||
      (userProfile?.dbUuid && plan.hostId === userProfile.dbUuid) ||
      ((userProfile as any)?.id && plan.hostId === (userProfile as any).id) ||
      (plan.creatorId && activeUserUuid && plan.creatorId === activeUserUuid) ||
      (plan.creatorId && activeUserId && plan.creatorId === activeUserId) ||
      myMember?.isHost ||
      myMember?.role === "HOST"
    );
  }, [activeUserUuid, activeUserId, userProfile]);

  const startHold = (plan: any) => {
    // Strictly host-only: participants must NEVER be able to trigger hold interaction
    if (!isPlanHost(plan)) {
      return;
    }
    isHoldTriggeredRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      isHoldTriggeredRef.current = true;
      setHoldPlan(plan);
      setShowHoldSheet(true);
    }, 500);
  };

  const endHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePlanClick = (planId: string) => {
    if (isHoldTriggeredRef.current) {
      isHoldTriggeredRef.current = false;
      return;
    }
    setSelectedPlanId?.(planId);
  };

  const pastPlans = useMemo(() => {
    const list = plans.filter((p) => {
      const statusUpper = (p.status || "").toUpperCase();
      const isCompleted = statusUpper === "COMPLETED";
      const isCanceled = statusUpper === "CANCELLED" || statusUpper === "CANCELED";

      if (!isCompleted && !isCanceled) return false;

      const myMember = (p.members || []).find((m: any) => {
        const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
        return (
          (activeUserUuid && mId === activeUserUuid) ||
          (activeUserId && mId === activeUserId) ||
          (userProfile?.dbUuid && mId === userProfile.dbUuid)
        );
      });

      const isHost = Boolean(
        (p.hostId && activeUserUuid && p.hostId === activeUserUuid) ||
        ((p as any).host_id && activeUserUuid && (p as any).host_id === activeUserUuid) ||
        (p.hostId && activeUserId && p.hostId === activeUserId) ||
        ((p as any).host_id && activeUserId && (p as any).host_id === activeUserId) ||
        (userProfile?.dbUuid && p.hostId === userProfile.dbUuid) ||
        myMember?.isHost ||
        myMember?.role === "HOST"
      );

      return Boolean(myMember || isHost);
    });

    return [...list].sort((a, b) => {
      const timeA = getPlanDateTime(a).getTime();
      const timeB = getPlanDateTime(b).getTime();
      if (timeA !== timeB) {
        return timeB - timeA; // Descending: newest -> oldest
      }
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [plans, activeUserUuid, activeUserId, userProfile]);

  const renderPlanItem = (plan: any) => {
    const statusUpper = (plan.status || "").toUpperCase();
    const isCanceled = statusUpper === "CANCELLED" || statusUpper === "CANCELED";

    const myMember = (plan.members || []).find((m: any) => {
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      return (
        (activeUserUuid && mId === activeUserUuid) ||
        (activeUserId && mId === activeUserId) ||
        (userProfile?.dbUuid && mId === userProfile.dbUuid)
      );
    });

    const isHost = isPlanHost(plan);

    let statusText = "Skipped";
    let statusColor = "text-rose-400";

    if (isCanceled) {
      statusText = "Canceled";
      statusColor = "text-rose-400";
    } else if (isHost) {
      statusText = "Hosted";
      statusColor = "text-white";
    } else if (getMemberFinalState(myMember) === "JOINED") {
      statusText = "Joined";
      statusColor = "text-emerald-400";
    } else {
      statusText = "Skipped";
      statusColor = "text-rose-400";
    }

    const timeLabel = formatPlanDate(plan.datetime || plan.createdAt);

    return (
      <motion.div
        key={plan.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={isHost ? () => startHold(plan) : undefined}
        onMouseUp={isHost ? endHold : undefined}
        onMouseLeave={isHost ? endHold : undefined}
        onTouchStart={isHost ? () => startHold(plan) : undefined}
        onTouchEnd={isHost ? endHold : undefined}
        onTouchMove={isHost ? endHold : undefined}
        onClick={() => handlePlanClick(plan.id)}
        className="w-full py-2.5 px-1 transition-all duration-150 cursor-pointer flex items-center justify-between group active:scale-[0.99] select-none text-left"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Thumbnail circle avatar */}
          <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.06] shadow-md flex-shrink-0 relative bg-zinc-955">
            <DiscoveryImages
              src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
              planId={plan.dbUuid || plan.id}
              category={plan.category}
              subcategory={(plan as any).subcategory}
              screen="Past Plans"
              alt={plan.title}
              className="w-full h-full object-cover scale-100 group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Content details side-by-side */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <h3 className="font-sans font-semibold text-[14px] text-white tracking-wide truncate">
              {plan.title}
            </h3>
            <span className="text-[11px] text-[#8E8E93] font-sans font-medium">
              {timeLabel}
            </span>
          </div>
        </div>

        {/* Far Right: Status */}
        <span className={`text-xs font-medium shrink-0 ml-3 ${statusColor}`}>
          {statusText}
        </span>
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Header matching Planless navigation style */}
      <div className="bg-[#050505] px-6 py-3.5 flex items-center gap-3 flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="text-white/80 hover:text-white active:scale-95 transition cursor-pointer p-1 -ml-1 flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-left">
          Past Plans
        </h1>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-2 pb-6">
        {pastPlans.length === 0 ? (
          <EmptyState
            icon={<History className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
            title="No past plans yet"
            description="Completed plans will appear here."
            py="py-12"
          />
        ) : (
          <div className="space-y-2.5">
            {pastPlans.map((plan) => renderPlanItem(plan))}
          </div>
        )}
      </div>

      <CancelPlanBottomSheet
        isOpen={showHoldSheet}
        plan={holdPlan}
        isHost={holdPlan ? isPlanHost(holdPlan) : false}
        onConfirmCancel={async () => {
          if (!holdPlan) return;
          const planId = holdPlan.id;
          setShowHoldSheet(false);
          setHoldPlan(null);
          try {
            await updatePlanDetails(planId, { status: "CANCELLED" });
          } catch (err) {
            console.error("Failed to cancel plan:", err);
          }
        }}
        onReopenPlan={async () => {
          if (!holdPlan) return;
          const planId = holdPlan.id;
          setShowHoldSheet(false);
          setHoldPlan(null);
          try {
            await updatePlanDetails(planId, { status: "LIVE" });
          } catch (err) {
            console.error("Failed to reopen plan:", err);
          }
        }}
        onMarkAsComplete={() => {
          if (!holdPlan) return;
          const planToComplete = holdPlan;
          setShowHoldSheet(false);
          setHoldPlan(null);

          const rawScheduled = (planToComplete as any).scheduled_at || planToComplete.datetime || planToComplete.time || planToComplete.createdAt;
          const planScheduledDate = new Date(rawScheduled);
          const now = new Date();
          const isEarly = !isNaN(planScheduledDate.getTime()) && now.getTime() < planScheduledDate.getTime();

          setCompletingPlan(planToComplete);
          if (isEarly) {
            setShowEarlyEndPlanConfirm(true);
          } else {
            setShowAttendanceSheet(true);
          }
        }}
        onClose={() => {
          setShowHoldSheet(false);
          setHoldPlan(null);
        }}
      />

      {/* ---------------- 📝 HOST ATTENDANCE FULL-SCREEN SCREEN ---------------- */}
      <AnimatePresence>
        {showAttendanceSheet && completingPlan && (
          <motion.div
            key="host-attendance-screen-past"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-[70] bg-[#050505] flex flex-col"
          >
            <HostAttendanceScreen
              isOpen={showAttendanceSheet}
              members={completingPlan.members || []}
              hostId={completingPlan.hostId || completingPlan.creatorId || (completingPlan as any).host_id || ""}
              planExpense={completingPlan.expense || (completingPlan as any).wallet_expenses?.[0] || null}
              planTotalCost={completingPlan.total_cost || completingPlan.totalCost}
              planTitle={completingPlan.title || ''}
              planCoverImage={completingPlan.coverImage || (completingPlan as any)?.cover_image || ''}
              planId={completingPlan.dbUuid || completingPlan.id || ''}
              planCategory={completingPlan.category || ''}
              planSubcategory={(completingPlan as any).subcategory || ''}
              planCapacity={completingPlan.plan_size || completingPlan.planSize || completingPlan.capacity}
              isSubmitting={isEndingPlan}
              isCompletedMode={false}
              onConfirm={async (attendanceInput, expenseMode) => {
                setIsEndingPlan(true);
                try {
                  const rawScheduled = (completingPlan as any).scheduled_at || completingPlan.datetime || completingPlan.time || completingPlan.createdAt;
                  const planScheduledDate = new Date(rawScheduled);
                  const now = new Date();
                  const isEarly = !isNaN(planScheduledDate.getTime()) && now.getTime() < planScheduledDate.getTime();

                  await completePlan(completingPlan.id, attendanceInput, { isEarly, expenseMode });
                  setShowAttendanceSheet(false);
                  setCompletingPlan(null);
                } catch (err: any) {
                  console.error("Failed to complete plan:", err);
                } finally {
                  setIsEndingPlan(false);
                }
              }}
              onBack={() => {
                setShowAttendanceSheet(false);
                setCompletingPlan(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- ⚡ EARLY COMPLETE PLAN CONFIRMATION SHEET ---------------- */}
      <EarlyCompletePlanConfirmationBottomSheet
        isOpen={showEarlyEndPlanConfirm}
        plan={completingPlan}
        scheduledTimeText={formatPlanDate((completingPlan as any)?.scheduled_at || completingPlan?.datetime || completingPlan?.time || completingPlan?.createdAt)}
        isSubmitting={false}
        onConfirm={() => {
          setShowEarlyEndPlanConfirm(false);
          setShowAttendanceSheet(true);
        }}
        onClose={() => {
          setShowEarlyEndPlanConfirm(false);
          setCompletingPlan(null);
        }}
      />
    </div>
  );
});
