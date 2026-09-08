import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Trophy, Camera, Check, Award, ArrowRight, ArrowLeft, Star } from "lucide-react";
import { Plan, UserProfile } from "../../core/types";
import { usePlansStore } from "../../features/plans/state/PlansContext";
import { useProfileStore } from "../../features/profile/state/ProfileContext";
import { supabase } from "../../../lib/supabaseClient";

interface PlanCompletionModalProps {
  plan: Plan;
  onClose: () => void;
  onPublish: () => void;
  activeUserId: string;
}

export default function PlanCompletionModal({ plan, onClose, onPublish, activeUserId }: PlanCompletionModalProps) {
  const { submitStats, submitMvp, completePlan } = usePlansStore();
  const { dbUsers } = useProfileStore();

  const goingMembers = plan.members.filter(m => m.joinState === "JOINED");

  // Determine Category-Specific Flags
  const titleLower = plan.title.toLowerCase();
  const isBadminton = plan.sports_type === "Badminton" || titleLower.includes("badminton");
  const isFootball = (plan.sports_type === "Football" || titleLower.includes("football") || (plan.category === "sports" && !titleLower.includes("badminton"))) && !isBadminton;
  const isMovie = plan.category === "movies";
  const isDinner = plan.category === "restaurants" || (plan.category as string) === "dining";

  // Flow State
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Common Inputs
  const [rating, setRating] = useState<number>(5);
  const [review, setReview] = useState<string>("");

  // Football/Badminton Inputs
  const [scoreA, setScoreA] = useState<number>(5);
  const [scoreB, setScoreB] = useState<number>(3);
  const [selectedMvpId, setSelectedMvpId] = useState<string | null>(goingMembers[0]?.userId || null);

  const totalSteps = isFootball ? 2 : isBadminton ? 1 : isMovie || isDinner ? 1 : 1;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      const planUuid = plan.dbUuid || plan.id;

      // Determine memory type matching enum: 'football', 'badminton', 'movies', 'dining'
      let memory_type: "football" | "badminton" | "movies" | "dining" = "dining";
      if (isFootball) memory_type = "football";
      else if (isBadminton) memory_type = "badminton";
      else if (isMovie) memory_type = "movies";
      else if (isDinner) memory_type = "dining";

      // 1. Create memories record
      const memoryUuid = crypto.randomUUID();
      const editable_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const memoryRecord = {
        id: memoryUuid,
        plan_id: planUuid,
        memory_type,
        status: "completed",
        created_at: new Date().toISOString(),
        editable_until
      };

      const { data: savedMemRow, error: memErr } = await (supabase as any)
        .from("memories")
        .insert(memoryRecord)
        .select()
        .single();
      if (memErr) {
        throw new Error("Failed to save memory record");
      }
      const memoryId = savedMemRow?.id || memoryUuid;

      // 2. Create memory_results record
      const resultRecord: any = {
        id: crypto.randomUUID(),
        memory_id: memoryId
      };

      if (memory_type === "football") {
        const mvpUuid = (dbUsers || []).find(u => u.user_id === selectedMvpId || u.id === selectedMvpId)?.id || selectedMvpId;
        resultRecord.score_home = scoreA;
        resultRecord.score_away = scoreB;
        resultRecord.mvp_user_id = mvpUuid;
      } else if (memory_type === "badminton") {
        const mvpUuid = (dbUsers || []).find(u => u.user_id === selectedMvpId || u.id === selectedMvpId)?.id || selectedMvpId;
        resultRecord.score_home = null;
        resultRecord.score_away = null;
        resultRecord.mvp_user_id = mvpUuid;
        resultRecord.review = null;
      } else if (memory_type === "movies" || memory_type === "dining") {
        resultRecord.average_rating = rating;
        resultRecord.review = review || null;
      }



      // memory_results table does not exist: bypass DB write
      // const { data: savedResultRow, error: resultErr } = await (supabase as any)
      //   .from("memory_results")
      //   .insert(resultRecord)
      //   .select()
      //   .single();
      // if (resultErr) {
      //   const errObj = new Error(resultErr.message || "Failed to save memory results");
      //   console.error("[MEMORY RESULT ERROR]", errObj);
      //   throw errObj;
      // }
      // const savedResult = savedResultRow;
      const savedResult = null;

      // Save Badminton outcome: outcome_type = mvp_vote
      if (memory_type === "badminton") {
        const mvpUuid = (dbUsers || []).find(u => u.user_id === selectedMvpId || u.id === selectedMvpId)?.id || selectedMvpId;
        if (mvpUuid) {
          await submitMvp(planUuid, activeUserId, mvpUuid);
        }
      }

      // 4. Complete Plan
      const attendanceInput = (plan.members || [])
        .filter((m: any) => m.joinState === "JOINED" || (m as any).rsvp_status === "JOINED")
        .map((m: any) => ({
          user_id: m.userId || m.userUuid || (m as any).user_id || m.id,
          attendance: "ATTENDED" as const,
        }));

      await completePlan(planUuid, attendanceInput);

      onPublish();
    } catch (err: any) {
      console.error("[MEMORY RESULT ERROR]", err);
      console.error("Failed to complete flow:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md text-left select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-[#0F0F13] border border-white/[0.08] rounded-[28px] overflow-hidden flex flex-col shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#ff8b66]" />
            <h3 className="font-sans font-black text-sm uppercase tracking-wider text-white">Complete Plan</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step dots */}
        {totalSteps > 1 && (
          <div className="px-6 pt-4 flex gap-1.5 justify-center">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${idx + 1 <= step ? "bg-[#ff8b66]" : "bg-white/[0.05]"
                  }`}
              />
            ))}
          </div>
        )}

        {/* Viewport */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[60vh] min-h-[300px]">
          <AnimatePresence mode="wait">
            {/* FOOTBALL STEPS */}
            {isFootball && (
              <>
                {step === 1 && (
                  <motion.div key="fb1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                    <div className="text-center space-y-1.5">
                      <h4 className="text-base font-bold text-white">Final Score</h4>
                      <p className="text-[11px] text-zinc-400">Enter final match score (Football)</p>
                    </div>

                    <div className="flex items-center justify-center gap-8 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
                      <div className="text-center space-y-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-455 font-bold">Team A</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setScoreA(p => Math.max(0, p - 1))} className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center hover:bg-zinc-850 text-zinc-400 cursor-pointer">-</button>
                          <span className="text-2xl font-black font-mono text-white w-8 text-center">{scoreA}</span>
                          <button onClick={() => setScoreA(p => p + 1)} className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center hover:bg-zinc-850 text-zinc-450 cursor-pointer">+</button>
                        </div>
                      </div>
                      <span className="text-zinc-650 font-bold">—</span>
                      <div className="text-center space-y-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-455 font-bold">Team B</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setScoreB(p => Math.max(0, p - 1))} className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center hover:bg-zinc-850 text-zinc-400 cursor-pointer">-</button>
                          <span className="text-2xl font-black font-mono text-white w-8 text-center">{scoreB}</span>
                          <button onClick={() => setScoreB(p => p + 1)} className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center hover:bg-zinc-850 text-zinc-450 cursor-pointer">+</button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="fb2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="text-center space-y-1.5">
                      <h4 className="text-base font-bold text-white">Choose MVP</h4>
                      <p className="text-[11px] text-zinc-400">Award the Most Valuable Player award</p>
                    </div>

                    <div className="space-y-2">
                      {goingMembers.map(m => (
                        <button
                          key={m.userId}
                          onClick={() => setSelectedMvpId(m.userId)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer ${selectedMvpId === m.userId ? "bg-[#ff8b66]/10 border-[#ff8b66]" : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <img src={m.avatar} alt="" className="w-8 h-8 rounded-full border border-white/10" />
                            <span className="text-xs font-semibold text-zinc-200">{m.name}</span>
                          </div>
                          {selectedMvpId === m.userId && <Award className="w-4 h-4 text-[#ff8b66]" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {/* BADMINTON STEPS */}
            {isBadminton && (
              <>
                {step === 1 && (
                  <motion.div key="bad1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="text-center space-y-1.5">
                      <h4 className="text-base font-bold text-white">Choose MVP</h4>
                      <p className="text-[11px] text-zinc-400">Award the Most Valuable Player award</p>
                    </div>

                    <div className="space-y-2">
                      {goingMembers.map(m => (
                        <button
                          key={m.userId}
                          onClick={() => setSelectedMvpId(m.userId)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer ${selectedMvpId === m.userId ? "bg-[#ff8b66]/10 border-[#ff8b66]" : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <img src={m.avatar} alt="" className="w-8 h-8 rounded-full border border-white/10" />
                            <span className="text-xs font-semibold text-zinc-200">{m.name}</span>
                          </div>
                          {selectedMvpId === m.userId && <Award className="w-4 h-4 text-[#ff8b66]" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {/* MOVIE / DINNER / GENERIC STEPS */}
            {!isFootball && !isBadminton && (
              <>
                {step === 1 && (
                  <motion.div key="gen1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                    <div className="text-center space-y-1.5">
                      <h4 className="text-base font-bold text-white">
                        {isMovie ? "Rate Movie" : isDinner ? "Rate Experience" : "Rating"}
                      </h4>
                      <p className="text-[11px] text-zinc-400">Log experience rating from 1 to 5 stars</p>
                    </div>

                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className="p-1 hover:scale-110 active:scale-95 transition-all text-zinc-650 hover:text-[#ff8b66] cursor-pointer"
                        >
                          <Star className={`w-9 h-9 ${star <= rating ? "text-[#ff8b66] fill-[#ff8b66]" : "opacity-30"}`} />
                        </button>
                      ))}
                    </div>

                    {(isMovie || isDinner) && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Optional Review</label>
                        <textarea
                          value={review}
                          onChange={e => setReview(e.target.value)}
                          placeholder="e.g. Great ending! or Amazing pasta."
                          className="w-full h-20 bg-zinc-950 border border-white/5 focus:border-[#ff8b66] rounded-xl p-3 text-xs outline-none text-white resize-none"
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-white/[0.05] flex gap-3">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-300 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}

          {step < totalSteps ? (
            <button
              onClick={handleNext}
              className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 rounded-xl bg-[#ff8b66] hover:bg-[#ff7a55] text-black text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? "Publishing…" : "Publish Memory"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
