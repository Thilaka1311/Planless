import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCurrentRoute,
  getRoutePath,
  isValidRoute,
  navigateToRoute,
  navigateBack,
  resetInAppNavigationDepth,
  getInAppNavigationDepth,
} from '../appRouter';

describe('Phase 1: Unrouted Screens URL Architecture & Integration', () => {
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

  describe('1. Plan Settings & Edit Plan Cover Routes', () => {
    it('validates /plans/:planId/settings and /plans/:planId/settings/cover as valid routes', () => {
      expect(isValidRoute('/plans/sunset-trek/settings')).toBe(true);
      expect(isValidRoute('/plans/sunset-trek/settings/cover')).toBe(true);
      expect(isValidRoute('/plans/sunset-trek/settings/image')).toBe(true);
    });

    it('parses /plans/:planId/settings correctly on direct load or refresh', () => {
      mockWindow.location = new URL('http://localhost:3000/plans/sunset-trek/settings');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: 'sunset-trek',
        subScreen: 'plan-settings',
      });
    });

    it('parses /plans/:planId/settings/cover correctly on direct load or refresh', () => {
      mockWindow.location = new URL('http://localhost:3000/plans/sunset-trek/settings/cover');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        selectedPlanId: 'sunset-trek',
        subScreen: 'plan-settings-cover',
      });
    });

    it('serializes routes to canonical URLs', () => {
      expect(
        getRoutePath({
          tab: 'plans',
          selectedPlanId: 'sunset-trek',
          subScreen: 'plan-settings',
        })
      ).toBe('/plans/sunset-trek/settings');

      expect(
        getRoutePath({
          tab: 'plans',
          selectedPlanId: 'sunset-trek',
          subScreen: 'plan-settings-cover',
        })
      ).toBe('/plans/sunset-trek/settings/cover');
    });

    it('navigates to settings and cover with correct browser URL updates', () => {
      navigateToRoute({
        tab: 'plans',
        selectedPlanId: 'sunset-trek',
        subScreen: 'plan-settings',
      });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ subScreen: 'plan-settings' }),
        '',
        '/plans/sunset-trek/settings'
      );

      navigateToRoute({
        tab: 'plans',
        selectedPlanId: 'sunset-trek',
        subScreen: 'plan-settings-cover',
      });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ subScreen: 'plan-settings-cover' }),
        '',
        '/plans/sunset-trek/settings/cover'
      );
    });

    it('supports back navigation from cover back to settings, and settings back to plan preview', () => {
      // Navigate: Plan Preview -> Plan Settings -> Edit Cover
      navigateToRoute({ tab: 'plans', selectedPlanId: 'sunset-trek' });
      navigateToRoute({ tab: 'plans', selectedPlanId: 'sunset-trek', subScreen: 'plan-settings' });
      navigateToRoute({ tab: 'plans', selectedPlanId: 'sunset-trek', subScreen: 'plan-settings-cover' });

      expect(getInAppNavigationDepth()).toBe(3);

      // Back from cover
      navigateBack({ tab: 'plans', selectedPlanId: 'sunset-trek', subScreen: 'plan-settings' });
      expect(mockWindow.history.back).toHaveBeenCalledTimes(1);

      // Back from settings
      navigateBack({ tab: 'plans', selectedPlanId: 'sunset-trek' });
      expect(mockWindow.history.back).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. Cancelled Plans Route', () => {
    it('validates /plans/hosted/cancelled as a valid application route', () => {
      expect(isValidRoute('/plans/hosted/cancelled')).toBe(true);
    });

    it('parses /plans/hosted/cancelled correctly on direct load or refresh', () => {
      mockWindow.location = new URL('http://localhost:3000/plans/hosted/cancelled');
      const route = parseCurrentRoute();
      expect(route).toEqual({
        tab: 'plans',
        subScreen: 'cancelled-plans',
      });
    });

    it('serializes cancelled-plans route to canonical /plans/hosted/cancelled URL', () => {
      expect(
        getRoutePath({
          tab: 'plans',
          subScreen: 'cancelled-plans',
        })
      ).toBe('/plans/hosted/cancelled');
    });

    it('navigates from Hosted Plans to Cancelled Plans with browser history tracking', () => {
      navigateToRoute({ tab: 'plans', subScreen: 'hosted-plans' });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ subScreen: 'hosted-plans' }),
        '',
        '/plans/hosted'
      );

      navigateToRoute({ tab: 'plans', subScreen: 'cancelled-plans' });
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ subScreen: 'cancelled-plans' }),
        '',
        '/plans/hosted/cancelled'
      );
    });
  });

  describe('3. Profile Edit Name and Edit About Routes', () => {
    it('validates /profile/name and /profile/about as valid application routes', () => {
      expect(isValidRoute('/profile/name')).toBe(true);
      expect(isValidRoute('/profile/about')).toBe(true);
    });

    it('parses /profile/name and aliases correctly', () => {
      mockWindow.location = new URL('http://localhost:3000/profile/name');
      expect(parseCurrentRoute()).toEqual({
        tab: 'profile',
        subScreen: 'profile-name',
      });

      mockWindow.location = new URL('http://localhost:3000/profile/edit-name');
      expect(parseCurrentRoute()).toEqual({
        tab: 'profile',
        subScreen: 'profile-name',
      });
    });

    it('parses /profile/about and aliases correctly', () => {
      mockWindow.location = new URL('http://localhost:3000/profile/about');
      expect(parseCurrentRoute()).toEqual({
        tab: 'profile',
        subScreen: 'profile-about',
      });

      mockWindow.location = new URL('http://localhost:3000/profile/edit-about');
      expect(parseCurrentRoute()).toEqual({
        tab: 'profile',
        subScreen: 'profile-about',
      });

      mockWindow.location = new URL('http://localhost:3000/profile/bio');
      expect(parseCurrentRoute()).toEqual({
        tab: 'profile',
        subScreen: 'profile-about',
      });
    });

    it('serializes profile-name and profile-about to canonical URLs', () => {
      expect(
        getRoutePath({
          tab: 'profile',
          subScreen: 'profile-name',
        })
      ).toBe('/profile/name');

      expect(
        getRoutePath({
          tab: 'profile',
          subScreen: 'profile-about',
        })
      ).toBe('/profile/about');
    });

    it('handles opening profile edit screens and navigating back cleanly', () => {
      navigateToRoute({ tab: 'profile' });
      navigateToRoute({ tab: 'profile', subScreen: 'profile-name' });

      expect(mockWindow.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ subScreen: 'profile-name' }),
        '',
        '/profile/name'
      );

      navigateBack({ tab: 'profile' });
      expect(mockWindow.history.back).toHaveBeenCalled();
    });
  });
});
