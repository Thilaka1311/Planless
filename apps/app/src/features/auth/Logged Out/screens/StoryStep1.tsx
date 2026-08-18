import React from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

interface StoryStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function StoryStep1({ onNext, onSkip }: StoryStepProps) {
  return (
    <div className="flex flex-col h-full justify-between py-6 text-left">
      <div className="flex-1 flex flex-col justify-center gap-8 py-6">
        <motion.div
          className="w-64 h-64 mx-auto relative flex items-center justify-center bg-transparent"
          initial={{ rotate: 0, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 45, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <motion.img
            src="/vitruvian-man.png"
            className="w-full h-full object-contain scale-105 filter invert"
            alt="Interests"
          />
        </motion.div>

        <div className="space-y-3">
          <h1 className="text-3xl font-sans font-bold tracking-tight text-white leading-tight">
            You contain multitudes.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed font-sans">
            Movies, dining, gaming, football - you're ready for anything. But finding the right people at the right time shouldn't feel like a chore.
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
