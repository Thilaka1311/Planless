import React, { useEffect, useRef } from 'react';

export type AppTab =
  | 'home'
  | 'plans'
  | 'create'
  | 'chats'
  | 'wallet'
  | 'profile'
  | 'sports'
  | 'dining'
  | 'movies'
  | 'activities';

export type CreatePhase = 'category' | 'who' | 'who-actually' | 'when' | 'review' | 'confirmation';
export type DiscoveryCategory = 'sports' | 'dining' | 'movies' | 'activities';

export type SubScreen =
  | 'master-search'
  | 'quick-plans'
  | 'friends'
  | 'hosted-plans'
  | 'past-plans'
  | 'search-plans';

export interface AppRoute {
  tab: AppTab;
  createPhase?: CreatePhase;
  discoveryCategory?: DiscoveryCategory | null;
  subScreen?: SubScreen | null;
  selectedPlanId?: string | null;
  selectedChatPlanId?: string | null;
  inviteToken?: string | null;
}

// Track in-app navigation depth so in-screen back buttons and system back share identical semantics.
let inAppNavigationDepth = 0;

export function getInAppNavigationDepth(): number {
  return inAppNavigationDepth;
}

export function resetInAppNavigationDepth(): void {
  inAppNavigationDepth = 0;
  lastBackTriggerTime = 0;
  resetOverlayStack();
}

/**
 * Dismissible Overlay Management
 * Allows bottom sheets, dialogs, and overlays to intercept the back action
 * before navigating away from the underlying screen or exiting.
 */
export interface DismissibleOverlay {
  id: string;
  dismiss: () => void;
  priority?: number;
}

let overlayStack: DismissibleOverlay[] = [];
let isPoppingDismissedOverlay = false;

export function getOpenOverlayCount(): number {
  return overlayStack.length;
}

export function resetOverlayStack(): void {
  overlayStack = [];
  isPoppingDismissedOverlay = false;
}

export function dismissTopOverlay(): boolean {
  if (overlayStack.length === 0) return false;
  const top = overlayStack[overlayStack.length - 1];
  top.dismiss();
  return true;
}

export function registerDismissibleOverlay(
  id: string,
  dismiss: () => void,
  priority = 0
): () => void {
  if (typeof window === 'undefined') return () => {};

  const existingIndex = overlayStack.findIndex((o) => o.id === id);
  if (existingIndex !== -1) {
    overlayStack[existingIndex].dismiss = dismiss;
    overlayStack[existingIndex].priority = priority;
    return () => {
      const idx = overlayStack.findIndex((o) => o.id === id);
      if (idx !== -1) overlayStack.splice(idx, 1);
    };
  }

  const entry: DismissibleOverlay = { id, dismiss, priority };
  overlayStack.push(entry);

  // Push an overlay state marker into window.history so Android system back pops this overlay first
  try {
    const currentRoute = parseCurrentRoute();
    window.history.pushState(
      { ...currentRoute, __isPlanlessOverlay: true, __overlayId: id },
      '',
      window.location.href
    );
    inAppNavigationDepth++;
  } catch {
    // Ignore pushState failures in restricted environments
  }

  let isUnregistered = false;
  return () => {
    if (isUnregistered) return;
    isUnregistered = true;

    const idx = overlayStack.findIndex((o) => o.id === id);
    if (idx !== -1) {
      overlayStack.splice(idx, 1);
    }

    // If this overlay is the active entry on history, pop it so history stack remains clean
    try {
      if (
        typeof window !== 'undefined' &&
        window.history.state?.__isPlanlessOverlay &&
        window.history.state?.__overlayId === id
      ) {
        isPoppingDismissedOverlay = true;
        window.history.back();
      }
    } catch {
      // Ignore history.back() failures
    }
  };
}

function isInsideReactRender(): boolean {
  try {
    const internals19 = (React as any)?.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    if (internals19) {
      return Boolean(internals19.H);
    }
    const internals18 = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    if (internals18?.ReactCurrentDispatcher) {
      return Boolean(internals18.ReactCurrentDispatcher.current);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * React hook to register any dismissible overlay (bottom sheet, modal, dialog)
 * with the unified back-navigation system.
 */
export function useDismissibleOverlay(
  isOpen: boolean,
  onClose: () => void,
  overlayId?: string
): void {
  if (!isInsideReactRender()) return;

  const idRef = useRef(overlayId || '');
  if (!idRef.current) {
    idRef.current = `overlay-${Math.random().toString(36).substring(2, 9)}`;
  }
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerDismissibleOverlay(idRef.current, () => {
      onCloseRef.current();
    });

    return unregister;
  }, [isOpen]);
}

/**
 * Checks whether the current navigator can navigate backward in the application history.
 */
export function canGoBack(): boolean {
  if (typeof window === 'undefined') return false;
  return overlayStack.length > 0 || (inAppNavigationDepth > 0 && window.history.length > 1);
}

/**
 * Checks if a given pathname corresponds to a recognized, valid Planless application route.
 */
export function isValidRoute(pathname: string): boolean {
  if (!pathname) return false;
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/home') return true;
  if (clean === '/friends') return true;
  if (clean === '/create' || clean.startsWith('/create/')) return true;
  if (clean === '/search' || clean === '/quick-plans') return true;
  if (clean === '/sports' || clean === '/dining' || clean === '/movies' || clean === '/activities') return true;
  if (clean === '/plans' || clean.startsWith('/plans/') || clean.startsWith('/plan/')) return true;
  if (clean === '/chats' || clean.startsWith('/chats/') || clean.startsWith('/chat/')) return true;
  if (clean === '/profile' || clean === '/wallet') return true;
  if (clean.startsWith('/join/')) return true;
  return false;
}

/**
 * Parses current URL pathname and query into an AppRoute.
 */
export function parseCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') {
    return { tab: 'home' };
  }

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 0 || parts[0] === 'home') {
    return { tab: 'home' };
  }

  const primary = parts[0].toLowerCase();

  // Top-level friends route: /friends
  if (primary === 'friends') {
    return { tab: 'home', subScreen: 'friends' };
  }

  // Top-level search / quick-plans routes
  if (primary === 'search') {
    return { tab: 'create', subScreen: 'master-search' };
  }
  if (primary === 'quick-plans') {
    return { tab: 'create', subScreen: 'quick-plans' };
  }

  // Top-level discovery categories: /sports, /dining, /movies, /activities
  if (primary === 'sports' || primary === 'dining' || primary === 'movies' || primary === 'activities') {
    return { tab: primary as AppTab, discoveryCategory: primary as DiscoveryCategory };
  }

  // Create flow: /create, /create/who, /create/participants, /create/when, /create/review, /create/confirmation
  if (primary === 'create') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'search' || sub === 'master-search') {
      return { tab: 'create', subScreen: 'master-search' };
    }
    if (sub === 'quick-plans') {
      return { tab: 'create', subScreen: 'quick-plans' };
    }
    // Sub-routes for discovery categories under create
    if (sub === 'sports' || sub === 'dining' || sub === 'movies' || sub === 'activities') {
      return { tab: sub as AppTab, discoveryCategory: sub as DiscoveryCategory };
    }

    let createPhase: CreatePhase = 'category';
    if (sub === 'who' || sub === 'friends') {
      createPhase = 'who';
    } else if (sub === 'participants' || sub === 'who-actually' || sub === 'who-was-actually-coming') {
      createPhase = 'who-actually';
    } else if (sub === 'when' || sub === 'time' || sub === 'date') {
      createPhase = 'when';
    } else if (sub === 'review') {
      createPhase = 'review';
    } else if (sub === 'confirmation' || sub === 'done') {
      createPhase = 'confirmation';
    }
    return { tab: 'create', createPhase };
  }

  // Plans: /plans, /plans/hosted, /plans/past, /plans/search, /plans/:id, /plans/:id/chat, /plan/:id
  if (primary === 'plans' || primary === 'plan') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'hosted') {
      return { tab: 'plans', subScreen: 'hosted-plans' };
    }
    if (sub === 'past') {
      return { tab: 'plans', subScreen: 'past-plans' };
    }
    if (sub === 'search') {
      return { tab: 'plans', subScreen: 'search-plans' };
    }
    const rawParam = parts[1] || null;
    const planId = rawParam ? decodeURIComponent(rawParam) : null;
    const sub2 = (parts[2] || '').toLowerCase();
    if (sub2 === 'chat') {
      return { tab: 'plans', selectedPlanId: planId, selectedChatPlanId: planId };
    }
    return { tab: 'plans', selectedPlanId: planId };
  }

  // Chats: /chats, /chats/:id, /chat/:id
  if (primary === 'chats' || primary === 'chat') {
    const chatPlanId = parts[1] || null;
    return { tab: 'chats', selectedChatPlanId: chatPlanId };
  }

  // Shared plan invite: /join/:token
  if (primary === 'join') {
    const rawParam = parts[1] || null;
    const inviteToken = rawParam ? decodeURIComponent(rawParam).trim() || null : null;
    return { tab: 'home', inviteToken };
  }

  // Wallet: /wallet
  if (primary === 'wallet') {
    return { tab: 'wallet' };
  }

  // Profile: /profile, /profile/friends, /profile/past
  if (primary === 'profile') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'friends') return { tab: 'profile', subScreen: 'friends' };
    if (sub === 'past') return { tab: 'profile', subScreen: 'past-plans' };
    return { tab: 'profile' };
  }

  return { tab: 'home' };
}

/**
 * Converts an AppRoute to a canonical pathname.
 */
export function getRoutePath(route: AppRoute): string {
  if (route.inviteToken) {
    return `/join/${encodeURIComponent(route.inviteToken)}`;
  }

  if (route.subScreen === 'friends') {
    return '/friends';
  }
  if (route.subScreen === 'hosted-plans') {
    return '/plans/hosted';
  }
  if (route.subScreen === 'past-plans') {
    return '/plans/past';
  }
  if (route.subScreen === 'search-plans') {
    return '/plans/search';
  }

  // Nested Plan chat route: /plans/:id/chat
  if (route.selectedPlanId && route.selectedChatPlanId) {
    return `/plans/${encodeURIComponent(route.selectedPlanId)}/chat`;
  }

  // Dedicated discovery category routes under create: /create/sports, /create/dining, /create/movies, /create/activities
  if (route.discoveryCategory) {
    return `/create/${route.discoveryCategory}`;
  }
  if (route.tab === 'sports') return '/create/sports';
  if (route.tab === 'dining') return '/create/dining';
  if (route.tab === 'movies') return '/create/movies';
  if (route.tab === 'activities') return '/create/activities';

  // Plan detail route
  if (route.selectedPlanId) {
    return `/plans/${encodeURIComponent(route.selectedPlanId)}`;
  }

  if (route.tab === 'create') {
    if (route.subScreen === 'master-search') return '/create/search';
    if (route.subScreen === 'quick-plans') return '/create/quick-plans';
    if (!route.createPhase || route.createPhase === 'category') return '/create';
    if (route.createPhase === 'who') return '/create/who';
    if (route.createPhase === 'who-actually') return '/create/participants';
    if (route.createPhase === 'when') return '/create/when';
    if (route.createPhase === 'review') return '/create/review';
    if (route.createPhase === 'confirmation') return '/create/confirmation';
    return '/create';
  }

  if (route.tab === 'plans') {
    return '/plans';
  }

  if (route.tab === 'chats') {
    if (route.selectedChatPlanId) return `/chats/${encodeURIComponent(route.selectedChatPlanId)}`;
    return '/chats';
  }

  if (route.tab === 'wallet') return '/wallet';
  if (route.tab === 'profile') return '/profile';

  return '/home';
}

/**
 * Navigates to a route, preserving existing query search parameters.
 */
export function navigateToRoute(route: AppRoute, options?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return;

  const targetPath = getRoutePath(route);
  const currentSearch = window.location.search || '';
  const fullTarget = targetPath + currentSearch;
  const currentFull = window.location.pathname + currentSearch;

  if (currentFull !== fullTarget) {
    if (options?.replace) {
      window.history.replaceState(route, '', fullTarget);
    } else {
      window.history.pushState(route, '', fullTarget);
      inAppNavigationDepth++;
    }
  }

  // If navigating to root home, reset depth so Home acts as root exit destination
  if (route.tab === 'home' && !route.selectedPlanId && !route.subScreen && !route.inviteToken) {
    inAppNavigationDepth = 0;
  }

  // Dispatch custom event so listeners can synchronize state immediately
  window.dispatchEvent(new CustomEvent('planless-navigation', { detail: route }));
}

let lastBackTriggerTime = 0;

/**
 * Smart unified back navigation:
 * 1. Dismisses the topmost active modal/bottom sheet if any is open.
 * 2. Uses browser history back if in-app history exists.
 * 3. Falls back safely to specified fallback destination (defaults to root Home).
 */
export function navigateBack(fallbackRoute: AppRoute = { tab: 'home' }): void {
  if (typeof window === 'undefined') return;

  // Debounce rapid back taps (< 100ms) to prevent race conditions or duplicate history popping
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (!isTest) {
    const now = Date.now();
    if (now - lastBackTriggerTime < 100) return;
    lastBackTriggerTime = now;
  }

  // 1. If an overlay/bottom sheet is active, dismiss the topmost overlay first
  if (overlayStack.length > 0) {
    dismissTopOverlay();
    return;
  }

  // 2. If valid in-app history exists, pop it
  if (inAppNavigationDepth > 0 && window.history.length > 1) {
    window.history.back();
  } else {
    // 3. Fallback safely to specified destination
    navigateToRoute(fallbackRoute);
  }
}

/**
 * Centralized subscriber registry for navigation events.
 * Uses a single listener on window to avoid duplicate, overlapping handlers.
 */
const subscribers = new Set<(route: AppRoute) => void>();
let isGlobalPopStateListening = false;

function setupGlobalNavigationListener(): void {
  if (isGlobalPopStateListening || typeof window === 'undefined') return;
  isGlobalPopStateListening = true;

  const handlePopState = () => {
    // If pop was triggered by in-app overlay dismissal cleanup, do not navigate route
    if (isPoppingDismissedOverlay) {
      isPoppingDismissedOverlay = false;
      if (inAppNavigationDepth > 0) {
        inAppNavigationDepth--;
      }
      return;
    }

    // If an overlay was active when system back was pressed, dismiss it first
    if (overlayStack.length > 0) {
      const top = overlayStack.pop();
      if (inAppNavigationDepth > 0) {
        inAppNavigationDepth--;
      }
      if (top) {
        top.dismiss();
      }
      return;
    }

    if (inAppNavigationDepth > 0) {
      inAppNavigationDepth--;
    }

    const currentRoute = parseCurrentRoute();
    subscribers.forEach((cb) => {
      try {
        cb(currentRoute);
      } catch (err) {
        console.error('[appRouter] subscriber error on popstate:', err);
      }
    });
  };

  const handleCustomNav = (e: Event) => {
    const customEvent = e as CustomEvent<AppRoute>;
    const route = customEvent.detail || parseCurrentRoute();
    subscribers.forEach((cb) => {
      try {
        cb(route);
      } catch (err) {
        console.error('[appRouter] subscriber error on customNav:', err);
      }
    });
  };

  window.addEventListener('popstate', handlePopState);
  window.addEventListener('planless-navigation', handleCustomNav);
}

/**
 * Subscribes to browser history (popstate) and internal route navigation events.
 */
export function listenToNavigation(callback: (route: AppRoute) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  setupGlobalNavigationListener();
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}
