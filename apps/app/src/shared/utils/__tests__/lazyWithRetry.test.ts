import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, createRetryableLoader, lazyWithRetry } from '../lazyWithRetry';
import { pwaManager } from '../../pwa/pwaService';

describe('lazyWithRetry and Chunk Mismatch Recovery', () => {
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

  describe('isChunkLoadError detection', () => {
    it('detects Chromium/V8 dynamically imported module failure', () => {
      const err = new TypeError('Failed to fetch dynamically imported module: https://planless.life/assets/OnboardingFlow-DEi6I_Wc.js');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('detects Webpack chunk loading failure', () => {
      const err = new Error('Loading chunk 404 failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('detects Webkit / Safari module script failure', () => {
      const err = new TypeError('Importing a module script failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('detects general Failed to fetch dynamic module error', () => {
      const err = new Error('Failed to fetch module');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('returns false for unrelated application runtime errors', () => {
      const err = new TypeError('Cannot read properties of undefined (reading "title")');
      expect(isChunkLoadError(err)).toBe(false);
    });

    it('returns false for null or undefined', () => {
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });
  });

  describe('createRetryableLoader dynamic recovery', () => {
    it('resolves component when import succeeds without error', async () => {
      const DummyComp = () => React.createElement('div', null, 'Hello Test');
      const importFn = vi.fn().mockResolvedValue({ default: DummyComp });

      const loader = createRetryableLoader(importFn, 'TestComp');
      const loadedModule = await loader();

      expect(loadedModule.default).toBe(DummyComp);
      expect(importFn).toHaveBeenCalledTimes(1);
    });

    it('performs one-time recovery via forceHardUpdate when chunk mismatch occurs', async () => {
      const hardUpdateSpy = vi.spyOn(pwaManager, 'forceHardUpdate').mockResolvedValue(undefined);

      const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://planless.life/assets/OnboardingFlow-DEi6I_Wc.js');
      const importFn = vi.fn().mockRejectedValue(chunkErr);

      const loader = createRetryableLoader(importFn, 'OnboardingFlow');
      loader();
      await new Promise((r) => setTimeout(r, 10));

      // Verify that recovery was triggered and attempt tracked
      expect(hardUpdateSpy).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('planless_chunk_retry_OnboardingFlow')).not.toBeNull();

      hardUpdateSpy.mockRestore();
    });

    it('prevents infinite reload loops when chunk fails again after recovery attempt', async () => {
      const hardUpdateSpy = vi.spyOn(pwaManager, 'forceHardUpdate').mockResolvedValue(undefined);

      // Simulate that a reload attempt just occurred 2 seconds ago
      sessionStorage.setItem('planless_chunk_retry_OnboardingFlow', String(Date.now() - 2000));

      const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://planless.life/assets/OnboardingFlow-DEi6I_Wc.js');
      const importFn = vi.fn().mockRejectedValue(chunkErr);

      const loader = createRetryableLoader(importFn, 'OnboardingFlow');

      // Second failure within 30 seconds should NOT trigger forceHardUpdate and must throw error
      await expect(loader()).rejects.toThrow(chunkErr);
      expect(hardUpdateSpy).not.toHaveBeenCalled();

      hardUpdateSpy.mockRestore();
    });

    it('rethrows genuine non-chunk errors immediately without triggering recovery', async () => {
      const hardUpdateSpy = vi.spyOn(pwaManager, 'forceHardUpdate').mockResolvedValue(undefined);

      const syntaxErr = new ReferenceError('foo is not defined in OnboardingFlow');
      const importFn = vi.fn().mockRejectedValue(syntaxErr);

      const loader = createRetryableLoader(importFn, 'OnboardingFlow');

      await expect(loader()).rejects.toThrow(syntaxErr);
      expect(hardUpdateSpy).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('planless_chunk_retry_OnboardingFlow')).toBeNull();

      hardUpdateSpy.mockRestore();
    });

    it('lazyWithRetry returns a valid React lazy exotic component', () => {
      const DummyComp = () => React.createElement('div', null, 'Hello Lazy');
      const LazyComp = lazyWithRetry(() => Promise.resolve({ default: DummyComp }), 'OnboardingFlow');
      expect(LazyComp).toBeDefined();
      expect(typeof LazyComp).toBe('object');
    });
  });
});
