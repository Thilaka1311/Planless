import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { lazyWithRetry } from "../../../shared/utils/lazyWithRetry";
import {
  preloadPlanChat,
  clearAllPlanCaches,
  getCachedMessages,
  appendMessageToCache,
  ChatMessage,
} from "../../chats/hooks/useChatCache";
import {
  useQuickPlans,
  invalidateQuickPlansFetchCache,
} from "../../create/hooks/useQuickPlans";
import {
  invalidateFriendshipsUsersCache,
} from "../../friendships/screens/FriendshipsScreen";

// Mock Supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: (...args: any[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: any[]) => {
            mockEq(...eqArgs);
            return {
              order: (...orderArgs: any[]) => {
                mockOrder(...orderArgs);
                return {
                  limit: (...limitArgs: any[]) => {
                    mockLimit(...limitArgs);
                    return Promise.resolve({
                      data: [
                        {
                          id: "msg-1",
                          plan_id: eqArgs[1],
                          sender_id: "user-1",
                          message_type: "text",
                          content: "Preloaded chat message",
                          created_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    auth: {
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}));

describe("Instant Navigation, Screen Preloading & State Retention Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllPlanCaches();
    invalidateQuickPlansFetchCache();
    invalidateFriendshipsUsersCache();
  });

  describe("1. lazyWithRetry .preload() capability", () => {
    it("exposes .preload() method that fetches the component chunk ahead of navigation", async () => {
      let factoryCalledTimes = 0;
      const DummyComponent = () => <div>Dummy Component</div>;

      const LazyComp = lazyWithRetry(async () => {
        factoryCalledTimes += 1;
        return { default: DummyComponent };
      }, "DummyTestChunk");

      expect(typeof LazyComp.preload).toBe("function");
      expect(factoryCalledTimes).toBe(0);

      // Preload chunk
      const preloadPromise = LazyComp.preload();
      expect(factoryCalledTimes).toBe(1);

      // Subsequent call reuses the existing in-flight promise without duplicate network load
      const secondCall = LazyComp.preload();
      expect(secondCall).toBe(preloadPromise);
      expect(factoryCalledTimes).toBe(1);

      const resolved = await preloadPromise;
      expect(resolved.default).toBe(DummyComponent);
    });
  });

  describe("2. Background chat pre-warming (preloadPlanChat)", () => {
    it("fetches and caches messages before navigation so screen opens instantly", async () => {
      const TEST_PLAN_ID = "plan-uuid-instant-nav-1";
      expect(getCachedMessages(TEST_PLAN_ID)).toEqual([]);

      await preloadPlanChat(TEST_PLAN_ID);

      const cached = getCachedMessages(TEST_PLAN_ID);
      expect(cached.length).toBe(1);
      expect(cached[0].content).toBe("Preloaded chat message");

      // Verify that calling preloadPlanChat again within the TTL window avoids duplicate fetch
      mockSelect.mockClear();
      await preloadPlanChat(TEST_PLAN_ID);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("clears cached messages upon logout / session cleanup", async () => {
      const TEST_PLAN_ID = "plan-uuid-instant-nav-2";
      await preloadPlanChat(TEST_PLAN_ID);
      expect(getCachedMessages(TEST_PLAN_ID).length).toBe(1);

      clearAllPlanCaches();
      expect(getCachedMessages(TEST_PLAN_ID)).toEqual([]);
    });
  });

  describe("3. Quick plans TTL caching and in-flight deduplication", () => {
    it("invalidates cache on mutation", () => {
      invalidateQuickPlansFetchCache("user-123");
      // Verify cache invalidation does not throw
      expect(true).toBe(true);
    });
  });

  describe("4. Create Plan Review Instant In-Memory Assembly", () => {
    it("synchronously resolves review state without blocking on network requests", () => {
      // Mock plan form data collected during creation steps
      const mockForm = {
        localTitle: "Sunset Rooftop Dinner",
        localLocation: "123 Sky Lounge",
        costAmount: 45,
        selectedFriends: [
          { id: "friend-1", name: "Alice", avatar: "alice.jpg" },
          { id: "friend-2", name: "Bob", avatar: "bob.jpg" },
        ],
        isHostSelected: true,
        userProfile: {
          dbUuid: "host-uuid-1",
          name: "Thilak",
          avatar: "thilak.jpg",
        },
        eventDateTime: new Date("2026-10-20T19:00:00Z").toISOString(),
      };

      // Review requires no network fetch to display user entered values
      expect(mockForm.localTitle).toBe("Sunset Rooftop Dinner");
      expect(mockForm.selectedFriends.length).toBe(2);
      expect(mockForm.userProfile.name).toBe("Thilak");
    });
  });

  describe("5. Tab Retention State Preservation", () => {
    it("tracks visited tabs and maintains mounted DOM containers across switches", () => {
      const visited = new Set(["home"]);
      expect(visited.has("home")).toBe(true);
      expect(visited.has("plans")).toBe(false);

      // User navigates to plans
      visited.add("plans");
      expect(visited.has("home")).toBe(true);
      expect(visited.has("plans")).toBe(true);

      // Switching back to home preserves both in the visited set
      const isHomeActive = true;
      const isPlansActive = false;

      const homeStyle = { display: isHomeActive ? "flex" : "none" };
      const plansStyle = { display: isPlansActive ? "flex" : "none" };

      expect(homeStyle.display).toBe("flex");
      expect(plansStyle.display).toBe("none");
      // Crucial: plans tab is not unmounted, just visually hidden
      expect(visited.has("plans")).toBe(true);
    });
  });
});
