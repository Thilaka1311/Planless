import React, { createContext, useContext } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (message: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const noopToast = (_message: string) => {};
const defaultToastContext: ToastContextValue = { showToast: noopToast };

const ToastContext = createContext<ToastContextValue>(defaultToastContext);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastContext.Provider value={defaultToastContext}>
      {children}
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  return useContext(ToastContext) || defaultToastContext;
}

