---
name: code-implementation
description: >-
  Primary implementation skill for modifying, extending, or creating features in the Planless codebase.
  Use this skill whenever writing code, adding or updating screens, components, services, or state stores,
  fixing bugs, refactoring, or coordinating cross-stack feature changes in Planless.
  Enforces local development, local Supabase usage, strict production read-only rules, migration file creation,
  established feature architecture, pattern reuse, integration with Supabase, UI Design, and Testing & Verification skills,
  rigorous local verification, and keeping feature documentation synchronized.
---

# Code Implementation Skill

This skill defines the authoritative workflow and engineering standards for implementing, modifying, and maintaining features in the Planless codebase.

Planless is a social planning and real-world coordination platform built on a mobile-first Single-Page Application (React, TypeScript, Tailwind CSS v4, Vite) backed by Supabase PostgreSQL (Auth, Database, RLS, RPCs, Realtime).

---

## 1. Absolute Production Rule: Read-Only Reference Material

**Production is strictly read-only reference material.** The AI agent must **never directly modify, test against, experiment on, or alter production**.

This applies equally to:
1. **Production Supabase / Database** (schemas, tables, functions, RLS, triggers, data).
2. **Production Code / Files / Branches** (remote deployment branches, production configs).

The agent may inspect production when necessary to understand or compare current state, but production must never become part of the development or testing workflow.

### Allowed Operations (Read-Only Reference)
The agent may:
* Read production database and schema information when necessary for comparison.
* Read production code or files when necessary for comparison.
* Compare local implementation against production.
* Identify and report differences between local and production environments.
* Use production as a read-only reference to understand baseline state.

### Forbidden Operations (Absolute Invariants)
The agent must **NEVER**:
* Edit production database, schemas, or live data.
* Run tests against the production database.
* Use production as a development or testing environment.
* Run experimental queries, mutations, inserts, updates, or deletions against production.
* Directly modify production code, files, or environment configs.
* Pull production changes into the local working implementation.
* Merge production changes into the current working branch.
* Overwrite local work with production code, files, or branches.
* Make production changes manually instead of through the normal migration/deployment process.
* Treat production state as something it can modify to make development easier.

> [!IMPORTANT]
> If a production change is required, **stop and surface it to the user** rather than making the change directly.

---

## 2. Core Operating Principle

```text
Plan → Read Context / Documentation → Inspect Existing Implementation → Inspect Database → Implement Locally → Use Local Supabase → Verify Locally → Create / Review Migration Files → Prepare for Production Deployment
```

Never start by coding UI in isolation. A Planless feature is an integrated system: database state, lifecycle state machines, permissions, and application services drive the visual interface.

---

## 3. Feature Architecture & Directory Standards

Every feature in Planless resides under `apps/app/src/features/<feature-name>/` and follows a consistent, modular structure:

```text
apps/app/src/features/<feature-name>/
├── screens/               # User-facing screen views (full views mounted by router or navigation shell)
├── components/            # Feature-specific, reusable UI components, cards, bottom sheets, modals
├── services/              # Feature application logic, API callers, Supabase query wrappers, helpers
├── state/                 # Feature-specific React context, state stores, hooks, reducers
└── <feature-name>.md      # Authoritative feature implementation documentation
```

### Strict Placement Rules:
* **Screens (`screens/`)**: Put full-screen views, wizard steps, and routed pages in `screens/`.
* **Components (`components/`)**: Put feature-specific subcomponents, cards, rows, bottom sheets, and dialogs in `components/`. (Global/shared components belong in `apps/app/src/shared/components/` or `apps/app/src/components/`).
* **Services (`services/` or `api/`)**: Put database queries, RPC callers, external integrations, and business algorithms in `services/`.
* **State (`state/` or `hooks/`)**: Put React Context providers, state hooks, and cache management in `state/`.
* **Feature Documentation (`<feature-name>.md`)**: Feature documentation MUST live directly in the feature folder, named `<feature-name>.md` (e.g., `plans.md`, `friendships.md`, `home.md`). Never store feature docs in `context/`.

### Naming Conventions:
* Use clear, meaningful names that describe the actual domain concept (e.g., `HostAttendanceScreen.tsx`, `FriendProfileViewerBottomSheet.tsx`, `friendshipService.ts`, `FriendshipContext.tsx`).
* **NEVER** use vague, generic, or throwaway names such as `NewScreen`, `TestComponent`, `Temp`, `Helper`, or `CustomView`.

---

## 4. Implementation Workflow

### 4.1 Pre-Implementation Discovery & Planning
Before modifying or writing any code, execute this discovery and planning checklist:

1. **Read Context & Feature Documentation**:
   * Read relevant project context files in `Projects/Planless/context/` (`product.md`, `values.md`).
   * Read the feature's documentation file: `apps/app/src/features/<feature-name>/<feature-name>.md`.
   *(If the feature lacks documentation, invoke the **Code Documentation skill** to map it first).*
2. **Inspect Existing Implementation & Dependencies**:
   * Inspect existing files in `apps/app/src/features/<feature-name>/` across `screens/`, `components/`, `services/`, and `state/`.
   * Inspect upstream callers (`App.tsx`, `MainApp.tsx`, routing, tabs) and downstream dependencies.
   * If inspecting production code for comparison, treat it as **read-only reference**; never edit, pull, merge, or overwrite local work with production code. Local development remains the sole source of implementation work.
3. **Audit Reusable Assets**:
   * Search for shared primitives in `apps/app/src/shared/components/` (`SearchBar.tsx`), `apps/app/src/IMGfromDB/` (`UserAvatar.tsx`), and `apps/app/src/components/`.
   * Prefer adapting existing patterns over creating duplicate implementations.
4. **Database & Schema Investigation**:
   * For any feature touching Supabase, activate the **Supabase skill**.
   * Inspect the live local schema and migration history in `supabase/migrations/`.
   * If comparing against production schema, perform **read-only inspection only**. Never run mutations or experimental queries against production.
   * Verify RPC signatures, table constraints, UUID data types, and trigger side effects locally.
5. **Formulate the Plan**:
   * Define what is changing, affected files, reusable code, new files, and potential side effects before implementation.

---

### 4.2 Database-Backed Implementation Workflow (Local to Migration)

Planless database development strictly follows this progressive local lifecycle:

```text
Plan & Inspect Local Code & DB
       ↓
Implement Locally Against Local Supabase
       ↓
Verify Locally (via Testing & Verification skill)
       ↓
Create / Update Supabase Migration Files (via Supabase skill)
       ↓
Review Migration for Correctness & Security
       ↓
Prepare Migration for Production Deployment
```

#### 1. Local Supabase Exclusively
* All database development, schema prototyping, and testing must use **local Supabase only** (`supabase status`, local DB at port `54322`, Studio at `http://127.0.0.1:54323`).
* **NEVER** use production Supabase as an environment for implementation, experimentation, prototyping, or testing.
* Do not assume a database change is safe merely because application code compiles or passes TypeScript type checks.
* Validate the code, database behavior, and affected user flows completely in the local environment.

#### 2. Local Verification
* Verify that local queries, mutations, state changes, RPCs, and triggers behave as expected without RLS or constraint violations.
* Coordinate with the **Testing & Verification skill** to validate the affected flows and local database state.

#### 3. Migration Files
* Once the local database change and application code are verified:
  * Verified local database changes must be represented through migration files.
  * Coordinate with the **Supabase skill** (`.agents/skills/supabase/SKILL.md`) for the detailed migration mechanics (`supabase db pull <name> --local --yes` or `supabase migration new <name>`) rather than duplicating them here.
  * The migration file must accurately represent the verified database change and be suitable for reproducing the local schema change in production.
  * Review the migration file for correctness, idempotency, and security (RLS policies, `SECURITY INVOKER` vs. `SECURITY DEFINER`, search paths).
  * Manual production edits are strictly forbidden.

#### 4. Preparing for Production Deployment
* Production is reached **strictly through the established migration/deployment workflow**, never by directly editing production.
* When local implementation is verified and migrations are reviewed:
  * Prepare the migration files for deployment review.
  * Follow the established Supabase migration deployment process.
  * Never directly edit production state or run experimental migrations against production.
  * If post-deployment verification is needed, use **approved read-only inspection only** (e.g. read-only schema checks or non-mutating queries). Never run test mutations or write operations against production.

---

## 5. Engineering Principles & Invariants

### 1. Logic and Database First
* **Never begin with isolated UI**: Ensure state management, backend mutations, and data flow are verified before styling screens.
* **Database is Source of Truth**: UI state is never authoritative over the database. Internal mutations, foreign keys, and joins must strictly use PostgreSQL UUIDs (`id` / `dbUuid`). Short text IDs (`public_id`, `@username`) are reserved for display and URLs.
* **Preserve Established State Machines**: Never bypass lifecycle state machines (e.g., Plan statuses `LIVE` → `OVERDUE` → `COMPLETED` / `CANCELLED`; Participant statuses `INVITED`, `JOINED`, `WAITLISTED`, `SKIPPED`, `REJOINED`; Friendship statuses `PENDING` → `ACCEPTED`).
* **Do Not Silently Alter Logic**: Do not change established business logic or database behavior just to make a UI change quicker.

### 2. Responsibility Boundaries & Skill Coordination
Do not duplicate instructions or recreate tools provided by other specialized skills. Maintain clean separation of concerns:

* **Code Implementation (This Skill)**:
  * Owns implementation and local development workflow.
  * Ensures database-backed changes are developed and tested against local Supabase first.
  * Ensures verified local changes are transitioned into reviewed migration files before production deployment.
  * Coordinates with the specialized skills below.
* **Testing & Verification Skill (`skills/testing-verification/SKILL.md`)**:
  * Owns proving the local implementation works.
  * Verifies code integrity (`npm run lint`, `npm run build`), automated tests (`vitest`, `tsx`), live user flows, and local database mutations.
  * Strictly inspects production via read-only checks when comparison is necessary; never modifies or tests against production.
* **Supabase Skill (`.agents/skills/supabase/SKILL.md`)**:
  * Owns database-specific schema definitions, RLS policies, RPCs, functions, triggers, relationships, migration generation mechanics, and database deployment details.
* **UI Design Skill (`skills/ui-design/SKILL.md`)**:
  * Owns all styling decisions, component reuse, viewport layouts, design system color tokens (`#050505`, `#1C1C1E`, `#ff5e3a`), typography scales (Inter, Grand Hotel, Space Grotesk), micro-animations, and mobile viewport constraints (`h-[100dvh] w-screen`).
* **Code Documentation Skill (`skills/code-documentation/SKILL.md`)**:
  * Owns feature-level reverse-engineering, implementation mapping, and maintaining authoritative feature documentation (`<feature-folder>/<feature-name>.md`).

---

## 6. UI Implementation Rules

When logic and data behavior are solid, implement the user interface:

1. **Adhere to the Planless Design Language**: Pitch-black canvas (`#050505`), charcoal cards (`#1C1C1E`), subtle white hairline borders (`border-white/[0.06]`), and brand accents (`#ff5e3a`, `#ff8b66`).
2. **Mobile Viewport Constraint**: Respect the single-viewport model (`h-[100dvh] w-screen overflow-hidden`). Content inside screens must scroll within flex containers; never let the root page overflow.
3. **No Placeholders or Generic Styles**: Never introduce generic browser styles, unstyled HTML buttons, raw unformatted currencies, or plain stock colors. Format currency with Indian Rupee (`₹`).
4. **Hiding Navigation Shell**: When building immersive multi-step flows or full-screen wizards, hide the bottom navigation footer appropriately (`onToggleBottomNav(true)`).

---

## 7. Handling Errors, Conflicts & Uncertainties

Stop and surface the issue clearly before proceeding if you encounter:
* Conflicting business rules between code and database definitions.
* Existing bugs or regressions in surrounding code.
* Missing database columns, foreign keys, or failed RLS permissions.
* Ambiguous product requirements or underspecified UX edge cases.
* Architectural changes that could break downstream features (e.g., modifying `friendships` schema which impacts `users` RLS).

Clearly explain:
1. **What the code currently does**
2. **What the database currently does**
3. **What the conflict or uncertainty is**
4. **Concrete options with tradeoffs**

Do NOT silently guess or make assumptions on breaking changes.

---

## 8. Verification & Documentation Checklist

Before concluding any implementation task:

### 1. Code Integrity & Build Verification
* Run build check:
  ```bash
  npm run build
  ```
  in `apps/app/` to ensure zero TypeScript errors, clean bundle compilation, and no broken imports.

### 2. Logic & Flow Verification
* Verify that mutations write the expected records, statuses, and timestamps to the local database.
* Verify optimistic updates roll back gracefully on error.
* Check that realtime subscriptions receive and reflect updates without requiring manual refresh.

### 3. Regression Check
* Verify related features that depend on the modified services or state (e.g., changing friends selector does not break attendee list in plan preview).
* Inspect `git diff` to ensure no unrelated files or unintended modifications are included.

### 4. Documentation Synchronization
* When components, data flows, database schemas, or business rules materially change, immediately update the feature's documentation file:
  `apps/app/src/features/<feature-name>/<feature-name>.md`
* Keep documentation accurate and synchronized with the actual codebase.
