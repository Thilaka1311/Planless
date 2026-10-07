import { registerSW } from 'virtual:pwa-register';

type UpdateListener = (hasUpdate: boolean) => void;

class PwaManager {
  private hasUpdate = false;
  private updateSwFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private listeners = new Set<UpdateListener>();
  private registration: ServiceWorkerRegistration | null = null;
  private isUpdating = false;
  private isInitialized = false;
  private hasReloaded = false;
  private isCheckingUpdate = false;
  private lastCheckTime = 0;
  private currentBuildId: string = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';

  /**
   * Set or override the current build ID (useful in tests and runtime configuration).
   */
  setBuildId(id: string) {
    this.currentBuildId = id;
  }

  getBuildId(): string {
    return this.currentBuildId;
  }

  init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    // Set up global environment listeners (visibility, focus, network, routing, interval)
    // These run in all environments to detect new Vercel deployments via /version.json
    this.setupGlobalListeners();

    // In development mode, unregister old service workers and clear cache to prevent stale HMR
    if (import.meta.env.DEV) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
        if ('caches' in window) {
          caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
        }
      }
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    // Listen for controller changes when user accepts an update and skipWaiting activates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.isUpdating && !this.hasReloaded) {
        this.hasReloaded = true;
        console.log('[PWA] Controller changed after user update, reloading to activate latest version...');
        window.location.reload();
      }
    });

    try {
      this.updateSwFn = registerSW({
        immediate: true,
        onNeedRefresh: () => {
          console.log('[PWA] New version downloaded and ready to activate (onNeedRefresh)');
          this.setHasUpdate(true);
        },
        onOfflineReady: () => {
          console.log('[PWA] Planless is ready for offline usage');
        },
        onRegistered: (registration) => {
          console.log('[PWA] Service worker registered successfully');
          if (!registration) return;
          this.registration = registration;

          // 1. If a service worker is already in waiting state on startup
          if (registration.waiting && navigator.serviceWorker.controller) {
            console.log('[PWA] Found waiting service worker on startup');
            this.setHasUpdate(true);
          }

          // 2. If a service worker is currently installing, track its transition to waiting
          if (registration.installing) {
            this.trackInstallingWorker(registration.installing);
          }

          // 3. Listen for new service worker installation directly on the registration
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;
            this.trackInstallingWorker(installingWorker);
          });
        },
        onRegisterError: (error) => {
          console.error('[PWA] Registration failed:', error);
        },
      });
    } catch (err) {
      console.error('[PWA] Error in registerSW:', err);
    }
  }

  /**
   * Sets up cross-browser listeners for deployment detection.
   * Works on mobile, desktop, standalone PWAs, and in-app webviews.
   */
  private setupGlobalListeners() {
    // 1. Initial check immediately on application startup
    this.checkForUpdate(true);

    // 2. Follow-up check after 2 seconds to let initial critical network traffic settle
    setTimeout(() => {
      this.checkForUpdate(true);
    }, 2000);

    // 3. Check when user returns to the app / tab becomes visible
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkForUpdate();
        }
      });
    }

    // 4. Check when window gains focus
    window.addEventListener('focus', () => {
      this.checkForUpdate();
    });

    // 5. Check when internet connection is restored
    window.addEventListener('online', () => {
      this.checkForUpdate();
    });

    // 6. Check on client-side SPA routing changes
    window.addEventListener('popstate', () => {
      this.checkForUpdate();
    });

    if (window.history) {
      const origPushState = window.history.pushState;
      if (typeof origPushState === 'function') {
        window.history.pushState = (...args: Parameters<History['pushState']>) => {
          const result = origPushState.apply(window.history, args);
          this.checkForUpdate();
          return result;
        };
      }
      const origReplaceState = window.history.replaceState;
      if (typeof origReplaceState === 'function') {
        window.history.replaceState = (...args: Parameters<History['replaceState']>) => {
          const result = origReplaceState.apply(window.history, args);
          this.checkForUpdate();
          return result;
        };
      }
    }

    // 7. Throttled user activity check (at most once every 30s)
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - this.lastCheckTime >= 30000) {
        this.checkForUpdate();
      }
    };
    window.addEventListener('pointerdown', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });

    // 8. Periodic background check every 45 seconds to discover new Vercel builds quickly
    setInterval(() => {
      this.checkForUpdate();
    }, 45 * 1000);
  }

  private trackInstallingWorker(worker: ServiceWorker) {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      console.log('[PWA] New service worker already installed and waiting in background');
      this.setHasUpdate(true);
      return;
    }

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[PWA] New service worker installed and waiting in background');
        this.setHasUpdate(true);
      }
    });
  }

  /**
   * Polls the zero-cache /version.json endpoint generated on each Vercel deployment.
   * Compares the deployed version against the currently running bundle's build ID.
   */
  async checkVersionEndpoint(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return false;
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!res.ok) return false;
      const data = await res.json();
      const remoteVersion = data?.version;

      if (remoteVersion && this.currentBuildId && remoteVersion !== this.currentBuildId) {
        console.log(`[PWA] Newer deployment detected via version.json: current=${this.currentBuildId}, latest=${remoteVersion}`);
        this.setHasUpdate(true);
        return true;
      }
    } catch {
      // Ignore network errors/offline mode
    }
    return false;
  }

  /**
   * Performs an update check: checks /version.json and triggers service worker update.
   */
  async checkForUpdate(force = false): Promise<void> {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    // Throttle automatic checks to at most once every 10 seconds unless forced
    if (!force && now - this.lastCheckTime < 10000) return;
    if (this.isCheckingUpdate) return;

    this.isCheckingUpdate = true;
    this.lastCheckTime = now;

    try {
      // 1. Direct version check: works everywhere (even in webviews or private windows)
      const foundNewVersion = await this.checkVersionEndpoint();
      if (foundNewVersion) {
        return;
      }

      // 2. Service Worker lifecycle check (if supported)
      if ('serviceWorker' in navigator) {
        if (!this.registration) {
          this.registration = await navigator.serviceWorker.getRegistration();
        }
        if (this.registration) {
          if (this.registration.waiting && navigator.serviceWorker.controller) {
            this.setHasUpdate(true);
          }
          if (this.registration.installing) {
            this.trackInstallingWorker(this.registration.installing);
          }

          await this.registration.update();

          if (this.registration.waiting && navigator.serviceWorker.controller) {
            this.setHasUpdate(true);
          }
          if (this.registration.installing) {
            this.trackInstallingWorker(this.registration.installing);
          }
        }
      }
    } catch (err) {
      console.warn('[PWA] Update check failed:', err);
    } finally {
      this.isCheckingUpdate = false;
    }
  }

  private setHasUpdate(value: boolean) {
    this.hasUpdate = value;
    if (value && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('planless_update_dismissed');
    }
    this.listeners.forEach((listener) => listener(this.hasUpdate));
  }

  subscribe(listener: UpdateListener) {
    this.listeners.add(listener);
    listener(this.hasUpdate);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHasUpdate() {
    return this.hasUpdate;
  }

  /**
   * Activates the latest deployed version and cleanly reloads the application.
   * Preserves current route URL and query params.
   */
  async updateApp(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;
    console.log('[PWA] User accepted update, activating latest build...');

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('planless_update_dismissed');
    }

    try {
      if (!this.registration && 'serviceWorker' in navigator) {
        this.registration = await navigator.serviceWorker.getRegistration();
      }
      // 1. Tell waiting service worker to take over
      if (this.registration?.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // 2. Trigger workbox skipWaiting reload
      if (this.updateSwFn) {
        await this.updateSwFn(true);
      }
    } catch (err) {
      console.error('[PWA] Error activating waiting service worker:', err);
    }

    // Safety fallback: if controllerchange hasn't reloaded the page within 800ms, reload directly
    setTimeout(() => {
      if (typeof window !== 'undefined' && !this.hasReloaded) {
        this.hasReloaded = true;
        window.location.reload();
      }
    }, 800);
  }
}

export const pwaManager = new PwaManager();
