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

export interface AppRoute {
  tab: AppTab;
  createPhase?: CreatePhase;
  discoveryCategory?: DiscoveryCategory | null;
  selectedPlanId?: string | null;
  selectedChatPlanId?: string | null;
  inviteToken?: string | null;
}

// Track in-app navigation depth so in-screen back buttons can call window.history.back()
// when there is valid in-app history, or fallback to an appropriate route on direct URL entry.
let inAppNavigationDepth = 0;

export function getInAppNavigationDepth(): number {
  return inAppNavigationDepth;
}

export function resetInAppNavigationDepth(): void {
  inAppNavigationDepth = 0;
}

/**
 * Checks if a given pathname corresponds to a recognized, valid Planless application route.
 */
export function isValidRoute(pathname: string): boolean {
  if (!pathname) return false;
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/home') return true;
  if (clean === '/create' || clean.startsWith('/create/')) return true;
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

  // Top-level discovery categories: /sports, /dining, /movies, /activities
  if (primary === 'sports' || primary === 'dining' || primary === 'movies' || primary === 'activities') {
    return { tab: primary as AppTab, discoveryCategory: primary as DiscoveryCategory };
  }

  // Create flow: /create, /create/who, /create/participants, /create/when, /create/review, /create/confirmation
  if (primary === 'create') {
    const sub = (parts[1] || '').toLowerCase();
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

  // Plans: /plans, /plans/:id, /plan/:id
  if (primary === 'plans' || primary === 'plan') {
    const rawParam = parts[1] || null;
    const planId = rawParam ? decodeURIComponent(rawParam) : null;
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

  // Profile: /profile
  if (primary === 'profile') {
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

  // Dispatch custom event so listeners can synchronize state immediately
  window.dispatchEvent(new CustomEvent('planless-navigation', { detail: route }));
}

/**
 * Smart back navigation: uses browser history back if in-app history exists,
 * otherwise navigates cleanly to the specified fallback route.
 */
export function navigateBack(fallbackRoute: AppRoute = { tab: 'home' }): void {
  if (typeof window === 'undefined') return;

  if (inAppNavigationDepth > 0 && window.history.length > 1) {
    window.history.back();
  } else {
    navigateToRoute(fallbackRoute);
  }
}

/**
 * Subscribes to browser history (popstate) and internal route navigation events.
 */
export function listenToNavigation(callback: (route: AppRoute) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handlePopState = () => {
    if (inAppNavigationDepth > 0) {
      inAppNavigationDepth--;
    }
    callback(parseCurrentRoute());
  };

  const handleCustomNav = (e: Event) => {
    const customEvent = e as CustomEvent<AppRoute>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(parseCurrentRoute());
    }
  };

  window.addEventListener('popstate', handlePopState);
  window.addEventListener('planless-navigation', handleCustomNav);

  return () => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('planless-navigation', handleCustomNav);
  };
}
