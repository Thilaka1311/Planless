import React, { useMemo } from "react";
import { ChevronLeft, History } from "lucide-react";
import { EmptyState } from "../../home/components/EmptyState";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../state/ProfileContext";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { normalizeStatus } from "../../../../lib/participantStatus";

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

const formatPlanDateParts = (dateObj: Date): { date: string; time: string } => {
  if (isNaN(dateObj.getTime()) || dateObj.getTime() === 0) {
    return { date: '', time: '' };
  }
  const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = dateObj.getDate();
  const date = `${month} ${day}`;

  const time = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { date, time };
};

export const PastPlans: React.FC<PastPlansProps> = React.memo(({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans } = usePlansStore();
  const { activeUserUuid } = useProfileStore();

  const completedPlans = useMemo(() => {
    const filtered = plans.filter((p) => {
      if ((p.status || "").toUpperCase() !== "COMPLETED") return false;

      const myMember = p.members.find(m => {
        const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
        return activeUserUuid && mId === activeUserUuid;
      });
      return Boolean(myMember);
    });

    return [...filtered].sort((a, b) => {
      const timeA = getPlanDateTime(a).getTime();
      const timeB = getPlanDateTime(b).getTime();
      if (timeA !== timeB) {
        return timeB - timeA; // Descending: newest -> oldest
      }
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [plans, activeUserUuid]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Header */}
      <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center text-white hover:text-white/80 active:scale-95 transition cursor-pointer p-1 -ml-1"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-center">
          Past Plans
        </h1>
        <div className="w-6" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-4 pb-6">
        {completedPlans.length === 0 ? (
          <EmptyState
            icon={<History className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
            title="No past plans yet"
            description="Completed plans will appear here."
            py="py-12"
          />
        ) : (
          <div className="space-y-3.5">
            {completedPlans.map((plan) => {
              const myMember = plan.members.find(m => {
                const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
                return activeUserUuid && mId === activeUserUuid;
              });

              const isHost = Boolean(
                (plan.hostId && activeUserUuid && plan.hostId === activeUserUuid) ||
                ((plan as any).host_id && activeUserUuid && (plan as any).host_id === activeUserUuid) ||
                myMember?.isHost ||
                myMember?.role === 'HOST'
              );

              let statusText = 'Skipped';
              let statusColor = 'text-rose-400';

              if (isHost) {
                statusText = 'Hosted';
                statusColor = 'text-white';
              } else if (getMemberFinalState(myMember) === 'JOINED') {
                statusText = 'Joined';
                statusColor = 'text-emerald-400';
              } else {
                statusText = 'Skipped';
                statusColor = 'text-rose-400';
              }

              const dateObj = getPlanDateTime(plan);
              const dateParts = formatPlanDateParts(dateObj);

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId?.(plan.id)}
                  className="w-full flex items-center justify-between gap-3.5 py-2.5 cursor-pointer active:opacity-80 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Date + Time on the FAR LEFT */}
                    <div className="w-[68px] min-w-[68px] flex flex-col justify-center shrink-0 text-left font-sans leading-tight">
                      <span className="text-[12px] font-bold text-white tracking-wide uppercase">
                        {dateParts.date}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-400 mt-0.5">
                        {dateParts.time}
                      </span>
                    </div>

                    {/* Circular Plan Image */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0 relative border border-white/10">
                      <DiscoveryImages
                        src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
                        category={plan.category}
                        alt={plan.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="text-sm font-bold text-white truncate flex-1 min-w-0">
                      {plan.title}
                    </h3>
                  </div>

                  <span className={`text-xs font-medium shrink-0 ${statusColor}`}>
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
