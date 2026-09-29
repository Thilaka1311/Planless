import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCachedQuickPlans,
  saveCachedQuickPlans,
  getCachedQuickPlanLists,
  saveCachedQuickPlanLists,
  createQuickPlan,
  deleteQuickPlan,
  createQuickPlanList,
  updateQuickPlanList,
  deleteQuickPlanList,
  QUICK_PLANS_UPDATED_EVENT,
} from "../services/quickPlanService";
import { supabase } from "../../../../lib/supabaseClient";

describe("quickPlanService & Local Cache", () => {
  const mockUserId = "user-1234-uuid";

  const storageMap: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((k: string) => storageMap[k] || null),
    setItem: vi.fn((k: string, v: string) => {
      storageMap[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete storageMap[k];
    }),
    clear: vi.fn(() => {
      Object.keys(storageMap).forEach((k) => delete storageMap[k]);
    }),
  };

  const dispatchEventMock = vi.fn();

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();

    (global as any).window = {
      localStorage: mockLocalStorage,
      dispatchEvent: dispatchEventMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it("returns an empty array when cache is empty", () => {
    const plans = getCachedQuickPlans(mockUserId);
    expect(plans).toEqual([]);
    const lists = getCachedQuickPlanLists(mockUserId);
    expect(lists).toEqual([]);
  });

  it("persists and restores cached quick plan lists immediately (cache-first)", () => {
    const mockLists = [
      {
        id: "list-1",
        creator_id: mockUserId,
        name: "Football",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 3,
      },
    ];

    saveCachedQuickPlanLists(mockUserId, mockLists);
    const restored = getCachedQuickPlanLists(mockUserId);
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Football");
    expect(restored[0].quick_plans_count).toBe(3);
  });

  it("creates a Quick Plan List in Supabase and persists in local cache", async () => {
    const mockCreatedList = {
      id: "list-new-1",
      creator_id: mockUserId,
      name: "Movies",
      description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(supabase, "from").mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCreatedList, error: null }),
        }),
      }),
    } as any);

    const result = await createQuickPlanList({
      creator_id: mockUserId,
      name: "Movies",
    });

    expect(result.id).toBe("list-new-1");
    expect(result.name).toBe("Movies");
    expect(result.quick_plans_count).toBe(0);

    const cached = getCachedQuickPlanLists(mockUserId);
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe("list-new-1");
    expect(dispatchEventMock).toHaveBeenCalledWith(expect.any(Object));
  });

  it("updates a Quick Plan List name and updates cache", async () => {
    saveCachedQuickPlanLists(mockUserId, [
      {
        id: "list-1",
        creator_id: mockUserId,
        name: "Old Name",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 2,
      },
    ]);

    vi.spyOn(supabase, "from").mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "list-1",
                  creator_id: mockUserId,
                  name: "New Name",
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);

    const updated = await updateQuickPlanList("list-1", mockUserId, { name: "New Name" });
    expect(updated.name).toBe("New Name");

    const cached = getCachedQuickPlanLists(mockUserId);
    expect(cached[0].name).toBe("New Name");
  });

  it("deletes a Quick Plan List and purges child quick plans from cache", async () => {
    saveCachedQuickPlanLists(mockUserId, [
      {
        id: "list-to-delete",
        creator_id: mockUserId,
        name: "Delete Me",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 1,
      },
    ]);

    saveCachedQuickPlans(mockUserId, [
      {
        id: "qp-child",
        creator_id: mockUserId,
        quick_plan_list_id: "list-to-delete",
        name: "Child Plan",
        category: "SPORTS",
        place_name: "Turf",
        place_address: "Address",
        default_cost: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "qp-other",
        creator_id: mockUserId,
        quick_plan_list_id: "list-other",
        name: "Other Plan",
        category: "DINING",
        place_name: "Cafe",
        place_address: "Address",
        default_cost: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    vi.spyOn(supabase, "from").mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    } as any);

    await deleteQuickPlanList("list-to-delete", mockUserId);

    expect(getCachedQuickPlanLists(mockUserId)).toHaveLength(0);
    const remainingPlans = getCachedQuickPlans(mockUserId);
    expect(remainingPlans).toHaveLength(1);
    expect(remainingPlans[0].id).toBe("qp-other");
  });

  it("creates a Quick Plan with quick_plan_list_id and increments list count in cache", async () => {
    saveCachedQuickPlanLists(mockUserId, [
      {
        id: "list-sports",
        creator_id: mockUserId,
        name: "Sports",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans_count: 0,
      },
    ]);

    const mockCreatedRow = {
      id: "qp-new-999",
      creator_id: mockUserId,
      quick_plan_list_id: "list-sports",
      name: "Weekly Turf",
      category: "SPORTS",
      subcategory: "FOOTBALL",
      place_name: "Turf Arena",
      place_address: "Koramangala",
      default_cost: 500,
      plan_size: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "quick_plans") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockCreatedRow, error: null }),
            }),
          }),
        } as any;
      }
      if (table === "quick_plan_participants") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const result = await createQuickPlan({
      creator_id: mockUserId,
      quick_plan_list_id: "list-sports",
      name: "Weekly Turf",
      category: "sports",
      subcategory: "football",
      place_name: "Turf Arena",
      place_address: "Koramangala",
      default_cost: 500,
      plan_size: 10,
    });

    expect(result.id).toBe("qp-new-999");
    expect(result.quick_plan_list_id).toBe("list-sports");

    const cachedPlans = getCachedQuickPlans(mockUserId);
    expect(cachedPlans).toHaveLength(1);
    expect(cachedPlans[0].quick_plan_list_id).toBe("list-sports");

    const cachedLists = getCachedQuickPlanLists(mockUserId);
    expect(cachedLists[0].quick_plans_count).toBe(1);
  });

  it("fetches quick plan lists from Supabase and syncs cache", async () => {
    const mockListsFromDb = [
      {
        id: "list-1",
        creator_id: mockUserId,
        name: "Football",
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quick_plans: [{ id: "qp-1" }, { id: "qp-2" }],
      },
    ];

    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockListsFromDb,
            error: null,
          }),
        }),
      }),
    } as any);

    const { fetchUserQuickPlanLists } = await import("../services/quickPlanService");
    const lists = await fetchUserQuickPlanLists(mockUserId);

    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("Football");
    expect(lists[0].quick_plans_count).toBe(2);

    const cached = getCachedQuickPlanLists(mockUserId);
    expect(cached).toHaveLength(1);
    expect(cached[0].quick_plans_count).toBe(2);
  });
});
