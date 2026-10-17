import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroHeader, HostInfo } from "../components/HeroHeader";
import { PlansDetailsScreen } from "../screens/PlansScreen/PlansPreview/PlansPreviewScreen";
import { Plan, UserProfile } from "../../../core/types";

// Mock child components and dependencies of PlansPreviewScreen
vi.mock("../../../IMGfromDB/PlanImages", () => ({
  DiscoveryImages: ({ id, className, alt }: any) => (
    <img id={id} className={className} alt={alt} data-testid="discovery-image" />
  ),
}));

vi.mock("../../../IMGfromDB/UserAvatar", () => ({
  UserAvatar: ({ src, alt, className }: any) => (
    <img src={src} alt={alt} className={className} data-testid="user-avatar" />
  ),
}));

vi.mock("../../chats/hooks/useChatCache", () => ({
  preloadPlanChat: vi.fn(),
}));

vi.mock("../../friendships/state/FriendshipContext", () => ({
  useFriendshipStore: vi.fn().mockReturnValue({
    friends: [],
    removeFriend: vi.fn(),
    loading: false,
    incomingRequests: [],
  }),
}));

vi.mock("../../../../navigation/appRouter", () => ({
  navigateToRoute: vi.fn(),
  navigateBack: vi.fn(),
  parseCurrentRoute: vi.fn().mockReturnValue({}),
  listenToNavigation: vi.fn().mockReturnValue(() => {}),
}));

describe("HeroHeader Title Stability Regression Suite", () => {
  it("renders title within a reserved consistent 26px container matching view and edit modes", () => {
    const singleHost: HostInfo[] = [
      { id: "h1", name: "You", avatar: "https://example.com/you.jpg" },
    ];

    const html = renderToString(
      <HeroHeader
        title="Dinner at Indiranagar"
        hosts={singleHost}
        isHost={true}
        onEditTitle={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Reserved title area container with fixed height and safe padding
    expect(html).toContain("w-full max-w-full px-14 flex items-center justify-center min-w-0 h-[26px] flex-shrink-0");

    // Title heading fills the container without adding extra margins or padding
    expect(html).toContain("w-full h-full text-[17px] font-bold leading-tight select-text text-center max-w-full flex items-center justify-center gap-1.5 min-w-0 m-0 p-0");

    // Title text is truncated to keep on a single line
    expect(html).toContain("truncate max-w-full min-w-0");
    expect(html).toContain("Dinner at Indiranagar");

    // Close button and overflow menu remain centered at top-1/2
    expect(html).toContain("absolute left-4 top-1/2 -translate-y-1/2");

    // Host attribution remains consistently spaced directly below title
    expect(html).toContain("w-full flex flex-col items-center mt-1 select-none min-w-0");
    expect(html).toContain("Hosted by");
  });

  it("handles maximum length title (50 characters) on single line with truncation in view mode", () => {
    const longTitle = "A".repeat(50);
    const html = renderToString(
      <HeroHeader
        title={longTitle}
        isHost={true}
        onEditTitle={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain(longTitle);
    expect(html).toContain("truncate max-w-full min-w-0");
    expect(html).toContain("h-[26px]");
  });

  it("shows placeholder 'Set a title' and error indicator when title is empty and titleError is true", () => {
    const html = renderToString(
      <HeroHeader
        title=""
        isHost={true}
        onEditTitle={vi.fn()}
        onClose={vi.fn()}
        titleError={true}
        validationShakeKey={1}
      />
    );

    expect(html).toContain("Set a title");
    expect(html).toContain("text-white/60 font-semibold");
    // AlertCircle icon is present
    expect(html).toContain("text-[#FF6B2C]");
    expect(html).toContain("h-[26px]");
  });

  it("renders edit mode inside the identical reserved 26px container without expanding header height", () => {
    const singleHost: HostInfo[] = [
      { id: "h1", name: "You", avatar: "https://example.com/you.jpg" },
    ];

    const html = renderToString(
      <HeroHeader
        title="Dinner at Indiranagar"
        hosts={singleHost}
        isHost={true}
        onEditTitle={vi.fn()}
        onClose={vi.fn()}
        initialIsEditingTitle={true}
      />
    );

    // Reserved title area container has identical layout dimensions and padding in edit mode
    expect(html).toContain("w-full max-w-full px-14 flex items-center justify-center min-w-0 h-[26px] flex-shrink-0");

    // Title input occupies full container height without introducing vertical padding or margins
    expect(html).toContain("w-full h-full flex items-center justify-center min-w-0 pointer-events-auto");
    expect(html).toContain("w-full h-full bg-transparent border-none outline-none text-center text-[17px] font-bold text-white leading-tight placeholder:text-white/60 placeholder:font-semibold focus:outline-none focus:ring-0 p-0 m-0 shadow-none appearance-none min-w-0");

    // Handles overflow inside the input, constrained to max length 50
    expect(html).toContain("maxLength=\"50\"");
    expect(html).toContain("value=\"Dinner at Indiranagar\"");

    // Close button and overflow menu remain locked at top-1/2
    expect(html).toContain("absolute left-4 top-1/2 -translate-y-1/2");

    // Host attribution remains consistently spaced directly below title row
    expect(html).toContain("w-full flex flex-col items-center mt-1 select-none min-w-0");
    expect(html).toContain("Hosted by");
  });

  it("handles maximum length title (50 characters) in edit mode within reserved container", () => {
    const longTitle = "B".repeat(50);
    const html = renderToString(
      <HeroHeader
        title={longTitle}
        isHost={true}
        onEditTitle={vi.fn()}
        onClose={vi.fn()}
        initialIsEditingTitle={true}
      />
    );

    expect(html).toContain(`value=\"${longTitle}\"`);
    expect(html).toContain("h-[26px]");
    expect(html).toContain("min-w-0");
    expect(html).toContain("maxLength=\"50\"");
  });
});

describe("Plan Hero Image Interaction Removal Suite", () => {
  const dummyPlan: Plan = {
    id: "plan-review-test",
    title: "Weekend Ramen",
    category: "dining" as any,
    date: "Saturday, 18 October",
    time: "19:00",
    location: "Koramangala, Bengaluru",
    cost: 500,
    status: "LIVE",
    hostId: "host-1",
    creatorId: "host-1",
    creatorName: "You",
    creatorAvatar: "https://example.com/avatar.jpg",
    coverImage: "https://example.com/ramen.jpg",
    members: [],
    joinedUsers: [],
    confirmedCount: 1,
    timeline: "today",
    createdAt: new Date().toISOString(),
  } as any;

  const dummyUserProfile: UserProfile = {
    name: "You",
    phone: "1234567890",
    bio: "Test Bio",
    avatar: "https://example.com/avatar.jpg",
    joined: true,
    dbUuid: "host-1",
    user_id: "host-1",
  };

  it("renders hero cover image and gradient overlay with pointer-events-none and without cursor-pointer in createMode", () => {
    const html = renderToString(
      <PlansDetailsScreen
        createMode={true}
        plan={dummyPlan}
        userProfile={dummyUserProfile}
        activeUserId="host-1"
        onClose={vi.fn()}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );

    // Cover image container has pointer-events-none and no cursor-pointer
    expect(html).toContain("absolute inset-0 w-full h-full pointer-events-none");
    expect(html).not.toContain("absolute inset-0 w-full h-full cursor-pointer");

    // Immersive gradient overlay has pointer-events-none
    expect(html).toContain("absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none z-10");

    // Image itself still renders with expected classes
    expect(html).toContain("id=\"immersive-plan-hero-image\"");
    expect(html).toContain("brightness-[0.75]");
  });
});
