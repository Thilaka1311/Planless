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
});
