import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RootErrorBoundary } from '../../../main';
import { pwaManager } from '../pwaService';

describe('RootErrorBoundary UI and Update Behavior', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    const store: Record<string, string> = {};
    (globalThis as any).sessionStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    };
  });

  it('renders children when there is no error', () => {
    const html = renderToString(
      React.createElement(
        RootErrorBoundary,
        null,
        React.createElement('div', { id: 'app_root' }, 'Application Active')
      )
    );
    expect(html).toContain('Application Active');
    expect(html).not.toContain('Update Available');
  });

  it('renders Update Available screen on chunk load error without Diagnostics section', () => {
    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    boundary.state = {
      hasError: true,
      error: new TypeError('Failed to fetch dynamically imported module: https://planless.life/assets/OnboardingFlow-DEi6I_Wc.js'),
      hasUpdate: false,
      isUpdating: false,
    };

    const rendered = boundary.render() as React.ReactElement;
    const html = renderToString(rendered);

    // Verify key elements from requirement G
    expect(html).toContain('Update Available');
    expect(html).toContain('A new version of Planless was deployed. Tap Update to load the latest build and continue.');
    expect(html).toContain('Update to Latest Version');
    expect(html).toContain('Reset Session &amp; Sign In');

    // CRITICAL: Must NOT contain Diagnostics expandable section
    expect(html).not.toContain('Diagnostics');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
  });

  it('componentDidCatch triggers forceHardUpdate on first chunk error and throttles repeat errors', () => {
    const hardUpdateSpy = vi.spyOn(pwaManager, 'forceHardUpdate').mockResolvedValue(undefined);

    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    const chunkError = new TypeError('Failed to fetch dynamically imported module: /assets/OnboardingFlow-xyz.js');

    // First error: should record timestamp and call forceHardUpdate
    boundary.componentDidCatch(chunkError, { componentStack: '' });
    expect(hardUpdateSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('planless_chunk_auto_reload')).not.toBeNull();

    // Second immediate error: should be throttled to prevent reload loop
    hardUpdateSpy.mockClear();
    boundary.componentDidCatch(chunkError, { componentStack: '' });
    expect(hardUpdateSpy).not.toHaveBeenCalled();

    hardUpdateSpy.mockRestore();
  });

  it('renders Something went wrong with Reload and Return to Home on generic runtime error', () => {
    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    boundary.state = {
      hasError: true,
      error: new TypeError("Cannot read properties of undefined (reading 'filter')"),
      hasUpdate: false,
      isUpdating: false,
    };

    const rendered = boundary.render() as React.ReactElement;
    const html = renderToString(rendered);

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Planless encountered an unexpected issue. Tap Reload to refresh the screen, or return to Home.');
    expect(html).toContain('Reload Planless');
    expect(html).toContain('Return to Home');

    // Must NOT offer destructive session reset or cache wipe for runtime code exceptions
    expect(html).not.toContain('Reset Session &amp; Sign In');
    expect(html).not.toContain('Reload &amp; Clear Cache');
  });

  it('handleNormalReload records reload count and triggers reload on first attempt', () => {
    const reloadMock = vi.fn();
    (globalThis as any).window.location = {
      href: '/plans?id=broken',
      reload: reloadMock,
    };

    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    boundary.state = {
      hasError: true,
      error: new Error('Runtime error'),
      hasUpdate: false,
      isUpdating: false,
    };

    (boundary as any).handleNormalReload();

    expect(sessionStorage.getItem('planless_error_reload_count')).toBe('1');
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect((globalThis as any).window.location.href).toBe('/plans?id=broken');
  });

  it('handleNormalReload breaks reload loop by redirecting to / on repeated failure', () => {
    sessionStorage.setItem('planless_error_reload_count', '1');
    const reloadMock = vi.fn();
    (globalThis as any).window.location = {
      href: '/plans?id=broken',
      reload: reloadMock,
    };

    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    boundary.state = {
      hasError: true,
      error: new Error('Runtime error'),
      hasUpdate: false,
      isUpdating: false,
    };

    (boundary as any).handleNormalReload();

    // Reload count should be cleared and location redirected to root
    expect(sessionStorage.getItem('planless_error_reload_count')).toBeNull();
    expect(reloadMock).not.toHaveBeenCalled();
    expect((globalThis as any).window.location.href).toBe('/');
  });

  it('handleReturnHome redirects to / and clears reload count', () => {
    sessionStorage.setItem('planless_error_reload_count', '1');
    (globalThis as any).window.location = {
      href: '/plans?id=broken',
    };

    const boundary = new RootErrorBoundary({ children: React.createElement('div') });
    (boundary as any).handleReturnHome();

    expect(sessionStorage.getItem('planless_error_reload_count')).toBeNull();
    expect((globalThis as any).window.location.href).toBe('/');
  });
});

