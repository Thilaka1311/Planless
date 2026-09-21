import { Transition, Variants } from 'motion/react';

/**
 * Standardized Motion Tokens for Planless
 *
 * Core principles:
 * 1. Fast (120ms - 200ms) - Feels native and responsive, never laggy.
 * 2. Subtle - Focuses on opacity with minimal translation (0 - 8px) to prevent layout shifts.
 * 3. Consistent - Shared across tabs, modals, and sub-sections.
 * 4. Stable - Uses mode="wait" to eliminate simultaneous mount layout collisions.
 */

// --- 1. Primary Bottom Tab Transitions (Home, Plans, Create, Chats, Wallet, Profile) ---
export const TAB_TRANSITION: Transition = {
  duration: 0.14,
  ease: [0.25, 1, 0.5, 1],
};

export const tabVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: TAB_TRANSITION,
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.1,
      ease: 'easeIn',
    },
  },
};

// --- 2. Sub-Tab & Segmented Filter Transitions (Joined, Waitlist, Skipped, etc.) ---
export const SUB_TAB_TRANSITION: Transition = {
  duration: 0.12,
  ease: 'easeOut',
};

export const subTabVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: SUB_TAB_TRANSITION,
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.08,
      ease: 'easeIn',
    },
  },
};

// --- 3. Full-Screen Modal & Overlay Screens (Plan Preview, Chat, Friends, Search, Hosted) ---
export const SCREEN_MODAL_TRANSITION: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
};

export const screenModalVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: SCREEN_MODAL_TRANSITION,
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: {
      duration: 0.16,
      ease: 'easeIn',
    },
  },
};
