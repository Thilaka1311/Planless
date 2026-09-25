# Feature Documentation: Auth & Onboarding

## 1. Overview

The **Auth & Onboarding** feature is the user acquisition, education, and authentication gateway for Planless. It introduces new users to the app's value proposition through a 4-slide animated onboarding carousel, handles passwordless authentication via Email OTP, and guides new signups through initial profile creation.

* **Core Function**: Delivers an integrated 6-stage funnel:
  1. Entry welcome screen (`Planless.tsx`).
  2. Onboarding Slide 1 — Problem: chaotic chat animation (`Problem.tsx`).
  3. Onboarding Slide 2 — Solution: RSVP plan animation (`Solution.tsx`).
  4. Onboarding Slide 3 — Create Plan: animated plan creation demo (`CreatePlanOnboarding.tsx`).
  5. Onboarding Slide 4 — Join Plan: animated hold-to-join demo (`JoinPlanOnboarding.tsx`).
  6. Passwordless 6-digit Email OTP authentication (`Emailverification.tsx`).
  7. First-time profile setup (name, bio, profile photo upload) — applies to new accounts only.
* **Product Role**: Gatekeeper component rendered by `App.tsx` when no active Supabase auth session exists (`!session`). Upon successful verification, passes the authenticated `UserProfile` to initialize `ProfileContext` and render `MainApp.tsx`.
* **Scope & Boundaries**: Manages identity verification, session tokens, and initial `public.users` row provisioning. Does not manage in-app profile editing (handled by `Profile` feature) or friend connections (handled by `Friendships` feature).

---

## 2. User Flow

### 1. Welcome & Entry (`Planless.tsx`)
* User opens Planless in a logged-out state.
* The welcome screen mounts with brand title in *Grand Hotel* script font, Planless logo symbol, and tagline *"Plan less. Do more."*.
* The user has two options:
  * **"Get Started"**: Launches the value-proposition onboarding carousel (`step = 'LANDING'`).
  * **"Already have an account? Log in"**: Bypasses the onboarding carousel and navigates directly to email entry (`step = 'EMAIL_INPUT'`).

### 2. Onboarding Carousel — 4 Slides (step = `LANDING`, `onboardingIndex` 0–3)
* User swipes horizontally or taps the continue/Next button to advance through 4 sequential slides:
  * **Slide 0 — Problem ("Complicated")**: Plays micro-animations illustrating the friction of planning via standard messaging apps (`ChaoticChatAnimation.tsx` with endless group messages and dropouts). `onboardingIndex = 0`.
  * **Slide 1 — Solution ("Planless")**: Demonstrates the structured Planless alternative (`PlanAnimation.tsx` and `ManageParticipantAnimation.tsx`). `onboardingIndex = 1`.
  * **Slide 2 — Create Plan**: Shows how to create a plan in a few taps (`CreatePlanAnimation`). Headline: *"Create a plan in just a few taps"*. CTA button ("Next") appears after animation completes. `onboardingIndex = 2`.
  * **Slide 3 — Join Plan**: Shows friends joining a plan with one tap (`JoinPlanAnimation`). Headline: *"Friends see the plan and join with one tap"*. CTA button ("Next") appears after animation completes; tapping it advances to email entry. `onboardingIndex = 3`.
* The carousel supports keyboard arrow navigation and horizontal touch-swipe. Swipe left advances; swipe right goes back. Backward swipe from Slide 0 returns to the `ENTRY` step.
* Animation state is persisted and reset between sessions: each animation screen calls its own `isXAnimationCompleted()` check on mount to decide whether the CTA button is immediately visible (skip re-playing) or must wait for animation completion.

### 3. Submitting Email for OTP (`Emailverification.tsx` - Step 1)
* User enters their email address into the input field.
* Submits via Enter or the **Send Code** button.
* `Emailverification.tsx` executes:
  ```typescript
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });
  ```
* On success, transitions to the 6-digit OTP entry screen and sets a 60-second resend cooldown timer.
* Persists session timestamp to `localStorage` (`planless_otp_auth_session`) to preserve verification state across accidental page reloads.

### 4. Verifying 6-Digit OTP (`Emailverification.tsx` - Step 2)
* User receives 6-digit numeric verification code in their email inbox.
* User types or pastes the 6 digits into the auto-advancing input boxes.
* When all 6 digits are entered, the component dispatches:
  ```typescript
  await supabase.auth.verifyOtp({
    email,
    token: otpCode,
    type: 'email'
  });
  ```
* Supabase validates the token and establishes an active JWT session.
* The component queries `public.users` using the authenticated `auth.user.id`:
  * If a user record with an existing `full_name` is found: user is considered an existing account; triggers `onComplete(profile)` immediately.
  * If no user record or empty name: transitions to **Profile Setup** (`step = 'PROFILE_SETUP'`).

### 5. First-Time Profile Creation (`OnboardingFlow.tsx`)
* New user inputs:
  * Display Name (required).
  * Bio (optional).
  * Profile Photo: User can select a local photo; uploaded via `useProfileUpload` to Supabase Storage bucket `avatars`.
* User taps **Done / Get Started**:
  * Upserts the user record into `public.users`.
  * If a pending invite link exists in `localStorage` (`PENDING_INVITE_TOKEN_KEY`), it is processed to automatically add the user to the shared plan.
  * Calls `onComplete(profile)`, granting access to the authenticated application.

---

## 3. UI Documentation

### Entry Screen (`Planless.tsx`)
* **Layout & Geometry**: Full-screen dark viewport (`w-full h-full text-white bg-[#000000] flex flex-col justify-between items-center px-6 pt-safe pb-safe font-sans select-none`).
* **Branding Hierarchy**:
  * Title: "Planless" rendered in elegant cursive typography (`font-family: 'Grand Hotel', cursive; font-size: 46px; color: #FFFFFF`).
  * Icon: 128x128px Planless P-symbol graphic (`w-32 h-32 object-contain`) with smooth fade-in scale animation (`initial={{ scale: 0.92, opacity: 0 }}`).
  * Tagline: Muted subtitle (`text-[15px] text-zinc-400 font-sans tracking-tight`) reading "Plan less. Do more.".
* **Action Dock**:
  * Primary Button: Pill-shaped CTA (`w-full py-3 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:bg-[#E55A1F] text-white font-semibold text-sm shadow-md shadow-[#FF6B2C]/20`) with text "Get Started".
  * Secondary Text Button: Centered text link (`text-xs text-zinc-400 hover:text-white py-1 transition-colors`) reading "Already have an account? Log in".

### Onboarding Carousel — 4 Slides
* **Header**: Top utility bar (`OnboardingHeader.tsx`) with back arrow. Persistent across all slides when `step !== 'ENTRY'`.
* **Slide 0 — Problem**: `<ChaoticChatAnimation />` featuring staggered incoming chat bubbles, confused avatars, and red rejection notifications. Full-width animation area between headline and CTA.
* **Slide 1 — Solution**: `<PlanAnimation />` and `<ManageParticipantAnimation />` showing structured plan card and attendee slot fills.
* **Slide 2 — Create Plan** (`CreatePlanOnboarding.tsx`):
  * Headline: *"Create a plan / in just a few taps"* (two-line, bold white, responsive size `text-[18px]` to `text-[24px]`).
  * Animation Container: Canonical vertically centered container (`flex-1 w-full min-h-0 flex items-center justify-center px-4 py-2 sm:py-3 overflow-hidden`) hosting `<CreatePlanAnimation />` in the shared canonical responsive card frame (`w-full max-w-[340px] xs:max-w-[365px] sm:max-w-[395px] md:max-w-[425px] h-full max-h-[460px] xs:max-h-[500px] sm:max-h-[540px] md:max-h-[570px] mx-auto rounded-[28px] sm:rounded-[32px] bg-[#0A0A0C] border border-white/[0.12] shadow-2xl`).
  * CTA: Full-width orange pill button ("Next", id: `btn_onboarding_cta_create_plan`) that fades in after animation completes (`initial={{ opacity: 0, y: 10 }}`, `duration: 0.45`).
* **Slide 3 — Join Plan** (`JoinPlanOnboarding.tsx`):
  * Headline: *"Friends see the plan / and join with one tap"* (same two-line responsive layout).
  * Animation Container: Canonical vertically centered container (`flex-1 w-full min-h-0 flex items-center justify-center px-4 py-2 sm:py-3 overflow-hidden`) hosting `<JoinPlanAnimation />` in the exact same canonical card frame.
  * CTA: Full-width orange pill button ("Next", id: `btn_onboarding_cta_join_plan`) that fades in after animation completes.
* **Typography & Canonical Frame**: Standardized responsive headline across all slides paired with the identical canonical viewport card frame across Problem, Solution, Create Plan, and Join Plan.

### Email & OTP Screen (`Emailverification.tsx`)
* **Container**: Clean, minimalist dark authentication box (`max-w-md mx-auto flex flex-col justify-between h-full px-6 py-8`).
* **Header Section**: Small Planless logo mark at top, followed by bold headline:
  * Email step: "What's your email?" with subtitle "We'll send you a 6-digit verification code.".
  * OTP step: "Enter verification code" with subtitle displaying the obfuscated recipient email and a "Change email" link.
* **Email Input Field**:
  * Rounded pill container (`h-12 w-full bg-zinc-900 border border-white/10 rounded-full px-5 text-white placeholder-zinc-500 focus-within:border-white/30 transition-all`).
* **6-Digit OTP Box Grid**:
  * 6 individual digit input boxes (`w-12 h-14 rounded-2xl bg-zinc-900 border border-white/10 text-center font-mono text-xl font-bold text-white focus:border-[#FF6B2C] focus:bg-zinc-800 transition-all flex items-center justify-center`).
  * Auto-focuses next digit on entry; deletes and shifts back on backspace; supports native paste event distributing all 6 digits instantly.
* **Timer & Resend Link**: Countdown timer text ("Resend code in 45s"); switches to an interactive orange link ("Resend code") once elapsed.

### Profile Setup Form (`OnboardingFlow.tsx`)
* **Avatar Picker**: Centered 100x100px circular avatar with camera overlay badge. Tapping opens native file picker with immediate client preview.
* **Input Fields**: Floating label input fields for Full Name and Bio with character counters.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `OnboardingFlow` | `src/features/auth/Logged Out/screens/OnboardingFlow.tsx` | Master coordinator managing `step` state (`ENTRY`, `LANDING`, `EMAIL_INPUT`, `OTP_INPUT`, `PROFILE_SETUP`), `onboardingIndex` (0–3), touch/keyboard swipe navigation, and session persistence. | Mounted by `App.tsx` when logged out; passes finished `UserProfile` to `onComplete`. |
| `Planless` | `src/features/auth/Logged Out/screens/Planless.tsx` | Welcome landing screen with brand logo, tagline, and entry buttons. | First step in `OnboardingFlow`. |
| `Problem` (exported as `Complicated`) | `src/features/auth/Logged Out/screens/Problem.tsx` | Onboarding slide 0 explaining scheduling chaos. | Embeds `ChaoticChatAnimation`. |
| `Solution` | `src/features/auth/Logged Out/screens/Solution.tsx` | Onboarding slide 1 showcasing Planless's structured plans. | Embeds `PlanAnimation` and `ManageParticipantAnimation`. |
| `CreatePlanOnboarding` | `src/features/auth/Logged Out/screens/CreatePlanOnboarding.tsx` | Onboarding slide 2 demonstrating plan creation flow. CTA button appears after animation completes. | Embeds `CreatePlanAnimation`. |
| `JoinPlanOnboarding` | `src/features/auth/Logged Out/screens/JoinPlanOnboarding.tsx` | Onboarding slide 3 demonstrating how friends join a plan. CTA button ("Next") advances to email step. | Embeds `JoinPlanAnimation`. |
| `EmailVerification` | `src/features/auth/Logged Out/screens/Emailverification.tsx` | Handles passwordless email entry, OTP sending, digit input, and token verification via Supabase Auth. | Dispatches `signInWithOtp` and `verifyOtp`. |
| `OnboardingHeader` | `src/features/auth/Logged Out/components/OnboardingHeader.tsx` | Navigation bar with back chevron. Rendered across all non-ENTRY onboarding steps. | Shared across onboarding screens. |
| `ChaoticChatAnimation` | `src/features/auth/Logged Out/components/ChaoticChatAnimation.tsx` | Visual animation depicting unstructured chat noise. | Used in `Problem.tsx`. |
| `PlanAnimation` | `src/features/auth/Logged Out/components/PlanAnimation.tsx` | Interactive animated plan card demonstrating live RSVP updates. | Used in `Solution.tsx`. |
| `CreatePlanAnimation` | `src/features/auth/Logged Out/components/CreatePlanAnimation.tsx` | Animation demonstrating plan creation flow inside canonical frame with 1:1 proportional content canvas scaling (scale 0.70), `shrink-0 pt-6 sm:pt-7 box-border` canvas positioning for unclipped viewport alignment, `No limit` plan size, and direct transition to review (bypassing New Activity screen). Exports `isCreatePlanAnimationCompleted` and `resetCreatePlanAnimation`. | Used in `CreatePlanOnboarding.tsx`. |
| `JoinPlanAnimation` | `src/features/auth/Logged Out/components/JoinPlanAnimation.tsx` | Animation demonstrating hold-to-join flow inside canonical frame with HoldToAcceptOverlay content proportionally scaled (scale 0.72) to 1:1 mobile screen proportions. Permanently freezes on terminal `JOINED` success state and reveals onboarding Next button. Cleanly resets on unmount/re-entry. Exports `isJoinPlanAnimationCompleted` and `resetJoinPlanAnimation`. | Used in `JoinPlanOnboarding.tsx`. |

---

## 5. Data Flow

```text
[User Enters Email in EmailVerification]
                   │
                   ▼
  [supabase.auth.signInWithOtp({ email })]
                   │
                   ▼
     [Supabase Auth Engine]
       ├── Generates 6-digit OTP
       └── Sends verification email via SMTP
                   │
[User Enters 6-Digit Code]
                   │
                   ▼
  [supabase.auth.verifyOtp({ email, token, type: 'email' })]
                   │
                   ▼
     [Supabase Auth Engine]
       ├── Validates code
       └── Issues JWT session tokens (access_token, refresh_token)
                   │
                   ▼
      [Query public.users table]
       ├── Existing User (full_name present) ──► onComplete(profile) ──► Enter App
       └── New User (no row / empty name)   ──► Profile Setup Step
                                                       │
                                                       ▼
                                            [User Inputs Name & Avatar]
                                                       │
                                                       ▼
                                          [INSERT / UPDATE public.users]
                                                       │
                                                       ▼
                                             [onComplete(profile)]
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Supabase Auth System (`auth.users`)
* Manages encrypted identity credentials, email confirmation timestamps, and active JWT sessions.
* Authenticated user UUID matches `auth.uid()`.

### 2. Table: `public.users`
* **Role in Feature**: Application-level public user profile linked 1-to-1 with `auth.users.id`.
* **Columns**:
  * `id` (`uuid`, PK, FK `auth.users.id`): Matches Supabase Auth UUID.
  * `public_id` (`text`, unique): Short user identifier (e.g. `@thilak`).
  * `email` (`text`, not null): User email address.
  * `full_name` (`text`, nullable): Display name entered during onboarding.
  * `username` (`text`, nullable): Unique handle.
  * `avatar_url` (`text`, nullable): Storage path to profile photo.
  * `bio` (`text`, nullable): User biography snippet.
  * `created_at` (`timestamptz`, default `now()`).
  * `updated_at` (`timestamptz`, default `now()`).

### 3. Supabase Storage: `avatars` Bucket
* Public storage bucket hosting user profile avatars uploaded via `useProfileUpload`.

### 4. Row Level Security (RLS) Policies
* **`public.users`**:
  * SELECT: Publicly readable by all `authenticated` users (`USING (true)`).
  * INSERT / UPDATE: Restricted to the authenticated user themselves (`WITH CHECK (auth.uid() = id)`).

---

## 7. States & Rules

### Authentication & Session Invariants
* **Passwordless Only**: Authentication is strictly passwordless via 6-digit email OTP. Passwords and social OAuth are disabled in the primary flow.
* **OTP Rate Limiting & Cooldown**: Resending OTP is throttled with a mandatory 60-second client countdown timer.
* **Session Restoration**:
  * On reload, `supabase.auth.getSession()` checks for existing valid JWTs.
  * If valid, authentication is bypassed and `ProfileContext` bootstraps immediately.
* **Pending Invite Token Preservation**: If an unauthenticated user arrived via a plan invite link (`/join/:planId`), the plan ID is cached in `localStorage` (`planless_pending_invite_token`) and executed immediately following profile creation.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`supabaseClient` (`lib/supabaseClient.ts`)**: Configured client with persistent auth session storage.
* **Supabase SMTP Service**: External email service provider delivering OTP emails.

### Downstream Impact of Changes
* **`ProfileContext` (`ProfileContext.tsx`)**: Consumes the user profile emitted by `OnboardingFlow.onComplete`. If profile schema changes, initial store bootstrap will fail.
* **Plan Invite Service (`planInviteService.ts`)**: Reads pending invite tokens upon auth completion to claim plan invitations.

---

## 9. Important Files

* `src/features/auth/Logged Out/screens/OnboardingFlow.tsx`: Master coordinator for auth and onboarding step/index state.
* `src/features/auth/Logged Out/screens/Planless.tsx`: Entry welcome screen.
* `src/features/auth/Logged Out/screens/Problem.tsx`: Onboarding slide 0 (Complicated — chaotic chat).
* `src/features/auth/Logged Out/screens/Solution.tsx`: Onboarding slide 1 (Planless solution).
* `src/features/auth/Logged Out/screens/CreatePlanOnboarding.tsx`: Onboarding slide 2 (Create Plan animation).
* `src/features/auth/Logged Out/screens/JoinPlanOnboarding.tsx`: Onboarding slide 3 (Join Plan animation).
* `src/features/auth/Logged Out/screens/Emailverification.tsx`: Email input and 6-digit OTP verification.
* `src/features/auth/Logged Out/components/CreatePlanAnimation.tsx`: Create Plan animation + completion state helpers.
* `src/features/auth/Logged Out/components/JoinPlanAnimation.tsx`: Join Plan animation + completion state helpers.
* `src/features/profile/hooks/useProfileUpload.ts`: Hook for uploading user avatar photos to Supabase Storage.
* `lib/supabaseClient.ts`: Supabase client initialization.

---

## 10. Known Issues

### 1. In-Memory Resend Timer Cleared on Hard Navigation
* **What Code Does**: `resendCooldown` is maintained in React state; while `otpExpiresAt` is saved in `localStorage`, refreshing the browser can occasionally reset the visible countdown display before the server cooldown has fully elapsed.
* **What Database Does**: Supabase Auth server enforces its own strict rate limits on `signInWithOtp` (typically 60s per email), returning `429 Too Many Requests` if triggered prematurely.
* **What is Unknown**: Whether local countdown persistence should sync with an explicit server timestamp header.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Verify OTP Delivery Configuration**: Ensure test email addresses are whitelisted or Supabase email rate limits are relaxed in local development.
2. **Preserve User ID Synchronization**: When creating rows in `public.users`, ensure `id` is strictly assigned `authData.user.id` to maintain foreign-key integrity with `auth.users`.

### Post-Modification Verification Steps
1. **Full Authentication Funnel**:
   - Open app in incognito window.
   - Click "Get Started" -> swipe slides -> enter valid email.
   - Verify OTP code arrives in inbox.
   - Enter 6 digits: verify auto-advance and successful login.
2. **First-Time Profile Setup**:
   - Complete OTP for a newly created email.
   - Verify profile setup screen appears; input name and upload avatar.
   - Verify `public.users` row is inserted and app mounts Home feed.
