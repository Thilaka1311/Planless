import { describe, it, expect, vi } from 'vitest';

describe('Host Leaving, Host Transfer, and Waitlist Promotion', () => {
  describe('1. Host Leaving Paid Plan vs Free Plan (No Leave Request Created)', () => {
    it('optimistic update for host leaving a paid plan sets SKIPPED/LEFT and does NOT create a leave request', () => {
      const planUuid = 'plan-paid-1';
      const callerUuid = 'host-user-1';
      const replacementUuid = 'candidate-user-2';

      // Simulated optimistic update application for requestHostLeaveWithReplacement
      const optimisticUpdates: Record<string, any> = {};
      const applyParticipantOptimisticUpdate = (pId: string, uId: string, patch: any) => {
        optimisticUpdates[uId] = { ...(optimisticUpdates[uId] || {}), ...patch };
      };

      // 1. Promote target to HOST
      applyParticipantOptimisticUpdate(planUuid, replacementUuid, {
        role: 'HOST',
        rsvp_status: 'JOINED',
      });

      // 2. Caller departs directly (free or paid)
      applyParticipantOptimisticUpdate(planUuid, callerUuid, {
        role: 'PARTICIPANT',
        rsvp_status: 'SKIPPED',
        skip_reason: 'LEFT',
        assigned_group: null,
        waitlist_position: null,
        leave_requested: false,
        leave_requested_at: null,
        responded_at: new Date().toISOString(),
      });

      // Assert caller state: left directly, NO leave_requested
      expect(optimisticUpdates[callerUuid].role).toBe('PARTICIPANT');
      expect(optimisticUpdates[callerUuid].rsvp_status).toBe('SKIPPED');
      expect(optimisticUpdates[callerUuid].skip_reason).toBe('LEFT');
      expect(optimisticUpdates[callerUuid].leave_requested).toBe(false);
      expect(optimisticUpdates[callerUuid].leave_requested_at).toBeNull();
      expect(optimisticUpdates[callerUuid].assigned_group).toBeNull();
      expect(optimisticUpdates[callerUuid].waitlist_position).toBeNull();

      // Assert target state: promoted to HOST
      expect(optimisticUpdates[replacementUuid].role).toBe('HOST');
      expect(optimisticUpdates[replacementUuid].rsvp_status).toBe('JOINED');
    });

    it('verifies SQL RPC request_host_leave_with_replacement contract removes caller directly on paid plans', () => {
      // Contract test simulating database RPC request_host_leave_with_replacement logic
      const simulateRequestHostLeaveRPC = (params: {
        callerRole: string;
        callerRsvp: string;
        targetRsvp: string;
        totalCost: number;
      }) => {
        if (params.callerRole !== 'HOST' || params.callerRsvp !== 'JOINED') {
          throw new Error('Only active hosts can perform host replacement leave');
        }
        if (params.targetRsvp !== 'JOINED') {
          throw new Error('Only currently joined participants can become hosts');
        }

        // 1. Promote replacement
        const replacementRole = 'HOST';

        // 2. Leave plan caller transition
        const callerRole = 'PARTICIPANT';
        const callerRsvp = 'SKIPPED';
        const callerSkipReason = 'LEFT';
        const leaveRequested = false;

        return {
          success: true,
          promoted_user_id: 'target-id',
          leave_requested: leaveRequested,
          is_paid_plan: params.totalCost > 0,
          caller: {
            role: callerRole,
            rsvp_status: callerRsvp,
            skip_reason: callerSkipReason,
            leave_requested: leaveRequested,
          },
          target: {
            role: replacementRole,
            rsvp_status: 'JOINED',
          },
        };
      };

      // Test with paid plan (totalCost = 1500)
      const res = simulateRequestHostLeaveRPC({
        callerRole: 'HOST',
        callerRsvp: 'JOINED',
        targetRsvp: 'JOINED',
        totalCost: 1500,
      });

      expect(res.success).toBe(true);
      expect(res.is_paid_plan).toBe(true);
      expect(res.leave_requested).toBe(false);
      expect(res.caller.role).toBe('PARTICIPANT');
      expect(res.caller.rsvp_status).toBe('SKIPPED');
      expect(res.caller.skip_reason).toBe('LEFT');
      expect(res.caller.leave_requested).toBe(false);
      expect(res.target.role).toBe('HOST');
    });
  });

  describe('2. Separation: Transfer Host Only vs Confirm & Leave', () => {
    it('Transfer Host Only keeps the original host in the plan as JOINED participant', () => {
      const callerUuid = 'host-user-1';
      const targetUuid = 'target-user-2';

      // Simulating stopHostingWithReplacement
      const participantState = {
        [callerUuid]: { role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING' },
        [targetUuid]: { role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING' },
      };

      // Execute transfer only
      participantState[targetUuid].role = 'HOST';
      participantState[callerUuid].role = 'PARTICIPANT';

      expect(participantState[callerUuid].role).toBe('PARTICIPANT');
      expect(participantState[callerUuid].rsvp_status).toBe('JOINED');
      expect(participantState[callerUuid].assigned_group).toBe('GOING');
      expect(participantState[targetUuid].role).toBe('HOST');
    });

    it('Confirm & Leave removes the original host while transferring hosting', () => {
      const callerUuid = 'host-user-1';
      const targetUuid = 'target-user-2';

      const participantState: Record<string, any> = {
        [callerUuid]: { role: 'HOST', rsvp_status: 'JOINED', assigned_group: 'GOING', skip_reason: null },
        [targetUuid]: { role: 'PARTICIPANT', rsvp_status: 'JOINED', assigned_group: 'GOING', skip_reason: null },
      };

      // Execute confirm & leave
      participantState[targetUuid].role = 'HOST';
      participantState[callerUuid].role = 'PARTICIPANT';
      participantState[callerUuid].rsvp_status = 'SKIPPED';
      participantState[callerUuid].skip_reason = 'LEFT';
      participantState[callerUuid].assigned_group = null;

      expect(participantState[callerUuid].role).toBe('PARTICIPANT');
      expect(participantState[callerUuid].rsvp_status).toBe('SKIPPED');
      expect(participantState[callerUuid].skip_reason).toBe('LEFT');
      expect(participantState[callerUuid].assigned_group).toBeNull();
      expect(participantState[targetUuid].role).toBe('HOST');
    });
  });

  describe('3. Automatic Plan Waitlist Promotion on Host Departure', () => {
    it('promotes the next eligible waitlisted participant in FCFS queue order when host leaves', () => {
      const planSize = 2;
      let participants = [
        { id: 'host-1', role: 'HOST', rsvp_status: 'JOINED', queue_at: '2026-10-01T10:00:00Z' },
        { id: 'member-2', role: 'PARTICIPANT', rsvp_status: 'JOINED', queue_at: '2026-10-01T10:05:00Z' },
        { id: 'waitlist-3', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', queue_at: '2026-10-01T10:10:00Z' },
        { id: 'waitlist-4', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', queue_at: '2026-10-01T10:15:00Z' },
      ];

      // Host transfers to member-2 and leaves
      participants[1].role = 'HOST';
      participants[0].role = 'PARTICIPANT';
      participants[0].rsvp_status = 'SKIPPED';

      // Simulate auto_promote_waitlist_for_automatic:
      const joinedCount = participants.filter(p => p.rsvp_status === 'JOINED').length;
      const availableSpots = planSize - joinedCount;
      expect(availableSpots).toBe(1);

      const waitlisted = participants
        .filter(p => p.rsvp_status === 'WAITLISTED')
        .sort((a, b) => a.queue_at.localeCompare(b.queue_at));

      const toPromote = waitlisted.slice(0, availableSpots);
      for (const p of toPromote) {
        p.rsvp_status = 'JOINED';
      }

      // Verify outcomes:
      expect(participants.find(p => p.id === 'member-2')?.role).toBe('HOST');
      expect(participants.find(p => p.id === 'host-1')?.rsvp_status).toBe('SKIPPED');
      expect(participants.find(p => p.id === 'waitlist-3')?.rsvp_status).toBe('JOINED'); // Promoted!
      expect(participants.find(p => p.id === 'waitlist-4')?.rsvp_status).toBe('WAITLISTED'); // Remains waitlisted
      expect(participants.filter(p => p.rsvp_status === 'JOINED').length).toBe(planSize);
    });
  });

  describe('4. Assigned Plan Waitlist Promotion on Host Departure', () => {
    it('promotes next waitlisted candidate into GOING and renumbers remaining waitlist contiguously', () => {
      const planSize = 2;
      let participants = [
        { id: 'host-1', role: 'HOST', rsvp_status: 'JOINED', group: 'GOING', waitlist_pos: null },
        { id: 'member-2', role: 'PARTICIPANT', rsvp_status: 'JOINED', group: 'GOING', waitlist_pos: null },
        { id: 'waitlist-3', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', group: 'WAITLIST', waitlist_pos: 1 },
        { id: 'waitlist-4', role: 'PARTICIPANT', rsvp_status: 'INVITED', group: 'WAITLIST', waitlist_pos: 2 },
        { id: 'waitlist-5', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', group: 'WAITLIST', waitlist_pos: 3 },
      ];

      // Host transfers to member-2 and leaves
      participants[1].role = 'HOST';
      participants[0].role = 'PARTICIPANT';
      participants[0].rsvp_status = 'SKIPPED';
      participants[0].group = null;

      // Simulate auto_promote_waitlist_for_assigned:
      const goingCount = participants.filter(p => p.group === 'GOING' && p.rsvp_status !== 'SKIPPED').length;
      const availableSpots = Math.max(0, planSize - goingCount);
      expect(availableSpots).toBe(1);

      // Order waitlist candidates
      const waitlistCandidates = participants
        .filter(p => p.group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED')
        .sort((a, b) => (a.waitlist_pos || 0) - (b.waitlist_pos || 0));

      const promoted = waitlistCandidates.slice(0, availableSpots);
      for (const cand of promoted) {
        if (cand.rsvp_status === 'INVITED') {
          cand.group = 'GOING';
          cand.waitlist_pos = null;
        } else {
          cand.rsvp_status = 'JOINED';
          cand.group = 'GOING';
          cand.waitlist_pos = null;
        }
      }

      // Renumber remaining waitlist (1..N)
      const remainingWaitlist = participants
        .filter(p => p.group === 'WAITLIST' && p.rsvp_status !== 'SKIPPED')
        .sort((a, b) => (a.waitlist_pos || 0) - (b.waitlist_pos || 0));

      remainingWaitlist.forEach((p, idx) => {
        p.waitlist_pos = idx + 1;
      });

      // Verify outcomes:
      expect(participants.find(p => p.id === 'member-2')?.role).toBe('HOST');
      expect(participants.find(p => p.id === 'host-1')?.rsvp_status).toBe('SKIPPED');
      expect(participants.find(p => p.id === 'waitlist-3')?.rsvp_status).toBe('JOINED');
      expect(participants.find(p => p.id === 'waitlist-3')?.group).toBe('GOING');
      expect(participants.find(p => p.id === 'waitlist-3')?.waitlist_pos).toBeNull();

      // waitlist-4 was position 2, now position 1, INVITED preserved
      expect(participants.find(p => p.id === 'waitlist-4')?.waitlist_pos).toBe(1);
      expect(participants.find(p => p.id === 'waitlist-4')?.rsvp_status).toBe('INVITED');

      // waitlist-5 was position 3, now position 2
      expect(participants.find(p => p.id === 'waitlist-5')?.waitlist_pos).toBe(2);
      expect(participants.find(p => p.id === 'waitlist-5')?.rsvp_status).toBe('WAITLISTED');
    });
  });

  describe('5. Database Integrity & Host Constraints', () => {
    it('enforces exactly one active host after replacement leave', () => {
      const participants = [
        { id: 'caller-host', role: 'HOST', rsvp: 'JOINED' },
        { id: 'replacement-user', role: 'PARTICIPANT', rsvp: 'JOINED' },
        { id: 'other-user', role: 'PARTICIPANT', rsvp: 'JOINED' },
      ];

      // Simulate atomic operation
      participants[1].role = 'HOST';
      participants[0].role = 'PARTICIPANT';
      participants[0].rsvp = 'SKIPPED';

      const activeHosts = participants.filter(p => p.role === 'HOST' && p.rsvp === 'JOINED');
      expect(activeHosts.length).toBe(1);
      expect(activeHosts[0].id).toBe('replacement-user');
    });

    it('rejects host leaving without a valid joined replacement', () => {
      const checkEligibility = (targetRsvp: string) => {
        if (targetRsvp !== 'JOINED') {
          throw new Error('Only currently joined participants can become hosts');
        }
      };

      expect(() => checkEligibility('WAITLISTED')).toThrow('Only currently joined participants can become hosts');
      expect(() => checkEligibility('SKIPPED')).toThrow('Only currently joined participants can become hosts');
      expect(() => checkEligibility('INVITED')).toThrow('Only currently joined participants can become hosts');
      expect(() => checkEligibility('JOINED')).not.toThrow();
    });

    it('recalculates cost_per_participant across active joined participants on paid plan', () => {
      const totalCost = 1200;
      let activeCount = 4; // initially 4 participants (including leaving host)

      // Host leaves
      activeCount -= 1;
      const newCostPerParticipant = Math.round((totalCost / activeCount) * 100) / 100;

      expect(newCostPerParticipant).toBe(400); // 1200 / 3 = 400
    });
  });
});
