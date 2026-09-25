import React, { useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Bell, Users, Plus, Home, Calendar, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile, Plan, Transaction, DbPlan, DbPlanParticipant, DbTransaction, DbPlanOutcome, NotificationItem } from "./core/types";
import { getInitialsAvatar, mapTransactionsToLegacy } from "../lib/mappers";
import { syncUserStats, insertTransaction } from "../lib/db";
import { usePlansStore } from "./features/plans/state/PlansContext";
import { useProfileStore } from "./features/profile/state/ProfileContext";
import { useWalletStore } from "./features/wallet/state/WalletContext";
import { useFriendshipStore } from "./features/friendships/state/FriendshipContext";
import { WalletScreen } from "./features/wallet/screens/WalletScreen";
import { HomeScreen } from "./features/home/screens/HomeScreen";
import { PlansScreen } from "./features/plans/screens/PlansScreen/PlansScreen";
import { CreatePlanScreen } from "./features/create/screens/Create";
import { CreateMVP } from "./features/create/screens/CreateMVP";
import { ProfileScreen } from "./features/profile/screens/ProfileScreen";
import { FriendshipsScreen } from "./features/friendships/screens/FriendshipsScreen";
import DetailedPlanModal from "./components/common screens/DetailedPlanModal";
import { getPlanCover } from "./features/plans/config/planCoverImages";
import DepositCashModal from "./shared/modals/DepositCashModal";
import PaymentConfirmationModal from "./shared/modals/PaymentConfirmationModal";
import ReservationSuccessModal from "./shared/modals/ReservationSuccessModal";
import { NavigationFooter } from "./components/NavigationFooter";
import { HomeHeader } from "./components/HomeHeader";

import { useLivePlan } from "./features/plans/hooks/useLivePlan";
import { getPlanSlug, findPlanBySlugOrId } from "./features/plans/utils/planSlugUtils";
import { SearchYourPlansScreen } from "./features/plans/screens/PlansScreen/SearchYourPlansScreen";
import { HostedPlansScreen } from "./features/plans/screens/PlansScreen/HostedPlansScreen";
import { PastPlans } from "./features/profile/screens/PastPlans";
import { ChatsScreen } from "./features/chats/screens/ChatsScreen";
import { PlanChatScreen } from "./features/chats/screens/PlanChatScreen";
import { useUnreadChatsCount } from "./features/chats/hooks/useUnreadChatsCount";
import {
  parseCurrentRoute,
  navigateToRoute,
  listenToNavigation,
} from "./features/navigation/appRouter";
import { getSavedCreatePlanDraft } from "./features/create/utils/draftParticipantStorage";
import {
  claimPlanInviteRPC,
  clearStoredPendingInviteToken,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  extractInviteTokenFromPath,
  resolveInviteDestination,
} from "./features/plans/services/planInviteService";
import { tabVariants, screenModalVariants } from "./shared/transitions/motionTokens";

interface MainAppProps {
  userProfile: UserProfile;
  onLogout: () => void;
  activeUserId: string;
  pendingInviteToken?: string | null;
  onClearPendingInvite?: () => void;
}

export default function MainApp({
  userProfile,
  onLogout,
  activeUserId,
  pendingInviteToken,
  onClearPendingInvite,
}: MainAppProps) {
  // --- Decoupled Context Stores ---
  const { plans, dbPlans, setDbPlans, dbPlanParticipants, setDbPlanParticipants, dbPlanOutcomes, setDbPlanOutcomes, dbPlanTeamAssignments, setDbPlanTeamAssignments, joinPlan, waitlistPlan, passPlan, submitReview, submitStats, submitMvp, updatePlanDetails, cancelPlan, getHomeFeedPlans, dbMemories, dbMemoryResults, refreshPlans } = usePlansStore();
  const { dbUsers, setDbUsers, updateProfile, activeUserUuid } = useProfileStore();  const { walletBalance, transactions, dbTransactions, setDbTransactions, refreshTransactions } = useWalletStore();
  const { friends } = useFriendshipStore();

  const initialRoute = React.useMemo(() => parseCurrentRoute(), []);

  // --- Core Navigation Tab state ---
  // Always start on "home" — never restore last visited tab from localStorage.
  // Tab persistence across reloads was causing users to land on non-home screens
  // after login, logout, or session recovery, which breaks expected app behavior.
  const [activeTab, setActiveTab] = useState<any>(() => {
    if (initialRoute.tab) return initialRoute.tab;
    return "home";
  });
  // Determine whether the initial route should be a full-screen flow without bottom nav
  const isFullScreenRoute = React.useCallback((route: typeof initialRoute): boolean => {
    if (route.selectedPlanId) return true;
    if (route.selectedChatPlanId) return true;
    if (route.tab === "create") {
      // In Create flow: category screen has bottom nav; wizard screens (who, who-actually, when, review, confirmation) do not
      if (route.createPhase && route.createPhase !== "category") return true;
    }
    return false;
  }, []);

  const [childrenWantBottomNavHidden, setChildrenWantBottomNavHidden] = useState(() => {
    return isFullScreenRoute(initialRoute);
  });

  // --- Shared Overlays & Interactive States ---
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    return initialRoute.selectedPlanId || null;
  });
  const [selectedPlanSource, setSelectedPlanSource] = useState<"list" | "chat" | "deep_link" | string>("list");
  const [selectedChatPlanId, setSelectedChatPlanId] = useState<string | null>(() => {
    return initialRoute.selectedChatPlanId || null;
  });

  // Clean up any stale selected plan id in localStorage on root routes
  React.useEffect(() => {
    if (!initialRoute.selectedPlanId) {
      localStorage.removeItem("planless_selected_plan_id");
    }
  }, [initialRoute.selectedPlanId]);

  const [isTrackerExpanded, setIsTrackerExpanded] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(() => {
    return pendingInviteToken || initialRoute.inviteToken || getStoredPendingInviteToken() || null;
  });

  const handleTabChange = React.useCallback((tab: any) => {
    setChildrenWantBottomNavHidden(false);
    setActiveTab(tab);
  }, []);

  const prevTabRef = useRef(activeTab);
  React.useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setChildrenWantBottomNavHidden(false);
    }
  }, [activeTab]);

  // Synchronize route and URL with activeTab, selectedPlanId, and selectedChatPlanId
  const isFirstRouteSync = React.useRef(true);
  React.useEffect(() => {
    localStorage.setItem("planless_active_tab", activeTab);
    if (activeTab !== "create") {
      const isInitial = isFirstRouteSync.current;
      isFirstRouteSync.current = false;
      if (selectedPlanId) {
        localStorage.setItem("planless_selected_plan_id", selectedPlanId);
        // Resolve readable slug from plan if available
        const matchedPlan = findPlanBySlugOrId(plans, selectedPlanId);
        const routePlanParam = matchedPlan ? (matchedPlan.slug || getPlanSlug(matchedPlan, plans)) : selectedPlanId;
        navigateToRoute({ tab: activeTab, selectedPlanId: routePlanParam }, { replace: isInitial });
      } else if (activeTab === "chats" && selectedChatPlanId) {
        localStorage.removeItem("planless_selected_plan_id");
        navigateToRoute({ tab: "chats", selectedChatPlanId }, { replace: isInitial });
      } else {
        localStorage.removeItem("planless_selected_plan_id");
        // On initial load, preserve /join/:token so it isn't prematurely replaced by /home
        if (isInitial && (initialRoute.inviteToken || pendingInviteToken)) {
          return;
        }
        navigateToRoute({ tab: activeTab }, { replace: isInitial });
      }
    }
  }, [activeTab, selectedPlanId, selectedChatPlanId, plans, initialRoute.inviteToken, pendingInviteToken]);

  // Listen for external / popstate route changes
  React.useEffect(() => {
    const unsubscribe = listenToNavigation((route) => {
      if (route.tab && route.tab !== activeTab) {
        setActiveTab(route.tab);
      }

      // Synchronize selectedPlanId with route
      if (route.tab === "plans" || route.tab === "home") {
        const targetPlanId = route.selectedPlanId || null;
        if (targetPlanId !== selectedPlanId) {
          setSelectedPlanId(targetPlanId);
        }
      } else if (selectedPlanSource === "list") {
        if (selectedPlanId) {
          setSelectedPlanId(null);
        }
      }

      // Synchronize selectedChatPlanId with route
      const targetChatId = route.tab === "chats" ? (route.selectedChatPlanId || null) : null;
      if (targetChatId !== selectedChatPlanId) {
        setSelectedChatPlanId(targetChatId);
      }

      // Synchronize invite token with active card and allow processing if navigating to invite link while open
      if (route.inviteToken) {
        const cleanToken = route.inviteToken.trim();
        setActiveCardId(cleanToken);
        setStoredPendingInviteToken(cleanToken);
        processedTokensRef.current.delete(cleanToken);
      }

      // If returning to a main/root route, reset childrenWantBottomNavHidden immediately
      const isRoot =
        route.tab === "home" ||
        (route.tab === "plans" && !route.selectedPlanId) ||
        (route.tab === "chats" && !route.selectedChatPlanId) ||
        (route.tab === "create" && (!route.createPhase || route.createPhase === "category")) ||
        route.tab === "profile";

      if (isRoot) {
        setChildrenWantBottomNavHidden(false);
      }
    });
    return unsubscribe;
  }, [activeTab, selectedPlanId, selectedChatPlanId]);

  // --- Process shared plan invite token based on participant state ---
  const isResolvingInviteRef = useRef(false);
  const processedTokensRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const tokenToProcess = pendingInviteToken || getStoredPendingInviteToken();
    console.log('[INVITE_TRACE] MainApp processInvite useEffect: pendingInviteToken=', pendingInviteToken, '| storageToken=', getStoredPendingInviteToken(), '| resolved=', tokenToProcess, '| dbUuid=', userProfile?.dbUuid, '| activeUserId=', activeUserId);
    if (!tokenToProcess) return;
    if (processedTokensRef.current.has(tokenToProcess) || isResolvingInviteRef.current) {
      console.log('[INVITE_TRACE] MainApp processInvite: SKIPPED (already processed or in-flight). processed=', processedTokensRef.current.has(tokenToProcess), 'in-flight=', isResolvingInviteRef.current);
      return;
    }

    isResolvingInviteRef.current = true;

    const processInvite = async () => {
      try {
        // Mark as processed inside the try block so transient failures allow retry.
        // isResolvingInviteRef above still prevents concurrent duplicate attempts.
        processedTokensRef.current.add(tokenToProcess);
        const userUuid = userProfile?.dbUuid || activeUserId;
        console.log('[INVITE_TRACE] MainApp processInvite: calling resolveInviteDestination with planId=', tokenToProcess, 'userUuid=', userUuid);
        const resolution = await resolveInviteDestination(tokenToProcess, userUuid);
        console.log('[INVITE_TRACE] MainApp processInvite: resolveInviteDestination result=', JSON.stringify(resolution));

        if (resolution.destination === "PLAN_PREVIEW") {
          // Cases 3, 4, 5, 6: Existing JOINED / WAITLISTED / SKIPPED / HOST
          // Do not claim/reset/update their state. Open specific Plan Preview screen.
          onClearPendingInvite?.();
          clearStoredPendingInviteToken();

          await refreshPlans();

          const targetPlanId = resolution.planId || tokenToProcess;
          setSelectedPlanSource("deep_link");
          setSelectedPlanId(targetPlanId);
          setActiveTab("plans");
          navigateToRoute({ tab: "plans", selectedPlanId: targetPlanId }, { replace: true });
        } else if (resolution.destination === "HOME") {
          // Case 1 (new participant claimed) & Case 2 (existing INVITED participant)
          const targetPlanId = resolution.planId || tokenToProcess;
          setActiveCardId(targetPlanId);

          await refreshPlans();

          onClearPendingInvite?.();
          clearStoredPendingInviteToken();

          setSelectedPlanId(null);
          setActiveTab("home");
          setActiveCardId(targetPlanId);
          navigateToRoute({ tab: "home" }, { replace: true });
        } else {
          // Inactive / invalid / expired / not found
          console.warn("[MainApp] Invite resolution failed or inactive plan:", resolution.error);
          onClearPendingInvite?.();
          clearStoredPendingInviteToken();
          setActiveCardId(null);
          navigateToRoute({ tab: "home" }, { replace: true });
        }
      } catch (err) {
        console.error("[MainApp] Unexpected error resolving invite destination:", err);
        processedTokensRef.current.delete(tokenToProcess);
      } finally {
        isResolvingInviteRef.current = false;
      }
    };

    processInvite();
  }, [pendingInviteToken, onClearPendingInvite, refreshPlans, setActiveTab, userProfile, activeUserId]);

  // Snooze and Auto-Pass overrides
  const [interestedPlanIds, setInterestedPlanIds] = useState<string[]>([]);
  const [snoozedPlanIds, setSnoozedPlanIds] = useState<string[]>([]);
  const [skippedByPlanId, setSkippedByPlanId] = useState<Record<string, string[]>>({});
  const [reminderSentPlanIds, setReminderSentPlanIds] = useState<string[]>([]);

  // Checkout splits overlay
  const [paymentConfirmationPlanId, setPaymentConfirmationPlanId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showPaymentSuccessId, setShowPaymentSuccessId] = useState<string | null>(null);
  const [showWaitlistSuccessId, setShowWaitlistSuccessId] = useState<string | null>(null);
  const [showLeftSuccessId, setShowLeftSuccessId] = useState<string | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [plansFilter, setPlansFilter] = useState<'JOINED' | 'WAITLISTED' | 'SKIPPED' | 'hosted'>('JOINED');
  const [showHostedPlansScreen, setShowHostedPlansScreen] = useState(false);
  const [showPastPlansScreen, setShowPastPlansScreen] = useState(false);
  const [pastPlansOrigin, setPastPlansOrigin] = useState<"profile" | "hosted">("profile");
  const [plansScrollY, setPlansScrollY] = useState(0);
  const [showPlansSearchScreen, setShowPlansSearchScreen] = useState(false);
  const [plansSearchOrigin, setPlansSearchOrigin] = useState<"plans" | "hosted">("plans");
  const [showFriendsScreen, setShowFriendsScreen] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  // Track the origin context when entering a plan chat
  const [chatOriginContext, setChatOriginContext] = useState<{
    type: "chats" | "plan";
    planId?: string;
    planSource?: string;
    previousTab?: string;
  } | null>(null);

  // Reset sub-screens when changing tabs
  React.useEffect(() => {
    if (activeTab !== "profile") {
      setShowFriendsScreen(false);
    }
    if (activeTab !== "plans" && activeTab !== "profile") {
      setShowPastPlansScreen(false);
    }
    if (activeTab !== "plans") {
      setShowHostedPlansScreen(false);
      setShowPlansSearchScreen(false);
    }
    if (activeTab !== "chats" && !chatOriginContext) {
      setSelectedChatPlanId(null);
    }
  }, [activeTab, chatOriginContext]);

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Derive live plan references from active state IDs
  const selectedPlan = useLivePlan(selectedPlanId);
  const paymentConfirmationPlan = useLivePlan(paymentConfirmationPlanId);
  const showPaymentSuccess = useLivePlan(showPaymentSuccessId);
  const showWaitlistSuccess = useLivePlan(showWaitlistSuccessId);

  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);

  const homeFeedRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(activeUserId)) {
      setIsInitialLoadComplete(true);
      return;
    }
    async function syncData() {
      try {
        // MainApp only loads/validates the active user's own profile at launch
        const { data: userData, error: userError } = await (supabase as any)
          .from("users")
          .select("*")
          .eq("id", activeUserId)
          .maybeSingle();

        if (userError) {
          console.error("Failed to load user profile at startup:", userError);
        } else if (userData) {
          setDbUsers(prev => {
            if (prev.some(u => u.id === userData.id)) {
              return prev.map(u => u.id === userData.id ? userData : u);
            }
            return [...prev, userData];
          });
        }
      } catch (err) {
        console.error("Failed to fetch initial user profile:", err);
      } finally {
        setIsInitialLoadComplete(true);
      }
    }
    syncData();
  }, [activeUserId]);

  // Synchronize all loaded user profiles into the global dbUsers state
  React.useEffect(() => {
    const profilesToSync: any[] = [];
    const seen = new Set<string>();

    // 1. Host profiles from plans
    dbPlans.forEach((p: any) => {
      if (p.host_profile && !seen.has(p.host_profile.id)) {
        seen.add(p.host_profile.id);
        profilesToSync.push(p.host_profile);
      }
    });

    // 2. Participant profiles from plan participants
    dbPlanParticipants.forEach((pp: any) => {
      if (pp.user_profile && !seen.has(pp.user_profile.id)) {
        seen.add(pp.user_profile.id);
        profilesToSync.push(pp.user_profile);
      }
    });

    // 3. Friend profiles from friendship context
    friends.forEach((f: any) => {
      if (f.friend && f.friend.id && !seen.has(f.friend.id)) {
        seen.add(f.friend.id);
        profilesToSync.push({
          id: f.friend.id,
          public_id: f.friend.user_id,
          full_name: f.friend.full_name,
          profile_photo_path: f.friend.profile_photo || f.friend.profile_photo_path,
          bio: f.friend.bio
        });
      }
    });

    if (profilesToSync.length > 0) {
      setDbUsers((prev) => {
        let changed = false;
        const updated = [...prev];
        profilesToSync.forEach((prof) => {
          const matchIndex = updated.findIndex((u) => u.id === prof.id);
          if (matchIndex > -1) {
            const existing = updated[matchIndex];
            const newPhoto = prof.profile_photo_path || prof.profile_photo || existing.profile_photo_path;
            if (
              existing.full_name !== prof.full_name ||
              existing.profile_photo_path !== newPhoto
            ) {
              updated[matchIndex] = {
                ...existing,
                full_name: prof.full_name,
                profile_photo_path: newPhoto,
                profile_photo: newPhoto
              };
              changed = true;
            }
          } else {
            const photoVal = prof.profile_photo_path || prof.profile_photo || "";
            updated.push({
              id: prof.id,
              user_id: prof.public_id || prof.user_id || "U001",
              username: prof.username || (prof.full_name || "").toLowerCase().replace(/\s+/g, ""),
              full_name: prof.full_name || "Participant",
              phone_number: prof.phone_number || "",
              profile_photo: photoVal,
              profile_photo_path: photoVal,
              bio: prof.bio || "",
              college_or_work: prof.college_or_work || "",
              created_at: prof.created_at || new Date().toISOString(),
              wallet_balance: prof.wallet_balance || 0,
              active_status: prof.active_status !== undefined ? prof.active_status : true,
              profile_completed: prof.profile_completed || false
            });
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }
  }, [dbPlans, dbPlanParticipants, friends, setDbUsers]);


  // Snooze swipe vertical snooze actions
  const handleSnoozePlan = (planId: string) => {
    setSnoozedPlanIds(prev => [...prev, planId]);
  };

  // Write state changes to localStorage
  React.useEffect(() => {
    localStorage.setItem("planless_active_tab", activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    if (selectedPlanId) {
      localStorage.setItem("planless_selected_plan_id", selectedPlanId);
    } else if (isInitialLoadComplete) {
      localStorage.removeItem("planless_selected_plan_id");
    }
  }, [selectedPlanId, isInitialLoadComplete]);



  // Checkin join toggle
  const handleToggleJoin = async (planId: string): Promise<boolean> => {
    try {
      const plan = plans.find(p => p.id === planId);
      if (!plan) return false;
      await joinPlan(plan.id, userProfile);
      await refreshTransactions();
      return true;
    } catch (err) {
      console.error("[handleToggleJoin] Error joining plan:", err);
      return false;
    }
  };

  // Cash deposits
  const handleDepositMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return;
    }

    // Resolve UUID for receiver before writing to DB
    const meDepUser = dbUsers.find(u => u.user_id === activeUserId);
    const meDepUuid = meDepUser?.id || activeUserUuid || activeUserId;
    const newDbTx = {
      transaction_id: `T_dep_${Date.now()}`,
      sender_id: "UPI",
      receiver_id: meDepUuid,
      plan_id: null,
      amount: amountNum,
      transaction_type: "deposit",
      status: "success",
      timestamp: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      created_at: new Date().toISOString()
    };
    await insertTransaction(newDbTx as any);
    await refreshTransactions();

    setDepositAmount("");
    setShowDepositModal(false);
  };

  // Resolve current user's UUID
  const meUserObj = React.useMemo(() => {
    return dbUsers.find(u => u.user_id === activeUserId);
  }, [dbUsers, activeUserId]);

  const meUuid = React.useMemo(() => {
    return meUserObj ? (meUserObj as any).id : activeUserId;
  }, [meUserObj, activeUserId]);

  // Filter plans based on visibility rules:
  // A plan is visible on Home strictly based on plan_participants record status.
  const discoverablePlans = React.useMemo(() => {
    return getHomeFeedPlans(activeUserId);
  }, [getHomeFeedPlans, activeUserId]);

  const homeBadgeCount = React.useMemo(() => {
    return discoverablePlans.length;
  }, [discoverablePlans]);

  const userUuid = activeUserUuid || userProfile?.dbUuid || (userProfile as any)?.id || null;
  const chatsBadgeCount = useUnreadChatsCount({
    userUuid,
    activeUserId,
    plans,
  });

  const pendingMemoryCount = React.useMemo(() => {
    return 0;
  }, []);

  const completedMemories = React.useMemo(() => {
    return [];
  }, []);

  // Guard against stale child state leaking onto root routes
  const isChildHidingBottomNav = React.useMemo(() => {
    if (activeTab === "home" || activeTab === "plans" || activeTab === "chats") {
      // Root tabs never inherit child hidden state
      return false;
    }
    if (activeTab === "create") {
      // In create flow: root category screen (/create) must always show bottom nav
      const currentRoute = parseCurrentRoute();
      if (currentRoute.tab === "create" && (!currentRoute.createPhase || currentRoute.createPhase === "category")) {
        return false;
      }
      return childrenWantBottomNavHidden;
    }
    // Profile, wallet can request hiding for sub-sheets/sub-screens
    return childrenWantBottomNavHidden;
  }, [activeTab, childrenWantBottomNavHidden]);

  const shouldShowBottomNav =
    !selectedPlan &&
    !selectedPlanId &&
    !selectedChatPlanId &&
    !showPlansSearchScreen &&
    !showHostedPlansScreen &&
    !showPastPlansScreen &&
    !showFriendsScreen &&
    !isChildHidingBottomNav;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col justify-between relative overflow-hidden select-none">

      {/* ---------------- FIGMA ALIGNED HEADER ---------------- */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === "home" && (
          <motion.div
            key="header-home"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <HomeHeader
              userProfile={userProfile}
              setActiveTab={handleTabChange}
              pendingMemoryCount={pendingMemoryCount}
              showFriendsIcon={true}
              onToggleFriends={() => setShowFriendsScreen(true)}
            />
          </motion.div>
        )}

        {activeTab === "plans" && (
          <motion.div
            key="header-plans"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <HomeHeader
              userProfile={userProfile}
              setActiveTab={handleTabChange}
              pendingMemoryCount={pendingMemoryCount}
              showSearch={true}
              onToggleSearch={() => {
                setPlansSearchOrigin("plans");
                setShowPlansSearchScreen(true);
              }}
              showHostedIcon={true}
              onToggleHosted={() => setShowHostedPlansScreen(prev => !prev)}
              isHostedActive={showHostedPlansScreen}
              title={showHostedPlansScreen ? "Hosted Plans" : "Plans"}
              scrollY={plansScrollY}
              hideNotificationsIcon={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- MAIN APP SCREEN FRAME BODY ---------------- */}
      <main
        id="app_tab_content_wrapper"
        className="flex-1 relative overflow-hidden p-0"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full h-full flex flex-col flex-1 relative overflow-hidden"
          >
            {/* TAB 1: HOME PANEL */}
            {activeTab === "home" && (
              <HomeScreen
                discoverablePlans={discoverablePlans}
                userProfile={userProfile}
                interestedPlanIds={interestedPlanIds}
                setSelectedPlan={setSelectedPlanId}
                selectedPlan={selectedPlanId}
                setPaymentConfirmationPlan={setPaymentConfirmationPlanId}
                walletBalance={walletBalance}
                handleToggleJoin={handleToggleJoin}
                setShowPaymentSuccess={setShowPaymentSuccessId}
                setShowWaitlistSuccess={setShowWaitlistSuccessId}
                setShowLeftSuccess={setShowLeftSuccessId}
                setNotifications={setNotifications}
                activeCardId={activeCardId}
                setActiveCardId={setActiveCardId}
                handleSnoozePlan={handleSnoozePlan}
                handleWaitlistPlan={(planId) => waitlistPlan(planId, userProfile)}
                homeFeedRef={homeFeedRef}
                selectedPlanId={selectedPlanId}
                onNavigateToCreate={() => handleTabChange("create")}
                onNavigateToPlans={() => handleTabChange("plans")}
              />
            )}

            {/* TAB 2: PLANS — PREMIUM ACTIVITY HUB & HOSTED DESTINATION */}
            {activeTab === "plans" && (
              <PlansScreen
                setSelectedPlanId={setSelectedPlanId}
                skippedByPlanId={skippedByPlanId}
                plansFilter={plansFilter}
                setPlansFilter={setPlansFilter}
                onScroll={setPlansScrollY}
              />
            )}

            {/* TAB 3: SPONTANEOUS CREATOR - INSTANT PRODUCTIVITY AESTHETICS */}
            {activeTab === "create" && (
              <CreateMVP
                setActiveTab={handleTabChange}
                onToggleBottomNav={setChildrenWantBottomNavHidden}
                setPlansFilter={setPlansFilter}
              />
            )}

            {/* TAB 4: CHATS — PLAN CONVERSATIONS */}
            {activeTab === "chats" && (
              <ChatsScreen
                setActiveTab={handleTabChange}
                onSelectChatPlan={(planId) => {
                  setChatOriginContext({ type: "chats" });
                  setSelectedChatPlanId(planId);
                  navigateToRoute({ tab: "chats", selectedChatPlanId: planId });
                }}
                onScroll={setPlansScrollY}
              />
            )}

            {/* TAB: WALLET */}
            {activeTab === "wallet" && (
              <WalletScreen
                setActiveTab={handleTabChange}
                setSelectedPlanId={setSelectedPlanId}
                onToggleBottomNav={setChildrenWantBottomNavHidden}
              />
            )}

            {/* TAB 5: PROFILE & ACCOUNT MANAGEMENT */}
            {activeTab === "profile" && (
              <ProfileScreen
                onLogout={onLogout}
                setSelectedPlanId={setSelectedPlanId}
                setShowDepositModal={setShowDepositModal}
                onToggleBottomNav={setChildrenWantBottomNavHidden}
                onOpenPastPlans={() => {
                  setPastPlansOrigin("profile");
                  setShowPastPlansScreen(true);
                }}
                onOpenFriends={() => setShowFriendsScreen(true)}
                setSelectedPlanSource={setSelectedPlanSource}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ---------------- ACTIVE DETAILED OVERLAY POPUP (PLAN DETAILS) ---------------- */}
      <AnimatePresence>
        {selectedPlanId && (
          <motion.div
            key="detailed-plan-modal"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-[60]"
          >
            <DetailedPlanModal
              planId={selectedPlanId}
              activeTab={selectedPlanSource === "chat" ? "chat" : activeTab}
              onClose={() => {
                setSelectedPlanId(null);
                localStorage.removeItem("planless_selected_plan_id");
                if (selectedPlanSource === "past_plans" || selectedPlanSource === "past") {
                  setShowPastPlansScreen(true);
                  setSelectedPlanSource("list");
                } else if (selectedPlanSource === "hosted") {
                  setShowHostedPlansScreen(true);
                  setSelectedPlanSource("list");
                } else if (selectedPlanSource === "search") {
                  setShowPlansSearchScreen(true);
                  setSelectedPlanSource("list");
                } else if (selectedPlanSource === "chat" && selectedChatPlanId) {
                  // Stay in same Plan Chat screen when returning from Plan Preview
                  setSelectedPlanSource("list");
                } else {
                  setSelectedPlanSource("list");
                }
              }}
              userProfile={userProfile}
              activeUserId={activeUserId}
              onOpenChat={
                selectedPlanSource === "chat"
                  ? () => {
                      setSelectedPlanId(null);
                      localStorage.removeItem("planless_selected_plan_id");
                    }
                  : undefined
              }
              setShowPaymentSuccess={setShowPaymentSuccessId}
              setShowWaitlistSuccess={setShowWaitlistSuccessId}
              setShowLeftSuccess={setShowLeftSuccessId}
              onLeavePlan={() => {
                setSelectedPlanId(null);
                localStorage.removeItem("planless_selected_plan_id");
              }}
              onPlanCancelled={() => {
                setSelectedPlanId(null);
                localStorage.removeItem("planless_selected_plan_id");
                setShowCancelConfirmation(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- 👥 FRIENDS SCREEN ---------------- */}
      <AnimatePresence>
        {showFriendsScreen && (
          <motion.div
            key="friends-screen"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 bg-[#000000] flex flex-col"
          >
            <FriendshipsScreen onBack={() => setShowFriendsScreen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- 🔍 SEARCH YOUR PLANS SCREEN ---------------- */}
      <AnimatePresence>
        {showPlansSearchScreen && (
          <motion.div
            key="plans-search-screen"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 bg-[#050505] flex flex-col"
          >
            <SearchYourPlansScreen
              onBack={() => {
                setShowPlansSearchScreen(false);
                if (plansSearchOrigin === "hosted") {
                  setShowHostedPlansScreen(true);
                }
              }}
              setSelectedPlanId={(id) => {
                setSelectedPlanSource("search");
                setSelectedPlanId(id);
                setShowPlansSearchScreen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- 📜 PAST PLANS SCREEN ---------------- */}
      <AnimatePresence>
        {showPastPlansScreen && (
          <motion.div
            key="past-plans-screen"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 bg-[#050505] flex flex-col"
          >
            <PastPlans
              onBack={() => {
                setShowPastPlansScreen(false);
                if (pastPlansOrigin === "hosted") {
                  setShowHostedPlansScreen(true);
                }
              }}
              setSelectedPlanId={(id) => {
                setSelectedPlanSource("past_plans");
                setSelectedPlanId(id);
                setShowPastPlansScreen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- 👑 HOSTED PLANS SCREEN ---------------- */}
      <AnimatePresence>
        {showHostedPlansScreen && (
          <motion.div
            key="hosted-plans-screen"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 bg-[#050505] flex flex-col"
          >
            <HostedPlansScreen
              onBack={() => setShowHostedPlansScreen(false)}
              setSelectedPlanId={(id) => {
                setSelectedPlanSource("hosted");
                setSelectedPlanId(id);
                setShowHostedPlansScreen(false);
              }}
              onTogglePast={() => {
                setPastPlansOrigin("hosted");
                setShowHostedPlansScreen(false);
                setShowPastPlansScreen(true);
              }}
              onToggleSearch={() => {
                setPlansSearchOrigin("hosted");
                setShowHostedPlansScreen(false);
                setShowPlansSearchScreen(true);
              }}
              onScroll={setPlansScrollY}
              onNavigateToCreate={() => {
                setShowHostedPlansScreen(false);
                handleTabChange("create");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- 💬 PLAN CHAT SCREEN ---------------- */}
      <AnimatePresence>
        {selectedChatPlanId && (
          <motion.div
            key="plan-chat-screen"
            variants={screenModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 overflow-hidden"
          >
            <PlanChatScreen
              planId={selectedChatPlanId}
              onBack={() => {
                if (chatOriginContext?.type === "plan") {
                  const { planId, planSource, previousTab } = chatOriginContext;
                  setSelectedChatPlanId(null);
                  setChatOriginContext(null);
                  if (previousTab && previousTab !== activeTab) {
                    setActiveTab(previousTab);
                  }
                  setSelectedPlanSource(planSource || "list");
                  if (planId) {
                    setSelectedPlanId(planId);
                  }
                } else {
                  setSelectedChatPlanId(null);
                  setChatOriginContext(null);
                  navigateToRoute({ tab: "chats" });
                }
              }}
              onOpenPlanDetails={() => {
                const planId = selectedChatPlanId;
                setSelectedPlanSource("chat");
                setSelectedPlanId(planId);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>



      {/* ---------------- DEPOSIT CASH MODAL ---------------- */}
      <DepositCashModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        handleDepositMoney={handleDepositMoney}
      />

      {/* 💳 LIGHTWEIGHT PAYMENT CONFIRMATION SCREEN */}
      <PaymentConfirmationModal
        paymentConfirmationPlanId={paymentConfirmationPlanId}
        onClose={() => setPaymentConfirmationPlanId(null)}
        walletBalance={walletBalance}
        handleToggleJoin={handleToggleJoin}
        setSelectedPlanId={setSelectedPlanId}
        setShowPaymentSuccessId={setShowPaymentSuccessId}
      />

      {/* RESERVATION SUCCESS OVERLAYS */}
      <ReservationSuccessModal
        planId={showPaymentSuccessId || showWaitlistSuccessId || showLeftSuccessId}
        isWaitlist={!!showWaitlistSuccessId}
        isLeft={!!showLeftSuccessId}
        onClose={() => {
          setShowPaymentSuccessId(null);
          setShowWaitlistSuccessId(null);
          setShowLeftSuccessId(null);
        }}
        setActiveTab={handleTabChange}
        setPlansFilter={setPlansFilter}
      />



      {/* ---------------- NAVIGATION FOOTER TABS ---------------- */}
      {shouldShowBottomNav && (
        <NavigationFooter
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          homeBadgeCount={homeBadgeCount}
          chatsBadgeCount={chatsBadgeCount}
        />
      )}


      {/* ---------------- PLAN CANCELLED CONFIRMATION OVERLAY ---------------- */}
      <AnimatePresence>
        {showCancelConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 bg-[#050505] z-50 flex flex-col justify-between p-5 text-left"
          >
            {/* Upper Centered Content Group */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 gap-10">

              {/* Cancellation Animation / Indicator */}
              <div className="relative flex items-center justify-center">
                {/* Subtle expanding ring */}
                <motion.div
                  className="absolute rounded-full border border-red-500/30"
                  initial={{ width: 80, height: 80, opacity: 0.6 }}
                  animate={{ width: 170, height: 170, opacity: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
                />

                {/* Circular outline animation */}
                <motion.div
                  className="relative w-24 h-24 bg-red-500/5 border border-red-500/30 rounded-full flex items-center justify-center"
                  style={{ boxShadow: '0 0 32px 0 rgba(239,68,68,0.1)' }}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.05 }}
                >
                  {/* Cancellation symbol "X" */}
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25, delay: 0.25 }}
                  >
                    <X className="w-11 h-11 text-red-500 stroke-[2.5]" />
                  </motion.div>
                </motion.div>
              </div>

              {/* Text Group */}
              <div className="text-center space-y-3">
                <motion.h2
                  className="text-3xl font-black text-white tracking-tight leading-none"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
                >
                  Plan Cancelled
                </motion.h2>
                <motion.p
                  className="text-[13px] text-zinc-500 font-medium max-w-[260px] mx-auto leading-relaxed"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.38 }}
                >
                  Your plan has been cancelled. Participants will no longer be able to join or attend this plan.
                </motion.p>
              </div>
            </div>

            {/* Actions Section */}
            <motion.div
              className="px-5 pb-10 pt-4 space-y-3 w-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.48 }}
            >
              {/* Return Home (Primary Orange styled) */}
              <motion.button
                type="button"
                onClick={() => {
                  setShowCancelConfirmation(false);
                  handleTabChange('home');
                }}
                className="w-full bg-[#FF6B2C] text-[#050505] py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer select-none"
                style={{ boxShadow: '0 8px 28px rgba(255,107,44,0.2)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                Return Home
              </motion.button>

              {/* Go to Plans (Secondary standard style) */}
              <motion.button
                type="button"
                onClick={() => {
                  setShowCancelConfirmation(false);
                  setPlansFilter('hosted');
                  handleTabChange('plans');
                }}
                className="w-full bg-transparent border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 py-4 rounded-2xl font-bold text-[11px] tracking-widest uppercase flex items-center justify-center transition-colors cursor-pointer select-none"
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                Go to Plans
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


