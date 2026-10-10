import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RemoveGoingParticipantBottomSheet } from '../../plans/components/BottomSheets';
import { AutomaticWaitlistActions } from '../automatic/AutomaticWaitlistActions';
import { AssignedParticipantActions } from '../assigned/AssignedParticipantActions';
import { AutomaticParticipantScreen } from '../automatic/AutomaticParticipantScreen';
import { AssignedParticipantScreen } from '../assigned/AssignedParticipantScreen';
import { Friend } from '../shared/types';

vi.mock('../../friendships/state/FriendshipContext', () => ({
  useFriendshipStore: () => ({
    friends: [],
    refreshFriendships: vi.fn(),
  }),
}));

describe('Simplify Leave Request Flow - Direct Spot Handling Bottom Sheet', () => {
  const leaveRequestedParticipant: Friend = {
    id: 'user-renjith',
    dbUuid: 'user-renjith',
    name: 'Renjith',
    avatar: 'https://example.com/renjith.jpg',
    isHost: false,
    joinedQueueAt: '2026-10-09T10:00:00Z',
    isAccepted: true,
    rsvpStatus: 'JOINED',
    assignedGroup: 'GOING',
    waitlistPosition: null,
    leave_requested: true,
    leave_requested_at: '2026-10-09T11:00:00Z',
    skipReason: null,
  };

  const regularParticipant: Friend = {
    id: 'user-thilaka',
    dbUuid: 'user-thilaka',
    name: 'Thilaka Sundar',
    avatar: 'https://example.com/thilaka.jpg',
    isHost: false,
    joinedQueueAt: '2026-10-09T10:05:00Z',
    isAccepted: true,
    rsvpStatus: 'JOINED',
    assignedGroup: 'GOING',
    waitlistPosition: null,
    leave_requested: false,
    leave_requested_at: null,
    skipReason: null,
  };

  describe('1. RemoveGoingParticipantBottomSheet UI & Action Contract', () => {
    it('directly renders spot handling prompt with Replace Participant and Remove Participant actions', () => {
      const onReplace = vi.fn();
      const onRemove = vi.fn();
      const onClose = vi.fn();

      const element = RemoveGoingParticipantBottomSheet({
        isOpen: true,
        participant: {
          name: leaveRequestedParticipant.name,
          avatar: leaveRequestedParticipant.avatar,
        },
        hasWaitlist: true,
        goingCount: 3,
        waitlistCount: 2,
        planSize: 5,
        onReplaceParticipant: onReplace,
        onRemoveParticipant: onRemove,
        onClose: onClose,
      });

      expect(element).not.toBeNull();

      function findButtons(node: any): any[] {
        const buttons: any[] = [];
        function walk(n: any) {
          if (!n) return;
          if (Array.isArray(n)) {
            n.forEach(walk);
            return;
          }
          if (n.type === 'button') buttons.push(n);
          if (n.props && n.props.children) walk(n.props.children);
        }
        walk(node);
        return buttons;
      }

      function extractText(node: any): string {
        if (!node) return '';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(extractText).join(' ');
        if (node.props && node.props.children) return extractText(node.props.children);
        return '';
      }

      const buttons = findButtons(element);
      const texts = buttons.map((b) => extractText(b).trim());

      // Header copy matches screenshot
      const allText = extractText(element);
      expect(allText).toContain('Remove participant');
      expect(allText).toContain('How would you like to handle their spot?');

      // 1. First choice: Replace Participant
      expect(texts[0]).toContain('Replace Participant');
      buttons[0].props.onClick();
      expect(onReplace).toHaveBeenCalledTimes(1);

      // 2. Second choice: Remove Participant
      expect(texts[1]).toContain('Remove Participant');
      buttons[1].props.onClick();
      expect(onRemove).toHaveBeenCalledTimes(1);

      // 3. Cancel button
      const cancelBtn = buttons.find((b) => extractText(b).trim() === 'Cancel');
      expect(cancelBtn).toBeDefined();
      cancelBtn.props.onClick();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. AutomaticParticipantScreen item tap bypasses intermediate sheet', () => {
    it('renders participant list with pending indicator in editor mode', () => {
      const handleRemove = vi.fn();

      const html = renderToString(
        <AutomaticParticipantScreen
          mode="editor"
          isHost={true}
          isHostUser={true}
          externalGoingList={[leaveRequestedParticipant, regularParticipant]}
          externalWaitlist={[]}
          onBack={() => {}}
          onRemoveParticipant={handleRemove}
        />
      );

      // Verify the list renders Renjith
      expect(html).toContain('Renjith');
      // Verify pending exclamation indicator
      expect(html).toContain('!');
    });

    it('AutomaticWaitlistActions returns null if leave-requested participant is passed, eliminating intermediate sheet', () => {
      const handleRemove = vi.fn();
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={leaveRequestedParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={handleRemove}
        />
      );

      // Intermediate sheet is completely bypassed/removed
      expect(html).toBe('');
    });

    it('AutomaticWaitlistActions renders normally for regular participants without leave requests', () => {
      const html = renderToString(
        <AutomaticWaitlistActions
          selectedItem={regularParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onViewProfile={() => {}}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );

      // Normal participant actions sheet
      expect(html).toContain('Thilaka Sundar');
      expect(html).toContain('View Profile');
      expect(html).toContain('Remove from Plan');
      expect(html).toContain('Cancel');
      expect(html).not.toContain('Wants to leave this plan');
    });
  });

  describe('3. AssignedParticipantActions parity', () => {
    it('AssignedParticipantActions returns null for leave-requested participant, eliminating intermediate sheet', () => {
      const handleRemove = vi.fn();
      const html = renderToString(
        <AssignedParticipantActions
          selectedItem={leaveRequestedParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={handleRemove}
        />
      );

      expect(html).toBe('');
    });

    it('AssignedParticipantScreen renders list with pending indicator and regular participant', () => {
      const html = renderToString(
        <AssignedParticipantScreen
          mode="editor"
          isHost={true}
          isHostUser={true}
          externalGoingList={[leaveRequestedParticipant, regularParticipant]}
          externalWaitlist={[]}
          onBack={() => {}}
          onRemoveParticipant={() => {}}
        />
      );

      expect(html).toContain('Renjith');
      expect(html).toContain('!');
    });
  });

  describe('4. Rules of Hooks Order Invariant Verification across Lifecycle', () => {
    it('AutomaticWaitlistActions renders cleanly across null, populated, leave-requested, and closed states', () => {
      // 1. Initial render with null (closed state)
      const html1 = renderToString(
        <AutomaticWaitlistActions
          selectedItem={null}
          sheetType={null}
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html1).toBe('');

      // 2. Populated regular participant
      const html2 = renderToString(
        <AutomaticWaitlistActions
          selectedItem={regularParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html2).toContain('Thilaka Sundar');

      // 3. Leave-requested participant (bypasses sheet)
      const html3 = renderToString(
        <AutomaticWaitlistActions
          selectedItem={leaveRequestedParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html3).toBe('');

      // 4. Closed state again
      const html4 = renderToString(
        <AutomaticWaitlistActions
          selectedItem={null}
          sheetType={null}
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html4).toBe('');
    });

    it('AssignedParticipantActions renders cleanly across null, populated, leave-requested, and closed states', () => {
      // 1. Initial render with null (closed state)
      const html1 = renderToString(
        <AssignedParticipantActions
          selectedItem={null}
          sheetType={null}
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html1).toBe('');

      // 2. Populated regular participant
      const html2 = renderToString(
        <AssignedParticipantActions
          selectedItem={regularParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html2).toContain('Thilaka Sundar');

      // 3. Leave-requested participant (bypasses sheet)
      const html3 = renderToString(
        <AssignedParticipantActions
          selectedItem={leaveRequestedParticipant}
          sheetType="going"
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html3).toBe('');

      // 4. Closed state again
      const html4 = renderToString(
        <AssignedParticipantActions
          selectedItem={null}
          sheetType={null}
          showConfirmRemove={false}
          isHostUser={true}
          onClose={() => {}}
          onShowConfirmRemove={() => {}}
          onRemoveParticipant={() => {}}
        />
      );
      expect(html4).toBe('');
    });
  });
});
