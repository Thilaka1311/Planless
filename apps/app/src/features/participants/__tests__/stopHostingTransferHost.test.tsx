import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  MakeAnotherParticipantHostBottomSheet,
  EligibleHostReplacementParticipant,
} from '../../plans/components/BottomSheets';
import { memberToAssignedFriend } from '../assigned/AssignedParticipantContainer';
import { memberToAutomaticFriend } from '../automatic/AutomaticParticipantContainer';

describe('Stop Hosting: Transfer Host Without Leaving the Plan', () => {
  const eligibleCandidates: EligibleHostReplacementParticipant[] = [
    {
      id: 'candidate-uuid-1',
      name: 'Thilaka Sundar',
      avatar: 'https://example.com/thilak.png',
      username: 'thilak',
    },
    {
      id: 'candidate-uuid-2',
      name: 'Renjith',
      avatar: 'https://example.com/renjith.png',
      username: 'renjith',
    },
  ];

  describe('1. MakeAnotherParticipantHostBottomSheet UI Presentation', () => {
    it('renders "Transfer Host" title, non-leave subtitle, and "Transfer Host" button when mode="stop_hosting"', () => {
      const html = renderToString(
        <MakeAnotherParticipantHostBottomSheet
          isOpen={true}
          eligibleParticipants={eligibleCandidates}
          mode="stop_hosting"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      // Header title must be "Transfer Host", not "You're the only host"
      expect(html).toContain('Transfer Host');
      expect(html).not.toContain("You&#x27;re the only host");
      expect(html).not.toContain("You're the only host");

      // Subtitle must not mention leaving the plan
      expect(html).toContain('Choose someone else to host this plan');
      expect(html).not.toContain('before you leave');

      // Confirmation button must say "Transfer Host", not "Confirm & Leave"
      expect(html).toContain('Transfer Host');
      expect(html).not.toContain('Confirm &amp; Leave');
      expect(html).not.toContain('Confirm & Leave');

      // Candidate name is rendered
      expect(html).toContain('Thilaka Sundar');
      expect(html).toContain('Renjith');
    });

    it('renders "Transferring Host…" when mode="stop_hosting" and isSubmitting=true', () => {
      const html = renderToString(
        <MakeAnotherParticipantHostBottomSheet
          isOpen={true}
          eligibleParticipants={eligibleCandidates}
          mode="stop_hosting"
          isSubmitting={true}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('Transferring Host…');
      expect(html).not.toContain('Transferring &amp; Leaving…');
      expect(html).not.toContain('Transferring & Leaving…');
    });

    it('renders empty state without leave messaging when mode="stop_hosting"', () => {
      const html = renderToString(
        <MakeAnotherParticipantHostBottomSheet
          isOpen={true}
          eligibleParticipants={[]}
          mode="stop_hosting"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('Wait for someone to join the plan');
      expect(html).toContain('There are currently no other joined participants. Once a participant joins, you can assign them as host.');
      expect(html).not.toContain('assign them as host and leave');
    });

    it('preserves existing "Confirm & Leave" and "before you leave" when mode="leave"', () => {
      const html = renderToString(
        <MakeAnotherParticipantHostBottomSheet
          isOpen={true}
          eligibleParticipants={eligibleCandidates}
          mode="leave"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain("You&#x27;re the only host");
      expect(html).toContain('Choose someone else to host this plan before you leave');
      expect(html).toContain('Confirm &amp; Leave');
    });
  });

  describe('2. State Machine & Optimistic Role Transitions', () => {
    it('memberToAssignedFriend correctly demotes former host to regular participant and promotes candidate', () => {
      const planUuid = 'plan-123';
      const callerUuid = 'caller-host-uuid';
      const candidateUuid = 'candidate-uuid-1';

      // Simulated DB participants after stopHostingWithReplacement optimistic update
      const dbPlanParticipants = [
        {
          id: 'pp-1',
          plan_id: planUuid,
          user_id: callerUuid,
          role: 'PARTICIPANT', // Demoted
          rsvp_status: 'JOINED', // Still joined
          assigned_group: 'GOING', // Still in going
          leave_requested: false,
        },
        {
          id: 'pp-2',
          plan_id: planUuid,
          user_id: candidateUuid,
          role: 'HOST', // Promoted
          rsvp_status: 'JOINED',
          assigned_group: 'GOING',
          leave_requested: false,
        },
      ];

      // Former host member (whose raw member.role might still be HOST before network refresh)
      const callerMember = {
        userId: callerUuid,
        name: 'Original Host',
        role: 'HOST',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
      };

      // Candidate member
      const candidateMember = {
        userId: candidateUuid,
        name: 'Thilaka Sundar',
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
        assigned_group: 'GOING',
      };

      const callerFriend = memberToAssignedFriend(
        callerMember,
        callerUuid,
        callerUuid,
        dbPlanParticipants,
        planUuid
      );

      const candidateFriend = memberToAssignedFriend(
        candidateMember,
        callerUuid,
        callerUuid,
        dbPlanParticipants,
        planUuid
      );

      // Caller is demoted to PARTICIPANT (isHost: false), but stays in plan as JOINED & GOING
      expect(callerFriend.isHost).toBe(false);
      expect(callerFriend.rsvpStatus).toBe('JOINED');
      expect(callerFriend.assignedGroup).toBe('GOING');
      expect(callerFriend.leave_requested).toBe(false);
      expect(callerFriend.skipReason).toBeNull();

      // Candidate is promoted to HOST (isHost: true)
      expect(candidateFriend.isHost).toBe(true);
      expect(candidateFriend.rsvpStatus).toBe('JOINED');
      expect(candidateFriend.assignedGroup).toBe('GOING');
    });

    it('memberToAutomaticFriend correctly demotes former host to regular participant and promotes candidate', () => {
      const planUuid = 'plan-123';
      const callerUuid = 'caller-host-uuid';
      const candidateUuid = 'candidate-uuid-1';

      const dbPlanParticipants = [
        {
          id: 'pp-1',
          plan_id: planUuid,
          user_id: callerUuid,
          role: 'PARTICIPANT',
          rsvp_status: 'JOINED',
          leave_requested: false,
        },
        {
          id: 'pp-2',
          plan_id: planUuid,
          user_id: candidateUuid,
          role: 'HOST',
          rsvp_status: 'JOINED',
          leave_requested: false,
        },
      ];

      const callerMember = {
        userId: callerUuid,
        name: 'Original Host',
        role: 'HOST',
        rsvp_status: 'JOINED',
      };

      const candidateMember = {
        userId: candidateUuid,
        name: 'Thilaka Sundar',
        role: 'PARTICIPANT',
        rsvp_status: 'JOINED',
      };

      const callerFriend = memberToAutomaticFriend(
        callerMember,
        callerUuid,
        callerUuid,
        dbPlanParticipants,
        planUuid
      );

      const candidateFriend = memberToAutomaticFriend(
        candidateMember,
        callerUuid,
        callerUuid,
        dbPlanParticipants,
        planUuid
      );

      expect(callerFriend.isHost).toBe(false);
      expect(callerFriend.rsvpStatus).toBe('JOINED');
      expect(callerFriend.leave_requested).toBe(false);
      expect(candidateFriend.isHost).toBe(true);
      expect(candidateFriend.rsvpStatus).toBe('JOINED');
    });
  });
});
