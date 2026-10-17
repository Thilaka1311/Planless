import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import { HostedPlansScreen } from "../screens/PlansScreen/HostedPlansScreen";
import { PastPlans } from "../../profile/screens/PastPlans";
import { Plan } from "../../../core/types";

// Mock DiscoveryImages
vi.mock("../../../IMGfromDB/PlanImages", () => ({
  DiscoveryImages: ({ src, className, alt }: any) => (
    <img src={src} className={className} alt={alt} data-testid="discovery-image" />
  ),
}));

// Mock motion
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, onClick, ...rest }: any) => (
      <div className={className} onClick={onClick} {...rest}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Stores
let mockPlans: Plan[] = [];
let mockDbParticipants: any[] = [];
let mockUserProfile: any = { dbUuid: "user-me", id: "user-me" };
let mockActiveUserId = "user-me";

vi.mock("../state/PlansContext", () => ({
  usePlansStore: () => ({
    plans: mockPlans,
    dbPlanParticipants: mockDbParticipants,
    cancelPlan: vi.fn(),
    updatePlanDetails: vi.fn(),
    completePlan: vi.fn(),
  }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({
    userProfile: mockUserProfile,
    activeUserUuid: "user-me",
    activeUserId: mockActiveUserId,
  }),
}));

describe("Hosted Plans & Past Plans — Cancelled Plans Consolidation", () => {
  it("verifies 'View Cancelled Plans' row and bottom footer are completely removed from HostedPlansScreen", () => {
    const hostedPlansSource = fs.readFileSync(
      path.resolve(__dirname, "../screens/PlansScreen/HostedPlansScreen.tsx"),
      "utf-8"
    );

    // Verify 'View Cancelled Plans' text is absent from HostedPlansScreen
    expect(hostedPlansSource).not.toContain("View Cancelled Plans");

    // Verify subScreen 'cancelled-plans' navigation references are absent
    expect(hostedPlansSource).not.toContain("cancelled-plans");

    // Verify CancelledPlans component import is absent
    expect(hostedPlansSource).not.toContain("CancelledPlans");

    // Verify cancelledPlansCount is absent
    expect(hostedPlansSource).not.toContain("cancelledPlansCount");
  });

  it("renders HostedPlansScreen without any bottom footer or divider", () => {
    mockPlans = [
      {
        id: "plan-active-1",
        title: "Doomsday",
        date: "Tomorrow",
        time: "16:15",
        status: "ACTIVE",
        creatorId: "user-me",
        hostId: "user-me",
        coverImage: "https://example.com/cover1.jpg",
      } as unknown as Plan,
      {
        id: "plan-cancelled-1",
        title: "Smash Guys",
        date: "Tomorrow",
        time: "18:00",
        status: "CANCELLED",
        creatorId: "user-me",
        hostId: "user-me",
        coverImage: "https://example.com/cover2.jpg",
      } as unknown as Plan,
    ];

    mockDbParticipants = [
      {
        id: "p1",
        plan_id: "plan-active-1",
        user_id: "user-me",
        role: "HOST",
        rsvp_status: "JOINED",
      },
      {
        id: "p2",
        plan_id: "plan-cancelled-1",
        user_id: "user-me",
        role: "HOST",
        rsvp_status: "JOINED",
      },
    ];

    const html = renderToString(
      <HostedPlansScreen
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    expect(html).toContain("Doomsday");
    expect(html).not.toContain("View Cancelled Plans");
    expect(html).not.toContain("Smash Guys"); // Cancelled plan is excluded from active hosted plans
  });

  it("consolidates cancelled plans into PastPlans, including future-dated cancelled plans", () => {
    // Plan scheduled for next week that is CANCELLED
    const futureCancelledPlan: Plan = {
      id: "plan-future-cancelled",
      title: "Future Cancelled Event",
      datetime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "CANCELLED",
      creatorId: "user-me",
      hostId: "user-me",
      coverImage: "https://example.com/cover3.jpg",
      members: [
        {
          userId: "user-me",
          userUuid: "user-me",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
        } as any,
      ],
    } as unknown as Plan;

    // Completed past plan
    const completedPastPlan: Plan = {
      id: "plan-completed-1",
      title: "Yesterday Chill",
      datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: "COMPLETED",
      creatorId: "user-me",
      hostId: "user-me",
      coverImage: "https://example.com/cover4.jpg",
      members: [
        {
          userId: "user-me",
          userUuid: "user-me",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
        } as any,
      ],
    } as unknown as Plan;

    // Active upcoming plan (should NOT appear in Past Plans)
    const upcomingActivePlan: Plan = {
      id: "plan-upcoming-active",
      title: "Tomorrow Party",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
      creatorId: "user-me",
      hostId: "user-me",
      coverImage: "https://example.com/cover5.jpg",
      members: [
        {
          userId: "user-me",
          userUuid: "user-me",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
        } as any,
      ],
    } as unknown as Plan;

    mockPlans = [futureCancelledPlan, completedPastPlan, upcomingActivePlan];

    const html = renderToString(
      <PastPlans
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // Cancelled plan must appear in Past Plans even though its date is in the future
    expect(html).toContain("Future Cancelled Event");

    // Completed plan must appear in Past Plans
    expect(html).toContain("Yesterday Chill");

    // Non-cancelled upcoming plan must NOT appear in Past Plans
    expect(html).not.toContain("Tomorrow Party");
  });

  it("verifies cancelled plans in PastPlans use standard row styling with no strikethrough, badge, or X icon", () => {
    const futureCancelledPlan: Plan = {
      id: "plan-future-cancelled",
      title: "Smash Bros Tournament",
      datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: "CANCELLED",
      creatorId: "user-me",
      hostId: "user-me",
      coverImage: "https://example.com/cover-smash.jpg",
      members: [
        {
          userId: "user-me",
          userUuid: "user-me",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
        } as any,
      ],
    } as unknown as Plan;

    mockPlans = [futureCancelledPlan];

    const html = renderToString(
      <PastPlans
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // Title is rendered normally without strikethrough
    expect(html).toContain("Smash Bros Tournament");
    expect(html).not.toContain("line-through");

    // No X icon / svg for cancelled badge
    expect(html).not.toContain("lucide-x");

    // Thumbnail is rendered
    expect(html).toContain("data-testid=\"discovery-image\"");
  });

  it("prevents duplicate plan entries when combining completed and cancelled plans", () => {
    const dupPlan: Plan = {
      id: "plan-dup-1",
      dbUuid: "plan-dup-1",
      title: "Unique Plan Title",
      datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: "COMPLETED",
      creatorId: "user-me",
      hostId: "user-me",
      coverImage: "https://example.com/cover-dup.jpg",
      members: [
        {
          userId: "user-me",
          userUuid: "user-me",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
        } as any,
      ],
    } as unknown as Plan;

    // Simulate duplicate entries in the store
    mockPlans = [dupPlan, { ...dupPlan }];

    const html = renderToString(
      <PastPlans
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // Matches should only count 1 heading occurrence of the title in Past Plans
    const headingOccurrences = (html.match(/<h3[^>]*>Unique Plan Title<\/h3>/g) || []).length;
    expect(headingOccurrences).toBe(1);
  });
});
