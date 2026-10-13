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
  | 'search-plans'
  | 'cancelled-plans'
  | 'plan-settings'
  | 'plan-settings-cover'
  | 'profile-name'
  | 'profile-about';

export interface AppRoute {
  tab: AppTab;
  createPhase?: CreatePhase;
  discoveryCategory?: DiscoveryCategory | null;
  subScreen?: SubScreen | null;
  selectedPlanId?: string | null;
  selectedChatPlanId?: string | null;
  inviteToken?: string | null;
  originTab?: AppTab | null;
  originSubScreen?: SubScreen | null;
  entryPoint?: 'preview' | 'chat' | null;
  originChatPlanId?: string | null;
  plansFilter?: PlansFilter | null;
}

export type PlansFilter = 'joined' | 'waitlisted' | 'skipped';

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
  const [cleanPath] = pathname.split('?');
  const clean = cleanPath.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/home') return true;
  if (clean === '/friends') return true;
  if (clean === '/create' || clean.startsWith('/create/')) return true;
  if (clean === '/search' || clean === '/quick-plans') return true;
  if (clean === '/sports' || clean === '/dining' || clean === '/movies' || clean === '/activities') return true;
  if (clean === '/plans' || clean.startsWith('/plans/') || clean.startsWith('/plan/')) return true;
  if (clean === '/chats' || clean.startsWith('/chats/') || clean.startsWith('/chat/')) return true;
  if (clean === '/profile' || clean.startsWith('/profile/') || clean === '/wallet') return true;
  if (clean.startsWith('/join/')) return true;
  return false;
}

/**
 * Parses current URL pathname and query into an AppRoute.
 */
function parseRoutePath(pathname: string, search?: string): AppRoute {
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

  // Plans: /plans, /plans/hosted, /plans/hosted/cancelled, /plans/past, /plans/search, /plans/:id, /plans/:id/settings, /plans/:id/settings/cover, /plans/:id/chat, /plan/:id
  if (primary === 'plans' || primary === 'plan') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'hosted') {
      const sub2 = (parts[2] || '').toLowerCase();
      if (sub2 === 'cancelled') {
        return { tab: 'plans', subScreen: 'cancelled-plans' };
      }
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
    if (sub2 === 'settings') {
      const sub3 = (parts[3] || '').toLowerCase();
      if (sub3 === 'cover' || sub3 === 'image') {
        return { tab: 'plans', selectedPlanId: planId, subScreen: 'plan-settings-cover' };
      }
      return { tab: 'plans', selectedPlanId: planId, subScreen: 'plan-settings' };
    }
    const route: AppRoute = { tab: 'plans', selectedPlanId: planId };
    if (search) {
      const searchParams = new URLSearchParams(search);
      if (!route.selectedPlanId) {
        const queryPlanId = searchParams.get('id') || searchParams.get('planId');
        if (queryPlanId) route.selectedPlanId = decodeURIComponent(queryPlanId);
      }
      const filter = searchParams.get('filter')?.toLowerCase();
      if (filter === 'waitlisted' || filter === 'skipped' || filter === 'joined') {
        route.plansFilter = filter as PlansFilter;
      }
    }
    return route;
  }

  // Chats: /chats, /chats/:id, /chat/:id, /chats?id=:id
  if (primary === 'chats' || primary === 'chat') {
    let chatPlanId = parts[1] || null;
    if (!chatPlanId && search) {
      const searchParams = new URLSearchParams(search);
      const queryChatId = searchParams.get('id') || searchParams.get('planId');
      if (queryChatId) chatPlanId = decodeURIComponent(queryChatId);
    }
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

  // Profile: /profile, /profile/friends, /profile/past, /profile/name, /profile/about
  if (primary === 'profile') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'friends') return { tab: 'profile', subScreen: 'friends' };
    if (sub === 'past') return { tab: 'profile', subScreen: 'past-plans' };
    if (sub === 'name' || sub === 'edit-name') return { tab: 'profile', subScreen: 'profile-name' };
    if (sub === 'about' || sub === 'edit-about' || sub === 'bio') return { tab: 'profile', subScreen: 'profile-about' };
    return { tab: 'profile' };
  }

  return { tab: 'home' };
}

/**
 * Resolves legacy or alternative URL aliases to their single canonical equivalent.
 * Returns null if the given pathname is already canonical or unrecognized.
 */
export function getCanonicalPathForAlias(pathname: string): string | null {
  if (!pathname) return null;
  const [cleanPath] = pathname.split('?');
  const clean = cleanPath.replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const primary = parts[0].toLowerCase();

  // /sports, /dining, /movies, /activities -> /create/:category
  if (primary === 'sports' || primary === 'dining' || primary === 'movies' || primary === 'activities') {
    return `/create/${primary}`;
  }

  // /profile/friends -> /friends
  if (primary === 'profile' && parts[1]?.toLowerCase() === 'friends') {
    return '/friends';
  }

  // /profile/past -> /plans/past
  if (primary === 'profile' && parts[1]?.toLowerCase() === 'past') {
    return '/plans/past';
  }

  // /profile/edit-name -> /profile/name
  if (primary === 'profile' && parts[1]?.toLowerCase() === 'edit-name') {
    return '/profile/name';
  }

  // /profile/edit-about or /profile/bio -> /profile/about
  if (primary === 'profile' && (parts[1]?.toLowerCase() === 'edit-about' || parts[1]?.toLowerCase() === 'bio')) {
    return '/profile/about';
  }

  // /plan/:id -> /plans/:id
  if (primary === 'plan' && parts[1]) {
    const remaining = parts.slice(1).join('/');
    return `/plans/${remaining}`;
  }

  // /chat/:id -> /chats/:id
  if (primary === 'chat' && parts[1]) {
    const remaining = parts.slice(1).join('/');
    return `/chats/${remaining}`;
  }

  // /create legacy aliases
  if (primary === 'create' && parts[1]) {
    const sub = parts[1].toLowerCase();
    if (sub === 'who-actually' || sub === 'who-was-actually-coming') {
      return '/create/participants';
    }
    if (sub === 'time' || sub === 'date') {
      return '/create/when';
    }
    if (sub === 'done') {
      return '/create/confirmation';
    }
  }

  return null;
}

/**
 * Parses current URL pathname and query into an AppRoute, carrying forward history state origin metadata.
 */
export function parseCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') {
    return { tab: 'home' };
  }

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const search = window.location.search || '';

  // Canonicalize known legacy URL aliases via replaceState without polluting history
  const canonicalAlias = getCanonicalPathForAlias(pathname);
  if (canonicalAlias) {
    const fullCanonical = canonicalAlias + search;
    const route = parseRoutePath(canonicalAlias, search);
    try {
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== canonicalAlias &&
        window.history &&
        typeof window.history.replaceState === 'function'
      ) {
        window.history.replaceState(window.history.state, '', fullCanonical);
      }
    } catch {
      // In restricted sandbox or test environments, ignore
    }
    const historyState = (typeof window !== 'undefined' && window.history?.state
      ? window.history.state
      : {}) as Partial<AppRoute>;
    if (historyState.originTab) route.originTab = historyState.originTab;
    if (historyState.originSubScreen !== undefined) route.originSubScreen = historyState.originSubScreen;
    if (historyState.entryPoint) route.entryPoint = historyState.entryPoint;
    if (historyState.originChatPlanId) route.originChatPlanId = historyState.originChatPlanId;
    return route;
  }

  const route = parseRoutePath(pathname, search);

  // Preserve origin context from window.history.state if available
  const historyState = (typeof window !== 'undefined' && window.history?.state
    ? window.history.state
    : {}) as Partial<AppRoute>;
  if (historyState.originTab) {
    route.originTab = historyState.originTab;
  }
  if (historyState.originSubScreen !== undefined) {
    route.originSubScreen = historyState.originSubScreen;
  }
  if (historyState.entryPoint) {
    route.entryPoint = historyState.entryPoint;
  }
  if (historyState.originChatPlanId) {
    route.originChatPlanId = historyState.originChatPlanId;
  }

  return route;
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
  if (route.subScreen === 'cancelled-plans') {
    return '/plans/hosted/cancelled';
  }
  if (route.subScreen === 'past-plans') {
    return '/plans/past';
  }
  if (route.subScreen === 'search-plans') {
    return '/plans/search';
  }
  if (route.subScreen === 'profile-name') {
    return '/profile/name';
  }
  if (route.subScreen === 'profile-about') {
    return '/profile/about';
  }

  // Nested Plan Settings route: /plans/:id/settings, /plans/:id/settings/cover
  if (route.selectedPlanId && route.subScreen === 'plan-settings-cover') {
    return `/plans/${encodeURIComponent(route.selectedPlanId)}/settings/cover`;
  }
  if (route.selectedPlanId && route.subScreen === 'plan-settings') {
    return `/plans/${encodeURIComponent(route.selectedPlanId)}/settings`;
  }

  // Nested Plan chat route: /plans/:id/chat (when viewing plan chat on top of preview)
  if (route.selectedPlanId && route.selectedChatPlanId && route.entryPoint !== 'chat') {
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
    if (route.plansFilter === 'waitlisted') {
      return '/plans?filter=waitlisted';
    }
    if (route.plansFilter === 'skipped') {
      return '/plans?filter=skipped';
    }
    if (route.plansFilter === 'joined') {
      return '/plans?filter=joined';
    }
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
 * Checks whether two route representations or history states are semantically equal.
 */
export function areRoutesEqual(a?: unknown, b?: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const routeA = a as Record<string, any>;
  const routeB = b as Record<string, any>;
  return (
    routeA.tab === routeB.tab &&
    (routeA.createPhase ?? null) === (routeB.createPhase ?? null) &&
    (routeA.discoveryCategory ?? null) === (routeB.discoveryCategory ?? null) &&
    (routeA.subScreen ?? null) === (routeB.subScreen ?? null) &&
    (routeA.selectedPlanId ?? null) === (routeB.selectedPlanId ?? null) &&
    (routeA.selectedChatPlanId ?? null) === (routeB.selectedChatPlanId ?? null) &&
    (routeA.inviteToken ?? null) === (routeB.inviteToken ?? null) &&
    (routeA.originTab ?? null) === (routeB.originTab ?? null) &&
    (routeA.originSubScreen ?? null) === (routeB.originSubScreen ?? null) &&
    (routeA.entryPoint ?? null) === (routeB.entryPoint ?? null) &&
    (routeA.originChatPlanId ?? null) === (routeB.originChatPlanId ?? null) &&
    (routeA.plansFilter ?? null) === (routeB.plansFilter ?? null) &&
    Boolean(routeA.__isPlanlessOverlay) === Boolean(routeB.__isPlanlessOverlay) &&
    (routeA.__overlayId ?? null) === (routeB.__overlayId ?? null)
  );
}

/**
 * Navigates to a route, preserving existing query search parameters.
 */
export function navigateToRoute(route: AppRoute, options?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return;

  const targetPath = getRoutePath(route);
  const [basePath, targetQuery] = targetPath.split('?');
  const targetParams = new URLSearchParams(targetQuery || '');

  // Preserve existing non-filter search params (e.g. session, user)
  const currentParams = new URLSearchParams(window.location.search || '');
  currentParams.forEach((val, key) => {
    if (key !== 'filter' && !targetParams.has(key)) {
      targetParams.set(key, val);
    }
  });

  const queryString = targetParams.toString() ? `?${targetParams.toString()}` : '';
  const fullTarget = basePath + queryString;
  const currentFull = window.location.pathname + (window.location.search || '');

  const isUrlDifferent = currentFull !== fullTarget;
  const isOverlayOnState = Boolean(window.history?.state?.__isPlanlessOverlay);
  const routeWithOverlay = isOverlayOnState && !isUrlDifferent
    ? { ...route, __isPlanlessOverlay: true, __overlayId: window.history.state.__overlayId }
    : route;
  const isStateDifferent = !areRoutesEqual(window.history?.state, routeWithOverlay);

  // If navigating to root home, reset depth so Home acts as root exit destination
  if (route.tab === 'home' && !route.selectedPlanId && !route.subScreen && !route.inviteToken) {
    inAppNavigationDepth = 0;
  }

  if (!isUrlDifferent && !isStateDifferent) {
    return;
  }

  const finalRouteToStore = isOverlayOnState && !isUrlDifferent ? routeWithOverlay : route;

  if (isUrlDifferent) {
    if (options?.replace) {
      window.history.replaceState(finalRouteToStore, '', fullTarget);
    } else {
      window.history.pushState(finalRouteToStore, '', fullTarget);
      inAppNavigationDepth++;
    }
  } else if (isStateDifferent) {
    window.history.replaceState(finalRouteToStore, '', fullTarget);
  }

  // Dispatch custom event so listeners can synchronize state immediately
  window.dispatchEvent(new CustomEvent('planless-navigation', { detail: route }));
}

if (typeof window !== 'undefined') {
  (window as any).navigateToRoute = navigateToRoute;
  (window as any).parseCurrentRoute = parseCurrentRoute;
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
const subscribers = new Set<(route: AppRoute, isPopState?: boolean) => void>();
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
        cb(currentRoute, true);
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
        cb(route, false);
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
export function listenToNavigation(
  callback: (route: AppRoute, isPopState?: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  setupGlobalNavigationListener();
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

