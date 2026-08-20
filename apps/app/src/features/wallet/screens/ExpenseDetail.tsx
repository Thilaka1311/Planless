import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Edit2, Trash2, HandCoins, CheckCircle2, MoreHorizontal, Check } from "lucide-react";
import { settleWalletExpenseParticipant, deleteWalletExpense, updateWalletExpense, removeExpenseParticipant, getParticipantFinancialState, sortExpenseParticipants } from "../services/walletService";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useWalletStore } from "../state/WalletContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { supabase } from "../../../../lib/supabaseClient";
import { EditCost } from "../components/EditCost";

interface ExpenseDetailCacheEntry {
  userPostgresUuid: string;
  expenseData: any;
  planData: any;
  participantsData: any[];
  rawPlanParticipants: any[];
  paymentKeptUserIds: string[];
  financiallyIncludedUserIds: string[];
  userProfiles: any[];
  timestamp: number;
}

const expenseDetailCache = new Map<string, ExpenseDetailCacheEntry>();
const inFlightExpenseFetches = new Map<string, Promise<ExpenseDetailCacheEntry>>();
const deletedExpenseIds = new Set<string>();

export const invalidateExpenseDetailCache = (expenseId?: string) => {
  if (expenseId) {
    expenseDetailCache.delete(expenseId);
    inFlightExpenseFetches.delete(expenseId);
  } else {
    expenseDetailCache.clear();
    inFlightExpenseFetches.clear();
  }
};

export const updateExpenseDetailCache = (
  expenseId: string,
  updatedFields: {
    title?: string;
    total_amount?: number;
    plan_id?: string;
    participants?: any[];
  },
  updateTimestamp: number = Date.now()
) => {
  const existing = expenseDetailCache.get(expenseId);
  if (!existing) return;

  // Stale update guard: don't overwrite if existing cache entry has a newer timestamp
  if (existing.timestamp > updateTimestamp) {
    return;
  }

  const nextExpenseData = {
    ...existing.expenseData,
    ...(updatedFields.title !== undefined
      ? { title: updatedFields.title, expenseTitle: updatedFields.title }
      : {}),
    ...(updatedFields.total_amount !== undefined
      ? { total_amount: updatedFields.total_amount, totalAmount: updatedFields.total_amount }
      : {}),
    ...(updatedFields.plan_id !== undefined
      ? { plan_id: updatedFields.plan_id, planId: updatedFields.plan_id }
      : {}),
  };

  const nextParticipants =
    updatedFields.participants !== undefined
      ? updatedFields.participants
      : existing.participantsData;

  expenseDetailCache.set(expenseId, {
    ...existing,
    expenseData: nextExpenseData,
    participantsData: nextParticipants,
    timestamp: updateTimestamp,
  });
};

interface ExpenseDetailsProps {
  expenseId: string;
  onBack: () => void;
  onRefreshBalances: () => void;
  activeUserId: string;
  source?: "people" | "plan";
}

export const ExpenseDetails: React.FC<ExpenseDetailsProps> = ({
  expenseId,
  onBack,
  onRefreshBalances,
  activeUserId,
  source,
}) => {
  const { activeUserUuid, userProfile } = useProfileStore();
  const { refreshPlans } = usePlansStore();
  const { dbWalletTransactions, updateExpenseInStore } = useWalletStore();

  const storeExpense = useMemo(() => {
    return (dbWalletTransactions || []).find((e: any) => e.id === expenseId);
  }, [dbWalletTransactions, expenseId]);

  useEffect(() => {
    if (storeExpense) {
      setExpenseData((prev: any) => ({ ...prev, ...storeExpense }));
      const storeParts = storeExpense.participants || storeExpense.wallet_expense_participants;
      if (Array.isArray(storeParts) && storeParts.length > 0) {
        setParticipantsData(storeParts);
      }
      // Synchronize in-memory cache with canonical storeExpense
      updateExpenseDetailCache(expenseId, {
        title: storeExpense.title,
        total_amount: storeExpense.total_amount,
        plan_id: storeExpense.plan_id,
        participants: storeParts,
      });
    }
  }, [storeExpense, expenseId]);

  // Synchronously read initial cache if available to guarantee zero loading flash on Cache HIT
  const getInitialCache = () => (expenseId ? expenseDetailCache.get(expenseId) || null : null);

  const [loading, setLoading] = useState<boolean>(() => !getInitialCache());
  const [error, setError] = useState<string | null>(null);
  const [expenseData, setExpenseData] = useState<any | null>(() => getInitialCache()?.expenseData || null);
  const [planData, setPlanData] = useState<any | null>(() => getInitialCache()?.planData || null);
  const [participantsData, setParticipantsData] = useState<any[]>(() => getInitialCache()?.participantsData || []);
  const [userProfiles, setUserProfiles] = useState<any[]>(() => getInitialCache()?.userProfiles || []);
  const [userPostgresUuid, setUserPostgresUuid] = useState<string>(() => getInitialCache()?.userPostgresUuid || "");
  const [financiallyIncludedUserIds, setFinanciallyIncludedUserIds] = useState<Set<string>>(() => new Set(getInitialCache()?.financiallyIncludedUserIds || []));
  const [rawPlanParticipants, setRawPlanParticipants] = useState<any[]>(() => getInitialCache()?.rawPlanParticipants || []);
  const [paymentKeptUserIds, setPaymentKeptUserIds] = useState<Set<string>>(() => new Set(getInitialCache()?.paymentKeptUserIds || []));
  const [hasLoadedPlanParticipants, setHasLoadedPlanParticipants] = useState<boolean>(() => !!getInitialCache());

  // Modals & Action Menu state
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedSettleParticipant, setSelectedSettleParticipant] = useState<any | null>(null);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Participant Tap Action Sheet State
  const [selectedParticipantForAction, setSelectedParticipantForAction] = useState<any | null>(null);
  const [showParticipantActionSheet, setShowParticipantActionSheet] = useState(false);

  const handleParticipantClick = (pt: any) => {
    if (pt.isMe) return; // 'You' row is untappable
    setSelectedParticipantForAction(pt);
    setShowParticipantActionSheet(true);
  };

  // Edit Expense form state
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editAmountError, setEditAmountError] = useState(false);
  const editTitleInputRef = useRef<HTMLInputElement>(null);

  // Last local mutation timestamp tracker to prevent local edit race condition
  const lastLocalMutationRef = useRef<number>(0);

  const applyCachedData = useCallback((cached: ExpenseDetailCacheEntry) => {
    setUserPostgresUuid(cached.userPostgresUuid);
    setExpenseData(cached.expenseData);
    setPlanData(cached.planData);
    setParticipantsData(cached.participantsData);
    setRawPlanParticipants(cached.rawPlanParticipants);
    setPaymentKeptUserIds(new Set(cached.paymentKeptUserIds));
    setFinanciallyIncludedUserIds(new Set(cached.financiallyIncludedUserIds));
    setUserProfiles(cached.userProfiles);
    setHasLoadedPlanParticipants(true);
    setLoading(false);
    setError(null);
  }, []);

  // Load single expense details directly from database by exact expenseId (Cache-First & Deduplicated)
  const loadExpenseDetail = useCallback(async (forceRefetch = false) => {
    if (!expenseId || deletedExpenseIds.has(expenseId)) return;

    // 1. Cache-First Check: Serve from cache if available and refetch is not forced
    if (!forceRefetch) {
      const cached = expenseDetailCache.get(expenseId);
      if (cached) {
        applyCachedData(cached);
        return;
      }

      // 2. In-Flight Check: Reuse existing in-flight database request if running
      const inFlightPromise = inFlightExpenseFetches.get(expenseId);
      if (inFlightPromise) {
        setLoading(true);
        setError(null);
        try {
          const cached = await inFlightPromise;
          applyCachedData(cached);
        } catch (err: any) {
          setError(err?.message || "Failed to load expense details.");
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    setLoading(true);
    setError(null);

    // 3. Create single shared fetch promise and register synchronously BEFORE starting async work
    const fetchPromise = (async (): Promise<ExpenseDetailCacheEntry> => {
      // 1. Resolve active user's Postgres UUID
      let userUuid = activeUserId || activeUserUuid || "";
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (userUuid && !isUuidRegex.test(userUuid)) {
        const { data: uMatch } = await supabase
          .from("users")
          .select("id")
          .or(`public_id.eq.${userUuid},user_id.eq.${userUuid},username.eq.${userUuid}`)
          .maybeSingle();

        if (uMatch?.id) userUuid = uMatch.id;
      }

      // 2. Query target expense by exact wallet_expenses.id
      const { data: exp, error: expErr } = await supabase
        .from("wallet_expenses")
        .select("*")
        .eq("id", expenseId)
        .maybeSingle();

      if (expErr) throw expErr;
      if (!exp) {
        throw new Error("Expense not found.");
      }

      // 3. Query Plan Details
      let fetchedPlan: any = null;
      if (exp.plan_id) {
        const { data: plan } = await supabase
          .from("plans")
          .select("id, title, cover_image")
          .eq("id", exp.plan_id)
          .maybeSingle();
        if (plan) {
          fetchedPlan = plan;
        }
      }

      // 4. Query Participants STRICTLY for this expenseId from wallet_expense_participants
      const { data: pts, error: ptErr } = await supabase
        .from("wallet_expense_participants")
        .select("*")
        .eq("expense_id", expenseId);

      if (ptErr) throw ptErr;

      const ptList: any[] = pts ? [...pts] : [];

      // 4b. Query plan_participants for financial inclusion status & payment_kept status
      const includedSet = new Set<string>();
      const pkSet = new Set<string>();
      let planParticipantList: any[] = [];
      if (exp.plan_id) {
        const { data: rawPlanPts } = await supabase
          .from("plan_participants")
          .select("plan_id, user_id, rsvp_status, skip_reason")
          .eq("plan_id", exp.plan_id);

        planParticipantList = rawPlanPts || [];

        planParticipantList.forEach((p: any) => {
          const finState = getParticipantFinancialState(p.rsvp_status || p.status, p.skip_reason || p.skipReason);
          if (finState === "ACTIVE") {
            includedSet.add(p.user_id);
          } else if (finState === "PAYMENT_KEPT") {
            includedSet.add(p.user_id);
            pkSet.add(p.user_id);
          }
        });

        ptList.forEach((pt: any) => {
          if (pt.user_id) includedSet.add(pt.user_id);
        });
      }

      // 5. Query user profiles for all involved/eligible users
      const allEligibleUserIds = planParticipantList.map((p: any) => p.user_id).filter(Boolean);
      const userIds = Array.from(
        new Set([exp.payer_id, ...ptList.map((p: any) => p.user_id), ...allEligibleUserIds, userUuid].filter(Boolean))
      );

      let fetchedProfiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("users")
          .select("id, full_name, profile_photo_path, username, public_id")
          .in("id", userIds);

        fetchedProfiles = profs || [];
      }

      const cacheEntry: ExpenseDetailCacheEntry = {
        userPostgresUuid: userUuid,
        expenseData: exp,
        planData: fetchedPlan,
        participantsData: ptList,
        rawPlanParticipants: planParticipantList,
        paymentKeptUserIds: Array.from(pkSet),
        financiallyIncludedUserIds: Array.from(includedSet),
        userProfiles: fetchedProfiles,
        timestamp: Date.now(),
      };

      // Store in client-side cache
      expenseDetailCache.set(expenseId, cacheEntry);
      return cacheEntry;
    })();

    // Synchronously register in-flight promise before any microtask
    inFlightExpenseFetches.set(expenseId, fetchPromise);

    try {
      const result = await fetchPromise;
      applyCachedData(result);
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Error loading expense details:", err);
      setError(err.message || "Failed to load expense details.");
    } finally {
      inFlightExpenseFetches.delete(expenseId);
      setLoading(false);
    }
  }, [expenseId, activeUserId, activeUserUuid, applyCachedData]);

  const loadExpenseDetailRef = useRef(loadExpenseDetail);
  useEffect(() => {
    loadExpenseDetailRef.current = loadExpenseDetail;
  }, [loadExpenseDetail]);

  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    loadExpenseDetail();
  }, [loadExpenseDetail]);

  // Consolidated Single Source of Truth: Realtime events are handled by WalletContext ("wallet_expenses_changes").
  // ExpenseDetails consumes storeExpense directly from WalletContext above.

  // Profile Map for fast lookup
  const profMap = useMemo(() => {
    const map = new Map<string, any>();
    userProfiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [userProfiles]);

  const isMe = (uid: string) => {
    if (!uid || !userPostgresUuid) return false;
    return String(uid).trim().toLowerCase() === String(userPostgresUuid).trim().toLowerCase();
  };

  // Compute expense financial breakdown & PAYER FIRST ORDERED PARTICIPANTS LIST
  const {
    expenseTitle,
    payerIsMe,
    payerUser,
    payerName,
    payerPhoto,
    userNetShare,
    formattedParticipants,
    activeParticipants,
    paymentKeptParticipants,
    isSettled,
  } = useMemo(() => {
    if (!expenseData) {
      return {
        expenseTitle: "Expense",
        payerIsMe: false,
        payerUser: null,
        payerName: "Payer",
        payerPhoto: "",
        userNetShare: 0,
        formattedParticipants: [],
        activeParticipants: [],
        paymentKeptParticipants: [],
        isSettled: false,
      };
    }

    const payerUuid = expenseData.payer_id;
    const payerMe = isMe(payerUuid);
    const pUser = profMap.get(payerUuid);
    const payerDisplayName = payerMe ? "You" : pUser?.full_name || pUser?.username || "Payer";
    const pPhoto = pUser?.profile_photo_path || "";

    const rawTitle = expenseData.title ? String(expenseData.title).trim() : "";
    const isPlanJoining =
      expenseData.expense_type === "PLAN_EXPENSE" ||
      rawTitle === "Plan Fee" ||
      rawTitle === "Plan Expense" ||
      (!rawTitle && !expenseData.message_id);
    const expTitle = isPlanJoining ? "Plan Fee" : (rawTitle || "Shared Expense");

    // 1. Filter out participants who are not financially included or have no valid expense share
    const activePtsData = participantsData.filter((pt) => {
      const isPayer = pt.user_id === payerUuid || (payerMe && isMe(pt.user_id));
      if (isPayer) return true;

      // Must be financially included (ACTIVE or PAYMENT_KEPT)
      if (hasLoadedPlanParticipants && !financiallyIncludedUserIds.has(pt.user_id)) {
        return false;
      }

      // Non-payer participants with 0 amount_owed and not settled are excluded
      const amountOwed = Number(pt.amount_owed ?? pt.amount ?? 0);
      const ptStatus = String(pt.status || "PENDING").toUpperCase();
      if (amountOwed <= 0 && ptStatus !== "SETTLED") {
        return false;
      }

      return true;
    });

    // Separate Payer row from other confirmed participant rows
    const payerPtIndex = activePtsData.findIndex((pt) =>
      pt.user_id === payerUuid || (payerMe && isMe(pt.user_id))
    );

    let rawOrderedPts: any[] = [];
    if (payerPtIndex !== -1) {
      const payerPt = activePtsData[payerPtIndex];
      const otherPts = activePtsData.filter((_, idx) => idx !== payerPtIndex);
      rawOrderedPts = [payerPt, ...otherPts];
    } else {
      // Edge case: Payer exists in wallet_expenses but is not in activePtsData
      const dummyPayerPt = {
        user_id: payerUuid,
        amount_owed: 0,
        status: "PAID",
        isPayerOnly: true,
      };
      rawOrderedPts = [dummyPayerPt, ...activePtsData];
    }

    let netShare = 0;
    let allSettled = true;

    // 2. Format ordered participants list with Payer ALWAYS at Index 0
    const list = rawOrderedPts.map((pt, index) => {
      const ptIsMe = isMe(pt.user_id);
      const isPayerRow = index === 0; // First item is ALWAYS the payer!
      const isPtExcluded = hasLoadedPlanParticipants && !financiallyIncludedUserIds.has(pt.user_id);
      const u = profMap.get(pt.user_id);

      const amountOwed = Number(pt.amount_owed ?? pt.amount ?? 0);
      const ptStatus = String(pt.status || "PENDING").toUpperCase();
      const isPtSettled = ptStatus === "SETTLED";
      const remaining = isPtSettled ? 0 : amountOwed;

      if (!isPtSettled && !isPayerRow && !pt.isPayerOnly) allSettled = false;

      // Net share calculation:
      if (payerMe && !ptIsMe) {
        netShare += remaining;
      } else if (!payerMe && ptIsMe) {
        netShare -= remaining;
      }

      // Check if participant has left the plan
      // Check if participant has left the plan (rsvp_status === 'SKIPPED')
      const planPartMatch = rawPlanParticipants.find((pp) => pp.user_id === pt.user_id);
      const rsvpSt = String(planPartMatch?.rsvp_status || "").trim().toUpperCase();
      const isLeft = rsvpSt === "SKIPPED";
      const isPk = paymentKeptUserIds.has(pt.user_id);

      // Subtitle / payment direction label
      const formattedAmount = `₹${amountOwed.toLocaleString("en-IN")}`;
      let subtitle = "";
      let sheetSubtitle = "";

      if (isPayerRow) {
        subtitle = ptIsMe ? "Your paid share" : `Paid by ${payerDisplayName}`;
        sheetSubtitle = subtitle;
      } else if (isPk) {
        subtitle = isLeft ? "Payment kept · Left plan" : "Payment kept";
        sheetSubtitle = subtitle;
      } else if (isLeft) {
        subtitle = isPtSettled ? "Left plan · Settled" : "Left plan";
        sheetSubtitle = isPtSettled ? "Left plan · Settled" : `Left plan · ${formattedAmount} owed`;
      } else if (isPtExcluded) {
        subtitle = "Waitlisted";
        sheetSubtitle = subtitle;
      } else if (isPtSettled) {
        subtitle = "Settled up";
        sheetSubtitle = subtitle;
      } else if (payerMe) {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes you`;
        sheetSubtitle = `${u?.full_name || u?.username || "Participant"} owes you ${formattedAmount}`;
      } else if (ptIsMe) {
        subtitle = `You owe ${payerDisplayName}`;
        sheetSubtitle = `You owe ${payerDisplayName} ${formattedAmount}`;
      } else {
        subtitle = `${u?.full_name || u?.username || "Participant"} owes ${payerDisplayName}`;
        sheetSubtitle = `${u?.full_name || u?.username || "Participant"} owes ${payerDisplayName} ${formattedAmount}`;
      }

      return {
        userId: pt.user_id,
        fullName: ptIsMe ? "You" : u?.full_name || u?.username || "Participant",
        profilePhoto: u?.profile_photo_path || "",
        amountOwed,
        status: ptStatus,
        isPtSettled,
        isPtWaitlisted: isPtExcluded,
        isPaymentKept: isPk,
        isMe: ptIsMe,
        isPayer: isPayerRow,
        isPayerOnly: pt.isPayerOnly || false,
        subtitle,
        sheetSubtitle,
      };
    });

    const sortedList = sortExpenseParticipants(list, payerUuid, userPostgresUuid);
    const activeParticipants = sortedList.filter((p) => !p.isPaymentKept);
    const paymentKeptParticipants = sortedList.filter((p) => p.isPaymentKept);

    return {
      expenseTitle: expTitle,
      payerIsMe: payerMe,
      payerUser: pUser,
      payerName: payerDisplayName,
      payerPhoto: pPhoto,
      userNetShare: netShare,
      formattedParticipants: sortedList,
      activeParticipants,
      paymentKeptParticipants,
      isSettled: allSettled || netShare === 0,
    };
  }, [expenseData, participantsData, profMap, userPostgresUuid, financiallyIncludedUserIds, paymentKeptUserIds, hasLoadedPlanParticipants]);

  const isOwed = userNetShare > 0;
  const absNetShare = Math.abs(userNetShare);

  // Compute list of eligible plan participants for Edit Cost picker (strictly JOINED participants + existing expense members)
  const eligibleParticipantsList = useMemo(() => {
    const candidateIds = new Set<string>();

    // 1. Include current expense participants to preserve historical records
    participantsData.forEach((p) => candidateIds.add(p.user_id));

    // 2. Include ONLY plan participants whose current status is JOINED / CONFIRMED / ACCEPTED / HOST
    rawPlanParticipants.forEach((pp) => {
      const st = String(pp.rsvp_status || pp.status || "").trim().toUpperCase();
      if (st === "JOINED" || st === "CONFIRMED" || st === "ACCEPTED" || st === "HOST") {
        candidateIds.add(pp.user_id);
      }
    });

    const list = Array.from(candidateIds).map((uid) => {
      const u = profMap.get(uid);
      return {
        userId: uid,
        name: isMe(uid) ? "You" : u?.full_name || u?.username || "Participant",
        profilePhoto: u?.profile_photo_path || "",
      };
    });

    // Sort: 'You' always first, all other participants alphabetically A -> Z
    return list.sort((a, b) => {
      const aIsMe = isMe(a.userId) || a.name === "You";
      const bIsMe = isMe(b.userId) || b.name === "You";
      if (aIsMe) return -1;
      if (bIsMe) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [participantsData, rawPlanParticipants, profMap, userPostgresUuid]);

  const toggleParticipantSelection = (userId: string) => {
    setEditParticipantIds((prev) => {
      if (prev.includes(userId)) {
        if (prev.length <= 1) {
          setEditError("At least 1 participant must be selected.");
          return prev;
        }
        setEditError(null);
        return prev.filter((id) => id !== userId);
      } else {
        setEditError(null);
        return [...prev, userId];
      }
    });
  };

  // Local-First, Save-on-Close Edit Cost State Cache
  const initialEditTitleRef = useRef("");
  const initialEditAmountRef = useRef("");
  const initialEditParticipantIdsRef = useRef<string[]>([]);

  const handleOpenEditSheet = () => {
    if (!expenseData) return;
    setEditError(null);
    setEditAmountError(false);
    const initTitle = expenseTitle;
    const initAmount = String(expenseData.total_amount || "");
    let initPts = participantsData
      .filter((p) => Number(p.amount_owed ?? p.amount ?? 0) > 0 || String(p.status).toUpperCase() === "SETTLED")
      .map((p) => p.user_id);

    if (initPts.length === 0) {
      initPts = participantsData.map((p) => p.user_id);
    }

    initialEditTitleRef.current = initTitle;
    initialEditAmountRef.current = initAmount;
    initialEditParticipantIdsRef.current = [...initPts];

    setEditTitle(initTitle);
    setEditAmount(initAmount);
    setEditParticipantIds(initPts);
    setShowEditSheet(true);
  };

  const handleCloseEditSheet = async () => {
    if (!expenseData) {
      setShowEditSheet(false);
      setEditError(null);
      setEditAmountError(false);
      return;
    }

    const currentTitle = editTitle.trim();
    const currentAmountParsed = parseFloat(editAmount) || 0;
    const currentPts = editParticipantIds;

    const initialTitle = initialEditTitleRef.current.trim();
    const initialAmountParsed = parseFloat(initialEditAmountRef.current) || 0;
    const initialPts = initialEditParticipantIdsRef.current;

    // 1. If title is empty, keep user inside input state & focus field without red error or default fallback
    if (!currentTitle) {
      editTitleInputRef.current?.focus();
      return;
    }

    let hasValidationError = false;

    // Inline error check: if amount <= 0 or invalid, highlight input & keep sheet open
    if (currentAmountParsed <= 0) {
      setEditAmountError(true);
      hasValidationError = true;
    } else {
      setEditAmountError(false);
    }

    if (hasValidationError) {
      return;
    }

    // Determine if any edits occurred while sheet was open
    const titleChanged = currentTitle !== initialTitle;
    const amountChanged = currentAmountParsed !== initialAmountParsed;
    const ptsChanged =
      currentPts.length !== initialPts.length ||
      !currentPts.every((id) => initialPts.includes(id));

    const hasChanges = titleChanged || amountChanged || ptsChanged;

    if (!hasChanges) {
      setShowEditSheet(false);
      setEditError(null);
      setEditAmountError(false);
      return;
    }

    if (currentPts.length === 0) {
      setEditError("At least 1 participant must be selected.");
      return;
    }

    setSubmittingEdit(true);
    setEditError(null);

    try {
      lastLocalMutationRef.current = Date.now();
      // Single atomic database update upon closing sheet
      await updateWalletExpense({
        expenseId: expenseData.id,
        title: currentTitle,
        totalAmount: currentAmountParsed,
        planId: expenseData.plan_id,
        participantIds: currentPts,
      });

      // Close bottom sheet IMMEDIATELY after successful update so it unmounts before background refreshes
      setShowEditSheet(false);
      setSubmittingEdit(false);

      // Invalidate cache entry & force database refetch
      invalidateExpenseDetailCache(expenseData.id);
      await loadExpenseDetail(true);
      await onRefreshBalances();
      if (refreshPlans) {
        await refreshPlans(["plans", "wallet_expenses"]);
      }
    } catch (err: any) {
      console.error("[ExpenseDetail] Exception persisting edits on close:", err);
      setEditError(err.message || "Failed to save changes.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Delete Expense Handlers
  const handleConfirmDelete = async () => {
    if (!expenseData || submittingDelete) return;

    setSubmittingDelete(true);
    setDeleteError(null);

    try {
      const deletedId = expenseData.id;
      lastLocalMutationRef.current = Date.now();
      deletedExpenseIds.add(deletedId);

      await deleteWalletExpense(deletedId);
      invalidateExpenseDetailCache(deletedId);

      setShowDeleteModal(false);

      // Exit ExpenseDetails screen IMMEDIATELY so parent unmounts it before running background balance refreshes
      onBack();

      // Refresh parent balances asynchronously
      await onRefreshBalances();
      if (refreshPlans) {
        await refreshPlans(["plans", "wallet_expenses"]);
      }
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Exception deleting expense:", err);
      setDeleteError(err.message || "Failed to delete expense.");
      setSubmittingDelete(false);
    }
  };

  // Settle Participant Handler
  const handleOpenSettleModal = (pt: any) => {
    setSelectedSettleParticipant(pt);
    setSettleError(null);
    setShowSettleModal(true);
  };

  const handleConfirmSettle = async () => {
    if (!expenseData || !selectedSettleParticipant || submittingSettle) return;

    setSubmittingSettle(true);
    setSettleError(null);

    try {
      lastLocalMutationRef.current = Date.now();
      const success = await settleWalletExpenseParticipant({
        expenseId: expenseData.id,
        participantUserId: selectedSettleParticipant.userId,
      });

      if (!success) {
        setSettleError("Failed to record settlement.");
        setSubmittingSettle(false);
        return;
      }

      invalidateExpenseDetailCache(expenseData.id);
      setShowSettleModal(false);
      setSelectedSettleParticipant(null);
      await loadExpenseDetail(true);
      await onRefreshBalances();
    } catch (err: any) {
      console.error("[PlanBalancesDetail] Exception settling expense:", err);
      setSettleError(err.message || "Failed to settle expense.");
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Remove Participant Handlers
  const [showRemoveParticipantModal, setShowRemoveParticipantModal] = useState(false);
  const [selectedParticipantForRemove, setSelectedParticipantForRemove] = useState<any | null>(null);
  const [selectedRemoveStrategy, setSelectedRemoveStrategy] = useState<"SPLIT_SHARE" | "KEEP_SAME_SHARE">("SPLIT_SHARE");
  const [removeParticipantError, setRemoveParticipantError] = useState<string | null>(null);
  const [submittingRemoveParticipant, setSubmittingRemoveParticipant] = useState(false);
  const [errorModalConfig, setErrorModalConfig] = useState<{ title: string; message: string } | null>(null);

  const handleOpenRemoveParticipantModal = (pt: any) => {
    if (pt.isPtSettled) {
      setErrorModalConfig({
        title: "Cannot remove settled split",
        message: `${pt.fullName} has already settled this expense. Settled expense history cannot be removed.`,
      });
      return;
    }

    const remainingCount = activeParticipants.filter((p) => !p.isPtWaitlisted).length;
    if (remainingCount <= 1) {
      setErrorModalConfig({
        title: "Cannot remove participant",
        message: "An expense must have at least one participant.",
      });
      return;
    }

    setSelectedParticipantForRemove(pt);
    setSelectedRemoveStrategy("SPLIT_SHARE");
    setRemoveParticipantError(null);
    setShowRemoveParticipantModal(true);
  };

  const handleConfirmRemoveParticipant = async () => {
    if (!expenseData || !selectedParticipantForRemove || submittingRemoveParticipant) return;

    setSubmittingRemoveParticipant(true);
    setRemoveParticipantError(null);

    try {
      lastLocalMutationRef.current = Date.now();
      const res = await removeExpenseParticipant({
        expenseId: expenseData.id,
        participantUserId: selectedParticipantForRemove.userId,
        strategy: selectedRemoveStrategy,
      });

      if (!res.success) {
        setRemoveParticipantError(res.message || "Failed to remove participant.");
        setSubmittingRemoveParticipant(false);
        return;
      }

      invalidateExpenseDetailCache(expenseData.id);
      setShowRemoveParticipantModal(false);
      setSelectedParticipantForRemove(null);
      await loadExpenseDetail(true);
      await onRefreshBalances();
      if (refreshPlans) {
        await refreshPlans(["plans", "wallet_expenses"]);
      }
    } catch (err: any) {
      console.error("[ExpenseDetail] Exception removing participant:", err);
      setRemoveParticipantError(err?.message || "Failed to remove participant.");
    } finally {
      setSubmittingRemoveParticipant(false);
    }
  };

  // Compute data readiness: screen stays in Skeleton state until required expense + user profiles data are ready
  const isDataReady = useMemo(() => {
    if (!expenseData) return false;
    if (getInitialCache()) return true;
    if (loading) return false;

    // Check if user profiles for payer + participants are loaded
    const payerId = expenseData.payer_id;
    const participantUids = (participantsData || []).map((p: any) => p.user_id || p.userId || p.id).filter(Boolean);
    const requiredUserIds = Array.from(new Set([payerId, ...participantUids].filter(Boolean)));

    if (requiredUserIds.length > 0 && userProfiles.length === 0) {
      return false;
    }

    return true;
  }, [expenseData, participantsData, userProfiles, loading]);

  if (!isDataReady) {
    return (
      <div className="w-full h-full flex flex-col justify-between overflow-y-auto scrollbar-none px-6 pt-3 animate-fade-in text-left bg-[#050505] pb-20 select-none">
        <div className="space-y-6">
          {/* Header Row: Back button */}
          <div className="pb-1.5 pt-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 border border-zinc-900/60 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-full bg-zinc-900/40 border border-white/[0.04] animate-pulse" />
          </div>

          {/* Hero Section Skeleton: Title, Payer Avatar, Payer Name, Amount */}
          <div className="flex flex-col items-center text-center py-4 space-y-3 shrink-0 animate-pulse">
            {/* Title Skeleton */}
            <div className="w-40 h-6 bg-zinc-800/80 rounded-full" />

            {/* Payer Avatar Skeleton */}
            <div className="w-16 h-16 rounded-full bg-zinc-800/80 shrink-0 mt-1" />

            {/* Payer Name Skeleton */}
            <div className="w-32 h-4 bg-zinc-800/80 rounded-full" />

            {/* Paid Amount Skeleton */}
            <div className="w-24 h-3 bg-zinc-800/50 rounded-full" />
          </div>

          {/* Participants List Section Skeleton */}
          <div className="space-y-3 pt-2">
            <div className="w-24 h-3 bg-zinc-900/80 rounded-full animate-pulse" />

            {/* 3 Participant Row Skeletons */}
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-full bg-zinc-950/40 border border-white/[0.04] rounded-[20px] p-4 flex items-center justify-between animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800/80 shrink-0" />
                    <div className="space-y-2">
                      <div className="w-28 h-3.5 bg-zinc-800/80 rounded-full" />
                      <div className="w-36 h-2.5 bg-zinc-800/50 rounded-full" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-zinc-800/80 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !expenseData) {
    return (
      <div className="w-full h-full flex flex-col bg-[#050505] text-white p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-900/60"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-sans font-bold text-zinc-100">
            Plan balances Detail
          </h2>
        </div>
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
          {error || "Expense not found"}
        </div>
      </div>
    );
  }

  return (
    <div
      id="subview_plan_balances_detail"
      className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-24 text-left bg-[#050505] select-none animate-fade-in"
    >
      {/* TOP NAVIGATION BAR WITH PLAN NAME CENTERED */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Center: Contextual Plan Name */}
        {planData?.title ? (
          <span className="text-xs font-sans font-medium text-zinc-400 tracking-wide truncate max-w-[220px] text-center px-2">
            {planData.title}
          </span>
        ) : (
          <div />
        )}

        {/* Right: Top-Right Single Subtle "More" Action Button (Payer Permission Only) */}
        {payerIsMe ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowActionMenu((prev) => !prev)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-900/60 transition cursor-pointer"
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {/* Action Menu Dropdown */}
            {showActionMenu && (
              <>
                {/* Backdrop to close menu on click outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowActionMenu(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-44 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md animate-fade-in space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      handleOpenEditSheet();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-zinc-900 text-xs font-medium text-zinc-200 hover:text-white transition cursor-pointer text-left"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Edit Expense</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/10 text-xs font-medium text-rose-400 hover:text-rose-300 transition cursor-pointer text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Delete Expense</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-8 shrink-0" />
        )}
      </div>

      {/* EXPENSE SUMMARY SECTION — DIRECTLY ON PAGE BACKGROUND */}
      <div className="flex flex-col items-center text-center pt-2 pb-6 space-y-1.5 mb-2">
        {/* 1. Expense Title */}
        <h3 className="font-sans font-bold text-2xl text-zinc-100 leading-snug">
          {expenseTitle}
        </h3>

        {/* 2. Centered Payer Avatar */}
        <div className="pt-2 pb-0.5">
          <UserAvatar
            src={payerIsMe ? (userProfile?.profile_photo_path || payerPhoto) : payerPhoto}
            alt={payerName}
            size="w-16 h-16"
            className="ring-2 ring-white/10 shadow-lg mx-auto"
          />
        </div>

        {/* 3. Payer Name */}
        <h4 className="font-sans font-semibold text-base text-zinc-100 leading-tight">
          {payerName}
        </h4>

        {/* 4. Total Amount Paid */}
        <p className="text-zinc-400 font-sans text-xs font-medium leading-tight">
          Paid ₹{Number(expenseData.total_amount || 0).toLocaleString("en-IN")}
        </p>
      </div>

      {/* UNIFIED PARTICIPANTS LIST — DIRECTLY BELOW EXPENSE CARD */}
      <div className="space-y-0.5">
        {formattedParticipants.map((pt) => {
          const isRowMuted = pt.isPtSettled || pt.isPayer || pt.isPtWaitlisted;

          return (
            <div
              key={`${pt.userId}-${pt.isPayer ? 'payer' : 'pt'}`}
              onClick={() => handleParticipantClick(pt)}
              className={`py-3.5 flex items-center justify-between text-left px-1 select-none hover:bg-white/[0.02] active:bg-white/[0.04] transition-all cursor-pointer rounded-xl ${
                isRowMuted ? "opacity-60" : "opacity-100"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <UserAvatar
                  src={pt.profilePhoto}
                  alt={pt.fullName}
                  size="w-10 h-10"
                  className={`shrink-0 ${isRowMuted ? "grayscale-30" : "ring-1 ring-white/10"}`}
                />

                <div className="min-w-0 flex flex-col justify-center">
                  <h5 className={`font-sans text-[13.5px] truncate leading-tight ${
                    isRowMuted ? "font-medium text-zinc-400" : "font-semibold text-white"
                  }`}>
                    {pt.fullName}
                  </h5>
                  <span className={`text-[11px] font-sans block truncate leading-tight mt-0.5 ${
                    isRowMuted ? "font-normal text-zinc-550" : "font-medium text-zinc-300"
                  }`}>
                    {pt.subtitle}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {(() => {
                  let displayAmt = 0;
                  if (pt.isPayer) {
                    const totalOwedByOthers = formattedParticipants
                      .filter((p) => !p.isPayer && !p.isPtWaitlisted)
                      .reduce((sum, p) => sum + (p.amountOwed || 0), 0);
                    const totalCost = Number(expenseData.total_amount || 0);
                    displayAmt = Math.max(0, totalCost - totalOwedByOthers);
                  } else {
                    displayAmt = pt.isPtWaitlisted ? 0 : Number(pt.amountOwed || 0);
                  }

                  return (
                    <span className={`font-sans text-sm tracking-tight ${
                      isRowMuted ? "font-semibold text-zinc-400" : "font-bold text-white"
                    }`}>
                      ₹{displayAmt.toLocaleString("en-IN")}
                    </span>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT COST BOTTOM SHEET COMPONENT */}
      <EditCost
        isOpen={showEditSheet}
        selectedExpense={{
          id: expenseId,
          expenseTitle,
          totalAmount: expenseData?.total_amount || 0,
          planId: expenseData?.plan_id,
          participantIds: participantsData.map((pt: any) => pt.user_id || pt.id).filter(Boolean),
          participants: participantsData,
        }}
        onClose={() => setShowEditSheet(false)}
        onOptimisticUpdate={(opt) => {
          lastLocalMutationRef.current = Date.now();
          if (opt.participantIds.length > 0 && opt.totalAmount > 0) {
            const count = opt.participantIds.length;
            const totalCents = Math.round(opt.totalAmount * 100);
            const baseCents = Math.floor(totalCents / count);
            let remainderCents = totalCents - baseCents * count;

            const sharesMap: Record<string, number> = {};
            opt.participantIds.forEach((uid) => {
              let extra = 0;
              if (remainderCents > 0) {
                extra = 1;
                remainderCents -= 1;
              }
              sharesMap[uid] = (baseCents + extra) / 100;
            });

            const updatedParticipants = opt.participantIds.map((uid: string) => {
              const share = sharesMap[uid] || 0;
              const existing = (participantsData || []).find((p: any) => p.user_id === uid);
              if (existing) {
                return { ...existing, amount: share, amount_owed: share };
              }
              const prof = userProfiles.find((u: any) => u.id === uid);
              return {
                user_id: uid,
                expense_id: opt.expenseId,
                amount: share,
                amount_owed: share,
                name: prof?.full_name || prof?.username || "Participant",
                avatar: prof?.profile_photo_path || "",
              };
            });

            // Update canonical WalletContext store optimistically
            updateExpenseInStore(opt.expenseId, {
              title: opt.title,
              total_amount: opt.totalAmount,
              plan_id: opt.planId,
              participants: updatedParticipants,
            });

            // Update in-memory expense detail cache directly with new values
            updateExpenseDetailCache(opt.expenseId, {
              title: opt.title,
              total_amount: opt.totalAmount,
              plan_id: opt.planId,
              participants: updatedParticipants,
            });

            // Update local state atomically
            setExpenseData((prev: any) =>
              prev ? { ...prev, title: opt.title, total_amount: opt.totalAmount } : prev
            );

            setParticipantsData(updatedParticipants);

            setFinanciallyIncludedUserIds((prevSet) => {
              const nextSet = new Set(prevSet);
              opt.participantIds.forEach((uid) => nextSet.add(uid));
              return nextSet;
            });
          }
        }}
        onRefreshBalances={async () => {
          invalidateExpenseDetailCache(expenseId);
          await loadExpenseDetail(true);
          onRefreshBalances();
        }}
        activeUserId={userPostgresUuid || activeUserId}
        relevantPlans={planData ? [{ id: planData.id, title: planData.title }] : []}
        dbPlanParticipants={rawPlanParticipants}
        dbProfiles={userProfiles}
      />

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            if (!submittingDelete) {
              setShowDeleteModal(false);
              setDeleteError(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-sans font-bold text-white">Delete Expense?</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-semibold">{expenseTitle}</strong>?
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-xs font-sans font-semibold text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-sans font-semibold text-white transition cursor-pointer disabled:opacity-50"
              >
                {submittingDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTLE PARTICIPANT MODAL */}
      {showSettleModal && selectedSettleParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => {
            if (!submittingSettle) {
              setShowSettleModal(false);
              setSelectedSettleParticipant(null);
              setSettleError(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-sans font-bold text-white">Record Settlement</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">{selectedSettleParticipant.fullName}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Mark ₹{selectedSettleParticipant.amountOwed.toLocaleString("en-IN")} from <strong className="text-white font-semibold">{selectedSettleParticipant.fullName}</strong> as settled?
            </p>

            {settleError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                {settleError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={submittingSettle}
                onClick={() => {
                  setShowSettleModal(false);
                  setSelectedSettleParticipant(null);
                  setSettleError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-xs font-sans font-semibold text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingSettle}
                onClick={handleConfirmSettle}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-sans font-semibold text-white transition cursor-pointer disabled:opacity-50"
              >
                {submittingSettle ? "Settling..." : "Confirm Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTICIPANT ACTIONS BOTTOM SHEET */}
      {showParticipantActionSheet && selectedParticipantForAction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            setShowParticipantActionSheet(false);
            setSelectedParticipantForAction(null);
          }}
        >
          <div
            className="w-full bg-[#1c1c1e] border-t border-white/[0.08] rounded-t-3xl p-6 pb-8 shadow-2xl space-y-4 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle Indicator */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-2" />

            {/* Header: Avatar, Name & Subtitle */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-white/[0.06]">
              <UserAvatar
                src={selectedParticipantForAction.profilePhoto}
                alt={selectedParticipantForAction.fullName}
                size="w-11 h-11"
                className="shrink-0 ring-1 ring-white/10"
              />
              <div className="min-w-0 flex flex-col justify-center">
                <h3 className="text-base font-sans font-semibold text-white truncate leading-tight">
                  {selectedParticipantForAction.fullName}
                </h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5 truncate leading-tight">
                  {selectedParticipantForAction.sheetSubtitle || selectedParticipantForAction.subtitle}
                </p>
              </div>
            </div>

            {/* Actions List: Only Settle and Cancel */}
            <div className="space-y-2.5 pt-1">
              {/* 1. Settle — Green */}
              <button
                type="button"
                onClick={() => {
                  const pt = selectedParticipantForAction;
                  setShowParticipantActionSheet(false);
                  handleOpenSettleModal(pt);
                }}
                disabled={selectedParticipantForAction.isPtSettled}
                className={`w-full h-13 flex items-center px-4 rounded-2xl text-sm font-semibold transition cursor-pointer text-left ${
                  selectedParticipantForAction.isPtSettled
                    ? "bg-zinc-900/40 border border-white/[0.04] text-zinc-600 cursor-not-allowed"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400"
                }`}
              >
                <span>
                  {selectedParticipantForAction.isPtSettled ? "Settled" : "Settle"}
                </span>
              </button>

              {/* 2. Cancel — Simple centered text action without background or border */}
              <button
                type="button"
                onClick={() => {
                  setShowParticipantActionSheet(false);
                  setSelectedParticipantForAction(null);
                }}
                className="w-full pt-3 pb-1 text-center text-sm font-medium text-zinc-400 hover:text-white transition cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REMOVE PARTICIPANT CONFIRMATION BOTTOM SHEET WITH STRATEGY OPTIONS */}
      {showRemoveParticipantModal && selectedParticipantForRemove && (() => {
        const activePts = activeParticipants.filter((p) => !p.isPtWaitlisted);
        const currentTotal = Number(expenseData.total_amount || 0);
        const remainingCount = Math.max(1, activePts.length - 1);

        const targetPtShare = selectedParticipantForRemove.amountOwed > 0
          ? selectedParticipantForRemove.amountOwed
          : Math.round(currentTotal / (activePts.length || 1));

        // Option A: Split their share
        const optionATotal = currentTotal;
        const optionAShare = Math.round((currentTotal / remainingCount) * 100) / 100;

        // Option B: Keep the same share
        const otherPts = activePts.filter((p) => p.userId !== selectedParticipantForRemove.userId);
        const remainingExistingShareSum = otherPts.reduce((acc, p) => acc + (p.amountOwed || 0), 0);
        const optionBShare = targetPtShare;
        const optionBTotal = remainingExistingShareSum > 0
          ? remainingExistingShareSum
          : Math.max(0, currentTotal - targetPtShare);

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in p-0 sm:p-4"
            onClick={() => {
              if (!submittingRemoveParticipant) {
                setShowRemoveParticipantModal(false);
                setSelectedParticipantForRemove(null);
              }
            }}
          >
            <div
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-4 text-left font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sheet Handle Indicator */}
              <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-1 sm:hidden" />

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-tight font-sans">
                  Remove {selectedParticipantForRemove.fullName}?
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  What should happen to {selectedParticipantForRemove.fullName}’s ₹{targetPtShare.toLocaleString("en-IN")} share?
                </p>
              </div>

              {/* Strategy Options */}
              <div className="space-y-3 pt-1">
                {/* Option A: Split their share */}
                <button
                  type="button"
                  onClick={() => setSelectedRemoveStrategy("SPLIT_SHARE")}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                    selectedRemoveStrategy === "SPLIT_SHARE"
                      ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white">Split their share</span>
                    {selectedRemoveStrategy === "SPLIT_SHARE" && (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">Everyone remaining shares it.</p>
                  <p className="text-xs font-medium text-emerald-400 font-mono pt-1">
                    ₹{optionATotal.toLocaleString("en-IN")} total · ₹{optionAShare.toLocaleString("en-IN")} each
                  </p>
                </button>

                {/* Option B: Keep the same share */}
                <button
                  type="button"
                  onClick={() => setSelectedRemoveStrategy("KEEP_SAME_SHARE")}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                    selectedRemoveStrategy === "KEEP_SAME_SHARE"
                      ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white">Keep the same share</span>
                    {selectedRemoveStrategy === "KEEP_SAME_SHARE" && (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">Remaining people keep their current share.</p>
                  <p className="text-xs font-medium text-emerald-400 font-mono pt-1">
                    ₹{optionBTotal.toLocaleString("en-IN")} total · ₹{optionBShare.toLocaleString("en-IN")} each
                  </p>
                </button>
              </div>

              {removeParticipantError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                  {removeParticipantError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={submittingRemoveParticipant}
                  onClick={() => {
                    setShowRemoveParticipantModal(false);
                    setSelectedParticipantForRemove(null);
                  }}
                  className="flex-1 h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-xs hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingRemoveParticipant}
                  onClick={handleConfirmRemoveParticipant}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white font-semibold text-xs hover:bg-rose-500 active:scale-[0.99] disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                >
                  {submittingRemoveParticipant ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* GENERIC ERROR / VALIDATION MODAL */}
      {errorModalConfig && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in p-0 sm:p-4"
          onClick={() => setErrorModalConfig(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-4 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight font-sans">
                {errorModalConfig.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {errorModalConfig.message}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setErrorModalConfig(null)}
                className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-semibold text-xs hover:bg-zinc-800 transition cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PlanBalancesDetail = ExpenseDetails;
