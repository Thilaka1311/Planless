import React from "react";
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
          className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0"
        />
        <div className="min-w-0">
          <h4 className="font-display font-medium text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
            {plan.planTitle}
          </h4>
          <p className="text-[11px] font-sans text-zinc-550 mt-0.5 truncate">
            {isSettled
              ? "Settled Up"
              : isOwed
              ? "You get back"
              : "You owe"}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        {isSettled ? (
          <span className="font-mono text-xs font-bold tracking-tight text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            Settled Up
          </span>
        ) : (
          <span
            className={`font-mono text-sm font-bold tracking-tight ${
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
