import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users } from 'lucide-react';
import { Plan } from '../../../core/types';
import { normalizeStatus, sortGoingParticipants, formatSkipReason, partitionAutomaticParticipants } from '../../../../lib/participantStatus';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';
import { usePlansStore } from '../state/PlansContext';
import { supabase } from '../../../../lib/supabaseClient';
import { FriendProfileViewerBottomSheet } from '../../friendships/components/FriendProfileViewerBottomSheet';

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
  assignedGroup?: string | null;
  waitlistPosition?: number | null;
  joinedQueueAt?: string | null;
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
  const maxCapacity = plan.maxSpots || plan.capacity || plan.joinLimit || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);

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
      if (fs === 'INVITED') return 'invited';
      return 'skipped';
    }

    if (isAssignedMode) {
      const groupRaw = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
      const group = typeof groupRaw === 'string' ? groupRaw.toLowerCase() : '';
      return (group === 'waitlisted' || group === 'waitlist') ? 'waitlist' : 'going';
    }
    const status = normalizeStatus(currentMember.joinState || (currentMember as any).rsvp_status);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'invited';
    return 'going';
  }, [members, activeUserId, isAssignedMode, plan.status]);

  const [activeTab, setActiveTab] = React.useState<InlineTab>(initialTab);

  const targetPlanUuid = (plan as any).dbUuid || plan.id;

  const [liveAssignedParticipants, setLiveAssignedParticipants] = React.useState<any[] | null>(null);

  React.useEffect(() => {
    if (!isAssignedMode || !targetPlanUuid) return;

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

      // 1. Create lookup map for canonical user_id -> dbRow
      const dbRowByUserId = new Map<string, any>();
      for (const pp of activeSource) {
        const uId = pp.user_id || pp.userUuid || pp.userId || pp.id || pp.dbUuid;
        if (uId) {
          dbRowByUserId.set(String(uId).toLowerCase(), pp);
        }
      }

      // 2. Map existing members through activeSource or members
      const sourceList = (activeSource && activeSource.length > 0 && ((activeSource[0] as any).user_id || (activeSource[0] as any).assigned_group || (activeSource[0] as any).assignedGroup))
        ? activeSource
        : members;

      for (const item of sourceList) {
        const rowUserId = (item as any).user_id || (item as any).userUuid || (item as any).userId || (item as any).id || (item as any).dbUuid;
        if (!rowUserId) continue;

        const m = members.find(member => {
            const mId = member.userUuid || member.userId || (member as any).user_id || (member as any).id || (member as any).dbUuid;
            return mId && String(mId).toLowerCase() === String(rowUserId).toLowerCase();
        });

        const isHostRole = m ? (m.role === 'HOST' || m.isHost === true) : ((item as any).role === 'HOST' || (item as any).isHost === true);
        const isCurrentUser = Boolean(activeUserId && String(rowUserId).toLowerCase() === String(activeUserId).toLowerCase());

        const rawStatus = m?.joinState || (m as any)?.rsvp_status || (item as any).rsvp_status || (item as any).rsvpStatus;
        let effectiveStatus = normalizeStatus(rawStatus);

        // 3. Read assigned_group directly from database row or item
        const dbAssignedGroup = (item as any).assigned_group || (item as any).assignedGroup || (m as any)?.assigned_group || (m as any)?.assignedGroup;
        const assignedGroup = typeof dbAssignedGroup === 'string' ? dbAssignedGroup.toLowerCase() : '';

        if (isCompletedPlan) {
          const finalState = m ? getMemberFinalState(m) : null;
          const isAttended = finalState === 'JOINED' || (finalState === null && (effectiveStatus === 'JOINED' || assignedGroup === 'going'));
          if (isAttended) {
            effectiveStatus = 'JOINED';
          } else {
            effectiveStatus = 'SKIPPED';
          }
        }
        const isAccepted = effectiveStatus !== 'INVITED' && effectiveStatus !== 'SKIPPED';

        // 4. Read waitlist_position directly from database row or item or member
        const waitlistPosition = (item as any).waitlist_position ?? (item as any).waitlistPosition ?? (m as any)?.waitlistPosition ?? (m as any)?.waitlist_position ?? null;

        const entry: InlineMemberEntry = {
          name: isCurrentUser ? 'You' : (m?.name || (item as any).name || 'Unknown'),
          avatar: m?.avatar || (item as any).avatar || '',
          userId: rowUserId,
          isHost: Boolean(isHostRole),
          isAccepted,
          assignedGroup,
          waitlistPosition,
          joinedQueueAt: null, // Explicitly no fallback in assigned mode
          skipReason: (item as any).skip_reason || (item as any).skipReason || (m as any)?.skipReason || (m as any)?.skip_reason || null,
        };

        // 5. Split into Going / Waitlisted / Skipped
        if (isCompletedPlan) {
          if (effectiveStatus === 'JOINED') {
            going.push(entry);
          } else {
            skipped.push(entry);
          }
        } else if (effectiveStatus === 'SKIPPED') {
          skipped.push(entry);
        } else if (assignedGroup === 'waitlisted' || assignedGroup === 'waitlist') {
          waitlist.push(entry);
        } else if (assignedGroup === 'going') {
          going.push(entry);
        } else {
          // If no assigned group is set in DB yet, put them in going for now
          going.push(entry);
        }
      }

      // 6. Validate & sort waitlisted strictly by waitlist_position ASC
      waitlist.forEach((entry) => {
        const isWaitlistGroup = entry.assignedGroup === 'waitlisted' || entry.assignedGroup === 'waitlist';
        const hasNoPosition = entry.waitlistPosition === null || entry.waitlistPosition === undefined || typeof entry.waitlistPosition !== 'number';
        if (isWaitlistGroup && hasNoPosition && entry.name) {
          console.warn(`[INLINE_ASSIGNED] Missing waitlist_position`, {
            plan_id: plan.id,
            user_id: entry.userId,
            name: entry.name
          });
        }
      });

      const waitlistSorted = [...waitlist].sort((a, b) => {
        const posA = typeof a.waitlistPosition === 'number' ? a.waitlistPosition : Number.MAX_SAFE_INTEGER;
        const posB = typeof b.waitlistPosition === 'number' ? b.waitlistPosition : Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });

      return {
        going: prioritizeUserAndSortGoing(going),
        invited: [], // No invited section in assigned mode
        waitlist: isCompletedPlan ? [] : waitlistSorted,
        skipped: prioritizeUserAndSortGoing(skipped)
      };
    }

    // ----------------------------------------------------------------------
    // AUTOMATIC MODE PIPELINE (Centralized via partitionAutomaticParticipants)
    // ----------------------------------------------------------------------

    const convertedEntries: InlineMemberEntry[] = members.map((m) => {
      const isHostRole = m.role === 'HOST' || m.isHost === true;
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      const isCurrentUser = Boolean(activeUserId && mId === activeUserId);
      let effectiveStatus = normalizeStatus(m.joinState || (m as any).rsvp_status);
      if (isCompletedPlan) {
        const finalState = getMemberFinalState(m);
        const isAttended = finalState === 'JOINED' || (finalState === null && effectiveStatus === 'JOINED');
        effectiveStatus = isAttended ? 'JOINED' : 'SKIPPED';
      }
      const isAccepted = effectiveStatus !== 'INVITED' && effectiveStatus !== 'SKIPPED';
      return {
        name: isCurrentUser ? 'You' : (m.name || 'Unknown'),
        avatar: m.avatar || '',
        userId: mId,
        isHost: Boolean(isHostRole),
        isAccepted,
        waitlistPosition: (m as any).waitlistPosition ?? (m as any).waitlist_position ?? null,
        joinedQueueAt: (m as any).joinedQueueAt ?? (m as any).joined_queue_at ?? (m as any).createdAt ?? (m as any).created_at ?? null,
        skipReason: (m as any).skipReason || (m as any).skip_reason || null,
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
    const t: { key: InlineTab; label: string; count: number }[] = [];

    if (isCompletedPlan) {
      t.push({ key: 'going', label: 'Attended', count: groups.going.length });
      if (groups.skipped.length > 0) {
        t.push({ key: 'skipped', label: 'Skipped', count: groups.skipped.length });
      }
    } else if (isAssignedMode) {
      t.push({ key: 'going', label: 'Joined', count: groups.going.length });
      if (groups.waitlist.length > 0) {
        t.push({ key: 'waitlist', label: 'Waitlisted', count: groups.waitlist.length });
      }
      if (groups.skipped.length > 0) {
        t.push({ key: 'skipped', label: 'Skipped', count: groups.skipped.length });
      }
    } else {
      const actualJoinedCount = (groups as any).goingJoinedCount ?? groups.going.length;
      const isFull = actualJoinedCount >= maxCapacity;

      if (!isFull) {
        t.push({ key: 'invited', label: 'Invited', count: groups.going.length });
      } else {
        t.push({ key: 'going', label: 'Joined', count: actualJoinedCount });
        t.push({ key: 'waitlist', label: 'Waitlist', count: groups.waitlist.length });
      }

      if (groups.skipped.length > 0) {
        t.push({ key: 'skipped', label: 'Skipped', count: groups.skipped.length });
      }
    }
    return t;
  }, [groups, isAssignedMode, isCompletedPlan, maxCapacity]);

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const activeList = groups[activeTab] || [];

  const getWaitlistPositionDisplay = (person: InlineMemberEntry, idx: number): string | null => {
    const rawPos = person.waitlistPosition ?? (person as any).waitlist_position;
    if (isAssignedMode) {
      const posNum = typeof rawPos === 'number' ? rawPos : (idx + 1);
      return `#${posNum}`;
    }

    // Automatic mode:
    // Only display position number if participant's RSVP status is WAITLISTED.
    // INVITED participants in Automatic waitlist receive NO number.
    const status = (person as any).rsvpStatus || (person as any).rsvp_status;
    const isWaitlistedRSVP = status === 'WAITLISTED' || (person.isAccepted && status !== 'SKIPPED' && status !== 'INVITED');

    if (isWaitlistedRSVP) {
      const posNum = typeof rawPos === 'number' ? rawPos : (idx + 1);
      return `#${posNum}`;
    }

    return null;
  };

  const allForStrip = isCompletedPlan ? [...groups.going, ...groups.skipped] : [...groups.going, ...groups.invited, ...groups.waitlist];
  const maxAvatars = 4;
  const visibleAvatars = allForStrip.slice(0, maxAvatars);
  const overflowCount = allForStrip.length - maxAvatars;

  const isParticipantView = !isHostUser && !isCompletedPlan;

  const completedCount = (plan as any).attended_participants ?? (plan as any).attendedParticipants ?? groups.going.length;

  const getLiveTabActiveStyle = (key: InlineTab) => {
    switch (key) {
      case 'going':
        return {
          className: 'text-emerald-200 font-semibold',
          style: {
            backgroundColor: 'rgba(6, 78, 59, 0.85)',
          },
        };
      case 'invited':
        return {
          className: 'text-zinc-200 font-semibold',
          style: {
            backgroundColor: 'rgba(39, 39, 42, 0.85)',
          },
        };
      case 'waitlist':
        return {
          className: 'text-amber-200 font-semibold',
          style: {
            backgroundColor: 'rgba(120, 53, 15, 0.85)',
          },
        };
      case 'skipped':
        return {
          className: 'text-rose-200 font-semibold',
          style: {
            backgroundColor: 'rgba(136, 19, 55, 0.85)',
          },
        };
    }
  };

  // Render streamlined view for normal participants on live plans, or if variant is explicitly flat:
  // Starts directly with status toggle, always expanded, no header row, no outer card box.
  if (isParticipantView || variant === 'flat') {
    const flatMaxHeight = isHostUser ? 'max-h-[calc(100dvh-480px)]' : 'max-h-[calc(100dvh-440px)]';

    return (
      <div className="w-full text-left space-y-2 flex flex-col min-h-0">
        {tabs.length > 0 && (
          <div className="w-full flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex-1 flex items-center justify-center bg-[#0A0A0C]/90 border border-white/15 rounded-full overflow-hidden backdrop-blur-md shadow-inner">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const activeStyle = getLiveTabActiveStyle(tab.key);

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    style={isActive ? activeStyle.style : undefined}
                    className={`flex-1 py-1.5 px-3 text-[11.5px] font-sans font-semibold tracking-wide transition-all duration-200 focus:outline-none flex items-center justify-center cursor-pointer select-none min-w-0 ${
                      isActive
                        ? `${activeStyle.className} rounded-full z-10 shadow-sm`
                        : 'text-zinc-400 hover:text-zinc-200 bg-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="truncate">{tab.label} ({tab.count})</span>
                  </button>
                );
              })}
            </div>

            {onManageParticipants && (
              <button
                type="button"
                onClick={onManageParticipants}
                className="h-8 w-8 rounded-full bg-[#0A0A0C]/90 border border-white/15 text-white/80 hover:text-white transition flex items-center justify-center cursor-pointer shrink-0 shadow-inner"
                title="Manage Participants"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className={`px-1 py-0.5 min-h-[90px] overflow-y-auto scrollbar-none pb-2 ${variant === 'flat' ? flatMaxHeight : 'max-h-[calc(100dvh-340px)]'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="space-y-0.5"
            >
              {activeList.length === 0 ? (
                <p className="text-[12px] text-white/30 font-sans py-1.5 px-1">No one here yet.</p>
              ) : (
                activeList.map((person, idx) => (
                  <div
                    key={person.userId || idx}
                    onClick={() => {
                      if (person.userId) {
                        setSelectedProfileUserId(person.userId);
                      }
                    }}
                    className={`flex items-center gap-3 py-1.5 px-2 rounded-xl cursor-pointer hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150 select-none ${
                      person.isAccepted ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {activeTab === 'waitlist' && (
                      <span className="text-[11px] font-bold text-white/50 w-6 min-w-[24px] inline-flex items-center shrink-0 font-sans">
                        {getWaitlistPositionDisplay(person, idx) || ''}
                      </span>
                    )}
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
                        <UserAvatar src={person.avatar} alt={person.name} size="w-full h-full" />
                      </div>
                    </div>
                    <span className={`font-sans text-[13.5px] font-semibold leading-none truncate flex-1 ${
                      person.isAccepted ? 'text-white' : 'text-[#8E8E93]'
                    }`}>
                      {person.name}
                    </span>
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
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <FriendProfileViewerBottomSheet
          friendUserId={selectedProfileUserId}
          onClose={() => setSelectedProfileUserId(null)}
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
            {isCompletedPlan ? (
              <>
                {tabs.length > 1 && (
                  <div className="px-4 pt-4">
                    <div className="flex bg-[#0A0A0C] border border-[#1A1A1A] rounded-[24px] p-1 gap-1">
                      {tabs.map(tab => {
                        const isActive = activeTab === tab.key;
                        const activeColor =
                          tab.key === 'going'
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                            : tab.key === 'waitlist'
                            ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                            : tab.key === 'skipped'
                            ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                            : 'text-white border-white/10 bg-white/[0.04]';

                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 py-1.5 rounded-[18px] text-[10px] font-sans font-bold tracking-wide transition-all duration-300 focus:outline-none flex items-center justify-center cursor-pointer ${
                              isActive
                                ? `${activeColor} border shadow-md`
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            <span className="truncate">{tab.label} ({tab.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tabs.length === 1 && (
                  <div className="px-5 pt-4">
                    <span className="text-[10px] font-sans font-black tracking-[0.14em] text-zinc-500 uppercase">
                      {tabs[0].label} ({tabs[0].count})
                    </span>
                  </div>
                )}
              </>
            ) : (
              tabs.length > 0 && (
                <div className="px-4 pt-3.5 pb-1">
                  <div className="w-full flex items-center justify-center bg-[#0A0A0C]/80 border border-white/10 rounded-full p-1 gap-1 backdrop-blur-md shadow-inner">
                    {tabs.map(tab => {
                      const isActive = activeTab === tab.key;
                      const activeStyle = getLiveTabActiveStyle(tab.key);

                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key)}
                          style={isActive ? activeStyle.style : undefined}
                          className={`flex-1 py-2 px-3 rounded-full text-[12px] font-sans font-semibold tracking-wide transition-all duration-300 focus:outline-none flex items-center justify-center cursor-pointer select-none ${
                            isActive
                              ? `${activeStyle.className}`
                              : 'text-zinc-400 hover:text-zinc-200 border border-transparent bg-transparent'
                          }`}
                        >
                          <span className="truncate">{tab.label} ({tab.count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {/* Participant list */}
            <div className="px-4 pb-5 pt-3 max-h-[260px] overflow-y-auto scrollbar-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                  className="space-y-0.5"
                >
                  {activeList.length === 0 ? (
                    <p className="text-[12px] text-white/30 font-sans py-2 px-1">No one here yet.</p>
                  ) : (
                    activeList.map((person, idx) => (
                      <div
                        key={person.userId || idx}
                        onClick={() => {
                          if (person.userId) {
                            setSelectedProfileUserId(person.userId);
                          }
                        }}
                        className={`flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150 select-none ${
                          person.isAccepted ? 'opacity-100' : 'opacity-70'
                        }`}
                      >
                        {activeTab === 'waitlist' && (
                          <span className="text-[11px] font-bold text-white/50 w-6 min-w-[24px] inline-flex items-center shrink-0 font-sans">
                            {getWaitlistPositionDisplay(person, idx) || ''}
                          </span>
                        )}
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
                            <UserAvatar src={person.avatar} alt={person.name} size="w-full h-full" />
                          </div>
                        </div>
                        <span className={`font-sans text-[13.5px] font-semibold leading-none truncate flex-1 ${
                          person.isAccepted ? 'text-white' : 'text-[#8E8E93]'
                        }`}>
                          {person.name}
                        </span>
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
                    ))
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
      />
    </div>
  );
}

