import React, { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { useWalletStore } from "../state/WalletContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";

interface PlanOverallCostProps {
  planId?: string;
  expenseId?: string;
  onBack: () => void;
  onSelectUser: (userId: string) => void;
}

export interface PlanParticipantOwed {
  userId: string;
  fullName: string;
  profilePhoto: string;
  outstandingAmount: number;
  directionLabel: string;
  isMe: boolean;
  updatedAt: string;
  expenseTitle: string;
  date: string;
}

export const PlanOverallCost: React.FC<PlanOverallCostProps> = ({
  planId,
  expenseId,
  onBack,
  onSelectUser,
}) => {
  const {
    dbWalletTransactions,
    dbWalletPaidTransactions,
    dbPlansLocal,
    dbPlanParticipantsLocal,
    dbUsersLocal,
  } = useWalletStore();
  const { activeUserUuid, dbUsers } = useProfileStore();

  const mergedUsers = useMemo(() => {
    const map = new Map<string, any>();
    (dbUsers || []).forEach((u) => map.set(u.id, u));
    (dbUsersLocal || []).forEach((u) => map.set(u.id, u));
    return Array.from(map.values());
  }, [dbUsers, dbUsersLocal]);

  // Active logged in user UUID
  const meUser = mergedUsers.find(
    (u) => u.id === activeUserUuid || u.user_id === activeUserUuid
  );
  const meUuid = meUser?.id || activeUserUuid;

  const [fetchedParticipants, setFetchedParticipants] = React.useState<any[] | null>(null);
  const [fetchedExpense, setFetchedExpense] = React.useState<any | null>(null);
  const [loadingParticipants, setLoadingParticipants] = React.useState(false);

  // Direct Supabase fetch for expense & its participants if expenseId is provided
  React.useEffect(() => {
    if (!expenseId) {
      setFetchedParticipants(null);
      setFetchedExpense(null);
      return;
    }

    let isMounted = true;
    setLoadingParticipants(true);

    const fetchExpenseDetails = async () => {
      try {
        // Step 1: Resolve canonical expense UUID (check local store first, then DB by id or public_id)
        let matchedLocal = (dbWalletTransactions || []).find(
          (e: any) => e.id === expenseId || e.public_id === expenseId
        );

        let expObj = matchedLocal || null;
        let canonicalExpenseId = matchedLocal?.id || expenseId;

        // Query database by id
        const { data: dbExpById, error: errById } = await (supabase as any)
          .from("wallet_expenses")
          .select("*, payer:users!payer_id(id, full_name, profile_photo_path, username, public_id), plan:plans!plan_id(id, title, total_cost, cover_image)")
          .eq("id", expenseId)
          .maybeSingle();

        if (errById) {
          console.error("[PlanOverallCost] Error querying wallet_expenses by id:", errById);
        }

        if (dbExpById) {
          expObj = dbExpById;
          canonicalExpenseId = dbExpById.id;
        } else {
          // Query database by public_id if expenseId was public_id
          const { data: dbExpByPublicId, error: errByPublicId } = await (supabase as any)
            .from("wallet_expenses")
            .select("*, payer:users!payer_id(id, full_name, profile_photo_path, username, public_id), plan:plans!plan_id(id, title, total_cost, cover_image)")
            .eq("public_id", expenseId)
            .maybeSingle();

          if (errByPublicId) {
            console.error("[PlanOverallCost] Error querying wallet_expenses by public_id:", errByPublicId);
          }

          if (dbExpByPublicId) {
            expObj = dbExpByPublicId;
            canonicalExpenseId = dbExpByPublicId.id;
          }
        }

        // Step 2: Query wallet_expense_participants using valid UUID candidate expense IDs
        const isUuid = (val: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || "").trim());

        const candidateUuids = Array.from(
          new Set([canonicalExpenseId, expenseId, expObj?.id].filter((val) => val && isUuid(val)))
        );

        let partRows: any[] | null = null;
        let partErr: any = null;

        if (candidateUuids.length > 0) {
          const res = await (supabase as any)
            .from("wallet_expense_participants")
            .select("*")
            .in("expense_id", candidateUuids);
          partRows = res.data;
          partErr = res.error;
        }

        if (partErr) {
          console.error("[PlanOverallCost] Supabase error fetching wallet_expense_participants:", partErr);
        }

        let resolvedParts = partRows || [];
        if ((!resolvedParts || resolvedParts.length === 0) && expObj) {
          resolvedParts = expObj.participants || expObj.wallet_expense_participants || [];
        }

        // Step 3: Fetch user profile information for all participant user_ids if user details are missing
        if (resolvedParts.length > 0) {
          const userIds = Array.from(new Set(resolvedParts.map((p: any) => p.user_id).filter(Boolean)));
          if (userIds.length > 0) {
            const missingUserIds = userIds.filter((uid) => !resolvedParts.find((p: any) => p.user_id === uid && p.user?.full_name));

            if (missingUserIds.length > 0) {
              const { data: userData, error: userErr } = await (supabase as any)
                .from("users")
                .select("id, public_id, full_name, profile_photo_path, bio")
                .in("id", missingUserIds);

              if (userErr) {
                console.error("[PlanOverallCost] Error fetching users:", userErr);
              }

              if (userData && userData.length > 0) {
                const uMap = new Map<string, any>();
                userData.forEach((u: any) => {
                  if (u.id) uMap.set(u.id, u);
                  if (u.public_id) uMap.set(u.public_id, u);
                });

                resolvedParts = resolvedParts.map((p: any) => ({
                  ...p,
                  user: p.user || uMap.get(p.user_id),
                }));
              }
            }
          }
        }

        if (isMounted) {
          setFetchedExpense(expObj);
          setFetchedParticipants(resolvedParts);
        }
      } catch (err) {
        console.error("[PlanOverallCost] Exception fetching expense details:", err);
      } finally {
        if (isMounted) setLoadingParticipants(false);
      }
    };

    fetchExpenseDetails();

    return () => {
      isMounted = false;
    };
  }, [expenseId, dbWalletTransactions]);

  // Specific Expense (if expenseId passed) or Plan
  const selectedExpenseObj = useMemo(() => {
    if (!expenseId) return null;
    return fetchedExpense || (dbWalletTransactions || []).find((e) => e.id === expenseId || e.public_id === expenseId) || null;
  }, [dbWalletTransactions, expenseId, fetchedExpense]);

  const effectivePlanId = expenseId ? selectedExpenseObj?.plan_id || planId : planId;

  // Plan Details
  const plan = useMemo(() => {
    return (dbPlansLocal || []).find((p) => p.id === effectivePlanId);
  }, [dbPlansLocal, effectivePlanId]);

  // Header Title and Total Cost
  const displayTitle = selectedExpenseObj?.title || plan?.title || "Expense Breakdown";
  const displayCover = plan?.cover_image;

  // Filter participants with outstanding balance > 0
  const { participantsWhoOwe, totalCost } = useMemo(() => {
    const list: PlanParticipantOwed[] = [];

    // Target expenses to analyze: specific expenseId if provided, else all expenses for planId
    const targetExpenses = expenseId
      ? [selectedExpenseObj || { id: expenseId, status: "PENDING", total_amount: 0 }]
      : (dbWalletTransactions || []).filter((exp) => exp.plan_id === effectivePlanId);

    const overallCost = selectedExpenseObj
      ? Number(selectedExpenseObj.total_amount || 0)
      : Number(plan?.total_cost || 0);

    const payerId = selectedExpenseObj?.payer_id || selectedExpenseObj?.payer?.id;

    // Build map of user_id -> total amount owed for targeted expenses
    const userShareMap = new Map<string, { share: number; isSettled: boolean; updatedAt: string; expenseTitle: string; date: string }>();

    // Determine participants array for single expense vs overall plan expenses
    let activeParticipants: any[] = [];

    if (expenseId) {
      if (fetchedParticipants !== null) {
        activeParticipants = fetchedParticipants;
      } else if (selectedExpenseObj) {
        activeParticipants = selectedExpenseObj.participants || selectedExpenseObj.wallet_expense_participants || [];
      }
    }

    const defaultTitle = selectedExpenseObj?.title || plan?.title || "Expense";
    const defaultDate = selectedExpenseObj?.created_at || new Date().toISOString();

    if (expenseId) {
      const expStatus = selectedExpenseObj?.status || "PENDING";

      activeParticipants.forEach((pt: any) => {
        const ptUid = pt.user_id;
        if (!ptUid) return;

        const amt = Number(pt.amount_owed || 0);

        // Calculate completed payments made by this participant for this expense
        const completedPaid = (dbWalletPaidTransactions || [])
          .filter(
            (tx) =>
              (tx.expense_id === selectedExpenseObj?.id || tx.expense?.id === selectedExpenseObj?.id || tx.expense_id === expenseId) &&
              (tx.sender_id === ptUid || tx.sender?.id === ptUid) &&
              String(tx.status || "").toUpperCase() === "COMPLETED"
          )
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        const remaining = amt - completedPaid > 0 ? amt - completedPaid : 0;
        const isParticipantSettled = String(pt.status || "").toUpperCase() === "SETTLED" || expStatus === "SETTLED" || (amt > 0 && remaining <= 0);
        const updatedAt = pt.updated_at || pt.created_at || selectedExpenseObj?.updated_at || selectedExpenseObj?.created_at || new Date().toISOString();

        userShareMap.set(ptUid, {
          share: remaining > 0 ? remaining : amt,
          isSettled: isParticipantSettled,
          updatedAt,
          expenseTitle: defaultTitle,
          date: defaultDate,
        });
      });
    } else {
      targetExpenses.forEach((exp) => {
        const expStatus = exp.status || "PENDING";
        const expTitle = exp.title || plan?.title || "Expense";
        const expDate = exp.created_at || new Date().toISOString();
        const participants: any[] = exp.participants || exp.wallet_expense_participants || [];

        if (participants.length > 0) {
          participants.forEach((pt: any) => {
            const ptUid = pt.user_id;
            if (!ptUid) return;
            const amt = Number(pt.amount_owed || 0);

            const completedPaid = (dbWalletPaidTransactions || [])
              .filter(
                (tx) =>
                  (tx.expense_id === exp.id || tx.expense?.id === exp.id) &&
                  (tx.sender_id === ptUid || tx.sender?.id === ptUid) &&
                  String(tx.status || "").toUpperCase() === "COMPLETED"
              )
              .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

            const remaining = amt - completedPaid > 0 ? amt - completedPaid : 0;
            const isParticipantSettled = String(pt.status || "").toUpperCase() === "SETTLED" || expStatus === "SETTLED" || (amt > 0 && remaining <= 0);
            const updatedAt = pt.updated_at || pt.created_at || exp.updated_at || exp.created_at || new Date().toISOString();

            const current = userShareMap.get(ptUid) || { share: 0, isSettled: true, updatedAt, expenseTitle: expTitle, date: expDate };
            const isNewer = new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime();
            userShareMap.set(ptUid, {
              share: current.share + (remaining > 0 ? remaining : (amt > 0 ? amt : 0)),
              isSettled: current.isSettled && isParticipantSettled,
              updatedAt: isNewer ? updatedAt : current.updatedAt,
              expenseTitle: isNewer ? expTitle : current.expenseTitle,
              date: isNewer ? expDate : current.date,
            });
          });
        }
      });
    }

    userShareMap.forEach(({ share, isSettled, updatedAt, expenseTitle, date }, uId) => {
      const clean = (val: string) => String(val || "").trim().toLowerCase();

      // Do not count the payer (the person who paid upfront) as owing money to themselves
      const isPayer = payerId && clean(uId) === clean(payerId);
      if (isPayer) return;

      // Find user from fetchedParticipants joined user, or mergedUsers
      let uObj = mergedUsers.find((u) => u.id === uId || u.user_id === uId || u.public_id === uId);
      if (!uObj && activeParticipants) {
        const foundPt = activeParticipants.find((p: any) => p.user_id === uId || p.user?.id === uId || p.user?.user_id === uId);
        if (foundPt?.user) uObj = foundPt.user;
      }

      const isMe = clean(uId) === clean(meUuid) || clean(uObj?.id) === clean(meUuid) || clean(uObj?.user_id) === clean(activeUserUuid);
      const rawName = uObj?.full_name || uObj?.name || uObj?.username || "Participant";
      const displayName = isMe ? "You" : rawName;

      const isPayerMe = payerId && (clean(payerId) === clean(meUuid) || clean(payerId) === clean(activeUserUuid));
      const directionLabel = isMe
        ? "You Owe"
        : isPayerMe
        ? `${displayName} Owes You`
        : `${displayName} Owes You`;

      list.push({
        userId: uId,
        fullName: displayName,
        profilePhoto:
          uObj?.profile_photo_path ||
          uObj?.profile_photo ||
          uObj?.avatar ||
          "",
        outstandingAmount: share,
        directionLabel: isSettled ? "Settled" : directionLabel,
        isMe,
        updatedAt,
        expenseTitle,
        date,
      });
    });

    // Sort newest updated_at first
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return {
      participantsWhoOwe: list,
      totalCost: overallCost,
    };
  }, [plan, effectivePlanId, selectedExpenseObj, expenseId, fetchedParticipants, dbPlanParticipantsLocal, dbWalletTransactions, dbWalletPaidTransactions, mergedUsers, meUuid, activeUserUuid, meUser]);

  const formatINR = (val: number) =>
    val.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });

  return (
    <div
      id="subview_plan_overall_cost"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-24 text-left bg-[#050505] animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
            {displayTitle}
          </h2>
        </div>
      </div>

      {/* Plan Header Info */}
      <div className="flex items-center gap-4 mt-6">
        <DiscoveryImages
          src={displayCover}
          alt={displayTitle}
          className="w-14 h-14 rounded-xl object-cover bg-zinc-900 border border-white/[0.08] shrink-0"
        />
        <div className="min-w-0">
          <h3 className="font-display font-bold text-lg text-white truncate">
            {displayTitle}
          </h3>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            {formatINR(totalCost)} total
          </p>
        </div>
      </div>

      {/* People Section */}
      <div className="mt-8 flex-1 flex flex-col">
        <h4 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-zinc-500 px-1 mb-4">
          PEOPLE
        </h4>

        {loadingParticipants ? (
          <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px]">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-zinc-500 font-sans">Loading participants...</p>
          </div>
        ) : participantsWhoOwe.length === 0 ? (
          <div className="p-8 text-center bg-zinc-950/20 border border-dashed border-zinc-900 rounded-[24px]">
            <p className="text-sm font-semibold text-zinc-300">
              Everyone is settled up 🎉
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {participantsWhoOwe.map((item) => {
              const isSettled = item.directionLabel === "Settled";
              const dateObj = new Date(item.date);
              const formattedDate = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
                : "Recent";

              return (
                <button
                  key={item.userId}
                  type="button"
                  onClick={() => onSelectUser(item.userId)}
                  className="w-full flex items-center justify-between py-4 text-left group hover:bg-white/[0.01] transition-all cursor-pointer px-1 select-none"
                >
                  {/* Left block: Date -> Avatar -> Participant / Expense Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-xs font-sans text-zinc-500 w-12 shrink-0 font-medium">
                      {formattedDate}
                    </span>

                    <UserAvatar
                      src={item.profilePhoto}
                      alt={item.fullName}
                      size="w-10 h-10"
                      className="shrink-0"
                    />

                    <div className="min-w-0">
                      <h5 className="font-sans font-semibold text-[13px] text-zinc-200 group-hover:text-white transition-colors truncate">
                        {isSettled ? "Settled Up" : item.expenseTitle}
                      </h5>
                      <span className="text-[10px] font-sans text-zinc-550 block truncate mt-0.5">
                        {isSettled
                          ? item.isMe
                            ? `You paid ${formatINR(item.outstandingAmount)}`
                            : `${item.fullName} paid ${formatINR(item.outstandingAmount)} to you`
                          : item.directionLabel}
                      </span>
                    </div>
                  </div>

                  {/* Right block: Amount or Settled Tag */}
                  <div className="text-right shrink-0">
                    {isSettled ? (
                      <span className="font-mono text-xs font-bold tracking-tight text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                        {formatINR(item.outstandingAmount)} Settled
                      </span>
                    ) : (
                      <span className="font-mono text-sm font-bold tracking-tight text-[#FF6B2C]">
                        {formatINR(item.outstandingAmount)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
