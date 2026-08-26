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

export const PastPlans: React.FC<PastPlansProps> = React.memo(({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans } = usePlansStore();
  const { activeUserUuid } = useProfileStore();

  const completedPlans = useMemo(() => {
    return plans.filter((p) => {
      if ((p.status || "").toUpperCase() !== "COMPLETED") return false;

      const myMember = p.members.find(m => {
        const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
        return activeUserUuid && mId === activeUserUuid;
      });
      return Boolean(myMember);
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

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId?.(plan.id)}
                  className="w-full flex items-center justify-between gap-3.5 py-2.5 cursor-pointer active:opacity-80 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative border border-white/10">
                      <DiscoveryImages
                        src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
                        category={plan.category}
                        alt={plan.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="text-sm font-bold text-white truncate">
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
