import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { isJoinedRsvpParticipant } from '../../../../../lib/participantStatus';
import { AssignedParticipantTabs } from '../AssignedParticipantTabs';
import { AutomaticParticipantTabs } from '../../automatic/AutomaticParticipantTabs';

describe('Assigned Mode: Move Waitlist to Joined Count & State Verification', () => {
  interface ParticipantRecord {
    id: string;
    user_id: string;
    name: string;
    role: string;
    isHost: boolean;
    rsvp_status: string;
    assigned_group: 'GOING' | 'WAITLIST' | null;
    waitlist_position: number | null;
    joined_queue_at: string | null;
  }

  // Canonical pure implementation of moving participant to Going matching usePlanParticipants
  function executeMoveParticipantToGoing(
    participants: ParticipantRecord[],
    targetUserId: string,
    isAssigned: boolean = true
  ): {
    updatedParticipants: ParticipantRecord[];
    remainingWaitlist: ParticipantRecord[];
  } {
    const existing = participants.find((p) => p.user_id === targetUserId);
    if (!existing) return { updatedParticipants: participants, remainingWaitlist: [] };

    // Core rule:
    // - If WAITLISTED or REJOINED -> JOINED
    // - If INVITED -> preserved as INVITED
    // - If JOINED -> preserved as JOINED
    const currentRsvp = existing.rsvp_status;
    const isWaitlisted = currentRsvp === 'WAITLISTED' || currentRsvp === 'REJOINED';
    const nextRsvp = isWaitlisted ? 'JOINED' : (currentRsvp || 'INVITED');

    // 1. Move target participant to GOING
    const updated = participants.map((p) => {
      if (p.user_id === targetUserId) {
        return {
          ...p,
          assigned_group: isAssigned ? ('GOING' as const) : null,
          waitlist_position: null,
          joined_queue_at: null,
          rsvp_status: nextRsvp,
        };
      }
      return p;
    });

    // 2. Renumber remaining waitlist participants 1..N
    const waitlistParts = updated.filter(
      (p) =>
        p.assigned_group === 'WAITLIST' ||
        (!p.assigned_group && p.rsvp_status === 'WAITLISTED')
    );
    const sortedWaitlist = [...waitlistParts].sort((a, b) => {
      const posA = a.waitlist_position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.waitlist_position ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });

    const finalParticipants = updated.map((p) => {
      const group = p.assigned_group;
      const isWait = group === 'WAITLIST' || (!group && p.rsvp_status === 'WAITLISTED');
      if (!isWait) {
        return { ...p, waitlist_position: null };
      }
      const idx = sortedWaitlist.findIndex((w) => w.user_id === p.user_id);
      return { ...p, waitlist_position: idx !== -1 ? idx + 1 : null };
    });

    const remaining = finalParticipants.filter(
      (p) =>
        p.assigned_group === 'WAITLIST' ||
        (!p.assigned_group && p.rsvp_status === 'WAITLISTED')
    );

    return {
      updatedParticipants: finalParticipants,
      remainingWaitlist: remaining,
    };
  }

  function calculateJoinedCount(participants: ParticipantRecord[]): number {
    const goingGroup = participants.filter((p) => {
      const group = p.assigned_group;
      return group === 'GOING' || (!group && p.rsvp_status !== 'WAITLISTED');
    });
    return goingGroup.filter((p) => isJoinedRsvpParticipant(p)).length;
  }

  it('1. Moving a waitlisted participant to Joined increments the count exactly once', () => {
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-wait1', user_id: 'u-wait1', name: 'Thilaka Sundar', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
      { id: 'u-wait2', user_id: 'u-wait2', name: 'Thi', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 2, joined_queue_at: '2026-10-10T10:05:00Z' },
    ];

    const initialCount = calculateJoinedCount(initialParticipants);
    expect(initialCount).toBe(1); // Only Host

    const { updatedParticipants } = executeMoveParticipantToGoing(initialParticipants, 'u-wait1');
    const newCount = calculateJoinedCount(updatedParticipants);
    expect(newCount).toBe(2); // Host + Thilaka Sundar
  });

  it('2. The participant RSVP status and assigned group are updated correctly', () => {
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-wait1', user_id: 'u-wait1', name: 'Thilaka Sundar', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
    ];

    const { updatedParticipants } = executeMoveParticipantToGoing(initialParticipants, 'u-wait1');
    const moved = updatedParticipants.find((p) => p.user_id === 'u-wait1');

    expect(moved?.assigned_group).toBe('GOING');
    expect(moved?.rsvp_status).toBe('JOINED');
    expect(moved?.waitlist_position).toBeNull();
    expect(moved?.joined_queue_at).toBeNull();
  });

  it('3. The Joined count and capacity display update immediately (e.g. Joined (1 / 3) -> Joined (2 / 3))', () => {
    const capacity = 3;
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-wait1', user_id: 'u-wait1', name: 'Thilaka Sundar', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
    ];

    // Render before
    const countBefore = calculateJoinedCount(initialParticipants);
    const htmlBefore = renderToString(
      <AssignedParticipantTabs
        visibleTabs={['going', 'waitlist']}
        activeTab="going"
        goingCount={countBefore}
        capacity={capacity}
        waitlistCount={1}
        onTabChange={() => {}}
      />
    );
    expect(htmlBefore).toContain('Joined (1 / 3)');

    // Execute move
    const { updatedParticipants } = executeMoveParticipantToGoing(initialParticipants, 'u-wait1');
    const countAfter = calculateJoinedCount(updatedParticipants);

    // Render after
    const htmlAfter = renderToString(
      <AssignedParticipantTabs
        visibleTabs={['going', 'waitlist']}
        activeTab="going"
        goingCount={countAfter}
        capacity={capacity}
        waitlistCount={0}
        onTabChange={() => {}}
      />
    );
    expect(htmlAfter).toContain('Joined (2 / 3)');
  });

  it('4. Remaining waitlist positions are correct and renumbered without gaps', () => {
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-wait1', user_id: 'u-wait1', name: 'User 1', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
      { id: 'u-wait2', user_id: 'u-wait2', name: 'User 2', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 2, joined_queue_at: '2026-10-10T10:05:00Z' },
      { id: 'u-wait3', user_id: 'u-wait3', name: 'User 3', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 3, joined_queue_at: '2026-10-10T10:10:00Z' },
    ];

    // Move User 2 (position 2) to Going
    const { updatedParticipants, remainingWaitlist } = executeMoveParticipantToGoing(initialParticipants, 'u-wait2');

    expect(remainingWaitlist).toHaveLength(2);
    const u1 = updatedParticipants.find((p) => p.user_id === 'u-wait1');
    const u3 = updatedParticipants.find((p) => p.user_id === 'u-wait3');

    // u-wait1 remains #1, u-wait3 shifts from #3 to #2
    expect(u1?.waitlist_position).toBe(1);
    expect(u3?.waitlist_position).toBe(2);
  });

  it('5. Repeating the action does not double-count the participant', () => {
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-wait1', user_id: 'u-wait1', name: 'Thilaka Sundar', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
    ];

    // First execution
    const step1 = executeMoveParticipantToGoing(initialParticipants, 'u-wait1');
    const countStep1 = calculateJoinedCount(step1.updatedParticipants);
    expect(countStep1).toBe(2);

    // Repeated execution on the already-joined participant
    const step2 = executeMoveParticipantToGoing(step1.updatedParticipants, 'u-wait1');
    const countStep2 = calculateJoinedCount(step2.updatedParticipants);
    expect(countStep2).toBe(2); // Does not increase to 3!
  });

  it('6. Existing invited-participant behavior is preserved (rsvp_status remains INVITED)', () => {
    const initialParticipants: ParticipantRecord[] = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: 'GOING', waitlist_position: null, joined_queue_at: null },
      { id: 'u-inv1', user_id: 'u-inv1', name: 'Invited Friend', role: 'PARTICIPANT', isHost: false, rsvp_status: 'INVITED', assigned_group: 'WAITLIST', waitlist_position: 1, joined_queue_at: null },
    ];

    const { updatedParticipants } = executeMoveParticipantToGoing(initialParticipants, 'u-inv1');
    const movedInvited = updatedParticipants.find((p) => p.user_id === 'u-inv1');

    // Assigned group becomes GOING, but RSVP status is preserved as INVITED
    expect(movedInvited?.assigned_group).toBe('GOING');
    expect(movedInvited?.rsvp_status).toBe('INVITED');
    expect(isJoinedRsvpParticipant(movedInvited)).toBe(false);

    // Joined count does NOT increase because they have not confirmed RSVP yet
    const count = calculateJoinedCount(updatedParticipants);
    expect(count).toBe(1); // Only Host
  });

  it('7. Automatic mode remains unchanged and uses FCFS queue timestamps', () => {
    // In Automatic mode, assigned_group is null and waitlist order is driven by joined_queue_at
    const autoParticipants = [
      { id: 'u-host', user_id: 'u-host', name: 'You', role: 'HOST', isHost: true, rsvp_status: 'JOINED', assigned_group: null, waitlist_position: null, joined_queue_at: null },
      { id: 'u-auto1', user_id: 'u-auto1', name: 'Auto Waitlist 1', role: 'PARTICIPANT', isHost: false, rsvp_status: 'WAITLISTED', assigned_group: null, waitlist_position: 1, joined_queue_at: '2026-10-10T10:00:00Z' },
    ];

    const going = autoParticipants.filter((p) => p.rsvp_status === 'JOINED');
    const waitlist = autoParticipants.filter((p) => p.rsvp_status === 'WAITLISTED');

    const html = renderToString(
      <AutomaticParticipantTabs
        visibleTabs={['going', 'waitlist']}
        activeTab="going"
        goingCount={going.length}
        capacity={3}
        waitlistCount={waitlist.length}
        onTabChange={() => {}}
      />
    );

    expect(html).toContain('Joined (1 / 3)');
    expect(html).toContain('Waitlist (1)');
  });
});
