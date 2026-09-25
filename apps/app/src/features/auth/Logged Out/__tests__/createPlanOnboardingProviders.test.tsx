import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ProfileProvider } from "../../../profile/state/ProfileContext";
import { PlansProvider } from "../../../plans/state/PlansContext";
import { FriendshipProvider } from "../../../friendships/state/FriendshipContext";
import { ToastProvider } from "../../../../shared/contexts/ToastContext";
import { FriendProfileViewerBottomSheet } from "../../../friendships/components/FriendProfileViewerBottomSheet";
import { AutomaticParticipantScreen } from "../../../participants/automatic/AutomaticParticipantScreen";

// Mock supabase client to prevent real network calls during tests
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

describe("Create Plan Onboarding Provider Hierarchy", () => {
  it("renders FriendProfileViewerBottomSheet without throwing useFriendshipStore error inside the onboarding provider tree", () => {
    const renderTree = () =>
      renderToString(
        <ProfileProvider initialProfile={null}>
          <PlansProvider>
            <FriendshipProvider>
              <ToastProvider>
                <FriendProfileViewerBottomSheet
                  friendUserId={null}
                  onClose={() => {}}
                  source="plan"
                />
              </ToastProvider>
            </FriendshipProvider>
          </PlansProvider>
        </ProfileProvider>
      );

    expect(renderTree).not.toThrow();
  });

  it("renders AutomaticParticipantScreen (which embeds FriendProfileViewerBottomSheet) without crashing", () => {
    const renderTree = () =>
      renderToString(
        <ProfileProvider initialProfile={null}>
          <PlansProvider>
            <FriendshipProvider>
              <ToastProvider>
                <AutomaticParticipantScreen
                  mode="wizard"
                  isHostSelected={true}
                  capacity={4}
                  selectedFriends={[]}
                  onContinue={() => {}}
                  onBack={() => {}}
                />
              </ToastProvider>
            </FriendshipProvider>
          </PlansProvider>
        </ProfileProvider>
      );

    expect(renderTree).not.toThrow();
  });
});
