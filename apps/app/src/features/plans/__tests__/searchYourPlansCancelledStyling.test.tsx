import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import { SearchYourPlansScreen } from "../screens/PlansScreen/SearchYourPlansScreen";
import { Plan } from "../../../core/types";

// Mock child components and dependencies
vi.mock("../../../../IMGfromDB/PlanImages", () => ({
  DiscoveryImages: ({ src, className, alt }: any) => (
    <img src={src} className={className} alt={alt} data-testid="discovery-image" />
  ),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, onClick }: any) => (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    ),
  },
}));

const mockPlans: Plan[] = [
  {
    id: "plan-active-1",
    dbUuid: "plan-active-1",
    title: "Lunch with Friends",
    category: "DINING",
    date: "TODAY",
    time: "13:40",
    datetime: new Date().toISOString(),
    status: "LIVE",
    hostId: "user-123",
    creatorId: "user-123",
    members: [],
  } as any,
  {
    id: "plan-cancelled-1",
    dbUuid: "plan-cancelled-1",
    title: "Smash Guys",
    category: "SPORTS",
    date: "TOMORROW",
    time: "11:46",
    datetime: new Date(Date.now() + 86400000).toISOString(),
    status: "CANCELLED",
    hostId: "user-123",
    creatorId: "user-123",
    members: [],
  } as any,
];

vi.mock("../state/PlansContext", () => ({
  usePlansStore: () => ({
    plans: mockPlans,
    dbPlanParticipants: [
      {
        id: "p1",
        plan_id: "plan-active-1",
        user_id: "user-123",
        role: "HOST",
        rsvp_status: "JOINED",
      },
      {
        id: "p2",
        plan_id: "plan-cancelled-1",
        user_id: "user-123",
        role: "HOST",
        rsvp_status: "JOINED",
      },
    ],
  }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: () => ({
    userProfile: {
      id: "user-123",
      dbUuid: "user-123",
      user_id: "user-123",
      name: "Thilak",
    },
  }),
}));

describe("SearchYourPlansScreen Cancelled Plan Styling Removal", () => {
  it("renders both active and cancelled plans normally", () => {
    const html = renderToString(
      <SearchYourPlansScreen
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // Both plans appear in search results
    expect(html).toContain("Lunch with Friends");
    expect(html).toContain("Smash Guys");
  });

  it("does not apply strikethrough (line-through) to cancelled plan titles", () => {
    const html = renderToString(
      <SearchYourPlansScreen
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // Strikethrough class should not be present in the output
    expect(html).not.toContain("line-through");

    // The cancelled plan title uses standard white text
    expect(html).toContain("Smash Guys</h3>");
  });

  it("does not render the red Cancelled badge or X icon", () => {
    const html = renderToString(
      <SearchYourPlansScreen
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    // The text 'Cancelled' as a badge label should not be present in the row
    expect(html).not.toContain(">Cancelled<");
    expect(html).not.toContain("Cancelled</span>");
    expect(html).not.toContain("bg-[#DC2626]/10");
    expect(html).not.toContain("text-[#F87171]");
  });

  it("does not apply cancelled treatment (grayscale, dark overlay, red border) to thumbnails", () => {
    const html = renderToString(
      <SearchYourPlansScreen
        onBack={vi.fn()}
        setSelectedPlanId={vi.fn()}
      />
    );

    expect(html).not.toContain("grayscale");
    expect(html).not.toContain("border-[#DC2626]/30");
    expect(html).not.toContain("bg-black/40 z-10");
  });

  it("code structure verification: SearchYourPlansScreen has no conditional cancelled row branch", () => {
    const screenFilePath = path.resolve(
      __dirname,
      "../screens/PlansScreen/SearchYourPlansScreen.tsx"
    );
    const code = fs.readFileSync(screenFilePath, "utf-8");

    // Checks that the renderPlanRow function does not branch on relationship === "CANCELLED"
    expect(code).not.toContain('if (relationship === "CANCELLED")');
    expect(code).not.toContain("screen=\"Search Cancelled Plans\"");
  });
});
