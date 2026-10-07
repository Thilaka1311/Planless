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
});
