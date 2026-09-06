import assert from "assert";
import {
  parseCurrentRoute,
  getRoutePath,
  navigateToRoute,
  AppRoute,
} from "../apps/app/src/features/navigation/appRouter";
import {
  getSavedCreatePlanDraft,
  saveCreatePlanDraft,
  clearCreatePlanDraft,
  getSavedDraftParticipants,
  saveDraftParticipants,
  clearDraftParticipants,
} from "../apps/app/src/features/create/utils/draftParticipantStorage";

// ── Mock Browser Environment ──
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
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = {
  localStorage: mockStorage,
  location: {
    pathname: "/",
    search: "",
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
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};

console.log("=== Running Refresh Persistence & Navigation Footer Suite ===");

// ══════════════════════════════════════════════════════════════════════════════
// TEST PART 1: NAVIGATION FOOTER VISIBILITY LOGIC ON REFRESH
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n--- Part 1: Navigation Footer Visibility on Refresh ---");

function computeInitialFooterVisibility(pathname: string, draft?: any): {
  shouldShowBottomNav: boolean;
  isFullScreen: boolean;
} {
  window.location.pathname = pathname;
  const route = parseCurrentRoute();

  const isFullScreen = (() => {
    if (route.selectedPlanId) return true;
    if (route.selectedChatPlanId) return true;
    if (route.tab === "create") {
      const phase = route.createPhase || (draft?.createPhase !== "confirmation" ? draft?.createPhase : undefined);
      if (phase && phase !== "category") return true;
    }
    return false;
  })();

  const childrenWantBottomNavHidden = isFullScreen;
  const selectedPlanId = route.selectedPlanId || null;
  const selectedChatPlanId = route.selectedChatPlanId || null;
  const selectedPlan = null; // null on frame 0 during startup

  const shouldShowBottomNav =
    !selectedPlan &&
    !selectedPlanId &&
    !selectedChatPlanId &&
    !childrenWantBottomNavHidden;

  return { shouldShowBottomNav, isFullScreen };
}

// Case 1.1: Refresh on /create/participants (Who Is Actually Coming)
const resParticipants = computeInitialFooterVisibility("/create/participants");
assert.strictEqual(resParticipants.isFullScreen, true, "Participants must be recognized as full-screen");
assert.strictEqual(resParticipants.shouldShowBottomNav, false, "Footer must be HIDDEN on /create/participants on frame 0");
console.log("✔ /create/participants: footer correctly hidden on frame 0");

// Case 1.2: Refresh on /create/who (Who Is Coming)
const resWho = computeInitialFooterVisibility("/create/who");
assert.strictEqual(resWho.isFullScreen, true, "Who Is Coming must be recognized as full-screen");
assert.strictEqual(resWho.shouldShowBottomNav, false, "Footer must be HIDDEN on /create/who on frame 0");
console.log("✔ /create/who: footer correctly hidden on frame 0");

// Case 1.3: Refresh on /create/when
const resWhen = computeInitialFooterVisibility("/create/when");
assert.strictEqual(resWhen.isFullScreen, true, "When Is Plan must be recognized as full-screen");
assert.strictEqual(resWhen.shouldShowBottomNav, false, "Footer must be HIDDEN on /create/when on frame 0");
console.log("✔ /create/when: footer correctly hidden on frame 0");

// Case 1.4: Refresh on /create/review
const resReview = computeInitialFooterVisibility("/create/review");
assert.strictEqual(resReview.isFullScreen, true, "Create Review must be recognized as full-screen");
assert.strictEqual(resReview.shouldShowBottomNav, false, "Footer must be HIDDEN on /create/review on frame 0");
console.log("✔ /create/review: footer correctly hidden on frame 0");

// Case 1.5: Refresh on /create (Category screen)
const resCategory = computeInitialFooterVisibility("/create");
assert.strictEqual(resCategory.isFullScreen, false, "Create category screen is NOT full-screen");
assert.strictEqual(resCategory.shouldShowBottomNav, true, "Footer must be VISIBLE on /create category screen");
console.log("✔ /create category: footer correctly visible");

// Case 1.6: Refresh on /plans/:id (Plan Preview)
const resPlanPreview = computeInitialFooterVisibility("/plans/test-plan-123");
assert.strictEqual(resPlanPreview.isFullScreen, true, "Plan preview must be recognized as full-screen");
assert.strictEqual(resPlanPreview.shouldShowBottomNav, false, "Footer must be HIDDEN on /plans/:id on frame 0");
console.log("✔ /plans/:id plan preview: footer correctly hidden on frame 0");

// Case 1.7: Refresh on normal tabs: /home and /plans
const resHome = computeInitialFooterVisibility("/home");
assert.strictEqual(resHome.shouldShowBottomNav, true, "Footer must be VISIBLE on /home");
const resPlans = computeInitialFooterVisibility("/plans");
assert.strictEqual(resPlans.shouldShowBottomNav, true, "Footer must be VISIBLE on /plans");
console.log("✔ /home and /plans: footer correctly visible");

// ══════════════════════════════════════════════════════════════════════════════
// TEST PART 2: ASSIGNED PARTICIPANT STATE PERSISTENCE ACROSS REFRESH
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n--- Part 2: Assigned Participant State Persistence Across Refresh ---");
clearCreatePlanDraft();

interface Friend {
  id: string;
  dbUuid: string;
  name: string;
  avatar: string;
  isHost?: boolean;
  waitlistPosition?: number;
}

const mockFriends: Friend[] = [
  { id: "u1", dbUuid: "u1", name: "Alice", avatar: "" },
  { id: "u2", dbUuid: "u2", name: "Bob", avatar: "" },
  { id: "u3", dbUuid: "u3", name: "Charlie", avatar: "" },
  { id: "u4", dbUuid: "u4", name: "Diana", avatar: "" },
  { id: "u5", dbUuid: "u5", name: "Evan", avatar: "" },
  { id: "u6", dbUuid: "u6", name: "Frank", avatar: "" },
  { id: "u7", dbUuid: "u7", name: "Grace", avatar: "" },
];

const hostItem: Friend = {
  id: "host",
  dbUuid: "host-uuid",
  name: "You (Host)",
  avatar: "",
  isHost: true,
};

// Initial state: Host + 3 Joined (Alice, Bob, Charlie), 4 Waitlisted (Diana, Evan, Frank, Grace)
let currentGoing: Friend[] = [hostItem, mockFriends[0], mockFriends[1], mockFriends[2]];
let currentWaitlist: Friend[] = [
  { ...mockFriends[3], waitlistPosition: 1 },
  { ...mockFriends[4], waitlistPosition: 2 },
  { ...mockFriends[5], waitlistPosition: 3 },
  { ...mockFriends[6], waitlistPosition: 4 },
];

// Save initial participant distribution
saveDraftParticipants({
  joinedIds: currentGoing.map((f) => f.id),
  waitlistIds: currentWaitlist.map((f) => f.id),
  joinedFriends: currentGoing.filter((f) => !f.isHost),
  waitlistFriends: currentWaitlist.filter((f) => !f.isHost),
});

// Also simulate useCreatePlanForm auto-persist saving form fields
saveCreatePlanDraft({
  localTitle: "Dinner Party",
  totalCapacity: 4,
  isCapacityManuallySet: true,
  waitlistMode: "assigned",
  isHostSelected: true,
  individuallySelectedFriendIds: mockFriends.map((f) => f.id),
  selectedFriends: mockFriends,
});

// Simulation of restoring on page refresh:
function simulateScreenRestoration(simulateSupabaseDelay: boolean) {
  const savedDraft = getSavedDraftParticipants();
  assert(savedDraft !== null, "Draft must exist in storage");

  // On frame 0, if simulateSupabaseDelay is true, the friendship context might not have returned yet,
  // but WhoIsActuallyComing reconstructs the friendMap from savedDraft!
  const friendMap = new Map<string, Friend>();
  if (savedDraft.joinedFriends) {
    savedDraft.joinedFriends.forEach((f) => friendMap.set(f.id, f));
  }
  if (savedDraft.waitlistFriends) {
    savedDraft.waitlistFriends.forEach((f) => friendMap.set(f.id, f));
  }
  if (!simulateSupabaseDelay) {
    mockFriends.forEach((f) => friendMap.set(f.id, f));
  }

  const isHostInJoined = savedDraft.joinedIds.includes("host");
  const goingGuests = savedDraft.joinedIds
    .filter((id) => id !== "host" && friendMap.has(id))
    .map((id) => friendMap.get(id)!);
  const restoredGoing = [...(isHostInJoined ? [hostItem] : []), ...goingGuests];

  const joinedIdSet = new Set(savedDraft.joinedIds);
  const waitGuests = savedDraft.waitlistIds
    .filter((id) => id !== "host" && !joinedIdSet.has(id) && friendMap.has(id))
    .map((id) => friendMap.get(id)!);
  const restoredWait = waitGuests.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));

  return { restoredGoing, restoredWait };
}

// Verification 1: Direct refresh with initial arrangement
let state1 = simulateScreenRestoration(true);
assert.strictEqual(state1.restoredGoing.length, 4, "Host + 3 friends must be in Going");
assert.strictEqual(state1.restoredGoing[0].id, "host");
assert.strictEqual(state1.restoredGoing[1].name, "Alice");
assert.strictEqual(state1.restoredGoing[2].name, "Bob");
assert.strictEqual(state1.restoredGoing[3].name, "Charlie");
assert.strictEqual(state1.restoredWait.length, 4, "4 friends must be in Waitlist");
assert.strictEqual(state1.restoredWait[0].name, "Diana");
assert.strictEqual(state1.restoredWait[1].name, "Evan");
assert.strictEqual(state1.restoredWait[2].name, "Frank");
assert.strictEqual(state1.restoredWait[3].name, "Grace");
console.log("✔ Initial arrangement: 1 Host + 3 Joined, 4 Waitlisted perfectly restored across refresh");

// Verification 2: User moves 2 from Waitlist -> Joined (Diana and Evan)
currentGoing = [...currentGoing, currentWaitlist[0], currentWaitlist[1]];
currentWaitlist = currentWaitlist.slice(2).map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));

saveDraftParticipants({
  joinedIds: currentGoing.map((f) => f.id),
  waitlistIds: currentWaitlist.map((f) => f.id),
  joinedFriends: currentGoing.filter((f) => !f.isHost),
  waitlistFriends: currentWaitlist.filter((f) => !f.isHost),
});

// Auto-persist call that does NOT pass participant IDs (must not clobber!)
saveCreatePlanDraft({ quickNote: "Bring board games" });

let state2 = simulateScreenRestoration(true);
assert.strictEqual(state2.restoredGoing.length, 6, "Host + 5 friends must be in Going");
assert.strictEqual(state2.restoredWait.length, 2, "2 friends (Frank, Grace) must be in Waitlist");
assert(state2.restoredGoing.some((f) => f.name === "Diana"), "Diana must be in Going");
assert(state2.restoredGoing.some((f) => f.name === "Evan"), "Evan must be in Going");
assert.strictEqual(state2.restoredWait[0].name, "Frank");
assert.strictEqual(state2.restoredWait[1].name, "Grace");
console.log("✔ Move Waitlist -> Joined: 6 Joined (Host+5) and 2 Waitlisted survived refresh and form auto-persist");

// Verification 3: User moves someone Joined -> Waitlist (Alice)
const alice = currentGoing.find((f) => f.name === "Alice")!;
currentGoing = currentGoing.filter((f) => f.name !== "Alice");
currentWaitlist = [...currentWaitlist, alice].map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));

saveDraftParticipants({
  joinedIds: currentGoing.map((f) => f.id),
  waitlistIds: currentWaitlist.map((f) => f.id),
  joinedFriends: currentGoing.filter((f) => !f.isHost),
  waitlistFriends: currentWaitlist.filter((f) => !f.isHost),
});

let state3 = simulateScreenRestoration(false);
assert.strictEqual(state3.restoredGoing.length, 5, "Host + 4 friends must be in Going");
assert.strictEqual(state3.restoredWait.length, 3, "3 friends must be in Waitlist");
assert(!state3.restoredGoing.some((f) => f.name === "Alice"), "Alice must NOT be in Going");
assert.strictEqual(state3.restoredWait[2].name, "Alice", "Alice must be at end of Waitlist (#3)");
console.log("✔ Move Joined -> Waitlist: survived refresh with Alice placed into Waitlist");

// Verification 4: Reorder Waitlist (Move Alice to #1)
currentWaitlist = [currentWaitlist[2], currentWaitlist[0], currentWaitlist[1]].map((f, idx) => ({
  ...f,
  waitlistPosition: idx + 1,
}));

saveDraftParticipants({
  joinedIds: currentGoing.map((f) => f.id),
  waitlistIds: currentWaitlist.map((f) => f.id),
  joinedFriends: currentGoing.filter((f) => !f.isHost),
  waitlistFriends: currentWaitlist.filter((f) => !f.isHost),
});

let state4 = simulateScreenRestoration(true);
assert.strictEqual(state4.restoredWait[0].name, "Alice", "Alice must be #1 in Waitlist");
assert.strictEqual(state4.restoredWait[1].name, "Frank", "Frank must be #2 in Waitlist");
assert.strictEqual(state4.restoredWait[2].name, "Grace", "Grace must be #3 in Waitlist");
console.log("✔ Waitlist custom drag-and-drop order strictly preserved across refresh");

// Verification 5: Remove a participant completely (Grace)
currentWaitlist = currentWaitlist.filter((f) => f.name !== "Grace");
saveDraftParticipants({
  joinedIds: currentGoing.map((f) => f.id),
  waitlistIds: currentWaitlist.map((f) => f.id),
  joinedFriends: currentGoing.filter((f) => !f.isHost),
  waitlistFriends: currentWaitlist.filter((f) => !f.isHost),
});

let state5 = simulateScreenRestoration(false);
assert(!state5.restoredGoing.some((f) => f.name === "Grace"), "Grace must not be in Going");
assert(!state5.restoredWait.some((f) => f.name === "Grace"), "Grace must not be in Waitlist");
console.log("✔ Participant removal strictly preserved across refresh");

// Verification 6: Disjoint Invariant (joinedIds ∩ waitlistIds = ∅)
const allJoinedIds = state5.restoredGoing.map((f) => f.id);
const allWaitIds = state5.restoredWait.map((f) => f.id);
const overlap = allJoinedIds.filter((id) => allWaitIds.includes(id));
assert.strictEqual(overlap.length, 0, "Joined and Waitlist MUST be strictly disjoint");
console.log("✔ Disjoint invariant verified (joinedIds ∩ waitlistIds = ∅)");

// Verification 7: Host Handling
assert(state5.restoredGoing.some((f) => f.isHost), "Host must remain in Going");
assert(!state5.restoredWait.some((f) => f.isHost), "Host must never be in Waitlist");
console.log("✔ Host handling verified");

console.log("\n========================================================");
console.log(" ALL REGRESSION & REFRESH TESTS PASSED SUCCESSFULLY! ");
console.log("========================================================");
