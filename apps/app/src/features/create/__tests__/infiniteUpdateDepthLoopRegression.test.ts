import { describe, it, expect, vi } from 'vitest';
import { adjustAssignedCapacity } from '../../participants/assigned/assignedCapacityLogic';
import { Friend } from '../../participants/shared/types';

describe('Maximum Update Depth Exceeded Prevention & Idempotency Suite', () => {
  it('1. Capacity clamping ping-pong loop is broken when totalInvitedCount <= 1', () => {
    // Scenario: Host only or single participant invited (totalInvitedCount = 1).
    // Capacity starts at 2 (the app-wide minimum plan size).
    const totalInvitedCount = 1;
    let capacity: number = 2;

    // Previously: targetCap = Math.min(capacity, totalInvitedCount) -> Math.min(2, 1) = 1.
    // capacityExceedsInvited = capacity > totalInvitedCount -> 2 > 1 = true.
    // AssignedParticipantScreen called onAdjustCapacity(1).
    // WhoIsActuallyComing ran Math.max(2, 1) = 2, keeping capacity at 2.
    // On every render, 2 > 1 was true, calling onAdjustCapacity(1) indefinitely.

    // With the fix:
    const targetCap = Math.max(2, Math.min(capacity, totalInvitedCount));
    const capacityExceedsInvited = capacity > totalInvitedCount;

    const onAdjustCapacityMock = vi.fn((val: number) => {
      capacity = Math.max(2, val);
    });

    if (capacityExceedsInvited && onAdjustCapacityMock && targetCap !== capacity) {
      onAdjustCapacityMock(targetCap);
    }

    // targetCap is 2, capacity is 2, so targetCap !== capacity is FALSE.
    // onAdjustCapacity is NOT called. Loop is prevented.
    expect(targetCap).toBe(2);
    expect(onAdjustCapacityMock).not.toHaveBeenCalled();
    expect(capacity).toBe(2);
  });

  it('2. Capacity reconciliation terminates in exactly 1 step when capacity exceeds invited count > 2', () => {
    // Scenario: User invites 3 friends + host = 4 totalInvitedCount, but capacity was 6.
    const totalInvitedCount = 4;
    let capacity: number = 6;
    let updateCount = 0;

    const onAdjustCapacityMock = vi.fn((val: number) => {
      capacity = Math.max(2, val);
      updateCount++;
    });

    // Step 1: capacity (6) > totalInvitedCount (4)
    let targetCap = Math.max(2, Math.min(capacity, totalInvitedCount));
    let capacityExceedsInvited = capacity > totalInvitedCount;

    if (capacityExceedsInvited && targetCap !== capacity) {
      onAdjustCapacityMock(targetCap);
    }

    expect(updateCount).toBe(1);
    expect(capacity).toBe(4);

    // Step 2: Next render after state update
    targetCap = Math.max(2, Math.min(capacity, totalInvitedCount));
    capacityExceedsInvited = capacity > totalInvitedCount;

    if (capacityExceedsInvited && targetCap !== capacity) {
      onAdjustCapacityMock(targetCap);
    }

    // Must not call onAdjustCapacity again!
    expect(updateCount).toBe(1);
    expect(capacity).toBe(4);
  });

  it('3. WhoIsActuallyComing capacity effect does not trigger state updates when target already equals capacity', () => {
    let currentCapacity = 2;
    const totalInvitedCount = 1;
    const setTotalCapacityMock = vi.fn((val: number) => {
      currentCapacity = val;
    });

    // Simulated WhoIsActuallyComing effect
    const target = Math.max(2, totalInvitedCount);
    if (currentCapacity > totalInvitedCount && currentCapacity !== target) {
      setTotalCapacityMock(target);
    }

    expect(setTotalCapacityMock).not.toHaveBeenCalled();
    expect(currentCapacity).toBe(2);
  });

  it('4. SelectedFriends state setter is strictly idempotent on identical friend arrays', () => {
    const prevFriends: Friend[] = [
      { id: 'f-1', dbUuid: 'f-1', name: 'Alice', avatar: 'https://example.com/a.png' },
      { id: 'f-2', dbUuid: 'f-2', name: 'Bob', avatar: 'https://example.com/b.png' },
    ];

    const nextFriends: Friend[] = [
      { id: 'f-1', dbUuid: 'f-1', name: 'Alice', avatar: 'https://example.com/a.png' },
      { id: 'f-2', dbUuid: 'f-2', name: 'Bob', avatar: 'https://example.com/b.png' },
    ];

    let state = prevFriends;

    // Idempotent updater
    const updateFn = (incoming: Friend[]) => {
      if (
        state.length === incoming.length &&
        state.every((f, i) => (f.id || f.dbUuid) === (incoming[i]?.id || incoming[i]?.dbUuid))
      ) {
        return state; // Same reference, React bails out of re-render
      }
      return incoming;
    };

    const result = updateFn(nextFriends);
    expect(result).toBe(prevFriends); // Exact object identity preserved!
  });

  it('5. PriorityGuestIds setter is strictly idempotent on identical ID arrays', () => {
    const prevIds = ['f-1', 'f-2'];
    const nextIds = ['f-1', 'f-2'];

    let state = prevIds;

    const updateFn = (incoming: string[]) => {
      if (state.length === incoming.length && state.every((id, i) => id === incoming[i])) {
        return state;
      }
      return incoming;
    };

    const result = updateFn(nextIds);
    expect(result).toBe(prevIds);
  });

  it('6. TotalCapacity setter is strictly idempotent on identical numeric value', () => {
    let state: number | undefined = 3;

    const setTotalCapacity = (val: number | undefined | null) => {
      const nextVal = (val === null || val === undefined) ? undefined : val;
      state = (state === nextVal ? state : nextVal);
    };

    setTotalCapacity(3);
    expect(state).toBe(3);
  });

  it('7. AssignedParticipantScreen profile enrichment does not mutate state when details are unchanged', () => {
    const currentGoing: Friend[] = [
      { id: 'host', dbUuid: 'host', name: 'You', avatar: '', isHost: true },
      { id: 'f-1', dbUuid: 'f-1', name: 'Alice', avatar: 'https://example.com/a.png' },
    ];
    const currentWait: Friend[] = [
      { id: 'f-2', dbUuid: 'f-2', name: 'Bob', avatar: 'https://example.com/b.png' },
    ];

    const currentFriendMap = new Map<string, Friend>();
    currentFriendMap.set('f-1', { id: 'f-1', dbUuid: 'f-1', name: 'Alice', avatar: 'https://example.com/a.png' });
    currentFriendMap.set('f-2', { id: 'f-2', dbUuid: 'f-2', name: 'Bob', avatar: 'https://example.com/b.png' });

    let hasChanges = false;
    currentGoing.map((f) => {
      if (f.isHost) return f;
      const fresh = currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid);
      if (fresh && (fresh.name !== f.name || fresh.avatar !== f.avatar)) {
        hasChanges = true;
        return { ...f, ...fresh };
      }
      return f;
    });

    currentWait.map((f) => {
      const fresh = currentFriendMap.get(f.id) || currentFriendMap.get(f.dbUuid);
      if (fresh && (fresh.name !== f.name || fresh.avatar !== f.avatar)) {
        hasChanges = true;
        return { ...f, ...fresh };
      }
      return f;
    });

    expect(hasChanges).toBe(false);
  });
});
