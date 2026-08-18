import React from "react";
import { ArrowRight, ArrowLeft, Users, Sparkles, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

interface StoryStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function StoryStep3({ onNext, onBack }: StoryStepProps) {
  return (
    <div className="flex flex-col h-full justify-between py-6 text-left">
      <div className="flex-1 flex flex-col justify-center gap-8 py-6">
        <motion.div
          className="w-64 h-64 mx-auto flex flex-col justify-center items-center relative"
          initial={{ rotate: -45, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="relative z-10 flex items-center justify-center animate-bounce" style={{ animationDuration: "2s" }}>
            <CheckCircle2 className="w-64 h-64 text-white" style={{ strokeWidth: 1 }} />
          </div>
        </motion.div>

        <div className="space-y-3">
          <h1 className="text-3xl font-sans font-bold tracking-tight text-white leading-tight">
            Connection, simplified.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed font-sans">
            Set your vibe, see who's free, and make hangouts happen in the real world. Simple as that. Let's create your account.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-auto pt-4 pb-2">
        <button
          onClick={onNext}
          className="w-full py-4 px-6 rounded-xl bg-white hover:bg-zinc-150 text-black font-semibold text-[14px] tracking-wide transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Claim Your Username</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
