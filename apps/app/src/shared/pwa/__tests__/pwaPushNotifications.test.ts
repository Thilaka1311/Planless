import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pwaManager } from '../pwaService';

// Mock Supabase client
vi.mock('../../../../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
      },
    },
  };
});

describe('PWA Push Notification Manager', () => {
  const setMockNavigator = (overrides: Record<string, any> = {}) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...overrides,
      },
      configurable: true,
      writable: true,
    });
  };

  const setMockNotification = (overrides: Record<string, any> = {}) => {
    Object.defineProperty(globalThis, 'Notification', {
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
        ...overrides,
      },
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
      writable: true,
    });
    setMockNavigator({ serviceWorker: {} });
    setMockNotification();
    (globalThis as any).PushManager = {};
  });

  it('detects when push notifications are supported', () => {
    expect(pwaManager.isPushSupported()).toBe(true);
  });

  it('detects when push notifications are not supported if PushManager is missing', () => {
    delete (globalThis as any).PushManager;
    expect(pwaManager.isPushSupported()).toBe(false);
  });

  it('returns current notification permission state', () => {
    setMockNotification({ permission: 'granted' });
    expect(pwaManager.getPushPermissionState()).toBe('granted');

    setMockNotification({ permission: 'denied' });
    expect(pwaManager.getPushPermissionState()).toBe('denied');
  });

  it('detects iOS Safari in regular browser mode requiring Add to Home Screen', () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    expect(pwaManager.isIosSafariWithoutPwa()).toBe(true);
  });

  it('recognizes iOS standalone PWA when launched from Home Screen', () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      standalone: true,
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(pwaManager.isIosSafariWithoutPwa()).toBe(false);
  });

  it('blocks subscription attempt on iOS Safari with requiresIosPwa guidance', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    const result = await pwaManager.subscribeToPush('user-123');
    expect(result.success).toBe(false);
    expect(result.requiresIosPwa).toBe(true);
  });

  it('handles user denying notification permission', async () => {
    setMockNotification({
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    const result = await pwaManager.subscribeToPush('user-123');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBe(true);
  });

  it('successfully subscribes and registers push token in Supabase when granted', async () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-token',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-token',
        keys: {
          p256dh: 'mock-p256dh-key',
          auth: 'mock-auth-secret',
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue(mockSubscription),
          },
        }),
      },
    });
    setMockNotification({
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    (globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

    const result = await pwaManager.subscribeToPush('user-123');
    expect(result.success).toBe(true);
  });

  it('correctly reports hasActivePushSubscription based on pushManager subscription', async () => {
    // When no subscription exists
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
          },
        }),
      },
    });
    expect(await pwaManager.hasActivePushSubscription()).toBe(false);

    // When subscription exists
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://fcm.googleapis.com/test' }),
          },
        }),
      },
    });
    expect(await pwaManager.hasActivePushSubscription()).toBe(true);
  });

  it('syncPushSubscription automatically subscribes when permission is already granted', async () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-token',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-token',
        keys: {
          p256dh: 'mock-p256dh-key',
          auth: 'mock-auth-secret',
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(mockSubscription),
            subscribe: vi.fn().mockResolvedValue(mockSubscription),
          },
        }),
      },
    });
    setMockNotification({
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    (globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

    const synced = await pwaManager.syncPushSubscription('user-123');
    expect(synced).toBe(true);
  });

  it('syncPushSubscription skips if permission is default or denied', async () => {
    setMockNotification({
      permission: 'default',
    });
    const synced = await pwaManager.syncPushSubscription('user-123');
    expect(synced).toBe(false);
  });
});
