import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, X } from 'lucide-react';
import { usePwaUpdate } from './usePwaUpdate';

export const PwaUpdatePrompt: React.FC = () => {
  const { needRefresh, isUpdating, updateApp, dismissUpdate } = usePwaUpdate();

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          id="pwa_update_prompt"
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          className="fixed left-1/2 -translate-x-1/2 z-[9999] max-w-[calc(100vw-32px)] w-auto px-3.5 py-2 rounded-2xl bg-[#18181b]/95 border border-white/10 shadow-2xl backdrop-blur-xl flex items-center gap-2.5 text-white select-none pointer-events-auto"
          role="alert"
          aria-live="polite"
        >
          {isUpdating ? (
            <div className="flex items-center gap-2 py-0.5 px-1">
              <RefreshCw
                className="w-3.5 h-3.5 animate-spin shrink-0"
                style={{ color: '#ff5e3a', stroke: '#ff5e3a' }}
              />
              <span className="text-[13px] font-medium text-white/90 whitespace-nowrap">
                Updating…
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ff5e3a] animate-pulse shrink-0" />
                <span className="text-[13px] font-medium text-white/90 whitespace-nowrap">
                  New version available
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  id="btn_pwa_update_now"
                  onClick={updateApp}
                  className="px-3 py-1 bg-[#ff5e3a] hover:bg-[#e05230] active:scale-95 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-[#ff5e3a]/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Update</span>
                </button>
                <button
                  type="button"
                  id="btn_pwa_update_dismiss"
                  onClick={dismissUpdate}
                  className="p-1 text-white/40 hover:text-white/80 active:scale-90 transition-colors cursor-pointer rounded-lg"
                  aria-label="Dismiss update banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
