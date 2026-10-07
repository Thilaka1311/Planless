if (typeof window !== "undefined") {
  if (!window.crypto) {
    (window as any).crypto = {} as any;
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    } as any;
  }

  // Clean up cache-busting _v query parameter from browser address bar once app boots
  if (window.location.search && window.location.search.includes('_v=')) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('_v');
      const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(null, '', cleanUrl);
    } catch {}
  }

  // Intercept Vite dynamic chunk preload errors (triggered when a deployment changes chunk hashes)
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite] Chunk preload error detected, executing controlled recovery reload:', event);
    const lastReload = sessionStorage.getItem('planless_preload_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 30000) {
      sessionStorage.setItem('planless_preload_reload', String(now));
      pwaManager.forceHardUpdate();
    }
  });
}

import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { pwaManager } from './shared/pwa/pwaService';
import { PwaUpdatePrompt } from './shared/pwa/PwaUpdatePrompt';
import { isChunkLoadError } from './shared/utils/lazyWithRetry';

// Initialize PWA lifecycle management and update listener
pwaManager.init();
import planlessLogo from './assets/planless_logo.webp';
import { preloadImage } from './shared/imaging/preloadImage';
import { preloadCoreStaticAssets } from './shared/assets/coreStaticAssets';

// Module-level eager warmup: start fetching and decoding Planless logo and core static assets
if (typeof window !== "undefined") {
  preloadImage(planlessLogo);
  preloadCoreStaticAssets();
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  hasUpdate: boolean;
  isUpdating: boolean;
}

export class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private unsubscribePwa: (() => void) | null = null;

  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    hasUpdate: pwaManager.getHasUpdate(),
    isUpdating: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidMount() {
    this.unsubscribePwa = pwaManager.subscribe((hasUpdate) => {
      this.setState({ hasUpdate });
    });
  }

  public componentWillUnmount() {
    if (this.unsubscribePwa) {
      this.unsubscribePwa();
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught application error:", error, errorInfo);

    const isChunkMismatch = isChunkLoadError(error);

    // Auto-recover once on chunk mismatch caused by fresh deployment
    if (isChunkMismatch && typeof window !== "undefined") {
      const lastAttempt = sessionStorage.getItem("planless_chunk_auto_reload");
      const now = Date.now();
      if (!lastAttempt || now - parseInt(lastAttempt, 10) > 30000) {
        sessionStorage.setItem("planless_chunk_auto_reload", String(now));
        console.log("[RootErrorBoundary] Chunk error detected, auto-reloading to latest deployment...");
        pwaManager.forceHardUpdate();
      }
    }
  }

  private handleHardReload = async () => {
    this.setState({ isUpdating: true });
    try {
      sessionStorage.removeItem("planless_chunk_auto_reload");
      sessionStorage.removeItem("planless_preload_reload");
    } catch {}
    if (pwaManager.getHasUpdate()) {
      await pwaManager.updateApp();
    } else {
      await pwaManager.forceHardUpdate();
    }
  };

  private handleResetSession = async () => {
    this.setState({ isUpdating: true });
    try {
      if (typeof localStorage !== "undefined") {
        const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith("planless_"));
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      }
      sessionStorage.removeItem("planless_chunk_auto_reload");
      sessionStorage.removeItem("planless_preload_reload");
    } catch {}
    await pwaManager.forceHardUpdate();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError = isChunkLoadError(this.state.error);
      const isUpdateAvailable = this.state.hasUpdate || isChunkError;

      return (
        <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 text-center font-sans select-none relative overflow-hidden">
          {/* Subtle Ambient Background */}
          <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#ff5e3a]/10 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

          <div className="relative z-10 max-w-sm w-full flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#ff5e3a] mb-6 shadow-xl">
              {isUpdateAvailable ? (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            <h2 className="text-xl font-bold tracking-tight text-white mb-2">
              {isUpdateAvailable ? "Update Available" : "Something went wrong"}
            </h2>

            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              {isUpdateAvailable
                ? "A new version of Planless was deployed. Tap Update to load the latest build and continue."
                : "Planless encountered an unexpected issue. Reload to clear the local cache and recover."}
            </p>

            <div className="w-full flex flex-col space-y-2.5">
              <button
                type="button"
                onClick={this.handleHardReload}
                disabled={this.state.isUpdating}
                className="w-full py-3.5 px-6 rounded-xl bg-[#ff5e3a] hover:bg-[#e05230] text-white font-semibold text-sm transition-all shadow-lg shadow-[#ff5e3a]/25 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {this.state.isUpdating
                  ? "Updating Planless..."
                  : isUpdateAvailable
                  ? "Update to Latest Version"
                  : "Reload & Clear Cache"}
              </button>

              <button
                type="button"
                onClick={this.handleResetSession}
                disabled={this.state.isUpdating}
                className="w-full py-3 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-sm transition-all border border-zinc-800 active:scale-[0.98] cursor-pointer"
              >
                Reset Session & Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <PwaUpdatePrompt />
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
}
