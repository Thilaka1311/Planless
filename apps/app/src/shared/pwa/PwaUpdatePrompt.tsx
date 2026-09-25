import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw } from 'lucide-react';
import { usePwaUpdate } from './usePwaUpdate';

export const PwaUpdatePrompt: React.FC = () => {
  const { needRefresh, isUpdating, updateApp, dismissUpdate } = usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <AnimatePresence>
      <motion.div
        id="pwa_update_prompt"
        initial={{ opacity: 0, y: -24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -24, scale: 0.96 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] max-w-[calc(100vw-32px)] w-auto px-4 py-2.5 rounded-2xl bg-[#18181b]/95 border border-white/10 shadow-2xl backdrop-blur-xl flex items-center gap-3 text-white select-none pointer-events-auto"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ff5e3a] animate-pulse shrink-0" />
          <span className="text-[13px] font-medium text-white/90 whitespace-nowrap">
            New version available
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="btn_pwa_update_now"
            onClick={updateApp}
            disabled={isUpdating}
            className="px-3 py-1 bg-[#ff5e3a] hover:bg-[#e05230] active:scale-95 disabled:opacity-70 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-[#ff5e3a]/20 flex items-center gap-1.5 cursor-pointer"
          >
            {isUpdating && <RefreshCw className="w-3 h-3 animate-spin shrink-0" />}
            <span>{isUpdating ? 'Updating...' : 'Update'}</span>
          </button>

          <button
            type="button"
            id="btn_pwa_dismiss_update"
            onClick={dismissUpdate}
            className="text-white/40 hover:text-white/80 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Dismiss update notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
