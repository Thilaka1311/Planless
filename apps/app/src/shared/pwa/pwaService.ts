import { registerSW } from 'virtual:pwa-register';
import { supabase } from '../../../lib/supabaseClient';

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
  private lastReminderCheckTime = 0;
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

    if (this.currentBuildId && typeof localStorage !== 'undefined') {
      localStorage.setItem('planless_app_build_id', this.currentBuildId);
    }

    // Set up global environment listeners (visibility, focus, network, routing, interval)
    // These run in all environments to detect new Vercel deployments via /version.json
    this.setupGlobalListeners();

    // In development mode, unregister old service workers and clear cache to prevent stale HMR,
    // unless explicitly enabled for PWA mobile tunnel testing
    const allowPwaInDev = typeof window !== 'undefined' && (
      window.location.host.includes('ngrok') ||
      window.location.host.includes('trycloudflare') ||
      window.location.host.includes('cloudflare') ||
      window.location.host.includes('localtunnel') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('planless_force_pwa') === 'true')
    );
    if (import.meta.env.DEV && !allowPwaInDev) {
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

    // Always ensure /sw.js is actively registered for Web Push notifications
    this.ensureServiceWorker().then((reg) => {
      if (reg && !this.registration) {
        this.registration = reg;
      }
    }).catch(() => {});
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

      if (remoteVersion) {
        const storedBuildId = typeof localStorage !== 'undefined' ? localStorage.getItem('planless_app_build_id') : null;
        const effectiveCurrentBuild = this.currentBuildId || storedBuildId;

        if (effectiveCurrentBuild && remoteVersion !== effectiveCurrentBuild) {
          console.log(`[PWA] Newer deployment detected via version.json: current=${effectiveCurrentBuild}, latest=${remoteVersion}`);
          this.setHasUpdate(true);
          return true;
        } else if (!effectiveCurrentBuild) {
          // If no current build was recorded, this client is running an older unversioned bundle!
          console.log(`[PWA] Older unversioned bundle detected against remote version: ${remoteVersion}`);
          this.setHasUpdate(true);
          return true;
        }
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
      await this.checkVersionEndpoint();

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

          try {
            await this.registration.update();
          } catch (updateErr: any) {
            // If the service worker is in an invalid/redundant state, clean it up and re-register
            if (updateErr?.name === 'InvalidStateError') {
              console.log('[PWA] Service worker in invalid state during update check, resetting registration...');
              await this.registration.unregister().catch(() => {});
              this.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
            } else {
              throw updateErr;
            }
          }

          if (this.registration?.waiting && navigator.serviceWorker.controller) {
            this.setHasUpdate(true);
          }
          if (this.registration?.installing) {
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
   * Forces a clean cache purge and reload to break out of stale cache loops or load latest deployment.
   */
  async forceHardUpdate(): Promise<void> {
    console.log('[PWA] Performing forced hard update and cache purge...');
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.unregister().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[PWA] Force update cache purge error:', e);
    }

    if (typeof window !== 'undefined' && window.location) {
      try {
        sessionStorage.removeItem('planless_update_dismissed');
      } catch {}
      const currentHref = window.location.href || 'https://planless.life';
      const targetUrl = new URL(currentHref);
      targetUrl.searchParams.set('_v', String(Date.now()));
      if (typeof window.location.replace === 'function') {
        window.location.replace(targetUrl.toString());
      } else {
        window.location.href = targetUrl.toString();
      }
    }
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
      // Check for waiting service worker
      if (!this.registration && 'serviceWorker' in navigator) {
        this.registration = await navigator.serviceWorker.getRegistration();
      }

      let hasWaitingWorker = !!this.registration?.waiting;
      if (this.registration?.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            hasWaitingWorker = true;
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      // If a worker is currently installing, allow it up to 2 seconds to transition to waiting
      if (!hasWaitingWorker && this.registration?.installing) {
        const worker = this.registration.installing;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 2000);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' || worker.state === 'redundant') {
              clearTimeout(timer);
              resolve();
            }
          });
        });
        if (this.registration.waiting) {
          hasWaitingWorker = true;
          this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // If updateSwFn is registered, invoke it to activate the waiting service worker
      if (this.updateSwFn) {
        await this.updateSwFn(true);
      } else if (!hasWaitingWorker) {
        // If neither waiting worker nor updateSwFn was found, force hard update directly from network
        await this.forceHardUpdate();
        return;
      }
    } catch (err) {
      console.error('[PWA] Error activating waiting service worker:', err);
      // Fallback to hard update on error
      await this.forceHardUpdate();
      return;
    }

    // Safety fallback: if controllerchange hasn't reloaded the page within 800ms, reload with cache busting
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.location && !this.hasReloaded) {
        this.hasReloaded = true;
        const currentHref = window.location.href || 'https://planless.life';
        const targetUrl = new URL(currentHref);
        targetUrl.searchParams.set('_v', String(Date.now()));
        if (typeof window.location.replace === 'function') {
          window.location.replace(targetUrl.toString());
        } else {
          window.location.href = targetUrl.toString();
        }
      }
    }, 800);
  }

  /**
   * Checks if Push Notifications are supported in the current browser/OS.
   */
  isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /**
   * Returns current Notification permission state ('default', 'granted', 'denied').
   */
  getPushPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'default';
    }
    return Notification.permission;
  }

  /**
   * Returns the current detected device platform ('ios' | 'android' | 'desktop').
   */
  getDevicePlatform(): 'ios' | 'android' | 'desktop' {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (typeof navigator.platform === 'string' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    if (isIos) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
  }

  /**
   * Checks if the app is currently running in standalone PWA mode (installed to Home Screen / WebAPK).
   */
  isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      (window.navigator as any).standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    );
  }

  /**
   * Returns current Notification permission state, checking Notification.permission
   * and cross-checking navigator.permissions.query({ name: 'notifications' }) where supported.
   */
  async getDetailedPermissionState(): Promise<NotificationPermission> {
    if (typeof window === 'undefined') return 'default';

    // 1. Direct synchronous Notification.permission check
    if ('Notification' in window && Notification.permission) {
      if (Notification.permission === 'denied') return 'denied';
      if (Notification.permission === 'granted') {
        // Cross-check Permissions API if available (especially on Android where system settings can block)
        if (
          typeof navigator !== 'undefined' &&
          'permissions' in navigator &&
          typeof navigator.permissions.query === 'function'
        ) {
          try {
            const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
            if (status?.state === 'denied') return 'denied';
            if (status?.state === 'prompt') return 'default';
          } catch {
            // Some browsers throw when querying 'notifications'
          }
        }
        return 'granted';
      }
    }

    // 2. Query Permissions API if Notification is 'default' or not in window
    if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      typeof navigator.permissions.query === 'function'
    ) {
      try {
        const status = await navigator.permissions.query({ name: 'notifications' as PermissionName });
        if (status?.state === 'denied') return 'denied';
        if (status?.state === 'granted') return 'granted';
        if (status?.state === 'prompt') return 'default';
      } catch {}
    }

    if ('Notification' in window && Notification.permission) {
      return Notification.permission;
    }

    return 'default';
  }

  /**
   * Detects if the user is on an iOS device in Safari without having installed the PWA.
   * On iOS, Web Push is ONLY supported when added to the Home Screen (standalone PWA).
   */
  isIosSafariWithoutPwa(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (typeof navigator.platform === 'string' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    return isIos && !this.isStandalone();
  }

  /**
   * Ensures the service worker is registered and returns its registration with an active worker.
   */
  async ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      let reg: ServiceWorkerRegistration | null = null;
      if (typeof navigator.serviceWorker.getRegistration === 'function') {
        reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      }

      // If registration exists but is completely dead/redundant, reset it
      if (reg && !reg.active && !reg.installing && !reg.waiting) {
        console.log('[PWA] Found stale service worker registration, clearing and re-registering...');
        await reg.unregister().catch(() => {});
        reg = null;
      }

      if (!reg && typeof navigator.serviceWorker.register === 'function') {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
      }

      // If active worker exists, return immediately
      if (reg?.active) {
        return reg;
      }

      // If waiting worker exists, tell it to activate
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Await navigator.serviceWorker.ready to guarantee active state
      if (navigator.serviceWorker.ready) {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (readyReg) return readyReg;
      }

      return reg;
    } catch (e) {
      console.warn('[PWA] Failed to get/register service worker:', e);
      return null;
    }
  }

  /**
   * Checks if the device has an actual active Web Push subscription with the browser.
   */
  async hasActivePushSubscription(): Promise<boolean> {
    const sub = await this.getActivePushSubscription();
    return !!sub;
  }

  /**
   * Returns the current active PushSubscription object if one exists in the browser.
   */
  async getActivePushSubscription(): Promise<PushSubscription | null> {
    if (!this.isPushSupported()) return null;
    try {
      const registration = await this.ensureServiceWorker();
      if (!registration || !registration.pushManager) return null;
      return await registration.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  /**
   * Automatically synchronizes the push subscription if permission is already granted.
   * Safe to call on app startup and login.
   */
  async syncPushSubscription(userId: string): Promise<boolean> {
    if (!userId || !this.isPushSupported() || this.isIosSafariWithoutPwa()) {
      return false;
    }

    const perm = await this.getDetailedPermissionState();
    if (perm !== 'granted') {
      return false;
    }

    try {
      const res = await this.subscribeToPush(userId);
      return res.success;
    } catch {
      return false;
    }
  }

  /**
   * Subscribes the current device to Web Push and persists the subscription in Supabase.
   */
  async subscribeToPush(userId: string): Promise<{
    success: boolean;
    error?: string;
    permissionDenied?: boolean;
    requiresIosPwa?: boolean;
  }> {
    let effectiveUserId = userId;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        effectiveUserId = session.user.id;
      } else {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          effectiveUserId = authData.user.id;
        }
      }
    } catch {}

    if (!effectiveUserId) {
      return { success: false, error: 'User is not authenticated' };
    }

    if (this.isIosSafariWithoutPwa()) {
      return {
        success: false,
        requiresIosPwa: true,
        error: 'Push notifications on iPhone require adding Planless to your Home Screen first.',
      };
    }

    if (!this.isPushSupported()) {
      return {
        success: false,
        error: 'Push notifications are not supported on this browser.',
      };
    }

    try {
      // 1. Request user permission if not already granted
      let permission = await this.getDetailedPermissionState();
      if (permission === 'denied') {
        return {
          success: false,
          permissionDenied: true,
          error: 'Notification permission is blocked in browser or device settings.',
        };
      }
      if (permission !== 'granted') {
        if ('Notification' in window && typeof Notification.requestPermission === 'function') {
          permission = await Notification.requestPermission();
        }
      }
      if (permission !== 'granted') {
        const finalPerm = await this.getDetailedPermissionState();
        return {
          success: false,
          permissionDenied: finalPerm === 'denied' || permission === 'denied',
          error: 'Notification permission was not granted.',
        };
      }

      // 2. Ensure Service Worker registration is active
      let registration = await this.ensureServiceWorker();
      if (!registration || !registration.pushManager) {
        return {
          success: false,
          error: 'Push manager is not available in the active service worker.',
        };
      }

      // Wait for worker to be active before subscribing
      if (!registration.active && navigator.serviceWorker.ready) {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (readyReg) {
          registration = readyReg;
        }
      }

      if (!registration.active && typeof navigator.serviceWorker.register === 'function') {
        console.log('[PWA] Worker not active, re-registering /sw.js...');
        if (typeof registration.unregister === 'function') {
          await registration.unregister().catch(() => {});
        }
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
        if (registration && navigator.serviceWorker.ready) {
          const readyReg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (readyReg) registration = readyReg;
        }
      }

      if (!registration || (!registration.active && typeof navigator.serviceWorker.register === 'function')) {
        return {
          success: false,
          error: 'Service worker is still activating. Please retry in a moment.',
        };
      }

      // 3. Resolve VAPID Public Key
      const vapidPublicKey =
        (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY ||
        'BP0zSZXwnl0p9_nvQM5Z5w48Klde00b0rGkN84maT_qgnTfH5dJ0WkT3pET6SX5E2ccHNs_0SwStdmcE3EFdAAg';

      const convertedVapidKey = this.urlBase64ToUint8Array(vapidPublicKey);

      // 4. Retrieve or create PushSubscription (renew if VAPID key mismatch)
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const existingKey = subscription.options?.applicationServerKey;
        if (existingKey) {
          const existingKeyBytes = new Uint8Array(existingKey);
          const keysMatch =
            existingKeyBytes.length === convertedVapidKey.length &&
            existingKeyBytes.every((val, i) => val === convertedVapidKey[i]);
          if (!keysMatch) {
            console.log('[PWA] Renewing subscription with updated VAPID key...');
            await subscription.unsubscribe().catch(() => {});
            subscription = null;
          }
        }
      }

      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey as unknown as BufferSource,
          });
        } catch (subErr: any) {
          const errMsg = (subErr?.message || '').toLowerCase();
          const errName = subErr?.name || '';
          const isDenied =
            errName === 'NotAllowedError' ||
            errName === 'PermissionDeniedError' ||
            errMsg.includes('denied') ||
            errMsg.includes('permission') ||
            errMsg.includes('not allowed') ||
            errMsg.includes('blocked');

          if (isDenied) {
            return {
              success: false,
              permissionDenied: true,
              error: 'Notification permission was denied or blocked by device settings.',
            };
          }
          throw subErr;
        }
      }

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        return { success: false, error: 'Invalid subscription payload generated by browser' };
      }

      // 5. Detect platform
      const platform = this.getDevicePlatform();

      // 6. Upsert subscription in Supabase user_push_subscriptions table
      const subPayload = {
        user_id: effectiveUserId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        user_agent: navigator.userAgent,
        platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      };

      let saveSuccess = false;
      let lastErrorMsg: string | undefined;

      try {
        const { error: dbError } = await supabase
          .from('user_push_subscriptions')
          .upsert(subPayload, { onConflict: 'endpoint' });

        if (!dbError) {
          saveSuccess = true;
        } else {
          lastErrorMsg = dbError.message;
          console.warn('[PWA] Direct table upsert returned error, trying Edge Function fallback:', dbError.message);
        }
      } catch (err: any) {
        lastErrorMsg = err?.message;
      }

      // Fallback: If RLS or client direct upsert failed, persist via send-push Edge Function
      if (!saveSuccess) {
        try {
          const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('send-push', {
            body: {
              action: 'register-subscription',
              subscription: subPayload,
            },
          });
          if (!edgeErr && edgeData?.success) {
            saveSuccess = true;
            console.log('[PWA] Subscription persisted via Edge Function fallback');
          } else {
            lastErrorMsg = edgeErr?.message || edgeData?.error || lastErrorMsg;
          }
        } catch (err: any) {
          lastErrorMsg = err?.message || lastErrorMsg;
        }
      }

      if (!saveSuccess) {
        console.error('[PWA] Failed to save push subscription in database:', lastErrorMsg);
        return { success: false, error: lastErrorMsg || 'Failed to save push subscription' };
      }

      console.log('[PWA] Push subscription registered successfully for user:', effectiveUserId);
      return { success: true };
    } catch (err: any) {
      console.error('[PWA] Failed to subscribe to push notifications:', err);
      return { success: false, error: err?.message || 'Unknown error during push registration' };
    }
  }


  /**
   * Unsubscribes the current device from Web Push and deactivates the record in Supabase.
   */
  async unsubscribeFromPush(userId?: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        if (endpoint) {
          await supabase
            .from('user_push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', endpoint);
        }
      }
      return true;
    } catch (err) {
      console.warn('[PWA] Error unsubscribing from push:', err);
      return false;
    }
  }

  /**
   * Converts a URL-safe Base64 string to a Uint8Array for VAPID applicationServerKey.
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const pwaManager = new PwaManager();
