import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { CreatePlanAnimation, resetCreatePlanAnimation } from "../components/CreatePlanAnimation";
import { JoinPlanAnimation, resetJoinPlanAnimation } from "../components/JoinPlanAnimation";
import { ProfileProvider } from "../../../profile/state/ProfileContext";
import { PlansProvider } from "../../../plans/state/PlansContext";
import { FriendshipProvider } from "../../../friendships/state/FriendshipContext";
import { ToastProvider } from "../../../../shared/contexts/ToastContext";
import { beforeEach } from "vitest";

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

describe("Onboarding Animation 1:1 Screen Proportions and Content Scaling", () => {
  beforeEach(() => {
    resetCreatePlanAnimation();
    resetJoinPlanAnimation();
  });
  it("renders CreatePlanAnimation with scaled canvas container without New Activity screen", () => {
    const html = renderToString(
      <ProfileProvider initialProfile={null}>
        <PlansProvider>
          <FriendshipProvider>
            <ToastProvider>
              <CreatePlanAnimation />
            </ToastProvider>
          </FriendshipProvider>
        </PlansProvider>
      </ProfileProvider>
    );

    // Verify canonical animation card outer frame
    expect(html).toContain("create_plan_animation_card");
    // Verify scaled canvas container inside canonical frame
    expect(html).toContain("create_plan_content_scaled_canvas");
    expect(html).toContain("scale(0.70)");
    expect(html).toContain("142.86%");
    // Verify initial screen is select friends (search-people-input)
    expect(html).toContain("search-people-input");
    expect(html).toContain("Search friends…");
    // Verify New Activity step is NOT rendered
    expect(html).not.toContain("New Activity");
  });

  it("renders JoinPlanAnimation with canonical frame preserving interaction layout", () => {
    const html = renderToString(
      <ProfileProvider initialProfile={null}>
        <PlansProvider>
          <FriendshipProvider>
            <ToastProvider>
              <JoinPlanAnimation />
            </ToastProvider>
          </FriendshipProvider>
        </PlansProvider>
      </ProfileProvider>
    );

    // Verify canonical animation card outer frame
    expect(html).toContain("join_plan_animation_card");
    // Verify poster cover image
    expect(html).toContain("Friday Plans");
    // Verify bottom ParticipantToggleBar is rendered
    expect(html).toContain("Today • 19:00");
  });
});
