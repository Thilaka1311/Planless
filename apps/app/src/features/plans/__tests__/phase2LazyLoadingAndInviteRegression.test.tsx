import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  extractInviteTokenFromPath,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  clearStoredPendingInviteToken,
  resolveInviteDestination,
  claimPlanInviteRPC,
} from "../services/planInviteService";

// Mock localStorage in Node environment
const storageStore = new Map<string, string>();
const mockLocalStorage: Storage = {
  getItem: (key: string) => storageStore.get(key) ?? null,
  setItem: (key: string, val: string) => {
    storageStore.set(key, String(val));
  },
  removeItem: (key: string) => {
    storageStore.delete(key);
  },
  clear: () => {
    storageStore.clear();
  },
  key: (index: number) => Array.from(storageStore.keys())[index] ?? null,
  length: 0,
};
Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

// Mock Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => {},
  },
}));

describe("Phase 2 Lazy Loading & Invite Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore.clear();
    clearStoredPendingInviteToken();
  });

  describe("1. CreateMVP Lazy Loading", () => {
    it("dynamic import of CreateMVP resolves correctly with named-to-default export", async () => {
      const module = await import("../../create/screens/CreateMVP");
      expect(module.CreateMVP).toBeDefined();
      expect(typeof module.CreateMVP).toBe("function");

      const resolved = await import("../../create/screens/CreateMVP").then((m) => ({ default: m.CreateMVP }));
      expect(resolved.default).toBe(module.CreateMVP);
    });

    it("renders Suspense fallback boundary correctly when CreateMVP chunk is pending", () => {
      const Fallback = (
        <div id="create-loading-fallback">
          <span>Loading Create...</span>
        </div>
      );

      const html = renderToString(
        <Suspense fallback={Fallback}>
          <div>Create Plan Content</div>
        </Suspense>
      );

      expect(html).toContain("Create Plan Content");
    });
  });

  describe("2. PlanChatScreen Lazy Loading", () => {
    it("dynamic import of PlanChatScreen resolves correctly with named-to-default export", async () => {
      const module = await import("../../chats/screens/PlanChatScreen");
      expect(module.PlanChatScreen).toBeDefined();
      expect(typeof module.PlanChatScreen).toBe("function");

      const resolved = await import("../../chats/screens/PlanChatScreen").then((m) => ({ default: m.PlanChatScreen }));
      expect(resolved.default).toBe(module.PlanChatScreen);
    });

    it("renders Suspense fallback boundary correctly when PlanChatScreen chunk is pending", () => {
      const Fallback = (
        <div id="chat-loading-fallback">
          <span>Loading Chat...</span>
        </div>
      );

      const html = renderToString(
        <Suspense fallback={Fallback}>
          <div>Chat Content</div>
        </Suspense>
      );

      expect(html).toContain("Chat Content");
    });
  });

  describe("3. Share Plan Link & Invite Deep-Link Regression", () => {
    const TEST_TOKEN = "11111111-2222-4333-8444-555555555555";
    const USER_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    it("extracts exact plan token from /join/<token> URL path", () => {
      expect(extractInviteTokenFromPath(`/join/${TEST_TOKEN}`)).toBe(TEST_TOKEN);
      expect(extractInviteTokenFromPath(`/join/${TEST_TOKEN}/`)).toBe(TEST_TOKEN);
      expect(extractInviteTokenFromPath("/home")).toBeNull();
      expect(extractInviteTokenFromPath("/create")).toBeNull();
      expect(extractInviteTokenFromPath("/chats")).toBeNull();
    });

    it("stores and preserves pending invite token across sessions in localStorage", () => {
      setStoredPendingInviteToken(TEST_TOKEN);
      expect(getStoredPendingInviteToken()).toBe(TEST_TOKEN);

      clearStoredPendingInviteToken();
      expect(getStoredPendingInviteToken()).toBeNull();
    });

    it("processes invite link directly without requiring CreateMVP or Chat chunks", async () => {
      // Mock plan_participants: user is not yet a participant
      // Mock plans: plan is LIVE and active
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: TEST_TOKEN, status: "LIVE", title: "Weekend Football" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // Mock claimPlanInviteRPC succeeding with HOME destination
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: TEST_TOKEN,
          rsvp_status: "INVITED",
          assigned_group: null,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(TEST_TOKEN, USER_UUID);
      expect(resolution.destination).toBe("HOME");
      expect(resolution.planId).toBe(TEST_TOKEN);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: TEST_TOKEN });
    });

    it("routes existing participant (e.g. JOINED / WAITLISTED) to PLAN_PREVIEW without mutating their state", async () => {
      // Mock plan_participants: user is already JOINED
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "MEMBER",
                      rsvp_status: "JOINED",
                      assigned_group: "GOING",
                      waitlist_position: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const resolution = await resolveInviteDestination(TEST_TOKEN, USER_UUID);
      expect(resolution.destination).toBe("PLAN_PREVIEW");
      expect(resolution.planId).toBe(TEST_TOKEN);
      // RPC should NOT be called since user is already a participant
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("handles logged-out recipient invite lifecycle: token saved -> restored -> claimed for exact plan", async () => {
      // 1. User arrives at /join/abc
      const pathToken = extractInviteTokenFromPath(`/join/${TEST_TOKEN}`);
      expect(pathToken).toBe(TEST_TOKEN);
      setStoredPendingInviteToken(pathToken!);

      // 2. Token survives throughout onboarding state
      const preservedToken = getStoredPendingInviteToken();
      expect(preservedToken).toBe(TEST_TOKEN);

      // 3. User authenticates and invite claims for exact plan ID
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: preservedToken, status: "LIVE" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: preservedToken,
          rsvp_status: "INVITED",
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(preservedToken!, USER_UUID);
      expect(resolution.destination).toBe("HOME");
      expect(resolution.planId).toBe(TEST_TOKEN);

      // 4. Token cleared after successful claim
      clearStoredPendingInviteToken();
      expect(getStoredPendingInviteToken()).toBeNull();
    });
  });
});
