import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCurrentRoute,
  getRoutePath,
  navigateToRoute,
  navigateBack,
  listenToNavigation,
  resetInAppNavigationDepth,
  getInAppNavigationDepth,
  registerDismissibleOverlay,
  AppRoute,
} from '../appRouter';

describe('Chat to Plan Preview Back Navigation Suite', () => {
  let originalWindow: any;
  let listeners: Record<string, Function[]> = {};
  let mockWindow: any;
  let historyStack: Array<{ state: any; url: string }>;
  let historyIndex: number;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetInAppNavigationDepth();
    listeners = {};
    historyStack = [{ state: { tab: 'home' }, url: 'http://localhost:3000/home' }];
    historyIndex = 0;

    mockWindow = {
      location: new URL(historyStack[0].url),
      history: {
        get length() {
          return historyStack.length;
        },
        get state() {
          return historyStack[historyIndex]?.state ?? null;
        },
        pushState: vi.fn((state, _title, url) => {
          const resolvedUrl = new URL(url, 'http://localhost:3000').href;
          // Truncate any forward history when pushing
          historyStack = historyStack.slice(0, historyIndex + 1);
          historyStack.push({ state, url: resolvedUrl });
          historyIndex = historyStack.length - 1;
          mockWindow.location = new URL(resolvedUrl);
        }),
        replaceState: vi.fn((state, _title, url) => {
          const resolvedUrl = new URL(url, 'http://localhost:3000').href;
          historyStack[historyIndex] = { state, url: resolvedUrl };
          mockWindow.location = new URL(resolvedUrl);
        }),
        back: vi.fn(() => {
          if (historyIndex > 0) {
            historyIndex--;
            const previous = historyStack[historyIndex];
            mockWindow.location = new URL(previous.url);
            // Simulate popstate event to subscribers
            const popEvent = new (globalThis as any).PopStateEvent('popstate', { state: previous.state });
            (listeners['popstate'] || []).forEach((h) => h(popEvent));
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
      state: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.state = init?.state;
      }
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('Scenario 1: Open Chats -> open Mandaadi chat -> open Plan Preview -> Back returns to Mandaadi chat', () => {
    // 1. User starts at Chats tab (/chats)
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // 2. Open Mandaadi chat
    navigateToRoute({
      tab: 'chats',
      selectedChatPlanId: 'mandaadi-123',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/mandaadi-123');
    expect(historyStack.length).toBe(2);
    expect(getInAppNavigationDepth()).toBe(1);

    // 3. Navigate from Mandaadi chat to its Plan Preview screen
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'mandaadi-123',
      originTab: 'chats',
      originChatPlanId: 'mandaadi-123',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/plans/mandaadi-123');
    expect(historyStack.length).toBe(3);
    expect(getInAppNavigationDepth()).toBe(2);

    // 4. Press Back from Plan Preview -> Must return directly to Mandaadi chat!
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'mandaadi-123',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.history.back).toHaveBeenCalled();
    expect(mockWindow.location.pathname).toBe('/chats/mandaadi-123');
    const routeAfterBack = parseCurrentRoute();
    expect(routeAfterBack.selectedChatPlanId).toBe('mandaadi-123');
    expect(routeAfterBack.tab).toBe('chats');

    // 5. Subsequent Back from Mandaadi chat -> returns to main Chats screen
    navigateBack({ tab: 'chats' });
    expect(mockWindow.location.pathname).toBe('/chats');
    expect(parseCurrentRoute().tab).toBe('chats');
    expect(parseCurrentRoute().selectedChatPlanId).toBeFalsy();
  });

  it('Scenario 2: Open a different plan chat -> open Plan Preview -> Back returns to that exact chat', () => {
    // 1. User starts at Chats tab
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // 2. Open Football Turf chat
    navigateToRoute({
      tab: 'chats',
      selectedChatPlanId: 'football-turf-456',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/football-turf-456');

    // 3. Open Plan Preview from Football Turf chat
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'football-turf-456',
      originTab: 'chats',
      originChatPlanId: 'football-turf-456',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/plans/football-turf-456');

    // 4. Press Back from Plan Preview
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'football-turf-456',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/football-turf-456');
    expect(parseCurrentRoute().selectedChatPlanId).toBe('football-turf-456');
  });

  it('Scenario 3: Open Plan Preview from Main Chats directly -> Back returns to Main Chats', () => {
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // Direct entry from main chats screen into Plan Preview (without opening chat first)
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'plan-direct-789',
      originTab: 'chats',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/plan-direct-789');

    // Press Back from Plan Preview -> Returns to Main Chats
    navigateBack({ tab: 'chats' });
    expect(mockWindow.location.pathname).toBe('/chats');
    expect(parseCurrentRoute().tab).toBe('chats');
  });

  it('Scenario 4: Open Plan Preview from Discovery, Home, and Plans -> Back returns to correct origin', () => {
    // Test Home
    mockWindow.location = new URL('http://localhost:3000/home');
    historyStack = [{ state: { tab: 'home' }, url: 'http://localhost:3000/home' }];
    historyIndex = 0;
    resetInAppNavigationDepth();

    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'home-plan-1',
      originTab: 'home',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/home-plan-1');
    navigateBack({ tab: 'home' });
    expect(mockWindow.location.pathname).toBe('/home');

    // Test Discovery (dining)
    mockWindow.location = new URL('http://localhost:3000/create/dining');
    historyStack = [{ state: { tab: 'dining' }, url: 'http://localhost:3000/create/dining' }];
    historyIndex = 0;
    resetInAppNavigationDepth();

    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'dining-plan-2',
      originTab: 'dining',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/dining-plan-2');
    navigateBack({ tab: 'dining' });
    expect(mockWindow.location.pathname).toBe('/create/dining');

    // Test Plans
    mockWindow.location = new URL('http://localhost:3000/plans');
    historyStack = [{ state: { tab: 'plans' }, url: 'http://localhost:3000/plans' }];
    historyIndex = 0;
    resetInAppNavigationDepth();

    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'plans-feed-3',
      originTab: 'plans',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/plans-feed-3');
    navigateBack({ tab: 'plans' });
    expect(mockWindow.location.pathname).toBe('/plans');
  });

  it('Scenario 5: Navigate repeatedly between individual chat and its Plan Preview without navigation loops', () => {
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // Open chat
    navigateToRoute({
      tab: 'chats',
      selectedChatPlanId: 'loop-test-plan',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(2);

    // Toggle 1: Chat -> Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'loop-test-plan',
      originTab: 'chats',
      originChatPlanId: 'loop-test-plan',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(3);

    // Toggle 2: Preview -> Back to Chat
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'loop-test-plan',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/loop-test-plan');

    // Toggle 3: Chat -> Preview again
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'loop-test-plan',
      originTab: 'chats',
      originChatPlanId: 'loop-test-plan',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(3); // Overwrites forward entry, remains cleanly bounded

    // Toggle 4: Preview -> Back to Chat
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'loop-test-plan',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/loop-test-plan');

    // Finally, back to Main Chats
    navigateBack({ tab: 'chats' });
    expect(mockWindow.location.pathname).toBe('/chats');
    expect(parseCurrentRoute().tab).toBe('chats');
  });

  it('Scenario 6: Dismissible overlay dismisses before leaving Plan Preview or Plan Chat', () => {
    mockWindow.location = new URL('http://localhost:3000/chats/mandaadi');
    historyStack = [{ state: { tab: 'chats', selectedChatPlanId: 'mandaadi' }, url: 'http://localhost:3000/chats/mandaadi' }];
    historyIndex = 0;

    // Navigate to Plan Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'mandaadi',
      originTab: 'chats',
      originChatPlanId: 'mandaadi',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/plans/mandaadi');

    // Open an action sheet/overlay on top of Plan Preview
    const dismissOverlay = vi.fn();
    const unregister = registerDismissibleOverlay('plan-action-sheet', dismissOverlay);

    // Press Back: Must dismiss the overlay first without navigating away from Plan Preview
    navigateBack({ tab: 'chats', selectedChatPlanId: 'mandaadi' });
    expect(dismissOverlay).toHaveBeenCalled();
    expect(mockWindow.location.pathname).toBe('/plans/mandaadi');

    // Clean up overlay
    unregister();

    // Next Back: Returns to the chat
    navigateBack({ tab: 'chats', selectedChatPlanId: 'mandaadi' });
    expect(mockWindow.location.pathname).toBe('/chats/mandaadi');
  });
});
