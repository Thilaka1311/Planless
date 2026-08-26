import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Users } from 'lucide-react';
import { Plan } from '../../../core/types';
import { normalizeStatus } from '../../../../lib/participantStatus';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

type InlineTab = 'going' | 'invited' | 'waitlist' | 'skipped';

interface InlineParticipantViewProps {
  plan: Plan;
  activeUserId?: string;
  isHost?: boolean;
  onManageParticipants?: () => void;
}

interface InlineMemberEntry {
  name: string;
  avatar: string;
  userId: string;
  isHost: boolean;
  isAccepted: boolean;
  waitlistPosition?: number | null;
  joinedQueueAt?: string | null;
}

export function InlineParticipantView({ plan, activeUserId, isHost: isHostProp, onManageParticipants }: InlineParticipantViewProps) {
  const members = plan.members || [];
  const hostId = plan.hostId || (plan as any).host_id || (plan as any).creator_id || (plan as any).creatorId;

  const isHostUser = isHostProp ?? Boolean(
    activeUserId && (
      activeUserId === hostId ||
      members.some(m => (m.userUuid === activeUserId || m.userId === activeUserId || (m as any).user_id === activeUserId || (m as any).id === activeUserId) && (m.role === 'HOST' || m.isHost === true))
    )
  );

  const [isExpanded, setIsExpanded] = React.useState(false);

  const planFiltering = plan.participantFiltering || (plan as any).participant_filtering || 'AUTOMATIC';
  const isAssignedMode = planFiltering === 'ASSIGNED';
  const waitlistOrderMode = plan.waitlistOrderMode || (plan as any).waitlist_order_mode || 'AUTO';

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

    const isCompletedPlan = plan.status === 'COMPLETED';
    if (isCompletedPlan) {
      const fs = getMemberFinalState(currentMember) || normalizeStatus(currentMember.joinState || (currentMember as any).rsvp_status);
      if (fs === 'JOINED') return 'going';
      if (fs === 'WAITLISTED') return 'waitlist';
      if (fs === 'INVITED') return 'invited';
      return 'skipped';
    }

    if (isAssignedMode) {
      const group = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
      return group === 'WAITLIST' ? 'waitlist' : 'going';
    }
    const status = normalizeStatus(currentMember.joinState || (currentMember as any).rsvp_status);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'invited';
    return 'going';
  }, [members, activeUserId, isAssignedMode, plan.status]);

  const [activeTab, setActiveTab] = React.useState<InlineTab>(initialTab);

  const groups = useMemo(() => {
    const going: InlineMemberEntry[] = [];
    const invited: InlineMemberEntry[] = [];
    const waitlist: InlineMemberEntry[] = [];
    const skipped: InlineMemberEntry[] = [];

    const isCompletedPlan = plan.status === 'COMPLETED';

    for (const m of members) {
      const isHostRole = m.role === 'HOST' || m.isHost === true;
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      const isCurrentUser = Boolean(activeUserId && mId === activeUserId);

      let effectiveStatus = normalizeStatus(m.joinState || (m as any).rsvp_status);
      if (isCompletedPlan) {
        effectiveStatus = (getMemberFinalState(m) || effectiveStatus) as any;
      }

      const isAccepted = effectiveStatus !== 'INVITED' && effectiveStatus !== 'SKIPPED';

      const entry: InlineMemberEntry = {
        name: isCurrentUser ? 'You' : (m.name || 'Unknown'),
        avatar: m.avatar || '',
        userId: mId,
        isHost: Boolean(isHostRole),
        isAccepted,
        waitlistPosition: (m as any).waitlistPosition ?? (m as any).waitlist_position ?? null,
        joinedQueueAt: (m as any).joinedQueueAt ?? (m as any).joined_queue_at ?? (m as any).createdAt ?? (m as any).created_at ?? null,
      };

      if (isCompletedPlan) {
        if (effectiveStatus === 'JOINED') going.push(entry);
        else if (effectiveStatus === 'WAITLISTED') waitlist.push(entry);
        else if (effectiveStatus === 'INVITED') invited.push(entry);
        else skipped.push(entry);
      } else if (isAssignedMode) {
        const group = (m as any).assignedGroup || (m as any).assigned_group;
        if (group === 'WAITLIST' || (!group && effectiveStatus === 'WAITLISTED')) {
          waitlist.push(entry);
        } else if (effectiveStatus === 'SKIPPED') {
          skipped.push(entry);
        } else {
          going.push(entry);
        }
      } else {
        if (effectiveStatus === 'JOINED') going.push(entry);
        else if (effectiveStatus === 'INVITED') invited.push(entry);
        else if (effectiveStatus === 'WAITLISTED') waitlist.push(entry);
        else if (effectiveStatus === 'SKIPPED') skipped.push(entry);
      }
    }

    const sortAlpha = (list: InlineMemberEntry[]) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    const prioritizeUserAndSortGoing = (list: InlineMemberEntry[]) => {
      const currentUser = list.find(item => item.name === 'You' || (activeUserId && item.userId === activeUserId));
      const remaining = list.filter(item => item !== currentUser);
      const remainingHosts = sortAlpha(remaining.filter(i => i.isHost));
      const remainingNonHosts = sortAlpha(remaining.filter(i => !i.isHost));
      return [
        ...(currentUser ? [currentUser] : []),
        ...remainingHosts,
        ...remainingNonHosts,
      ];
    };

    const sortByWaitlistOrder = (list: InlineMemberEntry[]) =>
      [...list].sort((a, b) => {
        if (waitlistOrderMode === 'CUSTOM') {
          const posA = a.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
          const posB = b.waitlistPosition ?? Number.MAX_SAFE_INTEGER;
          if (posA !== posB) return posA - posB;
        }

        const queueA = a.joinedQueueAt ? new Date(a.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const queueB = b.joinedQueueAt ? new Date(b.joinedQueueAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (queueA !== queueB) return queueA - queueB;
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      });

    return {
      going: prioritizeUserAndSortGoing(going),
      invited: prioritizeUserAndSortGoing(invited),
      waitlist: sortByWaitlistOrder(waitlist),
      skipped: prioritizeUserAndSortGoing(skipped)
    };
  }, [members, activeUserId, isAssignedMode, waitlistOrderMode]);

  const tabs = useMemo(() => {
    const t: { key: InlineTab; label: string; count: number }[] = [];
    const isCompletedPlan = plan.status === 'COMPLETED';

    if (isCompletedPlan) {
      if (groups.going.length > 0 || (groups.waitlist.length === 0 && groups.invited.length === 0 && groups.skipped.length === 0)) {
        t.push({ key: 'going', label: 'Attended', count: groups.going.length });
      }
      if (groups.waitlist.length > 0) {
        t.push({ key: 'waitlist', label: 'Waitlist', count: groups.waitlist.length });
      }
      if (groups.invited.length > 0) {
        t.push({ key: 'invited', label: 'Invited', count: groups.invited.length });
      }
      if (groups.skipped.length > 0) {
        t.push({ key: 'skipped', label: 'Skipped', count: groups.skipped.length });
      }
    } else if (isAssignedMode) {
      if (groups.going.length > 0 || groups.waitlist.length === 0) {
        t.push({ key: 'going', label: 'Joined', count: groups.going.length });
      }
      if (groups.waitlist.length > 0) {
        t.push({ key: 'waitlist', label: 'Waitlisted', count: groups.waitlist.length });
      }
    } else {
      if (groups.going.length > 0) t.push({ key: 'going', label: 'Joined', count: groups.going.length });
      if (groups.waitlist.length > 0) t.push({ key: 'waitlist', label: 'Waitlisted', count: groups.waitlist.length });
      if (groups.invited.length > 0) t.push({ key: 'invited', label: 'Invited', count: groups.invited.length });
      if (groups.skipped.length > 0) t.push({ key: 'skipped', label: 'Skipped', count: groups.skipped.length });
    }
    return t;
  }, [groups, isAssignedMode, plan.status]);

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const activeList = groups[activeTab] || [];
  const allForStrip = plan.status === 'COMPLETED' ? [...groups.going, ...groups.skipped] : [...groups.going, ...groups.invited, ...groups.waitlist];
  const maxAvatars = 4;
  const visibleAvatars = allForStrip.slice(0, maxAvatars);
  const overflowCount = allForStrip.length - maxAvatars;

  const maxCapacity = plan.maxSpots || plan.capacity || plan.joinLimit || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);

  const isCompletedPlan = plan.status === 'COMPLETED';
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

  // Render streamlined view for normal participants on live plans:
  // Starts directly with status toggle, always expanded, no header row, no outer card box, max 4 visible participant rows with internal scroll.
  if (isParticipantView) {
    return (
      <div className="w-full text-left space-y-2">
        {tabs.length > 0 && (
          <div className="w-full flex items-center justify-center bg-[#0A0A0C]/90 border border-white/15 rounded-full overflow-hidden backdrop-blur-md shadow-inner">
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
        )}

        <div className="px-1 py-0.5 min-h-[90px] max-h-[calc(100dvh-340px)] overflow-y-auto scrollbar-none">
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
                    className={`flex items-center gap-3 py-1.5 px-1 rounded-xl ${
                      person.isAccepted ? 'opacity-100' : 'opacity-70'
                    }`}
                  >
                    {activeTab === 'waitlist' && (
                      <span className="text-[11px] font-bold text-white/30 min-w-[18px] font-sans">
                        #{idx + 1}
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
                    {person.isHost && (
                      <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0 uppercase">
                        Host
                      </span>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>
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
                {groups.going.length} {groups.going.length === 1 ? 'participant' : 'participants'}
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
                        className={`flex items-center gap-3 py-2 px-1 rounded-xl ${
                          person.isAccepted ? 'opacity-100' : 'opacity-70'
                        }`}
                      >
                        {activeTab === 'waitlist' && (
                          <span className="text-[11px] font-bold text-white/30 min-w-[18px] font-sans">
                            #{idx + 1}
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
                        {person.isHost && (
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0 uppercase">
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
    </div>
  );
}

