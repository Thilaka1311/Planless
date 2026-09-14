import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  const showToast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastMessage(message);
    timerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[250] px-4 py-2.5 rounded-full bg-[#1C1C1E]/95 border border-white/10 shadow-2xl backdrop-blur-xl flex items-center gap-2 pointer-events-none"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-white tracking-tight">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  return useContext(ToastContext) || defaultToastContext;
}

