import React, { useMemo } from "react";
import { ChevronLeft, History } from "lucide-react";
import { EmptyState } from "../../../home/components/EmptyState";
import { usePlansStore } from "../../state/PlansContext";
import { useProfileStore } from "../../../profile/state/ProfileContext";
import { DiscoveryImages } from "../../../../IMGfromDB/PlanImages";
import { getPlanCover } from "../../config/planCoverImages";

interface PastPlansProps {
  onBack: () => void;
  setSelectedPlanId?: (planId: string | null) => void;
}

export const PastPlans: React.FC<PastPlansProps> = React.memo(({
  onBack,
  setSelectedPlanId,
}) => {
  const { plans } = usePlansStore();
  const { activeUserUuid } = useProfileStore();

  const completedPlans = useMemo(() => {
    return plans.filter((p) => {
      if ((p.status || "").toUpperCase() !== "COMPLETED") return false;
      
      const myMember = p.members.find(m => m.userId === activeUserUuid);
      if (!myMember) return false;
      
      if (myMember.finalState === 'JOINED') return true;
      if (myMember.finalState === 'SKIPPED') return false;
      
      return myMember.joinState === 'JOINED';
    });
  }, [plans, activeUserUuid]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Header */}
      <div className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-wide text-center">
          Past Plans
        </h1>
        <div className="w-9" />
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
          <div className="space-y-3">
            {completedPlans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId?.(plan.id)}
                className="w-full bg-[#111114] border border-white/[0.08] hover:border-white/20 rounded-2xl p-3.5 flex items-center gap-3.5 cursor-pointer active:scale-[0.99] transition-all"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative border border-white/10">
                  <DiscoveryImages
                    src={plan.coverImage || getPlanCover(plan.category, (plan as any).subcategory)}
                    category={plan.category}
                    alt={plan.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {plan.title}
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-400">
                    ✓ Completed
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
