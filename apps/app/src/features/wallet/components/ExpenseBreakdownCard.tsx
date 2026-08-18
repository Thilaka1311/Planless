import React, { useState } from "react";
import { ExpenseBreakdown } from "../services/walletService";
import { Calendar, IndianRupee } from "lucide-react";
import { useToast } from "../../../shared/contexts/ToastContext";
import { supabase } from "../../../../lib/supabaseClient";

interface ExpenseBreakdownCardProps {
  expense: ExpenseBreakdown;
  onSettleSuccess: () => void;
  activeUserId: string;
}

export const ExpenseBreakdownCard: React.FC<ExpenseBreakdownCardProps> = ({
  expense,
  onSettleSuccess,
  activeUserId,
}) => {
  const { showToast } = useToast();
  const [isSettling, setIsSettling] = useState(false);

  const formattedTotal = expense.totalAmount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const formattedShare = expense.yourShare.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const handleSettle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSettling) return;
    setIsSettling(true);

    try {
      const { settleWalletExpenseParticipant } = await import("../services/walletService");
      const success = await settleWalletExpenseParticipant({
        expenseId: expense.id,
        participantUserId: activeUserId,
      });

      if (success) {
        showToast("Settlement registered successfully!");
        onSettleSuccess();
      } else {
        console.error("[ExpenseBreakdownCard] Settlement failed");
        showToast("Failed to register settlement.");
      }
    } catch (err) {
      console.error("[ExpenseBreakdownCard] Settlement failed:", err);
      showToast("Network error executing settlement.");
    } finally {
      setIsSettling(false);
    }
  };

  const isDebtor = expense.role === "debtor";

  return (
    <div className="w-full p-5 bg-[#0a0a0c] border border-white/[0.04] rounded-2xl flex flex-col space-y-4 text-left">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-display font-medium text-[13.5px] text-zinc-100 tracking-wide">
            {expense.planTitle}
          </h4>
          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-white/[0.03] text-[9.5px] font-sans font-medium text-zinc-550 border border-white/[0.02]">
            {expense.circleName}
          </span>
        </div>
        <div className="text-right">
          <span
            className={`font-mono text-xs font-semibold ${isDebtor ? "text-[#FF6B2C]" : "text-emerald-400"
              }`}
          >
            {isDebtor ? "You owe" : "You are owed"} {formattedShare}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-2.5 pt-2 border-t border-white/[0.03] text-[11px] font-sans text-zinc-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-zinc-650" />
          <span>{expense.date}</span>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <IndianRupee className="w-3.5 h-3.5 text-zinc-650" />
          <span>Total: {formattedTotal}</span>
        </div>
      </div>

      {!isDebtor && expense.status === "PENDING" && (
        <button
          onClick={handleSettle}
          disabled={isSettling}
          className="w-full py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isSettling ? "Settling..." : "Mark as Settled"}
        </button>
      )}
    </div>
  );
};
