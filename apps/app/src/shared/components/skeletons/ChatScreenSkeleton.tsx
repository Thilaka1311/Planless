import React from "react";

/**
 * Message timeline skeleton for inside PlanChatScreen while messages are loading.
 * Shows realistic alternating incoming and outgoing chat bubbles with avatars and timestamps.
 */
export const ChatMessageListSkeleton: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col justify-end space-y-4 py-4 px-2 select-none pointer-events-none animate-pulse">
      {/* 1. Incoming message */}
      <div className="flex items-end gap-2.5 max-w-[80%]">
        <div className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
        <div className="space-y-1.5">
          <div className="h-3 w-16 bg-white/[0.06] rounded" />
          <div className="rounded-2xl rounded-bl-sm bg-[#18181b] border border-white/[0.06] p-3 space-y-1.5 w-52 shadow-sm">
            <div className="h-3 w-full bg-white/[0.08] rounded" />
            <div className="h-3 w-3/4 bg-white/[0.08] rounded" />
          </div>
        </div>
      </div>

      {/* 2. Outgoing message */}
      <div className="flex flex-col items-end self-end max-w-[80%] space-y-1">
        <div className="rounded-2xl rounded-br-sm bg-[#FF6B2C]/20 border border-[#FF6B2C]/30 p-3 space-y-1.5 w-44 shadow-sm">
          <div className="h-3 w-full bg-white/[0.12] rounded" />
          <div className="h-3 w-1/2 bg-white/[0.12] rounded" />
        </div>
      </div>

      {/* 3. Incoming message (shorter) */}
      <div className="flex items-end gap-2.5 max-w-[80%]">
        <div className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-white/[0.06] rounded" />
          <div className="rounded-2xl rounded-bl-sm bg-[#18181b] border border-white/[0.06] p-3 w-36 shadow-sm">
            <div className="h-3 w-full bg-white/[0.08] rounded" />
          </div>
        </div>
      </div>

      {/* 4. Outgoing message (longer) */}
      <div className="flex flex-col items-end self-end max-w-[80%] space-y-1">
        <div className="rounded-2xl rounded-br-sm bg-[#FF6B2C]/20 border border-[#FF6B2C]/30 p-3 space-y-1.5 w-60 shadow-sm">
          <div className="h-3 w-full bg-white/[0.12] rounded" />
          <div className="h-3 w-4/5 bg-white/[0.12] rounded" />
        </div>
      </div>
    </div>
  );
};

/**
 * Full-screen Chat Screen Skeleton used as Suspense fallback when PlanChatScreen
 * is loaded asynchronously in MainApp, PlansPreviewScreen, and HomePlansPreviewScreen.
 */
export const ChatScreenSkeleton: React.FC = () => {
  return (
    <div
      className="fixed inset-0 z-[80] bg-[#050505] flex flex-col h-full w-full overflow-hidden select-none pointer-events-none"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* 1. Top Header Placeholder */}
      <div
        className="shrink-0 bg-[#000000]/90 backdrop-blur-md border-b border-white/[0.06] px-5 pt-[env(safe-area-inset-top,12px)] pb-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {/* Back chevron */}
          <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0" />
          {/* Title & subtitle lines */}
          <div className="space-y-1.5">
            <div className="h-4 w-36 bg-white/[0.09] rounded animate-pulse" />
            <div className="h-2.5 w-20 bg-white/[0.04] rounded animate-pulse" />
          </div>
        </div>

        {/* Right header actions: Participant dots + Settings */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-black animate-pulse" />
            <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-black animate-pulse" />
          </div>
          <div className="w-8 h-8 rounded-full bg-white/[0.05] animate-pulse" />
        </div>
      </div>

      {/* 2. Messages Timeline Area */}
      <div className="flex-1 overflow-hidden px-4">
        <ChatMessageListSkeleton />
      </div>

      {/* 3. Bottom Input Bar Placeholder */}
      <div
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        className="shrink-0 px-4 pt-2 bg-[#000000]/80 border-t border-white/[0.04] flex items-center gap-2.5"
      >
        <div className="flex-1 h-11 rounded-full bg-white/[0.05] border border-white/[0.06] px-4 flex items-center">
          <div className="h-3 w-32 bg-white/[0.06] rounded animate-pulse" />
        </div>
        <div className="w-10 h-10 rounded-full bg-[#FF6B2C]/30 flex items-center justify-center shrink-0 animate-pulse" />
      </div>
    </div>
  );
};
