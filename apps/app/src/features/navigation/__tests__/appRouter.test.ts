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

describe('appRouter URL and Navigation Architecture', () => {
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

  describe('isValidRoute', () => {
    it('accepts root and home', () => {
      expect(isValidRoute('/')).toBe(true);
      expect(isValidRoute('/home')).toBe(true);
      expect(isValidRoute('/home/')).toBe(true);
    });

    it('accepts create and wizard routes', () => {
      expect(isValidRoute('/create')).toBe(true);
      expect(isValidRoute('/create/who')).toBe(true);
      expect(isValidRoute('/create/participants')).toBe(true);
      expect(isValidRoute('/create/when')).toBe(true);
      expect(isValidRoute('/create/review')).toBe(true);
      expect(isValidRoute('/create/confirmation')).toBe(true);
    });

    it('accepts discovery category screens', () => {
      expect(isValidRoute('/sports')).toBe(true);
      expect(isValidRoute('/dining')).toBe(true);
      expect(isValidRoute('/movies')).toBe(true);
      expect(isValidRoute('/activities')).toBe(true);
    });

    it('accepts plans, chats, profile, wallet, and invites', () => {
      expect(isValidRoute('/plans')).toBe(true);
      expect(isValidRoute('/plans/plan-abc-123')).toBe(true);
      expect(isValidRoute('/plan/plan-abc-123')).toBe(true);
      expect(isValidRoute('/chats')).toBe(true);
      expect(isValidRoute('/chats/plan-xyz')).toBe(true);
      expect(isValidRoute('/profile')).toBe(true);
      expect(isValidRoute('/join/invite_token_123')).toBe(true);
    });

    it('rejects invalid or unknown routes', () => {
      expect(isValidRoute('/invalid-route')).toBe(false);
      expect(isValidRoute('/some/deep/fake/path')).toBe(false);
      expect(isValidRoute('')).toBe(false);
    });
  });

  describe('parseCurrentRoute', () => {
    it('parses / and /home to home tab', () => {
      mockWindow.location = new URL('http://localhost:3000/');
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });

      mockWindow.location = new URL('http://localhost:3000/home');
      expect(parseCurrentRoute()).toEqual({ tab: 'home' });
    });

    it('parses /create and phases', () => {
      mockWindow.location = new URL('http://localhost:3000/create');
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'category' });

      mockWindow.location = new URL('http://localhost:3000/create/who');
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'who' });

      mockWindow.location = new URL('http://localhost:3000/create/when');
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'when' });

      mockWindow.location = new URL('http://localhost:3000/create/review');
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'review' });

      mockWindow.location = new URL('http://localhost:3000/create/confirmation');
      expect(parseCurrentRoute()).toEqual({ tab: 'create', createPhase: 'confirmation' });
    });

    it('parses discovery category screens (/sports, /dining, /movies, /activities)', () => {
      mockWindow.location = new URL('http://localhost:3000/sports');
      expect(parseCurrentRoute()).toEqual({ tab: 'sports', discoveryCategory: 'sports' });

      mockWindow.location = new URL('http://localhost:3000/dining');
      expect(parseCurrentRoute()).toEqual({ tab: 'dining', discoveryCategory: 'dining' });

      mockWindow.location = new URL('http://localhost:3000/movies');
      expect(parseCurrentRoute()).toEqual({ tab: 'movies', discoveryCategory: 'movies' });

      mockWindow.location = new URL('http://localhost:3000/activities');
      expect(parseCurrentRoute()).toEqual({ tab: 'activities', discoveryCategory: 'activities' });
    });

    it('parses /plans and /plans/:id', () => {
      mockWindow.location = new URL('http://localhost:3000/plans');
      expect(parseCurrentRoute()).toEqual({ tab: 'plans', selectedPlanId: null });

      mockWindow.location = new URL('http://localhost:3000/plans/rush-koland-football');
      expect(parseCurrentRoute()).toEqual({ tab: 'plans', selectedPlanId: 'rush-koland-football' });
    });

    it('parses /chats and /chats/:id', () => {
      mockWindow.location = new URL('http://localhost:3000/chats');
      expect(parseCurrentRoute()).toEqual({ tab: 'chats', selectedChatPlanId: null });

      mockWindow.location = new URL('http://localhost:3000/chats/chat-plan-999');
      expect(parseCurrentRoute()).toEqual({ tab: 'chats', selectedChatPlanId: 'chat-plan-999' });
    });

    it('parses /profile and /join/:token', () => {
      mockWindow.location = new URL('http://localhost:3000/profile');
      expect(parseCurrentRoute()).toEqual({ tab: 'profile' });

      mockWindow.location = new URL('http://localhost:3000/join/token123');
      expect(parseCurrentRoute()).toEqual({ tab: 'home', inviteToken: 'token123' });
    });
  });

  describe('getRoutePath', () => {
    it('produces exact URL paths for top-level screens', () => {
      expect(getRoutePath({ tab: 'home' })).toBe('/home');
      expect(getRoutePath({ tab: 'create' })).toBe('/create');
      expect(getRoutePath({ tab: 'sports' })).toBe('/create/sports');
      expect(getRoutePath({ tab: 'dining' })).toBe('/create/dining');
      expect(getRoutePath({ tab: 'movies' })).toBe('/create/movies');
      expect(getRoutePath({ tab: 'activities' })).toBe('/create/activities');
      expect(getRoutePath({ tab: 'plans' })).toBe('/plans');
      expect(getRoutePath({ tab: 'chats' })).toBe('/chats');
      expect(getRoutePath({ tab: 'profile' })).toBe('/profile');
    });

    it('produces exact URL paths for discovery categories via discoveryCategory field', () => {
      expect(getRoutePath({ tab: 'create', discoveryCategory: 'sports' })).toBe('/create/sports');
      expect(getRoutePath({ tab: 'create', discoveryCategory: 'dining' })).toBe('/create/dining');
      expect(getRoutePath({ tab: 'create', discoveryCategory: 'movies' })).toBe('/create/movies');
      expect(getRoutePath({ tab: 'create', discoveryCategory: 'activities' })).toBe('/create/activities');
    });

    it('produces exact paths for detail and wizard screens', () => {
      expect(getRoutePath({ tab: 'create', createPhase: 'who' })).toBe('/create/who');
      expect(getRoutePath({ tab: 'create', createPhase: 'when' })).toBe('/create/when');
      expect(getRoutePath({ tab: 'plans', selectedPlanId: 'p_100' })).toBe('/plans/p_100');
      expect(getRoutePath({ tab: 'chats', selectedChatPlanId: 'c_200' })).toBe('/chats/c_200');
      expect(getRoutePath({ tab: 'home', inviteToken: 'inv_abc' })).toBe('/join/inv_abc');
    });
  });

  describe('navigateToRoute and navigateBack', () => {
    it('updates browser history via pushState and increments in-app depth', () => {
      navigateToRoute({ tab: 'create' });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith({ tab: 'create' }, '', '/create');
      expect(getInAppNavigationDepth()).toBe(1);

      navigateToRoute({ tab: 'sports' });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith({ tab: 'sports' }, '', '/create/sports');
      expect(getInAppNavigationDepth()).toBe(2);
    });

    it('navigateBack calls window.history.back when inAppNavigationDepth > 0', () => {
      navigateToRoute({ tab: 'sports' });
      expect(getInAppNavigationDepth()).toBe(1);
      expect(mockWindow.history.length).toBe(2);

      navigateBack({ tab: 'create' });
      expect(mockWindow.history.back).toHaveBeenCalled();
    });

    it('navigateBack falls back to specified route when inAppNavigationDepth is 0 (direct entry)', () => {
      resetInAppNavigationDepth();
      navigateBack({ tab: 'create' });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith({ tab: 'create' }, '', '/create');
    });

    it('listenToNavigation notifies subscribers on popstate', () => {
      let receivedRoute: any = null;
      const unsubscribe = listenToNavigation((route) => {
        receivedRoute = route;
      });

      mockWindow.location = new URL('http://localhost:3000/dining');
      mockWindow.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));
      expect(receivedRoute).toEqual({ tab: 'dining', discoveryCategory: 'dining' });

      unsubscribe();
    });
  });
});
