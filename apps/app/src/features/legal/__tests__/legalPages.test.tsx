import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  isValidRoute,
  parseCurrentRoute,
  getRoutePath,
  getCanonicalPathForAlias,
} from "../../navigation/appRouter";
import { PrivacyPolicy } from "../screens/PrivacyPolicy";
import { TermsOfService } from "../screens/TermsOfService";
import { EmailVerification } from "../../auth/Logged Out/screens/Emailverification";
import App from "../../../App";

// Mock Supabase client
vi.mock("../../../../../lib/supabaseClient", () => ({
  SUPABASE_URL: "https://mock.supabase.co",
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPasskey: vi.fn(),
      registerPasskey: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

describe("Legal Routes & Pages Specification", () => {
  let originalWindow: any;
  let mockWindow: any;

  beforeEach(() => {
    mockWindow = {
      location: new URL("http://localhost:3000/home"),
      history: {
        length: 1,
        state: null,
        pushState: vi.fn(),
        replaceState: vi.fn(),
        back: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    originalWindow = (globalThis as any).window;
    (globalThis as any).window = mockWindow;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  describe("Router Integration", () => {
    it("recognizes /privacy and /terms as valid application routes (case-insensitive with trailing slashes)", () => {
      expect(isValidRoute("/privacy")).toBe(true);
      expect(isValidRoute("/terms")).toBe(true);
      expect(isValidRoute("/privacy/")).toBe(true);
      expect(isValidRoute("/terms/")).toBe(true);
      expect(isValidRoute("/Privacy")).toBe(true);
      expect(isValidRoute("/TERMS")).toBe(true);
      expect(isValidRoute("/Privacy/")).toBe(true);
      expect(isValidRoute("/Terms/")).toBe(true);
    });

    it("parses /privacy and /terms routes into AppRoute objects with subScreen", () => {
      mockWindow.location = new URL("http://localhost:3000/privacy");
      expect(parseCurrentRoute()).toEqual({
        tab: "home",
        subScreen: "privacy",
      });

      mockWindow.location = new URL("http://localhost:3000/terms");
      expect(parseCurrentRoute()).toEqual({
        tab: "home",
        subScreen: "terms",
      });
    });

    it("generates canonical /privacy and /terms paths from route objects", () => {
      expect(getRoutePath({ tab: "home", subScreen: "privacy" })).toBe("/privacy");
      expect(getRoutePath({ tab: "profile", subScreen: "privacy" })).toBe("/privacy");
      expect(getRoutePath({ tab: "home", subScreen: "terms" })).toBe("/terms");
      expect(getRoutePath({ tab: "profile", subScreen: "terms" })).toBe("/terms");
    });

    it("resolves /profile/privacy and /profile/terms to canonical top-level URLs", () => {
      expect(getCanonicalPathForAlias("/profile/privacy")).toBe("/privacy");
      expect(getCanonicalPathForAlias("/profile/terms")).toBe("/terms");
    });
  });

  describe("Public Accessibility Without Authentication", () => {
    it("renders Privacy Policy directly in App when on /privacy without requiring session or sign-in", () => {
      mockWindow.location = new URL("http://localhost:3000/privacy");
      const html = renderToString(<App />);

      expect(html).toContain("Privacy Policy");
      expect(html).toContain("Planless Privacy Policy");
      expect(html).toContain("support@planless.life");
      // Does not render login screen or splash screen
      expect(html).not.toContain("Continue with Google");
      expect(html).not.toContain("Enter your email");
    });

    it("renders Terms of Service directly in App when on /terms without requiring session or sign-in", () => {
      mockWindow.location = new URL("http://localhost:3000/terms");
      const html = renderToString(<App />);

      expect(html).toContain("Terms of Service");
      expect(html).toContain("Planless Terms of Service");
      expect(html).toContain("support@planless.life");
      // Does not render login screen or splash screen
      expect(html).not.toContain("Continue with Google");
      expect(html).not.toContain("Enter your email");
    });
  });

  describe("Privacy Policy Page Content & Integrity", () => {
    it("renders Privacy Policy with expected sections, contact email, and Terms link", () => {
      const html = renderToString(<PrivacyPolicy onBack={() => {}} />);

      expect(html).toContain("Privacy Policy");
      expect(html).toContain("Last Updated: October 2026");
      expect(html).toContain("planless.life");
      expect(html).toContain("support@planless.life");
      expect(html).toContain("Information We Collect");
      expect(html).toContain("Google Sign-In");
      expect(html).toContain("Passkey Authentication");
      expect(html).toContain("Web Push Subscriptions");
      expect(html).toContain("No Payment or Banking Information");
      expect(html).toContain("Account &amp; Data Deletion");
      expect(html).toContain("href=\"/terms\"");
    });
  });

  describe("TermsOfService Page Content & Integrity", () => {
    it("renders Terms of Service with expected sections, contact email, and Privacy link", () => {
      const html = renderToString(<TermsOfService onBack={() => {}} />);

      expect(html).toContain("Terms of Service");
      expect(html).toContain("Last Updated: October 2026");
      expect(html).toContain("planless.life");
      expect(html).toContain("support@planless.life");
      expect(html).toContain("Acceptance of the Terms");
      expect(html).toContain("Description of Planless");
      expect(html).toContain("User-Generated Content &amp; Media");
      expect(html).toContain("No Payment Processing");
      expect(html).toContain("Disclaimers and Limitations of Liability");
      expect(html).toContain("href=\"/privacy\"");
    });
  });

  describe("Authentication Screen Legal Notice", () => {
    it("renders legal notice with clickable Terms and Privacy links on EmailVerification", () => {
      const html = renderToString(
        <EmailVerification
          onComplete={() => {}}
          onProfileSetup={() => {}}
          initialSubStep="EMAIL"
        />
      );

      expect(html).toContain("By continuing, you agree to our");
      expect(html).toContain("Terms of Service");
      expect(html).toContain("and acknowledge our");
      expect(html).toContain("Privacy Policy");
      expect(html).toContain("auth_terms_link");
      expect(html).toContain("auth_privacy_link");
    });
  });
});
