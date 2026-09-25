import { registerSW } from 'virtual:pwa-register';

type UpdateListener = (hasUpdate: boolean) => void;

class PwaManager {
  private hasUpdate = false;
  private updateSwFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private listeners = new Set<UpdateListener>();
  private registration: ServiceWorkerRegistration | null = null;
  private isUpdating = false;
  private isInitialized = false;

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

    try {
      this.updateSwFn = registerSW({
        immediate: true,
        onNeedRefresh: () => {
          console.log('[PWA] New version downloaded and ready to activate');
          this.setHasUpdate(true);
        },
        onOfflineReady: () => {
          console.log('[PWA] Planless is ready for offline usage');
        },
        onRegistered: (registration) => {
          console.log('[PWA] Service worker registered successfully');
          if (!registration) return;
          this.registration = registration;

          // If a service worker is already in waiting state (e.g. downloaded in a previous session)
          if (registration.waiting) {
            console.log('[PWA] Found waiting service worker on startup');
            this.setHasUpdate(true);
          }

          // Listen for new waiting service worker directly on the registration
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New service worker installed and waiting');
                this.setHasUpdate(true);
              }
            });
          });

          // Check for updates when user returns to app
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              this.checkForUpdate();
            }
          });

          // Check for updates when window gains focus
          window.addEventListener('focus', () => {
            this.checkForUpdate();
          });

          // Periodic background check every 60 minutes
          setInterval(() => {
            this.checkForUpdate();
          }, 60 * 60 * 1000);
        },
        onRegisterError: (error) => {
          console.error('[PWA] Registration failed:', error);
        },
      });
    } catch (err) {
      console.error('[PWA] Error in registerSW:', err);
    }
  }

  checkForUpdate() {
    if (!this.registration) return;
    try {
      this.registration.update().catch((err) => {
        console.warn('[PWA] Update check failed:', err);
      });
    } catch (e) {
      // Ignore
    }
  }

  private setHasUpdate(value: boolean) {
    this.hasUpdate = value;
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
      if (this.updateSwFn) {
        await this.updateSwFn(true);
      } else if (this.registration?.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (err) {
      console.error('[PWA] Failed to message waiting service worker:', err);
    }

    // Safety fallback: if reload hasn't triggered within 1500ms, reload window
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 1500);
  }
}

export const pwaManager = new PwaManager();
