import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AssignedParticipantScreen } from '../AssignedParticipantScreen';
import { AutomaticParticipantScreen } from '../../automatic/AutomaticParticipantScreen';
import { ParticipantManagementScreen } from '../../screens/ParticipantManagementScreen';
import { Friend } from '../../shared/types';

vi.mock('../../../friendships/state/FriendshipContext', () => ({
  useFriendshipStore: () => ({
    friends: [],
    refreshFriendships: vi.fn(),
  }),
}));

describe('AssignedParticipantScreen & ParticipantManagementScreen Safety Suite', () => {
  const dummyUser = {
    dbUuid: 'host-123',
    name: 'Thilak',
    avatar: 'https://example.com/avatar.png',
  };

  const sampleFriend1: Friend = {
    id: 'f-1',
    dbUuid: 'f-1',
    name: 'Alice',
    avatar: 'https://example.com/alice.png',
    isHost: false,
    rsvpStatus: 'JOINED',
    assignedGroup: 'GOING',
  };

  const sampleFriend2: Friend = {
    id: 'f-2',
    dbUuid: 'f-2',
    name: 'Bob',
    avatar: 'https://example.com/bob.png',
    isHost: false,
    rsvpStatus: 'WAITLISTED',
    assignedGroup: 'WAITLIST',
    waitlistPosition: 1,
  };

  it('1. Initial render before participant data has loaded (wizard mode, missing external lists)', () => {
    // Exactly mimics WhoIsActuallyComing mounting with uninitialized/omitted external lists
    const html = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="wizard"
        isHostSelected={true}
        userProfile={dummyUser}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
    expect(html).toContain('You');
  });

  it('2. Empty participant lists render cleanly without errors', () => {
    const html = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="wizard"
        isHostSelected={false}
        selectedFriends={[]}
        externalGoingList={[]}
        externalWaitlist={[]}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
  });

  it('3. Normal populated participant lists render correctly in wizard mode', () => {
    const html = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="wizard"
        isHostSelected={true}
        userProfile={dummyUser}
        selectedFriends={[sampleFriend1, sampleFriend2]}
        capacity={2}
        onBack={() => {}}
      />
    );
    expect(html).toContain('You');
    expect(html).toContain('Alice');
  });

  it('4. Normal populated participant lists render correctly in editor mode', () => {
    const htmlGoing = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="editor"
        initialTab="going"
        capacity={1}
        isHost={true}
        isHostUser={true}
        externalGoingList={[sampleFriend1]}
        externalWaitlist={[sampleFriend2]}
        externalInvitedList={[]}
        externalSkippedList={[]}
        onBack={() => {}}
      />
    );
    expect(htmlGoing).toContain('Alice');

    const htmlWaitlist = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="editor"
        initialTab="waitlist"
        capacity={1}
        isHost={true}
        isHostUser={true}
        externalGoingList={[sampleFriend1]}
        externalWaitlist={[sampleFriend2]}
        externalInvitedList={[]}
        externalSkippedList={[]}
        onBack={() => {}}
      />
    );
    expect(htmlWaitlist).toContain('Bob');
  });

  it('5. Missing or malformed data: handles undefined/null external lists in editor mode gracefully', () => {
    // In case RPC response or store is momentarily null or undefined before loading
    const html = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        mode="editor"
        isHost={true}
        isHostUser={true}
        externalGoingList={undefined}
        externalWaitlist={undefined}
        externalInvitedList={undefined}
        externalSkippedList={undefined}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
  });

  it('6. ParticipantManagementScreen router properly normalizes props for Assigned mode', () => {
    const html = renderToString(
      <ParticipantManagementScreen
        title="Participants"
        mode="wizard"
        waitlistMode="assigned"
        isHostSelected={true}
        userProfile={dummyUser}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
    expect(html).toContain('You');
  });

  it('7. ParticipantManagementScreen router properly normalizes props for Automatic mode', () => {
    const html = renderToString(
      <ParticipantManagementScreen
        title="Participants"
        mode="wizard"
        waitlistMode="automatic"
        isHostSelected={true}
        userProfile={dummyUser}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
    expect(html).toContain('You');
  });

  it('8. AutomaticParticipantScreen handles undefined/null arrays gracefully without crashing', () => {
    const html = renderToString(
      <AutomaticParticipantScreen
        title="Participants"
        mode="wizard"
        isHostSelected={true}
        userProfile={dummyUser}
        selectedFriends={undefined as any}
        externalGoingList={undefined as any}
        externalWaitlist={undefined as any}
        externalInvitedList={undefined as any}
        onBack={() => {}}
      />
    );
    expect(html).toContain('Participants');
    expect(html).toContain('You');
  });
});
