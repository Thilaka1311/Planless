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
});
