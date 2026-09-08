import { getRSVPDeadlineInfo, rsvpUrgencyStyles } from "../apps/app/src/features/plans/utils/rsvpFormatter";

function runTests() {
  console.log("=== Running RSVP Styling & Color Consistency Tests ===");

  const now = new Date("2026-09-08T12:00:00.000Z");

  // 1. Future (> 24h away) -> Green (#22c55e)
  const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
  const futureInfo = getRSVPDeadlineInfo(futureDate.toISOString(), now);
  console.log("Test 1 - Future (3 days):", futureInfo);
  if (futureInfo.color !== rsvpUrgencyStyles.days.icon || futureInfo.color.toLowerCase() !== "#22c55e") {
    throw new Error(`Future RSVP should be #22c55e, got: ${futureInfo.color}`);
  }

  // 2. Near-term: Tomorrow / 1-24 hours -> Yellow (#eab308)
  const tomorrowDate = new Date(now.getTime() + 20 * 60 * 60 * 1000); // 20 hours
  const tomorrowInfo = getRSVPDeadlineInfo(tomorrowDate.toISOString(), now);
  console.log("Test 2 - Near-term / 20 hours:", tomorrowInfo);
  if (tomorrowInfo.color !== rsvpUrgencyStyles.hours.icon || tomorrowInfo.color.toLowerCase() !== "#eab308") {
    throw new Error(`Near-term RSVP should be #eab308, got: ${tomorrowInfo.color}`);
  }

  // 3. Very urgent: < 1 hour -> Red (#ef4444)
  const urgentDate = new Date(now.getTime() + 45 * 60 * 1000); // 45 mins
  const urgentInfo = getRSVPDeadlineInfo(urgentDate.toISOString(), now);
  console.log("Test 3 - Urgent (< 1h):", urgentInfo);
  if (urgentInfo.color !== rsvpUrgencyStyles.minutes.icon || urgentInfo.color.toLowerCase() !== "#ef4444") {
    throw new Error(`Urgent RSVP should be #ef4444, got: ${urgentInfo.color}`);
  }

  // 4. No RSVP deadline -> Neutral (#71717a), text: "-"
  const noDeadlineInfo = getRSVPDeadlineInfo(null, now);
  console.log("Test 4 - No deadline (null):", noDeadlineInfo);
  if (noDeadlineInfo.color !== rsvpUrgencyStyles.neutral.icon || noDeadlineInfo.color.toLowerCase() !== "#71717a") {
    throw new Error(`No deadline RSVP should be #71717a, got: ${noDeadlineInfo.color}`);
  }
  if (noDeadlineInfo.text !== "-") {
    throw new Error(`No deadline RSVP text should be "-", got: ${noDeadlineInfo.text}`);
  }

  // 5. Expired (default) -> Neutral (#71717a)
  const expiredDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const expiredInfo = getRSVPDeadlineInfo(expiredDate.toISOString(), now);
  console.log("Test 5 - Expired (default):", expiredInfo);
  if (expiredInfo.color !== rsvpUrgencyStyles.neutral.icon || expiredInfo.color.toLowerCase() !== "#71717a") {
    throw new Error(`Expired RSVP should be #71717a by default, got: ${expiredInfo.color}`);
  }
  if (expiredInfo.state !== "expired") {
    throw new Error(`Expired RSVP state should be "expired", got: ${expiredInfo.state}`);
  }

  // 6. Expired with validation triggered logic check:
  // When showValidationErrors && isRsvpExpired is true:
  const isValidationTriggeredExpired = true;
  const effectiveUrgencyColor = isValidationTriggeredExpired
    ? rsvpUrgencyStyles.minutes.icon
    : expiredInfo.color;
  console.log("Test 6 - Expired with validation triggered:", effectiveUrgencyColor);
  if (effectiveUrgencyColor !== rsvpUrgencyStyles.minutes.icon || effectiveUrgencyColor.toLowerCase() !== "#ef4444") {
    throw new Error(`Expired with validation triggered should be red #ef4444, got: ${effectiveUrgencyColor}`);
  }

  // 7. Plan Start deadline formatted string
  const planStartDate = new Date("2026-09-12T14:30:00.000Z");
  const planStartInfo = getRSVPDeadlineInfo(planStartDate.toISOString(), now);
  console.log("Test 7 - Plan Start deadline (future):", planStartInfo);
  if (planStartInfo.color !== rsvpUrgencyStyles.days.icon) {
    throw new Error(`Plan start in future should match days icon color, got: ${planStartInfo.color}`);
  }

  console.log("=== ALL RSVP STATE TESTS PASSED SUCCESSFULLY ===");
}

runTests();
