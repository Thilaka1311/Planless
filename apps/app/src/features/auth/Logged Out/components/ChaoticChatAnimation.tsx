import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
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

  // 1. One person typing: Alex starts typing
  { type: "typing", personKey: "alex", delay: 500 },

  // 2. Message appears: Alex asks if anyone is free, and You responds
  // LEFT: Alex
  { type: "message", personKey: "alex", text: "Anyone free Friday?", delay: 700 },
  // RIGHT: You
  { type: "message", personKey: "you", text: "Friday works for me", delay: 650 },

  // 3. Another person typing: Single-person typing indicator for Sam
  { type: "typing", personKey: "sam", delay: 400 },
  // LEFT: Sam
  { type: "message", personKey: "sam", text: "I'm in", delay: 650 },

  // 4. Messages become more frequent as more participants join
  // LEFT: Maya
  { type: "message", personKey: "maya", text: "Maybe", delay: 520 },
  // RIGHT: You
  { type: "message", personKey: "you", text: "7 works", delay: 480 },
  // LEFT: Jordan
  { type: "message", personKey: "jordan", text: "What time?", delay: 440 },
  // LEFT: Leo
  { type: "message", personKey: "leo", text: "Where?", delay: 400 },
  // RIGHT: You
  { type: "message", personKey: "you", text: "Should we do dinner?", delay: 360 },
  // LEFT: Sam
  { type: "message", personKey: "sam", text: "Works for me", delay: 330 },
  // RIGHT: You
  { type: "message", personKey: "you", text: "I can book it", delay: 300 },

  // 5. Middle/later: Multiple people typing simultaneously introduces rising chaos
  { type: "multi_typing", text: "Alex, Maya, Leo are typing", delay: 240 },

  // 6. Rapid-fire messages from both LEFT and RIGHT
  // LEFT: Maya
  { type: "message", personKey: "maya", text: "Wait, what are we doing?", delay: 620 },
  // LEFT: Jordan
  { type: "message", personKey: "jordan", text: "Are we still on?", delay: 240 },
  // LEFT: Leo
  { type: "message", personKey: "leo", text: "I have no idea", delay: 220 },
  // RIGHT: You (interspersed naturally)
  { type: "message", personKey: "you", text: "Where should we go?", delay: 210 },
  // LEFT: Alex
  { type: "message", personKey: "alex", text: "Where was this decided?", delay: 190 },
  // LEFT: Maya
  { type: "message", personKey: "maya", text: "Wait, who's driving?", delay: 180 },
  // LEFT: Jordan
  { type: "message", personKey: "jordan", text: "Who's actually coming?", delay: 170 },
  // LEFT: Alex
  { type: "message", personKey: "alex", text: "Is anyone reading this?", delay: 170 },

  // 7. Final message from You on the RIGHT side: WHAT IS THE PLAN?
  // NOTE: No typing indicator is shown immediately before this final message
  { type: "message", personKey: "you", text: "WHAT IS THE PLAN?", delay: 800, isFinal: true },
];

export function ChaoticChatAnimation() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activeTyping, setActiveTyping] = useState<string | null>(null);
  const [isMultiTyping, setIsMultiTyping] = useState(false);
  const [multiTypingText, setMultiTypingText] = useState("Alex, Maya, Leo are typing");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTyping, isMultiTyping]);

  // Main animation sequence loop
  useEffect(() => {
    isMountedRef.current = true;
    if (prefersReducedMotion) return;

    let currentIndex = 0;

    const runNextStep = () => {
      if (!isMountedRef.current) return;

      if (currentIndex >= TIMELINE.length) {
        // Hold on "WHAT IS THE PLAN?" for 3 seconds, then restart cleanly
        timerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setMessages([]);
          setActiveTyping(null);
          setIsMultiTyping(false);
          setMultiTypingText("Alex, Maya, Leo are typing");
          currentIndex = 0;
          timerRef.current = setTimeout(runNextStep, 500);
        }, 3000);
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
          }
        } else if (event.type === "multi_typing") {
          setActiveTyping(null);
          setMultiTypingText(event.text || "Alex, Maya, Leo are typing");
          setIsMultiTyping(true);
        }

        runNextStep();
      }, event.delay);
    };

    // Initial start after 350ms
    timerRef.current = setTimeout(runNextStep, 350);

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [prefersReducedMotion]);

  // If reduced motion is active, show static representation
  if (prefersReducedMotion) {
    return (
      <div className="w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[420px] h-[480px] xs:h-[510px] sm:h-[550px] max-h-[62vh] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0c0c10] border border-white/[0.08] shadow-2xl p-4 sm:p-4.5 flex flex-col justify-between select-none">
        {/* Group Name Header */}
        <div className="flex items-center justify-center pb-2.5 border-b border-white/[0.06] shrink-0">
          <span className="text-[13px] sm:text-[14px] font-semibold text-white tracking-tight">
            Friday Plans
          </span>
        </div>

        {/* Static conversation sample */}
        <div className="space-y-2.5 py-2 flex-1 overflow-hidden flex flex-col justify-end w-full">
          {/* System event */}
          <div className="w-full flex items-center justify-center py-1 my-0.5 select-none">
            <div className="text-[10.5px] sm:text-[11px] font-medium text-zinc-400 bg-white/[0.05] border border-white/[0.08] px-3 py-1 rounded-full text-center">
              <span className="text-zinc-200 font-semibold">You</span> created Friday Plans
            </div>
          </div>

          {/* LEFT: Alex */}
          <div className="w-full flex items-start gap-2 text-left">
            <div className="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 bg-[#FF6B2C]/20 text-[#FF854C] border-[#FF6B2C]/30">A</div>
            <div className="bg-[#181820] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
              <span className="text-[9.5px] font-semibold block leading-tight mb-0.5 text-[#FF854C]">Alex</span>
              <span className="text-[12px] text-white font-sans leading-snug">Anyone free Friday?</span>
            </div>
          </div>

          {/* RIGHT: You */}
          <div className="w-full flex justify-end items-end gap-2">
            <div className="bg-[#C46A2C] text-white rounded-2xl rounded-tr-xs px-3 py-2 max-w-[82%] text-left shadow-sm">
              <span className="text-[12px] font-sans leading-snug block">Friday works for me</span>
            </div>
            <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 bg-zinc-800 flex items-center justify-center shrink-0">
              <img src={defaultAvatar} alt="You" className="w-full h-full object-cover select-none pointer-events-none" />
            </div>
          </div>

          {/* LEFT: Sam */}
          <div className="w-full flex items-start gap-2 text-left">
            <div className="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 bg-blue-500/20 text-blue-300 border-blue-500/30">S</div>
            <div className="bg-[#181820] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
              <span className="text-[9.5px] font-semibold block leading-tight mb-0.5 text-[#93C5FD]">Sam</span>
              <span className="text-[12px] text-white font-sans leading-snug">I&apos;m in</span>
            </div>
          </div>

          {/* RIGHT: Final bold message from You */}
          <div className="w-full flex justify-end items-end gap-2 pt-0.5">
            <div className="bg-[#C46A2C] text-white rounded-2xl rounded-tr-xs px-3.5 py-2 max-w-[82%] text-left shadow-sm">
              <span className="text-[13px] sm:text-[14px] text-white font-bold font-sans leading-snug tracking-tight block">WHAT IS THE PLAN?</span>
            </div>
            <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 bg-zinc-800 flex items-center justify-center shrink-0">
              <img src={defaultAvatar} alt="You" className="w-full h-full object-cover select-none pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="chaotic_chat_card"
      className="w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[420px] h-[480px] xs:h-[510px] sm:h-[550px] max-h-[62vh] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0c0c10] border border-white/[0.08] shadow-2xl shadow-black/80 flex flex-col relative overflow-hidden select-none px-4 pt-3.5 pb-4"
      aria-label="Chaotic group chat animation"
    >
      {/* Group Name Header */}
      <div className="flex items-center justify-center pb-2.5 border-b border-white/[0.06] shrink-0">
        <span className="text-[13px] sm:text-[14px] font-semibold text-white tracking-tight">
          Friday Plans
        </span>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 relative flex flex-col justify-end overflow-hidden pt-1.5 w-full">
        {/* Subtle top fade mask so older messages dissolve smoothly */}
        <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-[#0c0c10] to-transparent pointer-events-none z-10" />

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto flex flex-col justify-end space-y-2 max-h-full scrollbar-none py-1 w-full"
        >
          {messages.map((msg) => {
            // 1. System Event Message (Centered)
            if (msg.isSystem) {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex items-center justify-center py-1 my-0.5 select-none"
                >
                  <div className="text-[10px] sm:text-[10.5px] font-medium text-zinc-400 bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full text-center tracking-normal">
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
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="w-full flex justify-end items-end gap-1.5"
                >
                  {/* Outgoing Message Bubble - Planless Brand Styling */}
                  <div className="bg-[#C46A2C] text-white rounded-2xl rounded-tr-xs px-2.5 py-1.5 max-w-[82%] shadow-sm text-left">
                    <span
                      className={`leading-snug font-sans block ${
                        msg.isFinal
                          ? "text-[12px] sm:text-[13px] text-white font-bold tracking-tight"
                          : "text-[11px] sm:text-[12px] text-white font-normal"
                      }`}
                    >
                      {msg.text}
                    </span>
                  </div>

                  {/* You Avatar Treatment */}
                  <div className="w-5 h-5 rounded-full overflow-hidden border border-white/20 bg-zinc-800 flex items-center justify-center shrink-0">
                    <img src={defaultAvatar} alt="You" className="w-full h-full object-cover select-none pointer-events-none" />
                  </div>
                </motion.div>
              );
            }

            // 3. Incoming Message from other participants (Left side)
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="w-full flex items-start gap-1.5 text-left"
              >
                {/* Sender Avatar */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${msg.person?.avatarBg}`}
                >
                  {msg.person?.initial}
                </div>

                {/* Message Bubble */}
                <div className="bg-[#181820] border border-white/[0.06] rounded-2xl rounded-tl-sm px-2.5 py-1.5 max-w-[86%] shadow-sm">
                  <span
                    className="text-[9px] font-semibold block leading-tight mb-0.5"
                    style={{ color: msg.person?.color }}
                  >
                    {msg.person?.name}
                  </span>
                  <span className="text-[11px] sm:text-[12px] text-zinc-100 leading-snug font-sans block">
                    {msg.text}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Single Typing Indicator */}
          {activeTyping && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="w-full flex items-center gap-1 text-zinc-400 text-[10px] pl-6 pt-0.5"
            >
              <span className="italic">{activeTyping} is typing</span>
              <span className="inline-flex gap-0.5 items-center pl-0.5">
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" />
              </span>
            </motion.div>
          )}

          {/* Multi-Person Typing Indicator - Pure white styling */}
          {isMultiTyping && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="w-full flex items-center gap-1.5 text-white text-[10px] pl-6 pt-0.5 font-medium"
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
}
