import React from "react";
import { Check } from "lucide-react";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { PlanRelationship } from "../services/walletService";

interface WalletPlanCardProps {
  plan: PlanRelationship;
  onClick: () => void;
}

export const WalletPlanCard: React.FC<WalletPlanCardProps> = ({ plan, onClick }) => {
  const rawDate = (plan as any).date || (plan as any).createdAt || plan.updatedAt;
  const validD = rawDate ? new Date(rawDate) : new Date();
  const safeD = isNaN(validD.getTime()) ? new Date() : validD;

  const monthUpper = safeD.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const dayStr = String(safeD.getDate()).padStart(2, "0");

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center py-3 px-1 hover:bg-white/[0.02] transition-colors text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* COMPACT LEFT DATE COLUMN */}
        <div className="w-8 shrink-0 flex flex-col items-center justify-center text-center select-none">
          <span className="text-[9.5px] font-sans font-semibold tracking-wider text-zinc-500 uppercase leading-none">
            {monthUpper}
          </span>
          <span className="text-sm font-sans font-bold text-zinc-200 leading-tight mt-0.5">
            {dayStr}
          </span>
        </div>

        {/* PLAN AVATAR */}
        <DiscoveryImages
          src={plan.planCover}
          alt={plan.planTitle}
          className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0 opacity-90"
        />

        {/* PLAN NAME */}
        <h4 className="font-sans font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
          {plan.planTitle}
        </h4>
      </div>
    </button>
  );
};
