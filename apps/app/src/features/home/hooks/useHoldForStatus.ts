import React, { useState, useRef } from "react";
import { Plan, UserProfile, NotificationItem } from "../../../core/types";
import { useToast } from "../../../shared/contexts/ToastContext";

interface UseHoldToAcceptProps {
  plan: Plan;
  userProfile: UserProfile;
  isDeadlinePassed: boolean;
  isJoined: boolean;
  isWaitlisted: boolean;
  isFull: boolean;
  handleToggleJoin: (plan: Plan) => Promise<boolean | void> | void;
  setShowPaymentSuccess: (plan: Plan | null) => void;
  setShowWaitlistSuccess?: (plan: Plan | null) => void;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  activeCardId: string | null;
  handleSnoozePlan: (planId: string) => void;
  waitlistPlan?: (planId: string, userProfile: any) => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
}

export function useHoldToAccept({
  plan,
  userProfile,
  isDeadlinePassed,
  isJoined,
  isWaitlisted,
  isFull,
  handleToggleJoin,
  setShowPaymentSuccess,
  setShowWaitlistSuccess,
  setNotifications,
  activeCardId,
  handleSnoozePlan,
  waitlistPlan,
  isExpanded,
  setIsExpanded,
}: UseHoldToAcceptProps) {
  const { showToast } = useToast();
  const HOLD_DURATION = 1400; // ms
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100
  const [isHolding, setIsHolding] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMode, setSuccessMode] = useState<"join" | "waitlist">("join");

  React.useEffect(() => {
    setHoldProgress(0);
    setIsHolding(false);
    setIsSuccess(false);
    setDragY(0);
    isDraggingRef.current = false;
    isHoldTriggeredRef.current = false;
    wasHoldActive.current = false;
    if (holdDelayTimeoutRef.current) {
      clearTimeout(holdDelayTimeoutRef.current);
      holdDelayTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [plan.id]);

  const startYRef = useRef<number>(0);
  const [dragY, setDragY] = useState<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  const holdStartTimeRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const isHoldTriggeredRef = useRef<boolean>(false);
  const wasHoldActive = useRef<boolean>(false);

  const holdDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownTimeRef = useRef<number>(0);
  const hasHoldStartedRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);
  const activeTargetRef = useRef<EventTarget | null>(null);

  const startHolding = (e: React.PointerEvent) => {
    wasHoldActive.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Do not start hold if target is inside an interactive/no-hold element
    const target = e.target as HTMLElement;
    if (target && (target.closest('.no-hold') || target.closest('button') || target.closest('input') || target.closest('a'))) {
      return;
    }

    if (isDeadlinePassed) {
      showToast("Responses are closed for this plan.");
      return;
    }

    if (holdDelayTimeoutRef.current) {
      clearTimeout(holdDelayTimeoutRef.current);
      holdDelayTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    pointerIdRef.current = e.pointerId;
    activeTargetRef.current = e.currentTarget;

    pointerDownTimeRef.current = performance.now();
    hasHoldStartedRef.current = false;
    isHoldTriggeredRef.current = false;
    startYRef.current = e.clientY;
    isDraggingRef.current = false;
    setDragY(0);

    holdDelayTimeoutRef.current = setTimeout(() => {
      if (activeTargetRef.current && pointerIdRef.current !== null) {
        try {
          (activeTargetRef.current as HTMLElement).setPointerCapture(pointerIdRef.current);
        } catch (err) {}
      }

      hasHoldStartedRef.current = true;
      setIsHolding(true);
      setHoldProgress(0);
      progressRef.current = 0;

      const startTime = performance.now();
      holdStartTimeRef.current = startTime;

      const tick = async (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / HOLD_DURATION, 1);
        setHoldProgress(progress * 100);
        progressRef.current = progress;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          setIsHolding(false);
          isHoldTriggeredRef.current = true;
          wasHoldActive.current = true;

          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }

          if (isJoined) {
            showToast("You're already in this plan! Head over to Circles tab to chat.");
          } else if (isWaitlisted) {
            showToast("You're already on the waitlist for this plan!");
          } else if (isFull) {
            if (waitlistPlan) {
              setSuccessMode("waitlist");
              setIsSuccess(true);
              waitlistPlan(plan.id, userProfile);
              showToast("Added to Waitlist");
              const waitlistNotification: NotificationItem = {
                id: `n_waitlist_${Date.now()}`,
                type: "general" as const,
                title: `⏳ Added to waitlist for "${plan.title}"`,
                relativeTime: "Just Now",
                settled: true,
                planId: plan.id,
              };
              setNotifications((prev) => [waitlistNotification, ...prev]);
              if (setShowWaitlistSuccess) {
                setShowWaitlistSuccess(plan);
              }
              setTimeout(() => {
                setIsSuccess(false);
              }, 2000);
            }
          } else {
            setSuccessMode("join");
            setIsSuccess(true);
            setShowPaymentSuccess(plan);

            const newNotification: NotificationItem = {
              id: `n_pay_${Date.now()}`,
              type: "payment" as const,
              title: "Split Coordinated Payment Cleared",
              relativeTime: "Just Now",
              settled: true,
              planId: plan.id,
            };

            const joinedNotification: NotificationItem = {
              id: `n_join_group_${Date.now()}`,
              type: "general" as const,
              title: `👋 You joined ${plan.creatorName || "host"}'s plan "${plan.title}"`,
              relativeTime: "Just Now",
              settled: true,
              planId: plan.id,
            };

            setNotifications((prev) => [newNotification, joinedNotification, ...prev]);

            setTimeout(() => {
              setIsSuccess(false);
            }, 2000);

            // Execute DB join asynchronously in background without blocking visual confirmation overlay
            Promise.resolve(handleToggleJoin(plan)).catch((err) => {
              console.error("[useHoldToAccept] Async Join error:", err);
            });
          }

          setTimeout(() => {
            setHoldProgress(0);
            progressRef.current = 0;
          }, 400);
        }
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    }, 400);
  };

  const stopHolding = (e: React.PointerEvent) => {
    if (holdDelayTimeoutRef.current) {
      clearTimeout(holdDelayTimeoutRef.current);
      holdDelayTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    pointerIdRef.current = null;
    activeTargetRef.current = null;

    const currentDragY = dragY;
    startYRef.current = 0;
    setDragY(0);

    if (isDraggingRef.current) {
      wasHoldActive.current = true;
      if (currentDragY > 120) {
        handleSnoozePlan(plan.id);
      }
      return;
    }

    if (!hasHoldStartedRef.current) {
      setIsHolding(false);
      setHoldProgress(0);
      progressRef.current = 0;
      return;
    }

    wasHoldActive.current = true;
    setIsHolding(false);

    if (progressRef.current < 1) {
      const startProgress = progressRef.current;
      const startReleaseTime = performance.now();
      const DECREASE_DURATION = 350;

      const releaseTick = (now: number) => {
        const elapsedRelease = now - startReleaseTime;
        const relProgress = Math.min(elapsedRelease / DECREASE_DURATION, 1);
        const newProgress = startProgress * (1 - relProgress);
        setHoldProgress(newProgress * 100);
        progressRef.current = newProgress;

        if (relProgress < 1) {
          animationFrameRef.current = requestAnimationFrame(releaseTick);
        } else {
          setHoldProgress(0);
          progressRef.current = 0;
        }
      };

      animationFrameRef.current = requestAnimationFrame(releaseTick);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startYRef.current === 0) return;
    const deltaY = e.clientY - startYRef.current;
    if (Math.abs(deltaY) > 10) {
      isDraggingRef.current = true;
      wasHoldActive.current = true;
      if (holdDelayTimeoutRef.current) {
        clearTimeout(holdDelayTimeoutRef.current);
        holdDelayTimeoutRef.current = null;
      }
      if (isHolding) {
        setIsHolding(false);
      }

      if (activeTargetRef.current && pointerIdRef.current !== null) {
        try {
          if (deltaY > 10) {
            // Downward drag (snooze): capture the pointer
            (activeTargetRef.current as HTMLElement).setPointerCapture(pointerIdRef.current);
          } else {
            // Upward drag (scroll): release pointer capture immediately
            (activeTargetRef.current as HTMLElement).releasePointerCapture(pointerIdRef.current);
          }
        } catch (err) {}
      }
    }
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const cancelHolding = (e: React.PointerEvent) => {
    if (holdDelayTimeoutRef.current) {
      clearTimeout(holdDelayTimeoutRef.current);
      holdDelayTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    pointerIdRef.current = null;
    activeTargetRef.current = null;

    const currentDragY = dragY;
    startYRef.current = 0;
    setDragY(0);

    if (isDraggingRef.current) {
      if (currentDragY > 120) {
        handleSnoozePlan(plan.id);
      }
      return;
    }

    setIsHolding(false);

    if (hasHoldStartedRef.current && progressRef.current < 1) {
      const startProgress = progressRef.current;
      const startReleaseTime = performance.now();
      const DECREASE_DURATION = 350;

      const releaseTick = (now: number) => {
        const elapsedRelease = now - startReleaseTime;
        const relProgress = Math.min(elapsedRelease / DECREASE_DURATION, 1);
        const newProgress = startProgress * (1 - relProgress);
        setHoldProgress(newProgress * 100);
        progressRef.current = newProgress;

        if (relProgress < 1) {
          animationFrameRef.current = requestAnimationFrame(releaseTick);
        } else {
          setHoldProgress(0);
          progressRef.current = 0;
        }
      };

      animationFrameRef.current = requestAnimationFrame(releaseTick);
    } else {
      setHoldProgress(0);
      progressRef.current = 0;
    }
  };

  return {
    holdProgress,
    isHolding,
    isSuccess,
    successMode,
    isExpanded,
    setIsExpanded,
    dragY,
    startHolding,
    stopHolding,
    handlePointerMove,
    cancelHolding,
    wasHoldActive,
  };
}