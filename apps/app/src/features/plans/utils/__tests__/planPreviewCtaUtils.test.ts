import { describe, it, expect } from 'vitest';
import { getPlanPreviewCtaState } from '../planPreviewCtaUtils';

describe('planPreviewCtaUtils', () => {
  describe('Assigned plans', () => {
    it('shows Join Plan when assigned_group = GOING even if joined_count >= plan_size', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: 'GOING',
        joinedCount: 5,
        planSize: 4,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.ctaText).toBe('Join Plan');
    });

    it('shows Join Waitlist when assigned_group = WAITLIST even if joined_count < plan_size', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: 'WAITLIST',
        joinedCount: 1,
        planSize: 8,
      });
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).toBe('Join Waitlist');
    });

    it('shows Rejoin Waitlist when assigned_group = WAITLIST and alreadySkipped is true', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: 'WAITLIST',
        joinedCount: 1,
        planSize: 8,
        alreadySkipped: true,
      });
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).toBe('Rejoin Waitlist');
    });

    it('shows Rejoin Plan when assigned_group = GOING and alreadySkipped is true', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: 'GOING',
        joinedCount: 4,
        planSize: 4,
        alreadySkipped: true,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.ctaText).toBe('Rejoin Plan');
    });
  });

  describe('Automatic plans', () => {
    it('shows Join Plan when joined_count < plan_size', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 3,
        planSize: 4,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.ctaText).toBe('Join Plan');
    });

    it('shows Join Waitlist when joined_count == plan_size', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 4,
        planSize: 4,
      });
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).toBe('Join Waitlist');
    });

    it('shows Join Waitlist when joined_count > plan_size', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 5,
        planSize: 4,
      });
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).toBe('Join Waitlist');
    });

    it('shows Rejoin Plan when joined_count < plan_size and alreadySkipped is true', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 2,
        planSize: 4,
        alreadySkipped: true,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.ctaText).toBe('Rejoin Plan');
    });

    it('shows Rejoin Waitlist when joined_count >= plan_size and alreadySkipped is true', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 4,
        planSize: 4,
        alreadySkipped: true,
      });
      expect(res.isWaitlistTarget).toBe(true);
      expect(res.ctaText).toBe('Rejoin Waitlist');
    });
  });

  describe('No Limit plans (System Maximum = 50, No Waitlist)', () => {
    it('allows joining normally with Join Plan when joinedCount is 0 to 49', () => {
      [0, 1, 10, 25, 49].forEach((count) => {
        const res = getPlanPreviewCtaState({
          isAssignedMode: false,
          joinedCount: count,
          planSize: null,
        });
        expect(res.isWaitlistTarget).toBe(false);
        expect(res.isCapacityReached).toBe(false);
        expect(res.ctaText).toBe('Join Plan');
      });
    });

    it('shows Rejoin Plan for skipped participants when joinedCount < 50', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 49,
        planSize: null,
        alreadySkipped: true,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.isCapacityReached).toBe(false);
      expect(res.ctaText).toBe('Rejoin Plan');
    });

    it('enforces Plan size reached at 50 joined participants with NO waitlist', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 50,
        planSize: null,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.isCapacityReached).toBe(true);
      expect(res.ctaText).toBe('Plan size reached');
    });

    it('never creates or targets waitlist for No Limit plans even when full', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 50,
        planSize: null,
        alreadySkipped: false,
      });
      expect(res.isWaitlistTarget).toBe(false);
      expect(res.ctaText).not.toBe('Join Waitlist');
      expect(res.ctaText).toBe('Plan size reached');
    });

    it('dynamically restores Join Plan when a participant leaves from 50 to 49', () => {
      // 1. At 50 joined: capacity reached
      const fullRes = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 50,
        planSize: null,
      });
      expect(fullRes.isCapacityReached).toBe(true);
      expect(fullRes.ctaText).toBe('Plan size reached');

      // 2. Participant leaves: 49 joined
      const restoredRes = getPlanPreviewCtaState({
        isAssignedMode: false,
        joinedCount: 49,
        planSize: null,
      });
      expect(restoredRes.isCapacityReached).toBe(false);
      expect(restoredRes.isWaitlistTarget).toBe(false);
      expect(restoredRes.ctaText).toBe('Join Plan');
    });
  });

  describe('Hard system maximum across all plans (50 joined)', () => {
    it('stops joins at 50 joined even for Assigned plans', () => {
      const res = getPlanPreviewCtaState({
        isAssignedMode: true,
        assignedGroup: 'GOING',
        joinedCount: 50,
        planSize: 50,
      });
      expect(res.isCapacityReached).toBe(true);
      expect(res.ctaText).toBe('Plan size reached');
    });
  });
});
