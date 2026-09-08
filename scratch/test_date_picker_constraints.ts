function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRSVPValidationError(
  tempDate: string,
  tempTime: string,
  tempRSVPOption: string | null
): string | null {
  if (!tempDate || !tempTime || !tempRSVPOption) {
    return null;
  }

  const [year, month, day] = tempDate.split('-').map(Number);
  const [hour, minute] = tempTime.split(':').map(Number);

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
    return null;
  }

  const planDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);
  const now = new Date();

  if (!tempRSVPOption) {
    return null;
  }

  let rsvpDateTime: Date;
  if (tempRSVPOption === '< 1 Hour') {
    rsvpDateTime = new Date(planDateTime.getTime() - 1 * 60 * 60 * 1000);
  } else if (tempRSVPOption === '< 12 Hours') {
    rsvpDateTime = new Date(planDateTime.getTime() - 12 * 60 * 60 * 1000);
  } else if (tempRSVPOption === '< 24 Hours') {
    rsvpDateTime = new Date(planDateTime.getTime() - 24 * 60 * 60 * 1000);
  } else {
    return null;
  }

  if (rsvpDateTime.getTime() <= now.getTime()) {
    return 'RSVP deadline cannot be in the past.';
  }

  return null;
}

function runTests() {
  console.log("=== Testing Date Picker Constraints & Validation ===");

  const now = new Date("2026-09-08T12:00:00.000Z");
  const todayStr = getTodayDateString(now);
  console.log("Calculated today string:", todayStr);

  const minDate = todayStr;

  function simulateHandleDateChange(newDate: string, currentMinDate: string): boolean {
    if (currentMinDate && newDate && newDate < currentMinDate) {
      return false; // rejected
    }
    return true; // accepted
  }

  // 1. Today -> selectable
  const isTodayAllowed = simulateHandleDateChange("2026-09-08", minDate);
  console.log("1. Today (2026-09-08) selectable:", isTodayAllowed);
  if (!isTodayAllowed) {
    throw new Error("Today must be selectable!");
  }

  // 2. Yesterday -> NOT selectable
  const isYesterdayAllowed = simulateHandleDateChange("2026-09-07", minDate);
  console.log("2. Yesterday (2026-09-07) selectable:", isYesterdayAllowed);
  if (isYesterdayAllowed) {
    throw new Error("Yesterday must NOT be selectable!");
  }

  // 3. Older date -> NOT selectable
  const isOldAllowed = simulateHandleDateChange("2026-08-15", minDate);
  console.log("3. Older date (2026-08-15) selectable:", isOldAllowed);
  if (isOldAllowed) {
    throw new Error("Past dates must NOT be selectable!");
  }

  // 4. Tomorrow -> selectable
  const isTomorrowAllowed = simulateHandleDateChange("2026-09-09", minDate);
  console.log("4. Tomorrow (2026-09-09) selectable:", isTomorrowAllowed);
  if (!isTomorrowAllowed) {
    throw new Error("Tomorrow must be selectable!");
  }

  // 5. Future date -> selectable
  const isFutureAllowed = simulateHandleDateChange("2026-10-01", minDate);
  console.log("5. Future date (2026-10-01) selectable:", isFutureAllowed);
  if (!isFutureAllowed) {
    throw new Error("Future date must be selectable!");
  }

  // 6. Existing plan with today's date
  const existingPlanDate = todayStr;
  const isExistingTodayAllowed = simulateHandleDateChange(existingPlanDate, minDate);
  console.log("6. Existing plan with today's date works:", isExistingTodayAllowed);
  if (!isExistingTodayAllowed) {
    throw new Error("Existing plan with today's date must work normally!");
  }

  // 7. RSVP validation logic check
  const rsvpErrFuture = getRSVPValidationError("2026-09-15", "18:00", "< 1 Hour");
  console.log("7a. Future RSVP error check (expected null):", rsvpErrFuture);
  if (rsvpErrFuture !== null) {
    throw new Error(`Expected null for future RSVP error, got: ${rsvpErrFuture}`);
  }

  console.log("=== ALL DATE PICKER CONSTRAINT TESTS PASSED SUCCESSFULLY ===");
}

runTests();
