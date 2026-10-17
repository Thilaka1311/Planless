import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Planless } from "../screens/Planless";

// Mock app router
vi.mock("../../../navigation/appRouter", () => ({
  navigateToRoute: vi.fn(),
}));

describe("Public Landing Page (Planless.tsx) - Google OAuth Branding Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the official app name, logo, and core description without authentication", () => {
    const html = renderToStaticMarkup(
      <Planless onGetStarted={() => {}} onLogin={() => {}} />
    );

    // Brand and logo verification
    expect(html).toContain("Planless");
    expect(html).toContain('alt="Planless Logo"');

    // Tagline
    expect(html).toContain("Plan less. Do more.");

    // Core description (required by Google verification)
    expect(html).toContain(
      "Planless makes it easier to turn conversations into real plans. Create plans, invite friends, coordinate attendance, and keep track of shared expenses in one place."
    );
  });

  it("clearly explains the main functionality grounded in actual app features", () => {
    const html = renderToStaticMarkup(
      <Planless onGetStarted={() => {}} onLogin={() => {}} />
    );

    // Feature 1: Discover & Create
    expect(html).toContain("Discover &amp; Create Plans");
    expect(html).toContain("Dining");
    expect(html).toContain("Sports");
    expect(html).toContain("Movies");

    // Feature 2: Invite Friends & RSVPs
    expect(html).toContain("Invite Friends &amp; Track RSVPs");
    expect(html).toContain("planless.life/join/");

    // Feature 3: Plan Chat & Photos
    expect(html).toContain("In-Plan Chat &amp; Shared Photos");

    // Feature 4: Keep Track of Shared Expenses
    expect(html).toContain("Keep Track of Shared Expenses");
  });

  it("includes prominent Get Started and Sign In buttons", () => {
    const html = renderToStaticMarkup(
      <Planless onGetStarted={() => {}} onLogin={() => {}} />
    );

    expect(html).toContain('id="btn_header_get_started"');
    expect(html).toContain('id="btn_hero_get_started"');
    expect(html).toContain('id="btn_bottom_get_started"');

    expect(html).toContain('id="btn_header_sign_in"');
    expect(html).toContain('id="btn_hero_sign_in"');
    expect(html).toContain('id="btn_bottom_sign_in"');
  });

  it("includes public links to Privacy Policy, Terms of Service, and Support contact", () => {
    const html = renderToStaticMarkup(
      <Planless onGetStarted={() => {}} onLogin={() => {}} />
    );

    // Privacy Policy link
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Privacy Policy");

    // Terms of Service link
    expect(html).toContain('href="/terms"');
    expect(html).toContain("Terms of Service");

    // Official support email
    expect(html).toContain('href="mailto:support@planless.life"');
    expect(html).toContain("support@planless.life");
  });

  it("does not expose any private user data on the public landing page", () => {
    const html = renderToStaticMarkup(
      <Planless onGetStarted={() => {}} onLogin={() => {}} />
    );

    expect(html).not.toContain("access_token");
    expect(html).not.toContain("refresh_token");
    expect(html).not.toContain("supabase_key");
    expect(html).not.toContain("password");
  });
});
