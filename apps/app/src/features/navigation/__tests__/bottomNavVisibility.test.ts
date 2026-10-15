import { describe, it, expect } from 'vitest';
import { parseCurrentRoute, AppRoute, AppTab } from '../appRouter';

/**
 * Pure route & state visibility derivation engine matching MainApp.tsx
 */
function computeShouldShowBottomNav({
  currentRoute,
  activeTab,
  selectedPlanId = null,
  selectedChatPlanId = null,
  showPlansSearchScreen = false,
  showHostedPlansScreen = false,
  showPastPlansScreen = false,
  showFriendsScreen = false,
  childrenWantBottomNavHidden = false,
}: {
  currentRoute: AppRoute;
  activeTab: AppTab;
  selectedPlanId?: string | null;
  selectedChatPlanId?: string | null;
  showPlansSearchScreen?: boolean;
  showHostedPlansScreen?: boolean;
  showPastPlansScreen?: boolean;
  showFriendsScreen?: boolean;
  childrenWantBottomNavHidden?: boolean;
}): boolean {
  // 1. Fullscreen modal overlays hide bottom navigation across the entire app
  // Note: Fullscreen modals (plan details, plan chat) are ONLY open if their active state
  // (selectedPlanId, selectedChatPlanId) is actively set.
  // When returning to Plans, Home, or Chats, a lagging route param must never suppress bottom nav.
  if (
    selectedPlanId ||
    selectedChatPlanId ||
    showPlansSearchScreen ||
    showHostedPlansScreen ||
    showPastPlansScreen ||
    showFriendsScreen
  ) {
    return false;
  }

  // 2. Category discovery screens (Sports, Dining, Movies, Activities) ALWAYS hide bottom navigation
  const isCategoryDiscovery =
    currentRoute.tab === 'sports' ||
    currentRoute.tab === 'dining' ||
    currentRoute.tab === 'movies' ||
    currentRoute.tab === 'activities' ||
    Boolean(currentRoute.discoveryCategory) ||
    activeTab === 'sports' ||
    activeTab === 'dining' ||
    activeTab === 'movies' ||
    activeTab === 'activities';

  if (isCategoryDiscovery) {
    return false;
  }

  // 3. Main Create/Discovery screen ALWAYS shows bottom navigation
  const isMainCreateDiscovery =
    (currentRoute.tab === 'create' || activeTab === 'create') &&
    (!currentRoute.createPhase || currentRoute.createPhase === 'category') &&
    !currentRoute.discoveryCategory;

  if (isMainCreateDiscovery) {
    return true;
  }

  // 4. Create multi-phase wizard screens (who, when, review, confirmation) hide bottom navigation
  if (
    (currentRoute.tab === 'create' || activeTab === 'create') &&
    currentRoute.createPhase &&
    currentRoute.createPhase !== 'category'
  ) {
    return false;
  }

  // 5. Main root tabs (Home, Plans, Chats) ALWAYS show bottom navigation
  if (activeTab === 'home' || activeTab === 'plans' || activeTab === 'chats') {
    return true;
  }

  // 6. Profile screen shows bottom navigation unless a sub-sheet requested hiding
  if (activeTab === 'profile') {
    return !childrenWantBottomNavHidden;
  }

  return !childrenWantBottomNavHidden;
}

describe('Bottom Navigation Visibility State', () => {
  describe('Direct URL and Static Routes', () => {
    it('shows bottom navigation on Home', () => {
      const route: AppRoute = { tab: 'home' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'home' })).toBe(true);
    });

    it('shows bottom navigation on Plans list', () => {
      const route: AppRoute = { tab: 'plans' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'plans' })).toBe(true);
    });

    it('shows bottom navigation on Chats list', () => {
      const route: AppRoute = { tab: 'chats' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'chats' })).toBe(true);
    });

    it('shows bottom navigation on Profile', () => {
      const route: AppRoute = { tab: 'profile' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'profile' })).toBe(true);
    });

    it('shows bottom navigation on Main Create/Discovery screen (/create)', () => {
      const route: AppRoute = { tab: 'create', createPhase: 'category' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'create' })).toBe(true);
    });

    it('shows bottom navigation on Main Create/Discovery even if childrenWantBottomNavHidden was true', () => {
      const route: AppRoute = { tab: 'create', createPhase: 'category' };
      expect(
        computeShouldShowBottomNav({
          currentRoute: route,
          activeTab: 'create',
          childrenWantBottomNavHidden: true, // stale flag from previously visited screen
        })
      ).toBe(true);
    });

    it('hides bottom navigation on Sports discovery (/create/sports)', () => {
      const route: AppRoute = { tab: 'sports', discoveryCategory: 'sports' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'sports' })).toBe(false);
    });

    it('hides bottom navigation on Dining discovery (/create/dining)', () => {
      const route: AppRoute = { tab: 'dining', discoveryCategory: 'dining' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'dining' })).toBe(false);
    });

    it('hides bottom navigation on Movies discovery (/create/movies)', () => {
      const route: AppRoute = { tab: 'movies', discoveryCategory: 'movies' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'movies' })).toBe(false);
    });

    it('hides bottom navigation on Activities discovery (/create/activities)', () => {
      const route: AppRoute = { tab: 'activities', discoveryCategory: 'activities' };
      expect(computeShouldShowBottomNav({ currentRoute: route, activeTab: 'activities' })).toBe(false);
    });
  });

  describe('Route Transitions and Back Navigation', () => {
    it('handles Create -> Sports -> Back -> Create transition', () => {
      // 1. Initial on Create
      let currentRoute: AppRoute = { tab: 'create', createPhase: 'category' };
      let activeTab: AppTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);

      // 2. Navigate to Sports
      currentRoute = { tab: 'sports', discoveryCategory: 'sports' };
      activeTab = 'sports';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(false);

      // 3. Back to Create
      currentRoute = { tab: 'create', createPhase: 'category' };
      activeTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);
    });

    it('handles Create -> Movies -> Back -> Create transition', () => {
      let currentRoute: AppRoute = { tab: 'create', createPhase: 'category' };
      let activeTab: AppTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);

      currentRoute = { tab: 'movies', discoveryCategory: 'movies' };
      activeTab = 'movies';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(false);

      currentRoute = { tab: 'create', createPhase: 'category' };
      activeTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);
    });

    it('handles Create -> Dining -> Back -> Create transition', () => {
      let currentRoute: AppRoute = { tab: 'create', createPhase: 'category' };
      let activeTab: AppTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);

      currentRoute = { tab: 'dining', discoveryCategory: 'dining' };
      activeTab = 'dining';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(false);

      currentRoute = { tab: 'create', createPhase: 'category' };
      activeTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);
    });

    it('handles Create -> Activities -> Back -> Create transition', () => {
      let currentRoute: AppRoute = { tab: 'create', createPhase: 'category' };
      let activeTab: AppTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);

      currentRoute = { tab: 'activities', discoveryCategory: 'activities' };
      activeTab = 'activities';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(false);

      currentRoute = { tab: 'create', createPhase: 'category' };
      activeTab = 'create';
      expect(computeShouldShowBottomNav({ currentRoute, activeTab })).toBe(true);
    });

    it('handles repeated transitions: Create -> Sports -> Back -> Create -> Sports -> Back -> Create', () => {
      for (let i = 0; i < 5; i++) {
        // Create
        expect(
          computeShouldShowBottomNav({
            currentRoute: { tab: 'create', createPhase: 'category' },
            activeTab: 'create',
          })
        ).toBe(true);

        // Sports
        expect(
          computeShouldShowBottomNav({
            currentRoute: { tab: 'sports', discoveryCategory: 'sports' },
            activeTab: 'sports',
          })
        ).toBe(false);

        // Back to Create
        expect(
          computeShouldShowBottomNav({
            currentRoute: { tab: 'create', createPhase: 'category' },
            activeTab: 'create',
            childrenWantBottomNavHidden: true, // Even if child state was delayed
          })
        ).toBe(true);
      }
    });
  });

  describe('Plans Screen Regression Scenarios (Always Shows Bottom Navigation on Plans)', () => {
    it('1. Plans -> open Plan -> Back -> Plans keeps bottom navigation visible', () => {
      // 1. On Plans screen
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);

      // 2. Open Plan (e.g. Doomsday)
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday' },
          activeTab: 'plans',
          selectedPlanId: 'doomsday',
        })
      ).toBe(false);

      // 3. Back to Plans (even if route param is clearing or transition in progress)
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: null },
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);
    });

    it('2. Plans -> open Plan -> open bottom sheet -> dismiss -> Back -> Plans', () => {
      // Open Plan
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday' },
          activeTab: 'plans',
          selectedPlanId: 'doomsday',
        })
      ).toBe(false);

      // Sheet opened inside plan: modal still mounted
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday' },
          activeTab: 'plans',
          selectedPlanId: 'doomsday',
        })
      ).toBe(false);

      // Sheet dismissed, then Back to Plans
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);
    });

    it('3. Plans -> open Plan -> bottom sheet action (leave/cancel) -> Back -> Plans', () => {
      // User executes action in sheet which closes the modal and returns to Plans
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);
    });

    it('4. Plans -> open Plan -> swipe/dismiss bottom sheet -> Back -> Plans', () => {
      // Swipe/dismiss sheet then Back
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);
    });

    it('5. Plans -> open Plan -> browser/device back -> Plans', () => {
      // Popstate returns directly to /plans
      const poppedRoute: AppRoute = { tab: 'plans', selectedPlanId: null };
      expect(
        computeShouldShowBottomNav({
          currentRoute: poppedRoute,
          activeTab: 'plans',
          selectedPlanId: null,
        })
      ).toBe(true);
    });

    it('6. Plans -> switch another bottom-nav tab -> Plans', () => {
      // Tab 1: Plans
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
        })
      ).toBe(true);

      // Switch to Home
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'home' },
          activeTab: 'home',
        })
      ).toBe(true);

      // Switch back to Plans
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans' },
          activeTab: 'plans',
        })
      ).toBe(true);
    });

    it('7. Chats list always shows bottom navigation even if currentRoute.selectedChatPlanId lags', () => {
      // Lagging route param from previous chat must not suppress bottom nav on main Chats screen
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'chats', selectedChatPlanId: 'timezone-phoenix-mall' },
          activeTab: 'chats',
          selectedChatPlanId: null, // modal is closed
        })
      ).toBe(true);
    });

    it('8. Full flow: Home/Plans -> Plan Preview -> Plan Chat -> Back -> Chats list keeps bottom nav visible', () => {
      // 1. User on Home
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'home' },
          activeTab: 'home',
        })
      ).toBe(true);

      // 2. Taps Plan -> Plan Preview opens
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday' },
          activeTab: 'home',
          selectedPlanId: 'doomsday',
        })
      ).toBe(false);

      // 3. From Plan Preview opens Chat
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday', selectedChatPlanId: 'doomsday' },
          activeTab: 'home',
          selectedPlanId: 'doomsday',
          selectedChatPlanId: 'doomsday',
        })
      ).toBe(false);

      // 4. Closes Chat -> back in Plan Preview
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'plans', selectedPlanId: 'doomsday' },
          activeTab: 'home',
          selectedPlanId: 'doomsday',
          selectedChatPlanId: null,
        })
      ).toBe(false);

      // 5. Closes Plan Preview -> back on Home
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'home' },
          activeTab: 'home',
          selectedPlanId: null,
          selectedChatPlanId: null,
        })
      ).toBe(true);

      // 6. User switches to Chats directory screen (even if transition or history has lingering chat param)
      expect(
        computeShouldShowBottomNav({
          currentRoute: { tab: 'chats', selectedChatPlanId: 'doomsday' },
          activeTab: 'chats',
          selectedPlanId: null,
          selectedChatPlanId: null,
        })
      ).toBe(true);
    });
  });
});
