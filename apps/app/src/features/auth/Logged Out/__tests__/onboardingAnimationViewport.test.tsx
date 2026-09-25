import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { CreatePlanOnboarding } from "../screens/CreatePlanOnboarding";
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

describe("Onboarding Animation Viewport & Frame Sizing", () => {
  it("renders CreatePlanOnboarding inside canonical centered frame container", () => {
    const html = renderToString(
      <ProfileProvider initialProfile={null}>
        <PlansProvider>
          <FriendshipProvider>
            <ToastProvider>
              <CreatePlanOnboarding onGetStarted={() => {}} />
            </ToastProvider>
          </FriendshipProvider>
        </PlansProvider>
      </ProfileProvider>
    );

    // Verify outer centering container matches Problem / Solution screens
    expect(html).toContain("flex-1 w-full min-h-0 flex items-center justify-center px-4 py-2 sm:py-3 overflow-hidden");
    // Verify canonical animation card sizing
    expect(html).toContain("max-w-[340px]");
    expect(html).toContain("max-h-[460px]");
    expect(html).toContain("create_plan_animation_card");
  });

  it("renders JoinPlanOnboarding inside canonical centered frame container", () => {
    const html = renderToString(
      <ProfileProvider initialProfile={null}>
        <PlansProvider>
          <FriendshipProvider>
            <ToastProvider>
              <JoinPlanOnboarding onGetStarted={() => {}} />
            </ToastProvider>
          </FriendshipProvider>
        </PlansProvider>
      </ProfileProvider>
    );

    // Verify outer centering container matches Problem / Solution screens
    expect(html).toContain("flex-1 w-full min-h-0 flex items-center justify-center px-4 py-2 sm:py-3 overflow-hidden");
    // Verify canonical animation card sizing
    expect(html).toContain("max-w-[340px]");
    expect(html).toContain("max-h-[460px]");
    expect(html).toContain("join_plan_animation_card");
  });
});
