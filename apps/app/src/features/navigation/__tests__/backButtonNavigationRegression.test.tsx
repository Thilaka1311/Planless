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
});
