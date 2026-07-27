import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown } from 'lucide-react';
import { Plan } from '../../../core/types';
import { normalizeStatus } from '../../../../lib/participantStatus';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

type InlineTab = 'going' | 'invited' | 'waitlist';

interface InlineParticipantViewProps {
  plan: Plan;
  activeUserId?: string;
}

export function InlineParticipantView({ plan, activeUserId }: InlineParticipantViewProps) {
  const members = plan.members || [];
  const hostId = plan.hostId;

  const [isExpanded, setIsExpanded] = React.useState(false);

  const planFiltering = plan.participantFiltering || (plan as any).participant_filtering || 'AUTOMATIC';
  const isAssignedMode = planFiltering === 'ASSIGNED';

  // Compute initial tab: the one that contains the current user
  const initialTab = React.useMemo<InlineTab>(() => {
    if (!activeUserId) return 'going';
    const currentMember = members.find((m) => {
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      return mId === activeUserId;
    });
    if (!currentMember) return 'going';
    if (isAssignedMode) {
      const group = (currentMember as any).assignedGroup || (currentMember as any).assigned_group;
      return group === 'WAITLIST' ? 'waitlist' : 'going';
    }
    const status = normalizeStatus(currentMember.joinState);
    if (status === 'WAITLISTED') return 'waitlist';
    if (status === 'INVITED') return 'invited';
    return 'going';
  }, [members, activeUserId, isAssignedMode]);

  const [activeTab, setActiveTab] = React.useState<InlineTab>(initialTab);

  const groups = useMemo(() => {
    const going: { name: string; avatar: string; userId: string; isHost: boolean }[] = [];
    const invited: { name: string; avatar: string; userId: string; isHost: boolean }[] = [];
    const waitlist: { name: string; avatar: string; userId: string; isHost: boolean }[] = [];

    for (const m of members) {
      const status = normalizeStatus(m.joinState);
      if (status === 'SKIPPED') continue;

      const isHostRole = m.role === 'HOST' || m.isHost === true;
      const mId = m.userUuid || m.userId || (m as any).user_id || (m as any).id;
      const isCurrentUser = Boolean(activeUserId && mId === activeUserId);
      const entry = {
        name: isCurrentUser ? 'You' : (m.name || 'Unknown'),
        avatar: m.avatar || '',
        userId: mId,
        isHost: Boolean(isHostRole),
      };

      if (isAssignedMode) {
        const group = (m as any).assignedGroup || (m as any).assigned_group;
        if (group === 'WAITLIST' || (!group && status === 'WAITLISTED')) {
          waitlist.push(entry);
        } else {
          going.push(entry);
        }
      } else {
        if (status === 'JOINED') going.push(entry);
        else if (status === 'INVITED') invited.push(entry);
        else if (status === 'WAITLISTED') waitlist.push(entry);
      }
    }

    const sortAlpha = (list: typeof going) => [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    const prioritizeUserAndSort = (list: typeof going) => {
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

    return {
      going: prioritizeUserAndSort(going),
      invited: prioritizeUserAndSort(invited),
      waitlist
    };
  }, [members, hostId, plan.creatorName, plan.creatorAvatar, activeUserId, isAssignedMode]);

  const tabs = useMemo(() => {
    const t: { key: InlineTab; label: string; count: number }[] = [];
    if (isAssignedMode) {
      if (groups.going.length > 0 || groups.waitlist.length === 0) {
        t.push({ key: 'going', label: 'Going', count: groups.going.length });
      }
      if (groups.waitlist.length > 0) {
        t.push({ key: 'waitlist', label: 'Waitlist', count: groups.waitlist.length });
      }
    } else {
      if (groups.going.length > 0) t.push({ key: 'going', label: 'Going', count: groups.going.length });
      if (groups.waitlist.length > 0) t.push({ key: 'waitlist', label: 'Waitlist', count: groups.waitlist.length });
      if (groups.invited.length > 0) t.push({ key: 'invited', label: 'Invited', count: groups.invited.length });
    }
    return t;
  }, [groups, isAssignedMode]);

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const activeList = groups[activeTab] || [];
  const allForStrip = [...groups.going, ...groups.invited, ...groups.waitlist];
  const maxAvatars = 4;
  const visibleAvatars = allForStrip.slice(0, maxAvatars);
  const overflowCount = allForStrip.length - maxAvatars;

  const maxCapacity = plan.maxSpots || plan.capacity || plan.joinLimit || (plan.category === "movies" ? 10 : plan.category === "sports" ? 14 : 8);

  return (
    <div className="w-full bg-[#111111] rounded-3xl border border-white/[0.08] overflow-hidden">
      {/* Header — always visible, tap to expand */}
      <button
        type="button"
        id="inline_participant_toggle"
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
      >
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-sans font-semibold tracking-wider text-white/60 uppercase">Participants</h3>
          {/* Overlapping avatar strip */}
          <div className="flex -space-x-2.5 overflow-hidden">
            {visibleAvatars.map((p, i) => (
              <div
                key={p.userId || i}
                className="w-8 h-8 rounded-full border-2 border-[#000000] bg-[#111111] overflow-hidden flex-shrink-0"
                style={{ zIndex: maxAvatars - i }}
              >
                <UserAvatar src={p.avatar} alt={p.name} size="w-full h-full" />
              </div>
            ))}
            {overflowCount > 0 && (
              <div className="w-8 h-8 rounded-full border-2 border-[#000000] bg-[#1A1A1A] flex items-center justify-center text-[11px] font-sans font-medium text-white/90 z-10 flex-shrink-0">
                +{overflowCount}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start mt-0.5">
          <span className="text-xs font-mono font-medium text-white/50">{groups.going.length} / {maxCapacity}</span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="text-white/35 text-[10px] font-bold inline-block"
          >
            ▼
          </motion.span>
        </div>
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

            {/* Segmented page divider toggle — matching PlansDivider control */}
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

            {/* Single-tab label when only one tab exists */}
            {tabs.length === 1 && (
              <div className="px-5 pt-4">
                <span className="text-[10px] font-sans font-black tracking-[0.14em] text-zinc-500 uppercase">
                  {tabs[0].label} ({tabs[0].count})
                </span>
              </div>
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
                        className="flex items-center gap-3 py-2 px-1 rounded-xl"
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
                            <UserAvatar src={person.avatar} alt={person.name} size="w-full h-full" />
                          </div>
                          {person.isHost && (
                            <div
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-[#F59E0B] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                              style={{ background: '#000000' }}
                            >
                              <Crown className="w-2 h-2 text-[#F59E0B]" fill="#F59E0B" />
                            </div>
                          )}
                        </div>
                        <span className="font-sans text-[13.5px] text-white/90 font-medium leading-none truncate flex-1">
                          {person.name}
                        </span>
                        {person.isHost && (
                          <span className="text-[10px] font-bold text-white/25 tracking-wider flex-shrink-0 uppercase">
                            Host
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
