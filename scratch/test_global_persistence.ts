import assert from "assert";
import {
  parseCurrentRoute,
  getRoutePath,
  navigateToRoute,
  listenToNavigation,
  AppRoute,
} from "../apps/app/src/features/navigation/appRouter";
import {
  getSavedCreatePlanDraft,
  saveCreatePlanDraft,
  clearCreatePlanDraft,
  getSavedDraftParticipants,
  saveDraftParticipants,
  clearDraftParticipants,
  CreatePlanDraft,
} from "../apps/app/src/features/create/utils/draftParticipantStorage";

// Mock browser window and localStorage for node runtime
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockStorage();
const eventListeners: Record<string, Function[]> = {};

(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = {
  localStorage: mockStorage,
  location: {
    pathname: "/",
    search: "?session=default",
  },
  history: {
    state: null,
    pushState(state: any, title: string, url: string) {
      const [path, search] = url.split("?");
      window.location.pathname = path;
      window.location.search = search ? `?${search}` : "";
      (window.history as any).state = state;
    },
    replaceState(state: any, title: string, url: string) {
      const [path, search] = url.split("?");
      window.location.pathname = path;
      window.location.search = search ? `?${search}` : "";
      (window.history as any).state = state;
    },
  },
  addEventListener(type: string, handler: Function) {
    if (!eventListeners[type]) eventListeners[type] = [];
    eventListeners[type].push(handler);
  },
  removeEventListener(type: string, handler: Function) {
    if (eventListeners[type]) {
      eventListeners[type] = eventListeners[type].filter((h) => h !== handler);
    }
  },
  dispatchEvent(event: any) {
    const list = eventListeners[event.type] || [];
    for (const h of list) h(event);
    return true;
  },
};
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};

console.log("=== Running Global Persistence & Route Restoration Suite ===");

// 1. ROUTE PARSING TESTS
console.log("\n1. Testing Route Parsing & Canonical Paths...");
window.location.pathname = "/";
assert.strictEqual(parseCurrentRoute().tab, "home");

window.location.pathname = "/plans";
assert.strictEqual(parseCurrentRoute().tab, "plans");
assert.strictEqual(parseCurrentRoute().selectedPlanId, null);

window.location.pathname = "/plans/plan-uuid-999";
assert.strictEqual(parseCurrentRoute().tab, "plans");
assert.strictEqual(parseCurrentRoute().selectedPlanId, "plan-uuid-999");

window.location.pathname = "/create/who";
assert.strictEqual(parseCurrentRoute().tab, "create");
assert.strictEqual(parseCurrentRoute().createPhase, "who");

window.location.pathname = "/create/participants";
assert.strictEqual(parseCurrentRoute().tab, "create");
assert.strictEqual(parseCurrentRoute().createPhase, "who-actually");

window.location.pathname = "/create/when";
assert.strictEqual(parseCurrentRoute().tab, "create");
assert.strictEqual(parseCurrentRoute().createPhase, "when");

window.location.pathname = "/create/review";
assert.strictEqual(parseCurrentRoute().tab, "create");
assert.strictEqual(parseCurrentRoute().createPhase, "review");

console.log("✔ Route parsing passed for all key screens");

// 2. CANONICAL PATH GENERATION & SEARCH QUERY PRESERVATION
console.log("\n2. Testing Canonical Paths and Search Preservation...");
assert.strictEqual(getRoutePath({ tab: "create", createPhase: "who" }), "/create/who");
assert.strictEqual(getRoutePath({ tab: "create", createPhase: "who-actually" }), "/create/participants");
assert.strictEqual(getRoutePath({ tab: "create", createPhase: "when" }), "/create/when");
assert.strictEqual(getRoutePath({ tab: "create", createPhase: "review" }), "/create/review");
assert.strictEqual(getRoutePath({ tab: "plans", selectedPlanId: "abc-123" }), "/plans/abc-123");

window.location.search = "?session=test-user&filter=active";
navigateToRoute({ tab: "create", createPhase: "who" });
assert.strictEqual(window.location.pathname, "/create/who");
assert.strictEqual(window.location.search, "?session=test-user&filter=active");

let navEvents: AppRoute[] = [];
const unsubscribe = listenToNavigation((route) => {
  navEvents.push(route);
});

navigateToRoute({ tab: "create", createPhase: "when" });
assert.strictEqual(navEvents.length, 1);
assert.strictEqual(navEvents[0].tab, "create");
assert.strictEqual(navEvents[0].createPhase, "when");
unsubscribe();

console.log("✔ Navigation and search parameter preservation verified");

// 3. DRAFT PERSISTENCE & RESTORATION
console.log("\n3. Testing Comprehensive Create Plan Draft Persistence...");
clearCreatePlanDraft();
assert.strictEqual(getSavedCreatePlanDraft(), null);

const sampleDraft: Partial<CreatePlanDraft> = {
  createPhase: "who-actually",
  selectedCategory: "dining",
  localTitle: "Friday Sushi Night",
  localLocation: "Tokyo Dining Club",
  costAmount: 45,
  isCostManuallySet: true,
  eventDateTime: "2026-09-10T19:00:00.000Z",
  isDateManuallySet: true,
  waitlistMode: "assigned",
  waitlistEnabled: true,
  totalCapacity: 6,
  isCapacityManuallySet: true,
  isHostSelected: true,
  individuallySelectedFriendIds: ["f1", "f2", "f3", "f4", "f5"],
  selectedFriends: [
    { id: "f1", name: "Alice" },
    { id: "f2", name: "Bob" },
    { id: "f3", name: "Charlie" },
    { id: "f4", name: "Diana" },
    { id: "f5", name: "Evan" },
  ],
  priorityGuestIds: ["f1", "f2", "f3"],
  joinedIds: ["host", "f1", "f2", "f3"],
  waitlistIds: ["f4", "f5"],
};

saveCreatePlanDraft(sampleDraft);

const restored = getSavedCreatePlanDraft();
assert(restored !== null);
assert.strictEqual(restored.localTitle, "Friday Sushi Night");
assert.strictEqual(restored.localLocation, "Tokyo Dining Club");
assert.strictEqual(restored.costAmount, 45);
assert.strictEqual(restored.totalCapacity, 6);
assert.strictEqual(restored.createPhase, "who-actually");
assert.strictEqual(restored.joinedIds?.length, 4);
assert.strictEqual(restored.waitlistIds?.length, 2);
console.log("✔ Form fields and participant distribution fully restored");

// 4. INVARIANT: Joined ∩ Waitlist = ∅ (DISJOINT SETS)
console.log("\n4. Testing Disjoint Joined/Waitlist Invariant...");
saveDraftParticipants({
  joinedIds: ["host", "f1", "f2", "f3"],
  waitlistIds: ["f2", "f3", "f4", "f5"], // f2 and f3 overlap!
});

const restoredParticipants = getSavedDraftParticipants();
assert(restoredParticipants !== null);
assert.deepStrictEqual(restoredParticipants.joinedIds, ["host", "f1", "f2", "f3"]);
// waitlistIds should have automatically stripped out f2 and f3!
assert.deepStrictEqual(restoredParticipants.waitlistIds, ["f4", "f5"]);

const overlap = restoredParticipants.joinedIds.filter((id) =>
  restoredParticipants.waitlistIds.includes(id)
);
assert.strictEqual(overlap.length, 0, "Invariant violation: joinedIds and waitlistIds must be disjoint");
console.log("✔ Disjoint invariant verified (joinedIds ∩ waitlistIds = ∅)");

// 5. STORAGE QUOTA SAFETY (IMAGE BLOBS & DATA URLS PRUNING)
console.log("\n5. Testing Storage Quota Safety...");
const hugeDataUrl = "data:image/png;base64," + "A".repeat(100000); // 100KB+ base64
saveCreatePlanDraft({
  customCoverImage: hugeDataUrl,
});

const restoredSafe = getSavedCreatePlanDraft();
assert.strictEqual(
  restoredSafe?.customCoverImage,
  null,
  "Large data URLs must NOT be saved to localStorage to prevent quota crashes"
);

// Blob URL should also be pruned because it cannot survive a page refresh anyway
saveCreatePlanDraft({
  customCoverImage: "blob:http://localhost:3000/some-blob-uuid",
});
const restoredBlobSafe = getSavedCreatePlanDraft();
assert.strictEqual(
  restoredBlobSafe?.customCoverImage,
  null,
  "Blob URLs must NOT be persisted across page refreshes"
);

// Normal URL or asset path should be preserved
saveCreatePlanDraft({
  customCoverImage: "https://example.com/cover.jpg",
});
const restoredUrl = getSavedCreatePlanDraft();
assert.strictEqual(restoredUrl?.customCoverImage, "https://example.com/cover.jpg");
console.log("✔ Storage safety and quota protection verified");

// 6. DRAFT LIFECYCLE (FAILURE RETAINS, SUCCESS/RESET CLEARS)
console.log("\n6. Testing Draft Lifecycle...");
// On submit failure, draft remains
saveCreatePlanDraft({ localTitle: "Retryable Plan" });
assert.strictEqual(getSavedCreatePlanDraft()?.localTitle, "Retryable Plan");

// On success or reset:
clearCreatePlanDraft();
assert.strictEqual(getSavedCreatePlanDraft(), null);
assert.strictEqual(getSavedDraftParticipants(), null);
console.log("✔ Draft lifecycle verified");

console.log("\n========================================================");
console.log(" ALL TESTS PASSED: Global persistence & route restoration verified! ");
console.log("========================================================");
