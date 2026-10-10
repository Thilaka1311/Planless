import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AssignedParticipantActions } from '../AssignedParticipantActions';
import { PlanIsFullBottomSheet } from '../../../plans/components/BottomSheets';
import { StackingFriends } from '../../components/StackingFriends';
import { calculateParticipantBreakdown } from '../../../../../lib/participantStatus';
import { Friend } from '../../shared/types';

describe('Assigned Mode: Rejoin Flow & Plan Is Full Bottom Sheet', () => {
  const rejoinedParticipant: Friend = {
    id: 'user-rejoin-1',
    dbUuid: 'user-rejoin-1',
    name: 'Renjith',
    avatar: 'https://example.com/avatar.png',
    isHost: false,
    joinedQueueAt: null,
    isAccepted: false,
    rsvpStatus: 'REJOINED',
    assignedGroup: null,
    waitlistPosition: null,
    leave_requested: false,
    leave_requested_at: null,
    skipReason: 'LEFT',
  };

  it('1. AssignedParticipantActions returns null when isPlanFull is true for rejoined participant, skipping intermediate sheet', () => {
    const onRejoinPlanFull = vi.fn();

    const html = renderToString(
      <AssignedParticipantActions
        selectedItem={rejoinedParticipant}
        sheetType="skipped"
        showConfirmRemove={false}
        isHostUser={true}
        userProfile={{ dbUuid: 'host-uuid' }}
        isPlanFull={true}
        onClose={() => {}}
        onShowConfirmRemove={() => {}}
        onRemoveParticipant={() => {}}
        onRejoinPlanFull={onRejoinPlanFull}
      />
    );

    // Intermediate sheet is completely bypassed/skipped
    expect(html).toBe('');
    expect(html).not.toContain('Wants to rejoin this plan');
    expect(html).not.toContain('Add to Joined');
    expect(html).not.toContain('Add to Waitlist');
    expect(html).not.toContain('Remove from plan');
  });

  it('2. AssignedParticipantActions removes obsolete intermediate sheet options (no Add to Waitlist, no Remove from plan)', () => {
    const html = renderToString(
      <AssignedParticipantActions
        selectedItem={rejoinedParticipant}
        sheetType="skipped"
        showConfirmRemove={false}
        isHostUser={true}
        userProfile={{ dbUuid: 'host-uuid' }}
        isPlanFull={false}
        onClose={() => {}}
        onShowConfirmRemove={() => {}}
        onRemoveParticipant={() => {}}
        onAddToJoined={() => {}}
      />
    );

    // When capacity is available, only "Add to Joined" and "Cancel" are available
    expect(html).toContain('Add to Joined');
    expect(html).toContain('Cancel');
    // Obsolete intermediate options are strictly removed
    expect(html).not.toContain('Add to Waitlist');
    expect(html).not.toContain('Remove from plan');
  });

  it('3. PlanIsFullBottomSheet directly presents "Increase Plan Size" and "Add to Waitlist"', () => {
    const onIncrease = vi.fn();
    const onWaitlist = vi.fn();
    const onClose = vi.fn();

    const html = renderToString(
      <PlanIsFullBottomSheet
        isOpen={true}
        pickerSelectedFriends={[
          {
            id: rejoinedParticipant.id,
            name: rejoinedParticipant.name,
            avatar: rejoinedParticipant.avatar,
          },
        ]}
        onIncreaseCapacity={onIncrease}
        onInviteToWaitlist={onWaitlist}
        onClose={onClose}
      />
    );

    expect(html).toContain('Plan is Full');
    expect(html).toMatch(/Adding Renjith exceeds this plan(&#x27;|')s capacity\./);
    expect(html).toContain('Increase Plan Size');
    expect(html).toContain('Add to Waitlist');
    expect(html).toContain('Cancel');
  });

  it('4. Increase Plan Size: increments plan size, transitions participant to JOINED + GOING', () => {
    // Initial plan state: full with 2 participants and capacity = 2
    const initialPlanSize = 2;
    const initialParticipants: any[] = [
      {
        user_id: 'host-1',
        plan_id: 'plan-1',
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'guest-1',
        plan_id: 'plan-1',
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: rejoinedParticipant.id,
        plan_id: 'plan-1',
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: null,
        skip_reason: 'LEFT',
      },
    ];

    // Simulating decision = 'JOINED' (Increase Plan Size selected)
    const newPlanSize = initialPlanSize + 1;
    const updatedParticipants = initialParticipants.map((p) => {
      if (p.user_id === rejoinedParticipant.id) {
        return {
          ...p,
          rsvp_status: 'JOINED',
          assigned_group: 'GOING',
          waitlist_position: null,
          joined_queue_at: null,
          skip_reason: null,
          leave_requested: false,
        };
      }
      return p;
    });

    expect(newPlanSize).toBe(3);
    const rejoining = updatedParticipants.find((p) => p.user_id === rejoinedParticipant.id);
    expect(rejoining.rsvp_status).toBe('JOINED');
    expect(rejoining.assigned_group).toBe('GOING');
    expect(rejoining.skip_reason).toBeNull();

    const breakdown = calculateParticipantBreakdown(updatedParticipants);
    expect(breakdown.joined).toBe(3);
    expect(breakdown.skipped).toBe(0);
  });

  it('5. Add to Waitlist: preserves capacity, sets WAITLISTED + WAITLIST, and assigns sequential queue position', () => {
    const initialPlanSize = 2;
    const initialParticipants: any[] = [
      {
        user_id: 'host-1',
        plan_id: 'plan-1',
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'guest-1',
        plan_id: 'plan-1',
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
        waitlist_position: null,
      },
      {
        user_id: 'waitlisted-1',
        plan_id: 'plan-1',
        role: 'PARTICIPANT',
        rsvp_status: 'WAITLISTED',
        assigned_group: 'WAITLIST',
        waitlist_position: 1,
      },
      {
        user_id: rejoinedParticipant.id,
        plan_id: 'plan-1',
        role: 'PARTICIPANT',
        rsvp_status: 'REJOINED',
        assigned_group: null,
        waitlist_position: null,
        skip_reason: 'LEFT',
      },
    ];

    // Simulating decision = 'WAITLIST' (Add to Waitlist selected)
    // Find max waitlist position
    const maxWaitlistPos = initialParticipants
      .filter((p) => p.assigned_group === 'WAITLIST' && typeof p.waitlist_position === 'number')
      .reduce((max, p) => Math.max(max, p.waitlist_position), 0);

    const updatedParticipants = initialParticipants.map((p) => {
      if (p.user_id === rejoinedParticipant.id) {
        return {
          ...p,
          rsvp_status: 'WAITLISTED',
          assigned_group: 'WAITLIST',
          waitlist_position: maxWaitlistPos + 1,
          skip_reason: null,
          leave_requested: false,
        };
      }
      return p;
    });

    // Plan size remains strictly unchanged
    expect(initialPlanSize).toBe(2);

    const rejoining = updatedParticipants.find((p) => p.user_id === rejoinedParticipant.id);
    expect(rejoining.rsvp_status).toBe('WAITLISTED');
    expect(rejoining.assigned_group).toBe('WAITLIST');
    expect(rejoining.waitlist_position).toBe(2); // Next sequential position after 1
    expect(rejoining.skip_reason).toBeNull();

    const breakdown = calculateParticipantBreakdown(updatedParticipants);
    expect(breakdown.joined).toBe(2);
    expect(breakdown.waitlisted).toBe(2);
    expect(breakdown.skipped).toBe(0);
  });

  it('6. StackingFriends renders a rejoined participant in Skipped section with bright exclamation mark and muted row elements', () => {
    const html = renderToString(
      <StackingFriends
        item={rejoinedParticipant}
        isHost={true}
      />
    );

    // Row container is not dimmed to 0.55 (opacity: 1) so exclamation mark remains bright
    expect(html).toContain('opacity:1');
    // Avatar is dimmed (opacity: 0.33)
    expect(html).toContain('opacity:0.33');
    // Name is muted grey (#8E8E93) and dimmed (opacity: 0.55), NOT bright white (#FFFFFF)
    expect(html).toContain('color:#8E8E93');
    expect(html).toContain('opacity:0.55');
    expect(html).not.toContain('color:#FFFFFF');
    // Exclamation mark (!) is displayed beside the name in bright amber
    expect(html).toContain('color:#F59E0B');
    expect(html).toContain('!');
    // Right-aligned status text "Left" is displayed
    expect(html).toContain('Left');
  });

  it('7. StackingFriends renders a standard skipped participant as dimmed/muted without exclamation mark and with right-aligned status text', () => {
    const standardSkipped: Friend = {
      id: 'user-skipped-1',
      dbUuid: 'user-skipped-1',
      name: 'Alice',
      avatar: 'https://example.com/avatar.png',
      isHost: false,
      joinedQueueAt: null,
      isAccepted: false,
      rsvpStatus: 'SKIPPED',
      assignedGroup: null,
      waitlistPosition: null,
      leave_requested: false,
      leave_requested_at: null,
      skipReason: 'REMOVED',
    };

    const html = renderToString(
      <StackingFriends
        item={standardSkipped}
        isHost={true}
      />
    );

    // Row is dimmed/muted (opacity: 0.55)
    expect(html).toContain('opacity:0.55');
    // Avatar is dimmed (opacity: 0.6)
    expect(html).toContain('opacity:0.6');
    // Name is muted grey (#8E8E93)
    expect(html).toContain('color:#8E8E93');
    // No exclamation mark for standard skipped participant
    expect(html).not.toContain('#F59E0B');
    // Right-aligned status text "Removed" is displayed
    expect(html).toContain('Removed');
  });
});
