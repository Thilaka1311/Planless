import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { normalizeStatus } from "../../../../lib/participantStatus";

export interface LiveActionButtonProps {
  myParticipantRecord?: any;
  className?: string;
  onClick?: () => void;
  isCancelled?: boolean;
  isCompleted?: boolean;
  isManagementExpired?: boolean;
}

export const LiveActionButton: React.FC<LiveActionButtonProps> = ({
  myParticipantRecord,
  className = "",
  onClick,
  isCancelled = false,
  isCompleted = false,
  isManagementExpired = false,
}) => {
  if (!myParticipantRecord && !isCancelled && !isCompleted) return null;

  const status = myParticipantRecord ? normalizeStatus(myParticipantRecord.rsvp_status) : undefined;
  const skipReason = myParticipantRecord?.skip_reason;

  let text = '';
  let dotColor = 'bg-zinc-400';
  let glassStyle = {
    backgroundColor: 'rgba(24, 24, 27, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    textColor: 'text-zinc-200',
  };

  const isHostRole = Boolean(myParticipantRecord?.role === "HOST" || myParticipantRecord?.isHost === true);

  if (isCancelled) {
    text = "Plan Cancelled";
    dotColor = 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]';
    glassStyle = {
      backgroundColor: 'rgba(136, 19, 55, 0.28)',
      borderColor: 'rgba(244, 63, 94, 0.25)',
      textColor: 'text-rose-200',
    };
  } else if (isCompleted) {
    text = "Completed";
    dotColor = 'bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.3)]';
    glassStyle = {
      backgroundColor: 'rgba(24, 24, 27, 0.65)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textColor: 'text-zinc-400',
    };
  } else if (isHostRole) {
    text = "You're Hosting";
    dotColor = 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]';
    glassStyle = {
      backgroundColor: 'rgba(24, 24, 27, 0.65)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textColor: 'text-zinc-200',
    };
  } else if (status === 'INVITED') {
    text = "You're Invited";
    dotColor = 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]';
    glassStyle = {
      backgroundColor: 'rgba(30, 58, 138, 0.28)',
      borderColor: 'rgba(59, 130, 246, 0.25)',
      textColor: 'text-blue-200',
    };
  } else if (status === 'JOINED') {
    if (myParticipantRecord?.leave_requested) {
      text = "Leave Request Pending";
      dotColor = 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]';
      glassStyle = {
        backgroundColor: 'rgba(120, 53, 15, 0.3)',
        borderColor: 'rgba(245, 158, 11, 0.25)',
        textColor: 'text-amber-200',
      };
    } else {
      text = "You're Going";
      dotColor = 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]';
      glassStyle = {
        backgroundColor: 'rgba(6, 78, 59, 0.32)',
        borderColor: 'rgba(16, 185, 129, 0.25)',
        textColor: 'text-emerald-200',
      };
    }
  } else if (status === 'WAITLISTED') {
    text = "You're Waitlisted";
    dotColor = 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]';
    glassStyle = {
      backgroundColor: 'rgba(120, 53, 15, 0.3)',
      borderColor: 'rgba(245, 158, 11, 0.25)',
      textColor: 'text-amber-200',
    };
  } else if (status === 'SKIPPED') {
    if (skipReason === 'REMOVED') {
      text = "You've Been Removed";
      dotColor = 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]';
      glassStyle = {
        backgroundColor: 'rgba(136, 19, 55, 0.28)',
        borderColor: 'rgba(244, 63, 94, 0.25)',
        textColor: 'text-rose-200',
      };
    } else {
      text = "You're Not Attending";
      dotColor = 'bg-zinc-400';
      glassStyle = {
        backgroundColor: 'rgba(39, 39, 42, 0.45)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        textColor: 'text-zinc-300',
      };
    }
  } else {
    return null;
  }

  const isInteractive = Boolean(onClick && (!isCompleted || isHostRole));
  const showDot = Boolean(isHostRole || isCancelled || isCompleted);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileTap={isInteractive ? { scale: 0.96 } : undefined}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      style={{
        backgroundColor: glassStyle.backgroundColor,
        borderColor: glassStyle.borderColor,
      }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-full border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex items-center justify-center gap-2.5 max-w-[90vw] select-none transition-all duration-300 ${isInteractive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${className}`}
    >
      {showDot && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor} transition-colors duration-300`} />
      )}
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2 }}
          className={`text-[13px] font-sans font-semibold tracking-wide whitespace-nowrap ${glassStyle.textColor}`}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveActionButton;
