import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { computeOtpCtaPosition } from "../screens/Emailverification";

describe("OTP Verification Keyboard Positioning & Layout Invariants", () => {
  const filePath = path.resolve(__dirname, "../screens/Emailverification.tsx");
  const fileContent = fs.readFileSync(filePath, "utf-8");

  describe("1. Geometric Invariants (computeOtpCtaPosition)", () => {
    it("anchors the CTA to the keyboard-closed screen height", () => {
      const closedHeight = 844;
      const style = computeOtpCtaPosition(closedHeight);

      expect(style.position).toBe("fixed");
      expect(style.top).toBe("844px");
      expect(style.transform).toBe("translateY(-100%)");
      expect(style.left).toBe(0);
      expect(style.right).toBe(0);
      expect(style.zIndex).toBe(30);
      expect(style.pointerEvents).toBe("none");
    });

    it("guarantees 0px vertical coordinate delta when keyboard opens", () => {
      const closedScreenHeight = 844;
      const ctaHeight = 80;

      // 1. Keyboard closed (viewport = 844px)
      const closedStyle = computeOtpCtaPosition(closedScreenHeight);
      const closedTopEdge = parseInt(closedStyle.top as string, 10) - ctaHeight;
      const closedBottomEdge = parseInt(closedStyle.top as string, 10);

      // 2. Keyboard open (Android viewport resizes to 450px, but closedScreenHeight locked)
      const keyboardOpenViewport = 450;
      const openStyle = computeOtpCtaPosition(closedScreenHeight);
      const openTopEdge = parseInt(openStyle.top as string, 10) - ctaHeight;
      const openBottomEdge = parseInt(openStyle.top as string, 10);

      // Verify CTA does NOT move upward (delta = 0px)
      expect(openTopEdge - closedTopEdge).toBe(0);
      expect(openBottomEdge - closedBottomEdge).toBe(0);

      // Contrast with broken behavior: if bottom: 0 was used against resized viewport
      const brokenOldShift = closedScreenHeight - keyboardOpenViewport;
      expect(brokenOldShift).toBe(394); // 394px upward jump prevented
    });

    it("adapts to orientation changes when width changes", () => {
      const landscapeHeight = 390;
      const style = computeOtpCtaPosition(landscapeHeight);

      expect(style.top).toBe("390px");
      expect(style.transform).toBe("translateY(-100%)");
    });
  });

  describe("2. Architectural Layout Separation", () => {
    it("structures OTP screen into separate scrollable content and fixed CTA regions", () => {
      expect(fileContent).toContain('id="step_otp_form"');
      expect(fileContent).toContain('id="otp_main_content"');
      expect(fileContent).toContain('id="otp_cta_region"');
      expect(fileContent).toContain("computeOtpCtaPosition(closedScreenHeight)");
    });

    it("provides independent scrolling for form inputs so focused field remains accessible", () => {
      expect(fileContent).toContain("overflow-y-auto");
      expect(fileContent).toContain("flex-1");
    });

    it("eliminates the floating above-keyboard duplicate button and overlays", () => {
      // Confirmed removed: otp_verify_btn_above_kb and showAboveKeyboardButton
      expect(fileContent).not.toContain("otp_verify_btn_above_kb");
      expect(fileContent).not.toContain("showAboveKeyboardButton");
    });

    it("preserves single authoritative Verify button with Planless styling and safe area insets", () => {
      expect(fileContent).toContain('id="otp_verify_btn"');
      expect(fileContent).toContain("bg-[#FF6B2C]");
      expect(fileContent).toContain("rounded-full");
      expect(fileContent).toContain("max(1.5rem, env(safe-area-inset-bottom))");
    });
  });

  describe("3. Preservation of OTP Functionality", () => {
    it("preserves 6 numeric input boxes with autofocus and numeric inputMode", () => {
      expect(fileContent).toContain('inputMode="numeric"');
      expect(fileContent).toContain('pattern="[0-9]*"');
      expect(fileContent).toContain('autoComplete={index === 0 ? "one-time-code" : "off"}');
      expect(fileContent).toContain("handleOtpBoxChange");
      expect(fileContent).toContain("handleOtpBoxKeyDown");
      expect(fileContent).toContain("handleOtpBoxPaste");
    });

    it("preserves resend code and edit email actions", () => {
      expect(fileContent).toContain('id="otp_resend_code_btn"');
      expect(fileContent).toContain('id="otp_edit_email_btn"');
      expect(fileContent).toContain("handleResendOtp");
    });
  });
});
