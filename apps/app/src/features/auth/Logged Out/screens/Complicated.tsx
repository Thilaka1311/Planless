import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import defaultAvatar from "../../../../assets/default_avatar.png";

interface ChatPerson {
  name: string;
  initial: string;
  color: string;
  avatarBg: string;
}

const PEOPLE: Record<string, ChatPerson> = {
  alex: { name: "Alex", initial: "A", color: "#FF854C", avatarBg: "bg-[#FF6B2C]/20 text-[#FF854C] border-[#FF6B2C]/30" },
  sam: { name: "Sam", initial: "S", color: "#93C5FD", avatarBg: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  maya: { name: "Maya", initial: "M", color: "#F472B6", avatarBg: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  jordan: { name: "Jordan", initial: "J", color: "#A78BFA", avatarBg: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  leo: { name: "Leo", initial: "L", color: "#34D399", avatarBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  you: { name: "You", initial: "Y", color: "#FFFFFF", avatarBg: "bg-[#C46A2C] text-white border-white/20" },
};

interface MessageItem {
  id: string;
  isSystem?: boolean;
  isYou?: boolean;
  person?: ChatPerson;
  text: string;
  isFinal?: boolean;
}

type TimelineEvent =
  | { type: "system"; text: string; delay: number }
  | { type: "typing"; personKey: string; delay: number }
  | { type: "message"; personKey: string; text: string; delay: number; isFinal?: boolean }
  | { type: "multi_typing"; text?: string; delay: number };

const TIMELINE: TimelineEvent[] = [
  // 1. Initial event: "You created Friday Plans"
  { type: "system", text: "You created Friday Plans", delay: 350 },

  // 2. Early single-person typing indicator: Alex
  { type: "typing", personKey: "alex", delay: 500 },

  // 3. Messages start: Alex asks if anyone is free, You responds
  { type: "message", personKey: "alex", text: "Anyone free Friday?", delay: 700 },
  { type: "message", personKey: "you", text: "Friday works for me", delay: 650 },

  // 4. Early single-person typing indicator: Sam
  { type: "typing", personKey: "sam", delay: 400 },
  { type: "message", personKey: "sam", text: "I'm in", delay: 650 },

  // 5. Participants join as conversation accelerates
  { type: "message", personKey: "maya", text: "Maybe", delay: 520 },
  { type: "message", personKey: "you", text: "7 works", delay: 480 },
  { type: "message", personKey: "jordan", text: "What time?", delay: 440 },
  { type: "message", personKey: "leo", text: "Where?", delay: 400 },
  { type: "message", personKey: "you", text: "Should we do dinner?", delay: 360 },
  { type: "message", personKey: "sam", text: "Works for me", delay: 330 },
  { type: "message", personKey: "you", text: "I can book it", delay: 300 },

  // 6. Multiple people typing introduced as conversation turns chaotic
  { type: "multi_typing", text: "Alex, Maya, Leo are typing", delay: 240 },

  // 7. Rapid chaotic messages
  { type: "message", personKey: "maya", text: "Wait, what are we doing?", delay: 600 },
  { type: "message", personKey: "jordan", text: "Are we still on?", delay: 240 },
  { type: "message", personKey: "leo", text: "I have no idea", delay: 220 },
  { type: "message", personKey: "you", text: "Where should we go?", delay: 210 },
  { type: "message", personKey: "alex", text: "Where was this decided?", delay: 190 },
  { type: "message", personKey: "maya", text: "Wait, who's driving?", delay: 180 },
  { type: "message", personKey: "jordan", text: "Who's actually coming?", delay: 170 },
  { type: "message", personKey: "alex", text: "Is anyone reading this?", delay: 170 },

  // 8. Final message from You: WHAT IS THE PLAN?
  // NOTE: No typing indicator is shown immediately before this final message
  { type: "message", personKey: "you", text: "WHAT IS THE PLAN?", delay: 800, isFinal: true },
];

// Complete static conversation list (used when already completed or returning)
const ALL_COMPLETED_MESSAGES: MessageItem[] = TIMELINE.filter(
  (event): event is Extract<TimelineEvent, { type: "system" | "message" }> =>
    event.type === "system" || event.type === "message"
).map((event, idx) => {
  if (event.type === "system") {
    return {
      id: `sys-static-${idx}`,
      isSystem: true,
      text: event.text,
    };
  }
  return {
    id: `msg-static-${idx}`,
    person: PEOPLE[event.personKey],
    isYou: event.personKey === "you",
    text: event.text,
    isFinal: event.isFinal,
  };
});

// Module-level persistent state so returning to this screen within the session does NOT replay
let hasEverCompletedAnimation = false;

export function resetComplicatedAnimation() {
  hasEverCompletedAnimation = false;
}

export function isComplicatedAnimationCompleted() {
  return hasEverCompletedAnimation;
}

export interface ComplicatedProps {
  onGetStarted?: () => void;
  className?: string;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export function Complicated({ onGetStarted, className = "", onTouchStart, onTouchEnd }: ComplicatedProps) {
  const [messages, setMessages] = useState<MessageItem[]>(() =>
    hasEverCompletedAnimation ? ALL_COMPLETED_MESSAGES : []
  );
  const [activeTyping, setActiveTyping] = useState<string | null>(null);
  const [isMultiTyping, setIsMultiTyping] = useState(false);
  const [multiTypingText, setMultiTypingText] = useState("Alex, Maya, Leo are typing");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isAnimationComplete, setIsAnimationComplete] = useState<boolean>(() => hasEverCompletedAnimation);
  const [showCta, setShowCta] = useState<boolean>(() => hasEverCompletedAnimation);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isRunningRef = useRef(false);
  const hasUserScrolledRef = useRef(false);

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    if (mediaQuery.matches) {
      hasEverCompletedAnimation = true;
      setIsAnimationComplete(true);
      setShowCta(true);
      setMessages(ALL_COMPLETED_MESSAGES);
    }
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      if (e.matches) {
        hasEverCompletedAnimation = true;
        setIsAnimationComplete(true);
        setShowCta(true);
        setMessages(ALL_COMPLETED_MESSAGES);
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Auto-scroll ONLY while the animation is active and user hasn't manually scrolled up
  useEffect(() => {
    if (!hasUserScrolledRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTyping, isMultiTyping]);

  // Main animation sequence loop - RUNS EXACTLY ONCE
  useEffect(() => {
    isMountedRef.current = true;

    // If animation has already completed in this session or reduced motion is active, do not run
    if (hasEverCompletedAnimation || prefersReducedMotion || isRunningRef.current) {
      if (hasEverCompletedAnimation || prefersReducedMotion) {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }
      return;
    }

    isRunningRef.current = true;
    let currentIndex = 0;

    const runNextStep = () => {
      if (!isMountedRef.current) return;

      if (currentIndex >= TIMELINE.length) {
        hasEverCompletedAnimation = true;
        isRunningRef.current = false;
        setIsAnimationComplete(true);
        setShowCta(true);
        return;
      }

      const event = TIMELINE[currentIndex];
      currentIndex++;

      timerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;

        if (event.type === "system") {
          setActiveTyping(null);
          setIsMultiTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${currentIndex}-${Date.now()}`,
              isSystem: true,
              text: event.text,
            },
          ]);
        } else if (event.type === "typing") {
          setActiveTyping(PEOPLE[event.personKey]?.name || "Someone");
          setIsMultiTyping(false);
        } else if (event.type === "message") {
          setActiveTyping(null);
          setIsMultiTyping(false);
          const person = PEOPLE[event.personKey];
          const isYou = event.personKey === "you";
          if (person) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${currentIndex}-${Date.now()}-${Math.random()}`,
                person,
                isYou,
                text: event.text,
                isFinal: event.isFinal,
              },
            ]);

            // The exact moment "WHAT IS THE PLAN?" appears, immediately trigger CTA reveal and complete animation
            if (event.isFinal) {
              hasEverCompletedAnimation = true;
              isRunningRef.current = false;
              setIsAnimationComplete(true);
              setShowCta(true);
              return;
            }
          }
        } else if (event.type === "multi_typing") {
          setActiveTyping(null);
          setMultiTypingText(event.text || "Alex, Maya, Leo are typing");
          setIsMultiTyping(true);
        }

        runNextStep();
      }, event.delay);
    };

    // Initial start after phone has slowly faded in (~850ms)
    timerRef.current = setTimeout(runNextStep, 900);

    return () => {
      isMountedRef.current = false;
      isRunningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [prefersReducedMotion]);

  const renderChatContainer = () => {
    return (
      <div
        id="complicated_chat_card"
        className="w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[540px] sm:max-h-[600px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0c0c10] border border-white/[0.08] shadow-2xl shadow-black/80 flex flex-col relative overflow-hidden select-none px-4 pt-3.5 pb-4"
        aria-label="Group chat animation and conversation"
      >
        {/* Group Name Header */}
        <div className="flex items-center justify-center pb-2.5 border-b border-white/[0.06] shrink-0">
          <span className="text-[13px] sm:text-[14px] font-semibold text-white tracking-tight">
            Friday Plans
          </span>
        </div>

        {/* Main Conversation Stream */}
        <div className="flex-1 relative flex flex-col justify-end overflow-hidden pt-1.5 w-full">
          {/* Top fade mask so older messages dissolve gracefully when scrolling */}
          <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-[#0c0c10] to-transparent pointer-events-none z-10" />

          <div
            ref={scrollRef}
            tabIndex={isAnimationComplete ? 0 : -1}
            onScroll={() => {
              if (isAnimationComplete) {
                hasUserScrolledRef.current = true;
              }
            }}
            className={`flex-1 overflow-y-auto flex flex-col space-y-2 max-h-full py-1.5 w-full overscroll-contain focus:outline-none no-scrollbar ${
              isAnimationComplete ? "cursor-default" : "pointer-events-none"
            }`}
            style={{
              touchAction: isAnimationComplete ? "pan-y" : "none",
            }}
            onTouchStart={(e) => {
              // Prevent accidental slide transitions while scrolling inside the chat
              if (isAnimationComplete) {
                e.stopPropagation();
              }
            }}
            onTouchEnd={(e) => {
              if (isAnimationComplete) {
                e.stopPropagation();
              }
            }}
          >
            {messages.map((msg) => {
              // 1. System Event Message (Centered)
              if (msg.isSystem) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={isAnimationComplete ? false : { opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="w-full flex items-center justify-center py-1 my-0.5 select-none shrink-0"
                  >
                    <div className="text-[10.5px] sm:text-[11px] font-medium text-zinc-400 bg-white/[0.05] border border-white/[0.08] px-3 py-1 rounded-full text-center tracking-normal">
                      <span className="text-zinc-200 font-semibold">You</span> created Friday Plans
                    </div>
                  </motion.div>
                );
              }

              // 2. Outgoing Message from "You" (Right side)
              if (msg.isYou) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={isAnimationComplete ? false : { opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="w-full flex justify-end items-end gap-2 shrink-0"
                  >
                    {/* Outgoing Message Bubble */}
                    <div className="bg-[#C46A2C] text-white rounded-2xl rounded-tr-xs px-3 py-2 max-w-[82%] shadow-sm text-left">
                      <span
                        className={`leading-snug font-sans block ${
                          msg.isFinal
                            ? "text-[13px] sm:text-[14px] text-white font-bold tracking-tight"
                            : "text-[11.5px] sm:text-[12.5px] text-white font-normal"
                        }`}
                      >
                        {msg.text}
                      </span>
                    </div>

                    {/* You Avatar */}
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 bg-zinc-800 flex items-center justify-center shrink-0">
                      <img
                        src={defaultAvatar}
                        alt="You"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    </div>
                  </motion.div>
                );
              }

              // 3. Incoming Message from other participants (Left side)
              return (
                <motion.div
                  key={msg.id}
                  initial={isAnimationComplete ? false : { opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="w-full flex items-start gap-2 text-left shrink-0"
                >
                  {/* Sender Avatar */}
                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${msg.person?.avatarBg}`}
                  >
                    {msg.person?.initial}
                  </div>

                  {/* Message Bubble */}
                  <div className="bg-[#181820] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[86%] shadow-sm">
                    <span
                      className="text-[9.5px] font-semibold block leading-tight mb-0.5"
                      style={{ color: msg.person?.color }}
                    >
                      {msg.person?.name}
                    </span>
                    <span className="text-[11.5px] sm:text-[12.5px] text-zinc-100 leading-snug font-sans block">
                      {msg.text}
                    </span>
                  </div>
                </motion.div>
              );
            })}

            {/* Single Typing Indicator (only while animating) */}
            {!isAnimationComplete && activeTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex items-center gap-1 text-zinc-400 text-[10.5px] pl-8 pt-0.5 shrink-0"
              >
                <span className="italic">{activeTyping} is typing</span>
                <span className="inline-flex gap-0.5 items-center pl-0.5">
                  <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" />
                </span>
              </motion.div>
            )}

            {/* Multi-Person Typing Indicator (only while animating) */}
            {!isAnimationComplete && isMultiTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-full flex items-center gap-1.5 text-white text-[10.5px] pl-8 pt-0.5 font-medium shrink-0"
              >
                <span className="italic">{multiTypingText}</span>
                <span className="inline-flex gap-0.5 items-center pl-0.5">
                  <span className="w-1 h-1 rounded-full bg-white animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-1 rounded-full bg-white animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-1 rounded-full bg-white animate-bounce" />
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      id="complicated_screen"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={`w-full h-full text-white bg-[#000000] flex flex-col justify-between font-sans relative overflow-hidden select-none ${className}`}
    >
      {/* 1. [HEADER] Top title functioning as primary visual header - immediately visible */}
      <div className="w-full shrink-0 pt-[max(1.25rem,env(safe-area-inset-top))] px-5 sm:px-8 md:px-10">
        <h1 className="text-[22px] xs:text-[24px] sm:text-[26px] md:text-[28px] font-sans font-bold tracking-tight text-white leading-[1.22] text-left">
          <span className="block">Making plans with friends</span>
          <span className="block">shouldn&apos;t be this complicated.</span>
        </h1>
      </div>

      {/* 2. [LARGE CHAT ANIMATION] Slowly fades in on first mount (~850ms), plays once, becomes scrollable */}
      <motion.div
        initial={hasEverCompletedAnimation ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.85, ease: "easeOut" }}
        className="flex-1 w-full flex items-center justify-center min-h-0 px-4 py-2 sm:py-3.5 overflow-hidden"
      >
        {renderChatContainer()}
      </motion.div>

      {/* 3. [CTA] Full-width Next - immediately starts smooth fade-in the moment WHAT IS THE PLAN? appears */}
      <div className="w-full shrink-0 min-h-[58px] flex items-end">
        <AnimatePresence>
          {showCta && (
            <motion.div
              key="cta_container"
              initial={hasEverCompletedAnimation && !isAnimationComplete ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-full px-4 sm:px-6 md:px-8 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <button
                id="btn_onboarding_cta_1"
                type="button"
                onClick={onGetStarted}
                className="w-full py-3 px-6 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] text-white font-semibold text-[14px] xs:text-[14.5px] sm:text-[15px] tracking-wide transition active:scale-[0.99] cursor-pointer text-center shadow-md shadow-[#FF6B2C]/20"
              >
                Next
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Complicated;
