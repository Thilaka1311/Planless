import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pwaManager } from '../../../shared/pwa/pwaService';
import { NOTIFICATION_STATUS_TEXT } from '../screens/ProfileScreen';

const { mockUpsert, mockSelect, mockEq, mockLimit, mockInvoke } = vi.hoisted(() => ({
  mockUpsert: vi.fn().mockResolvedValue({ error: null }),
  mockSelect: vi.fn().mockReturnThis(),
  mockEq: vi.fn().mockReturnThis(),
  mockLimit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null }),
  mockInvoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
}));

vi.mock('../../../../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        upsert: mockUpsert,
        select: mockSelect,
        eq: mockEq,
        limit: mockLimit,
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'test-user-uuid' } } },
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-uuid' } },
        }),
      },
      functions: {
        invoke: mockInvoke,
      },
    },
  };
});

describe('Cross-Platform Push Notification Permissions & Profile UI', () => {
  const mockPushSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/android-sub-token',
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/android-sub-token',
      keys: {
        p256dh: 'mock-p256dh-key',
        auth: 'mock-auth-secret',
      },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };

  const setMockNavigator = (overrides: Record<string, any> = {}) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
        serviceWorker: {
          ready: Promise.resolve({
            active: {} as any,
            pushManager: {
              getSubscription: vi.fn().mockResolvedValue(null),
              subscribe: vi.fn().mockResolvedValue(mockPushSubscription),
            },
          }),
        },
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
    mockUpsert.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
      writable: true,
    });
    (globalThis as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
    (globalThis as any).PushManager = {};

    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue(mockPushSubscription),
          },
        }),
      },
    });
    setMockNotification();
  });

  // 1. Explicit status strings specification
  it('defines exact user-facing status strings matching the specification table', () => {
    expect(NOTIFICATION_STATUS_TEXT.permission_not_requested).toBe('Tap to enable notifications');
    expect(NOTIFICATION_STATUS_TEXT.requesting_permission).toBe('Requesting permission…');
    expect(NOTIFICATION_STATUS_TEXT.setting_up).toBe('Setting up notifications…');
    expect(NOTIFICATION_STATUS_TEXT.active).toBe('On · Active on this device');
    expect(NOTIFICATION_STATUS_TEXT.denied).toBe('Blocked · Enable in browser settings');
    expect(NOTIFICATION_STATUS_TEXT.unsupported).toBe('Notifications unavailable in this browser');
    expect(NOTIFICATION_STATUS_TEXT.failed).toBe('Setup failed · Tap to retry');
    expect(NOTIFICATION_STATUS_TEXT.disabled).toBe('Off · Tap to enable');
    expect(NOTIFICATION_STATUS_TEXT.ios_pwa_required).toBe('Add to Home Screen required on iPhone');
  });

  // 2. Android Chrome user taps Notifications and grants permission
  it('handles first-time Android Chrome permission grant and persists subscription', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    });
    setMockNotification({
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'test-user-uuid',
        endpoint: mockPushSubscription.endpoint,
        platform: 'android',
        is_active: true,
      }),
      { onConflict: 'endpoint' }
    );
  });

  // 3. Permission denied
  it('handles user denying notification permission without crashing', async () => {
    setMockNotification({
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBe(true);
  });

  // 4. Permission previously denied
  it('detects previously denied permission so UI directs to settings rather than re-requesting', () => {
    setMockNotification({ permission: 'denied' });
    expect(pwaManager.getPushPermissionState()).toBe('denied');
  });

  // 5. Permission already granted and valid subscription exists
  it('reuses existing valid subscription without recreating when application keys match', async () => {
    const existingSub = {
      ...mockPushSubscription,
      options: {
        applicationServerKey: new Uint8Array([1, 2, 3]),
      },
    };

    setMockNotification({ permission: 'granted' });
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(existingSub),
            subscribe: vi.fn(),
          },
        }),
      },
    });

    const activeSub = await pwaManager.getActivePushSubscription();
    expect(activeSub).not.toBeNull();
    expect(activeSub?.endpoint).toBe(mockPushSubscription.endpoint);
  });

  // 6. Permission granted but subscription creation fails
  it('handles push manager subscription failure gracefully', async () => {
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockRejectedValue(new Error('Push service registration failed')),
          },
        }),
      },
    });
    setMockNotification({ permission: 'granted' });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Push service registration failed');
  });

  // 7. Subscription creation succeeds but database persistence fails
  it('attempts Edge Function fallback when direct database upsert fails', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'Database connection timeout' } });
    mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(mockInvoke).toHaveBeenCalledWith('send-push', {
      body: expect.objectContaining({
        action: 'register-subscription',
      }),
    });
    expect(result.success).toBe(true);
  });

  // 8. Notifications unsupported in current browser
  it('detects unsupported environment when PushManager or Notification is missing', () => {
    delete (globalThis as any).PushManager;
    expect(pwaManager.isPushSupported()).toBe(false);
  });

  // 9. iOS Safari regular tab displays Add to Home Screen requirement
  it('detects iOS Safari tab without standalone PWA and returns requiresIosPwa', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    expect(pwaManager.isIosSafariWithoutPwa()).toBe(true);
    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.requiresIosPwa).toBe(true);
  });

  // 10. iOS Home Screen standalone PWA supports push registration
  it('allows iOS standalone PWA to register push notifications', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      standalone: true,
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(pwaManager.isIosSafariWithoutPwa()).toBe(false);
    expect(pwaManager.getDevicePlatform()).toBe('ios');

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(true);
  });

  // 11. iPadOS detection with MacIntel and touch points
  it('correctly identifies iPadOS Safari with desktop UA and touch points', () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    expect(pwaManager.getDevicePlatform()).toBe('ios');
    expect(pwaManager.isIosSafariWithoutPwa()).toBe(true);
  });

  // 12. ProfileScreen UI code audit: Test button removed & single row structure verified
  it('verifies that the ProfileScreen contains a single interactive notifications row without the Test button', () => {
    const profileScreenPath = path.resolve(__dirname, '../screens/ProfileScreen.tsx');
    const content = fs.readFileSync(profileScreenPath, 'utf-8');

    // 1. Single interactive row button
    expect(content).toContain('id="profile_notifications_row"');
    expect(content).toContain('onClick={handleNotificationRowClick}');

    // 2. Test button removed
    expect(content).not.toContain('handleSendTestPush');
    expect(content).not.toContain('isSendingTestPush');
    expect(content).not.toContain('btn_profile_notifications'); // Old nested button removed

    // 3. Blocked notifications bottom sheet present
    expect(content).toContain("activeSheet === 'notificationsBlocked'");
    expect(content).toContain('id="btn_dismiss_blocked_notifications_sheet"');

    // 4. iOS PWA sheet present
    expect(content).toContain("activeSheet === 'iosPwaInstructions'");
    expect(content).toContain('id="btn_dismiss_ios_pwa_sheet"');

    // 5. Visibility and focus reconciliation listeners present
    expect(content).toContain("document.addEventListener('visibilitychange'");
    expect(content).toContain("window.addEventListener('focus'");
  });
});
