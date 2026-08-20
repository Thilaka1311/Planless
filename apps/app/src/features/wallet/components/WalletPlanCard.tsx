import React from "react";
import { Check } from "lucide-react";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { PlanRelationship } from "../services/walletService";

interface WalletPlanCardProps {
  plan: PlanRelationship;
  onClick: () => void;
}

export const WalletPlanCard: React.FC<WalletPlanCardProps> = ({ plan, onClick }) => {
  const isOwed = plan.netBalance >= 0;
  const isSettled = plan.netBalance === 0;

  const formattedBalance = Math.abs(plan.netBalance).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-[#0a0a0c] border border-white/[0.04] rounded-2xl hover:bg-white/[0.02] hover:border-white/[0.08] transition-all duration-200 text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <DiscoveryImages
          src={plan.planCover}
          alt={plan.planTitle}
          className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0 opacity-90"
        />
        <div className="min-w-0">
          <h4 className="font-sans font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
            {plan.planTitle}
          </h4>
          {!isSettled && (
            <p className="text-[11px] font-sans text-zinc-550 mt-0.5 truncate">
              {isOwed ? "You get back" : "You owe"}
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-3 flex items-center justify-end">
        {isSettled ? (
          <Check className="w-5 h-5 text-emerald-400 stroke-[2.5]" />
        ) : (
          <span
            className={`font-sans text-sm font-bold tracking-tight ${
              isOwed ? "text-emerald-400" : "text-[#FF6B2C]"
            }`}
          >
            {isOwed ? `+${formattedBalance}` : `-${formattedBalance}`}
          </span>
        )}
      </div>
    </button>
  );
};
