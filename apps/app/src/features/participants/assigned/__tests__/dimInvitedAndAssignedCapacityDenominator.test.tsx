import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StackingFriends } from '../../components/StackingFriends';
import { AssignedParticipantTabs } from '../AssignedParticipantTabs';
import { AutomaticParticipantTabs } from '../../automatic/AutomaticParticipantTabs';
import { ParticipantTabs } from '../../shared/ParticipantTabs';
import { Friend } from '../../shared/types';

describe('Create Plan Review — Dim Invited Participants & Show Assigned Capacity', () => {
  describe('1. Dim invited participants in Joined and Waitlist', () => {
    it('An invited participant appears dimmed in Joined', () => {
      const invitedFriend: Friend = {
        id: 'user-aznan',
        dbUuid: 'user-aznan-uuid',
        name: 'Aznan',
        avatar: '',
        rsvpStatus: 'INVITED',
        isHost: false,
      };

      const html = renderToString(
        <StackingFriends item={invitedFriend} isHost={true} />
      );

      // Muted styling: opacity 0.55 and #8E8E93 text color
      expect(html).toContain('opacity:0.55');
      expect(html).toContain('color:#8E8E93');
      expect(html).toContain('Aznan');
    });

    it('A newly selected friend without prior RSVP status appears dimmed as invited', () => {
      const newFriend: Friend = {
        id: 'user-bhaavya',
        dbUuid: 'user-bhaavya-uuid',
        name: 'Bhaavya',
        avatar: '',
        isHost: false,
      };

      const html = renderToString(
        <StackingFriends item={newFriend} isHost={true} />
      );

      expect(html).toContain('opacity:0.55');
      expect(html).toContain('color:#8E8E93');
      expect(html).toContain('Bhaavya');
    });

    it('An invited participant appears dimmed in Waitlist', () => {
      const waitlistInvitedFriend: Friend = {
        id: 'user-wait-inv',
        dbUuid: 'user-wait-inv-uuid',
        name: 'Waitlist Invitee',
        avatar: '',
        rsvpStatus: 'INVITED',
        assignedGroup: 'WAITLIST',
        waitlistPosition: 1,
        isHost: false,
      };

      const html = renderToString(
        <StackingFriends item={waitlistInvitedFriend} isHost={true} showIndex={true} index={1} />
      );

      expect(html).toContain('opacity:0.55');
      expect(html).toContain('color:#8E8E93');
      expect(html).toContain('Waitlist Invitee');
      expect(html).toContain('#1');
    });

    it('Joined and waitlisted participants retain normal styling', () => {
      const joinedFriend: Friend = {
        id: 'user-joined',
        dbUuid: 'user-joined-uuid',
        name: 'Joined User',
        avatar: '',
        rsvpStatus: 'JOINED',
        isHost: false,
      };

      const waitlistedFriend: Friend = {
        id: 'user-waitlisted',
        dbUuid: 'user-waitlisted-uuid',
        name: 'Waitlisted User',
        avatar: '',
        rsvpStatus: 'WAITLISTED',
        waitlistPosition: 1,
        isHost: false,
      };

      const hostFriend: Friend = {
        id: 'user-host',
        dbUuid: 'user-host-uuid',
        name: 'You',
        avatar: '',
        isHost: true,
      };

      const joinedHtml = renderToString(<StackingFriends item={joinedFriend} isHost={true} />);
      const waitlistHtml = renderToString(<StackingFriends item={waitlistedFriend} isHost={true} />);
      const hostHtml = renderToString(<StackingFriends item={hostFriend} isHost={true} />);

      // Normal appearance: opacity 1, white text color (#FFFFFF)
      expect(joinedHtml).toContain('opacity:1');
      expect(joinedHtml).toContain('color:#FFFFFF');
      expect(joinedHtml).not.toContain('color:#8E8E93');

      expect(waitlistHtml).toContain('opacity:1');
      expect(waitlistHtml).toContain('color:#FFFFFF');
      expect(waitlistHtml).not.toContain('color:#8E8E93');

      expect(hostHtml).toContain('opacity:1');
      expect(hostHtml).toContain('color:#FFFFFF');
      expect(hostHtml).toContain('Host');
    });

    it('Moving a participant between states updates styling immediately', () => {
      const participant: Friend = {
        id: 'user-aznan',
        dbUuid: 'user-aznan-uuid',
        name: 'Aznan',
        avatar: '',
        rsvpStatus: 'INVITED',
        isHost: false,
      };

      // Before transition: INVITED -> dimmed
      const beforeHtml = renderToString(<StackingFriends item={participant} isHost={true} />);
      expect(beforeHtml).toContain('opacity:0.55');
      expect(beforeHtml).toContain('color:#8E8E93');

      // Transitions to JOINED -> normal
      const joinedParticipant: Friend = {
        ...participant,
        rsvpStatus: 'JOINED',
      };
      const afterJoinedHtml = renderToString(<StackingFriends item={joinedParticipant} isHost={true} />);
      expect(afterJoinedHtml).toContain('opacity:1');
      expect(afterJoinedHtml).toContain('color:#FFFFFF');

      // Transitions to WAITLISTED -> normal
      const waitlistedParticipant: Friend = {
        ...participant,
        rsvpStatus: 'WAITLISTED',
        waitlistPosition: 1,
      };
      const afterWaitlistHtml = renderToString(<StackingFriends item={waitlistedParticipant} isHost={true} />);
      expect(afterWaitlistHtml).toContain('opacity:1');
      expect(afterWaitlistHtml).toContain('color:#FFFFFF');
    });
  });

  describe('2. Show the participant count denominator', () => {
    it('Joined (1 / 6) and Waitlist (3 / 6) display correctly for a capacity of six', () => {
      const html = renderToString(
        <AssignedParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={6}
          waitlistCount={3}
          onTabChange={() => {}}
        />
      );

      expect(html).toContain('Joined (1 / 6)');
      expect(html).toContain('Waitlist (3 / 6)');
    });

    it('Shared ParticipantTabs also displays Joined (1 / 6) and Waitlist (3 / 6) when configured', () => {
      const html = renderToString(
        <ParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={6}
          waitlistCount={3}
          onTabChange={() => {}}
        />
      );

      expect(html).toContain('Joined (1 / 6)');
      expect(html).toContain('Waitlist (3 / 6)');
    });

    it('Moving a participant between states updates counts immediately with authoritative capacity', () => {
      // Initially: 1 Joined, 3 Waitlisted with capacity 6
      const htmlStep1 = renderToString(
        <AssignedParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={6}
          waitlistCount={3}
          onTabChange={() => {}}
        />
      );
      expect(htmlStep1).toContain('Joined (1 / 6)');
      expect(htmlStep1).toContain('Waitlist (3 / 6)');

      // Move 1 participant from Waitlist to Joined:
      const htmlStep2 = renderToString(
        <AssignedParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={2}
          capacity={6}
          waitlistCount={2}
          onTabChange={() => {}}
        />
      );
      expect(htmlStep2).toContain('Joined (2 / 6)');
      expect(htmlStep2).toContain('Waitlist (2 / 6)');
    });

    it('Removing a participant updates the relevant count without corrupting the configured capacity', () => {
      // Removing a waitlist participant reduces waitlistCount from 3 to 2, capacity stays 6
      const html = renderToString(
        <AssignedParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={6}
          waitlistCount={2}
          onTabChange={() => {}}
        />
      );
      expect(html).toContain('Joined (1 / 6)');
      expect(html).toContain('Waitlist (2 / 6)');
    });

    it('No-limit mode does not invent a finite denominator', () => {
      const assignedNoLimitHtml = renderToString(
        <AssignedParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={null}
          waitlistCount={3}
          noLimitDenominator={4}
          onTabChange={() => {}}
        />
      );

      expect(assignedNoLimitHtml).toContain('Joined (1)');
      expect(assignedNoLimitHtml).toContain('Waitlist (3)');
      expect(assignedNoLimitHtml).not.toContain('/ 4');
      expect(assignedNoLimitHtml).not.toContain('/ null');

      const sharedNoLimitHtml = renderToString(
        <ParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={undefined}
          waitlistCount={3}
          onTabChange={() => {}}
        />
      );

      expect(sharedNoLimitHtml).toContain('Joined (1)');
      expect(sharedNoLimitHtml).toContain('Waitlist (3)');
      expect(sharedNoLimitHtml).not.toContain(' / ');
    });

    it('Automatic mode preserves existing automatic-capacity behavior', () => {
      // With configured capacity = 6: Joined has denominator, Waitlist is open queue count
      const autoConfiguredHtml = renderToString(
        <AutomaticParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={6}
          waitlistCount={3}
          onTabChange={() => {}}
        />
      );

      expect(autoConfiguredHtml).toContain('Joined (1 / 6)');
      expect(autoConfiguredHtml).toContain('Waitlist (3)');

      // With no-limit (capacity = null): Joined does not invent denominator
      const autoNoLimitHtml = renderToString(
        <AutomaticParticipantTabs
          visibleTabs={['going', 'waitlist']}
          activeTab="going"
          goingCount={1}
          capacity={null}
          waitlistCount={3}
          noLimitDenominator={4}
          onTabChange={() => {}}
        />
      );

      expect(autoNoLimitHtml).toContain('Joined (1)');
      expect(autoNoLimitHtml).toContain('Waitlist (3)');
      expect(autoNoLimitHtml).not.toContain('/ 4');
    });
  });
});
