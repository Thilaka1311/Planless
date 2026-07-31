import React from "react";
import { ChevronLeft, History } from "lucide-react";
import { EmptyState } from "../../../home/components/EmptyState";

interface PastPlansProps {
  onBack: () => void;
  setSelectedPlanId?: (planId: string | null) => void;
}

export const PastPlans: React.FC<PastPlansProps> = React.memo(({
  onBack,
}) => {
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

      {/* Main Content / Empty State */}
      <div className="flex-1 flex flex-col overflow-y-auto scrollbar-none px-6 pt-4 pb-6">
        <EmptyState
          icon={<History className="w-8 h-8 text-zinc-500 stroke-[1.5]" />}
          title="No past plans yet"
          description="Completed plans will appear here."
          py="py-12"
        />
      </div>
    </div>
  );
});
