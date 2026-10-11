import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import {
  OnboardingFlow,
  validateProfileName,
  validateProfileBio,
  validateProfileAbout,
  MAX_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_ABOUT_LENGTH,
} from "../screens/OnboardingFlow";

// Mock supabase client to prevent network operations
vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: {}, error: null }),
          }),
        }),
      }),
    }),
  },
}));

// Mock useProfileUpload hook
vi.mock("../../../profile/hooks/useProfileUpload", () => ({
  useProfileUpload: () => ({
    uploading: false,
    uploadError: null,
    uploadImage: vi.fn(),
  }),
}));

describe("Profile Setup Screen Layout Refinement & Validation", () => {
  describe("1. Pure Validation Rules (Name & About)", () => {
    it("rejects empty name or whitespace-only name", () => {
      expect(validateProfileName("")).toBe("Name is required");
      expect(validateProfileName("   ")).toBe("Name is required");
      expect(validateProfileName("\t\n  ")).toBe("Name is required");
    });

    it("accepts valid names within 30 characters", () => {
      expect(validateProfileName("Thilak")).toBeNull();
      expect(validateProfileName("VR Thilaka Sundar")).toBeNull();
      expect(validateProfileName("A")).toBeNull();
      expect(validateProfileName("a".repeat(MAX_NAME_LENGTH))).toBeNull();
    });

    it("rejects names exceeding 30 characters with limit communicated", () => {
      const overlimit = "a".repeat(MAX_NAME_LENGTH + 1);
      expect(validateProfileName(overlimit)).toBe("Name must be 30 characters or fewer");
    });

    it("rejects empty about or whitespace-only about with 'About is required'", () => {
      expect(validateProfileAbout("")).toBe("About is required");
      expect(validateProfileAbout("   ")).toBe("About is required");
      expect(validateProfileAbout("\n\t  ")).toBe("About is required");
      // Backwards-compatible validateProfileBio alias
      expect(validateProfileBio("")).toBe("About is required");
    });

    it("accepts valid about within 140 characters", () => {
      expect(validateProfileAbout("Always spontaneous")).toBeNull();
      expect(validateProfileAbout("Hello world!")).toBeNull();
      expect(validateProfileAbout("b".repeat(MAX_ABOUT_LENGTH))).toBeNull();
    });

    it("rejects about exceeding 140 characters with limit communicated", () => {
      const overlimitAbout = "b".repeat(MAX_ABOUT_LENGTH + 1);
      expect(validateProfileAbout(overlimitAbout)).toBe("About must be 140 characters or fewer");
      expect(validateProfileBio(overlimitAbout)).toBe("About must be 140 characters or fewer");
    });
  });

  describe("2. UI Rendering Invariants (OnboardingFlow in PROFILE_SETUP step)", () => {
    it("renders heading exactly as 'Set Up Your Profile' with capitalized 'Up'", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      expect(html).toContain("Set Up Your Profile");
      expect(html).not.toContain("Set up your profile");
      expect(html).not.toContain("This is how people will see you in plans");
    });

    it("uses default avatar image asset instead of Lucide user icon", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      // Must render img element with default avatar asset
      expect(html).toContain('id="profile_avatar_image"');
      expect(html).toContain("default_avatar");
      // Must not contain lucide User icon SVG
      expect(html).not.toContain("lucide-user");
    });

    it("uses 'Enter About' placeholder and has aria-label About", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      expect(html).toContain('placeholder="Enter About"');
      expect(html).toContain('id="profile_about_input"');
      expect(html).not.toContain('placeholder="Enter your bio"');
      expect(html).not.toContain("Bio (e.g. Always spontaneous)");
    });

    it("renders 'Create Profile' on the CTA button with Planless orange styling and rounded-full", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      expect(html).toContain("Create Profile");
      expect(html).not.toContain("CONTINUE");
      expect(html).toContain("rounded-full");
      expect(html).toContain("bg-[#FF6B2C]");
      expect(html).toContain("text-white");
    });

    it("anchors CTA at the bottom using flex layout with safe-area bottom inset", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      expect(html).toContain("justify-between");
      expect(html).toContain("env(safe-area-inset-bottom)");
    });

    it("disables the CTA button when both fields are empty", () => {
      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
        />
      );

      // Button must have disabled attribute
      expect(html).toMatch(/<button[^>]*id="complete_onboarding_btn"[^>]*disabled/);
    });

    it("disables the CTA button when name is provided but about is empty", () => {
      const existingProfile: any = {
        name: "Thilak",
        bio: "",
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
          existingProfile={existingProfile}
        />
      );

      // Button must still be disabled because about is required and empty
      expect(html).toMatch(/<button[^>]*id="complete_onboarding_btn"[^>]*disabled/);
    });

    it("disables the CTA button when about is provided but name is empty", () => {
      const existingProfile: any = {
        name: "",
        bio: "Spontaneous product builder",
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
          existingProfile={existingProfile}
        />
      );

      // Button must be disabled because name is required and empty
      expect(html).toMatch(/<button[^>]*id="complete_onboarding_btn"[^>]*disabled/);
    });

    it("enables the CTA button when both name and about are valid", () => {
      const existingProfile: any = {
        name: "Thilak",
        bio: "Spontaneous product builder",
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          onComplete={vi.fn()}
          existingProfile={existingProfile}
        />
      );

      // Button must NOT have disabled HTML attribute
      const buttonMatch = html.match(/<button[^>]*id="complete_onboarding_btn"[^>]*>/);
      expect(buttonMatch).not.toBeNull();
      expect(buttonMatch![0]).not.toMatch(/\sdisabled(=|[\s>])/);
      expect(buttonMatch![0]).toContain("bg-[#FF6B2C]");
    });
  });

  describe("3. Static Code Invariant Checks", () => {
    it("verifies source code adheres to all profile setup design requirements", () => {
      const filePath = path.resolve(__dirname, "../screens/OnboardingFlow.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      // 1. Heading capitalization
      expect(content).toContain("Set Up Your Profile");

      // 2. About placeholder & error updated
      expect(content).toContain('placeholder="Enter About"');
      expect(content).toContain("About is required");
      expect(content).toContain("About must be ${MAX_ABOUT_LENGTH} characters or fewer");

      // 3. Button label & styles
      expect(content).toContain("Create Profile");
      expect(content).toContain("rounded-full");
      expect(content).toContain("bg-[#FF6B2C]");
      expect(content).toContain("text-white");

      // 4. Constants defined
      expect(content).toContain("MAX_NAME_LENGTH = 30");
      expect(content).toContain("MAX_ABOUT_LENGTH = 140");

      // 5. Default avatar asset usage
      expect(content).toContain("defaultAvatar");
      expect(content).not.toContain("<User ");

      // 6. DB contract mapping intact
      expect(content).toContain("full_name: profileName.trim()");
      expect(content).toContain("bio: bio.trim()");
    });
  });
});

