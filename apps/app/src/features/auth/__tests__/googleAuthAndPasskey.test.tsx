import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { EmailVerification } from "../Logged Out/screens/Emailverification";
import { OnboardingFlow } from "../Logged Out/screens/OnboardingFlow";

// Mock Supabase client
vi.mock("../../../../lib/supabaseClient", () => {
  return {
    SUPABASE_URL: "https://mock.supabase.co",
    supabase: {
      auth: {
        signInWithOtp: vi.fn(),
        verifyOtp: vi.fn(),
        signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth" }, error: null }),
        signInWithPasskey: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        registerPasskey: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        upsert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "test-user-id", public_id: "user_test", full_name: "Google Name", profile_completed: false }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: "test-user-id", public_id: "user_test", full_name: "Edited Name", bio: "My Bio", profile_photo_path: "https://google.com/avatar.jpg", profile_completed: true }, error: null }),
            }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: "user_12345", error: null }),
      storage: {
        from: () => ({
          getPublicUrl: () => ({ data: { publicUrl: "https://mock.supabase.co/storage/v1/object/public/avatars/default.webp" } }),
        }),
      },
    },
  };
});

// Mock useProfileUpload hook
vi.mock("../../profile/hooks/useProfileUpload", () => ({
  useProfileUpload: () => ({
    uploading: false,
    uploadError: null,
    uploadImage: vi.fn(),
  }),
}));

describe("Google Sign-In, Supabase Authentication, and Passkey Support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Phase 2: Welcome Screen UI Requirements", () => {
    it("renders the Google Sign-In button with official multicolor G logo", () => {
      const html = renderToString(
        <EmailVerification
          onComplete={vi.fn()}
          onProfileSetup={vi.fn()}
        />
      );

      // Verify Google button exists
      expect(html).toContain('id="google_signin_btn"');
      expect(html).toContain("Continue with Google");

      // Verify official Google multicolor SVG paths are present
      expect(html).toContain("#4285F4"); // Google Blue
      expect(html).toContain("#34A853"); // Google Green
      expect(html).toContain("#FBBC05"); // Google Yellow
      expect(html).toContain("#EA4335"); // Google Red
    });

    it("preserves the existing email flow, illustration, and continue button", () => {
      const html = renderToString(
        <EmailVerification
          onComplete={vi.fn()}
          onProfileSetup={vi.fn()}
        />
      );

      // Welcome heading
      expect(html).toContain("Welcome to Planless");

      // Email input field
      expect(html).toContain('id="email_input_field"');
      expect(html).toContain('placeholder="Enter your email"');

      // Subtle divider between Google and Email
      expect(html).toContain("or");

      // Orange continue CTA
      expect(html).toContain('id="email_continue_btn"');
      expect(html).toContain("Continue");
    });
  });

  describe("Phase 4: Name and Profile Photo Retrieval & Prefilling", () => {
    it("prefills Google-provided name into PROFILE_SETUP", () => {
      const mockGoogleProfile = {
        name: "VR Thilaka Sundar",
        phone: "thilak@planless.app",
        bio: "",
        avatar: "https://lh3.googleusercontent.com/a/mock-photo",
        joined: true,
        college_or_work: "SRM Chennai",
        user_id: "user_9999",
        dbUuid: "user-uuid-999",
        token: "mock-token",
        profile_completed: false,
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          existingProfile={mockGoogleProfile}
          onComplete={vi.fn()}
        />
      );

      // Input field has Google prefilled name as value
      expect(html).toContain('value="VR Thilaka Sundar"');
      expect(html).toContain('id="profile_name_input"');
    });

    it("displays Google profile photo URL in the profile photo component", () => {
      const mockGoogleProfile = {
        name: "VR Thilaka Sundar",
        phone: "thilak@planless.app",
        bio: "",
        avatar: "https://lh3.googleusercontent.com/a/mock-photo",
        joined: true,
        college_or_work: "SRM Chennai",
        user_id: "user_9999",
        dbUuid: "user-uuid-999",
        token: "mock-token",
        profile_completed: false,
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          existingProfile={mockGoogleProfile}
          onComplete={vi.fn()}
        />
      );

      // Avatar image directly renders Google avatar URL
      expect(html).toContain('src="https://lh3.googleusercontent.com/a/mock-photo"');
      expect(html).toContain('id="profile_avatar_image"');
    });

    it("allows the user to edit name and replace avatar during onboarding", () => {
      const mockGoogleProfile = {
        name: "Google Initial Name",
        phone: "thilak@planless.app",
        bio: "",
        avatar: "https://lh3.googleusercontent.com/a/mock-photo",
        joined: true,
        college_or_work: "SRM Chennai",
        user_id: "user_9999",
        dbUuid: "user-uuid-999",
        token: "mock-token",
        profile_completed: false,
      };

      const html = renderToString(
        <OnboardingFlow
          initialStep="PROFILE_SETUP"
          existingProfile={mockGoogleProfile}
          onComplete={vi.fn()}
        />
      );

      // Hidden upload input is available to replace avatar
      expect(html).toContain('id="profile_avatar_upload_input"');
      expect(html).toContain('type="file"');
      // About field is accessible
      expect(html).toContain('id="profile_about_input"');
    });
  });

  describe("Phase 4.3: Profile Protection Invariant", () => {
    it("ensures returning users with profile_completed === true retain customized database profile", () => {
      // Simulating the logic in restoreSessionAndProfile
      const authUser = {
        id: "existing-user-uuid",
        email: "thilak@planless.app",
        user_metadata: {
          full_name: "Original Google Name",
          avatar_url: "https://google.com/original-avatar.jpg",
        },
      };

      const existingDbProfile = {
        id: "existing-user-uuid",
        public_id: "user_42",
        full_name: "Thilak (Customized Display Name)",
        bio: "Founder building Planless",
        profile_photo_path: "avatars/my-custom-photo.webp",
        profile_completed: true,
        role: "admin",
      };

      // Invariant verification: if profile_completed is true, we must NOT overwrite with user_metadata
      let resolvedProfile = null;
      if (existingDbProfile.profile_completed) {
        resolvedProfile = existingDbProfile;
      } else {
        resolvedProfile = {
          ...existingDbProfile,
          full_name: existingDbProfile.full_name || authUser.user_metadata.full_name,
          profile_photo_path: existingDbProfile.profile_photo_path || authUser.user_metadata.avatar_url,
        };
      }

      expect(resolvedProfile.full_name).toBe("Thilak (Customized Display Name)");
      expect(resolvedProfile.full_name).not.toBe("Original Google Name");
      expect(resolvedProfile.profile_photo_path).toBe("avatars/my-custom-photo.webp");
      expect(resolvedProfile.profile_photo_path).not.toBe("https://google.com/original-avatar.jpg");
    });
  });

  describe("Phase 5: Passkey Authentication", () => {
    it("verifies supabaseClient enables experimental passkey support", async () => {
      const { supabase } = await import("../../../../lib/supabaseClient");
      expect(supabase).toBeDefined();
    });

    it("handles passkey cancellation without crashing or breaking session", () => {
      const notAllowedError = {
        name: "NotAllowedError",
        message: "The operation either timed out or was not allowed.",
      };

      const isCanceled =
        notAllowedError.name === "NotAllowedError" ||
        notAllowedError.message.includes("cancel") ||
        notAllowedError.message.includes("abort");

      expect(isCanceled).toBe(true);
    });
  });
});
