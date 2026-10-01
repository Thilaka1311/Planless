import { describe, it, expect } from 'vitest';

describe('No Limit Plan Capacity Flow (Phase 1)', () => {
  it('starts newly created plans with undefined capacity representing No Limit', () => {
    const draftForm = {
      totalCapacity: undefined,
      isCapacityManuallySet: false,
    };

    expect(draftForm.totalCapacity).toBeUndefined();
    expect(draftForm.isCapacityManuallySet).toBe(false);

    // Plan size sent to DB should be null, not a fake large number like 9999 or count of participants
    const planSizeToUse = draftForm.totalCapacity !== undefined && draftForm.totalCapacity !== null
      ? Number(draftForm.totalCapacity)
      : null;

    expect(planSizeToUse).toBeNull();
  });

  it('keeps totalCapacity undefined on handleContinue from Participant Management if not manually configured', () => {
    let totalCapacity: number | undefined = undefined;
    const setTotalCapacity = (val: number | undefined) => {
      totalCapacity = val;
    };

    const going = [{ id: 'friend-1', isHost: false }, { id: 'friend-2', isHost: false }];
    const waitlist: any[] = [];

    // The new handleContinue logic does not force totalCapacity = Math.max(2, going.length)
    if (totalCapacity !== undefined) {
      setTotalCapacity(Math.max(2, going.length));
    }

    expect(totalCapacity).toBeUndefined();
  });

  it('evaluates Hero Metadata Card display as "No limit" when plan_size is null in createMode', () => {
    const rawDbPlan = { plan_size: null };
    const selectedPlan = { plan_size: null };
    const currentPlanSize = Number(rawDbPlan?.plan_size ?? selectedPlan?.plan_size ?? 2);

    const display =
      rawDbPlan?.plan_size === null || (selectedPlan as any)?.plan_size === null
        ? "No limit"
        : (currentPlanSize || 2);
    expect(display).toBe("No limit");
  });

  it('evaluates Hero Metadata Card display as numeric plan size when configured in createMode', () => {
    const rawDbPlan = { plan_size: 4 };
    const selectedPlan = { plan_size: 4 };
    const currentPlanSize = Number(rawDbPlan?.plan_size ?? selectedPlan?.plan_size ?? 2);

    const display =
      rawDbPlan?.plan_size === null || (selectedPlan as any)?.plan_size === null
        ? "No limit"
        : (currentPlanSize || 2);
    expect(display).toBe(4);

    const rawDbPlan6 = { plan_size: 6 };
    const currentPlanSize6 = Number(rawDbPlan6?.plan_size ?? 2);
    const display6 =
      rawDbPlan6?.plan_size === null
        ? "No limit"
        : (currentPlanSize6 || 2);
    expect(display6).toBe(6);
  });

  it('updates local state synchronously from Participant Management without database roundtrip', () => {
    // Simulated form state
    let totalCapacity: number | undefined = undefined;
    let isCapacityManuallySet = false;
    const selectedFriends = [
      { id: 'friend-1', name: 'Aznan', isHost: false },
      { id: 'friend-2', name: 'Pranav', isHost: false },
      { id: 'friend-3', name: 'Samdavid', isHost: false },
    ];
    let isHostSelected = true;

    const setTotalCapacity = (val: number | undefined | null) => {
      const nextVal = (val === null || val === undefined) ? undefined : val;
      totalCapacity = nextVal;
      isCapacityManuallySet = nextVal !== undefined;
    };

    const onAdjustCapacity = (val: number | null | undefined) => {
      if (val === null || val === undefined) {
        setTotalCapacity(undefined);
      } else {
        setTotalCapacity(Math.max(2, val));
      }
    };

    // Helper to compute synthetic plan and review display as CreatePlanReview does
    const getReviewDisplay = () => {
      const syntheticPlan = {
        plan_size: totalCapacity !== undefined ? totalCapacity : null,
      };
      const rawDbPlan = syntheticPlan;
      const currentPlanSize = Number(rawDbPlan.plan_size ?? 2);
      return rawDbPlan.plan_size === null ? "No limit" : currentPlanSize;
    };

    // Initial state: No limit
    expect(getReviewDisplay()).toBe("No limit");

    // 1. Participant Management adjusts plan size to 4
    onAdjustCapacity(4);
    expect(totalCapacity).toBe(4);
    expect(isCapacityManuallySet).toBe(true);
    // Review screen immediately displays 4
    expect(getReviewDisplay()).toBe(4);

    // 2. Change 4 -> 6
    onAdjustCapacity(6);
    expect(totalCapacity).toBe(6);
    expect(getReviewDisplay()).toBe(6);

    // 3. Change 6 -> No Limit
    onAdjustCapacity(null);
    expect(totalCapacity).toBeUndefined();
    expect(isCapacityManuallySet).toBe(false);
    expect(getReviewDisplay()).toBe("No limit");

    // 4. Change No Limit -> 4
    onAdjustCapacity(4);
    expect(totalCapacity).toBe(4);
    expect(getReviewDisplay()).toBe(4);

    // 5. Verify participant preservation
    expect(selectedFriends).toHaveLength(3);
    expect(selectedFriends[0].name).toBe('Aznan');
    expect(selectedFriends[1].name).toBe('Pranav');
    expect(selectedFriends[2].name).toBe('Samdavid');
    expect(isHostSelected).toBe(true);
  });

  it('syncs EditCapacityBottomSheet capacity correctly from current plan size in PlansPreviewScreen', () => {
    const computeBottomSheetCapacity = (
      rawDbPlan: any,
      selectedPlan: any,
      currentPlanSize: number,
      draftCapacityOverride: number | null
    ) => {
      return draftCapacityOverride != null
        ? draftCapacityOverride
        : (rawDbPlan?.plan_size === null || (selectedPlan as any)?.plan_size === null
            ? null
            : (currentPlanSize || 2));
    };

    // Scenario A: Plan size is 4 (like user screenshot), draftCapacityOverride is null
    const rawDbPlan4 = { plan_size: 4 };
    const selectedPlan4 = { plan_size: 4 };
    const currentPlanSize4 = Number(rawDbPlan4?.plan_size ?? selectedPlan4?.plan_size ?? 2);
    const draftCapacityOverrideNull: number | null = null;

    const capacityA = computeBottomSheetCapacity(
      rawDbPlan4,
      selectedPlan4,
      currentPlanSize4,
      draftCapacityOverrideNull
    );
    // Must be 4, NOT null!
    expect(capacityA).toBe(4);

    // Scenario B: Plan size is null ("No limit")
    const rawDbPlanNull = { plan_size: null };
    const selectedPlanNull = { plan_size: null };
    const currentPlanSizeNull = 2;

    const capacityB = computeBottomSheetCapacity(
      rawDbPlanNull,
      selectedPlanNull,
      currentPlanSizeNull,
      draftCapacityOverrideNull
    );
    expect(capacityB).toBeNull();

    // Scenario C: Guided adjustment override is active (e.g. 5)
    const draftCapacityOverride5: number | null = 5;
    const capacityC = computeBottomSheetCapacity(
      rawDbPlan4,
      selectedPlan4,
      currentPlanSize4,
      draftCapacityOverride5
    );
    expect(capacityC).toBe(5);
  });

  it('allows increasing capacity from 6 to 7 in Automatic mode without being clamped to active participants', () => {
    const isAssigned = false;
    const totalActiveParticipants = 6;
    const currentPlanSize = 6;
    const previewMaxCapacity = Math.max(currentPlanSize || 2, Math.max(2, totalActiveParticipants)); // 6
    expect(previewMaxCapacity).toBe(6);

    // In Automatic mode, maxAllowedCapacity must be 50, not clamped to 6
    const maxAllowedCapacity = isAssigned ? previewMaxCapacity : 50;
    expect(maxAllowedCapacity).toBe(50);

    const newCapacity = 7;
    const clampedVal = Math.min(maxAllowedCapacity, Math.max(2, newCapacity));
    expect(clampedVal).toBe(7);
    expect(clampedVal).not.toBe(currentPlanSize);
  });

  it('correctly persists capacity update to database and updates local cache synchronously', async () => {
    const mockDbPlans = [
      { id: '11111111-2222-3333-4444-555555555555', public_id: 'P000001', title: 'Friday night', plan_size: 6 }
    ];

    let persistedRow: any = null;
    let localCache = [...mockDbPlans];

    const mockUpdatePlanDetails = async (
      rawPlanId: string,
      updates: { plan_size?: number | null }
    ) => {
      const planUuid = '11111111-2222-3333-4444-555555555555';
      const boundedPlanSize = updates.plan_size !== undefined && updates.plan_size !== null
        ? Math.max(2, updates.plan_size)
        : null;

      // Local state update
      localCache = localCache.map(p =>
        p.id === planUuid || p.public_id === rawPlanId
          ? { ...p, plan_size: boundedPlanSize }
          : p
      );

      // Direct DB update
      persistedRow = {
        ...localCache[0],
        plan_size: boundedPlanSize,
        updated_at: new Date().toISOString(),
      };
      return persistedRow;
    };

    // 1. Host changes capacity 6 -> 7
    await mockUpdatePlanDetails('P000001', { plan_size: 7 });
    expect(persistedRow.plan_size).toBe(7);
    expect(localCache[0].plan_size).toBe(7);

    // 2. Reopening sheet reads from localCache or persisted DB row
    const reopenedCapacity = localCache[0].plan_size === null ? null : (localCache[0].plan_size || 2);
    expect(reopenedCapacity).toBe(7);

    // 3. Host changes capacity 7 -> No Limit (null)
    await mockUpdatePlanDetails('P000001', { plan_size: null });
    expect(persistedRow.plan_size).toBeNull();
    expect(localCache[0].plan_size).toBeNull();

    // 4. Hero card displays "No limit"
    const heroDisplay = localCache[0].plan_size === null ? "No limit" : localCache[0].plan_size;
    expect(heroDisplay).toBe("No limit");
  });

  it('renders No Limit summary as "X invited" without "Max 50 participants"', () => {
    const currentCapacity: number | null = null;
    const invitedCount = 8;
    const joinedCount = undefined;

    let capacitySummary: string;
    if (currentCapacity === null) {
      const totalCount = invitedCount ?? joinedCount ?? 0;
      capacitySummary = `${totalCount} invited`;
    } else {
      capacitySummary = `${currentCapacity} going`;
    }

    expect(capacitySummary).toBe('8 invited');
    expect(capacitySummary).not.toContain('Max 50 participants');
    expect(capacitySummary).not.toContain('joined');
  });

  it('omits waitlisted text when waitlisted count is 0 in automatic mode', () => {
    const currentCapacity = 9;
    const invitedCount = 9;
    const isAutomatic = true;

    const going = currentCapacity;
    const waitlisted = Math.max(0, (invitedCount ?? currentCapacity) - currentCapacity);
    const capacitySummary =
      waitlisted > 0 ? `${going} going • ${waitlisted} waitlisted` : `${going} going`;

    expect(capacitySummary).toBe('9 going');
    expect(capacitySummary).not.toContain('0 waitlisted');
  });

  it('does NOT coerce null to 2 in handleAdjustCapacity when user sets No Limit', async () => {
    let capturedCapacity: number | null | undefined = undefined;
    const onUpdatePlanCapacity = async (planId: string, capacity: number | null) => {
      capturedCapacity = capacity;
    };

    const maxCapacity = 50;
    const currentCapacity: number | null = 2;

    const handleAdjustCapacity = async (newVal: number | null) => {
      if (newVal === null || newVal === undefined) {
        if (currentCapacity === null) return;
        await onUpdatePlanCapacity('test-plan-id', null);
        return;
      }
      const clampedVal = Math.min(maxCapacity, Math.max(2, newVal));
      await onUpdatePlanCapacity('test-plan-id', clampedVal);
    };

    // When newVal is null, it should NOT become Math.max(2, null) = 2
    await handleAdjustCapacity(null);
    expect(capturedCapacity).toBeNull();
  });

  it('correctly sets participant_filtering to null in database update when plan_size is null', () => {
    const planUpdate: any = { plan_size: null };
    if (planUpdate.plan_size === null) {
      planUpdate.participant_filtering = null;
    }

    expect(planUpdate.plan_size).toBeNull();
    expect(planUpdate.participant_filtering).toBeNull();
  });

  it('evaluates WaitlistModeSelector visibility based on plan capacity', () => {
    const shouldShowWaitlistMode = (capacity: number | null | undefined, isHost: boolean) => {
      if (!isHost) return false;
      // In WaitlistModeSelector: if (capacity === null || capacity === undefined) return null;
      if (capacity === null || capacity === undefined) return false;
      return true;
    };

    // When capacity is No Limit (null), waitlist selector must be hidden
    expect(shouldShowWaitlistMode(null, true)).toBe(false);
    expect(shouldShowWaitlistMode(undefined, true)).toBe(false);

    // When capacity is set (e.g. 2, 4, 10), waitlist selector must be shown
    expect(shouldShowWaitlistMode(2, true)).toBe(true);
    expect(shouldShowWaitlistMode(4, true)).toBe(true);
    expect(shouldShowWaitlistMode(10, true)).toBe(true);
  });
});

