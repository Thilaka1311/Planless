import React from "react";
import { ArrowRight, ArrowLeft, Calendar, Clock, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

interface StoryStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function StoryStep2({ onNext, onBack, onSkip }: StoryStepProps) {
  return (
    <div className="flex flex-col h-full justify-between py-6 text-left">
      <div className="flex-1 flex flex-col justify-center gap-8 py-6">
        <motion.div
          className="w-64 h-64 mx-auto flex flex-col justify-center items-center relative"
          initial={{ rotate: -45, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 45, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="relative z-10 flex items-center justify-center">
            <Clock className="w-64 h-64 text-white animate-spin" style={{ animationDuration: "16s", strokeWidth: 1 }} />
          </div>
        </motion.div>

        <div className="space-y-3">
          <h1 className="text-3xl font-sans font-bold tracking-tight text-white leading-tight">
            Escape the calendar complex.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed font-sans">
            Ditch the endless scheduling threads, overlapping invites, and flaky promises. Planless helps you gather spontaneously, zero planning required.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-auto pt-4 pb-2">
        <button
          onClick={onNext}
          className="w-full py-4 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-[14px] tracking-wide transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
