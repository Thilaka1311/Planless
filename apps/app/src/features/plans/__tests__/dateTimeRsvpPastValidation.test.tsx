import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  EditDateTimeBottomSheet,
  getPlanDateTimeValidationError,
  getRSVPValidationError,
  getDateTimeValidationError,
} from "../components/BottomSheets";

describe("Plan time after completion: Date & Time and RSVP past validation", () => {
  const pastDate = "2020-01-01";
  const pastTime = "10:00";

  it("does not show validation error when opening existing plan with past date & time", () => {
    const html = renderToString(
      <EditDateTimeBottomSheet
        isOpen={true}
        tempDate={pastDate}
        tempTime={pastTime}
        tempRSVPOption={null}
        onTempDateChange={vi.fn()}
        onTempTimeChange={vi.fn()}
        onTempRSVPOptionChange={vi.fn()}
        onClose={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Initial render of existing past plan must NOT show validation error
    expect(html).not.toContain("Plan time cannot be in the past.");
    expect(html).not.toContain("Plan date cannot be in the past.");
    expect(html).not.toContain("RSVP deadline cannot be in the past.");
    expect(html).toContain("Date and Time");
    expect(html).toContain("Cancel");
  });

  it("does not show validation error when opening RSVP on existing plan with past RSVP deadline", () => {
    const html = renderToString(
      <EditDateTimeBottomSheet
        isOpen={true}
        tempDate={pastDate}
        tempTime={pastTime}
        tempRSVPOption="< 1 Hour"
        initialSection="rsvp"
        onTempDateChange={vi.fn()}
        onTempTimeChange={vi.fn()}
        onTempRSVPOptionChange={vi.fn()}
        onClose={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Initial render of existing past plan RSVP must NOT show validation error
    expect(html).not.toContain("RSVP deadline cannot be in the past.");
    expect(html).not.toContain("Plan time cannot be in the past.");
    expect(html).toContain("Respond by:");
  });

  it("underlying validator functions still correctly validate invalid past dates when newly edited", () => {
    const dateTimeErr = getPlanDateTimeValidationError(pastDate, pastTime, false);
    expect(dateTimeErr).toBeTruthy();

    const rsvpErr = getRSVPValidationError(pastDate, pastTime, "< 1 Hour", false);
    expect(rsvpErr).toBe("RSVP deadline cannot be in the past.");

    const comboErr = getDateTimeValidationError(pastDate, pastTime, "< 1 Hour", false);
    expect(comboErr).toBeTruthy();
  });
});
