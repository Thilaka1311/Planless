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

describe('Plan Chat ↔ Plan Preview Navigation Loop Prevention', () => {
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

  it('Flow A: Home -> Plan Preview -> Plan Chat -> Back returns to Plan Preview', () => {
    // 1. User starts at Home
    mockWindow.location = new URL('http://localhost:3000/home');
    historyStack = [{ state: { tab: 'home' }, url: 'http://localhost:3000/home' }];
    historyIndex = 0;

    // 2. User opens Plan Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'test-plan-1',
      originTab: 'home',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-1');
    expect(mockWindow.history.state.originTab).toBe('home');
    expect(mockWindow.history.state.entryPoint).toBe('preview');
    expect(getInAppNavigationDepth()).toBe(1);

    // 3. User opens Plan Chat from Plan Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'test-plan-1',
      selectedChatPlanId: 'test-plan-1',
      originTab: 'home',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-1/chat');
    expect(getInAppNavigationDepth()).toBe(2);

    // 4. User presses Back from Plan Chat -> returns to Plan Preview
    navigateBack({
      tab: 'plans',
      selectedPlanId: 'test-plan-1',
      originTab: 'home',
      entryPoint: 'preview',
    });
    expect(mockWindow.history.back).toHaveBeenCalled();
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-1');
    const route = parseCurrentRoute();
    expect(route.selectedPlanId).toBe('test-plan-1');
    expect(route.originTab).toBe('home');

    // 5. User presses Back from Plan Preview -> returns to Home
    navigateBack({ tab: 'home' });
    expect(mockWindow.location.pathname).toBe('/home');
    expect(parseCurrentRoute().tab).toBe('home');
  });

  it('Flow B: Main Chat -> Plan Chat -> Plan Preview -> Back returns to specific Plan Chat', () => {
    // 1. User starts at Main Chat (/chats)
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // 2. User opens Plan Chat from Main Chat
    navigateToRoute({
      tab: 'chats',
      selectedChatPlanId: 'test-plan-2',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/test-plan-2');
    expect(historyStack.length).toBe(2);
    expect(getInAppNavigationDepth()).toBe(1);

    // 3. User navigates from Plan Chat to Plan Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'test-plan-2',
      originTab: 'chats',
      originChatPlanId: 'test-plan-2',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-2');
    expect(historyStack.length).toBe(3);
    expect(getInAppNavigationDepth()).toBe(2);

    // 4. User presses Back on Plan Preview -> returns directly to the specific Plan Chat!
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'test-plan-2',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.history.back).toHaveBeenCalled();
    expect(mockWindow.location.pathname).toBe('/chats/test-plan-2');
    expect(parseCurrentRoute().selectedChatPlanId).toBe('test-plan-2');

    // 5. User presses Back on Plan Chat -> returns to Main Chat!
    navigateBack({ tab: 'chats' });
    expect(mockWindow.location.pathname).toBe('/chats');
    expect(parseCurrentRoute().tab).toBe('chats');
  });

  it('Repeated toggling between Plan Chat and Plan Preview does NOT accumulate duplicate screens or loops', () => {
    // Flow B toggle cycle
    mockWindow.location = new URL('http://localhost:3000/chats');
    historyStack = [{ state: { tab: 'chats' }, url: 'http://localhost:3000/chats' }];
    historyIndex = 0;

    // Enter Plan Chat
    navigateToRoute({
      tab: 'chats',
      selectedChatPlanId: 'test-plan-3',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(2);

    // Toggle 1: Plan Chat -> Plan Preview
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'test-plan-3',
      originTab: 'chats',
      originChatPlanId: 'test-plan-3',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(3);
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-3');

    // Toggle 2: Plan Preview -> Plan Chat (returning to existing chat pops back)
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'test-plan-3',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(3); // History length is 3 but index is 1
    expect(mockWindow.location.pathname).toBe('/chats/test-plan-3');

    // Toggle 3: Plan Chat -> Plan Preview (re-opening details pushes to index 2, truncating any forward stack)
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'test-plan-3',
      originTab: 'chats',
      originChatPlanId: 'test-plan-3',
      entryPoint: 'chat',
    });
    expect(historyStack.length).toBe(3);
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-3');

    // Back from Plan Preview returns directly to the specific Plan Chat
    navigateBack({
      tab: 'chats',
      selectedChatPlanId: 'test-plan-3',
      originTab: 'chats',
      entryPoint: 'chat',
    });
    expect(mockWindow.location.pathname).toBe('/chats/test-plan-3');
    expect(parseCurrentRoute().selectedChatPlanId).toBe('test-plan-3');

    // Back from Plan Chat returns directly to Main Chat
    navigateBack({ tab: 'chats' });
    expect(mockWindow.location.pathname).toBe('/chats');
    expect(parseCurrentRoute().tab).toBe('chats');
  });

  it('Flow C: Preserves origin major screen (Discovery / Dining -> Plan Preview -> Back)', () => {
    // 1. User starts at Dining category
    mockWindow.location = new URL('http://localhost:3000/create/dining');
    historyStack = [{ state: { tab: 'dining' }, url: 'http://localhost:3000/create/dining' }];
    historyIndex = 0;

    // 2. User opens Plan from dining
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'dining-plan-1',
      originTab: 'dining',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/dining-plan-1');
    expect(mockWindow.history.state.originTab).toBe('dining');

    // 3. User closes Plan Preview -> returns directly to dining
    navigateBack({ tab: 'dining' });
    expect(mockWindow.location.pathname).toBe('/create/dining');
    expect(parseCurrentRoute().tab).toBe('dining');
  });

  it('Flow C: Preserves origin major screen (Profile -> Plan Preview -> Back)', () => {
    // 1. User starts at Profile
    mockWindow.location = new URL('http://localhost:3000/profile');
    historyStack = [{ state: { tab: 'profile' }, url: 'http://localhost:3000/profile' }];
    historyIndex = 0;

    // 2. User opens Plan from Profile
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'profile-plan-1',
      originTab: 'profile',
      entryPoint: 'preview',
    });
    expect(mockWindow.location.pathname).toBe('/plans/profile-plan-1');
    expect(mockWindow.history.state.originTab).toBe('profile');

    // 3. User closes Plan Preview -> returns directly to profile
    navigateBack({ tab: 'profile' });
    expect(mockWindow.location.pathname).toBe('/profile');
    expect(parseCurrentRoute().tab).toBe('profile');
  });

  it('Modals and bottom sheets dismiss before navigating away from underlying screen', () => {
    mockWindow.location = new URL('http://localhost:3000/home');
    historyStack = [{ state: { tab: 'home' }, url: 'http://localhost:3000/home' }];
    historyIndex = 0;

    // 1. Enter plan screen
    navigateToRoute({ tab: 'plans', selectedPlanId: 'test-plan-modal' });
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-modal');
    expect(getInAppNavigationDepth()).toBe(1);

    const dismissModal = vi.fn();
    // 2. Open and register dismissible overlay on top of screen
    const unregister = registerDismissibleOverlay('test-settings-overlay', dismissModal);

    // 3. Trigger back: should dismiss the modal first without navigating away from plan
    navigateBack({ tab: 'home' });
    expect(dismissModal).toHaveBeenCalled();
    expect(mockWindow.location.pathname).toBe('/plans/test-plan-modal');

    // Unregister overlay after dismissal (as React cleanup would do)
    unregister();

    // 4. Next back navigates away from the underlying screen to home
    navigateBack({ tab: 'home' });
    expect(mockWindow.location.pathname).toBe('/home');
  });

  it('listenToNavigation reports isPopState: true on browser popstate and false on internal navigateToRoute', () => {
    let lastReportedRoute: AppRoute | null = null;
    let lastIsPopState: boolean | undefined = undefined;

    const unsubscribe = listenToNavigation((route, isPopState) => {
      lastReportedRoute = route;
      lastIsPopState = isPopState;
    });

    // Internal navigation -> isPopState should be false
    navigateToRoute({ tab: 'chats' });
    expect(lastReportedRoute?.tab).toBe('chats');
    expect(lastIsPopState).toBe(false);

    // Browser popstate -> isPopState should be true
    mockWindow.history.back();
    expect(lastIsPopState).toBe(true);

    unsubscribe();
  });

  it('navigateToRoute with replace: true preserves active overlay marker on history.state when route is identical', () => {
    mockWindow.location = new URL('http://localhost:3000/plans/test-plan-overlay');
    historyStack = [{ state: { tab: 'plans', selectedPlanId: 'test-plan-overlay' }, url: 'http://localhost:3000/plans/test-plan-overlay' }];
    historyIndex = 0;

    const dismissModal = vi.fn();
    const unregister = registerDismissibleOverlay('test-bottom-sheet', dismissModal);

    expect(mockWindow.history.state.__isPlanlessOverlay).toBe(true);
    expect(mockWindow.history.state.__overlayId).toBe('test-bottom-sheet');

    // Background synchronization effect runs with identical route
    navigateToRoute(
      { tab: 'plans', selectedPlanId: 'test-plan-overlay' },
      { replace: true }
    );

    // Overlay state should NOT be wiped out
    expect(mockWindow.history.state.__isPlanlessOverlay).toBe(true);
    expect(mockWindow.history.state.__overlayId).toBe('test-bottom-sheet');

    unregister();
  });

  it('Flow B maintains selectedChatPlanId across navigateToRoute calls without wiping chat context', () => {
    mockWindow.location = new URL('http://localhost:3000/chats/chat-plan-99');
    historyStack = [{ state: { tab: 'chats', selectedChatPlanId: 'chat-plan-99' }, url: 'http://localhost:3000/chats/chat-plan-99' }];
    historyIndex = 0;

    // Open plan details from chat
    navigateToRoute({
      tab: 'plans',
      selectedPlanId: 'chat-plan-99',
      selectedChatPlanId: 'chat-plan-99',
      originTab: 'chats',
      originChatPlanId: 'chat-plan-99',
      entryPoint: 'chat',
    });

    expect(mockWindow.history.state.selectedChatPlanId).toBe('chat-plan-99');
    expect(mockWindow.history.state.entryPoint).toBe('chat');
    expect(mockWindow.history.state.originChatPlanId).toBe('chat-plan-99');
  });
});
