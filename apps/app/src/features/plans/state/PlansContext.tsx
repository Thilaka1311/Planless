import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from "react";
import { Plan, PlanMember, DbPlan, DbPlanParticipant, DbPlanOutcome, User, DbMemory, DbMemoryResult } from "../../../core/types";
import { DbPlanTeamAssignment } from "../../../../lib/db";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useCirclesStore } from "../../circles/state/CirclesContext";
import { usePlanTeams } from "../hooks/usePlanTeams";
import { usePlanParticipants, AddParticipantsOptions } from "../hooks/usePlanParticipants";
import { usePlanLifecycle } from "../hooks/usePlanLifecycle";
import { usePlanOutcomes } from "../hooks/usePlanOutcomes";
import { insertParticipant, updateParticipantStatus, insertPlanReminder, removePlanTeamAssignment, deleteAllPlanTeamAssignments, syncUserStats } from "../../../../lib/db";
import { mapPlansToLegacyPlans } from "../../../../lib/mappers";
import { calculateParticipantBreakdown, normalizeStatus } from "../../../../lib/participantStatus";
import { supabase } from "../../../../lib/supabaseClient";
import { cleanPlanId, isUuid, resolveUserUuid as resolveUserUuidUtil } from "../utils/planUtils";
import { getTimelineSectionValue, getDayIndexValue, parseTimeToMinutes } from "../utils/planFeedUtils";
import { recalculateWalletExpenses } from "../../wallet/services/walletSyncService";
import * as api from "../api/plans";

interface ParticipantCounts {
  host: number;
  going: number;
  waitlist: number;
  delivered: number;
  skipped: number;
  passed: number;
  pending: number;  // invited but not yet responded
  total: number;
}

export interface JoinOptions {
  forceStatus?: "going" | "waitlist";
  skipPayment?: boolean;
}

interface PlansContextType {
  plans: Plan[];
  dbPlans: DbPlan[];
  setDbPlans: React.Dispatch<React.SetStateAction<DbPlan[]>>;
  dbPlanParticipants: DbPlanParticipant[];
  setDbPlanParticipants: React.Dispatch<React.SetStateAction<DbPlanParticipant[]>>;
  dbPlanOutcomes: DbPlanOutcome[];
  setDbPlanOutcomes: React.Dispatch<React.SetStateAction<DbPlanOutcome[]>>;
  dbMemories: DbMemory[];
  setDbMemories: React.Dispatch<React.SetStateAction<DbMemory[]>>;
  dbMemoryResults: DbMemoryResult[];
  setDbMemoryResults: React.Dispatch<React.SetStateAction<DbMemoryResult[]>>;
  joinPlan: (planId: string, userProfile: any, options?: JoinOptions) => Promise<void>;
  leavePlan: (planId: string, leaverId: string) => Promise<void>;
  passPlan: (planId: string, passerId: string) => Promise<void>;
  waitlistPlan: (planId: string, userProfile: any) => Promise<void>;
  sendReminder: (planId: string, userId: string) => void;
  ignoreReminder: (planId: string, ignoreUserId: string) => void;
  getHomeFeedPlans: (userId: string) => Plan[];
  getHubPlans: (userId: string) => Plan[];
  getParticipantCounts: (planId: string) => ParticipantCounts;
  refreshPlans: (targetTables?: string[]) => Promise<void>;
  skipPlan: (planId: string, userId: string) => Promise<void>;
  requestPaidPlanLeave: (planId: string) => Promise<void>;
  cancelPaidPlanLeaveRequest: (planId: string) => Promise<void>;
  resolvePaidPlanLeaveRequest: (planId: string, targetUserId: string, resolution: 'REPLACED' | 'KEEP_PAYMENT', replacementUserId?: string) => Promise<void>;
  rejoinPlan: (planId: string, userProfile: any) => Promise<void>;
  // New acceptance / payment / booking actions
  acceptPlan: (planId: string, userProfile: any) => Promise<void>;
  declinePlan: (planId: string, userProfile: any) => Promise<void>;
  changePlanHost: (planId: string, newHostUuid: string, oldHostUuid: string) => Promise<void>;
  cancelPlan: (planId: string) => Promise<void>;
  updatePlanDetails: (planId: string, updates: Partial<DbPlan>) => Promise<any>;
  completePlan: (planId: string) => Promise<void>;
  submitReview: (memoryId: string, category: 'movie' | 'dining', rating: number, review: string | null, userUuid: string, existingId?: string) => Promise<void>;
  submitStats: (memoryId: string, category: 'football' | 'badminton', stats: { scoreA?: number; scoreB?: number; wins?: number; losses?: number }, userUuid: string) => Promise<void>;
  submitMvp: (memoryId: string, voterUuid: string, mvpUuid: string) => Promise<void>;
  createPlan: (
    newDbPlan: any,
    selectedCircles: string[],
    selectedFriends: any[],
    userProfile: any,
    titleToUse: string,
    isHostSelected?: boolean,
    priorityGuestIds?: string[]
  ) => Promise<{ dbPlanRow: any; dbPartRow: any; inviteeUuids: string[]; hostJoinedAt: string }>;
  dbPlanTeamAssignments: DbPlanTeamAssignment[];
  setDbPlanTeamAssignments: React.Dispatch<React.SetStateAction<DbPlanTeamAssignment[]>>;
  getTeamAssignments: (planUuid: string) => Promise<DbPlanTeamAssignment[]>;
  assignTeam: (planUuid: string, userUuid: string, team: "A" | "B") => Promise<void>;
  unassignTeam: (planUuid: string, userUuid: string) => Promise<void>;
  removeParticipant: (planId: string, participantUserUuid: string) => Promise<void>;
  promoteWaitlistParticipant: (planId: string, participantUserUuid: string) => Promise<void>;
  rebalanceCapacity: (planId: string, newCapacity: number) => Promise<{ promotedCount: number; demotedCount: number }>;
  getAvailableCapacity: (planId: string) => { capacity: number; goingCount: number; availableSpots: number };
  addParticipantsToPlan: (options: AddParticipantsOptions) => Promise<void>;
  moveParticipantToGoing: (planId: string, participantUserUuid: string) => Promise<void>;
  moveParticipantToWaitlist: (planId: string, participantUserUuid: string) => Promise<void>;
  moveParticipantToInvited: (planId: string, participantUserUuid: string) => Promise<void>;
  updatePlanSettings: (
    planId: string,
    settings: {
      allow_participant_invites?: boolean;
      allowParticipantInvites?: boolean;
      max_participants?: number;
      maxParticipants?: number;
    }
  ) => Promise<void>;
  promoteParticipantToHost: (planId: string, participantUserUuid: string) => Promise<void>;
  demoteHostToParticipant: (planId: string, participantUserUuid: string) => Promise<void>;
  reorderWaitlist: (planId: string, orderedUserUuids: string[]) => Promise<void>;
  switchToAutomaticWaitlistMode: (planId: string, promotedUserUuids?: string[]) => Promise<void>;
  swapParticipants: (planId: string, goingUserId: string, waitlistUserId: string) => Promise<void>;
  removeAndReplaceWithWaitlist: (planId: string, removeUserId: string, promoteUserId: string) => Promise<void>;
}

const PlansContext = createContext<PlansContextType | undefined>(undefined);

export const PlansProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbPlans, setDbPlans] = useState<DbPlan[]>([]);
  const [dbPlanParticipants, setDbPlanParticipants] = useState<DbPlanParticipant[]>([]);
  const [dbPlanOutcomes, setDbPlanOutcomes] = useState<DbPlanOutcome[]>([]);
  const [dbMemories, setDbMemories] = useState<DbMemory[]>([]);
  const [dbMemoryResults, setDbMemoryResults] = useState<DbMemoryResult[]>([]);

  const { activeUserUuid: userId, dbUsers, setDbUsers } = useProfileStore();

  const { dbCircles, dbCircleMembers } = useCirclesStore();

  const dbPlansRef = React.useRef(dbPlans);
  dbPlansRef.current = dbPlans;
  const dbPlanParticipantsRef = React.useRef(dbPlanParticipants);
  dbPlanParticipantsRef.current = dbPlanParticipants;
  const dbCirclesRef = React.useRef(dbCircles);
  dbCirclesRef.current = dbCircles;
  const dbCircleMembersRef = React.useRef(dbCircleMembers);
  dbCircleMembersRef.current = dbCircleMembers;

  // ── Refresh coordinator states ──
  const isRefreshingRef = React.useRef(false);
  const hasPendingRefreshRef = React.useRef(false);
  const pendingFetchAllRef = React.useRef(false);
  const pendingTablesRef = React.useRef<Set<string>>(new Set());
  const isInitialLoadCompleteRef = React.useRef(false);

  const planUsers = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    (dbUsers || []).forEach((u: any) => {
      if (u && (u.id || u.user_id)) {
        if (u.id && !seen.has(u.id)) seen.add(u.id);
        if (u.user_id && !seen.has(u.user_id)) seen.add(u.user_id);
        list.push(u);
      }
    });

    dbPlans.forEach((p: any) => {
      if (p.host_profile && !seen.has(p.host_profile.id)) {
        seen.add(p.host_profile.id);
        list.push({
          ...p.host_profile,
          user_id: p.host_profile.public_id || p.host_profile.user_id || "U001",
          profile_photo: p.host_profile.profile_photo || p.host_profile.profile_photo_path
        });
      }
    });

    dbPlanParticipants.forEach((pp: any) => {
      if (pp.user_profile && !seen.has(pp.user_profile.id)) {
        seen.add(pp.user_profile.id);
        list.push({
          ...pp.user_profile,
          user_id: pp.user_profile.public_id || pp.user_profile.user_id || "U001",
          profile_photo: pp.user_profile.profile_photo || pp.user_profile.profile_photo_path
        });
      }
    });

    return list;
  }, [dbUsers, dbPlans, dbPlanParticipants]);

  const planUsersRef = React.useRef<any[]>([]);
  planUsersRef.current = planUsers;

  const resolveUserUuid = (uId: string) => resolveUserUuidUtil(uId, planUsers);

  const refreshPlans = useCallback(async (targetTables?: string[], reason: string = "unknown") => {
    if (!userId) return;

    if (isRefreshingRef.current) {
      hasPendingRefreshRef.current = true;
      if (!targetTables) {
        pendingFetchAllRef.current = true;
      } else {
        targetTables.forEach(t => pendingTablesRef.current.add(t));
      }
      return;
    }

    isRefreshingRef.current = true;
    try {
      const fetchAll = !targetTables || pendingFetchAllRef.current;
      const tablesToUse = fetchAll ? undefined : Array.from(pendingTablesRef.current);

      pendingFetchAllRef.current = false;
      pendingTablesRef.current.clear();

      const shouldFetchAll = !tablesToUse;

      if (shouldFetchAll || tablesToUse.includes("plans") || tablesToUse.includes("plan_participants")) {
        const joinedPlans = await api.getCurrentUserPlans(userId);

        const plansList: DbPlan[] = [];
        const participantsList: DbPlanParticipant[] = [];

        joinedPlans.forEach((p: any) => {
          const { plan_participants, ...planFields } = p;
          plansList.push(planFields);

          if (plan_participants) {
            plan_participants.forEach((pp: any) => {
              participantsList.push(pp);
            });
          }
        });

        setDbPlans(plansList);
        setDbPlanParticipants(participantsList);
      }

      if (shouldFetchAll || tablesToUse?.includes("plan_team_assignments")) {
        setDbPlanTeamAssignments([]);
      }

      if (shouldFetchAll || tablesToUse.includes("memories")) {
        const memories = await api.fetchMemories();
        setDbMemories(memories);
      }

      if (reason === "initial_load") {
        isInitialLoadCompleteRef.current = true;
      }
    } catch (err) {
      console.error("[PlansContext refreshPlans] Failed to fetch updated state:", err);
    } finally {
      isRefreshingRef.current = false;
      if (hasPendingRefreshRef.current) {
        hasPendingRefreshRef.current = false;
        const nextFetchAll = pendingFetchAllRef.current;
        const nextTables = nextFetchAll ? undefined : Array.from(pendingTablesRef.current);

        pendingFetchAllRef.current = false;
        pendingTablesRef.current.clear();

        refreshPlans(nextTables, "coalesced_pending_refresh");
      }
    }
  }, [userId]);

  // Initial fetch on mount / active user change
  useEffect(() => {
    if (userId) {
      isInitialLoadCompleteRef.current = false;
      refreshPlans(undefined, "initial_load");
    }
  }, [userId, refreshPlans]);

  // Recovery from backgrounding, sleep, or network offline transitions
  const lastRecoveryRef = React.useRef<number>(Date.now());
  useEffect(() => {
    const triggerRecovery = () => {
      if (!isInitialLoadCompleteRef.current) {
        return;
      }
      const now = Date.now();
      if (now - lastRecoveryRef.current < 10000) {

        return;
      }
      lastRecoveryRef.current = now;

      refreshPlans(["plans", "plan_participants"], "visibility_focus_online_recovery");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRecovery();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", triggerRecovery);
    window.addEventListener("online", triggerRecovery);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", triggerRecovery);
      window.removeEventListener("online", triggerRecovery);
    };
  }, [refreshPlans]);

  // Realtime subscription
  useEffect(() => {

    const lastStatusRef = { current: "" };

    const channel = supabase.channel("plans-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plans" },
        (payload: any) => {
          const { eventType, new: newRec, old: oldRec } = payload;

          if (eventType === "INSERT" || eventType === "UPDATE") {
            const planId = newRec.id || newRec.plan_id;

            setDbPlans(prev => {
              const matchIndex = prev.findIndex(p => p.id === planId || p.plan_id === planId);
              if (matchIndex > -1) {
                const updated = [...prev];
                updated[matchIndex] = newRec;
                return updated;
              } else {
                return [...prev, newRec];
              }
            });
          } else if (eventType === "DELETE") {
            const planId = oldRec.id || oldRec.plan_id;
            const exists = dbPlansRef.current.some(p => p.id === planId || p.plan_id === planId);
            if (!exists) return;

            setDbPlans(prev => {
              return prev.filter(p => p.id !== planId && p.plan_id !== planId);
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plan_participants" },
        (payload: any) => {
          const { eventType, new: newRec, old: oldRec } = payload;

          if (eventType === "INSERT" || eventType === "UPDATE") {
            const planId = newRec.plan_id;
            const userIdVal = newRec.user_id;

            setDbPlanParticipants(prev => {
              const matchIndex = prev.findIndex(pp => pp.plan_id === planId && pp.user_id === userIdVal);
              if (matchIndex > -1) {
                const updated = [...prev];
                updated[matchIndex] = newRec;
                return updated;
              } else {
                return [...prev, newRec];
              }
            });
          } else if (eventType === "DELETE") {
            const planId = oldRec.plan_id;
            const userIdVal = oldRec.user_id;

            const planExists = dbPlansRef.current.some(p => p.id === planId || p.plan_id === planId);
            if (!planExists) return;

            setDbPlanParticipants(prev => {
              return prev.filter(pp => !(pp.plan_id === planId && pp.user_id === userIdVal));
            });
          }
        }
      )

      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memories" },
        (payload: any) => {
          const { eventType, new: newRec, old: oldRec } = payload;

          if (eventType === "INSERT" || eventType === "UPDATE") {
            const memoryId = newRec.id;

            setDbMemories(prev => {
              const matchIndex = prev.findIndex(m => m.id === memoryId);
              if (matchIndex > -1) {
                const updated = [...prev];
                updated[matchIndex] = newRec;
                return updated;
              } else {
                return [...prev, newRec];
              }
            });
          } else if (eventType === "DELETE") {
            const memoryId = oldRec.id;

            setDbMemories(prev => {
              return prev.filter(m => m.id !== memoryId);
            });
          }
        }
      )
      .subscribe((status) => {
        lastStatusRef.current = status;
      });

    return () => {
      channel.unsubscribe();
    };
  }, [refreshPlans]);

  // Detect missing user IDs in dbPlanParticipants and fetch them into canonical dbUsers store
  const fetchingUserIdsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (dbPlanParticipants.length === 0) return;

    const existingUserIds = new Set<string>();
    (dbUsers || []).forEach(u => {
      if (u.id) existingUserIds.add(u.id);
      if (u.user_id) existingUserIds.add(u.user_id);
    });

    const missingUserIds: string[] = [];
    dbPlanParticipants.forEach(pp => {
      const uid = pp.user_id;
      if (uid && !existingUserIds.has(uid) && !fetchingUserIdsRef.current.has(uid)) {
        missingUserIds.push(uid);
      }
    });

    if (missingUserIds.length === 0) return;

    missingUserIds.forEach(id => fetchingUserIdsRef.current.add(id));

    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, public_id, full_name, profile_photo_path, bio")
          .in("id", missingUserIds);

        if (error) {
          console.error("[PlansContext] Error fetching missing user profiles:", error);
          return;
        }

        if (data && data.length > 0 && isMounted) {
          const fetchedUsers: User[] = data.map(u => ({
            id: u.id,
            user_id: u.public_id || u.id,
            username: (u.full_name || "user").toLowerCase().replace(/\s+/g, ""),
            full_name: u.full_name || "Participant",
            phone_number: "",
            profile_photo: u.profile_photo_path || "",
            bio: u.bio || "",
            college_or_work: "",
            created_at: new Date().toISOString(),
            wallet_balance: 0,
            active_status: true,
          }));

          setDbUsers(prev => {
            const currentIds = new Set(prev.map(p => p.id));
            const toAdd = fetchedUsers.filter(u => !currentIds.has(u.id));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });
        }
      } finally {
        missingUserIds.forEach(id => fetchingUserIdsRef.current.delete(id));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [dbPlanParticipants, dbUsers, setDbUsers]);

  // Consolidated Derived plans mapping pipeline — pure projection, no effect needed
  const plans = useMemo(() => {
    const mapped = mapPlansToLegacyPlans(dbPlans, dbPlanParticipants, planUsers, userId, dbCircles);
    return mapped;
  }, [dbPlans, dbPlanParticipants, planUsers, userId, dbCircles]);

  const insertSystemMessage = async (planUuid: string, content: string, actorUuid: string | null) => {
    // circle_messages is deprecated in V2, and chat_messages does not store system messages.

    return;
  };

  const {
    dbPlanTeamAssignments,
    setDbPlanTeamAssignments,
    getTeamAssignments,
    assignTeam,
    unassignTeam
  } = usePlanTeams({ dbUsers: dbUsers, insertSystemMessage });

  const {
    joinPlan,
    leavePlan,
    skipPlan,
    requestPaidPlanLeave,
    cancelPaidPlanLeaveRequest,
    resolvePaidPlanLeaveRequest,
    rejoinPlan,
    removeParticipant,
    promoteWaitlistIfSpotsAvailable,
    handleParticipantStatusChange,
    addParticipantsToPlan,
    promoteWaitlistParticipant,
    rebalanceCapacity,
    getAvailableCapacity,
    moveParticipantToGoing,
    moveParticipantToWaitlist,
    moveParticipantToInvited,
    swapParticipants,
    removeAndReplaceWithWaitlist,
    reorderWaitlist,
    switchToAutomaticWaitlistMode
  } = usePlanParticipants({
    userId,
    dbUsers: dbUsers,
    dbPlans,
    plans,
    dbPlanParticipants,
    setDbPlanParticipants,
    insertSystemMessage,
    refreshPlans: (targetTables) => refreshPlans(targetTables, "plan_participant_mutation"),
    unassignTeam,
    dbCircleMembers
  });
  const waitlistPlan = async (rawPlanId: string, userProfile: any) => {
    const planId = cleanPlanId(rawPlanId);
    return joinPlan(planId, userProfile, {
      forceStatus: "waitlist",
      skipPayment: true
    });
  };

  const passPlan = async (planId: string, passerId: string) => {
    const matchedPlan = plans.find(p => p.id === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = resolveUserUuid(passerId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] Cannot pass plan: user UUID is missing or invalid:`, userUuid);
      return;
    } const existingBefore = dbPlanParticipants.find(p => p.plan_id === planUuid && p.user_id === userUuid);



    // 2. Database Persistence
    if (planUuid && userUuid) {
      if (existingBefore) {
        await updateParticipantStatus(planUuid, userUuid, "SKIPPED", undefined, new Date().toISOString(), "LEFT");
        // Clean up team assignment as they are no longer actively participating
        await removePlanTeamAssignment(planUuid, userUuid);
        setDbPlanTeamAssignments(prev => prev.filter(a => !(a.plan_id === planUuid && a.user_id === userUuid)));
        await promoteWaitlistIfSpotsAvailable(planUuid);
        await refreshPlans(undefined, "pass_plan_mutation");
      } else {
        await insertParticipant({
          plan_id: planUuid,
          user_id: userUuid,
          role: "PARTICIPANT",
          rsvp_status: "SKIPPED",
          responded_at: new Date().toISOString(),
          skip_reason: "LEFT"
        });
        await refreshPlans(undefined, "pass_plan_mutation");
      }
    }


    // 3. Sync state from DB (handled by realtime)
  };



  // ─── Plan Lifecycle ──────────────────────────────────────────────────────────
  // (changePlanHost, cancelPlan, updatePlanDetails, completePlan extracted to usePlanLifecycle)


  // ─── Wire lifecycle hook ────────────────────────────────────────────────────
  const lifecycle = usePlanLifecycle({
    plans,
    dbPlans,
    dbPlanParticipants,
    dbPlanOutcomes,
    dbCircles,
    dbCircleMembers,
    dbUsers: planUsers,
    userId,
    setDbPlans,
    setDbPlanTeamAssignments,
    refreshPlans,
    insertSystemMessage,
    promoteWaitlistIfSpotsAvailable,
    rebalanceCapacity,
  });

  // Reminder System
  const sendReminder = (planId: string, targetUserId: string) => {
    // Database Persistence — state update is handled by next refresh
    const matchedPlan = plans.find(p => p.id === planId);
    const planUuid = matchedPlan?.dbUuid;
    const senderUuid = resolveUserUuid(userId);

    if (planUuid && senderUuid) {
      insertPlanReminder({
        plan_id: planUuid,
        sent_by: senderUuid
      });
    }
  };

  const ignoreReminder = (planId: string, ignoreUserId: string) => {
    passPlan(planId, ignoreUserId);
  };

  // ─── Accept Plan ──────────────────────────────────────────────────────────
  // Participant accepts the plan invitation. After all non-host participants
  // accept, the plan's acceptance_status transitions to "confirmed" so the
  // host sees a Pay Now button.
  const acceptPlan = async (rawPlanId: string, userProfile: any) => {
    const planId = cleanPlanId(rawPlanId);
    const matchedPlan = plans.find((p) => p.id === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = userProfile.dbUuid || resolveUserUuid(userProfile.user_id || userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] acceptPlan: invalid UUID`, userUuid);
      return;
    }

    // 1. Resolve capacity decision
    const acceptedCount = dbPlanParticipants.filter(
      pp => (pp.plan_id === planUuid || pp.plan_id === planId) &&
        pp.rsvp_status === "JOINED"
    ).length;
    const limit = matchedPlan?.capacity || matchedPlan?.joinLimit || matchedPlan?.maxSpots || 0;
    const targetDbState = (limit > 0 && acceptedCount >= limit) ? "WAITLISTED" : "JOINED";

    const existing = dbPlanParticipants.find(
      (p) => (p.plan_id === planUuid || p.plan_id === planId) && p.user_id === userUuid
    );

    if (existing) {
      await updateParticipantStatus(
        planUuid,
        userUuid,
        targetDbState as any,
        undefined,
        new Date().toISOString(),
        null
      );
    } else {
      await insertParticipant({
        plan_id: planUuid,
        user_id: userUuid,
        role: "PARTICIPANT",
        rsvp_status: targetDbState as any,
        responded_at: new Date().toISOString(),
        skip_reason: null
      });
    }
    await handleParticipantStatusChange(planUuid, userUuid, existing?.rsvp_status, targetDbState);



    // 2. Check if all non-host participants have accepted (state updated via realtime)
    const freshParticipants = await api.getFreshParticipants();
    const planParticipants = freshParticipants.filter(
      (pp: any) => pp.plan_id === planUuid
    );
    const dbPlanObj = dbPlans.find(dp => dp.id === planUuid || dp.plan_id === planId);
    const hostUuid = matchedPlan?.hostId || dbPlanObj?.host_id;
    const nonHostParticipants = planParticipants.filter(
      (pp: any) => pp.user_id !== hostUuid
    );
    const allAccepted =
      nonHostParticipants.length > 0 &&
      nonHostParticipants.every((pp: any) => {
        const norm = normalizeStatus(pp.rsvp_status);
        return norm === "JOINED" || norm === "WAITLISTED";
      });



    if (allAccepted) {
      // 3. Transition plan → confirmed via direct Supabase update
      await api.updatePlanDetails(planUuid, { acceptance_status: "confirmed" });
    }

    // Check sports threshold transition
    if (matchedPlan && (matchedPlan.category === "sports" || (matchedPlan as any).sports_type || (matchedPlan as any).venue_id)) {
      const confirmedParticipants = planParticipants.filter(
        (pp: any) => {
          const norm = normalizeStatus(pp.rsvp_status);
          return norm === "JOINED";
        }
      );
      const confirmedCount = confirmedParticipants.length;
      const required = (matchedPlan as any).required_confirmations || matchedPlan.min_participants || 0;

      if (confirmedCount >= required) {

      }
    }

    // Automatically recalculate wallet expenses when user joins/accepts
    recalculateWalletExpenses(planUuid).catch(err =>
      console.error("[acceptPlan] recalculateWalletExpenses failed:", err)
    );
  };

  // ─── Decline Plan (Skip Plan) ──────────────────────────────────────────────
  const declinePlan = async (planId: string, userProfile: any) => {
    const matchedPlan = plans.find((p) => p.id === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    const userUuid = userProfile.dbUuid || resolveUserUuid(userProfile.user_id || userId);

    if (!userUuid || !isUuid(userUuid)) {
      console.error(`[PlansContext] declinePlan: invalid UUID`, userUuid);
      return;
    }

    const existing = dbPlanParticipants.find(
      (p) => p.plan_id === planUuid && p.user_id === userUuid
    );
    if (existing) {
      const oldStatus = existing.rsvp_status;
      const wasActive = oldStatus === "JOINED" || oldStatus === "WAITLISTED";
      const targetSkipReason = wasActive ? "LEFT" : null;
      await updateParticipantStatus(planUuid, userUuid, "SKIPPED", undefined, new Date().toISOString(), targetSkipReason);
      await handleParticipantStatusChange(planUuid, userUuid, oldStatus, "SKIPPED");
      // Clean up team assignment as they are no longer actively participating
      await removePlanTeamAssignment(planUuid, userUuid);
      setDbPlanTeamAssignments(prev => prev.filter(a => !(a.plan_id === planUuid && a.user_id === userUuid)));
      await promoteWaitlistIfSpotsAvailable(planUuid);
    }
  };

  const createPlan = async (
    newDbPlan: any,
    selectedCircles: string[],
    selectedFriends: any[],
    userProfile: any,
    titleToUse: string,
    isHostSelected = true,
    priorityGuestIds: string[] = []
  ) => {
    const dbPlanRow = await api.createPlan(newDbPlan);
    const insertedPlanUuid = dbPlanRow?.id;

    if (!insertedPlanUuid) {
      throw new Error("Backend did not return the generated UUID for the new plan.");
    }

    // Generate a secure invite token
    const inviteToken = crypto.randomUUID().replace(/-/g, "");
    try {
      await api.createPlanInvite(insertedPlanUuid, inviteToken, userProfile.dbUuid);
    } catch (inviteError) {
      console.error("[PlansContext] Failed to insert plan invite token:", inviteError);
    }

    const inviteeUuids: string[] = [];
    const uniqueInviteeUuids = new Set<string>();
    const inviteeToCircleMap = new Map<string, string | null>();

    if (selectedCircles.length > 0) {
      const circleUuids = selectedCircles.map((cid) => {
        const c = dbCirclesRef.current.find((x: any) => x.circle_id === cid || x.id === cid);
        return c?.id || cid;
      });
      const targetMembers = dbCircleMembersRef.current.filter((m: any) => circleUuids.includes(m.circle_id));
      targetMembers.forEach((m: any) => {
        if (m.user_id && m.user_id !== userProfile.dbUuid) {
          uniqueInviteeUuids.add(m.user_id);
          inviteeToCircleMap.set(m.user_id, m.circle_id);
        }
      });
    }

    if (selectedFriends.length > 0) {
      selectedFriends.forEach((friendObj) => {
        const friendUuid = friendObj.dbUuid || friendObj.id || null;
        if (friendUuid && friendUuid !== userProfile.dbUuid) {
          uniqueInviteeUuids.add(friendUuid);
          if (!inviteeToCircleMap.has(friendUuid)) {
            inviteeToCircleMap.set(friendUuid, null);
          }
        }
      });
    }

    const circleUuid = newDbPlan?.circle_id || null;

    const getParticipantCircleId = (inviteeUuid: string) => {
      if (circleUuid) return circleUuid;
      const matchedMember = dbCircleMembersRef.current.find(
        (m: any) => m.user_id === inviteeUuid
      );
      return matchedMember?.circle_id || null;
    };

    const isAssignedMode = newDbPlan?.participant_filtering === 'ASSIGNED';

    // Map each friend to their host-assigned group (GOING vs WAITLIST) if in Assigned mode
    const friendAssignmentMap = new Map<string, 'GOING' | 'WAITLIST'>();
    if (isAssignedMode && selectedFriends.length > 0) {
      const priorityIds: string[] = priorityGuestIds;
      const capacity: number = newDbPlan?.max_participants || 2;
      const hostOffset = isHostSelected ? 1 : 0;
      const goingCapacityForFriends = Math.max(0, capacity - hostOffset);

      selectedFriends.forEach((f: any, index: number) => {
        const fUuid = f.dbUuid || f.id;
        if (!fUuid) return;
        // Priority guest IDs or first N friends fit into GOING; overflow into WAITLIST
        const isPriority = priorityIds.length > 0 ? priorityIds.includes(fUuid) : index < goingCapacityForFriends;
        friendAssignmentMap.set(fUuid, isPriority ? 'GOING' : 'WAITLIST');
      });
    }

    const hostJoinedAt = new Date().toISOString();
    const participantRecords: any[] = [];
    if (isHostSelected) {
      participantRecords.push({
        plan_id: insertedPlanUuid,
        user_id: userProfile.dbUuid || userProfile.id || userId,
        role: "HOST",
        rsvp_status: "JOINED",
        assigned_group: isAssignedMode ? "GOING" : null,
        responded_at: hostJoinedAt,
        circle_id: getParticipantCircleId(userProfile.dbUuid || userProfile.id || userId)
      });
    }

    const autoJoinedUuids = new Set<string>();
    uniqueInviteeUuids.forEach((inviteeUuid) => {
      inviteeUuids.push(inviteeUuid);
      let shouldAutoJoin = false;
      const cId = getParticipantCircleId(inviteeUuid);
      if (cId) {
        const circleObj = dbCirclesRef.current.find((c: any) => c.id === cId);
        if (circleObj?.allow_auto_join) {
          shouldAutoJoin = true;
          autoJoinedUuids.add(inviteeUuid);
        }
      }

      const assignedGroup = isAssignedMode
        ? (friendAssignmentMap.get(inviteeUuid) || "GOING")
        : null;

      participantRecords.push({
        plan_id: insertedPlanUuid,
        user_id: inviteeUuid,
        role: "PARTICIPANT",
        rsvp_status: shouldAutoJoin ? "JOINED" : "INVITED",
        assigned_group: assignedGroup,
        responded_at: shouldAutoJoin ? new Date().toISOString() : null,
        circle_id: cId
      });
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validParticipantRecords = participantRecords.filter(
      (rec) => rec.user_id && uuidRegex.test(rec.user_id)
    );
    const filteredParticipantRecords = validParticipantRecords.filter(
      (rec) => !dbPlanParticipantsRef.current.some((p: any) => p.plan_id === rec.plan_id && p.user_id === rec.user_id)
    );

    let dbPartRow = null;
    if (filteredParticipantRecords.length > 0) {
      const partResultData = await api.upsertParticipants(filteredParticipantRecords);
      dbPartRow = partResultData?.[0];
    }


    if (userProfile.dbUuid) {
      await syncUserStats(userProfile.dbUuid, "create_plan");
    }

    // Automatically recalculate costs/splits for the new plan
    recalculateWalletExpenses(insertedPlanUuid).catch(err =>
      console.error("[createPlan] recalculateWalletExpenses failed:", err)
    );

    await refreshPlans();

    return { dbPlanRow, dbPartRow, inviteeUuids, hostJoinedAt };
  };

  /**
   * Returns DB-accurate participant counts for a plan.
   * planUuid can be either the UUID id or the short plan_id —
   * we match against both to handle legacy data.
   */
  const getParticipantCounts = (planUuid: string): ParticipantCounts => {
    const rows = dbPlanParticipants.filter(
      pp => pp.plan_id === planUuid || (pp as any).id === planUuid
    );

    const plan = dbPlans.find(p => p.id === planUuid || p.plan_id === planUuid);
    const hostUuid = plan?.host_id;

    const breakdown = calculateParticipantBreakdown(rows);
    const { waitlisted, invited, skipped, passed, pending, total } = breakdown;

    const host = rows.some(r => r.user_id === hostUuid && normalizeStatus(r.rsvp_status) === "JOINED") ? 1 : 0;
    const going = rows.filter(r => normalizeStatus(r.rsvp_status) === "JOINED" && r.user_id !== hostUuid).length;

    return { host, going, waitlist: waitlisted, delivered: invited, skipped, passed, pending, total };
  };

  const getHomeFeedPlans = (userIdStr: string) => {
    const userUuid = resolveUserUuid(userIdStr);
    const myParticipantRecords = dbPlanParticipants.filter(pp => pp.user_id === userUuid || pp.user_id === userIdStr);

    const filtered = plans.filter(plan => {
      // Plan must be active
      const statusNorm = (plan.status || "").toLowerCase();
      if (statusNorm !== "active" && statusNorm !== "live") return false;

      // Respect response deadline for pending invitations if present
      if (plan.response_deadline_at) {
        const deadline = new Date(plan.response_deadline_at).getTime();
        const now = new Date().getTime();
        if (now > deadline) return false;
      }

      const planUuid = plan.dbUuid || plan.id;
      const ppRecord = myParticipantRecords.find(pp => pp.plan_id === planUuid);
      if (!ppRecord) return false;

      const rsvp = normalizeStatus(ppRecord.rsvp_status);
      const isHostRole = ppRecord.role === "HOST";

      // Home screen visibility strictly determined by plan_participants: role = PARTICIPANT & rsvp_status = INVITED
      return !isHostRole && rsvp === "INVITED";
    });

    return filtered.sort((a, b) => {
      const secA = getTimelineSectionValue(a);
      const secB = getTimelineSectionValue(b);
      if (secA !== secB) return secA - secB;

      const dayA = getDayIndexValue(a.date);
      const dayB = getDayIndexValue(b.date);
      if (dayA !== dayB) return dayA - dayB;

      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });
  };

  const getHubPlans = (userIdStr: string) => {
    return plans.filter(plan => {
      if (plan.status === "CANCELLED") return false;
      if (plan.hostId === userIdStr) return true;
      const member = plan.members.find(
        m => m.userId === userIdStr || (m as any).userUuid === userIdStr
      );
      return member?.joinState === "JOINED";
    });
  };


  // ─── Wire outcomes hook (submitReview, submitStats, submitMvp extracted to usePlanOutcomes) ───
  const outcomes = usePlanOutcomes({
    dbPlanOutcomes,
    setDbPlanOutcomes,
    dbUsers: planUsers,
  });

  const updateLocalPlan = useCallback((planId: string, updates: Partial<DbPlan>) => {
    setDbPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId || plan.public_id === planId
          ? {
            ...plan,
            ...updates,
          }
          : plan
      )
    );
  }, []);

  const changePlanHost = useCallback(async (planId: string, newHostUuid: string, oldHostUuid: string) => {
    await lifecycle.changePlanHost(planId, newHostUuid, oldHostUuid);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    updateLocalPlan(planUuid, { host_id: newHostUuid });
  }, [lifecycle, plans, updateLocalPlan]);

  const cancelPlan = useCallback(async (planId: string) => {
    await lifecycle.cancelPlan(planId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    updateLocalPlan(planUuid, { status: "CANCELLED" });
  }, [lifecycle, plans, updateLocalPlan]);

  const updatePlanDetails = useCallback(async (planId: string, updates: Partial<DbPlan>) => {
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId || (p as any).public_id === planId);
    const planUuid = matchedPlan?.dbUuid || planId;

    // Synchronously update local React state first so capacity bounds expand immediately
    updateLocalPlan(planUuid, updates);
    if (updates.max_participants !== undefined) {
      updateLocalPlan(planUuid, {
        max_participants: updates.max_participants,
        joinLimit: updates.max_participants,
        capacity: updates.max_participants,
      } as any);
    }

    await lifecycle.updatePlanDetails(planId, updates);
  }, [lifecycle, plans, updateLocalPlan]);

  const completePlan = useCallback(async (planId: string) => {
    await lifecycle.completePlan(planId);
    const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
    const planUuid = matchedPlan?.dbUuid || planId;
    updateLocalPlan(planUuid, { status: "COMPLETED" });
  }, [lifecycle, plans, updateLocalPlan]);

  // ─── Team Assignment Actions (moved to hook usePlanTeams) ───
  const memoizedPassPlan = useCallback(passPlan, [plans, dbPlanParticipants, userId, dbUsers]);
  const memoizedWaitlistPlan = useCallback(waitlistPlan, [plans, dbPlanParticipants, userId, dbUsers]);
  const memoizedSendReminder = useCallback(sendReminder, [plans, userId, dbUsers]);
  const memoizedIgnoreReminder = useCallback(ignoreReminder, [passPlan]);
  const memoizedGetHomeFeedPlans = useCallback(getHomeFeedPlans, [dbPlanParticipants, plans, userId, dbUsers]);
  const memoizedGetHubPlans = useCallback(getHubPlans, [plans]);
  const memoizedGetParticipantCounts = useCallback(getParticipantCounts, [dbPlanParticipants, dbPlans]);
  const memoizedAcceptPlan = useCallback(acceptPlan, [plans, dbPlanParticipants, userId, dbUsers]);
  const memoizedDeclinePlan = useCallback(declinePlan, [plans, dbPlanParticipants, userId, dbUsers]);
  const memoizedCreatePlan = useCallback(createPlan, [refreshPlans]);
  const updatePlanSettings = useCallback(
    async (
      rawPlanId: string,
      settings: {
        allow_participant_invites?: boolean;
        allowParticipantInvites?: boolean;
        max_participants?: number;
        maxParticipants?: number;
      }
    ) => {
      const planId = cleanPlanId(rawPlanId);
      const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
      const planUuid = matchedPlan?.dbUuid || planId;

      const dbPayload: any = {};
      if (settings.allow_participant_invites !== undefined || settings.allowParticipantInvites !== undefined) {
        dbPayload.allow_participant_invites = settings.allow_participant_invites ?? settings.allowParticipantInvites;
      }
      if (settings.max_participants !== undefined || settings.maxParticipants !== undefined) {
        dbPayload.max_participants = settings.max_participants ?? settings.maxParticipants;
      }

      const newAllowInvites = dbPayload.allow_participant_invites;
      const oldAllowInvites = Boolean((matchedPlan as any)?.allow_participant_invites ?? (matchedPlan as any)?.allowParticipantInvites);
      const isToggleChanged = newAllowInvites !== undefined && newAllowInvites !== oldAllowInvites;

      // 1. Persist to DB first
      await api.updatePlanSettingsInDb(planUuid, dbPayload);

      // 2. On success, update local state immediately
      setDbPlans(prev =>
        prev.map(p => (p.id === planUuid ? { ...p, ...dbPayload } : p))
      );

      // 3. Log activity when setting is toggled ON or OFF
      if (isToggleChanged && userId) {
        const actorUser = dbUsers.find(u => u.id === userId);
        const actorName = actorUser?.full_name || (actorUser as any)?.name || "Host";

        await (supabase as any)
          .from("plan_activity")
          .insert({
            plan_id: planUuid,
            actor_id: userId,
            activity_type: "participant_invite_others",
            metadata: {
              enabled: Boolean(newAllowInvites),
              performed_by: userId,
              performed_by_name: actorName,
            }
          });
      }
    },
    [plans, userId, dbUsers]
  );

  const promoteParticipantToHost = useCallback(
    async (rawPlanId: string, rawUserUuid: string) => {
      const planId = cleanPlanId(rawPlanId);
      const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
      const planUuid = matchedPlan?.dbUuid || planId;
      const resolvedUserUuid = resolveUserUuidUtil(rawUserUuid, dbUsers);

      if (!planUuid || !resolvedUserUuid) return;

      // 1. Persist to DB via RPC
      await api.promoteToHostRPC(planUuid, resolvedUserUuid);

      // 2. Optimistic update (authoritative sync happens via realtime)
      setDbPlanParticipants(prev =>
        prev.map(pp =>
          pp.plan_id === planUuid && pp.user_id === resolvedUserUuid
            ? { ...pp, role: "HOST" }
            : pp
        )
      );
    },
    [plans, dbUsers]
  );

  const demoteHostToParticipant = useCallback(
    async (rawPlanId: string, rawUserUuid: string) => {
      const planId = cleanPlanId(rawPlanId);
      const matchedPlan = plans.find(p => p.id === planId || p.dbUuid === planId);
      const planUuid = matchedPlan?.dbUuid || planId;
      const resolvedUserUuid = resolveUserUuidUtil(rawUserUuid, dbUsers);

      if (!planUuid || !resolvedUserUuid) return;

      // 1. Persist to DB via RPC
      await api.demoteFromHostRPC(planUuid, resolvedUserUuid);

      // 2. Optimistic update (authoritative sync happens via realtime)
      setDbPlanParticipants(prev =>
        prev.map(pp =>
          pp.plan_id === planUuid && pp.user_id === resolvedUserUuid
            ? { ...pp, role: "PARTICIPANT" }
            : pp
        )
      );
    },
    [plans, dbUsers]
  );

  const contextValue = useMemo(() => ({
    plans,
    dbPlans, setDbPlans,
    dbPlanParticipants, setDbPlanParticipants,
    dbPlanOutcomes, setDbPlanOutcomes,
    dbMemories, setDbMemories,
    dbMemoryResults, setDbMemoryResults,
    dbPlanTeamAssignments, setDbPlanTeamAssignments,
    getTeamAssignments,
    assignTeam,
    unassignTeam,
    joinPlan,
    leavePlan,
    passPlan: memoizedPassPlan,
    waitlistPlan: memoizedWaitlistPlan,
    sendReminder: memoizedSendReminder,
    ignoreReminder: memoizedIgnoreReminder,
    getHomeFeedPlans: memoizedGetHomeFeedPlans,
    getHubPlans: memoizedGetHubPlans,
    getParticipantCounts: memoizedGetParticipantCounts,
    refreshPlans,
    skipPlan,
    requestPaidPlanLeave,
    cancelPaidPlanLeaveRequest,
    resolvePaidPlanLeaveRequest,
    rejoinPlan,
    acceptPlan: memoizedAcceptPlan,
    declinePlan: memoizedDeclinePlan,
    createPlan: memoizedCreatePlan,
    changePlanHost: lifecycle.changePlanHost,
    cancelPlan: lifecycle.cancelPlan,
    updatePlanDetails: lifecycle.updatePlanDetails,
    completePlan: lifecycle.completePlan,
    submitReview: outcomes.submitReview,
    submitStats: outcomes.submitStats,
    submitMvp: outcomes.submitMvp,
    removeParticipant,
    addParticipantsToPlan,
    promoteWaitlistParticipant,
    rebalanceCapacity,
    getAvailableCapacity,
    moveParticipantToGoing,
    moveParticipantToWaitlist,
    moveParticipantToInvited,
    updatePlanSettings,
    promoteParticipantToHost,
    demoteHostToParticipant,
    swapParticipants,
    removeAndReplaceWithWaitlist,
    reorderWaitlist,
    switchToAutomaticWaitlistMode
  }), [
    plans, dbPlans, dbPlanParticipants,
    dbPlanOutcomes, dbMemories, dbMemoryResults, dbPlanTeamAssignments,
    getTeamAssignments, assignTeam, unassignTeam,
    joinPlan, leavePlan, skipPlan, rejoinPlan, removeParticipant,
    memoizedPassPlan, memoizedWaitlistPlan,
    memoizedSendReminder, memoizedIgnoreReminder, memoizedGetHomeFeedPlans,
    memoizedGetHubPlans, memoizedGetParticipantCounts, refreshPlans,
    memoizedAcceptPlan, memoizedDeclinePlan,
    memoizedCreatePlan,
    lifecycle.changePlanHost, lifecycle.cancelPlan, lifecycle.updatePlanDetails,
    lifecycle.completePlan,
    outcomes.submitReview, outcomes.submitStats, outcomes.submitMvp,
    addParticipantsToPlan, promoteWaitlistParticipant, rebalanceCapacity, getAvailableCapacity,
    moveParticipantToGoing, moveParticipantToWaitlist, moveParticipantToInvited,
    updatePlanSettings, promoteParticipantToHost, demoteHostToParticipant,
    swapParticipants, removeAndReplaceWithWaitlist, reorderWaitlist, switchToAutomaticWaitlistMode
  ]);

  return (
    <PlansContext.Provider value={contextValue}>
      {children}
    </PlansContext.Provider>
  );
};

export const usePlansStore = () => {
  const context = useContext(PlansContext);
  if (context === undefined) {
    throw new Error("usePlansStore must be used within a PlansProvider");
  }
  return context;
};
