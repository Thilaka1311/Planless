export type AppTab = 'home' | 'plans' | 'create' | 'chats' | 'circles' | 'wallet' | 'profile';
export type CreatePhase = 'category' | 'who' | 'who-actually' | 'when' | 'review' | 'confirmation';

export interface AppRoute {
  tab: AppTab;
  createPhase?: CreatePhase;
  selectedPlanId?: string | null;
  selectedChatPlanId?: string | null;
  selectedCircleId?: string | null;
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

  // Create flow: /create, /create/who, /create/participants, /create/when, /create/review, /create/confirmation
  if (primary === 'create') {
    const sub = (parts[1] || '').toLowerCase();
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
    const planId = parts[1] || null;
    return { tab: 'plans', selectedPlanId: planId };
  }

  // Chats: /chats, /chats/:id
  if (primary === 'chats' || primary === 'chat') {
    const chatPlanId = parts[1] || null;
    return { tab: 'chats', selectedChatPlanId: chatPlanId };
  }

  // Circles: /circles, /circles/:id
  if (primary === 'circles' || primary === 'circle') {
    const circleId = parts[1] || null;
    return { tab: 'circles', selectedCircleId: circleId };
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
    if (route.selectedPlanId) return `/plans/${encodeURIComponent(route.selectedPlanId)}`;
    return '/plans';
  }

  if (route.tab === 'chats') {
    if (route.selectedChatPlanId) return `/chats/${encodeURIComponent(route.selectedChatPlanId)}`;
    return '/chats';
  }

  if (route.tab === 'circles') {
    if (route.selectedCircleId) return `/circles/${encodeURIComponent(route.selectedCircleId)}`;
    return '/circles';
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
    }
  }

  // Dispatch custom event so listeners can synchronize state immediately
  window.dispatchEvent(new CustomEvent('planless-navigation', { detail: route }));
}

/**
 * Subscribes to browser history (popstate) and internal route navigation events.
 */
export function listenToNavigation(callback: (route: AppRoute) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handlePopState = () => {
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
