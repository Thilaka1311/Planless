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

  init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    // In development mode, ensure any existing service workers and caches are cleared
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

    // Listen for controller changes across the entire service worker lifecycle.
    // When the user accepts an update and skipWaiting activates the new worker,
    // reloading the page ensures the latest production code runs immediately.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.isUpdating && !this.hasReloaded) {
        this.hasReloaded = true;
        console.log('[PWA] Controller changed after update, reloading to activate latest version...');
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
          if (registration.waiting) {
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

          // 4. Actively check for updates immediately on application launch
          this.checkForUpdate();

          // 5. Follow-up check after 2 seconds to let initial critical network traffic settle
          setTimeout(() => {
            this.checkForUpdate();
          }, 2000);

          // 6. Check for updates whenever user returns to the app
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              this.checkForUpdate();
            }
          });

          // 7. Check for updates when window gains focus
          window.addEventListener('focus', () => {
            this.checkForUpdate();
          });

          // 8. Check for updates when connection is restored
          window.addEventListener('online', () => {
            this.checkForUpdate();
          });

          // 9. Periodic background update check every 15 minutes
          setInterval(() => {
            this.checkForUpdate();
          }, 15 * 60 * 1000);
        },
        onRegisterError: (error) => {
          console.error('[PWA] Registration failed:', error);
        },
      });
    } catch (err) {
      console.error('[PWA] Error in registerSW:', err);
    }
  }

  private trackInstallingWorker(worker: ServiceWorker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[PWA] New service worker installed and waiting in background');
        this.setHasUpdate(true);
      }
    });
  }

  async checkForUpdate() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      if (!this.registration) {
        this.registration = await navigator.serviceWorker.getRegistration();
      }
      if (this.registration) {
        // Check if a worker entered waiting state
        if (this.registration.waiting) {
          this.setHasUpdate(true);
        }
        await this.registration.update();
        if (this.registration.waiting) {
          this.setHasUpdate(true);
        }
      }
    } catch (err) {
      console.warn('[PWA] Update check failed:', err);
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

  async updateApp(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;
    console.log('[PWA] User accepted update, triggering skipWaiting...');

    // Clear session dismissal flag
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('planless_update_dismissed');
    }

    try {
      // 1. Message waiting worker directly if available
      if (this.registration?.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // 2. Invoke VitePWA update function (which signals workbox to message skipWaiting)
      if (this.updateSwFn) {
        await this.updateSwFn(true);
      }
    } catch (err) {
      console.error('[PWA] Failed to message waiting service worker:', err);
    }

    // Safety fallback: if controllerchange event has not triggered a reload within 1500ms, reload directly
    setTimeout(() => {
      if (typeof window !== 'undefined' && !this.hasReloaded) {
        this.hasReloaded = true;
        window.location.reload();
      }
    }, 1500);
  }
}

export const pwaManager = new PwaManager();
