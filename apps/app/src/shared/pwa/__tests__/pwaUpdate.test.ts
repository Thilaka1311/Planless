import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pwaManager } from '../pwaService';

describe('PWA Service and Update Lifecycle', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).sessionStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    };
  });

  it('initializes with no update pending', () => {
    expect(pwaManager.getHasUpdate()).toBe(false);
  });

  it('notifies subscribers when an update is available', () => {
    let receivedUpdateState: boolean | null = null;
    const unsubscribe = pwaManager.subscribe((hasUpdate) => {
      receivedUpdateState = hasUpdate;
    });

    expect(receivedUpdateState).toBe(false);

    // Simulate internal update discovery
    (pwaManager as any).setHasUpdate(true);
    expect(receivedUpdateState).toBe(true);
    expect(pwaManager.getHasUpdate()).toBe(true);

    unsubscribe();

    // Reset back
    (pwaManager as any).setHasUpdate(false);
    expect(pwaManager.getHasUpdate()).toBe(false);
  });

  it('triggers updateServiceWorker and skipWaiting when updateApp is called', async () => {
    const mockUpdateSw = vi.fn().mockResolvedValue(undefined);
    (pwaManager as any).updateSwFn = mockUpdateSw;
    (pwaManager as any).isUpdating = false;

    sessionStorage.setItem('planless_update_dismissed', 'true');

    await pwaManager.updateApp();

    expect(mockUpdateSw).toHaveBeenCalledWith(true);
    // Dismissal flag should be cleared so future updates can be shown
    expect(sessionStorage.getItem('planless_update_dismissed')).toBeNull();
  });

  it('calls registration.update() when checkForUpdate is executed', () => {
    const mockRegistration = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    (pwaManager as any).registration = mockRegistration;

    pwaManager.checkForUpdate();

    expect(mockRegistration.update).toHaveBeenCalled();
  });

  it('renders PwaUpdatePrompt when update is ready and hides when dismissed', async () => {
    const { renderToString } = await import('react-dom/server');
    const { PwaUpdatePrompt } = await import('../PwaUpdatePrompt');

    // 1. When no update: renders empty
    (pwaManager as any).setHasUpdate(false);
    const htmlNoUpdate = renderToString(React.createElement(PwaUpdatePrompt));
    expect(htmlNoUpdate).toBe('');

    // 2. When update is ready: renders prompt with New version available and Update button
    (pwaManager as any).setHasUpdate(true);
    const htmlWithUpdate = renderToString(React.createElement(PwaUpdatePrompt));
    expect(htmlWithUpdate).toContain('New version available');
    expect(htmlWithUpdate).toContain('Update');

    // 3. When dismissed: does not render
    sessionStorage.setItem('planless_update_dismissed', 'true');
    const htmlDismissed = renderToString(React.createElement(PwaUpdatePrompt));
    expect(htmlDismissed).toBe('');

    // Cleanup
    (pwaManager as any).setHasUpdate(false);
  });
});
