# Feature Documentation: Invite Link

## 1. Overview

The **Invite Link** feature provides a direct URL-sharing mechanism for Planless events. It enables hosts (and authorized attendees) to generate, copy, and distribute deep links (`/join/:planId`) that allow recipients to discover, join, and RSVP to plans without requiring prior in-app friendship connections.

* **Core Function**: Generates canonical plan invitation URLs (`https://planless.app/join/<plan_id>`). When opened by an existing user, the link immediately executes `claim_plan_invite` to add the plan to their Home feed with `rsvp_status = 'INVITED'`. When opened by a new visitor, the invite context is cached in `localStorage` across authentication and onboarding, automatically claiming the invite once the account is created.
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
  ├── Existing participant row found:
  │     └── Preserves existing RSVP status (JOINED, WAITLISTED, SKIPPED, INVITED) without changes
  └── No existing participant row:
        ├── Always inserts plan_participants (role = 'PARTICIPANT', rsvp_status = 'INVITED', delivery_status = 'DELIVERED')
        ├── Increments plans.invited_participants
        └── Only if invited_participants == plan_size: increments plan_size by 1
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
  * `plan_size`: Incremented dynamically ONLY when the expansion condition is met (`invited_participants === current plan_size`). Never increments when someone joins a waitlisted or full plan.
* **`public.plan_participants`**:
  * **No existing row**: Inserts new row with `role = 'PARTICIPANT'`, `rsvp_status = 'INVITED'`, and `delivery_status = 'DELIVERED'`. This applies universally across all plan modes (Automatic, Assigned, etc.).
  * **Existing row**: Retains the existing `rsvp_status` (`JOINED`, `WAITLISTED`, `SKIPPED`, `INVITED`) unchanged.

---

## 7. States & Rules

### Invite Link Participant-State Behavior

#### Core Rule
```text
No existing participant row
        ↓
Create participant row
        ↓
RSVP = INVITED

Existing participant row
        ↓
Preserve existing RSVP status
```

* **New Participant Row**:
  If the person does not already have a `plan_participants` row for that Plan and a new row is created because they opened the invite link:
  → Their RSVP status must **ALWAYS** be `INVITED`.
  This applies regardless of the Plan type or participant mode:
  - Automatic
  - Assigned
  - Any other existing Plan configuration
  Do NOT automatically put a newly invited person into:
  - `JOINED`
  - `WAITLISTED`
  - `SKIPPED`
  - Any other RSVP state

* **Existing Participant Row**:
  If the person already has a participant row for that Plan, preserve their existing state when they open the invite link:
  - Already `JOINED` → show `JOINED`
  - Already `WAITLISTED` → show `WAITLISTED`
  - Already `SKIPPED` → show `SKIPPED`
  - Already `INVITED` → show `INVITED`
  Opening the invite link must not overwrite an existing participant's RSVP state.

### Link Claim Invariants
* **Strict Idempotency**: Opening an invite link multiple times is completely safe. The RPC inspects existing rows; if the user is already `JOINED`, `WAITLISTED`, or `INVITED`, their existing status is preserved untouched.
* **Live Status Requirement**: The target plan must have `status === 'LIVE'`. Plans in `OVERDUE`, `COMPLETED`, or `CANCELLED` throw an error.
* **Host Restriction**: A plan's host cannot claim an invite link to their own plan (`is_plan_host` check).

### Automatic Participant Join & Waitlist Invariants

#### Join-Time Decision Tree (On Accept / Join)
The capacity logic is evaluated dynamically **every time an actual participant joins** (e.g. via `join_plan` / Hold to Accept), never as a one-time check at plan creation:

```text
Automatic Participant joins
        ↓
Check current Plan size
        ↓
Check current invited participant count
        ↓
Check current joined/waitlist state
        ↓
Is there available capacity?
   ├── Yes (joined_count < plan_size) → add participant normally (JOINED)
   └── No  (joined_count >= plan_size) → waitlist participant (WAITLISTED)
        ↓
Only increase Plan size if:
invited participants === current Plan size
```

* **Dynamic Join-Time Capacity Evaluation**: Every time an Automatic Participant accepts an invitation and executes `join_plan`, the database re-evaluates the Plan's active participant capacity and waitlist state.
* **Join-Time Decision**:
  * If there is available capacity (`joined_count < plan_size`) → add the participant normally (`JOINED`).
  * If the Plan is full (`joined_count >= plan_size`) or a waitlist exists → put the participant on the waitlist (`rsvp_status = 'WAITLISTED'`, `joined_queue_at = now()`).
* **Waitlist Never Inflates Plan Size**: The Plan size (`plan_size`) must remain strictly unchanged when someone is placed on the waitlist. Do NOT increase the Plan size just because someone joined the waitlist.
* **Strict Capacity Expansion Condition**: The Plan size should only increase when the existing condition is met:
  > The number of invited participants is equal to the current Plan size (`invited_participants === current Plan size`).
  If that condition is not met (such as when a waitlist exists where `invited_participants > plan_size`, or when capacity is partially filled where `invited_participants < plan_size`), there is no reason to increase the Plan size.
* **No Manual Status Overrides**: For Automatic Participants specifically, do not allow their RSVP/status to be manually changed or overridden via options (e.g. `forceStatus`). Their status is determined strictly by the automatic participant/join logic based on current Plan state at the moment they join.

### 4. Invite-Link Navigation & Home Display Target Invariants

* **Exact Plan Display Guarantee**: When a user opens an invite link for **Plan A** (`/join/:planId`), after the link flow completes and the user is navigated to Home, the Home screen must display **that exact Plan A**. The user must never be shown another, random, recent, or default top plan instead.
* **End-to-End Token Preservation**:
  * The Plan ID/token extracted from the invite link is preserved through all lifecycles:
    - Fresh app launch
    - App already open (in-memory navigation / `popstate` / `planless-navigation`)
    - Session restoration
    - Authentication and onboarding completion
    - Invite claim RPC execution
    - Home feed plans refresh
* **Target Identity Retention**:
  - `activeCardId` must be initialized immediately with the target invite token (from path, pending props, or local storage) rather than `null`.
  - `HomeScreen` and `PlanFeed` must never overwrite `activeCardId` with `discoverablePlans[0]` while an invite target is resolving. If `discoverablePlans` has not yet received the target plan from the network or cache, `activeCardId` is retained so that it focuses the exact card the moment `discoverablePlans` updates.
  - Plan matching must check canonical UUIDs and aliases (`p.id`, `p.dbUuid`, `p.publicId`, `p.public_id`, `p.slug`).
  - `useVerticalPager` in `PlanFeed` calculates `resolvedInitialPage` directly matching `activeCardId` and triggers `goToPage` to navigate to that exact card upon resolution.
* **Acceptance Invariant**:
  $$\text{User opens link for Plan A} \implies \text{Home displays Plan A}$$

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`supabaseClient`**: Executes `claim_plan_invite` RPC.
* **`localStorage`**: Stores `planless_pending_invite_token` across browser redirects.

### Downstream Impact of Changes
* **Home Feed (`HomeScreen.tsx`)**: Successful claims create an `INVITED` participant row, making the plan immediately visible on the recipient's Home screen as an actionable hero card ready for RSVP.
* **Plan Capacity Recalculation**: Incrementing `plan_size` or `invited_participants` modifies the capacity denominators rendered across `WhoIsActuallyComing.tsx` and `PlanSizeCard.tsx`.

---

## 9. Important Files

* `src/features/plans/services/planInviteService.ts`: Core link construction and claim service with participant resolution.
* `src/features/auth/Logged Out/screens/OnboardingFlow.tsx`: Auto-claims pending links post-onboarding.
* `src/features/plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen.tsx`: Host link sharing trigger.
* `src/features/plans/hooks/usePlanParticipants.ts`: Client-side join flow protecting Automatic participants from manual status overrides.
* `supabase/migrations/20260924093500_update_automatic_participants_join_flow.sql`: Initial join-time capacity re-evaluation and waitlist invariants.
* `supabase/migrations/20260924094500_enforce_invite_link_always_invited_status.sql`: Authoritative PostgreSQL definition enforcing `rsvp_status = 'INVITED'` for all newly created rows upon opening invite links while strictly preserving existing participant state.

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
