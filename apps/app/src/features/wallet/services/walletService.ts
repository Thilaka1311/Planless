import { supabase } from "../../../../lib/supabaseClient";

export interface WalletTransaction {
  id: string;
  expenseId: string;
  planId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  publicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseBreakdown {
  id: string;
  publicId?: string;
  planId: string;
  planTitle: string;
  expenseTitle?: string;
  planCover?: string;
  circleId: string;
  circleName: string;
  date: string;
  updatedAt?: string;
  totalAmount: number;
  yourShare: number;
  outstandingAmount: number;
  status: "PENDING" | "SETTLED";
  participantStatus?: "PENDING" | "SETTLED";
  role: "debtor" | "creditor";
  payerId?: string;
  isPaymentKept?: boolean;
  skipReason?: string;
}

export interface WalletRelationship {
  userId: string;
  fullName: string;
  profilePhoto: string;
  /**
   * Net balance for this person relationship:
   * Positive (+): They owe the user money overall.
   * Negative (-): The user owes them money overall.
   */
  netBalance: number;
  type: "owe" | "owed";
  expenses: ExpenseBreakdown[];
}

export interface PlanParticipantContribution {
  userId: string;
  fullName: string;
  profilePhoto: string;
  amount: number;
  role: "creditor" | "debtor";
  status: "PENDING" | "SETTLED";
}

export interface PlanRelationship {
  planId: string;
  expenseId: string;
  planTitle: string;
  planCover?: string;
  netBalance: number;
  type: "owed" | "owe";
  totalCost: number;
  participants: PlanParticipantContribution[];
  updatedAt: string;
}

export interface WalletSummary {
  overallBalance: number;
  totalYouOwe: number;
  totalYouAreOwed: number;
  personRelationships: WalletRelationship[];
  settledRelationships: WalletRelationship[];
  planRelationships: PlanRelationship[];
  settledPlanRelationships: PlanRelationship[];
  youOweList: WalletRelationship[];
  youAreOwedList: WalletRelationship[];
}

/**
 * Calculates remaining amount owed for a participant after subtracting completed transactions.
 */
export const calculateParticipantRemainingAmount = (
  amountOwed: number,
  expenseId: string,
  participantUserId: string,
  transactions: any[] = []
): number => {
  const clean = (val: string) => String(val || "").trim().toLowerCase();
  const cleanPtId = clean(participantUserId);

  const completedPaidSum = (transactions || [])
    .filter(
      (tx) =>
        clean(tx.expense_id) === clean(expenseId) &&
        (clean(tx.sender_id) === cleanPtId || clean(tx.sender?.id) === cleanPtId || clean(tx.sender?.public_id) === cleanPtId) &&
        String(tx.status || "").toUpperCase() === "COMPLETED"
    )
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const remaining = amountOwed - completedPaidSum;
  return remaining > 0 ? remaining : 0;
};

export type ParticipantFinancialState = "ACTIVE" | "PAYMENT_KEPT" | "EXCLUDED";

/**
 * Shared helper to check if a participant status represents a JOINED participant.
 * Allowed: JOINED, CONFIRMED, ACCEPTED, HOST.
 * Excluded: INVITED, WAITLIST, WAITLISTED, SKIPPED, DECLINED, LEFT, REMOVED.
 */
export const isJoinedParticipantStatus = (status?: string | null): boolean => {
  const clean = String(status || "").trim().toUpperCase();
  return clean === "JOINED" || clean === "CONFIRMED" || clean === "ACCEPTED" || clean === "HOST";
};

/**
 * Shared helper to determine a participant's financial state with strict precedence:
 * 1. rsvp_status = JOINED / CONFIRMED / ACCEPTED / HOST -> ACTIVE
 * 2. skip_reason = PAYMENT_KEPT -> PAYMENT_KEPT
 * 3. Otherwise -> EXCLUDED
 */
export const getParticipantFinancialState = (
  status?: string | null,
  skipReason?: string | null
): ParticipantFinancialState => {
  const cleanSkipReason = String(skipReason || "").trim().toUpperCase();

  // Rule 1: JOINED / CONFIRMED / ACCEPTED / HOST takes precedence -> ACTIVE
  if (isJoinedParticipantStatus(status)) {
    return "ACTIVE";
  }

  // Rule 2: PAYMENT_KEPT retained payment -> PAYMENT_KEPT
  if (cleanSkipReason === "PAYMENT_KEPT") {
    return "PAYMENT_KEPT";
  }

  // Rule 3: Otherwise -> EXCLUDED
  return "EXCLUDED";
};

/**
 * Helper to check if a user is currently excluded (e.g. waitlisted/skipped without PAYMENT_KEPT) from financial balances.
 */
export const isUserWaitlistedInPlan = (
  planId: string,
  userId: string,
  dbPlanParticipants: any[] = []
): boolean => {
  if (!planId || !userId || !dbPlanParticipants || dbPlanParticipants.length === 0) {
    return false;
  }
  const clean = (v: string) => String(v || "").trim().toLowerCase();
  const targetPlan = clean(planId);
  const targetUser = clean(userId);

  const match = dbPlanParticipants.find(
    (p) =>
      clean(p.plan_id || p.planId) === targetPlan &&
      clean(p.user_id || p.userId) === targetUser
  );

  if (!match) return false;

  const finState = getParticipantFinancialState(
    match.rsvp_status || match.status,
    match.skip_reason || match.skipReason
  );

  return finState === "EXCLUDED";
};

/**
 * Calculates net financial relationships for the current user
 * based strictly on wallet_expenses + wallet_expense_participants.
 */
export const calculateWalletSummary = (
  currentUserId: string,
  dbWalletExpenses: any[],
  dbUsers: any[],
  dbPlans: any[],
  dbCircles: any[],
  dbPlanParticipants: any[],
  _dbTransactions: any[] = [] // Unused — kept for backwards-compatible parameter signature
): WalletSummary => {
  if (!currentUserId) {
    return {
      overallBalance: 0,
      totalYouOwe: 0,
      totalYouAreOwed: 0,
      personRelationships: [],
      settledRelationships: [],
      planRelationships: [],
      settledPlanRelationships: [],
      youOweList: [],
      youAreOwedList: [],
    };
  }

  // Resolve current user UUID
  const meUser = dbUsers.find((u) => u.id === currentUserId || u.user_id === currentUserId || u.public_id === currentUserId);
  const meUuid = meUser?.id || currentUserId;
  const mePublicId = meUser?.public_id || meUser?.user_id || currentUserId;

  const balances: Record<string, {
    owedToMe: number;
    iOweThem: number;
    userObj: any;
    creditorExpenses: ExpenseBreakdown[];
    debtorExpenses: ExpenseBreakdown[];
  }> = {};

  const planMap: Record<string, {
    planId: string;
    expenseId: string;
    planTitle: string;
    planCover?: string;
    totalCost: number;
    netBalance: number;
    participantMap: Map<string, PlanParticipantContribution>;
    updatedAt: string;
  }> = {};

  const ensureBalance = (uid: string, uObj: any) => {
    if (!balances[uid]) {
      balances[uid] = { owedToMe: 0, iOweThem: 0, userObj: uObj, creditorExpenses: [], debtorExpenses: [] };
    }
    if (!balances[uid].userObj && uObj) balances[uid].userObj = uObj;
  };

  const resolveUser = (uid: string) =>
    dbUsers.find((u) => u.id === uid || u.user_id === uid || u.public_id === uid) || null;

  const isMe = (uid: string) => {
    if (!uid) return false;
    const clean = (val: string) => String(val || "").trim().toLowerCase();
    const cleanTarget = clean(uid);
    return (
      cleanTarget === clean(currentUserId) ||
      (meUuid && cleanTarget === clean(meUuid)) ||
      (mePublicId && cleanTarget === clean(mePublicId)) ||
      (meUser?.user_id && cleanTarget === clean(meUser.user_id))
    );
  };

  (dbWalletExpenses || []).forEach((exp) => {
    const payerUuid: string = exp.payer_id || exp.payer?.id;
    const plan = exp.plan || dbPlans.find((p) => p.id === exp.plan_id);

    const actualPlanTitle = plan?.title || "Plan";
    const rawTitle = exp.title ? String(exp.title).trim() : "";
    const isPlanJoiningExpense =
      exp.expense_type === "PLAN_EXPENSE" ||
      rawTitle === "Plan Fee" ||
      rawTitle === "Plan Expense" ||
      (!rawTitle && !exp.message_id && !exp.messageId);
    const expenseTitle = isPlanJoiningExpense ? "Plan Fee" : (rawTitle || "Shared Expense");
    const planCover = plan?.cover_image || undefined;
    const dateStr = exp.created_at
      ? new Date(exp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Recent";

    // Extract participants strictly from exp.participants / exp.wallet_expense_participants
    const pts = exp.participants || exp.wallet_expense_participants || [];

    if (pts && pts.length > 0) {
      const payerIsMe = isMe(payerUuid);
      const isParticipantMeInExpense = pts.some((pt: any) => isMe(pt.user_id));

      const targetPlanId = exp.plan_id || exp.id;
      const planTitle = plan?.title || exp.title || "Shared Plan";

      if ((payerIsMe || isParticipantMeInExpense) && !planMap[targetPlanId]) {
        planMap[targetPlanId] = {
          planId: exp.plan_id || targetPlanId,
          expenseId: exp.id,
          planTitle,
          planCover,
          totalCost: 0,
          netBalance: 0,
          participantMap: new Map(),
          updatedAt: exp.updated_at || exp.created_at || new Date().toISOString(),
        };
      }
      const pEntry = planMap[targetPlanId];
      if (pEntry && (payerIsMe || isParticipantMeInExpense)) {
        pEntry.totalCost += Number(exp.total_amount || 0);
      }

      pts.forEach((pt: any) => {
        const ptUserId: string = pt.user_id;
        if (!ptUserId) return;

        const partMatch = (dbPlanParticipants || []).find(
          (p: any) =>
            String(p.plan_id || p.planId || "").trim().toLowerCase() === String(exp.plan_id || "").trim().toLowerCase() &&
            String(p.user_id || p.userId || "").trim().toLowerCase() === String(ptUserId || "").trim().toLowerCase()
        );
        const finState = getParticipantFinancialState(
          partMatch?.rsvp_status || partMatch?.status,
          partMatch?.skip_reason || partMatch?.skipReason
        );

        // Canonical Inclusion Rule:
        if (isPlanJoiningExpense) {
          if (finState === "EXCLUDED") {
            return;
          }
        } else {
          // For ADDITIONAL_EXPENSE, preserve historical financial split even if participant left the plan!
          // Exclude only waitlisted participants with amount_owed === 0
          const rsvpSt = String(partMatch?.rsvp_status || partMatch?.status || "").toUpperCase();
          if (rsvpSt === "WAITLISTED" && Number(pt.amount_owed || 0) === 0) {
            return;
          }
        }

        const ptSkipReason = String(partMatch?.skip_reason || partMatch?.skipReason || "").trim().toUpperCase();
        const ptIsPaymentKept = finState === "PAYMENT_KEPT";

        const amountOwed = Number(pt.amount_owed || 0);
        if (amountOwed <= 0) return;

        const ptStatus = String(pt.status || "PENDING").toUpperCase();
        const ptIsMe = isMe(ptUserId);
        const isParticipantSettled = ptStatus === "SETTLED";

        // Canonical Outstanding Calculation:
        // A settled split contributes ₹0 to current outstanding balance.
        const remaining = isParticipantSettled ? 0 : amountOwed;

        const ptUpdatedAt = pt.updated_at || pt.created_at || exp.updated_at || exp.created_at || new Date().toISOString();

        // 1. Person Balances Aggregation
        if (payerIsMe && !ptIsMe) {
          // I paid — this participant owes me their share
          const ptUser = resolveUser(ptUserId);
          ensureBalance(ptUserId, ptUser);
          if (remaining > 0) {
            balances[ptUserId].owedToMe += remaining;
          }
          balances[ptUserId].creditorExpenses.push({
            id: exp.id,
            publicId: exp.public_id || undefined,
            planId: exp.plan_id || "",
            planTitle: actualPlanTitle,
            expenseTitle: expenseTitle,
            planCover,
            circleId: "",
            circleName: "Group",
            date: dateStr,
            updatedAt: ptUpdatedAt,
            totalAmount: Number(exp.total_amount || 0),
            yourShare: amountOwed,
            outstandingAmount: remaining,
            status: isParticipantSettled ? "SETTLED" : (exp.status || "PENDING"),
            participantStatus: isParticipantSettled ? "SETTLED" : "PENDING",
            role: "creditor",
            payerId: payerUuid,
            isPaymentKept: ptIsPaymentKept,
            skipReason: ptSkipReason,
          });
        } else if (!payerIsMe && ptIsMe) {
          // Someone else paid — I owe them my share
          const payerUser = resolveUser(payerUuid) || exp.payer;
          ensureBalance(payerUuid, payerUser);
          if (remaining > 0) {
            balances[payerUuid].iOweThem += remaining;
          }
          balances[payerUuid].debtorExpenses.push({
            id: exp.id,
            publicId: exp.public_id || undefined,
            planId: exp.plan_id || "",
            planTitle: actualPlanTitle,
            expenseTitle: expenseTitle,
            planCover,
            circleId: "",
            circleName: "Group",
            date: dateStr,
            updatedAt: ptUpdatedAt,
            totalAmount: Number(exp.total_amount || 0),
            yourShare: amountOwed,
            outstandingAmount: remaining,
            status: isParticipantSettled ? "SETTLED" : (exp.status || "PENDING"),
            participantStatus: isParticipantSettled ? "SETTLED" : "PENDING",
            role: "debtor",
            payerId: payerUuid,
            isPaymentKept: ptIsPaymentKept,
            skipReason: ptSkipReason,
          });
        }

        // 2. Plan Balances Aggregation
        if (pEntry && (payerIsMe || isParticipantMeInExpense)) {
          if (new Date(ptUpdatedAt).getTime() > new Date(pEntry.updatedAt).getTime()) {
            pEntry.updatedAt = ptUpdatedAt;
          }

          const ptUser = resolveUser(ptUserId) || (ptIsMe ? meUser : null);
          const fullName = ptIsMe ? "You" : ptUser?.full_name || ptUser?.name || "Participant";
          const profilePhoto = ptUser?.profile_photo_path || ptUser?.profile_photo || ptUser?.avatar || "";

          if (payerIsMe && !ptIsMe) {
            pEntry.netBalance += remaining;
            const existingPt = pEntry.participantMap.get(ptUserId) || {
              userId: ptUserId,
              fullName,
              profilePhoto,
              amount: 0,
              role: "creditor" as const,
              status: "SETTLED" as const,
            };
            const nextAmount = existingPt.amount + (isParticipantSettled ? amountOwed : remaining);
            const nextStatus = (!isParticipantSettled || existingPt.status === "PENDING") ? ("PENDING" as const) : ("SETTLED" as const);

            pEntry.participantMap.set(ptUserId, {
              ...existingPt,
              amount: nextAmount,
              status: nextStatus,
            });
          } else if (!payerIsMe && ptIsMe) {
            pEntry.netBalance -= remaining;
            const existingPt = pEntry.participantMap.get(payerUuid) || {
              userId: payerUuid,
              fullName,
              profilePhoto,
              amount: 0,
              role: "debtor" as const,
              status: "SETTLED" as const,
            };
            const nextAmount = existingPt.amount + (isParticipantSettled ? amountOwed : remaining);
            const nextStatus = (!isParticipantSettled || existingPt.status === "PENDING") ? ("PENDING" as const) : ("SETTLED" as const);

            pEntry.participantMap.set(payerUuid, {
              ...existingPt,
              amount: nextAmount,
              status: nextStatus,
            });
          }
        }
      });
    }
  });

  const personRelationships: WalletRelationship[] = [];
  const settledRelationships: WalletRelationship[] = [];
  const youOweList: WalletRelationship[] = [];
  const youAreOwedList: WalletRelationship[] = [];
  let totalYouOwe = 0;
  let totalYouAreOwed = 0;
  let netOverallSum = 0;

  Object.entries(balances).forEach(([otherUserId, bal]) => {
    const otherUser = bal.userObj || dbUsers.find((u) => u.id === otherUserId || u.user_id === otherUserId);
    const profilePhoto = otherUser?.profile_photo_path || otherUser?.profile_photo || otherUser?.avatar || "";
    const fullName = otherUser?.full_name || otherUser?.name || "User";
    const resolvedId = otherUser?.id || otherUserId;

    const allExpenses = [...bal.creditorExpenses, ...bal.debtorExpenses];
    const personNet = bal.owedToMe - bal.iOweThem;

    const relObj: WalletRelationship = {
      userId: resolvedId,
      fullName,
      profilePhoto,
      netBalance: personNet,
      type: personNet > 0 ? "owed" : "owe",
      expenses: allExpenses,
    };

    if (personNet !== 0) {
      personRelationships.push(relObj);
      netOverallSum += personNet;
    } else if (allExpenses.length > 0) {
      // Net balance is 0, but historical expenses exist -> belongs to Settled Up section
      settledRelationships.push(relObj);
    }

    if (bal.owedToMe > 0) {
      youAreOwedList.push({
        ...relObj,
        netBalance: bal.owedToMe,
        type: "owed",
        expenses: bal.creditorExpenses,
      });
      totalYouAreOwed += bal.owedToMe;
    }

    if (bal.iOweThem > 0) {
      youOweList.push({
        ...relObj,
        netBalance: -bal.iOweThem,
        type: "owe",
        expenses: bal.debtorExpenses,
      });
      totalYouOwe += bal.iOweThem;
    }
  });

  const planRelationships: PlanRelationship[] = [];
  const settledPlanRelationships: PlanRelationship[] = [];

  Object.values(planMap).forEach((pData) => {
    const participantsList = Array.from(pData.participantMap.values());

    const item: PlanRelationship = {
      planId: pData.planId,
      expenseId: pData.expenseId,
      planTitle: pData.planTitle,
      planCover: pData.planCover,
      netBalance: pData.netBalance,
      type: pData.netBalance >= 0 ? "owed" : "owe",
      totalCost: pData.totalCost,
      participants: participantsList,
      updatedAt: pData.updatedAt,
    };

    if (pData.netBalance !== 0) {
      planRelationships.push(item);
    } else {
      settledPlanRelationships.push(item);
    }
  });

  planRelationships.sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  settledPlanRelationships.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    overallBalance: netOverallSum,
    totalYouOwe,
    totalYouAreOwed,
    personRelationships,
    settledRelationships,
    planRelationships,
    settledPlanRelationships,
    youOweList,
    youAreOwedList,
  };
};

/**
 * Creates a wallet_transactions payment record.
 */
export const createWalletTransaction = async (params: {
  expenseId: string;
  planId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  status?: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
}): Promise<WalletTransaction | null> => {
  try {
    const success = await settleWalletExpenseParticipant({
      expenseId: params.expenseId,
      participantUserId: params.senderId,
    });

    if (!success) return null;

    return {
      id: `settled-${params.expenseId}-${params.senderId}`,
      expenseId: params.expenseId,
      planId: params.planId,
      senderId: params.senderId,
      receiverId: params.receiverId,
      amount: params.amount,
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[walletService] createWalletTransaction exception:", err);
    return null;
  }
};

/**
 * Fetches wallet_transactions involving a user (as sender or receiver).
 */
export const getWalletTransactions = async (userId: string): Promise<any[]> => {
  try {
    const { data, error } = await (supabase as any)
      .from("wallet_transactions")
      .select(`
        *,
        sender:users!sender_id(id, full_name, profile_photo_path, username),
        receiver:users!receiver_id(id, full_name, profile_photo_path, username),
        plan:plans!plan_id(id, title, cover_image),
        expense:wallet_expenses!expense_id(id, title, total_amount)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[walletService] getWalletTransactions failed:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[walletService] getWalletTransactions exception:", err);
    return [];
  }
};

/**
 * Fetches transactions for a specific wallet_expense.
 */
export const getTransactionsForExpense = async (expenseId: string): Promise<any[]> => {
  try {
    const { data, error } = await (supabase as any)
      .from("wallet_transactions")
      .select("*")
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[walletService] getTransactionsForExpense failed:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[walletService] getTransactionsForExpense exception:", err);
    return [];
  }
};

/**
 * Fetches transactions for a specific plan.
 */
export const getTransactionsForPlan = async (planId: string): Promise<any[]> => {
  try {
    const { data, error } = await (supabase as any)
      .from("wallet_transactions")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[walletService] getTransactionsForPlan failed:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[walletService] getTransactionsForPlan exception:", err);
    return [];
  }
};

export interface UnifiedHistoryItem {
  id: string;
  type: "expense" | "payment";
  createdAt: string;
  planId: string;
  planTitle: string;
  planCover?: string;
  title: string;
  amount: number;
  direction: "expense" | "incoming_payment" | "outgoing_payment";
  otherUser?: {
    id: string;
    fullName: string;
    profilePhoto: string;
  };
  status?: string;
}

/**
 * Combines wallet_expenses (spending by current user) and wallet_transactions (user-to-user payments)
 * into a single unified chronological history feed.
 */
export const getCombinedTransactionHistory = (
  currentUserId: string,
  dbWalletExpenses: any[] = [],
  _dbWalletPaidTransactions: any[] = [],
  dbUsers: any[] = [],
  dbPlans: any[] = []
): UnifiedHistoryItem[] => {
  if (!currentUserId) return [];

  const resolveUser = (uid: string) =>
    dbUsers.find((u) => u.id === uid || u.user_id === uid || u.public_id === uid) || null;

  const meUser = resolveUser(currentUserId);
  const meUuid = meUser?.id || currentUserId;
  const mePublicId = meUser?.public_id || meUser?.user_id || currentUserId;

  const isMe = (uid: string) => {
    if (!uid) return false;
    const clean = (val: string) => String(val || "").trim().toLowerCase();
    const cleanTarget = clean(uid);
    return (
      cleanTarget === clean(currentUserId) ||
      (meUuid && cleanTarget === clean(meUuid)) ||
      (mePublicId && cleanTarget === clean(mePublicId)) ||
      (meUser?.user_id && cleanTarget === clean(meUser.user_id))
    );
  };

  const history: UnifiedHistoryItem[] = [];

  (dbWalletExpenses || []).forEach((exp) => {
    const payerUuid = exp.payer_id || exp.payer?.id;
    const plan = exp.plan || dbPlans.find((p) => p.id === exp.plan_id);
    const planTitle = exp.title || plan?.title || "Shared Expense";
    const planCover = plan?.cover_image;
    const totalAmt = Number(exp.total_amount || 0);
    const pts = exp.participants || exp.wallet_expense_participants || [];

    if (isMe(payerUuid)) {
      // 1. Current user paid for the expense
      history.push({
        id: `exp-${exp.id}`,
        type: "expense",
        createdAt: exp.created_at || new Date().toISOString(),
        planId: exp.plan_id || "",
        planTitle,
        planCover,
        title: `You Paid ${totalAmt.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}`,
        amount: totalAmt,
        direction: "expense",
        status: exp.status || "PENDING",
      });

      // Also list settled settlements from other participants
      pts.forEach((pt: any) => {
        if (!isMe(pt.user_id) && String(pt.status).toUpperCase() === "SETTLED") {
          const ptUser = resolveUser(pt.user_id);
          const ptName = ptUser?.full_name || ptUser?.name || "User";
          const ptAmt = Number(pt.amount_owed || 0);

          history.push({
            id: `settle-in-${exp.id}-${pt.user_id}`,
            type: "payment",
            createdAt: exp.updated_at || exp.created_at || new Date().toISOString(),
            planId: exp.plan_id || "",
            planTitle,
            planCover,
            title: `${ptName} Paid You`,
            amount: ptAmt,
            direction: "incoming_payment",
            otherUser: {
              id: pt.user_id,
              fullName: ptName,
              profilePhoto: ptUser?.profile_photo_path || ptUser?.profile_photo || ptUser?.avatar || "",
            },
            status: "SETTLED",
          });
        }
      });
    } else {
      // 2. Someone else paid, current user is a participant
      const myPt = pts.find((pt: any) => isMe(pt.user_id));
      if (myPt && String(myPt.status).toUpperCase() === "SETTLED") {
        const payerUser = resolveUser(payerUuid) || exp.payer;
        const payerName = payerUser?.full_name || payerUser?.name || "User";
        const myAmt = Number(myPt.amount_owed || 0);

        history.push({
          id: `settle-out-${exp.id}-${currentUserId}`,
          type: "payment",
          createdAt: exp.updated_at || exp.created_at || new Date().toISOString(),
          planId: exp.plan_id || "",
          planTitle,
          planCover,
          title: `You Paid ${payerName}`,
          amount: myAmt,
          direction: "outgoing_payment",
          otherUser: {
            id: payerUuid,
            fullName: payerName,
            profilePhoto: payerUser?.profile_photo_path || payerUser?.profile_photo || payerUser?.avatar || "",
          },
          status: "SETTLED",
        });
      }
    }
  });

  return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

/**
 * Settles a participant's share of an expense directly in wallet_expense_participants,
 * and updates wallet_expenses status to SETTLED if all participants are settled.
 */
export const settleWalletExpenseParticipant = async (params: {
  expenseId: string;
  participantUserId: string;
}): Promise<boolean> => {
  try {
    const { error } = await (supabase as any).rpc("settle_wallet_expense", {
      p_expense_id: params.expenseId,
      p_debtor_id: params.participantUserId,
    });

    if (error) {
      console.error("[walletService] settleWalletExpenseParticipant RPC failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[walletService] settleWalletExpenseParticipant exception:", err);
    return false;
  }
};

/**
 * Settles all outstanding obligations from a debtor to the current user (creditor) in one atomic transaction.
 */
export const settleWalletRelationship = async (debtorUserId: string): Promise<boolean> => {
  try {
    const { error } = await (supabase as any).rpc("settle_wallet_relationship", {
      p_debtor_id: debtorUserId,
    });

    if (error) {
      console.error("[walletService] settleWalletRelationship RPC failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[walletService] settleWalletRelationship exception:", err);
    return false;
  }
};

/**
 * Legacy wrapper: Settles a specific expense directly via Supabase RPC.
 */
export const settleTransaction = async (expenseId: string): Promise<boolean> => {
  try {
    const { error } = await (supabase as any).rpc("settle_wallet_expense", {
      p_expense_id: expenseId,
    });

    if (error) {
      console.error("[walletService] Settle expense failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[walletService] Settle expense failed:", err);
    return false;
  }
};

/**
 * Deletes an additional wallet expense atomically via trusted SECURITY DEFINER RPC.
 */
export const deleteWalletExpense = async (expenseId: string): Promise<boolean> => {
  try {
    const { error } = await (supabase as any).rpc("delete_wallet_expense", {
      p_expense_id: expenseId,
    });

    if (error) {
      console.error("[walletService] deleteWalletExpense RPC failed:", error);
      throw error;
    }
    return true;
  } catch (err: any) {
    console.error("[walletService] deleteWalletExpense exception:", err);
    throw err;
  }
};

/**
 * Updates an additional wallet expense atomically via trusted SECURITY DEFINER RPC.
 */
export const updateWalletExpense = async (params: {
  expenseId: string;
  title: string;
  totalAmount: number;
  planId: string;
  participantIds: string[];
}): Promise<boolean> => {
  try {
    const { error } = await (supabase as any).rpc("update_cost_expense", {
      p_expense_id: params.expenseId,
      p_title: params.title,
      p_total_amount: params.totalAmount,
      p_plan_id: params.planId,
      p_participant_ids: params.participantIds,
    });

    if (error) {
      console.error("[walletService] updateWalletExpense RPC failed:", error);
      throw error;
    }
    return true;
  } catch (err: any) {
    console.error("[walletService] updateWalletExpense exception:", err);
    throw err;
  }
};

/**
 * Removes a participant from an expense and redistributes the total cost across remaining participants.
 */
export const removeExpenseParticipant = async (params: {
  expenseId: string;
  participantUserId: string;
  strategy?: "SPLIT_SHARE" | "KEEP_SAME_SHARE";
}): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data, error } = await (supabase as any).rpc("remove_expense_participant_and_redistribute", {
      p_expense_id: params.expenseId,
      p_participant_user_id: params.participantUserId,
      p_strategy: params.strategy || "SPLIT_SHARE",
    });

    if (error) {
      console.error("[walletService] removeExpenseParticipant RPC failed:", error);
      return { success: false, message: error.message || "Failed to remove participant" };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[walletService] removeExpenseParticipant exception:", err);
    return { success: false, message: err?.message || "Failed to remove participant" };
  }
};

/**
 * Calculates a participant's outstanding (unsettled) dues in a specific plan.
 */
export const getUserPlanOutstandingDues = async (planId: string, userId: string): Promise<number> => {
  try {
    if (!planId || !userId) return 0;

    const { data: expList } = await supabase
      .from("wallet_expenses")
      .select("id")
      .eq("plan_id", planId);

    if (!expList || expList.length === 0) return 0;
    const expIds = expList.map((e: any) => e.id);

    const { data: partSplits } = await supabase
      .from("wallet_expense_participants")
      .select("amount_owed, status")
      .in("expense_id", expIds)
      .eq("user_id", userId);

    if (!partSplits || partSplits.length === 0) return 0;

    let totalDues = 0;
    partSplits.forEach((s: any) => {
      const st = String(s.status || "PENDING").toUpperCase();
      if (st !== "SETTLED") {
        totalDues += Number(s.amount_owed || 0);
      }
    });

    return Math.round(totalDues * 100) / 100;
  } catch (err) {
    console.error("[getUserPlanOutstandingDues] Error:", err);
    return 0;
  }
};

/**
 * Helper to sort expense participants deterministically:
 * 1. Payer ALWAYS position #1
 * 2. "You" (current user) ALWAYS position #2 (if participant and not already payer)
 * 3. All remaining participants sorted alphabetically (A -> Z) by display name
 */
export function sortExpenseParticipants<T extends { userId: string; fullName?: string; name?: string; isPayer?: boolean; isMe?: boolean }>(
  list: T[],
  payerUserId: string,
  currentUserId: string
): T[] {
  if (!list || list.length <= 1) return list;

  const clean = (val: string) => String(val || "").trim().toLowerCase();
  const payerClean = clean(payerUserId);
  const meClean = clean(currentUserId);

  let payerItem: T | undefined = undefined;
  let meItem: T | undefined = undefined;
  const remainingItems: T[] = [];

  list.forEach((item) => {
    const itemUserClean = clean(item.userId);
    const isPayer = item.isPayer || (payerClean && itemUserClean === payerClean);
    const isMe = item.isMe || (meClean && itemUserClean === meClean);

    if (isPayer && !payerItem) {
      payerItem = item;
    } else if (isMe && !meItem) {
      meItem = item;
    } else {
      remainingItems.push(item);
    }
  });

  remainingItems.sort((a, b) => {
    const nameA = String(a.fullName || a.name || "").trim();
    const nameB = String(b.fullName || b.name || "").trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });

  const result: T[] = [];
  if (payerItem) {
    result.push(payerItem);
  }
  if (meItem && meItem !== payerItem) {
    result.push(meItem);
  }
  result.push(...remainingItems);

  return result;
}

