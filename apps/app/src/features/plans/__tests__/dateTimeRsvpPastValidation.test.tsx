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
    // Creation mode (isLiveEditing = false): past date is always invalid
    const creationErr = getPlanDateTimeValidationError(pastDate, pastTime, false);
    expect(creationErr).toBe("Plan date cannot be in the past.");

    // Existing plan (isLiveEditing = true): unchanged existing overdue date is VALID
    const existingUnchangedErr = getPlanDateTimeValidationError(
      pastDate,
      pastTime,
      true,
      undefined,
      pastDate,
      pastTime
    );
    expect(existingUnchangedErr).toBeNull();

    // Existing plan (isLiveEditing = true): actively changed to another past date is INVALID
    const existingEditedPastErr = getPlanDateTimeValidationError(
      "2019-12-31",
      pastTime,
      true,
      undefined,
      pastDate,
      pastTime
    );
    expect(existingEditedPastErr).toBe("Plan date cannot be in the past.");

    // Existing plan (isLiveEditing = true): actively changed to a future date is VALID
    const existingEditedFutureErr = getPlanDateTimeValidationError(
      "2099-01-01",
      "12:00",
      true,
      undefined,
      pastDate,
      pastTime
    );
    expect(existingEditedFutureErr).toBeNull();

    const rsvpErr = getRSVPValidationError(pastDate, pastTime, "< 1 Hour", false);
    expect(rsvpErr).toBe("RSVP deadline cannot be in the past.");

    const comboErr = getDateTimeValidationError(pastDate, pastTime, "< 1 Hour", false);
    expect(comboErr).toBeTruthy();
  });

  it("shows error when user actively changes date to a new past date on existing plan", () => {
    const html = renderToString(
      <EditDateTimeBottomSheet
        isOpen={true}
        tempDate="2019-12-31"
        tempTime={pastTime}
        existingDate={pastDate}
        existingTime={pastTime}
        tempRSVPOption={null}
        isLiveEditing={true}
        onTempDateChange={vi.fn()}
        onTempTimeChange={vi.fn()}
        onTempRSVPOptionChange={vi.fn()}
        onClose={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Active change to an invalid past date must display the error
    expect(html).toContain("Plan date cannot be in the past.");
  });

  it("does not show error when user actively changes date to a valid future date on existing plan", () => {
    const html = renderToString(
      <EditDateTimeBottomSheet
        isOpen={true}
        tempDate="2099-01-01"
        tempTime="12:00"
        existingDate={pastDate}
        existingTime={pastTime}
        tempRSVPOption={null}
        isLiveEditing={true}
        onTempDateChange={vi.fn()}
        onTempTimeChange={vi.fn()}
        onTempRSVPOptionChange={vi.fn()}
        onClose={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).not.toContain("Plan date cannot be in the past.");
    expect(html).not.toContain("Plan time cannot be in the past.");
  });
});
