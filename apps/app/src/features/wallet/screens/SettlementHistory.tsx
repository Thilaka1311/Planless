import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

export interface SettledExpenseItem {
  id: string;
  title: string;
  planTitle?: string;
  planCover?: string;
  amount: number;
  settledDate: string; // ISO timestamp or date string
  planId?: string;
  isPaymentKept?: boolean;
}

interface SettlementHistoryScreenProps {
  contextType: "person" | "plan";
  personName?: string;
  personAvatar?: string;
  planTitle?: string;
  planCover?: string;
  settledExpenses: SettledExpenseItem[];
  onBack: () => void;
  onSelectExpense?: (expenseId: string, planId?: string) => void;
}

export const SettlementHistoryScreen: React.FC<SettlementHistoryScreenProps> = ({
  contextType,
  personName,
  personAvatar,
  planTitle,
  planCover,
  settledExpenses,
  onBack,
  onSelectExpense,
}) => {
  // Sort settled expenses by settledDate descending (newest first)
  const sortedSettled = [...settledExpenses].sort((a, b) => {
    const timeA = new Date(a.settledDate || Date.now()).getTime();
    const timeB = new Date(b.settledDate || Date.now()).getTime();
    return timeB - timeA;
  });

  // Group by date string (e.g. "AUG 18", "AUG 12")
  const dateGroups = React.useMemo(() => {
    const map = new Map<string, SettledExpenseItem[]>();
    sortedSettled.forEach((exp) => {
      const dateObj = new Date(exp.settledDate || Date.now());
      const dateLabel = dateObj
        .toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        .toUpperCase(); // e.g. "AUG 18"

      if (!map.has(dateLabel)) {
        map.set(dateLabel, []);
      }
      map.get(dateLabel)!.push(exp);
    });
    return Array.from(map.entries());
  }, [sortedSettled]);

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-20 text-left bg-[#050505] animate-fade-in select-none">
      {/* Navigation Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back to Balances"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-sans font-bold text-zinc-100 tracking-tight">
            Settlement History
          </h2>
          <p className="text-xs font-sans text-zinc-500 font-medium truncate">
            {contextType === "person" ? personName : planTitle}
          </p>
        </div>
      </div>

      {/* Context Banner */}
      <div className="flex items-center gap-3.5 p-3.5 bg-[#0a0a0c] border border-white/[0.04] rounded-2xl mb-6">
        {contextType === "person" ? (
          <UserAvatar
            src={personAvatar || ""}
            alt={personName || ""}
            size="w-10 h-10"
            className="ring-1 ring-white/10 shrink-0"
          />
        ) : (
          <DiscoveryImages
            src={planCover || ""}
            alt={planTitle || ""}
            className="w-10 h-10 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0"
          />
        )}
        <div className="min-w-0">
          <h3 className="font-sans font-semibold text-sm text-zinc-200 truncate">
            {contextType === "person" ? personName : planTitle}
          </h3>
          <p className="text-[11px] font-sans text-zinc-500 uppercase tracking-wider font-semibold">
            {settledExpenses.length}{" "}
            {settledExpenses.length === 1 ? "Settled Expense" : "Settled Expenses"}
          </p>
        </div>
      </div>

      {/* History List or Empty State */}
      <div className="flex-1">
        {dateGroups.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-zinc-700 mx-auto stroke-[1.5]" />
            <h4 className="font-sans font-semibold text-sm text-zinc-400">
              No settlement history
            </h4>
            <p className="text-xs font-sans text-zinc-600">
              Settled expenses will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateGroups.map(([dateLabel, expsInGroup]) => (
              <div key={dateLabel} className="space-y-2">
                {/* Date Header */}
                <div className="pb-1.5 border-b border-white/[0.06]">
                  <span className="text-[11px] font-sans font-bold tracking-wider text-zinc-500 uppercase">
                    {dateLabel}
                  </span>
                </div>

                {/* Expense Rows */}
                <div className="divide-y divide-white/[0.04]">
                  {expsInGroup.map((exp) => {
                    const formattedAmount = exp.amount.toLocaleString("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    });

                    return (
                      <div
                        key={exp.id}
                        onClick={() => onSelectExpense?.(exp.id, exp.planId)}
                        className="w-full flex items-center justify-between py-3.5 text-left group transition-all cursor-pointer px-1 select-none opacity-70 hover:opacity-100"
                      >
                        <div className="flex items-center gap-3.5 flex-1 min-w-0">
                          {exp.planCover ? (
                            <DiscoveryImages
                              src={exp.planCover}
                              alt={exp.planTitle || ""}
                              className="w-10 h-10 rounded-lg object-cover bg-zinc-900 border border-white/[0.05] shrink-0 grayscale-30"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/[0.05] shrink-0 flex items-center justify-center text-[10px] text-zinc-650 font-black">
                              PLAN
                            </div>
                          )}

                          <div className="min-w-0 flex flex-col justify-center">
                            <h5 className="font-sans font-semibold text-[13.5px] truncate leading-tight text-zinc-300 group-hover:text-white">
                              {exp.title}
                            </h5>
                            {exp.planTitle && (
                              <span className="text-[11.5px] font-sans font-medium text-zinc-500 block truncate leading-tight mt-0.5">
                                {exp.planTitle}
                              </span>
                            )}
                            <span className="text-[10px] font-sans text-zinc-550 block truncate leading-tight mt-0.5">
                              {exp.isPaymentKept ? "Payment kept · Settled" : "Settled up"}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center justify-end">
                          <span className="font-sans text-sm font-bold tracking-tight text-zinc-400">
                            {formattedAmount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
