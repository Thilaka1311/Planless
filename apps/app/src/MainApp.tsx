import React, { useState, useRef } from "react";
import { useToast } from "./shared/contexts/ToastContext";
import { supabase } from "../lib/supabaseClient";
import {
  Bell, Users, Plus, Home, Calendar, Wallet, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserProfile, Plan, Circle, Transaction, DbCircle, DbCircleMember, DbPlan, DbPlanParticipant, DbTransaction, DbPlanOutcome } from "./core/types";
import { getInitialsAvatar, mapCirclesToLegacyCircles, mapTransactionsToLegacy } from "../lib/mappers";
import { insertCircle, insertCircleMembers, syncUserStats, insertTransaction } from "../lib/db";
import { usePlansStore } from "./features/plans/state/PlansContext";
import { useProfileStore } from "./features/profile/state/ProfileContext";
import { useWalletStore } from "./features/wallet/state/WalletContext";
import { useCirclesStore } from "./features/circles/state/CirclesContext";
import { useFriendshipStore } from "./features/friendships/state/FriendshipContext";
import { CirclesScreen } from "./features/circles/screens/CirclesScreen";
import { CreateNewCircleButton } from "./features/circles/components/CreateNewCircleButton";
import { WalletScreen } from "./features/wallet/screens/WalletScreen";
import { HomeScreen } from "./features/home/screens/HomeScreen";
import { PlansScreen } from "./features/plans/screens/PlansScreen/PlansScreen";
import { CreatePlanScreen } from "./features/create/screens/Create";
import { ProfileScreen } from "./features/profile/screens/ProfileScreen";
import DetailedPlanModal from "./components/common screens/DetailedPlanModal";
import { getPlanCover } from "./features/plans/config/planCoverImages";
import DepositCashModal from "./shared/modals/DepositCashModal";
import PaymentConfirmationModal from "./shared/modals/PaymentConfirmationModal";
import ReservationSuccessModal from "./shared/modals/ReservationSuccessModal";
import { NavigationFooter } from "./components/NavigationFooter";
import { HomeHeader } from "./components/HomeHeader";

import { useLivePlan } from "./features/plans/hooks/useLivePlan";
import { SearchYourPlansScreen } from "./features/plans/screens/PlansScreen/SearchYourPlansScreen";
import { HostedPlansScreen } from "./features/plans/screens/PlansScreen/HostedPlansScreen";
import { PastPlans } from "./features/plans/screens/PlansScreen/PastPlans";

interface MainAppProps {
  userProfile: UserProfile;
  onLogout: () => void;
  activeUserId: string;
}

export default function MainApp({ userProfile, onLogout, activeUserId }: MainAppProps) {
  // --- Decoupled Context Stores ---
  const { plans, dbPlans, setDbPlans, dbPlanParticipants, setDbPlanParticipants, dbPlanOutcomes, setDbPlanOutcomes, dbPlanTeamAssignments, setDbPlanTeamAssignments, joinPlan, waitlistPlan, passPlan, submitReview, submitStats, submitMvp, updatePlanDetails, cancelPlan, getHomeFeedPlans, dbMemories, dbMemoryResults } = usePlansStore();
  const { dbUsers, setDbUsers, updateProfile, activeUserUuid } = useProfileStore();
  const { circles, setCircles, dbCircles, setDbCircles, dbCircleMembers, setDbCircleMembers, createCircle } = useCirclesStore();
  const { walletBalance, transactions, dbTransactions, setDbTransactions, refreshTransactions } = useWalletStore();
  const { friends } = useFriendshipStore();

  // --- Core Navigation Tab state ---
  const [activeTab, setActiveTab] = useState<"home" | "plans" | "create" | "circles" | "wallet" | "profile">(() => {
    return (localStorage.getItem("planless_active_tab") as any) || "home";
  });
  const [childrenWantBottomNavHidden, setChildrenWantBottomNavHidden] = useState(false);

  // --- Shared Overlays & Interactive States ---
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => {
    return localStorage.getItem("planless_selected_plan_id");
  });

  const [isTrackerExpanded, setIsTrackerExpanded] = useState(false);
  const { showToast } = useToast();
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  React.useEffect(() => {
    setChildrenWantBottomNavHidden(false);
  }, [activeTab]);

  // Snooze and Auto-Pass overrides
  const [interestedPlanIds, setInterestedPlanIds] = useState<string[]>([]);
  const [snoozedPlanIds, setSnoozedPlanIds] = useState<string[]>([]);
  const [skippedByPlanId, setSkippedByPlanId] = useState<Record<string, string[]>>({});
  const [reminderSentPlanIds, setReminderSentPlanIds] = useState<string[]>([]);

  // Checkout splits overlay
  const [paymentConfirmationPlanId, setPaymentConfirmationPlanId] = useState<string | null>(null);
  const [showPaymentSuccessId, setShowPaymentSuccessId] = useState<string | null>(null);
  const [showWaitlistSuccessId, setShowWaitlistSuccessId] = useState<string | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [plansFilter, setPlansFilter] = useState<'JOINED' | 'WAITLISTED' | 'SKIPPED'>('JOINED');
  const [showHostedPlansScreen, setShowHostedPlansScreen] = useState(false);
  const [showPastPlansScreen, setShowPastPlansScreen] = useState(false);
  const [plansScrollY, setPlansScrollY] = useState(0);
  const [showPlansSearchScreen, setShowPlansSearchScreen] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  // Reset hosted & past subscreen when changing tabs
  React.useEffect(() => {
    if (activeTab !== "plans") {
      setShowHostedPlansScreen(false);
      setShowPastPlansScreen(false);
    }
  }, [activeTab]);

  // Circle Navigation helpers
  const [circleCreateStep, setCircleCreateStep] = useState<"members" | "details" | null>(null);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [expandedCircleIds, setExpandedCircleIds] = useState<string[]>([]);
  const [isInvitingFriends, setIsInvitingFriends] = useState(false);

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Derive live plan references from active state IDs
  const selectedPlan = useLivePlan(selectedPlanId);
  const paymentConfirmationPlan = useLivePlan(paymentConfirmationPlanId);
  const showPaymentSuccess = useLivePlan(showPaymentSuccessId);
  const showWaitlistSuccess = useLivePlan(showWaitlistSuccessId);

  const homeFeedRef = useRef<HTMLDivElement>(null);

  // triggerToast removed — use showToast from ToastContext directly

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
    showToast("Snoozed: We'll show this plan again later");
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

  React.useEffect(() => {
    if (selectedCircle) {
      localStorage.setItem("planless_selected_circle_id", selectedCircle.id);
    } else if (isInitialLoadComplete) {
      localStorage.removeItem("planless_selected_circle_id");
    }
  }, [selectedCircle, isInitialLoadComplete]);





  React.useEffect(() => {
    const savedId = localStorage.getItem("planless_selected_circle_id");
    if (selectedCircle) {
      const fresh = circles.find(c => c.id === selectedCircle.id || c.dbUuid === selectedCircle.dbUuid);
      if (fresh && fresh !== selectedCircle) {
        setSelectedCircle(fresh);
      }
    } else if (savedId && circles.length > 0) {
      const fresh = circles.find(c => c.id === savedId || c.dbUuid === savedId);
      if (fresh) {
        setSelectedCircle(fresh);
      }
    }
  }, [circles]);







  // Checkin join toggle
  const handleToggleJoin = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    await joinPlan(plan.id, userProfile);

    // Sync Wallet & Ledger for cost-based plans without payment_required (which bypass Razorpay checkout but still deduct balance)
    if (plan.cost > 0 && !(plan as any).payment_required) {
      // Resolve UUIDs before writing to DB (transactions must use users.id, not user_id)
      const meTxUser = dbUsers.find(u => u.user_id === activeUserId);
      const meTxUuid = meTxUser?.id || activeUserUuid || activeUserId;
      const creatorTxUser = dbUsers.find(u => u.user_id === plan.creatorId || u.id === plan.creatorId);
      const creatorTxUuid = creatorTxUser?.id || plan.creatorId || null;

      const newDbTx = {
        transaction_id: `T_pay_${Date.now()}`,
        sender_id: meTxUuid,
        receiver_id: creatorTxUuid,
        plan_id: plan.dbUuid || plan.id,
        amount: plan.cost,
        transaction_type: "split_payment",
        status: "success",
        timestamp: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        created_at: new Date().toISOString()
      };
      await insertTransaction(newDbTx as any);
    }
    await refreshTransactions();
  };

  // Cash deposits
  const handleDepositMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast("Enter a valid amount to deposit");
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
    showToast(`💰 Added ₹${amountNum} successfully!`);
  };

  // Buddy groups creation
  const handleCreateCircle = (
    name: string,
    description: string,
    image: string | null,
    memberIds: string[]  // short user_id values e.g. "U002"
  ) => {
    if (!name.trim()) {
      showToast("Give your circle a name!");
      return;
    }

    const circleCover = image || getInitialsAvatar(name);

    // Call store function using the hook result destructured at top of MainApp
    const store = { createCircle }; // createCircle is destructured from useCirclesStore at top of MainApp
    createCircle(name, description, circleCover, memberIds, activeUserId, dbUsers);

    showToast(`👥 Circle "${name}" created!`);
  };




  // Syncing countdown timers
  const upcomingCirclePlans = React.useMemo(() => {
    return plans.filter(p => !p.isHappened && p.status !== "CANCELLED");
  }, [plans]);

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

  const pendingMemoryCount = React.useMemo(() => {
    return 0;
  }, []);

  const completedMemories = React.useMemo(() => {
    return [];
  }, []);

  const shouldShowBottomNav =
    !selectedPlan &&
    !childrenWantBottomNavHidden;

  return (
    <div className="w-full h-full bg-[#0C0C0E] flex flex-col justify-between relative overflow-hidden select-none">

      {/* ---------------- FIGMA ALIGNED HEADER ---------------- */}
      {activeTab === "home" && (
        <HomeHeader
          userProfile={userProfile}
          setActiveTab={setActiveTab}
          pendingMemoryCount={pendingMemoryCount}
        />
      )}

      {activeTab === "plans" && (
        <HomeHeader
          userProfile={userProfile}
          setActiveTab={setActiveTab}
          pendingMemoryCount={pendingMemoryCount}
          showSearch={true}
          onToggleSearch={() => setShowPlansSearchScreen(true)}
          showHostedIcon={true}
          onToggleHosted={() => setShowHostedPlansScreen(prev => !prev)}
          isHostedActive={showHostedPlansScreen}
          showPastIcon={true}
          onTogglePast={() => setShowPastPlansScreen(true)}
          isPastActive={showPastPlansScreen}
          title={showHostedPlansScreen ? "Hosted Plans" : "Plans"}
          scrollY={plansScrollY}
          hideNotificationsIcon={true}
        />
      )}

      {/* Toast is now rendered by ToastProvider in App.tsx */}

      {/* ---------------- MAIN APP SCREEN FRAME BODY ---------------- */}
      <main
        id="app_tab_content_wrapper"
        className="flex-1 relative overflow-hidden p-0"
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
            activeCardId={activeCardId}
            setActiveCardId={setActiveCardId}
            handleSnoozePlan={handleSnoozePlan}
            handleWaitlistPlan={waitlistPlan}
            homeFeedRef={homeFeedRef}
            selectedPlanId={selectedPlanId}
            onNavigateToCreate={() => setActiveTab("create")}
          />
        )}

        {/* TAB 2: PLANS — PREMIUM ACTIVITY HUB & HOSTED DESTINATION */}
        {activeTab === "plans" && (
          showHostedPlansScreen ? (
            <HostedPlansScreen
              setSelectedPlanId={setSelectedPlanId}
              onScroll={setPlansScrollY}
            />
          ) : (
            <PlansScreen
              setSelectedPlanId={setSelectedPlanId}
              skippedByPlanId={skippedByPlanId}
              plansFilter={plansFilter}
              setPlansFilter={setPlansFilter}
              onScroll={setPlansScrollY}
            />
          )
        )}

        {/* TAB 3: SPONTANEOUS CREATOR - INSTANT PRODUCTIVITY AESTHETICS */}
        {activeTab === "create" && (
          <CreatePlanScreen
            setActiveTab={setActiveTab}
            onToggleBottomNav={setChildrenWantBottomNavHidden}
            setPlansFilter={setPlansFilter}
            setSelectedCircle={setSelectedCircle}
          />
        )}

        {/* TAB 4: CIRCLES / BUDDY GROUPS THREAD */}
        {activeTab === "circles" && (
          <CirclesScreen
            circleCreateStep={circleCreateStep}
            setCircleCreateStep={setCircleCreateStep}
            circles={circles}
            selectedCircle={selectedCircle}
            setSelectedCircle={setSelectedCircle}
            activeUserId={activeUserId}
            userProfile={userProfile}
            dbCircleMembers={dbCircleMembers}
            setDbCircleMembers={setDbCircleMembers}
            upcomingCirclePlans={upcomingCirclePlans}
            expandedCircleIds={expandedCircleIds}
            setExpandedCircleIds={setExpandedCircleIds}
            isInvitingFriends={isInvitingFriends}
            setIsInvitingFriends={setIsInvitingFriends}
            setActiveTab={setActiveTab}
            dbUsers={dbUsers}
            setCircles={setCircles}
            plans={plans}
            setPaymentConfirmationPlanId={setPaymentConfirmationPlanId}
            handleToggleJoin={handleToggleJoin}
            setSelectedPlanId={setSelectedPlanId}
            handleCreateCircle={handleCreateCircle}
            onToggleBottomNav={setChildrenWantBottomNavHidden}
          />
        )}

        {/* TAB: WALLET */}
        {activeTab === "wallet" && (
          <WalletScreen
            setActiveTab={setActiveTab}
            setSelectedPlanId={setSelectedPlanId}
          />
        )}

        {/* TAB 5: PROFILE & ACCOUNT MANAGEMENT */}
        {activeTab === "profile" && (
          <ProfileScreen
            onLogout={onLogout}
            setSelectedPlanId={setSelectedPlanId}
            setShowDepositModal={setShowDepositModal}
            onToggleBottomNav={setChildrenWantBottomNavHidden}
          />
        )}
      </main>

      {/* ---------------- ACTIVE DETAILED OVERLAY POPUP (PLAN DETAILS) ---------------- */}
      {selectedPlanId && isInitialLoadComplete && (
        <DetailedPlanModal
          planId={selectedPlanId}
          activeTab={activeTab}
          onClose={() => setSelectedPlanId(null)}
          userProfile={userProfile}
          activeUserId={activeUserId}
          setShowPaymentSuccess={setShowPaymentSuccessId}
          setShowWaitlistSuccess={setShowWaitlistSuccessId}
          onLeavePlan={() => {
            setSelectedPlanId(null);
          }}
          onPlanCancelled={() => {
            setSelectedPlanId(null);
            setShowCancelConfirmation(true);
          }}
          onNavigateToCircle={(circleId) => {
            const circleObj = dbCircles.find(c => c.circle_id === circleId || c.id === circleId);
            if (circleObj) {
              const legacyCircles = mapCirclesToLegacyCircles(dbCircles, dbCircleMembers, dbUsers);
              const legacyCircle = legacyCircles.find(c => c.id === circleId || c.dbUuid === circleId);
              if (legacyCircle) {
                setSelectedCircle(legacyCircle);
              }
            }
            setActiveTab("circles");
          }}
        />
      )}




      {/* ---------------- 🔍 SEARCH YOUR PLANS SCREEN ---------------- */}
      {showPlansSearchScreen && (
        <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col">
          <SearchYourPlansScreen
            onBack={() => setShowPlansSearchScreen(false)}
            setSelectedPlanId={(id) => {
              setSelectedPlanId(id);
              setShowPlansSearchScreen(false);
            }}
          />
        </div>
      )}

      {/* ---------------- 📜 PAST PLANS SCREEN ---------------- */}
      {showPastPlansScreen && (
        <PastPlans
          onBack={() => setShowPastPlansScreen(false)}
          setSelectedPlanId={(id) => {
            setSelectedPlanId(id);
            setShowPastPlansScreen(false);
          }}
        />
      )}



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
        planId={showPaymentSuccessId || showWaitlistSuccessId}
        isWaitlist={!!showWaitlistSuccessId}
        onClose={() => {
          setShowPaymentSuccessId(null);
          setShowWaitlistSuccessId(null);
        }}
        setActiveTab={setActiveTab}
      />



      {/* ---------------- NAVIGATION FOOTER TABS ---------------- */}
      {shouldShowBottomNav && (
        <NavigationFooter
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          homeBadgeCount={homeBadgeCount}
        />
      )}

      {activeTab === "circles" && !circleCreateStep && !selectedCircle && (
        <div className="absolute bottom-[84px] right-4 z-50 animate-fade-in">
          <CreateNewCircleButton onClick={() => setCircleCreateStep("members")} />
        </div>
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
                  setActiveTab('home');
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
                  setActiveTab('plans');
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


