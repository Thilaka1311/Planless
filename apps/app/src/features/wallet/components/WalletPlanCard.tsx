import React from "react";
import { Check } from "lucide-react";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { PlanRelationship } from "../services/walletService";

interface WalletPlanCardProps {
  plan: PlanRelationship;
  onClick: () => void;
}

export const WalletPlanCard: React.FC<WalletPlanCardProps> = ({ plan, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center py-3 px-1 hover:bg-white/[0.02] transition-colors text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <DiscoveryImages
          src={plan.planCover}
          alt={plan.planTitle}
          className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0 opacity-90"
        />
        <h4 className="font-sans font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
          {plan.planTitle}
        </h4>
      </div>
    </button>
  );
};
