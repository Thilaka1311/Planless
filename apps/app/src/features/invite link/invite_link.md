# Feature Documentation: Invite Link

## 1. Overview

The **Invite Link** feature provides a direct URL-sharing mechanism for Planless events. It enables hosts (and authorized attendees) to generate, copy, and distribute deep links (`/join/:planId`) that allow recipients to discover, join, and RSVP to plans without requiring prior in-app friendship connections.

* **Core Function**: Generates canonical plan invitation URLs (`https://planless.app/join/<plan_id>`). When opened by an existing user, the link immediately executes `claim_plan_invite` to add the plan to their Home feed as an `INVITED` or `WAITLISTED` card. When opened by a new visitor, the invite context is cached in `localStorage` across authentication and onboarding, automatically claiming the invite once the account is created.
* **Product Role**: Viral growth and frictionless distribution engine. Serves as the primary external gateway bringing outside users into active plans from WhatsApp, iMessage, Instagram, and SMS.
* **Scope & Boundaries**: Manages link generation, deep-link token extraction, pending auth token persistence, and atomic invite claims. Does not alter plan details or manage attendance check-ins; after claiming, standard participant rules govern the user's interaction.

---

## 2. User Flow

### 1. Generating & Sharing a Plan Invite Link
* Host opens a plan via `PlansPreviewScreen`, `WhoIsComingScreen`, or `PlanSettingsScreen`.
* Host taps the **Share Link** or **Copy Link** button.
* `planInviteService.buildInviteUrl(planId)` formats the canonical URL: `https://planless.app/join/<plan_id>`.
* The client attempts to invoke `navigator.share()` (Web Share API) on mobile devices for native sharing into messaging apps; falls back to copying the link to the clipboard with an animated confirmation toast ("Link copied!").

### 2. Recipient Opens Link — Case A: Existing Logged-In User
* Recipient taps the shared link `https://planless.app/join/<plan_id>`.
* Application router intercepts `/join/:planId`:
  * Extracts the clean UUID via `extractInviteTokenFromPath(pathname)`.
  * Verifies caller has an active authenticated session.
  * Dispatches `claim_plan_invite(planId)` RPC to Supabase.
* Result:
  * If user was not previously on the roster: creates a new `plan_participants` row (`rsvp_status = 'INVITED'`).
  * If user is already on the roster: returns current participation state without creating duplicates or altering `plan_size` (idempotent).
* Router navigates the user to their **Home** feed, where the invited plan appears as the top actionable hero card.

### 3. Recipient Opens Link — Case B: New / Unauthenticated Visitor
* Recipient taps `https://planless.app/join/<plan_id>`.
* Router detects no active session:
  * Extracts plan UUID and caches it in `localStorage` under `planless_pending_invite_token` via `setStoredPendingInviteToken(token)`.
  * Redirects to the welcome and onboarding funnel (`Planless.tsx`).
* Visitor completes value onboarding and verifies their email via OTP (`Emailverification.tsx`).
* Visitor finishes profile setup (`OnboardingFlow.tsx`):
  * Application retrieves the cached token via `getStoredPendingInviteToken()`.
  * Dispatches `claim_plan_invite(pendingToken)` RPC.
  * Clears the cached token via `clearStoredPendingInviteToken()`.
* User enters the app on the **Home** feed with the shared plan ready for RSVP.

### 4. Recipient Opening an Inactive or Cancelled Link
* If a user opens an invite link for a plan that is `CANCELLED` or `COMPLETED`:
  * `claim_plan_invite` throws `40000 Plan is not active`.
  * Client displays an informative alert ("This plan is no longer active") and redirects to Home.

---

## 3. UI Documentation

### Share & Copy Controls
* **Share Action in Roster (`WhoIsComingScreen.tsx`)**:
  * Pinned link capsule (`w-full py-3 px-4 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-between my-2`).
  * Left: `<Link2 className="w-4 h-4 text-[#FF6B2C]" />` + text "Share invite link".
  * Right: Pill button "Copy" with hover background highlight.
* **Host Settings Screen (`PlanSettingsScreen.tsx`)**:
  * Action row with share icon, displaying the truncated URL (`planless.app/join/...`) and a one-tap copy button.
* **Success Toast**:
  * Floating bottom pill notification (`bg-zinc-900/95 border border-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2`) displaying `<Check className="w-4 h-4 text-emerald-400" />` and "Invite link copied to clipboard".

### Landing & Redirection Experience (`/join/:planId`)
* **Loading State**: Clean centered dark screen with minimalist loader spinner while token is validated against the Supabase backend.
* **Error State**: Modal dialog or centered notice:
  * Title: "Unable to join plan".
  * Description: "This plan may have ended, been cancelled, or the invite link is invalid."
  * Action: Button "Go to Home" (`bg-[#FF6B2C] text-white rounded-full px-6 py-2.5`).

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `planInviteService` | `src/features/plans/services/planInviteService.ts` | Utilities for generating URLs (`buildInviteUrl`), extracting tokens from pathnames, managing `localStorage` pending keys, and calling `claimPlanInviteRPC`. | Core service consumed across router, onboarding, and share buttons. |
| `App.tsx` | `src/App.tsx` | Root router detecting `/join/:planId` routes, stashing pending tokens in storage, or triggering instant claims for logged-in users. | Root gateway component. |
| `OnboardingFlow` | `src/features/auth/Logged Out/screens/OnboardingFlow.tsx` | Consumes pending invite token upon profile creation completion and auto-claims invite. | Calls `claim_plan_invite` after auth. |
| `PlanSettingsScreen` | `src/features/plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen.tsx` | UI hosting link share triggers for hosts. | Uses `buildInviteUrl`. |
| `WhoIsComingScreen` | `src/features/create/screens/WhoIsComingScreen.tsx` | Create wizard step offering link copy alongside direct friend selection. | Uses `buildInviteUrl`. |

---

## 5. Data Flow

```text
[User Opens /join/:planId]
            │
            ▼
 [extractInviteTokenFromPath]
            │
    ├── Logged Out:
    │     ├── setStoredPendingInviteToken(planId) ──► localStorage
    │     └── Redirect to Auth / Onboarding
    │           │
    │           ▼ (User Completes OTP & Profile)
    │     └── getStoredPendingInviteToken()
    │
    └── Logged In:
            │
            ▼
 [claimPlanInviteRPC(planId)]
            │
            ▼
 [Supabase RPC: public.claim_plan_invite]
  ├── Validates: auth.uid() is not null
  ├── Locks plan: status must be 'LIVE'
  ├── Prevents host from claiming own plan
  ├── Checks existing membership (Idempotent return if found)
  └── Evaluates capacity & filtering:
        ├── Case A (Capacity Available / Automatic):
        │     • Inserts plan_participants (role = 'PARTICIPANT', rsvp_status = 'INVITED')
        │     • Increments plans.invited_participants
        │     • If plan_size == invited_count: increments plan_size by 1
        └── Case B (Full Capacity & Assigned Filtering):
              • Inserts plan_participants (role = 'PARTICIPANT', rsvp_status = 'WAITLISTED', assigned_group = 'WAITLIST')
              • Assigns next contiguous waitlist_position
            │
            ▼
 [Clear pending token from localStorage]
            │
            ▼
 [Redirect to Home feed ──► Shared plan renders with action prompt]
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Function: `public.claim_plan_invite(p_plan_id uuid)`
* **Role**: Atomically processes an invite link claim by the authenticated caller (`auth.uid()`).
* **Security**: `SECURITY DEFINER` (executes with elevated privileges to update plan counters and insert participant rows).
* **Return Type**: `JSONB`:
  ```json
  {
    "success": true,
    "plan_id": "uuid",
    "rsvp_status": "INVITED",
    "assigned_group": null,
    "waitlist_position": null,
    "already_participating": false,
    "plan_size": 8,
    "invited_participants": 7
  }
  ```

### 2. Affected Database Tables
* **`public.plans`**:
  * `invited_participants`: Incremented by 1 for every new non-skipped claimant.
  * `plan_size`: Incremented dynamically if the plan was configured with capacity equal to the invited count.
* **`public.plan_participants`**:
  * Inserts new row with `role = 'PARTICIPANT'`, `rsvp_status = 'INVITED'`, and `delivery_status = 'DELIVERED'`.
  * If plan is full and mode is `ASSIGNED`: inserts with `rsvp_status = 'WAITLISTED'`, `assigned_group = 'WAITLIST'`, and populated `waitlist_position`.

---

## 7. States & Rules

### Link Claim Invariants
* **Strict Idempotency**: Opening an invite link multiple times is completely safe. The RPC inspects existing rows; if the user is already `JOINED`, `WAITLISTED`, or `INVITED`, their existing status is preserved untouched.
* **Live Status Requirement**: The target plan must have `status === 'LIVE'`. Plans in `OVERDUE`, `COMPLETED`, or `CANCELLED` throw an error.
* **Host Restriction**: A plan's host cannot claim an invite link to their own plan (`is_plan_host` check).
* **Automatic vs Assigned Handling**:
  * In Automatic plans with open capacity, claimers become `INVITED`. Upon accepting, FCFS rules apply.
  * In Assigned plans that are full, new claimers are automatically placed onto the waitlist (`assigned_group = 'WAITLIST'`).

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`supabaseClient`**: Executes `claim_plan_invite` RPC.
* **`localStorage`**: Stores `planless_pending_invite_token` across browser redirects.

### Downstream Impact of Changes
* **Home Feed (`HomeScreen.tsx`)**: Successful claims create an `INVITED` participant row, making the plan immediately visible on the recipient's Home screen.
* **Plan Capacity Recalculation**: Incrementing `plan_size` or `invited_participants` modifies the capacity denominators rendered across `WhoIsActuallyComing.tsx` and `PlanSizeCard.tsx`.

---

## 9. Important Files

* `src/features/plans/services/planInviteService.ts`: Core link construction and claim service.
* `src/features/auth/Logged Out/screens/OnboardingFlow.tsx`: Auto-claims pending links post-onboarding.
* `src/features/plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen.tsx`: Host link sharing trigger.
* `supabase/migrations/20260915070942_migrate_max_participants_to_invited_participants.sql`: Authoritative PostgreSQL definition of `claim_plan_invite`.

---

## 10. Known Issues

### 1. In-App Webview Storage Sandboxing
* **What Code Does**: Relies on `window.localStorage` to persist `PENDING_INVITE_TOKEN_KEY`.
* **What Browser Does**: In-app browsers (e.g. Instagram, TikTok, or LinkedIn webviews) can run in isolated sandbox sessions. If the user chooses "Open in Chrome/Safari", `localStorage` is not shared across the transition.
* **What is Unknown**: Whether URL query parameter forwarding (e.g. `?invite=UUID`) should supplement `localStorage` persistence during webview escapes.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Preserve Pathname Convention**: Deep linking relies on the `/join/:planId` route pattern. Do not alter routing without synchronizing `extractInviteTokenFromPath` and web server rewrite rules.
2. **Verify Idempotency**: Any modification to `claim_plan_invite` must verify that existing `JOINED` participants never get reverted to `INVITED` if they tap the link again.

### Post-Modification Verification Steps
1. **Logged-In Claim Flow**:
   - Host copies invite link for Plan A.
   - User B (logged in) pastes `/join/<planId>` in browser.
   - Verify User B is added as `INVITED` and Plan A appears on User B's Home feed.
2. **New User Auth Claim Flow**:
   - In incognito window, open `/join/<planId>`.
   - Complete signup and profile creation.
   - Verify user lands on Home feed with Plan A pre-populated.
