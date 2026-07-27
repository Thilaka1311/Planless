import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown } from 'lucide-react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

interface DisplacedHostModalProps {
  isOpen: boolean;
  hostName: string;
  hostAvatar?: string;
  onMoveToWaitlist: () => void;
  onCancel: () => void;
}

export const DisplacedHostModal: React.FC<DisplacedHostModalProps> = ({
  isOpen,
  hostName,
  hostAvatar,
  onMoveToWaitlist,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto"
        />

        {/* Compact Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-[340px] bg-[#1C1C1E] border border-white/10 rounded-3xl p-5 shadow-2xl z-10 text-center font-sans overflow-hidden pointer-events-auto flex flex-col items-center"
        >
          {/* Avatar with Host Crown Badge Overlay */}
          <div className="relative mb-3 flex-shrink-0">
            <UserAvatar
              src={hostAvatar}
              alt={hostName}
              size="w-12 h-12"
              className="border border-white/15 shadow-md"
            />
            <div className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-[#F59E0B] border border-black flex items-center justify-center shadow-sm">
              <Crown className="w-2.5 h-2.5 text-black" fill="currentColor" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[16px] font-bold text-white mb-1.5 leading-snug">
            Move {hostName} to the waitlist?
          </h3>

          {/* Description — concise 2 lines max */}
          <p className="text-[12.5px] text-zinc-400 leading-relaxed mb-5 px-1">
            They'll lose their host privileges and become a participant.
          </p>

          {/* Action Buttons: Primary (Warning Yellow) & Secondary (Cancel) */}
          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={onMoveToWaitlist}
              className="w-full py-3 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#e08e00] text-black text-[14px] font-bold active:scale-[0.98] transition cursor-pointer shadow-md"
            >
              Move to Waitlist
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white/70 text-[14px] font-medium active:scale-[0.98] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
