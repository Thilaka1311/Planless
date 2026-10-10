import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { partitionAutomaticParticipants, normalizeStatus } from '../../../../../lib/participantStatus';
import { WaitlistSection } from '../../components/WaitlistSection';
import { StackingFriends } from '../../components/StackingFriends';
import { Friend } from '../../shared/types';

describe('Automatic Mode Waitlist Numbering', () => {
  it('1. In Automatic mode, invited participants in the Waitlist section have NO number', () => {
    const rawMembers: any[] = [
      { id: 'host-1', name: 'Host', isHost: true, rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:00:00Z' },
      { id: 'user-joined-1', name: 'Joined User', rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:01:00Z' },
      { id: 'user-wait-1', name: 'Thilaka Sundar', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:05:00Z' },
      { id: 'user-inv-1', name: 'Aznan', rsvp_status: 'INVITED' },
      { id: 'user-inv-2', name: 'RAAM', rsvp_status: 'INVITED' },
      { id: 'user-inv-3', name: 'Ren', rsvp_status: 'INVITED' },
      { id: 'user-inv-4', name: 'Rishi', rsvp_status: 'INVITED' },
      { id: 'user-inv-5', name: 'Thi', rsvp_status: 'INVITED' },
      { id: 'user-inv-6', name: 'vaishakh M', rsvp_status: 'INVITED' },
    ];

    // Capacity is 2: Host + Joined User fill Going (2 / 2).
    // Remaining members go to Waitlist: Thilaka Sundar (WAITLISTED) + 6 INVITED participants.
    const partitioned = partitionAutomaticParticipants(rawMembers, 2, 'host-1');

    expect(partitioned.going).toHaveLength(2);
    expect(partitioned.waitlist).toHaveLength(7);

    // Verify waitlistPosition in partitioned data
    const thilak = partitioned.waitlist.find((p) => p.name === 'Thilaka Sundar');
    expect(thilak).toBeDefined();
    expect(thilak?.waitlistPosition).toBe(1);

    const aznan = partitioned.waitlist.find((p) => p.name === 'Aznan');
    expect(aznan).toBeDefined();
    expect(aznan?.waitlistPosition).toBeNull();

    // Render WaitlistSection in automatic mode
    const html = renderToString(
      <WaitlistSection
        waitlist={partitioned.waitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    // Thilaka Sundar has #1
    expect(html).toContain('#1');
    expect(html).toContain('Thilaka Sundar');

    // Invited participants must NOT receive #2, #3, #4, #5, #6, #7
    expect(html).not.toContain('#2');
    expect(html).not.toContain('#3');
    expect(html).not.toContain('#4');
    expect(html).not.toContain('#5');
    expect(html).not.toContain('#6');
    expect(html).not.toContain('#7');

    // But their names are rendered
    expect(html).toContain('Aznan');
    expect(html).toContain('RAAM');
    expect(html).toContain('Ren');
    expect(html).toContain('Rishi');
    expect(html).toContain('Thi');
    expect(html).toContain('vaishakh M');
  });

  it('2. The first participant who explicitly joins receives #1, the next receives #2 in FCFS order', () => {
    // Initially: Thilaka Sundar joined first (10:05), Aznan joins next (10:10)
    const rawMembers: any[] = [
      { id: 'host-1', name: 'Host', isHost: true, rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:00:00Z' },
      { id: 'user-joined-1', name: 'Joined User', rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:01:00Z' },
      { id: 'user-wait-1', name: 'Thilaka Sundar', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:05:00Z' },
      { id: 'user-wait-2', name: 'Aznan', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:10:00Z' },
      { id: 'user-inv-1', name: 'RAAM', rsvp_status: 'INVITED' },
    ];

    const partitioned = partitionAutomaticParticipants(rawMembers, 2, 'host-1');

    const thilak = partitioned.waitlist.find((p) => p.name === 'Thilaka Sundar');
    const aznan = partitioned.waitlist.find((p) => p.name === 'Aznan');
    const raam = partitioned.waitlist.find((p) => p.name === 'RAAM');

    expect(thilak?.waitlistPosition).toBe(1);
    expect(aznan?.waitlistPosition).toBe(2);
    expect(raam?.waitlistPosition).toBeNull();

    const html = renderToString(
      <WaitlistSection
        waitlist={partitioned.waitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).not.toContain('#3');
    expect(html).toContain('RAAM');
  });

  it('3. Existing waitlisted participants retain their correct order when a new participant joins', () => {
    // 3 waitlisted participants joining at staggered times
    const rawMembers: any[] = [
      { id: 'host-1', name: 'Host', isHost: true, rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:00:00Z' },
      { id: 'user-wait-3', name: 'Charlie', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:30:00Z' },
      { id: 'user-wait-1', name: 'Alice', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:10:00Z' },
      { id: 'user-wait-2', name: 'Bob', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:20:00Z' },
      { id: 'user-inv-1', name: 'David', rsvp_status: 'INVITED' },
    ];

    // Capacity is 1 (Host only in going)
    const partitioned = partitionAutomaticParticipants(rawMembers, 1, 'host-1');

    // In FCFS order: Alice (10:10) = #1, Bob (10:20) = #2, Charlie (10:30) = #3
    const alice = partitioned.waitlist.find((p) => p.name === 'Alice');
    const bob = partitioned.waitlist.find((p) => p.name === 'Bob');
    const charlie = partitioned.waitlist.find((p) => p.name === 'Charlie');
    const david = partitioned.waitlist.find((p) => p.name === 'David');

    expect(alice?.waitlistPosition).toBe(1);
    expect(bob?.waitlistPosition).toBe(2);
    expect(charlie?.waitlistPosition).toBe(3);
    expect(david?.waitlistPosition).toBeNull();

    const html = renderToString(
      <WaitlistSection
        waitlist={partitioned.waitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).not.toContain('#4');
    expect(html).toContain('David');
  });

  it('4. Screen refresh preserves identical numbering from persisted state', () => {
    const dbRows: any[] = [
      { id: 'h1', user_id: 'u-host', role: 'HOST', rsvp_status: 'JOINED', joined_queue_at: '2026-10-10T10:00:00Z', name: 'Host' },
      { id: 'p1', user_id: 'u-1', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:05:00Z', name: 'Thilak' },
      { id: 'p2', user_id: 'u-2', role: 'PARTICIPANT', rsvp_status: 'WAITLISTED', joined_queue_at: '2026-10-10T10:15:00Z', name: 'Aznan' },
      { id: 'p3', user_id: 'u-3', role: 'PARTICIPANT', rsvp_status: 'INVITED', joined_queue_at: null, name: 'Guest' },
    ];

    // Initial render
    const pass1 = partitionAutomaticParticipants(dbRows, 1, 'u-host');
    // Refresh (simulated identical fetch from Supabase)
    const pass2 = partitionAutomaticParticipants(dbRows, 1, 'u-host');

    expect(pass1.waitlist.map((p) => ({ name: p.name, pos: p.waitlistPosition })))
      .toEqual(pass2.waitlist.map((p) => ({ name: p.name, pos: p.waitlistPosition })));

    const htmlPass1 = renderToString(
      <WaitlistSection
        waitlist={pass1.waitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    const htmlPass2 = renderToString(
      <WaitlistSection
        waitlist={pass2.waitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    expect(htmlPass1).toBe(htmlPass2);
  });

  it('5. Assigned mode preserves numbering for all waitlist entries including INVITED', () => {
    // In Assigned mode, host manually places people in Waitlist, assigning them sequential positions
    const assignedWaitlist: Friend[] = [
      { id: 'w-1', dbUuid: 'w-1', name: 'Alice', avatar: '', rsvpStatus: 'WAITLISTED', waitlistPosition: 1 },
      { id: 'w-2', dbUuid: 'w-2', name: 'Bob', avatar: '', rsvpStatus: 'INVITED', waitlistPosition: 2 },
      { id: 'w-3', dbUuid: 'w-3', name: 'Charlie', avatar: '', rsvpStatus: 'INVITED', waitlistPosition: 3 },
    ];

    const html = renderToString(
      <WaitlistSection
        waitlist={assignedWaitlist}
        isHost={true}
        reorderable={true}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="assigned"
      />
    );

    // In Assigned mode, all assigned waitlist members retain their assigned positions
    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Charlie');
  });

  it('6. Automatic mode directly passed unpartitioned raw items still enforces NO numbers for INVITED', () => {
    // Edge case: unpartitioned items passed directly to WaitlistSection with waitlistMode="automatic"
    const unpartitionedWaitlist: Friend[] = [
      { id: 'u1', dbUuid: 'u1', name: 'Waitlisted Guy', avatar: '', rsvpStatus: 'WAITLISTED', joinedQueueAt: '2026-10-10T10:00:00Z' },
      { id: 'u2', dbUuid: 'u2', name: 'Invited Guy', avatar: '', rsvpStatus: 'INVITED' },
    ];

    const html = renderToString(
      <WaitlistSection
        waitlist={unpartitionedWaitlist}
        isHost={true}
        reorderable={false}
        showIndex={true}
        useParticipantPosition={true}
        waitlistMode="automatic"
      />
    );

    // Waitlisted Guy gets #1 via automaticPositionsMap canonical FCFS fallback
    expect(html).toContain('#1');
    expect(html).toContain('Waitlisted Guy');

    // Invited Guy strictly gets NO number
    expect(html).not.toContain('#2');
    expect(html).toContain('Invited Guy');
  });
});
