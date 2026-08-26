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
}


import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

if (import.meta.env.DEV && typeof window !== "undefined") {
  if ("serviceWorker" in navigator) {
    const isControlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    // If the current page was served from an old service worker cache, reload once to fetch fresh from Vite
    if (isControlled && !sessionStorage.getItem("sw_evicted")) {
      sessionStorage.setItem("sw_evicted", "true");
      window.location.reload();
    }
  }
} else if (typeof window !== "undefined") {
  registerSW({ immediate: true });
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
