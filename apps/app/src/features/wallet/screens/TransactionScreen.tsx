import React, { useMemo } from "react";
import { ArrowLeft, History, Receipt } from "lucide-react";
import { useWalletStore } from "../state/WalletContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { getCombinedTransactionHistory, UnifiedHistoryItem } from "../services/walletService";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface TransactionScreenProps {
  onBack: () => void;
  onSelectPlan?: (planId: string) => void;
}

export const TransactionScreen: React.FC<TransactionScreenProps> = ({
  onBack,
  onSelectPlan,
}) => {
  const {
    dbWalletTransactions,
    dbWalletPaidTransactions,
    dbPlansLocal,
    dbUsersLocal,
    loading,
    error,
  } = useWalletStore();
  const { activeUserUuid, dbUsers } = useProfileStore();

  const mergedUsers = useMemo(() => {
    const map = new Map<string, any>();
    (dbUsers || []).forEach((u) => map.set(u.id, u));
    (dbUsersLocal || []).forEach((u) => map.set(u.id, u));
    return Array.from(map.values());
  }, [dbUsers, dbUsersLocal]);

  // Combined chronological history from both wallet_expenses and wallet_transactions
  const groupedTransactions = useMemo(() => {
    const historyItems = getCombinedTransactionHistory(
      activeUserUuid || "",
      dbWalletTransactions,
      dbWalletPaidTransactions,
      mergedUsers,
      dbPlansLocal
    );

    const groups: { [key: string]: UnifiedHistoryItem[] } = {};

    const todayStr = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    historyItems.forEach((item) => {
      const itemDate = new Date(item.createdAt);
      const itemDateStr = itemDate.toDateString();

      let label = "";
      if (itemDateStr === todayStr) {
        label = "TODAY";
      } else if (itemDateStr === yesterdayStr) {
        label = "YESTERDAY";
      } else {
        label = itemDate
          .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
          .toUpperCase();
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(item);
    });

    return Object.entries(groups).map(([dateLabel, items]) => ({
      dateLabel,
      items,
    }));
  }, [
    activeUserUuid,
    dbWalletTransactions,
    dbWalletPaidTransactions,
    mergedUsers,
    dbPlansLocal,
  ]);

  const formatINR = (val: number) =>
    val.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });

  return (
    <div
      id="subview_wallet_transactions"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-24 text-left bg-[#050505] animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
            Transactions
          </h2>
          <p className="text-[10px] text-zinc-550 font-sans mt-0.5">
            Complete financial history
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && groupedTransactions.length === 0 && (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && groupedTransactions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900/80 border border-white/[0.06] flex items-center justify-center text-zinc-500 mb-4">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-base font-display font-semibold text-zinc-200">
            No transactions yet
          </h3>
          <p className="text-xs font-sans text-zinc-550 mt-1 max-w-[220px]">
            Your expenses and payments will appear here.
          </p>
        </div>
      )}

      {/* Transactions Grouped List */}
      {groupedTransactions.length > 0 && (
        <div className="mt-6 space-y-6">
          {groupedTransactions.map((group) => (
            <div key={group.dateLabel} className="space-y-3">
              <h4 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 px-1">
                {group.dateLabel}
              </h4>

              <div className="divide-y divide-white/[0.04] bg-zinc-950/40 rounded-2xl border border-white/[0.04] overflow-hidden">
                {group.items.map((item) => {
                  const isExpense = item.type === "expense";
                  const isIncoming = item.direction === "incoming_payment";

                  // Format short date e.g. "Aug 12"
                  const itemDate = new Date(item.createdAt);
                  const formattedDate = !isNaN(itemDate.getTime())
                    ? itemDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "Recent";

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectPlan && item.planId && onSelectPlan(item.planId)}
                      className={`flex items-center justify-between p-4 transition-all ${
                        onSelectPlan ? "hover:bg-white/[0.02] cursor-pointer" : ""
                      }`}
                    >
                      {/* Left: Image + Hierarchy (Person -> Plan -> Date) */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {isExpense ? (
                          item.planCover ? (
                            <DiscoveryImages
                              src={item.planCover}
                              alt={item.planTitle}
                              className="w-11 h-11 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-zinc-900/90 border border-white/[0.08] shrink-0 flex items-center justify-center text-zinc-400">
                              <Receipt className="w-5 h-5 text-zinc-400" />
                            </div>
                          )
                        ) : (
                          <UserAvatar
                            src={item.otherUser?.profilePhoto || ""}
                            alt={item.otherUser?.fullName || "User"}
                            size="w-11 h-11"
                            className="shrink-0 ring-1 ring-white/10"
                          />
                        )}

                        <div className="min-w-0 flex-1 space-y-0.5">
                          {/* Top line: Person / Action */}
                          <h5 className="font-sans font-semibold text-[14px] text-zinc-100 truncate leading-tight">
                            {isExpense ? "You" : item.otherUser?.fullName || "User"}
                          </h5>
                          {/* Second line: Plan / Expense Name */}
                          <p className="text-[12px] font-sans font-medium text-zinc-300 truncate leading-tight">
                            {item.planTitle}
                          </p>
                          {/* Third line: Date */}
                          <span className="text-[11px] font-sans text-zinc-500 block truncate leading-tight">
                            {formattedDate}
                          </span>
                        </div>
                      </div>

                      {/* Right: Amount */}
                      <div className="text-right shrink-0 ml-3">
                        <span
                          className={`font-mono text-base font-bold tracking-tight ${
                            isIncoming
                              ? "text-emerald-400"
                              : "text-[#FF6B2C]"
                          }`}
                        >
                          {isIncoming
                            ? `+${formatINR(item.amount)}`
                            : `-${formatINR(item.amount)}`}
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
  );
};
