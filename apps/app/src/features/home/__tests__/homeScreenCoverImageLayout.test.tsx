import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PlanCard } from "../components/PlanCard";
import { PlanStack } from "../components/PlanFeed";
import { HomeScreen } from "../screens/HomeScreen";
import { Plan, UserProfile } from "../../../core/types";

const { mockCustomPlan, mockPlacesPlan, mockDefaultPlan, mockUserProfile } = vi.hoisted(() => {
  const profile: UserProfile = {
    dbUuid: "user-thilak-uuid",
    user_id: "user-thilak",
    name: "Thilak Sundar",
    phone: "9876543210",
    avatar: "",
    bio: "",
    joined: true,
    college_or_work: "",
    profile_completed: true,
  };

  const customPlan: Plan = {
    id: "plan-custom-1",
    dbUuid: "plan-custom-1",
    title: "Turf Football Match",
    location: "Play Arena, Bengaluru",
    category: "sports",
    sports_type: "Football",
    date: "TODAY",
    time: "20:00",
    paymentAmount: 400,
    cost: 400,
    status: "LIVE",
    hostId: "host-renjith",
    creatorId: "host-renjith",
    creatorName: "Renjith",
    creatorAvatar: "https://example.com/renjith.jpg",
    coverImage: "plan-images/b2101be3-29ad-4440-b1db-7c9f6e83903f/plancoverimage1.webp",
    members: [
      {
        userId: "host-renjith",
        userUuid: "host-renjith",
        name: "Renjith",
        avatar: "https://example.com/renjith.jpg",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: "2026-10-15T10:00:00Z",
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "today",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  const placesPlan: Plan = {
    id: "plan-places-1",
    dbUuid: "plan-places-1",
    title: "Bengaluru Turf Inc.",
    location: "Yelahanka, Bengaluru",
    category: "sports",
    sports_type: "Football",
    date: "TOMORROW",
    time: "18:00",
    paymentAmount: 600,
    cost: 600,
    status: "LIVE",
    hostId: "host-renjith",
    creatorId: "host-renjith",
    creatorName: "Renjith",
    creatorAvatar: "https://example.com/renjith.jpg",
    coverImage: "https://wecmpncixopetvunkkyd.supabase.co/functions/v1/maps?action=photo&photo_reference=Aa-ngMadpzDQ3CGOls7HsVBFjUd7ILEM9XWFNGadIWYXHp0K4XPtyRpWNCAg7UG28WmeblIUPKA9JJPmasHfLwtGIQK6ovzpMI5KtCDrXltYM9N5_D-5j4rOmjwst02RfslpVjdCUt1WzSj5pm-xMNpldXOUg2UN8YlViJjXGFwv-2G1cH7vXOjexZk_4WjUlS-GDvtxUYRa1WNksfjUIW2ftLeRCtYSxNOh6shWvpmTj72BK8Y2Prr62xR9-Un5GTYwcZBcIFe0LQRVSilEuLHep9OFlBAClQi9GQ0_RXGnB5x-O8fWt5vXu2x_3IlPG5EpnkDtGfZ3leLZm2sEeiSsNhVLWl6gnco0M6GY1mF1xjZoIrk6TsU0VsGhgDiUhcMlHgQBe-2XIAXPyxREQ0QJRHN-4xcUSMsjLCc5q0aFEhRFFw&maxwidth=800",
    members: [
      {
        userId: "host-renjith",
        userUuid: "host-renjith",
        name: "Renjith",
        avatar: "https://example.com/renjith.jpg",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: "2026-10-15T10:00:00Z",
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "tomorrow",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  const defaultPlan: Plan = {
    id: "plan-default-1",
    dbUuid: "plan-default-1",
    title: "Casual Movie Night",
    location: "PVR Cinemas",
    category: "movies",
    date: "TODAY",
    time: "21:30",
    paymentAmount: 350,
    cost: 350,
    status: "LIVE",
    hostId: "host-renjith",
    creatorId: "host-renjith",
    creatorName: "Renjith",
    creatorAvatar: "https://example.com/renjith.jpg",
    coverImage: "",
    members: [
      {
        userId: "host-renjith",
        userUuid: "host-renjith",
        name: "Renjith",
        avatar: "https://example.com/renjith.jpg",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: "2026-10-15T10:00:00Z",
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "today",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  return {
    mockCustomPlan: customPlan,
    mockPlacesPlan: placesPlan,
    mockDefaultPlan: defaultPlan,
    mockUserProfile: profile,
  };
});

vi.mock("../../plans/hooks/useLivePlan", () => ({
  useLivePlan: vi.fn((id) => {
    if (id === mockCustomPlan.id) return mockCustomPlan;
    if (id === mockPlacesPlan.id) return mockPlacesPlan;
    if (id === mockDefaultPlan.id) return mockDefaultPlan;
    return null;
  }),
}));

vi.mock("../../plans/state/PlansContext", () => ({
  usePlansStore: vi.fn().mockReturnValue({
    plans: [mockCustomPlan, mockPlacesPlan, mockDefaultPlan],
    dbPlans: [mockCustomPlan, mockPlacesPlan, mockDefaultPlan],
    dbPlanParticipants: [],
  }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: vi.fn().mockReturnValue({
    dbUsers: [],
    activeUserUuid: mockUserProfile.dbUuid,
    activeUserId: mockUserProfile.user_id,
    userProfile: mockUserProfile,
  }),
}));

describe("Home Screen Cover Image Layout & Composition Regression Suite", () => {
  it("renders custom cover image inside bounded container without displacing title and metadata capsule", () => {
    const html = renderToString(
      <PlanCard
        planId={mockCustomPlan.id}
        userProfile={mockUserProfile}
        interestedPlanIds={[]}
        setSelectedPlan={vi.fn()}
        setPaymentConfirmationPlan={vi.fn()}
        walletBalance={0}
        handleToggleJoin={vi.fn()}
        setShowPaymentSuccess={vi.fn()}
        setNotifications={vi.fn()}
        activeCardId={mockCustomPlan.id}
        handleSnoozePlan={vi.fn()}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onSelectCard={vi.fn()}
      />
    );

    // 1. Image container is strictly bounded (overflow-hidden, pointer-events-none, z-0)
    expect(html).toContain("overflow-hidden pointer-events-none z-0");

    // 2. Canonical cover image uses object-fit: cover
    expect(html).toContain("object-fit:cover");
    expect(html).toContain("object-cover");

    // 3. Image points to canonical plan coverImage without requiring separate card upload
    expect(html).toContain("plancoverimage1.webp");

    // 4. Plan title is fully rendered and visible in ParticipantToggleBar
    expect(html).toContain("Turf Football Match");

    // 5. Floating capsule ParticipantToggleBar has z-20 stacking above image (z-0) and gradient (z-10)
    expect(html).toContain("z-20 relative select-none cursor-pointer overflow-hidden rounded-[24px]");

    // 6. Legibility gradient is positioned above the image
    expect(html).toContain("from-black/80 via-black/40 to-transparent pointer-events-none z-10");
  });

  it("renders Google Places external landscape cover image cleanly cropped via CSS object-fit", () => {
    const html = renderToString(
      <PlanCard
        planId={mockPlacesPlan.id}
        userProfile={mockUserProfile}
        interestedPlanIds={[]}
        setSelectedPlan={vi.fn()}
        setPaymentConfirmationPlan={vi.fn()}
        walletBalance={0}
        handleToggleJoin={vi.fn()}
        setShowPaymentSuccess={vi.fn()}
        setNotifications={vi.fn()}
        activeCardId={mockPlacesPlan.id}
        handleSnoozePlan={vi.fn()}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onSelectCard={vi.fn()}
      />
    );

    // Image URL preserved
    expect(html).toContain("action=photo");
    expect(html).toContain("photo_reference=Aa-ngMadpzDQ3");
    expect(html).toContain("Bengaluru Turf Inc.");

    // Bounded container with CSS cover crop
    expect(html).toContain("overflow-hidden pointer-events-none z-0");
    expect(html).toContain("object-fit:cover");

    // Floating capsule present and visible
    expect(html).toContain("z-20 relative select-none cursor-pointer overflow-hidden rounded-[24px]");
  });

  it("gracefully falls back to category default when coverImage is empty without breaking layout", () => {
    const html = renderToString(
      <PlanCard
        planId={mockDefaultPlan.id}
        userProfile={mockUserProfile}
        interestedPlanIds={[]}
        setSelectedPlan={vi.fn()}
        setPaymentConfirmationPlan={vi.fn()}
        walletBalance={0}
        handleToggleJoin={vi.fn()}
        setShowPaymentSuccess={vi.fn()}
        setNotifications={vi.fn()}
        activeCardId={mockDefaultPlan.id}
        handleSnoozePlan={vi.fn()}
        isExpanded={false}
        setIsExpanded={vi.fn()}
        onSelectCard={vi.fn()}
      />
    );

    // Title and metadata render intact
    expect(html).toContain("Casual Movie Night");
    expect(html).toContain("z-20 relative select-none cursor-pointer overflow-hidden rounded-[24px]");

    // Default asset loaded inside bounded container
    expect(html).toContain("overflow-hidden pointer-events-none z-0");
    expect(html).toContain("Movies.webp");
  });

  it("ensures HomeScreen feed wrapper provides strict overflow-hidden flex bounds", () => {
    const html = renderToString(
      <HomeScreen
        discoverablePlans={[mockCustomPlan, mockPlacesPlan]}
        userProfile={mockUserProfile}
        interestedPlanIds={[]}
        setSelectedPlan={vi.fn()}
        setPaymentConfirmationPlan={vi.fn()}
        walletBalance={0}
        handleToggleJoin={vi.fn()}
        setShowPaymentSuccess={vi.fn()}
        setNotifications={vi.fn()}
        activeCardId={mockCustomPlan.id}
        setActiveCardId={vi.fn()}
        handleSnoozePlan={vi.fn()}
        handleWaitlistPlan={vi.fn()}
        homeFeedRef={{ current: null }}
      />
    );

    // HomeScreen wrapper has flex-1 min-h-0 h-full w-full relative overflow-hidden
    expect(html).toContain("flex-1 min-h-0 h-full w-full relative overflow-hidden");

    // Both cards rendered
    expect(html).toContain("Turf Football Match");
    expect(html).toContain("Bengaluru Turf Inc.");
  });
});
