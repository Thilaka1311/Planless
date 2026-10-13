import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AutomaticParticipantScreen } from '../automatic/AutomaticParticipantScreen';
import { AssignedParticipantScreen } from '../assigned/AssignedParticipantScreen';
import { WhoIsActuallyComing } from '../../create/screens/WhoIsActuallyComing';

vi.mock('../../friendships/state/FriendshipContext', () => ({
  useFriendshipStore: () => ({
    friends: [],
    refreshFriendships: vi.fn(),
  }),
}));

describe('Manage Participants Add Button Parity Suite', () => {
  const dummyUserProfile = {
    id: 'user-host',
    dbUuid: 'user-host',
    name: 'You',
    avatar: '',
  };

  const dummyFriends = [
    { id: 'f-1', dbUuid: 'f-1', name: 'Bhaavya', avatar: '' },
    { id: 'f-2', dbUuid: 'f-2', name: 'RAAM', avatar: '' },
  ];

  it('1. AutomaticParticipantScreen in wizard mode renders Add Participants button and omits Next arrow when onContinue is undefined', () => {
    const onAddFriendsMock = vi.fn();

    const html = renderToString(
      <AutomaticParticipantScreen
        title="Participants"
        category="custom"
        capacity={5}
        mode="wizard"
        isHost={true}
        isHostUser={true}
        userProfile={dummyUserProfile}
        selectedFriends={dummyFriends}
        externalGoingList={[]}
        externalWaitlist={[]}
        externalInvitedList={[]}
        isHostSelected={true}
        onBack={() => {}}
        onAddFriends={onAddFriendsMock}
      />
    );

    // Verify Add Participants button is rendered
    expect(html).toContain('title="Invite to Plan"');
    expect(html).toContain('bg-[#FF6B2C]');
    expect(html).toContain('lucide-user-plus');

    // Verify orange Next arrow / Continue button is NOT rendered
    expect(html).not.toContain('Continue');
    expect(html).not.toContain('lucide-arrow-right');
  });

  it('2. AssignedParticipantScreen in wizard mode renders Add Participants button and omits Next arrow when onContinue is undefined', () => {
    const onAddFriendsMock = vi.fn();

    const html = renderToString(
      <AssignedParticipantScreen
        title="Participants"
        category="custom"
        capacity={5}
        mode="wizard"
        isHost={true}
        isHostUser={true}
        userProfile={dummyUserProfile}
        selectedFriends={dummyFriends}
        externalGoingList={[]}
        externalWaitlist={[]}
        externalInvitedList={[]}
        isHostSelected={true}
        onBack={() => {}}
        onAddFriends={onAddFriendsMock}
      />
    );

    // Verify Add Participants button is rendered
    expect(html).toContain('title="Add to Joined"');
    expect(html).toContain('bg-[#FF6B2C]');
    expect(html).toContain('lucide-user-plus');

    // Verify orange Next arrow / Continue button is NOT rendered
    expect(html).not.toContain('Continue');
    expect(html).not.toContain('lucide-arrow-right');
  });

  it('3. WhoIsActuallyComing renders title "Participants", renders Add Participants button, and suppresses Next arrow', () => {
    const mockForm = {
      localTitle: 'Friday Dinner',
      selectedFriends: dummyFriends,
      isHostSelected: true,
      userProfile: dummyUserProfile,
      activeUserId: 'user-host',
      totalCapacity: 5,
      waitlistMode: 'automatic',
      setSelectedFriends: vi.fn(),
      setPriorityGuestIds: vi.fn(),
      setTotalCapacity: vi.fn(),
      setWaitlistMode: vi.fn(),
    };

    const onAddFriendsMock = vi.fn();
    const onBackMock = vi.fn();

    const html = renderToString(
      <WhoIsActuallyComing
        form={mockForm}
        selectedCategory="dining"
        onBack={onBackMock}
        onAddFriends={onAddFriendsMock}
      />
    );

    // Renders header with "Participants"
    expect(html).toContain('Participants');

    // Renders floating Add Participants button
    expect(html).toContain('title="Invite to Plan"');
    expect(html).toContain('lucide-user-plus');
    expect(html).toContain('bg-[#FF6B2C]');

    // Does NOT render ContinueButton / ArrowRight
    expect(html).not.toContain('Continue');
    expect(html).not.toContain('lucide-arrow-right');
  });

  it('4. When onContinue is explicitly provided to AutomaticParticipantScreen, ContinueButton is rendered and Add Participants is hidden', () => {
    const onContinueMock = vi.fn();
    const onAddFriendsMock = vi.fn();

    const html = renderToString(
      <AutomaticParticipantScreen
        title="Participants"
        category="custom"
        capacity={5}
        mode="wizard"
        isHost={true}
        isHostUser={true}
        userProfile={dummyUserProfile}
        selectedFriends={dummyFriends}
        externalGoingList={[]}
        externalWaitlist={[]}
        externalInvitedList={[]}
        isHostSelected={true}
        onBack={() => {}}
        onContinue={onContinueMock}
        onAddFriends={onAddFriendsMock}
      />
    );

    // When onContinue is supplied, Next arrow is rendered
    expect(html).toContain('lucide-arrow-right');
    // And Add Participants button is suppressed
    expect(html).not.toContain('lucide-user-plus');
  });
});
