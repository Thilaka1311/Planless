import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCurrentRoute,
  getRoutePath,
  isValidRoute,
  navigateToRoute,
  resetInAppNavigationDepth,
  getInAppNavigationDepth,
  getCanonicalPathForAlias,
} from '../appRouter';

describe('Phase 2 & Phase 3: Plans Filter URLs & Alias Canonicalization', () => {
  let originalWindow: any;
  let listeners: Record<string, Function[]> = {};
  let mockWindow: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetInAppNavigationDepth();
    listeners = {};

    mockWindow = {
      location: new URL('http://localhost:3000/home'),
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

  describe('Phase 2: Plans Filter URL encoding & parsing', () => {
    it('parses /plans?filter=waitlisted correctly', () => {
      mockWindow.location = new URL('http://localhost:3000/plans?filter=waitlisted');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: null,
        plansFilter: 'waitlisted',
      });
    });

    it('parses /plans?filter=skipped correctly', () => {
      mockWindow.location = new URL('http://localhost:3000/plans?filter=skipped');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: null,
        plansFilter: 'skipped',
      });
    });

    it('parses /plans?filter=joined correctly', () => {
      mockWindow.location = new URL('http://localhost:3000/plans?filter=joined');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: null,
        plansFilter: 'joined',
      });
    });

    it('parses /plans without query as default root with no plansFilter', () => {
      mockWindow.location = new URL('http://localhost:3000/plans');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: null,
      });
      expect(route.plansFilter).toBeUndefined();
    });

    it('ignores invalid or unknown filter queries on /plans', () => {
      mockWindow.location = new URL('http://localhost:3000/plans?filter=invalid_value');
      const route = parseCurrentRoute();
      expect(route.tab).toBe('plans');
      expect(route.plansFilter).toBeUndefined();
    });

    it('generates canonical paths for plans filter options via getRoutePath', () => {
      expect(getRoutePath({ tab: 'plans', plansFilter: 'waitlisted' })).toBe('/plans?filter=waitlisted');
      expect(getRoutePath({ tab: 'plans', plansFilter: 'skipped' })).toBe('/plans?filter=skipped');
      expect(getRoutePath({ tab: 'plans', plansFilter: 'joined' })).toBe('/plans?filter=joined');
      expect(getRoutePath({ tab: 'plans' })).toBe('/plans');
    });

    it('navigates with replace: true without incrementing in-app navigation depth', () => {
      mockWindow.location = new URL('http://localhost:3000/plans');
      expect(getInAppNavigationDepth()).toBe(0);

      navigateToRoute({ tab: 'plans', plansFilter: 'waitlisted' }, { replace: true });

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        expect.anything(),
        '',
        '/plans?filter=waitlisted'
      );
      expect(getInAppNavigationDepth()).toBe(0);
    });

    it('preserves existing non-filter query parameters when switching plans filter', () => {
      mockWindow.location = new URL('http://localhost:3000/plans?session=abc123xyz');

      navigateToRoute({ tab: 'plans', plansFilter: 'waitlisted' }, { replace: true });

      const lastCall = mockWindow.history.replaceState.mock.calls.at(-1);
      const urlArg = lastCall[2];
      expect(urlArg).toContain('filter=waitlisted');
      expect(urlArg).toContain('session=abc123xyz');
    });
  });

  describe('Phase 3: getCanonicalPathForAlias helper', () => {
    it('canonicalizes top-level discovery categories to /create/:category', () => {
      expect(getCanonicalPathForAlias('/sports')).toBe('/create/sports');
      expect(getCanonicalPathForAlias('/dining')).toBe('/create/dining');
      expect(getCanonicalPathForAlias('/movies')).toBe('/create/movies');
      expect(getCanonicalPathForAlias('/activities')).toBe('/create/activities');
      expect(getCanonicalPathForAlias('/sports/')).toBe('/create/sports');
    });

    it('canonicalizes duplicate profile sub-screens', () => {
      expect(getCanonicalPathForAlias('/profile/friends')).toBe('/friends');
      expect(getCanonicalPathForAlias('/profile/past')).toBe('/plans/past');
      expect(getCanonicalPathForAlias('/profile/edit-name')).toBe('/profile/name');
      expect(getCanonicalPathForAlias('/profile/edit-about')).toBe('/profile/about');
      expect(getCanonicalPathForAlias('/profile/bio')).toBe('/profile/about');
    });

    it('canonicalizes singular prefixes /plan and /chat to plural forms', () => {
      expect(getCanonicalPathForAlias('/plan/football-night')).toBe('/plans/football-night');
      expect(getCanonicalPathForAlias('/plan/football-night/settings')).toBe('/plans/football-night/settings');
      expect(getCanonicalPathForAlias('/chat/football-night')).toBe('/chats/football-night');
    });

    it('canonicalizes create wizard alias steps', () => {
      expect(getCanonicalPathForAlias('/create/who-actually')).toBe('/create/participants');
      expect(getCanonicalPathForAlias('/create/who-was-actually-coming')).toBe('/create/participants');
      expect(getCanonicalPathForAlias('/create/time')).toBe('/create/when');
      expect(getCanonicalPathForAlias('/create/date')).toBe('/create/when');
      expect(getCanonicalPathForAlias('/create/done')).toBe('/create/confirmation');
    });

    it('returns null for already canonical routes', () => {
      expect(getCanonicalPathForAlias('/home')).toBeNull();
      expect(getCanonicalPathForAlias('/plans')).toBeNull();
      expect(getCanonicalPathForAlias('/plans/past')).toBeNull();
      expect(getCanonicalPathForAlias('/friends')).toBeNull();
      expect(getCanonicalPathForAlias('/create')).toBeNull();
      expect(getCanonicalPathForAlias('/create/sports')).toBeNull();
      expect(getCanonicalPathForAlias('/profile')).toBeNull();
      expect(getCanonicalPathForAlias('/profile/name')).toBeNull();
      expect(getCanonicalPathForAlias('/profile/about')).toBeNull();
    });
  });

  describe('Phase 3: Automatic In-Browser Canonicalization via parseCurrentRoute', () => {
    it('automatically replaces state to /create/sports when navigating to /sports', () => {
      mockWindow.location = new URL('http://localhost:3000/sports');

      const route = parseCurrentRoute();

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/create/sports'
      );
      expect(route).toEqual({
        tab: 'sports',
        discoveryCategory: 'sports',
      });
    });

    it('preserves query parameters during alias canonicalization', () => {
      mockWindow.location = new URL('http://localhost:3000/sports?view=grid');

      parseCurrentRoute();

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/create/sports?view=grid'
      );
    });

    it('automatically replaces state to /friends when navigating to /profile/friends', () => {
      mockWindow.location = new URL('http://localhost:3000/profile/friends');

      const route = parseCurrentRoute();

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/friends'
      );
      expect(route.subScreen).toBe('friends');
    });

    it('automatically replaces state to /plans/past when navigating to /profile/past', () => {
      mockWindow.location = new URL('http://localhost:3000/profile/past');

      const route = parseCurrentRoute();

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/plans/past'
      );
      expect(route).toEqual({
        tab: 'plans',
        subScreen: 'past-plans',
      });
    });

    it('automatically replaces state to /plans/:id when navigating to /plan/:id', () => {
      mockWindow.location = new URL('http://localhost:3000/plan/badminton-friday');

      const route = parseCurrentRoute();

      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/plans/badminton-friday'
      );
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: 'badminton-friday',
      });
    });

    it('does NOT call replaceState when the route is already canonical', () => {
      mockWindow.location = new URL('http://localhost:3000/home');
      parseCurrentRoute();
      expect(mockWindow.history.replaceState).not.toHaveBeenCalled();

      mockWindow.location = new URL('http://localhost:3000/create/sports');
      parseCurrentRoute();
      expect(mockWindow.history.replaceState).not.toHaveBeenCalled();

      mockWindow.location = new URL('http://localhost:3000/friends');
      parseCurrentRoute();
      expect(mockWindow.history.replaceState).not.toHaveBeenCalled();
    });
  });
});
