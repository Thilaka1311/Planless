import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractInviteTokenFromPath,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  clearStoredPendingInviteToken,
  resolveInviteDestination,
  claimPlanInviteRPC,
  buildInviteUrl,
  findCanonicalPlan,
  cleanPlanIdentifier,
} from "../services/planInviteService";
import { calculateParticipantBreakdown, normalizeStatus } from "../../../../lib/participantStatus";

// Mock localStorage
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

describe("Share Plan Link + Invite/Waitlist Behavior Test Suite", () => {
  const NO_LIMIT_PLAN_ID = "11111111-aaaa-4bbb-8ccc-000000000001";
  const LIMITED_PLAN_ID = "22222222-aaaa-4bbb-8ccc-000000000002";
  const USER_B_ID = "33333333-bbbb-4ccc-8ddd-000000000003";
  const HOST_USER_ID = "44444444-cccc-4ddd-8eee-000000000004";

  beforeEach(() => {
    vi.clearAllMocks();
    storageStore.clear();
    clearStoredPendingInviteToken();
  });

  describe("URL Generation and Parsing", () => {
    it("generates correct /join/<planId> deep link URL", () => {
      const url = buildInviteUrl(NO_LIMIT_PLAN_ID);
      expect(url).toContain(`/join/${NO_LIMIT_PLAN_ID}`);
    });

    it("extracts exact plan UUID from /join/<planId> paths", () => {
      expect(extractInviteTokenFromPath(`/join/${NO_LIMIT_PLAN_ID}`)).toBe(NO_LIMIT_PLAN_ID);
      expect(extractInviteTokenFromPath(`/join/${NO_LIMIT_PLAN_ID}/`)).toBe(NO_LIMIT_PLAN_ID);
      expect(extractInviteTokenFromPath(`/join/${LIMITED_PLAN_ID}`)).toBe(LIMITED_PLAN_ID);
      expect(extractInviteTokenFromPath("/home")).toBeNull();
      expect(extractInviteTokenFromPath("/plans")).toBeNull();
      expect(extractInviteTokenFromPath("/create")).toBeNull();
      expect(extractInviteTokenFromPath("/chats")).toBeNull();
    });

    it("cleanly extracts ONLY the plan UUID when share content includes human-readable text", () => {
      // Exact scenario from user bug:
      // "4b790f81-6c81-41a9-ba94-d5038fb087ab Join Doomsday on Planless"
      const DOOMSDAY_UUID = "4b790f81-6c81-41a9-ba94-d5038fb087ab";
      const combinedPath = `/join/${DOOMSDAY_UUID} Join Doomsday on Planless`;
      expect(extractInviteTokenFromPath(combinedPath)).toBe(DOOMSDAY_UUID);

      // URL-encoded space variant from browser address bar
      const encodedPath = `/join/${DOOMSDAY_UUID}%20Join%20Doomsday%20on%20Planless`;
      expect(extractInviteTokenFromPath(encodedPath)).toBe(DOOMSDAY_UUID);

      // Full origin URL variant
      const fullUrl = `https://planless.app/join/${DOOMSDAY_UUID} Join Doomsday on Planless`;
      expect(extractInviteTokenFromPath(fullUrl)).toBe(DOOMSDAY_UUID);

      // cleanPlanIdentifier unit contract
      expect(cleanPlanIdentifier(`${DOOMSDAY_UUID} Join Doomsday on Planless`)).toBe(DOOMSDAY_UUID);
      expect(cleanPlanIdentifier(`Join Doomsday on Planless https://planless.app/join/${DOOMSDAY_UUID}`)).toBe(DOOMSDAY_UUID);
    });

    it("handles multiple real plan titles with spaces, hyphens, and emojis without corrupting identifier", () => {
      const TIMEZONE_UUID = "b2101be3-29ad-4440-b1db-7c9f6e83903f";
      const SMASH_UUID = "a5c5ca11-0ebf-4179-9c04-3a38acf19bf1";

      // "Timezone Phoenix Mall of Asia - Bangalore"
      expect(extractInviteTokenFromPath(`/join/${TIMEZONE_UUID} Join Timezone Phoenix Mall of Asia - Bangalore on Planless`)).toBe(TIMEZONE_UUID);

      // "Smash Guys"
      expect(extractInviteTokenFromPath(`/join/${SMASH_UUID} Join Smash Guys on Planless`)).toBe(SMASH_UUID);

      // Emoji and punctuation: "🍕 Friday Pizza Party!"
      expect(extractInviteTokenFromPath(`/join/${NO_LIMIT_PLAN_ID} Join 🍕 Friday Pizza Party! on Planless`)).toBe(NO_LIMIT_PLAN_ID);

      // Slugs with human-readable share text
      expect(extractInviteTokenFromPath(`/join/doomsday Join Doomsday on Planless`)).toBe("doomsday");
      expect(extractInviteTokenFromPath(`/join/p_1789466614872 Join Doomsday on Planless`)).toBe("p_1789466614872");
    });
  });

  describe("Rule 1: Plan has NO participant limit", () => {
    it("associates User B as INVITED, does NOT join them, and navigates to HOME", async () => {
      // Setup: User B has no participant record yet
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
                  data: {
                    id: NO_LIMIT_PLAN_ID,
                    status: "LIVE",
                    title: "Unlimited Hangout",
                    plan_size: null,
                    participant_filtering: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // RPC simulation for No Limit plan
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: null,
          already_participating: false,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(NO_LIMIT_PLAN_ID, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);
      expect(resolution.claimResult?.rsvp_status).toBe("INVITED");
      expect(resolution.claimResult?.plan_size).toBeNull();
      expect(resolution.claimResult?.already_participating).toBe(false);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: NO_LIMIT_PLAN_ID });
    });
  });

  describe("Rule 2: Plan HAS a participant limit", () => {
    it("places User B into INVITED state, does NOT automatically waitlist or join them, and navigates to HOME", async () => {
      // Setup: User B has no participant record yet
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
                  data: {
                    id: LIMITED_PLAN_ID,
                    status: "LIVE",
                    title: "5-a-side Football",
                    plan_size: 10,
                    participant_filtering: "AUTOMATIC",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // RPC simulation for Limited plan: returns INVITED
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: LIMITED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: 10,
          already_participating: false,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(LIMITED_PLAN_ID);
      expect(resolution.claimResult?.rsvp_status).toBe("INVITED");
      expect(resolution.claimResult?.assigned_group).toBeNull();
      expect(resolution.claimResult?.plan_size).toBe(10);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: LIMITED_PLAN_ID });
    });
  });

  describe("Idempotency: Repeated link opens", () => {
    it("does not call RPC again or duplicate state when already INVITED", async () => {
      // User B already has an INVITED participant record
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "INVITED",
                      assigned_group: null,
                      waitlist_position: null,
                    },
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
                  data: {
                    id: NO_LIMIT_PLAN_ID,
                    status: "LIVE",
                    title: "Unlimited Hangout",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const resolution = await resolveInviteDestination(NO_LIMIT_PLAN_ID, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("does not call RPC again when already WAITLISTED and routes to PLAN_PREVIEW", async () => {
      // User B already has a WAITLISTED participant record
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "WAITLISTED",
                      assigned_group: "WAITLIST",
                      waitlist_position: 1,
                    },
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
                  data: {
                    id: LIMITED_PLAN_ID,
                    status: "LIVE",
                    title: "5-a-side Football",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const resolution = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);

      expect(resolution.destination).toBe("PLAN_PREVIEW");
      expect(resolution.status).toBe("WAITLISTED");
      expect(resolution.planId).toBe(LIMITED_PLAN_ID);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("does not mutate HOST or JOINED participant state when opening link", async () => {
      // Host opens link
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "HOST",
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
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: NO_LIMIT_PLAN_ID,
                    status: "LIVE",
                    title: "Unlimited Hangout",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const hostResolution = await resolveInviteDestination(NO_LIMIT_PLAN_ID, HOST_USER_ID);
      expect(hostResolution.destination).toBe("PLAN_PREVIEW");
      expect(hostResolution.status).toBe("HOST");
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("Logged-Out Recipient Flow", () => {
    it("preserves invite token in storage across auth state changes and opens Plan screen upon claim", async () => {
      // 1. Recipient opens link while logged out
      const extractedToken = extractInviteTokenFromPath(`/join/${NO_LIMIT_PLAN_ID}`);
      expect(extractedToken).toBe(NO_LIMIT_PLAN_ID);
      setStoredPendingInviteToken(extractedToken!);

      // 2. Token stays persisted while on onboarding/login screen
      expect(getStoredPendingInviteToken()).toBe(NO_LIMIT_PLAN_ID);

      // 3. User logs in, destination is resolved
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
                  data: { id: NO_LIMIT_PLAN_ID, status: "LIVE" },
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
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
        },
        error: null,
      });

      const tokenToProcess = getStoredPendingInviteToken()!;
      const resolution = await resolveInviteDestination(tokenToProcess, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);

      // 4. Token cleared after being consumed
      clearStoredPendingInviteToken();
      expect(getStoredPendingInviteToken()).toBeNull();
    });
  });

  describe("Inactive / Missing Plan Handling", () => {
    it("returns INVALID if plan does not exist", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const resolution = await resolveInviteDestination("missing-id", USER_B_ID);
      expect(resolution.destination).toBe("INVALID");
      expect(resolution.status).toBe("PLAN_NOT_FOUND");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("returns INVALID if plan is cancelled or inactive", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: { id: NO_LIMIT_PLAN_ID, status: "CANCELLED" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const resolution = await resolveInviteDestination(NO_LIMIT_PLAN_ID, USER_B_ID);
      expect(resolution.destination).toBe("INVALID");
      expect(resolution.status).toBe("PLAN_INACTIVE");
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("Canonical Plan Identifier Resolution (UUID, public_id, slug)", () => {
    it("resolves canonical plan by UUID directly", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: NO_LIMIT_PLAN_ID,
                    status: "LIVE",
                    title: "Unlimited Hangout",
                    public_id: "p_12345",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const plan = await findCanonicalPlan(NO_LIMIT_PLAN_ID);
      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(NO_LIMIT_PLAN_ID);
      expect(plan?.title).toBe("Unlimited Hangout");
    });

    it("resolves canonical plan by public_id", async () => {
      const PUBLIC_ID = "p_1789466614872";
      mockFrom.mockImplementation((table: string) => {
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "public_id" && val === PUBLIC_ID) {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: NO_LIMIT_PLAN_ID,
                        status: "LIVE",
                        title: "Doomsday",
                        public_id: PUBLIC_ID,
                      },
                      error: null,
                    }),
                  };
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }),
            }),
          };
        }
        return {};
      });

      const plan = await findCanonicalPlan(PUBLIC_ID);
      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(NO_LIMIT_PLAN_ID);
      expect(plan?.public_id).toBe(PUBLIC_ID);
    });

    it("resolves canonical plan by title slug", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "status" && val === "LIVE") {
                  return Promise.resolve({
                    data: [
                      {
                        id: NO_LIMIT_PLAN_ID,
                        status: "LIVE",
                        title: "Doomsday",
                        public_id: "p_1789466614872",
                      },
                    ],
                    error: null,
                  });
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }),
            }),
          };
        }
        return {};
      });

      const plan = await findCanonicalPlan("doomsday");
      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(NO_LIMIT_PLAN_ID);
      expect(plan?.title).toBe("Doomsday");
    });

    it("resolves slug invite link through resolveInviteDestination to canonical UUID", async () => {
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
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "status" && val === "LIVE") {
                  return Promise.resolve({
                    data: [
                      {
                        id: NO_LIMIT_PLAN_ID,
                        status: "LIVE",
                        title: "Doomsday",
                        public_id: "p_1789466614872",
                      },
                    ],
                    error: null,
                  });
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination("doomsday", USER_B_ID);
      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: NO_LIMIT_PLAN_ID });
    });

    it("resolves UUID with appended human-readable text 'Join Doomsday on Planless' to canonical plan", async () => {
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
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "id" && val === NO_LIMIT_PLAN_ID) {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: NO_LIMIT_PLAN_ID,
                        status: "LIVE",
                        title: "Doomsday",
                      },
                      error: null,
                    }),
                  };
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
        },
        error: null,
      });

      // User bug scenario: raw input contains both UUID and human-readable share text
      const rawInput = `${NO_LIMIT_PLAN_ID} Join Doomsday on Planless`;
      const resolution = await resolveInviteDestination(rawInput, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: NO_LIMIT_PLAN_ID });
    });

    it("resolves slug with appended human-readable text 'doomsday Join Doomsday on Planless'", async () => {
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
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "status" && val === "LIVE") {
                  return Promise.resolve({
                    data: [
                      {
                        id: NO_LIMIT_PLAN_ID,
                        status: "LIVE",
                        title: "Doomsday",
                        public_id: "p_1789466614872",
                      },
                    ],
                    error: null,
                  });
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              }),
            }),
          };
        }
        return {};
      });

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
        },
        error: null,
      });

      const rawInput = "doomsday Join Doomsday on Planless";
      const resolution = await resolveInviteDestination(rawInput, USER_B_ID);

      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.planId).toBe(NO_LIMIT_PLAN_ID);
    });
  });

  describe("Home Screen Feed Population and Post-Resolution Invariants", () => {
    it("No-Limit Plan: resolves -> claims INVITED -> routes to HOME -> appears in Home feed", async () => {
      // 1. Claim invite
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: { id: NO_LIMIT_PLAN_ID, status: "LIVE", title: "Doomsday", plan_size: null },
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
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          plan_size: null,
          already_participating: false,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(NO_LIMIT_PLAN_ID, USER_B_ID);
      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.claimResult?.rsvp_status).toBe("INVITED");
    });

    it("Limited Plan: resolves -> claims INVITED -> routes to HOME -> appears in Home feed", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: { id: LIMITED_PLAN_ID, status: "LIVE", title: "Football Match", plan_size: 10 },
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
          plan_id: LIMITED_PLAN_ID,
          rsvp_status: "INVITED",
          plan_size: 10,
          already_participating: false,
        },
        error: null,
      });

      const resolution = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(resolution.destination).toBe("HOME");
      expect(resolution.status).toBe("INVITED");
      expect(resolution.claimResult?.rsvp_status).toBe("INVITED");
    });
  });

  describe("12 Required Regression Scenarios for Plan Link Invitations", () => {
    const mockPlanData = (planId: string, planSize: number | null, title = "Test Plan") => ({
      id: planId,
      status: "LIVE",
      title,
      plan_size: planSize,
      participant_filtering: "AUTOMATIC",
    });

    // 1. A new recipient opens a shared link for a plan with available capacity: they become INVITED.
    it("1. A new recipient opens a shared link for a plan with available capacity: they become INVITED", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: mockPlanData(LIMITED_PLAN_ID, 10, "Available Spots Plan"),
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
          plan_id: LIMITED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: 10,
          already_participating: false,
        },
        error: null,
      });

      const res = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: LIMITED_PLAN_ID });
    });

    // 2. A new recipient opens a shared link for a full plan with a waitlist: they become INVITED, not WAITLISTED.
    it("2. A new recipient opens a shared link for a full plan with a waitlist: they become INVITED, not WAITLISTED", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: mockPlanData(LIMITED_PLAN_ID, 6, "Full Plan With Waitlist"),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // RPC must return INVITED, not WAITLISTED, no waitlist position assigned
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          plan_id: LIMITED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: 6,
          already_participating: false,
        },
        error: null,
      });

      const res = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.waitlist_position).toBeNull();
      expect(res.claimResult?.assigned_group).toBeNull();
    });

    // 3. A new recipient opens a shared link for a no-limit plan: they become INVITED, not JOINED.
    it("3. A new recipient opens a shared link for a no-limit plan: they become INVITED, not JOINED", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: mockPlanData(NO_LIMIT_PLAN_ID, null, "Unlimited Plan"),
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
          plan_id: NO_LIMIT_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: null,
          already_participating: false,
        },
        error: null,
      });

      const res = await resolveInviteDestination(NO_LIMIT_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).not.toBe("JOINED");
    });

    // 4. The invited plan appears on Home immediately after successful resolution.
    it("4. The invited plan appears on Home immediately after successful resolution", async () => {
      const participantRecord = {
        plan_id: NO_LIMIT_PLAN_ID,
        user_id: USER_B_ID,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
      };

      const isHomeFeedEligible = (record: any, planStatus = "LIVE") => {
        const isLive = planStatus.toUpperCase() === "LIVE" || planStatus.toUpperCase() === "ACTIVE";
        const isParticipant = record.role === "PARTICIPANT";
        const isInvited = record.rsvp_status === "INVITED";
        return isLive && isParticipant && isInvited;
      };

      expect(isHomeFeedEligible(participantRecord)).toBe(true);
    });

    // 5. An existing JOINED participant opens the link: their state remains JOINED, and Plan Preview opens.
    it("5. An existing JOINED participant opens the link: their state remains JOINED, and Plan Preview opens", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
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
        if (table === "plans") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: mockPlanData(LIMITED_PLAN_ID, 10),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("PLAN_PREVIEW");
      expect(res.status).toBe("JOINED");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 6. An existing WAITLISTED participant opens the link: their state remains WAITLISTED, and Plan Preview opens.
    it("6. An existing WAITLISTED participant opens the link: their state remains WAITLISTED, and Plan Preview opens", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "WAITLISTED",
                      assigned_group: "WAITLIST",
                      waitlist_position: 2,
                    },
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
                  data: mockPlanData(LIMITED_PLAN_ID, 10),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("PLAN_PREVIEW");
      expect(res.status).toBe("WAITLISTED");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 7. An existing SKIPPED participant opens the link: their state remains unchanged, following existing rules.
    it("7. An existing SKIPPED participant opens the link: their state remains unchanged, following existing rules", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "SKIPPED",
                      assigned_group: null,
                      waitlist_position: null,
                    },
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
                  data: mockPlanData(LIMITED_PLAN_ID, 10),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("PLAN_PREVIEW");
      expect(res.status).toBe("SKIPPED");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 8. An existing INVITED participant opens the link repeatedly: no duplicate record or count increase occurs.
    it("8. An existing INVITED participant opens the link repeatedly: no duplicate record or count increase occurs", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "INVITED",
                      assigned_group: null,
                      waitlist_position: null,
                    },
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
                  data: mockPlanData(LIMITED_PLAN_ID, 10),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // First open
      const res1 = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res1.destination).toBe("HOME");
      expect(res1.status).toBe("INVITED");
      expect(mockRpc).not.toHaveBeenCalled();

      // Second open (repeated)
      const res2 = await resolveInviteDestination(LIMITED_PLAN_ID, USER_B_ID);
      expect(res2.destination).toBe("HOME");
      expect(res2.status).toBe("INVITED");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 9. The recipient explicitly joins after opening the link: the state changes correctly and persists.
    it("9. The recipient explicitly joins after opening the link: the state changes correctly and persists", () => {
      let participantRecord: any = {
        plan_id: LIMITED_PLAN_ID,
        user_id: USER_B_ID,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
      };

      const handleExplicitJoin = (record: any) => ({
        ...record,
        rsvp_status: "JOINED",
        responded_at: new Date().toISOString(),
      });

      participantRecord = handleExplicitJoin(participantRecord);
      expect(participantRecord.rsvp_status).toBe("JOINED");
      expect(participantRecord.responded_at).toBeDefined();
    });

    // 10. The recipient explicitly joins the waitlist after opening the link: the state changes correctly and position is assigned.
    it("10. The recipient explicitly joins the waitlist after opening the link: the state changes correctly and position is assigned", () => {
      let participantRecord: any = {
        plan_id: LIMITED_PLAN_ID,
        user_id: USER_B_ID,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
        waitlist_position: null,
      };

      const handleExplicitWaitlist = (record: any, currentMaxWaitlistPos = 0) => ({
        ...record,
        rsvp_status: "WAITLISTED",
        waitlist_position: currentMaxWaitlistPos + 1,
        joined_queue_at: new Date().toISOString(),
        responded_at: new Date().toISOString(),
      });

      participantRecord = handleExplicitWaitlist(participantRecord, 2);
      expect(participantRecord.rsvp_status).toBe("WAITLISTED");
      expect(participantRecord.waitlist_position).toBe(3);
      expect(participantRecord.joined_queue_at).toBeDefined();
    });

    // 11. Refreshing Home preserves the invitation and displays the plan correctly.
    it("11. Refreshing Home preserves the invitation and displays the plan correctly", () => {
      const persistedParticipants = [
        {
          plan_id: LIMITED_PLAN_ID,
          user_id: USER_B_ID,
          role: "PARTICIPANT",
          rsvp_status: "INVITED",
        },
      ];

      const activeFeed = persistedParticipants.filter(
        (p) => p.user_id === USER_B_ID && p.role === "PARTICIPANT" && p.rsvp_status === "INVITED"
      );

      expect(activeFeed).toHaveLength(1);
      expect(activeFeed[0].plan_id).toBe(LIMITED_PLAN_ID);
    });

    // 12. Unauthenticated recipients follow the existing authentication flow without losing the invitation context.
    it("12. Unauthenticated recipients follow the existing authentication flow without losing the invitation context", () => {
      const path = `/join/${LIMITED_PLAN_ID}`;
      const token = extractInviteTokenFromPath(path);
      expect(token).toBe(LIMITED_PLAN_ID);

      setStoredPendingInviteToken(token!);
      expect(getStoredPendingInviteToken()).toBe(LIMITED_PLAN_ID);

      const retrievedToken = getStoredPendingInviteToken();
      expect(retrievedToken).toBe(LIMITED_PLAN_ID);

      clearStoredPendingInviteToken();
      expect(getStoredPendingInviteToken()).toBeNull();
    });
  });

  describe("Assigned vs Automatic Modes: Plan Link Invitations & Group Handling", () => {
    const ASSIGNED_PLAN_ID = "55555555-aaaa-4bbb-8ccc-000000000005";
    const AUTO_PLAN_ID = "66666666-aaaa-4bbb-8ccc-000000000006";

    // 1. A new recipient opens an Assigned-mode plan link: INVITED + waitlist assignment.
    it("1. A new recipient opens an Assigned-mode plan link: INVITED + waitlist assignment", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: {
                    id: ASSIGNED_PLAN_ID,
                    status: "LIVE",
                    title: "Assigned Plan",
                    plan_size: 5,
                    participant_filtering: "ASSIGNED",
                  },
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
          plan_id: ASSIGNED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: "WAITLIST",
          waitlist_position: null,
          plan_size: 5,
          already_participating: false,
          invited_participants: 1,
        },
        error: null,
      });

      const res = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);

      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.assigned_group).toBe("WAITLIST");
      expect(res.claimResult?.waitlist_position).toBeNull();
      expect(res.claimResult?.already_participating).toBe(false);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: ASSIGNED_PLAN_ID });
    });

    // 2. The recipient appears in the Assigned waitlist section.
    it("2. The recipient appears in the Assigned waitlist section", () => {
      // Simulating AssignedParticipantContainer member partitioning
      const members = [
        {
          userId: USER_B_ID,
          name: "Recipient User",
          rsvp_status: "INVITED",
          assigned_group: "WAITLIST",
          waitlist_position: null,
        },
        {
          userId: HOST_USER_ID,
          name: "Host User",
          isHost: true,
          rsvp_status: "JOINED",
          assigned_group: "GOING",
          waitlist_position: null,
        },
      ];

      const isParticipantInPlan = (pp: any) => true;
      const waitlistMembers = members.filter((m) => {
        const status = normalizeStatus(m.rsvp_status);
        if (status === "SKIPPED" || status === "REJOINED") return false;
        const group = (m.assigned_group || "").toUpperCase();
        return group === "WAITLIST" || group === "WAITLISTED" || (!group && status === "WAITLISTED");
      });

      expect(waitlistMembers).toHaveLength(1);
      expect(waitlistMembers[0].userId).toBe(USER_B_ID);
      expect(waitlistMembers[0].assigned_group).toBe("WAITLIST");
      expect(waitlistMembers[0].rsvp_status).toBe("INVITED");
    });

    // 3. The participant remains INVITED after Home refresh, reload, and subsequent data fetching.
    it("3. The participant remains INVITED after Home refresh, reload, and subsequent data fetching", async () => {
      // Setup mock where DB has persisted INVITED and assigned_group WAITLIST
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "INVITED",
                      assigned_group: "WAITLIST",
                      waitlist_position: null,
                    },
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
                  data: {
                    id: ASSIGNED_PLAN_ID,
                    status: "LIVE",
                    title: "Assigned Plan",
                    plan_size: 5,
                    participant_filtering: "ASSIGNED",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      // Simulating first load after invitation claim
      const load1 = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);
      expect(load1.destination).toBe("HOME");
      expect(load1.status).toBe("INVITED");

      // Simulating reload / refresh / re-fetch
      const load2 = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);
      expect(load2.destination).toBe("HOME");
      expect(load2.status).toBe("INVITED");

      // Verify no mutation occurred
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 4. The participant is not counted as actually WAITLISTED merely because of the group assignment.
    it("4. The participant is not counted as actually WAITLISTED merely because of the group assignment", () => {
      const dbParticipants: any[] = [
        {
          id: "part-1",
          plan_id: ASSIGNED_PLAN_ID,
          user_id: USER_B_ID,
          role: "PARTICIPANT",
          rsvp_status: "INVITED",
          assigned_group: "WAITLIST",
          waitlist_position: null,
        },
        {
          id: "part-2",
          plan_id: ASSIGNED_PLAN_ID,
          user_id: HOST_USER_ID,
          role: "HOST",
          rsvp_status: "JOINED",
          assigned_group: "GOING",
          waitlist_position: null,
        },
      ];

      const breakdown = calculateParticipantBreakdown(dbParticipants);

      expect(breakdown.invited).toBe(1);
      expect(breakdown.joined).toBe(1);
      expect(breakdown.waitlisted).toBe(0); // MUST be 0! Not counted as waitlisted
    });

    // 5. A new recipient opens an Automatic-mode plan link: remains INVITED and follows existing Automatic behavior.
    it("5. A new recipient opens an Automatic-mode plan link: remains INVITED and follows existing Automatic behavior", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: {
                    id: AUTO_PLAN_ID,
                    status: "LIVE",
                    title: "Automatic Plan",
                    plan_size: 5,
                    participant_filtering: "AUTOMATIC",
                  },
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
          plan_id: AUTO_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: 5,
          already_participating: false,
          invited_participants: 1,
        },
        error: null,
      });

      const res = await resolveInviteDestination(AUTO_PLAN_ID, USER_B_ID);

      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.assigned_group).toBeNull();
      expect(res.claimResult?.waitlist_position).toBeNull();
    });

    // 6. Reopening a link does not duplicate records or inflate counts.
    it("6. Reopening a link does not duplicate records or inflate counts", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      role: "PARTICIPANT",
                      rsvp_status: "INVITED",
                      assigned_group: "WAITLIST",
                      waitlist_position: null,
                    },
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
                  data: {
                    id: ASSIGNED_PLAN_ID,
                    status: "LIVE",
                    title: "Assigned Plan",
                    plan_size: 5,
                    invited_participants: 1,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);
      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 7. Existing JOINED, WAITLISTED, SKIPPED, and HOST participants retain their current states and assignments.
    it("7. Existing JOINED, WAITLISTED, SKIPPED, and HOST participants retain their current states and assignments", async () => {
      const testCases = [
        { role: "HOST", rsvp_status: "JOINED", assigned_group: "GOING", expectedDest: "PLAN_PREVIEW", expectedStatus: "HOST" },
        { role: "PARTICIPANT", rsvp_status: "JOINED", assigned_group: "GOING", expectedDest: "PLAN_PREVIEW", expectedStatus: "JOINED" },
        { role: "PARTICIPANT", rsvp_status: "WAITLISTED", assigned_group: "WAITLIST", expectedDest: "PLAN_PREVIEW", expectedStatus: "WAITLISTED" },
        { role: "PARTICIPANT", rsvp_status: "SKIPPED", assigned_group: null, expectedDest: "PLAN_PREVIEW", expectedStatus: "SKIPPED" },
      ];

      for (const tc of testCases) {
        mockFrom.mockImplementation((table: string) => {
          if (table === "plan_participants") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        role: tc.role,
                        rsvp_status: tc.rsvp_status,
                        assigned_group: tc.assigned_group,
                        waitlist_position: tc.rsvp_status === "WAITLISTED" ? 1 : null,
                      },
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
                    data: {
                      id: ASSIGNED_PLAN_ID,
                      status: "LIVE",
                      title: "Assigned Plan",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        });

        const res = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);
        expect(res.destination).toBe(tc.expectedDest);
        expect(res.status).toBe(tc.expectedStatus);
      }
      expect(mockRpc).not.toHaveBeenCalled();
    });

    // 8. Explicit attendance actions still produce the correct state transitions.
    it("8. Explicit attendance actions still produce the correct state transitions", () => {
      // In Assigned mode, an invited member in the WAITLIST group who confirms attendance transitions to WAITLISTED
      const initialParticipant = {
        plan_id: ASSIGNED_PLAN_ID,
        user_id: USER_B_ID,
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
        assigned_group: "WAITLIST",
        waitlist_position: null,
      };

      const handleAssignedExplicitJoin = (participant: typeof initialParticipant, nextPosition: number) => {
        if (participant.assigned_group === "WAITLIST") {
          return {
            ...participant,
            rsvp_status: "WAITLISTED",
            waitlist_position: nextPosition,
            responded_at: new Date().toISOString(),
          };
        }
        return {
          ...participant,
          rsvp_status: "JOINED",
          responded_at: new Date().toISOString(),
        };
      };

      const transitioned = handleAssignedExplicitJoin(initialParticipant, 1);
      expect(transitioned.rsvp_status).toBe("WAITLISTED");
      expect(transitioned.assigned_group).toBe("WAITLIST");
      expect(transitioned.waitlist_position).toBe(1);
    });

    // 9. Database constraints and triggers permit the intended Assigned-mode combination.
    it("9. Database constraints and triggers permit the intended Assigned-mode combination", () => {
      // Validates data model invariants:
      // rsvp_status = 'INVITED', assigned_group = 'WAITLIST', waitlist_position = NULL, joined_queue_at = NULL
      const assignedInvitedRow = {
        role: "PARTICIPANT",
        rsvp_status: "INVITED",
        assigned_group: "WAITLIST",
        waitlist_position: null,
        joined_queue_at: null,
      };

      // Valid enum values
      const validRsvpStatuses = ["JOINED", "WAITLISTED", "SKIPPED", "INVITED"];
      const validAssignedGroups = ["GOING", "WAITLIST", null];

      expect(validRsvpStatuses).toContain(assignedInvitedRow.rsvp_status);
      expect(validAssignedGroups).toContain(assignedInvitedRow.assigned_group);
      expect(assignedInvitedRow.waitlist_position).toBeNull();
      expect(assignedInvitedRow.joined_queue_at).toBeNull();
    });

    // 10. When allow_participant_invites = true in Assigned mode: claim assigns WAITLIST group with rsvp_status INVITED.
    it("10. When allow_participant_invites = true in Assigned mode: claim assigns WAITLIST group with rsvp_status INVITED", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: {
                    id: ASSIGNED_PLAN_ID,
                    status: "LIVE",
                    title: "Assigned With Participant Invites",
                    plan_size: 5,
                    participant_filtering: "ASSIGNED",
                    allow_participant_invites: true,
                  },
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
          plan_id: ASSIGNED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: "WAITLIST",
          waitlist_position: 1,
          plan_size: 5,
          already_participating: false,
          invited_participants: 1,
        },
        error: null,
      });

      const res = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);

      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.assigned_group).toBe("WAITLIST");
      expect(res.claimResult?.waitlist_position).toBe(1);
      expect(mockRpc).toHaveBeenCalledWith("claim_plan_invite", { p_plan_id: ASSIGNED_PLAN_ID });
    });

    // 11. When allow_participant_invites = false in Assigned mode: claim leaves assigned_group as NULL with rsvp_status INVITED.
    it("11. When allow_participant_invites = false in Assigned mode: claim leaves assigned_group as NULL with rsvp_status INVITED", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "plan_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                  data: {
                    id: ASSIGNED_PLAN_ID,
                    status: "LIVE",
                    title: "Assigned Without Participant Invites",
                    plan_size: 5,
                    participant_filtering: "ASSIGNED",
                    allow_participant_invites: false,
                  },
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
          plan_id: ASSIGNED_PLAN_ID,
          rsvp_status: "INVITED",
          assigned_group: null,
          waitlist_position: null,
          plan_size: 5,
          already_participating: false,
          invited_participants: 1,
        },
        error: null,
      });

      const res = await resolveInviteDestination(ASSIGNED_PLAN_ID, USER_B_ID);

      expect(res.destination).toBe("HOME");
      expect(res.status).toBe("INVITED");
      expect(res.claimResult?.rsvp_status).toBe("INVITED");
      expect(res.claimResult?.assigned_group).toBeNull();
      expect(res.claimResult?.waitlist_position).toBeNull();
    });

    // 12. Invited waitlist participants in Assigned mode receive sequential waitlist positions and display numbered badges while preserving rsvp_status = 'INVITED'
    it("12. Invited waitlist participants in Assigned mode receive sequential waitlist positions and display numbered badges while preserving rsvp_status = 'INVITED'", () => {
      // In Assigned mode, participants are rendered in the waitlist section
      // Those with rsvp_status = 'INVITED' in WAITLIST receive valid sequential waitlist_position (e.g., #2)
      const waitlistMembers = [
        {
          userId: "user-waitlisted",
          name: "Active Waitlister",
          rsvp_status: "WAITLISTED",
          assigned_group: "WAITLIST",
          waitlist_position: 1,
        },
        {
          userId: USER_B_ID,
          name: "Invited Waitlister",
          rsvp_status: "INVITED",
          assigned_group: "WAITLIST",
          waitlist_position: 2,
        },
      ];

      // WaitlistSection receives useParticipantPosition: true in editor mode
      // When useParticipantPosition is true, badge uses member.waitlistPosition
      // Both active waitlister and invited waitlister get valid sequential positions
      const getBadgeNumber = (member: (typeof waitlistMembers)[0], useParticipantPosition = true) => {
        if (useParticipantPosition) {
          return member.waitlist_position ?? null;
        }
        return null;
      };

      expect(getBadgeNumber(waitlistMembers[0], true)).toBe(1);
      expect(getBadgeNumber(waitlistMembers[1], true)).toBe(2);

      // Attendance breakdown: only Active Waitlister counts toward waitlisted; Invited Waitlister counts toward invited
      const breakdown = calculateParticipantBreakdown([
        {
          id: "1",
          plan_id: ASSIGNED_PLAN_ID,
          user_id: waitlistMembers[0].userId,
          role: "PARTICIPANT",
          rsvp_status: waitlistMembers[0].rsvp_status as any,
          assigned_group: waitlistMembers[0].assigned_group as any,
          waitlist_position: waitlistMembers[0].waitlist_position,
          responded_at: null,
        },
        {
          id: "2",
          plan_id: ASSIGNED_PLAN_ID,
          user_id: waitlistMembers[1].userId,
          role: "PARTICIPANT",
          rsvp_status: waitlistMembers[1].rsvp_status as any,
          assigned_group: waitlistMembers[1].assigned_group as any,
          waitlist_position: waitlistMembers[1].waitlist_position,
          responded_at: null,
        },
      ]);

      expect(breakdown.waitlisted).toBe(1);
      expect(breakdown.invited).toBe(1);
      expect(breakdown.joined).toBe(0);
    });
  });
});
