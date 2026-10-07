import React from 'react';
import { pwaManager } from '../pwa/pwaService';

/**
 * Detects whether an error thrown during dynamic import is a chunk loading /
 * deployment mismatch error (e.g., stale hash returning 404 from CDN/Vercel).
 */
export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const msg = (error?.message || error?.name || String(error)).toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('failed to fetch') ||
    msg.includes('importing a module script') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('chunkloaderror')
  );
}

/**
 * Creates a retryable async module loader that intercepts dynamic chunk errors,
 * executes a controlled one-time hard update, and prevents infinite loops.
 */
export function createRetryableLoader<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>,
  chunkName = 'chunk'
): () => Promise<{ default: T } | any> {
  return async () => {
    const retryKey = `planless_chunk_retry_${chunkName}`;
    try {
      const module = await factory();
      // On successful module load, clean up the retry key if present
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(retryKey);
      }
      return module;
    } catch (err: any) {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        const lastRetry = sessionStorage.getItem(retryKey);
        const now = Date.now();
        // Allow at most one auto-reload recovery within a 30-second window
        if (!lastRetry || now - parseInt(lastRetry, 10) > 30000) {
          sessionStorage.setItem(retryKey, String(now));
          console.warn(
            `[lazyWithRetry] Stale chunk mismatch detected for "${chunkName}". Performing controlled recovery reload to latest deployment:`,
            err
          );
          await pwaManager.forceHardUpdate();
          // Keep promise pending so React Suspense renders the fallback during the navigation
          return new Promise<never>(() => {});
        }
      }
      // Not a chunk error or already retried: throw genuine error
      throw err;
    }
  };
}

/**
 * Resilient wrapper around React.lazy for code-split chunks.
 * If a chunk fails to load due to a stale hash after a new Vercel deployment:
 * 1. Checks if a recovery reload was already attempted for this module.
 * 2. If not, performs a controlled ONE-TIME recovery into the latest deployment.
 * 3. If already attempted, rethrows the error to the ErrorBoundary to prevent infinite reload loops.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>,
  chunkName = 'chunk'
): React.LazyExoticComponent<T> {
  return React.lazy(createRetryableLoader(factory, chunkName));
}
