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
    expect(NOTIFICATION_STATUS_TEXT.active).toBe('Enabled on this device');
    expect(NOTIFICATION_STATUS_TEXT.denied).toBe('Blocked in browser settings');
    expect(NOTIFICATION_STATUS_TEXT.unsupported).toBe('Notifications unavailable in this browser');
    expect(NOTIFICATION_STATUS_TEXT.failed).toBe('Setup failed · Tap to retry');
    expect(NOTIFICATION_STATUS_TEXT.disabled).toBe('Tap to enable notifications');
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

    // 6. Permissions API change listener present
    expect(content).toContain("navigator.permissions.query");

    // 7. Platform-adaptive sheet content present
    expect(content).toContain("pwaManager.getDevicePlatform()");
    expect(content).toContain("pwaManager.isStandalone()");
    expect(content).toContain("Enable Notifications in Settings");
    expect(content).toContain("Enable in Browser Settings");

    // 8. Neutral styling verified: no green styling or ON/OFF badge in notifications row
    expect(content).not.toContain('text-emerald-');
    expect(content).not.toContain('>ON</span>');
    expect(content).not.toContain('>OFF</span>');
  });

  // 13. Scenario 1 & 2: Android Chrome permission denied
  it('Scenario 2: flags permissionDenied when Android Chrome user blocks notifications in site settings', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    });
    setMockNotification({
      permission: 'denied',
    });

    const detailedPerm = await pwaManager.getDetailedPermissionState();
    expect(detailedPerm).toBe('denied');

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBe(true);
    expect(pwaManager.getDevicePlatform()).toBe('android');
    expect(pwaManager.isStandalone()).toBe(false);
  });

  // 14. Scenario 3: Installed Android PWA with notifications disabled at OS level
  it('Scenario 3: handles installed Android PWA when Android 13+ OS notification permission is blocked', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            // When OS notifications are blocked on Android 13+, subscribe throws NotAllowedError
            subscribe: vi.fn().mockRejectedValue(new DOMException('Registration failed - permission denied', 'NotAllowedError')),
          },
        }),
      },
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    setMockNotification({
      permission: 'granted', // Browser permission may appear granted while OS blocks it
    });

    expect(pwaManager.getDevicePlatform()).toBe('android');
    expect(pwaManager.isStandalone()).toBe(true);

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBe(true);
    expect(result.error).toContain('Notification permission was denied or blocked by device settings');
  });

  // 15. Scenario 4: iOS Home Screen PWA with permission denied
  it('Scenario 4: handles iOS Home Screen PWA permission denied and routes to settings guidance', async () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      standalone: true,
    });
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    setMockNotification({
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    expect(pwaManager.getDevicePlatform()).toBe('ios');
    expect(pwaManager.isStandalone()).toBe(true);
    expect(pwaManager.isIosSafariWithoutPwa()).toBe(false);

    const detailedPerm = await pwaManager.getDetailedPermissionState();
    expect(detailedPerm).toBe('denied');

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBe(true);
  });

  // 16. Scenario 6: Permission granted but subscription missing — registration is attempted
  it('Scenario 6: attempts pushManager.subscribe when permission is granted but subscription is missing', async () => {
    const subscribeSpy = vi.fn().mockResolvedValue(mockPushSubscription);
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: subscribeSpy,
          },
        }),
      },
    });
    setMockNotification({
      permission: 'granted',
    });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(subscribeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
      })
    );
    expect(result.success).toBe(true);
  });

  // 17. Scenario 8: Registration failure does not mark notifications enabled
  it('Scenario 8: ensures registration failure returns error without claiming active status', async () => {
    setMockNavigator({
      serviceWorker: {
        ready: Promise.resolve({
          active: {} as any,
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockRejectedValue(new Error('Network error connecting to push service')),
          },
        }),
      },
    });
    setMockNotification({
      permission: 'granted',
    });

    const result = await pwaManager.subscribeToPush('test-user-uuid');
    expect(result.success).toBe(false);
    expect(result.permissionDenied).toBeFalsy();
    expect(result.error).toContain('Network error connecting to push service');
  });

  // 18. Scenario 9: Permissions API query cross-check where supported
  it('Scenario 9: getDetailedPermissionState cross-checks navigator.permissions.query', async () => {
    setMockNotification({
      permission: 'default',
    });

    const mockPermissionsQuery = vi.fn().mockResolvedValue({ state: 'denied', onchange: null });
    (globalThis as any).navigator.permissions = {
      query: mockPermissionsQuery,
    };

    const state = await pwaManager.getDetailedPermissionState();
    expect(mockPermissionsQuery).toHaveBeenCalledWith({ name: 'notifications' });
    expect(state).toBe('denied');
  });

  // 19. Scenario 10: Existing notification delivery payload structure preserved
  it('Scenario 10: preserves existing database payload format with endpoint, auth, p256dh, and platform', async () => {
    setMockNotification({
      permission: 'granted',
    });

    await pwaManager.subscribeToPush('test-user-uuid');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'test-user-uuid',
        endpoint: mockPushSubscription.endpoint,
        p256dh: 'mock-p256dh-key',
        auth: 'mock-auth-secret',
        platform: expect.stringMatching(/^(ios|android|desktop)$/),
        is_active: true,
        last_seen_at: expect.any(String),
      }),
      { onConflict: 'endpoint' }
    );
  });
});
