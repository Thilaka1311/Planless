import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { ChatsScreen } from "../screens/ChatsScreen";
import { Plan, UserProfile } from "../../../core/types";

const { mockPlan1, mockPlan2, mockProfile } = vi.hoisted(() => {
  const plan1: Plan = {
    id: "plan-timezone-1",
    dbUuid: "plan-timezone-1",
    title: "Timezone Phoenix Mall of Asia",
    location: "Mall of Asia, Bengaluru",
    category: "sports",
    date: "TOMORROW",
    time: "15:30",
    paymentAmount: 0,
    cost: 0,
    status: "LIVE",
    hostId: "user-thilak",
    creatorId: "user-thilak",
    creatorName: "Thilak",
    creatorAvatar: "https://example.com/avatar.webp",
    coverImage: undefined,
    members: [
      {
        userId: "user-thilak",
        name: "Thilak",
        avatar: "https://example.com/avatar.webp",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: new Date().toISOString(),
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "tomorrow",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  const plan2: Plan = {
    id: "plan-doomsday-2",
    dbUuid: "plan-doomsday-2",
    title: "Doomsday",
    location: "RMZ Galleria Mall",
    category: "movies",
    date: "TODAY",
    time: "19:00",
    paymentAmount: 0,
    cost: 0,
    status: "LIVE",
    hostId: "user-thilak",
    creatorId: "user-thilak",
    creatorName: "Thilak",
    creatorAvatar: "https://example.com/avatar.webp",
    coverImage: undefined,
    members: [
      {
        userId: "user-thilak",
        name: "Thilak",
        avatar: "https://example.com/avatar.webp",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: new Date().toISOString(),
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "today",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  const profile: UserProfile = {
    dbUuid: "user-thilak",
    user_id: "user-thilak",
    name: "Thilak",
    phone: "9876543210",
    avatar: "https://example.com/avatar.webp",
    bio: "",
    joined: true,
  };

  return { mockPlan1: plan1, mockPlan2: plan2, mockProfile: profile };
});

vi.mock("../../plans/state/PlansContext", () => ({
  usePlansStore: vi.fn().mockReturnValue({
    plans: [mockPlan1, mockPlan2],
    dbPlans: [mockPlan1, mockPlan2],
    dbPlanParticipants: [
      {
        plan_id: mockPlan1.id,
        user_id: mockProfile.dbUuid,
        role: "HOST",
        rsvp_status: "JOINED",
      },
      {
        plan_id: mockPlan2.id,
        user_id: mockProfile.dbUuid,
        role: "HOST",
        rsvp_status: "JOINED",
      },
    ],
  }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: vi.fn().mockReturnValue({
    dbUsers: [],
    userProfile: mockProfile,
    activeUserId: mockProfile.user_id,
    activeUserUuid: mockProfile.dbUuid,
  }),
}));

describe("ChatsScreen Tab Switch Stability Regression Suite", () => {
  it("renders ChatsScreen cleanly starting at the sticky search bar without duplicate top header", () => {
    const html = renderToString(
      <ChatsScreen
        onSelectChatPlan={vi.fn()}
        setActiveTab={vi.fn()}
      />
    );

    // 1. Must NOT contain internal duplicate header tag
    expect(html).not.toContain('id="chats_screen_header"');

    // 2. Begins immediately at the sticky search container
    expect(html).toContain('id="search-chats-input"');
    expect(html).toContain('Search chats...');

    // 3. Renders chat rows with stable layout
    expect(html).toContain("Timezone Phoenix Mall of Asia");
    expect(html).toContain("Doomsday");

    // 4. Rows have fixed 70px height without unstable motion layout wrappers
    expect(html).toContain("h-[70px]");
  });
});
