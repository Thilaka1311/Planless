import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { JoinPlanAnimation, resetJoinPlanAnimation, isJoinPlanAnimationCompleted } from "../components/JoinPlanAnimation";
import { JoinPlanOnboarding } from "../screens/JoinPlanOnboarding";
import { ProfileProvider } from "../../../profile/state/ProfileContext";
import { PlansProvider } from "../../../plans/state/PlansContext";
import { FriendshipProvider } from "../../../friendships/state/FriendshipContext";
import { ToastProvider } from "../../../../shared/contexts/ToastContext";

// Mock supabase client to avoid external calls
vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
        or: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => {},
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}));

function renderTree(ui: React.ReactElement): string {
  return renderToString(
    <ProfileProvider initialProfile={null}>
      <PlansProvider>
        <FriendshipProvider>
          <ToastProvider>{ui}</ToastProvider>
        </FriendshipProvider>
      </PlansProvider>
    </ProfileProvider>
  );
}

describe("Join Plan Onboarding Animation Lifecycle and Next Button Reveal", () => {
  beforeEach(() => {
    resetJoinPlanAnimation();
  });

  it("initially hides the Next button when JoinPlanOnboarding mounts", () => {
    const html = renderTree(<JoinPlanOnboarding onGetStarted={() => {}} />);

    // Initial render must NOT contain the Next button CTA container
    expect(html).not.toContain("btn_onboarding_cta_join_plan");
    expect(html).not.toContain("cta_container_join_plan");

    // But it must render the Join Plan animation viewport and heading
    expect(html).toContain("join_plan_animation_card");
    expect(html).toContain("Friends see the plan");
    expect(html).toContain("and join with one tap");
  });

  it("exports resetJoinPlanAnimation and isJoinPlanAnimationCompleted helpers correctly", () => {
    expect(isJoinPlanAnimationCompleted()).toBe(false);
    resetJoinPlanAnimation();
    expect(isJoinPlanAnimationCompleted()).toBe(false);
  });

  it("preserves canonical animation card dimensions and styling", () => {
    const html = renderTree(<JoinPlanAnimation />);

    expect(html).toContain("id=\"join_plan_animation_card\"");
    expect(html).toContain("max-w-[340px]");
    expect(html).toContain("max-h-[460px]");
    expect(html).toContain("rounded-[28px]");
  });
});
