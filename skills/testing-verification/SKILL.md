---
name: testing-verification
description: >-
  Verify, test, and validate changes in the Planless codebase.
  Use this skill after implementing or modifying features, components, services,
  database objects, or bugfixes. Enforces local development verification, local Supabase testing,
  strict production read-only rules, code build checks, TypeScript compilation,
  unit/logic test execution, live user flow verification, local database mutation validation,
  migration review, regression detection, and strict evidence-based reporting.
---

# Planless Testing & Verification Skill

This skill defines how an AI agent proves that a code change or feature implementation in Planless actually works as expected.

Verification is not an afterthought or an assumption. An implementation is not complete until its real-world behavior, database mutations, UI states, and potential regressions have been validated with concrete evidence in the local development environment.

---

## 1. Absolute Production Rule: Read-Only Reference Material

**Production is strictly read-only reference material.** The AI agent must **never directly modify, test against, experiment on, or alter production**.

This applies equally to:
1. **Production Supabase / Database** (schemas, tables, functions, RLS, triggers, live data).
2. **Production Code / Files / Branches** (remote deployment branches, production configs).

The testing workflow must **never use production as a test environment**.

### Allowed Operations (Read-Only Reference)
The agent may:
* Read production database and schema information when necessary for comparison.
* Read production code or files when necessary for comparison.
* Compare local implementation against production.
* Identify and report differences between local and production environments.
* Use production as a read-only reference to understand baseline state.
* Perform approved read-only inspection of production after deployment (e.g., verifying schema migration landed via non-mutating queries).

### Forbidden Operations (Absolute Invariants)
The agent must **NEVER**:
* Run tests, test suites, or test scripts against the production database.
* Run feature verification against production.
* Run test mutations, inserts, updates, or deletions against production.
* Use production data to test a feature or treat production as a sandbox.
* Edit or alter production database, schema, or data.
* Change production to make a test pass.
* Use production as a development or testing environment.
* Directly modify production code, files, or environment configs.
* Pull production changes into the local working implementation.
* Merge production changes into the current working branch.
* Overwrite local work with production files, code, or branches.
* Make production changes manually instead of through the normal migration/deployment process.
* Treat production state as something it can modify to make development or testing easier.

> [!IMPORTANT]
> If local and production differ, **report the difference** instead of modifying production.
> If a production change is required, **stop and surface it to the user** rather than making the change directly.

---

## 2. Core Operating Principle & Workflow

For all database-dependent features, testing follows this strict progression:

```text
Local Code → Local Supabase → Test Logic & UI → Verify Local DB Mutations → Review Migration Files → Report Results
```

### The 8-Step Verification Cycle

```text
[1. Context & Docs] → [2. Code Integrity] → [3. Logic & Unit Tests] → [4. User Flow]
         ↓
[8. Report Results] ← [7. Regressions] ← [6. Edge Cases] ← [5. Local DB State]
```

### The Evidence Rule
Never claim an implementation works merely because:
* The code looks syntactically correct.
* The build command succeeded without errors.
* A component rendered without throwing an immediate exception.
* No error appeared in the terminal console.

**Verification requires proof.** If a behavior was not executed, measured, or queried in the local environment, it must be explicitly reported as **Unverified**.

---

## 3. Planless Verification Toolchain

This skill relies exclusively on the verified tools, scripts, and environments present in the local Planless codebase:

### 1. Code Integrity & Build
* **TypeScript Compilation (Type-Checking)**:
  ```bash
  npm run lint
  ```
  *(Runs `tsc --noEmit` in `apps/app/` or repository root. Must pass with zero errors).*
* **Production Bundle & Server Compilation**:
  ```bash
  npm run build
  ```
  *(Runs `vite build` and compiles `backend/server.ts` via `esbuild` in `apps/app/`).*

### 2. Automated Logic & Unit Tests
* **Vitest Test Runner**:
  ```bash
  # Run a specific unit test file
  npx vitest run apps/app/src/features/plans/utils/planSlugUtils.test.ts

  # Run all vitest suites
  npx vitest run
  ```
* **Direct Script Runners (`tsx`)**:
  Used across Planless for isolated business logic, capacity algorithms, and data calculations:
  ```bash
  npx tsx apps/app/src/features/participants/assigned/__tests__/assignedCapacityLogic.test.ts
  ```

### 3. Local Runtime & Live UI Verification
* **Development Server**:
  ```bash
  npm run dev
  ```
  *(Launches Express backend + Vite dev middleware on `http://localhost:3000`).*
* **Browser Verification**:
  Use the browser subagent or live browser interaction to navigate `http://localhost:3000`, exercise click paths, inspect DOM states, verify modal lifecycles, and check console output.
* **Multi-User Simulation**:
  Planless supports user/session switching via query parameters:
  `http://localhost:3000/?session=userA` or `http://localhost:3000/?user=U001`
  Use this to test bilateral interactions (e.g. User A sends friend request, User B accepts).

### 4. Database Verification (Local Supabase Exclusively)
All database-backed testing must use **local Supabase only**:
* **Local Supabase Environment**:
  * Status: `supabase status`
  * Local DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  * Reset: `supabase db reset --local`
  * Studio UI: `http://127.0.0.1:54323`
* **Direct Local Database Queries & Mutations**:
  Coordinate with the **Supabase skill** (`.agents/skills/supabase/SKILL.md`) using MCP tools (`execute_sql`) or CLI commands targeting the local database to inspect table rows, check RLS enforcement, and verify trigger results.
* **Production DB Prohibition**:
  Never execute test mutations or run automated test scripts against production Supabase (`wecmpncixopetvunkkyd`). Production is read-only reference only.

---

## 4. The 8-Step Verification Workflow (Detailed)

Follow this systematic workflow for every verification task:

### Step 1: Understand Change & Read Feature Documentation
1. Read the feature's documentation file:
   `apps/app/src/features/<feature-name>/<feature-name>.md`
2. Compare the requested change against the documented architecture, components, data flows, and state machines.
3. Identify the exact claims that must be validated (e.g. "when RSVP status changes to JOINED, waitlist capacity increments").

### Step 2: Code Integrity Check
Before testing user flows, ensure the code compiles cleanly:
1. Run `npm run lint` in `apps/app/` to catch type mismatches, invalid props, or missing imports.
2. Run `npm run build` in `apps/app/` to ensure bundling succeeds and asset references resolve.

### Step 3: Run Automated Logic Tests
1. If automated tests exist for the feature (e.g. `*.test.ts`), run them via `npx vitest run <file>` or `npx tsx <file>`.
2. If changing complex calculations (capacity sorting, slug generation, fee math, date parsing), write or update unit assertions.

### Step 4: Verify Live User Flow & UI Behavior
Test the real interaction flow in the running local app (`http://localhost:3000`):
1. **Entry & Navigation**: Does the screen open from its expected trigger? Does the back button return to the correct parent screen?
2. **Interactive Controls**: Do buttons, inputs, toggles, and swipe gestures react immediately?
3. **Form & Submission**: Do form submissions trigger the correct service call without double-submitting?
4. **Visual States**:
   * Loading: Does a spinner or skeleton appear during async operations?
   * Empty: Does a clean placeholder appear when lists or items are empty?
   * Error: Do error toasts or inline badges display user-friendly error messages on failure?
   * Success: Do confirmations or animated transitions display upon completion?
5. **Mobile Viewport Invariant**: Confirm the single-viewport model is maintained (`h-[100dvh] w-screen overflow-hidden`). No unwanted document-level horizontal or vertical scrollbars.
   *(Consult the **UI Design skill** for styling tokens and design system consistency).*

### Step 5: Verify Local Database Behavior & State Changes
For features interacting with Supabase, verify against **local Supabase only**:
1. **Reads**: Does the query return the expected joined columns and relations without RLS errors on the local database?
2. **Writes & Updates**: Inspect the actual local database table to ensure records are inserted or updated with:
   * Correct PostgreSQL UUIDs (`id` / `dbUuid`).
   * Valid enum values (e.g. `status = 'ACCEPTED'`).
   * Accurate timestamps (`created_at`, `responded_at`).
3. **Triggers & Side Effects**: Verify that local database triggers fired as expected (e.g. `trg_update_user_friends_count` updating `users.friends`).
4. **Deletions & Cascades**: If an entity was removed, verify whether it was soft-deleted or hard-deleted as required by the feature specification.
5. **Never Test Mutations on Production**: All writes, deletes, and trigger validations must occur on the local Supabase instance.
   *(Consult the **Supabase skill** for database inspection guidance).*

### Step 6: Test Important Edge Cases & Boundaries
Exercise non-happy paths:
* Empty inputs, excessively long strings, special characters, or emojis.
* Action cancellation (e.g. tapping "Cancel" on a modal or sent friend request).
* Network failure or offline simulator behavior (does the UI recover or rollback?).
* Rapid double-clicks on submit or action buttons (are actions idempotent or disabled during submission?).
* Boundary conditions (e.g. capacity limits `0`, `max`, over-capacity waitlists).

### Step 7: Audit Regressions in Dependent Features
Changes rarely exist in total isolation. Identify and check related components:
* Upstream navigation callers (e.g. did modifying `FriendshipsScreen` break `ProfileScreen`?).
* Shared components (e.g. did adjusting `UserAvatar` or `SearchBar` affect other screens?).
* Shared state contexts (e.g. `FriendshipContext`, `PlansContext`, `WalletContext`).
* Review `git diff` to verify that no unintended lines or accidental deletions were introduced.

### Step 8: Review Migration Files & Formulate Report
1. **Review Migrations**: Ensure verified local schema changes have corresponding migration files in `supabase/migrations/` ready for deployment review.
2. **Deliver Report**: Deliver a structured verification summary distinguishing proven facts from unverified areas.

---

## 5. The 5 Tiers of Verification Evidence

When reporting testing results, always categorize findings by evidence level:

| Tier | Classification | Definition | Example |
|---|---|---|---|
| **Tier 1** | **Automated Test Verified** | Verified by running an automated test or unit script with passing assertions. | *"Passed all 6 assertions in `assignedCapacityLogic.test.ts` via tsx."* |
| **Tier 2** | **Live Runtime Verified** | Verified by executing the live user flow in the local browser and observing the DOM/UI. | *"Tapped 'Add Friend' in local browser; button transitioned to 'Cancel' and incoming count updated."* |
| **Tier 3** | **Local Database State Verified** | Verified by querying the local Supabase database (`127.0.0.1:54322`) to inspect mutated rows, RLS, triggers, or constraints. | *"Inspected local `public.friendships` table: row created with status='PENDING' and canonical user_1_id."* |
| **Tier 4** | **Inferred Behavior** | Reasoned based on code inspection or architectural design, but not directly executed. | *"Inferred: Host attendance will decrement user wallet balance because trigger X is attached to plans."* |
| **Tier 5** | **Unverified / Unknown** | Behavior or edge case that was not tested or could not be validated locally. | *"Unverified: Push notification delivery on iOS device."* |

> [!NOTE]
> Testing against production is not an evidence tier because running tests, mutations, or experiments against production is strictly forbidden. Any production observation must be strictly **Read-Only Reference** (e.g. comparing schema definitions via read-only inspection).

---

## 6. Defect & Failure Handling

When a check fails or unexpected behavior is detected:

1. **Do Not Hide or Downgrade Failures**: Report the exact error, log, or unexpected visual behavior truthfully.
2. **Isolate the Root Cause**:
   * Did the failure occur due to the **current change**?
   * Is it a **pre-existing defect** in the codebase?
   * Is it an **environment or configuration mismatch** (e.g. local Supabase stopped)?
3. **Do Not Alter Production to Make Tests Pass**: Never modify production data, schema, or configuration to force a test or build to succeed.
4. **Do Not Silently Edit Unrelated Code**: Never refactor or alter surrounding business logic just to make a test pass.
5. **Reproduce & Document**: Provide the exact command, input, or click sequence that triggered the failure.
6. **Surface Uncertainty**: If the root cause is ambiguous, clearly state what is known and what remains uncertain.

---

## 7. Separation of Concerns

To keep this skill lean and focused, respect established skill boundaries:

* **Code Implementation (`skills/code-implementation/SKILL.md`)**:
  * Owns the implementation and local development workflow.
  * Ensures features are implemented locally and migration files are created/reviewed.
* **Testing & Verification (This Skill)**:
  * Owns proving the local implementation works.
  * Validates code integrity, automated tests, live user flow, and local database mutations.
  * Treats production strictly as read-only reference material.
* **Supabase Skill (`.agents/skills/supabase/SKILL.md`)**:
  * Owns database-specific schema definitions, RLS policies, RPCs, functions, triggers, migration generation, and database deployment mechanics.
* **UI Design Skill (`skills/ui-design/SKILL.md`)**:
  * Owns styling decisions, component reuse, design system tokens, typography scales, micro-animations, and viewport layouts.
* **Code Documentation Skill (`skills/code-documentation/SKILL.md`)**:
  * Owns feature-level reverse-engineering and authoritative feature documentation (`<feature-folder>/<feature-name>.md`).

Do not duplicate the full Supabase skill or UI Design skill inside this skill.

---

## 8. Verification Report Template

Conclude every verification task with this structured summary:

```markdown
### Verification Summary

#### 1. Checks Executed
* [x] Type check: `npm run lint` (0 errors)
* [x] Production build: `npm run build` (Clean Vite + server compilation)
* [x] Unit/logic tests: `npx vitest run <path>` (N tests passed)

#### 2. Live Flow & UI Verification (Local Runtime)
* **Flow Tested**: [Description of tested user path on http://localhost:3000]
* **Results**: [Observed UI transitions, button states, modals]
* **Evidence**: [Screenshot, DOM inspection, or log output]

#### 3. Database State Verification (Local Supabase)
* **Table(s) Checked**: [e.g. `public.friendships` in local Supabase]
* **State Verified**: [Observed rows, statuses, triggers via local query]
* **Migration Status**: [Migration file created/reviewed: e.g. `supabase/migrations/<timestamp>_<name>.sql`]

#### 4. Edge Cases & Regressions
* **Edge Cases Tested**: [Boundaries, cancellations, invalid inputs]
* **Regression Audit**: [Dependent screens checked, git diff review]

#### 5. Production Reference / Comparison (If Applicable)
* **Production Status**: [Read-only inspection only; 0 mutations performed against production]
* **Differences Identified**: [None / List of schema or configuration differences observed between local and prod]

#### 6. Unverified Areas & Known Limitations
* [Explicit list of things that could not be verified locally or remain unknown]
```
