import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCurrentRoute,
  getRoutePath,
  isValidRoute,
  navigateToRoute,
  navigateBack,
  listenToNavigation,
  resetInAppNavigationDepth,
  getInAppNavigationDepth,
} from '../appRouter';

describe('Back Button Navigation Regression Suite', () => {
  let originalWindow: any;
  let listeners: Record<string, Function[]> = {};
  let mockWindow: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetInAppNavigationDepth();
    listeners = {};

    mockWindow = {
      location: new URL('http://localhost:3000/create'),
      history: {
        length: 1,
        state: null,
        pushState: vi.fn((state, _title, url) => {
          mockWindow.history.state = state;
          mockWindow.history.length++;
          mockWindow.location = new URL(url, 'http://localhost:3000');
        }),
        replaceState: vi.fn((state, _title, url) => {
          mockWindow.history.state = state;
          mockWindow.location = new URL(url, 'http://localhost:3000');
        }),
        back: vi.fn(() => {
          if (mockWindow.history.length > 1) {
            mockWindow.history.length--;
          }
        }),
      },
      addEventListener: vi.fn((evt: string, handler: Function) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      }),
      removeEventListener: vi.fn((evt: string, handler: Function) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt].filter((h) => h !== handler);
        }
      }),
      dispatchEvent: vi.fn((evt: any) => {
        (listeners[evt.type] || []).forEach((h) => h(evt));
      }),
    };

    originalWindow = (globalThis as any).window;
    (globalThis as any).window = mockWindow;
    (globalThis as any).CustomEvent = class {
      type: string;
      detail: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
    (globalThis as any).PopStateEvent = class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('Scenario 1: Discovery -> Search -> Back -> Discovery (history pop)', () => {
    // 1. Initial location is Discovery (/create)
    mockWindow.location = new URL('http://localhost:3000/create');
    expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'category' });

    // 2. User opens Master Search: navigateToRoute({ tab: 'create', subScreen: 'master-search' })
    navigateToRoute({ tab: 'create', subScreen: 'master-search' });
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(
      { tab: 'create', subScreen: 'master-search' },
      '',
      '/create/search'
    );
    expect(getInAppNavigationDepth()).toBe(1);
    expect(mockWindow.history.length).toBe(2);

    // Current parsed route is master-search
    expect(parseCurrentRoute()).toEqual({ tab: 'create', subScreen: 'master-search' });

    // 3. User taps Back button in Search: navigateBack({ tab: 'create' })
    navigateBack({ tab: 'create' });
    expect(mockWindow.history.back).toHaveBeenCalled();
  });

  it('Scenario 2: Discovery -> Quick Plans -> Back -> Discovery (history pop)', () => {
    // 1. Initial location is Discovery (/create)
    mockWindow.location = new URL('http://localhost:3000/create');
    expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'category' });

    // 2. User opens Quick Plans
    navigateToRoute({ tab: 'create', subScreen: 'quick-plans' });
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(
      { tab: 'create', subScreen: 'quick-plans' },
      '',
      '/create/quick-plans'
    );
    expect(parseCurrentRoute()).toEqual({ tab: 'create', subScreen: 'quick-plans' });

    // 3. User taps Back
    navigateBack({ tab: 'create' });
    expect(mockWindow.history.back).toHaveBeenCalled();
  });

  it('Scenario 3: Direct URL navigation to /create/search -> Back falls back to /create', () => {
    // Fresh browser tab landing directly on /create/search
    resetInAppNavigationDepth();
    mockWindow.location = new URL('http://localhost:3000/create/search');
    mockWindow.history.length = 1;

    expect(parseCurrentRoute()).toEqual({ tab: 'create', subScreen: 'master-search' });
    expect(getInAppNavigationDepth()).toBe(0);

    // User taps Back in search: should not pop empty history or close app, but fallback to /create
    navigateBack({ tab: 'create' });
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(
      { tab: 'create' },
      '',
      '/create'
    );
  });

  it('Scenario 4: Direct URL navigation to /search -> Back falls back to /create', () => {
    resetInAppNavigationDepth();
    mockWindow.location = new URL('http://localhost:3000/search');
    mockWindow.history.length = 1;

    expect(parseCurrentRoute()).toEqual({ tab: 'create', subScreen: 'master-search' });

    navigateBack({ tab: 'create' });
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(
      { tab: 'create' },
      '',
      '/create'
    );
  });

  it('Scenario 5: Hardware/browser popstate navigation from search back to /create updates router subscribers', () => {
    let activeRoute: any = null;
    const unsubscribe = listenToNavigation((route) => {
      activeRoute = route;
    });

    // Start at search
    mockWindow.location = new URL('http://localhost:3000/create/search');

    // Browser fires popstate returning to /create
    mockWindow.location = new URL('http://localhost:3000/create');
    mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));

    expect(activeRoute).toEqual({ tab: 'create', createPhase: 'category' });
    expect(activeRoute.subScreen).toBeUndefined();

    unsubscribe();
  });

  it('Scenario 6: Discovery -> Plan Details -> Close/Back preserves /create tab', () => {
    mockWindow.location = new URL('http://localhost:3000/create');
    navigateToRoute({ tab: 'create', selectedPlanId: 'plan-123' });
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(
      { tab: 'create', selectedPlanId: 'plan-123' },
      '',
      '/plans/plan-123'
    );

    // Plan detail closes and returns to Discovery (tab: create)
    navigateToRoute({ tab: 'create' }, { replace: true });
    expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
      { tab: 'create' },
      '',
      '/create'
    );
    expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'category' });
  });

  it('Scenario 7: Create Plan Wizard phase navigation and back flow', () => {
    // 1. /create/who
    navigateToRoute({ tab: 'create', createPhase: 'who' });
    expect(mockWindow.location.pathname).toBe('/create/who');

    // 2. /create/when
    navigateToRoute({ tab: 'create', createPhase: 'when' });
    expect(mockWindow.location.pathname).toBe('/create/when');

    // 3. /create/review
    navigateToRoute({ tab: 'create', createPhase: 'review' });
    expect(mockWindow.location.pathname).toBe('/create/review');

    // Back to when
    navigateBack({ tab: 'create', createPhase: 'when' });
    expect(mockWindow.history.back).toHaveBeenCalled();
  });

  describe('Android Back Navigation Unified Specification Scenarios', () => {
    it('Scenario 1: Home -> Search -> Back returns to Home', () => {
      // 1. Start on Home
      mockWindow.location = new URL('http://localhost:3000/home');
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });

      // 2. Navigate to Search
      navigateToRoute({ tab: 'create', subScreen: 'master-search' });
      expect(mockWindow.location.pathname).toBe('/create/search');
      expect(getInAppNavigationDepth()).toBe(1);

      // 3. User taps in-app Back or Android gesture
      navigateBack({ tab: 'home' });
      expect(mockWindow.history.back).toHaveBeenCalled();

      // Browser pops back to Home
      mockWindow.location = new URL('http://localhost:3000/home');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });
    });

    it('Scenario 2: Home -> Plan Details -> Chat -> Back returns to Plan Details', () => {
      // 1. Start on Home
      mockWindow.location = new URL('http://localhost:3000/home');

      // 2. Open Plan Details
      navigateToRoute({ tab: 'home', selectedPlanId: 'plan-101' });
      expect(mockWindow.location.pathname).toBe('/plans/plan-101');

      // 3. Open Chat from Plan Details
      navigateToRoute({ tab: 'plans', selectedPlanId: 'plan-101', selectedChatPlanId: 'plan-101' });
      expect(mockWindow.location.pathname).toBe('/plans/plan-101/chat');
      expect(parseCurrentRoute()).toEqual({
        tab: 'plans',
        selectedPlanId: 'plan-101',
        selectedChatPlanId: 'plan-101',
      });

      // 4. Back in Chat returns to Plan Details
      navigateBack({ tab: 'home' });
      expect(mockWindow.history.back).toHaveBeenCalled();

      // Browser popstate restores Plan Details
      mockWindow.location = new URL('http://localhost:3000/plans/plan-101');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(parseCurrentRoute()).toEqual({
        tab: 'plans',
        selectedPlanId: 'plan-101',
      });

      // 5. Back in Plan Details returns to Home
      navigateBack({ tab: 'home' });
      mockWindow.location = new URL('http://localhost:3000/home');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });
    });

    it('Scenario 3: Home -> Create Plan -> Plan Preview -> Back returns to Create Plan', () => {
      // 1. Start on Home
      mockWindow.location = new URL('http://localhost:3000/home');

      // 2. Go to Create Plan
      navigateToRoute({ tab: 'create' });
      expect(mockWindow.location.pathname).toBe('/create');

      // 3. Preview newly created plan
      navigateToRoute({ tab: 'create', selectedPlanId: 'plan-new' });
      expect(mockWindow.location.pathname).toBe('/plans/plan-new');

      // 4. Back returns to Create Plan
      navigateBack({ tab: 'create' });
      expect(mockWindow.history.back).toHaveBeenCalled();

      mockWindow.location = new URL('http://localhost:3000/create');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'category' });
    });

    it('Scenario 4: Direct notification / link entry falls back safely to Home', () => {
      // User lands directly on deep link with 0 in-app depth
      resetInAppNavigationDepth();
      mockWindow.location = new URL('http://localhost:3000/plans/plan-deep');
      mockWindow.history.length = 1;

      expect(getInAppNavigationDepth()).toBe(0);
      navigateBack({ tab: 'home' });

      // Must safely fallback via navigateToRoute to /home without history.back crash
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        { tab: 'home' },
        '',
        '/home'
      );
    });

    it('Scenario 5: Modal / bottom sheet Back dismisses overlay before leaving screen', async () => {
      const { registerDismissibleOverlay, getOpenOverlayCount } = await import('../appRouter');
      mockWindow.location = new URL('http://localhost:3000/plans/plan-101');

      let isDismissed = false;
      const unregister = registerDismissibleOverlay('test-bottom-sheet', () => {
        isDismissed = true;
      });

      expect(getOpenOverlayCount()).toBe(1);

      // Back action must dismiss the overlay first
      navigateBack({ tab: 'home' });
      expect(isDismissed).toBe(true);

      // Clean unregister
      unregister();
      expect(getOpenOverlayCount()).toBe(0);
    });

    it('Scenario 6: Tab switching uses replace: true preserving clean Home root', () => {
      mockWindow.location = new URL('http://localhost:3000/home');

      // Switch to plans with replace
      navigateToRoute({ tab: 'plans' }, { replace: true });
      expect(mockWindow.history.replaceState).toHaveBeenCalledWith({ tab: 'plans' }, '', '/plans');

      // Switch to profile with replace
      navigateToRoute({ tab: 'profile' }, { replace: true });
      expect(mockWindow.history.replaceState).toHaveBeenCalledWith({ tab: 'profile' }, '', '/profile');

      // Switch back to home with replace
      navigateToRoute({ tab: 'home' }, { replace: true });
      expect(mockWindow.history.replaceState).toHaveBeenCalledWith({ tab: 'home' }, '', '/home');
      expect(getInAppNavigationDepth()).toBe(0);
    });

    it('Scenario 7: Unified semantics between gesture, system button, and in-app button', () => {
      mockWindow.location = new URL('http://localhost:3000/home');
      navigateToRoute({ tab: 'home', subScreen: 'friends' });
      expect(mockWindow.location.pathname).toBe('/friends');
      expect(getInAppNavigationDepth()).toBe(1);

      // In-app back calls history.back
      navigateBack({ tab: 'home' });
      expect(mockWindow.history.back).toHaveBeenCalled();

      // System back fires popstate
      mockWindow.location = new URL('http://localhost:3000/home');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });
    });

    it('Scenario 8: On root Home, canGoBack returns false allowing platform-native exit', async () => {
      const { canGoBack } = await import('../appRouter');
      resetInAppNavigationDepth();
      mockWindow.location = new URL('http://localhost:3000/home');
      mockWindow.history.length = 1;

      expect(canGoBack()).toBe(false);
    });

    it('Scenario 9: Auth and session restoration with invite token parsing preserved', () => {
      mockWindow.location = new URL('http://localhost:3000/join/sample-invite-token');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'home',
        inviteToken: 'sample-invite-token',
      });
      expect(getRoutePath(route)).toBe('/join/sample-invite-token');
    });

    it('Scenario 10: Rapidly trigger Back is guarded against crashes and duplicate pops', () => {
      mockWindow.location = new URL('http://localhost:3000/home');
      navigateToRoute({ tab: 'sports' });

      // Trigger multiple backs rapidly in sequence
      navigateBack({ tab: 'home' });
      navigateBack({ tab: 'home' });
      navigateBack({ tab: 'home' });

      expect(mockWindow.history.back).toHaveBeenCalled();
    });
  });
});
