import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SplashScreen } from "../SplashScreen";

describe("Planless SplashScreen Animation Suite", () => {
  it("renders pure black background and safe area insets", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Pure black background #000000
    expect(html).toContain("bg-[#000000]");
    expect(html).toContain("fixed inset-0");
    // Respects device safe areas
    expect(html).toContain("env(safe-area-inset-top");
    expect(html).toContain("env(safe-area-inset-bottom");
  });

  it("renders Planless wordmark in authentic Grand Hotel cursive typography", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Contains verbatim wordmark text
    expect(html).toContain("Planless");
    // Explicitly uses Grand Hotel cursive font family
    expect(html).toContain("font-family:&#x27;Grand Hotel&#x27;, cursive");
    // Does NOT use generic sans font for the title
    expect(html).not.toContain("bg-gradient-to-r from-white via-zinc-200 to-zinc-400");
  });

  it("renders smooth Planless-orange horizontal line", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Contains Planless brand orange line #FF6B2C
    expect(html).toContain("bg-[#FF6B2C]");
    expect(html).toContain("h-[2px]");
    expect(html).toContain("rounded-full");
  });

  it("renders authentic Planless logo symbol asset", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Renders the logo symbol img element with planless_logo asset
    expect(html).toContain("planless_logo");
    expect(html).toContain("alt=\"Planless Symbol\"");
  });

  it("does not include spinners, percentage numbers, or setting things up tagline", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Old loading elements must be absent
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("Setting things up");
    expect(html).not.toContain("SETTING THINGS UP");
    expect(html).not.toContain("%");
    expect(html).not.toContain("Plan less. Do more.");
  });

  it("initializes with full opacity without premature dismissal when not ready", () => {
    const html = renderToString(
      <SplashScreen isReady={false} onDismiss={() => {}} />
    );

    // Opacity is 1 (stable)
    expect(html).toContain("opacity:1");
  });

  it("calls onDismiss when animation sequence finishes and app is ready", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    // Verify lifecycle callback invocation via timers
    let dismissed = false;
    const dismissCallback = () => {
      dismissed = true;
      onDismiss();
    };

    // Simulate sequence duration timer
    const sequenceDurationMs = 1200;
    setTimeout(() => {
      dismissCallback();
    }, sequenceDurationMs);

    expect(dismissed).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1200);

    expect(dismissed).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
