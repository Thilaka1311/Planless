import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users } from 'lucide-react';
import { Plan } from '../../../core/types';
import {
  isJoinedRsvpParticipant,
  normalizeStatus,
  sortGoingParticipants,
  formatSkipReason,
  partitionAutomaticParticipants,
  resolveParticipantVisibleTabs,
  calculateNoLimitDenominator,
} from '../../../../lib/participantStatus';
import { formatAssignedGoingList, formatAssignedWaitlist } from '../../participants/assigned/assignedCapacityLogic';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { usePlansStore } from '../state/PlansContext';
import { supabase } from '../../../../lib/supabaseClient';
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';

import { isUuid } from '../utils/planUtils';
import { SegmentedStatusToggle, StatusTabItem } from './PlansDivider';

type InlineTab = 'going' | 'invited' | 'waitlist' | 'skipped';

interface InlineParticipantViewProps {
  plan: Plan;
  activeUserId?: string;
  isHost?: boolean;
  onManageParticipants?: () => void;
  variant?: 'accordion' | 'flat';
}

interface InlineMemberEntry {
  name: string;
  avatar: string;
  userId: string;
  isHost: boolean;
  isAccepted: boolean;
  rsvp_status?: string | null;
  leave_requested?: boolean;
  assignedGroup?: string | null;
  waitlistPosition?: number | null;
  joinedQueueAt?: string | null;
  joinedQueueNumber?: number | null;
  skipReason?: string | null;
}

export function InlineParticipantView({ plan, activeUserId, isHost: isHostProp, onManageParticipants, variant = 'accordion' }: InlineParticipantViewProps) {
  const { dbPlanParticipants } = usePlansStore();
  const members = plan.members || [];
  const hostId = plan.hostId || (plan as any).host_id || (plan as any).creator_id || (plan as any).creatorId;

  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const isHostUser = isHostProp ?? Boolean(
    activeUserId && (
      activeUserId === hostId ||
      members.some(m => (m.userUuid === activeUserId || m.userId === activeUserId || (m as any).user_id === activeUserId || (m as any).id === activeUserId) && (m.role === 'HOST' || m.isHost === true))
    )
  );

  const [isExpanded, setIsExpanded] = React.useState(false);

  const rawWaitlistMode =
    plan.participantFiltering ||
    (plan as any).participant_filtering ||
    (plan as any).waitlist_mode ||
    (plan as any).waitlistMode ||
    (plan as any).waitlist_type ||
    (plan as any).waitlistType ||
    'AUTOMATIC';

  const normalizedWaitlistMode = String(rawWaitlistMode ?? '').trim().toLowerCase();
  const isAssignedMode = normalizedWaitlistMode === 'assigned';
  const waitlistOrderMode = plan.waitlistOrderMode || (plan as any).waitlist_order_mode || 'AUTO';

  const isCompletedPlan = plan.status === 'COMPLETED';
  const rawCap =
    (plan as any).plan_size ??
    (plan as any).planSize ??
    plan.capacity ??
    plan.maxSpots ??
    plan.joinLimit;
  // isNoLimit is true when rawCap is explicitly null or undefined — NO fallback to 8/10/14
  const isNoLimit = rawCap === null || rawCap === undefined;
  const maxCapacity = isNoLimit ? 0 : Number(rawCap);

  // Helper to extract normalized final state for completed plans
  const getMemberFinalState = (m: any): string | null => {
    const raw = m.final_state || m.finalState || m.final_attendance || m.finalAttendance;
    if (raw) {
      const s = String(raw).toUpperCase();
      if (s === 'JOINED' || s === 'ATTENDED') return 'JOINED';
      if (s === 'WAITLISTED') return 'WAITLISTED';
      if (s === 'INVITED') return 'INVITED';
      if (s === 'SKIPPED' || s === 'DID_NOT_ATTEND') return 'SKIPPED';
      return s;
    }
    return null;
  };

  // Compute initial tab: the one that contains the current user
  const initialTab = React.useMemo<InlineTab>(() => {
    if (!activeUserId) return 'going';
    const currentMember = members.find((m) => {
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      return mId === activeUserId;
    });
    if (!currentMember) return 'going';

    if (isCompletedPlan) {
      const fs = getMemberFinalState(currentMember) || normalizeStatus(currentMember.joinState || (currentMember as any).rsvp_status);
      if (fs === 'JOINED') return 'going';
      if (fs === 'WAITLISTED') return 'waitlist';
      if (fs === 'INVITED') return 'going'; // No Limit completed plans → 'going'
      return 'skipped';
    }

    // No Limit editor mode: always show 'going' (Joined) tab, not 'invited'
    if (isNoLimit) return 'going';

    if (isAssignedMode) {
      const groupRaw = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
      const group = typeof groupRaw === 'string' ? groupRaw.toLowerCase() : '';
      return (group === 'waitlisted' || group === 'waitlist') ? 'waitlist' : 'going';
    }
    const status = normalizeStatus(currentMember.joinState || (currentMember as any).rsvp_status);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'going';
    return 'going';
  }, [members, activeUserId, isAssignedMode, isNoLimit, plan.status]);

  const [activeTab, setActiveTab] = React.useState<InlineTab>(initialTab);

  const targetPlanUuid = (plan as any).dbUuid || plan.id;

  const [liveAssignedParticipants, setLiveAssignedParticipants] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    if (!isAssignedMode || !targetPlanUuid || !isUuid(targetPlanUuid)) return;

    const fetchParticipants = async (reason = 'INITIAL') => {
      const { data, error } = await supabase
        .from('plan_participants')
        .select('user_id, assigned_group, waitlist_position, rsvp_status, skip_reason')
        .eq('plan_id', targetPlanUuid);
      
      if (!error && data) {
        setLiveAssignedParticipants(data as any[]);
      }
    };

    fetchParticipants('INITIAL_MOUNT');

    const channel = supabase.channel(`inline-participants-${targetPlanUuid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plan_participants', filter: `plan_id=eq.${targetPlanUuid}` },
        () => {
          fetchParticipants('REALTIME_EVENT');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAssignedMode, targetPlanUuid]);

  const planDbParticipants = useMemo(() => {
    if (!dbPlanParticipants || dbPlanParticipants.length === 0) return [];
    return dbPlanParticipants.filter((pp: any) =>
      pp.plan_id === targetPlanUuid ||
      pp.plan_id === plan.id ||
      (plan as any).dbUuid === pp.plan_id
    );
  }, [dbPlanParticipants, targetPlanUuid, plan.id, (plan as any).dbUuid]);

  const hasPendingParticipantAction = useMemo(() => {
    const hasDbPending = (planDbParticipants || []).some((pp: any) => {
      const status = (pp.rsvp_status || '').toUpperCase();
      const isRejoined = status === 'REJOINED';
      const isLeaveRequested = Boolean(pp.leave_requested === true && status !== 'SKIPPED');
      return isRejoined || isLeaveRequested;
    });
    if (hasDbPending) return true;
    const membersList = plan.members || [];
    return membersList.some((m: any) => {
      const status = String(m.rsvp_status || m.joinState || (m as any).rsvpStatus || '').toUpperCase();
      const isRejoined = status === 'REJOINED';
      const isLeaveRequested = Boolean((m.leave_requested === true || (m as any).leaveRequested === true) && status !== 'SKIPPED');
      return isRejoined || isLeaveRequested;
    });
  }, [planDbParticipants, plan.members]);

  const groups = useMemo(() => {
    const sortAlpha = (list: InlineMemberEntry[]) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    const prioritizeUserAndSortGoing = (list: InlineMemberEntry[]) => {
      return sortGoingParticipants(list, activeUserId);
    };

    // ----------------------------------------------------------------------
    // NEW CLEAN ASSIGNED MODE PIPELINE
    // ----------------------------------------------------------------------
    if (isAssignedMode) {
      const going: InlineMemberEntry[] = [];
      const waitlist: InlineMemberEntry[] = [];
      const skipped: InlineMemberEntry[] = [];

      const activeSource = (liveAssignedParticipants && liveAssignedParticipants.length > 0)
        ? liveAssignedParticipants
        : (planDbParticipants && planDbParticipants.length > 0)
          ? planDbParticipants
          : members;

      // 1. Create lookup map for canonical user_id -> dbRow (combining live and store data, live takes precedence)
      const dbRowByUserId = new Map<string, any>();
      for (const pp of (planDbParticipants || [])) {
        const uId = pp.user_id || (pp as any).userUuid || (pp as any).userId || pp.id || (pp as any).dbUuid;
        if (uId) {
          dbRowByUserId.set(String(uId).toLowerCase(), pp);
        }
      }
      for (const pp of (liveAssignedParticipants || [])) {
        const uId = pp.user_id || pp.userUuid || pp.userId || pp.id || pp.dbUuid;
        if (uId) {
          dbRowByUserId.set(String(uId).toLowerCase(), pp);
        }
      }

      // 2. Iterate across all available participant records
      const participantIdSet = new Set<string>();
      const combinedSources: any[] = [
        ...(planDbParticipants || []),
        ...(liveAssignedParticipants || []),
        ...(members || []),
      ];
      for (const p of combinedSources) {
        const uId = p.user_id || p.userUuid || p.userId || p.id || p.dbUuid;
        if (uId) {
          participantIdSet.add(String(uId).toLowerCase());
        }
      }

      for (const rowUserId of participantIdSet) {
        const dbRow = dbRowByUserId.get(rowUserId);

        const m = members.find((member) => {
          const mId =
            member.userUuid ||
            member.userId ||
            (member as any).user_id ||
            (member as any).id ||
            (member as any).dbUuid;
          return mId && String(mId).toLowerCase() === rowUserId;
        });

        const isHostRole = m
          ? (m.role === 'HOST' || m.isHost === true)
          : (dbRow?.role === 'HOST' || dbRow?.isHost === true);
        const isCurrentUser = Boolean(
          activeUserId && rowUserId === String(activeUserId).toLowerCase()
        );

        const rawStatus =
          dbRow?.rsvp_status ||
          dbRow?.rsvpStatus ||
          m?.joinState ||
          (m as any)?.rsvp_status ||
          (m as any)?.rsvpStatus;
        let effectiveStatus = normalizeStatus(rawStatus);

        // 3. Read assigned_group directly from database row or member
        const dbAssignedGroup =
          dbRow?.assigned_group ||
          dbRow?.assignedGroup ||
          (m as any)?.assigned_group ||
          (m as any)?.assignedGroup;
        const assignedGroup =
          typeof dbAssignedGroup === 'string' ? dbAssignedGroup.toLowerCase() : '';

        if (isCompletedPlan) {
          const finalState = m ? getMemberFinalState(m) : null;
          const isAttended =
            finalState === 'JOINED' ||
            (finalState === null &&
              (effectiveStatus === 'JOINED' || assignedGroup === 'going'));
          if (isAttended) {
            effectiveStatus = 'JOINED';
          } else {
            effectiveStatus = 'SKIPPED';
          }
        }
        const isAccepted =
          effectiveStatus !== 'INVITED' && effectiveStatus !== 'SKIPPED';

        // 4. Read waitlist_position directly from database row or member
        const rawPos =
          dbRow?.waitlist_position ??
          dbRow?.waitlistPosition ??
          (m as any)?.waitlistPosition ??
          (m as any)?.waitlist_position ??
          null;
        const waitlistPosition =
          typeof rawPos === 'number'
            ? rawPos
            : rawPos !== null && !isNaN(Number(rawPos))
              ? Number(rawPos)
              : null;

        const entry: InlineMemberEntry = {
          name: isCurrentUser
            ? 'You'
            : (m?.name ||
              dbRow?.name ||
              (dbRow as any)?.user_profile?.full_name ||
              'Unknown'),
          avatar:
            m?.avatar ||
            dbRow?.avatar ||
            (dbRow as any)?.user_profile?.profile_photo_path ||
            '',
          userId: (
            m?.userId ||
            m?.userUuid ||
            (m as any)?.user_id ||
            (m as any)?.id ||
            (m as any)?.dbUuid ||
            dbRow?.user_id ||
            dbRow?.userUuid ||
            rowUserId ||
            ''
          ),
          isHost: Boolean(isHostRole),
          isAccepted,
          rsvp_status: effectiveStatus,
          leave_requested: Boolean(
            dbRow?.leave_requested || (m as any)?.leave_requested
          ),
          assignedGroup,
          waitlistPosition,
          joinedQueueAt: null, // Explicitly no fallback in assigned mode
          skipReason:
            effectiveStatus === 'REJOINED'
              ? null
              : (dbRow?.skip_reason ||
                dbRow?.skipReason ||
                (m as any)?.skipReason ||
                (m as any)?.skip_reason ||
                null),
        };

        // 5. Split into Going / Waitlisted / Skipped
        if (isCompletedPlan) {
          if (effectiveStatus === 'JOINED') {
            going.push(entry);
          } else {
            skipped.push(entry);
          }
        } else if (
          effectiveStatus === 'SKIPPED' ||
          effectiveStatus === 'REJOINED'
        ) {
          skipped.push(entry);
        } else if (
          assignedGroup === 'waitlisted' ||
          assignedGroup === 'waitlist'
        ) {
          waitlist.push(entry);
        } else if (assignedGroup === 'going') {
          going.push(entry);
        } else {
          // If no assigned group is set in DB yet, put them in going for now
          going.push(entry);
        }
      }

      // 6. In Assigned mode, participant assignments are explicitly determined by host / DB.
      // Do not perform synthetic client-side demotions that strip participants of their
      // database assignments or produce inconsistent waitlist entries without positions.
      const effectiveGoing = going;
      const effectiveWaitlist = waitlist;

      // 7. Validate & sort waitlisted strictly by waitlist_position ASC
      effectiveWaitlist.forEach((entry) => {
        const isWaitlistGroup = entry.assignedGroup === 'waitlisted' || entry.assignedGroup === 'waitlist';
        const isInvited = entry.rsvp_status === 'INVITED';
        const hasNoPosition = entry.waitlistPosition === null || entry.waitlistPosition === undefined || typeof entry.waitlistPosition !== 'number';
        if (isWaitlistGroup && hasNoPosition && !isInvited && entry.name) {
          console.warn(`[INLINE_ASSIGNED] Missing waitlist_position`, {
            plan_id: plan.id,
            user_id: entry.userId,
            name: entry.name
          });
        }
      });

      const waitlistSorted = [...effectiveWaitlist].sort((a, b) => {
        const posA = typeof a.waitlistPosition === 'number' ? a.waitlistPosition : Number.MAX_SAFE_INTEGER;
        const posB = typeof b.waitlistPosition === 'number' ? b.waitlistPosition : Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;

        const isAWaitlisted = a.rsvp_status === 'WAITLISTED';
        const isBWaitlisted = b.rsvp_status === 'WAITLISTED';
        if (isAWaitlisted && !isBWaitlisted) return -1;
        if (!isAWaitlisted && isBWaitlisted) return 1;

        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      }).map((e, idx) => {
        return {
          ...e,
          waitlistPosition: typeof e.waitlistPosition === 'number'
            ? e.waitlistPosition
            : (idx + 1),
        };
      });

      const cleanGoing = effectiveGoing.map((e) => ({ ...e, waitlistPosition: null }));
      const cleanSkipped = skipped.map((e) => ({ ...e, waitlistPosition: null }));

      const goingJoinedCount = isCompletedPlan
        ? cleanGoing.length
        : cleanGoing.filter(isJoinedRsvpParticipant).length;

      return {
        goingJoinedCount,
        going: formatAssignedGoingList(cleanGoing, activeUserId),
        invited: [], // No invited section in assigned mode
        waitlist: isCompletedPlan ? [] : formatAssignedWaitlist(waitlistSorted, activeUserId),
        skipped: prioritizeUserAndSortGoing(cleanSkipped)
      };
    }

    // ----------------------------------------------------------------------
    // AUTOMATIC MODE PIPELINE (Centralized via partitionAutomaticParticipants)
    // ----------------------------------------------------------------------

    const convertedEntries: InlineMemberEntry[] = members.map((m) => {
      const isHostRole = m.role === 'HOST' || m.isHost === true;
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      const isCurrentUser = Boolean(activeUserId && mId === activeUserId);

      const dbRow = planDbParticipants.find((pp: any) => {
        const pId = pp.user_id || pp.userUuid || pp.id;
        return pId && String(pId).toLowerCase() === String(mId).toLowerCase();
      });

      let effectiveStatus = normalizeStatus(dbRow?.rsvp_status || m.joinState || (m as any).rsvp_status);
      if (isCompletedPlan) {
        const finalState = getMemberFinalState(m);
        const isAttended = finalState === 'JOINED' || (finalState === null && effectiveStatus === 'JOINED');
        effectiveStatus = isAttended ? 'JOINED' : 'SKIPPED';
      }
      const isAccepted = effectiveStatus !== 'INVITED' && effectiveStatus !== 'SKIPPED' && effectiveStatus !== 'REJOINED';
      const isActivelyJoined = effectiveStatus === 'JOINED' || effectiveStatus === 'WAITLISTED' || effectiveStatus === 'REJOINED' || isHostRole;
      const joinedQueueAt = isActivelyJoined
        ? (dbRow?.joined_queue_at || (m as any).joined_queue_at || (m as any).joinedQueueAt || (m as any).join_queue_at || null)
        : null;

      return {
        name: isCurrentUser ? 'You' : (m.name || (dbRow as any)?.name || 'Unknown'),
        avatar: m.avatar || '',
        userId: (
          mId ||
          (m as any)?.dbUuid ||
          dbRow?.user_id ||
          (dbRow as any)?.userUuid ||
          ''
        ),
        isHost: Boolean(isHostRole || dbRow?.role === 'HOST'),
        isAccepted,
        rsvp_status: effectiveStatus,
        joinState: effectiveStatus,
        leave_requested: Boolean(dbRow?.leave_requested || (m as any).leave_requested),
        waitlistPosition: dbRow?.waitlist_position ?? (m as any).waitlistPosition ?? (m as any).waitlist_position ?? null,
        joinedQueueAt,
        join_queue_at: joinedQueueAt,
        skipReason: dbRow?.skip_reason || (m as any).skipReason || (m as any).skip_reason || (effectiveStatus === 'REJOINED' ? 'LEFT' : null),
      };
    });

    if (isCompletedPlan) {
      const going = convertedEntries.filter(e => e.isAccepted);
      const skipped = convertedEntries.filter(e => !e.isAccepted);
      return {
        goingJoinedCount: going.length,
        going: prioritizeUserAndSortGoing(going),
        invited: [],
        waitlist: [],
        skipped: prioritizeUserAndSortGoing(skipped),
      };
    }

    const autoPartitioned = partitionAutomaticParticipants(convertedEntries, maxCapacity, activeUserId);

    return {
      goingJoinedCount: autoPartitioned.goingJoinedCount,
      going: autoPartitioned.going,
      invited: autoPartitioned.going,
      waitlist: autoPartitioned.waitlist,
      skipped: autoPartitioned.skipped,
    };
  }, [members, planDbParticipants, liveAssignedParticipants, activeUserId, isAssignedMode, waitlistOrderMode, plan.id, (plan as any).dbUuid, isCompletedPlan, maxCapacity]);

  const tabs = useMemo(() => {
    // The number next to "Joined" uses the exact same participant count / source of truth
    // used to calculate the "Joined" count in the Manage Participants screen (goingJoinedCount from partitionAutomaticParticipants).
    const effectiveJoinedCount = isCompletedPlan
      ? groups.going.length
      : (groups.goingJoinedCount ?? groups.going.length);

    // Use resolveParticipantVisibleTabs as the SINGLE source of truth.
    // No Limit plans in editor mode now return 'going' (green Joined), not 'invited'.
    const visibleKeys = resolveParticipantVisibleTabs({
      mode: 'editor',
      waitlistMode: normalizedWaitlistMode,
      capacity: isNoLimit ? null : maxCapacity,
      goingCount: groups.going.length,
      waitlistCount: groups.waitlist.length,
      skippedCount: groups.skipped.length,
      isCompletedPlan,
    });

    return visibleKeys.map((key) => {
      let label = '';
      let count = 0;
      let countLabel = '';
      if (isCompletedPlan) {
        if (key === 'going') { label = 'Attended'; count = groups.going.length; countLabel = `${groups.going.length}`; }
        if (key === 'skipped') { label = 'Skipped'; count = groups.skipped.length; countLabel = `${groups.skipped.length}`; }
      } else {
        if (key === 'invited') { label = `Invited`; count = groups.going.length; countLabel = `${groups.going.length}`; }
        if (key === 'going') {
          label = `Joined`;
          count = effectiveJoinedCount;
          const noLimitDenominator = calculateNoLimitDenominator([
            ...groups.going,
            ...groups.waitlist,
            ...groups.skipped,
          ]);
          const denominator = isNoLimit ? noLimitDenominator : maxCapacity;
          countLabel = (denominator !== undefined && denominator !== null) ? `${effectiveJoinedCount} / ${denominator}` : `${effectiveJoinedCount}`;
        }
        if (key === 'waitlist') { label = `Waitlist`; count = groups.waitlist.length; countLabel = `${groups.waitlist.length}`; }
        if (key === 'skipped') { label = `Skipped`; count = groups.skipped.length; countLabel = `${groups.skipped.length}`; }
      }
      return { key: key as InlineTab, label, count, countLabel };
    });
  }, [groups, isAssignedMode, isNoLimit, isCompletedPlan, maxCapacity, normalizedWaitlistMode]);

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  // When activeTab is 'invited', render groups.going (they are shown as Invited in No Limit mode)
  const activeList = (activeTab === 'invited' ? groups.going : groups[activeTab]) || [];
  const getParticipantQueueNumberDisplay = (person: InlineMemberEntry, idx: number): string | null => {
    if (isAssignedMode) {
      if (activeTab === 'waitlist') return `#${idx + 1}`;
      return null;
    }

    // Automatic mode:
    // Joined section NEVER shows numbers.
    if (activeTab === 'going' || activeTab === 'invited') {
      return null;
    }

    // Waitlist section:
    // Only participants who actually joined and entered the queue have a waitlist position (#1, #2, ...).
    // Invited participants below them have NO numbers.
    if (activeTab === 'waitlist') {
      const pos = person.waitlistPosition ?? (person as any).waitlist_position;
      if (typeof pos === 'number') {
        return `#${pos}`;
      }
      return null;
    }

    return null;
  };

  const allForStrip = isCompletedPlan ? [...groups.going, ...groups.skipped] : [...groups.going, ...groups.invited, ...groups.waitlist];
  const maxAvatars = 4;
  const visibleAvatars = allForStrip.slice(0, maxAvatars);
  const overflowCount = allForStrip.length - maxAvatars;

  const isParticipantView = !isHostUser && !isCompletedPlan;

  const completedCount = (plan as any).attended_participants ?? (plan as any).attendedParticipants ?? groups.going.length;

  const statusTabs: StatusTabItem<InlineTab>[] = useMemo(() => {
    return tabs.map((tab) => ({
      id: tab.key,
      label: tab.countLabel ? `${tab.label} (${tab.countLabel})` : `${tab.label} (${tab.count})`,
      statusType: tab.key,
    }));
  }, [tabs]);

  // Render streamlined view for normal participants on live plans, or if variant is explicitly flat:
  // Starts directly with status toggle, always expanded, no header row, no outer card box.
  if (isParticipantView || variant === 'flat') {
    const flatMaxHeight = isHostUser ? 'max-h-[calc(100dvh-480px)]' : 'max-h-[calc(100dvh-440px)]';

    return (
      <div className="w-full text-left space-y-2 flex flex-col flex-1 min-h-0">
        {statusTabs.length > 0 && (
          <div className="w-full flex-shrink-0 no-hold">
            <SegmentedStatusToggle<InlineTab>
              tabs={statusTabs}
              selected={activeTab}
              onSelect={(id) => setActiveTab(id)}
              layoutId={`inline_participant_${plan.id}_active_pill`}
            />
          </div>
        )}

        <div className="px-1 py-0.5 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-none pb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`inline-tab-${activeTab || 'going'}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="space-y-0.5"
            >
              {activeList.length === 0 ? (
                <p className="text-[12px] text-white/30 font-sans py-1.5 px-1">No one here yet.</p>
              ) : (
                activeList.map((person, idx) => {
                  const personKey = person.userId || (person as any).userUuid || (person as any).user_id || (person as any).id || (person as any).dbUuid;
                  if (!personKey) return null;
                  return (
                    <div
                      key={personKey}
                      onClick={() => {
                        if (person.userId) {
                          setSelectedProfileUserId(person.userId);
                        }
                      }}
                    className={`flex items-center gap-3 py-1.5 px-2 rounded-xl cursor-pointer hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150 select-none ${
                      person.isAccepted ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {getParticipantQueueNumberDisplay(person, idx) && (
                      <span className="text-[11px] font-bold text-white/50 w-6 min-w-[24px] inline-flex items-center shrink-0 font-sans">
                        {getParticipantQueueNumberDisplay(person, idx)}
                      </span>
                    )}
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
                        <UserAvatar src={person.avatar} alt={person.name} size="w-full h-full" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className={`font-sans text-[13.5px] font-semibold leading-none truncate ${
                        person.isAccepted ? 'text-white' : 'text-[#8E8E93]'
                      }`}>
                        {person.name}
                      </span>
                    </div>
                    {activeTab === 'skipped' && person.skipReason && (
                      <span className="text-[11px] font-medium text-white/50 truncate max-w-[100px] text-right font-sans">
                        {formatSkipReason(person.skipReason)}
                      </span>
                    )}
                    {person.isHost && (
                      <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                        Host
                      </span>
                    )}
                  </div>
                );
              })
            )}
            </motion.div>
          </AnimatePresence>
        </div>

        <FriendProfileViewerBottomSheet
          friendUserId={selectedProfileUserId}
          onClose={() => setSelectedProfileUserId(null)}
          source="preview"
        />
      </div>
    );
  }

  return (
    <div className="w-full bg-black/15 backdrop-blur-3xl border border-white/[0.06] shadow-lg rounded-2xl overflow-hidden text-left">
      {/* Header — always visible, tap to expand */}
      <button
        type="button"
        id="inline_participant_toggle"
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        {isCompletedPlan ? (
          <>
            {/* Left: Overlapping Avatars + "X participants" label in single flex row */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3 overflow-hidden py-0.5">
                {visibleAvatars.map((p, i) => (
                  <div
                    key={p.userId || i}
                    className="w-9 h-9 rounded-full border-2 border-[#000000] bg-[#111111] overflow-hidden flex-shrink-0 shadow-md"
                    style={{ zIndex: maxAvatars - i }}
                  >
                    <UserAvatar src={p.avatar} alt={p.name} size="w-full h-full" />
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="w-9 h-9 rounded-full border-2 border-[#000000] bg-[#1A1A1A] flex items-center justify-center text-[11px] font-sans font-medium text-white/90 z-10 flex-shrink-0 shadow-md">
                    +{overflowCount}
                  </div>
                )}
              </div>

              <span className="text-[13px] font-medium text-white/70 font-sans">
                {completedCount} {completedCount === 1 ? 'participant' : 'participants'}
              </span>
            </div>

            {/* Right: Manage Participants icon + Expand/collapse chevron */}
            <div className="flex items-center gap-2 pl-2">
              {onManageParticipants && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageParticipants();
                  }}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                  title="Manage Participants"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="text-white/40 text-[11px] font-bold inline-block"
              >
                ▼
              </motion.span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3 overflow-hidden py-0.5">
                {visibleAvatars.map((p, i) => (
                  <div
                    key={p.userId || i}
                    className="w-9 h-9 rounded-full border-2 border-[#000000] bg-[#111111] overflow-hidden flex-shrink-0 shadow-md"
                    style={{ zIndex: maxAvatars - i }}
                  >
                    <UserAvatar src={p.avatar} alt={p.name} size="w-full h-full" />
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="w-9 h-9 rounded-full border-2 border-[#000000] bg-[#1A1A1A] flex items-center justify-center text-[11px] font-sans font-medium text-white/90 z-10 flex-shrink-0 shadow-md">
                    +{overflowCount}
                  </div>
                )}
              </div>

              <span className="text-[13px] font-medium text-white/70 font-sans">
                {allForStrip.length} {allForStrip.length === 1 ? 'participant' : 'participants'}
              </span>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {onManageParticipants && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageParticipants();
                  }}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                  title="Manage Participants"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="text-white/40 text-[11px] font-bold inline-block"
              >
                ▼
              </motion.span>
            </div>
          </>
        )}
      </button>

      {/* Inline expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="inline-participant-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="w-full h-px bg-white/[0.06]" />

            {/* Segmented page divider toggle */}
            {statusTabs.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <SegmentedStatusToggle<InlineTab>
                  tabs={statusTabs}
                  selected={activeTab}
                  onSelect={(id) => setActiveTab(id)}
                  layoutId={`inline_participant_acc_${plan.id}_active_pill`}
                />
              </div>
            )}

            {/* Participant list */}
            <div className="px-4 pb-5 pt-3 max-h-[260px] overflow-y-auto scrollbar-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`inline-tab-${activeTab || 'going'}`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="space-y-0.5"
                >
                  {activeList.length === 0 ? (
                    <p className="text-[12px] text-white/30 font-sans py-2 px-1">No one here yet.</p>
                  ) : (
                    activeList.map((person, idx) => {
                      const personKey = person.userId || (person as any).userUuid || (person as any).user_id || (person as any).id || (person as any).dbUuid;
                      if (!personKey) return null;
                      return (
                        <div
                          key={personKey}
                          onClick={() => {
                            if (person.userId) {
                              setSelectedProfileUserId(person.userId);
                            }
                          }}
                        className={`flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150 select-none ${
                          person.isAccepted ? 'opacity-100' : 'opacity-70'
                        }`}
                      >
                        {getParticipantQueueNumberDisplay(person, idx) && (
                          <span className="text-[11px] font-bold text-white/50 w-6 min-w-[24px] inline-flex items-center shrink-0 font-sans">
                            {getParticipantQueueNumberDisplay(person, idx)}
                          </span>
                        )}
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
                            <UserAvatar src={person.avatar} alt={person.name} size="w-full h-full" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className={`font-sans text-[13.5px] font-semibold leading-none truncate ${
                            person.isAccepted ? 'text-white' : 'text-[#8E8E93]'
                          }`}>
                            {person.name}
                          </span>
                        </div>
                        {activeTab === 'skipped' && person.skipReason && (
                          <span className="text-[11px] font-medium text-white/50 truncate max-w-[100px] text-right font-sans">
                            {formatSkipReason(person.skipReason)}
                          </span>
                        )}
                        {person.isHost && (
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                            Host
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
                </motion.div>
              </AnimatePresence>
            </div>

            {onManageParticipants && (
              <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageParticipants();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/10 transition flex items-center justify-center gap-2 text-xs font-semibold text-white/90 cursor-pointer shadow-sm"
                >
                  <Users className="w-4 h-4 text-white/70" />
                  <span>Manage Participants</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <FriendProfileViewerBottomSheet
        friendUserId={selectedProfileUserId}
        onClose={() => setSelectedProfileUserId(null)}
        source="preview"
      />
    </div>
  );
}

