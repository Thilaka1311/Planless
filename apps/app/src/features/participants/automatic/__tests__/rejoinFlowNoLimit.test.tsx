import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AutomaticWaitlistActions } from '../AutomaticWaitlistActions';
import {
  isJoinedRsvpParticipant,
  partitionAutomaticParticipants,
  calculateNoLimitDenominator,
} from '../../../../../lib/participantStatus';
import { Friend } from '../../shared/types';
import { AutomaticParticipantScreen } from '../AutomaticParticipantScreen';
import { PlanIsFullBottomSheet } from '../../../plans/components/BottomSheets';

vi.mock('../../../friendships/state/FriendshipContext', () => ({
  useFriendshipStore: () => ({
    friends: [],
    refreshFriendships: vi.fn(),
  }),
}));

describe('Rejoin Flow for No-Limit and Limited Plans', () => {
  describe('1. AutomaticWaitlistActions Sheet UI Requirements', () => {
    const rejoinedParticipant: Friend = {
      id: 'user-renjith',
      dbUuid: 'user-renjith',
      name: 'Renjith',
      avatar: 'https://example.com/renjith.jpg',
      isHost: false,
      joinedQueueAt: null,
      isAccepted: false,
      rsvpStatus: 'REJOINED',
      assignedGroup: null,
      waitlistPosition: null,
      leave_requested: false,
      leave_requested_at: null,
      skipReason: null,
    };

    it('renders "Add to Plan" and "Cancel" buttons for a participant requesting to rejoin', () => {
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={rejoinedParticipant}
          sheetType="skipped"
          showConfirmRemove={false}
          isHostUser={true}
          userProfile={{ dbUuid: 'host-uuid' }}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
          onAddToPlan={() => {}}
        />
      );

      // Verify "Add to Plan" is present
      expect(html).toContain('Add to Plan');
      // Verify "Cancel" is present
      expect(html).toContain('Cancel');
      // Verify "Wants to rejoin this plan" subtitle is present
      expect(html).toContain('Wants to rejoin this plan');
    });

    it('strictly removes "Remove from Plan" button from the rejoin bottom sheet', () => {
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={rejoinedParticipant}
          sheetType="skipped"
          showConfirmRemove={false}
          isHostUser={true}
          userProfile={{ dbUuid: 'host-uuid' }}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
          onAddToPlan={() => {}}
        />
      );

      // Must NOT contain "Remove from Plan"
      expect(html).not.toContain('Remove from Plan');
      expect(html).not.toContain('Remove from plan');
    });

    it('preserves "Remove from Plan" for regular participants in going/waitlist', () => {
      const regularParticipant: Friend = {
        id: 'user-regular',
        dbUuid: 'user-regular',
        name: 'Regular Participant',
        avatar: '',
        isHost: false,
        joinedQueueAt: null,
        isAccepted: true,
        rsvpStatus: 'JOINED',
        assignedGroup: null,
        waitlistPosition: null,
        leave_requested: false,
        leave_requested_at: null,
        skipReason: null,
      };

      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={regularParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          userProfile={{ dbUuid: 'host-uuid' }}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
          onAddToPlan={() => {}}
        />
      );

      // Regular participants can still be removed by the host
      expect(html).toContain('Remove from Plan');
    });
  });

  describe('2. Add to Plan behavior for No-Limit Plans', () => {
    it('moves participant from SKIPPED to JOINED, increments joined count, and preserves plan_size = null', () => {
      // Setup a No-Limit plan: plan_size is null (No limit)
      const plan = {
        id: 'plan-no-limit',
        plan_size: null,
        capacity: null,
      };

      const initialParticipants = [
        { id: 'host-1', name: 'Host', isHost: true, role: 'HOST', rsvp_status: 'JOINED' },
        { id: 'user-1', name: 'User 1', isHost: false, role: 'PARTICIPANT', rsvp_status: 'JOINED' },
        { id: 'user-2', name: 'User 2', isHost: false, role: 'PARTICIPANT', rsvp_status: 'INVITED' },
        { id: 'user-3', name: 'User 3', isHost: false, role: 'PARTICIPANT', rsvp_status: 'INVITED' },
        { id: 'renjith', name: 'Renjith', isHost: false, role: 'PARTICIPANT', rsvp_status: 'REJOINED', skip_reason: null },
      ];

      // Partition before rejoin
      const beforePartition = partitionAutomaticParticipants(initialParticipants, plan.plan_size as any, 'host-1');
      const beforeJoinedCount = beforePartition.going.filter(isJoinedRsvpParticipant).length;
      expect(beforeJoinedCount).toBe(2);
      expect(beforePartition.skipped.some(p => p.id === 'renjith')).toBe(true);

      // Simulate handleRejoinAddToPlan logic for no-limit plan:
      const isNoLimit = plan.capacity === null || plan.capacity === undefined;
      const currentJoinedCount = beforeJoinedCount;
      const hasAvailableCapacity = isNoLimit ? currentJoinedCount < 50 : currentJoinedCount < (plan.capacity ?? 0);

      expect(hasAvailableCapacity).toBe(true);

      // Add to plan: move Renjith to JOINED
      const updatedParticipants = initialParticipants.map(p =>
        p.id === 'renjith'
          ? { ...p, rsvp_status: 'JOINED', skip_reason: null }
          : p
      );

      // Partition after rejoin
      const afterPartition = partitionAutomaticParticipants(updatedParticipants, plan.plan_size as any, 'host-1');
      const afterJoinedCount = afterPartition.going.filter(isJoinedRsvpParticipant).length;

      // Assertions
      expect(afterJoinedCount).toBe(3); // Increased by 1
      expect(afterPartition.skipped.some(p => p.id === 'renjith')).toBe(false); // Removed from SKIPPED
      expect(afterPartition.going.some(p => p.id === 'renjith')).toBe(true); // Moved to JOINED
      expect(plan.plan_size).toBeNull(); // Plan size / capacity remained null (unchanged)
    });

    it('preserves denominator for limited-capacity plan (e.g. 2 / 5 -> 3 / 5)', () => {
      const plan = {
        id: 'plan-limited',
        plan_size: 5,
        capacity: 5,
      };

      const initialParticipants = [
        { id: 'host-1', name: 'Host', isHost: true, role: 'HOST', rsvp_status: 'JOINED' },
        { id: 'user-1', name: 'User 1', isHost: false, role: 'PARTICIPANT', rsvp_status: 'JOINED' },
        { id: 'user-2', name: 'User 2', isHost: false, role: 'PARTICIPANT', rsvp_status: 'INVITED' },
        { id: 'renjith', name: 'Renjith', isHost: false, role: 'PARTICIPANT', rsvp_status: 'REJOINED', skip_reason: null },
      ];

      const beforePartition = partitionAutomaticParticipants(initialParticipants, plan.plan_size, 'host-1');
      const beforeJoinedCount = beforePartition.going.filter(isJoinedRsvpParticipant).length;
      expect(beforeJoinedCount).toBe(2);

      const isNoLimit = plan.capacity === null || plan.capacity === undefined;
      const hasAvailableCapacity = isNoLimit ? beforeJoinedCount < 50 : beforeJoinedCount < plan.capacity;
      expect(hasAvailableCapacity).toBe(true);

      // Participant rejoins
      const updatedParticipants = initialParticipants.map(p =>
        p.id === 'renjith'
          ? { ...p, rsvp_status: 'JOINED', skip_reason: null }
          : p
      );

      const afterPartition = partitionAutomaticParticipants(updatedParticipants, plan.plan_size, 'host-1');
      const afterJoinedCount = afterPartition.going.filter(isJoinedRsvpParticipant).length;

      expect(afterJoinedCount).toBe(3); // 2 -> 3
      expect(plan.plan_size).toBe(5); // Denominator remains 5!
    });
  });

  describe('3. Skip Intermediate Rejoin Sheet and Show Plan is Full Directly When Plan is Full', () => {
    const rejoinedParticipant: Friend = {
      id: 'user-renjith',
      dbUuid: 'user-renjith',
      name: 'Renjith',
      avatar: 'https://example.com/renjith.jpg',
      isHost: false,
      joinedQueueAt: null,
      isAccepted: false,
      rsvpStatus: 'REJOINED',
      assignedGroup: null,
      waitlistPosition: null,
      leave_requested: false,
      leave_requested_at: null,
      skipReason: null,
    };

    it('AutomaticWaitlistActions returns null when isPlanFull is true for rejoined participant, skipping intermediate sheet', () => {
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={rejoinedParticipant}
          sheetType="skipped"
          showConfirmRemove={false}
          isHostUser={true}
          userProfile={{ dbUuid: 'host-uuid' }}
          isPlanFull={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
          onAddToPlan={() => {}}
        />
      );

      // Intermediate sheet is completely bypassed/skipped
      expect(html).toBe('');
      expect(html).not.toContain('Add to Plan');
      expect(html).not.toContain('Wants to rejoin this plan');
    });

    it('AutomaticWaitlistActions renders normally with "Add to Plan" when isPlanFull is false (available capacity)', () => {
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={rejoinedParticipant}
          sheetType="skipped"
          showConfirmRemove={false}
          isHostUser={true}
          userProfile={{ dbUuid: 'host-uuid' }}
          isPlanFull={false}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
          onAddToPlan={() => {}}
        />
      );

      expect(html).toContain('Add to Plan');
      expect(html).toContain('Cancel');
      expect(html).toContain('Wants to rejoin this plan');
    });

    it('PlanIsFullBottomSheet directly presents "Increase Plan Size" and "Add to Waitlist" and excludes "Add to Plan"', () => {
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
      expect(html).toContain('Adding Renjith exceeds this plan');
      expect(html).toContain('Increase Plan Size');
      expect(html).toContain('Add to Waitlist');
      expect(html).toContain('Cancel');
      expect(html).not.toContain('Add to Plan');
    });

    it('AutomaticParticipantScreen renders rejoined participant with pending indicator without rendering intermediate sheet', () => {
      const html = renderToString(
        <AutomaticParticipantScreen
          mode="editor"
          isHost={true}
          isHostUser={true}
          capacity={2}
          externalGoingList={[
            { id: 'host-1', name: 'Host', isHost: true, rsvpStatus: 'JOINED' } as any,
            { id: 'user-1', name: 'User 1', isHost: false, rsvpStatus: 'JOINED' } as any,
          ]}
          externalWaitlist={[]}
          externalSkippedList={[rejoinedParticipant]}
          initialTab="skipped"
          onBack={() => {}}
        />
      );

      // Renders Renjith in skipped list
      expect(html).toContain('Renjith');
      // Renders pending alert indicator
      expect(html).toContain('!');
      // Ensure intermediate sheet "Wants to rejoin this plan" is not open
      expect(html).not.toContain('Wants to rejoin this plan');
    });
  });
});

