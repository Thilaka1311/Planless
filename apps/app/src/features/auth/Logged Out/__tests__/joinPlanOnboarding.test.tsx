import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ProfileProvider } from "../../../profile/state/ProfileContext";
import { PlansProvider } from "../../../plans/state/PlansContext";
import { FriendshipProvider } from "../../../friendships/state/FriendshipContext";
import { ToastProvider } from "../../../../shared/contexts/ToastContext";
import { JoinPlanOnboarding } from "../screens/JoinPlanOnboarding";

// Mock supabase client to prevent network calls during tests
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

describe("JoinPlanOnboarding and JoinPlanAnimation", () => {
  it("renders JoinPlanOnboarding with production Plan Card components without throwing", () => {
    const renderTree = () =>
      renderToString(
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

    expect(renderTree).not.toThrow();
  });
});
