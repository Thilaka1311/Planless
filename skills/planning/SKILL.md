---
name: planning
description: >-
  Categorize a requested change, determine the optimal investigation depth, and produce an adaptive
  implementation plan before writing code in Planless. Prevents over-planning for small tweaks while
  enforcing deep dependency tracing for logic, state, database, and architectural changes.
---

# Planless Planning Skill

This skill governs how to analyze a requested change, determine its complexity, and construct an actionable implementation plan before writing code in Planless.

The goal is to find the **most optimal path** for every task:
- Not the longest path.
- Not the fastest path.
- The path that provides enough understanding to make the change safely and correctly with the least unnecessary work.

## Core Principle

> **Understand enough to make the change safely, but never investigate or plan more than the change requires.**

This skill **only plans**. It does not write application code, run database migrations, or modify documentation.

---

## 1. Absolute Operating Rules

* **Categorize First**: Always categorize the request and assess its real complexity before deciding how much investigation and planning is needed.
* **Proportionality by Risk, Not Wording**: The amount of planning is proportional to the **actual risk and scope of the change**, never just the user's wording:
  * *"Change the button label"* is low-risk UI → requires minimal planning, no multi-file spec.
  * *"Change what happens when a participant rejoins"* carries cross-system risk → requires deep tracing across state, DB, UI, and side effects.
* **Avoid Unnecessary Investigation**: Never read files, feature docs, or database schemas that have no reasonable connection to the requested change.
* **Ground Truth in Actual Code**: Existing working code in `apps/app/src/` and migrations in `supabase/migrations/` represent ground truth, not imagined designs.
* **No Modifications During Planning**: Do not edit code, execute mutating SQL, or update documentation while planning. The output of this skill is strictly the plan.
* **Local Supabase Only**: All database development, testing, and schema changes must target local Supabase (`127.0.0.1:54322`). Production is strictly a read-only reference when comparing baselines.
* **Build on Existing Architecture**: Search for existing components (`apps/app/src/components/`, `src/shared/`, `src/IMGfromDB/`), hooks, stores, and utilities before proposing new ones.
* **Respect State Machines & Database Contracts**:
  * Internal joins, RPC parameters, and mutations must strictly use PostgreSQL UUIDs (`id` / `dbUuid`). Short text IDs (`public_id`, `@username`) are reserved for display, URLs, and search.
  * Respect Plan (`LIVE` → `OVERDUE` → `COMPLETED` / `CANCELLED`), Participant (`INVITED` → `JOINED` / `WAITLISTED` / `SKIPPED`), and Friendship (`PENDING` → `ACCEPTED`) lifecycles.
* **Surface Tradeoffs Early**: If a requirement has multiple viable approaches, ambiguous user intent, or product implications, present clear options with tradeoffs in plain English.
* **No Skill Duplication**: Do not duplicate the detailed execution steps of UI Design, Supabase, Code Implementation, Testing & Verification, Debugging, or Code Documentation.

---

## 2. Request Categorization & Planning Depth

Evaluate the task to select the appropriate category and determine planning depth. Use the actual task requirements rather than mechanically running through every category.

| Category | Typical Scope & Examples | Planning Depth & Investigation Scope |
|---|---|---|
| **Small UI change** | Change button text, swap icons, adjust spacing/padding, change a color/token, small visual tweak, move a UI element. | **Minimal**. Inspect only the target component and immediate surrounding layout. Do not read unrelated features or database code. Use `ui-design` skill where appropriate. |
| **Small isolated change** | Well-understood tweak confined to a single component or file (e.g. minor prop change, straightforward text validation). | **Targeted**. Inspect only the specific file and immediate parent/caller. Do not inspect unrelated features, services, or database code. |
| **Larger UI/UX change** | Redesigning a screen, new modal/sheet, new interactive flow, complex responsive layout. | **Moderate**. Inspect target screen/components, shared design system tokens, 5 UI states (loading, empty, populated, error, success), and mobile viewport constraints (`100dvh`). Use `ui-design` skill. |
| **Small logic change** | Single-function calculation fix, simple validation rule, adjusting a single timeout or boolean flag. | **Targeted**. Inspect the function/hook and its immediate consumers. Verify input/output edge cases. |
| **Logic / state change** | Modifying business logic, state transitions, participant lifecycles, capacity rules, shared services, or multi-component data flows. | **Deep**. Trace the full implementation and dependencies (stores, custom hooks, affected screens) before changing anything. Verify state machine invariants and side effects. |
| **Database change** | Altering tables, columns, RLS policies, triggers, constraints, or RPC functions in Postgres. | **Deep & Database-Focused**. Inspect existing migrations in `supabase/migrations/`, verify RLS permissions, RPC signatures, and UUID contracts. Use `supabase` and `supabase-postgres-best-practices` skills. Local Supabase only. |
| **Multi-feature / architectural change** | Cross-feature flows (e.g. Wallet ↔ Plans ↔ Participants), new global routing, cross-cutting hooks or context refactors. | **Full Planning**. Read relevant context (`MEMORY.md`, feature docs in `apps/app/src/features/<feature>/<feature>.md`), inspect all affected features, trace shared services and state stores, map database relations, and break into ordered phases. |
| **Debugging / bug fix** | Investigating runtime errors, unexpected UI behaviors, broken data flows, or regression issues. | **Root-Cause Focused**. Trace the symptom backwards to find the defect. Inspect only the affected flow and its direct dependencies. Avoid checking unrelated systems. Use `debugging` skill. |

---

## 3. Adaptive Planning Workflow

Instead of a rigid one-size-fits-all checklist, adapt the workflow to the determined category:

```text
1. Understand Request & Categorize
       ↓
2. Determine Optimal Investigation Path
   ├── Low-Risk (Small UI / Isolated Change)
   │     └── Inspect only the target component/file
   └── Meaningful Risk (Logic / State / Database / Multi-Feature)
         ├── Read relevant context (MEMORY.md, feature docs)
         ├── Trace dependencies, state stores & services
         └── Inspect DB schemas / RPCs (if applicable)
       ↓
3. Identify Reusable Existing Assets & Invariants
       ↓
4. Identify Risks, Side Effects & Required Skills
       ↓
5. Produce Implementation Plan (Minimal or Structured)
```

### Step 1: Understand Request & Categorize
* Identify the target screen/component and what is being asked.
* Determine the category (Small UI, Small Isolated, Logic/State, Database, Multi-Feature, Debugging).
* Decide the planning depth: **Minimal** vs. **Deep**.

### Step 2: Optimal Investigation Path
* **For Small / Low-Risk Changes**:
  * Jump directly to the target file.
  * Inspect the immediate element, styles, or logic.
  * Stop there. Do not read unrelated feature docs, database migrations, or context files.
* **For Meaningful / High-Risk Changes**:
  * Read relevant durable invariants in `MEMORY.md` (e.g. Home feed unaccepted invites rule, dual waitlists, last-host protection).
  * Read the authoritative feature doc: `apps/app/src/features/<feature>/<feature>.md`.
  * Trace state stores (`PlansContext`, `ProfileContext`, `FriendshipContext`, `WalletContext`) and shared services.
  * Inspect database dependencies in `supabase/migrations/` when database tables or RPCs are touched.

### Step 3: Identify Reusable Existing Assets & Invariants
* Look for existing components (`src/shared/components/`, `src/components/`, `src/IMGfromDB/`), hooks, and utilities before creating new ones.
* Respect UUID contracts and lifecycle state machines.

### Step 4: Identify Risks, Dependencies & Required Skills
* Note any cross-feature side effects, badge counts, or navigation impacts.
* List required specialized skills: `code-implementation`, `ui-design`, `supabase`, `testing-verification`, `debugging`, or `code-documentation`.

### Step 5: Produce Implementation Plan
* Choose the appropriate output format based on category:
  * **Format A (Minimal Plan)** for small UI or isolated changes.
  * **Format B (Structured Plan)** for meaningful logic, state, database, or multi-feature changes.

---

## 4. Implementation Plan Output Formats

### Format A: Minimal Plan (For Small UI & Low-Risk Changes)

Use this lean format for small UI tweaks, text adjustments, icon swaps, or isolated single-file changes:

```markdown
# Implementation Plan — [Change Title]

* **Category**: Small UI change / Small isolated change
* **Target File**: `[path/to/file]`
* **Intended Change**: [1-2 sentences describing what will be modified]
* **Design / Styling**: [Relevant tokens, components, or icons to use]
* **Required Skills**: `code-implementation`, `[ui-design if applicable]`
* **Verification**: [Quick build check or visual verification step]
```

### Format B: Structured Plan (For Meaningful / High-Risk Changes)

Use this structured format for logic, state, database, architectural, or multi-feature changes:

```markdown
# Implementation Plan — [Feature / Change Title]

* **Category**: [Logic/State / Database / Multi-Feature / Debugging / Larger UI/UX]

## 1. Problem & Objective
* **What needs to change**: [Clear description of the change]
* **Why it needs to change**: [User requirement, product goal, or bug resolution]
* **Product Impact**: [What this enables for the user]

## 2. Codebase Analysis & Reusability
* **Existing Files to Modify**:
  * `[path/to/file]`: [Specific modification and rationale]
* **Existing Components / Functions to Reuse**:
  * `[Component/Hook/Service]`: [How it will be reused]
* **New Files Required** (only if strictly necessary):
  * `[path/to/new-file]`: [Purpose and why existing files cannot be extended]

## 3. Technical Changes Breakdown
* **State & Logic Changes**: [Store updates, context hooks, routing logic]
* **UI & Layout Changes**: [Component structure, styling tokens, viewport behavior]
* **Database Changes** (if applicable): [Tables, columns, RLS, RPCs, local Supabase steps]

## 4. Dependencies, Risks & Edge Cases
* **Side Effects**: [Impact on other tabs, badges, or routes]
* **Edge Cases**: [Empty states, error states, permissions, offline handling]
* **Uncertainties & Tradeoffs**: [Options surfaced for founder review, if any]

## 5. Phased Implementation Steps
* **Phase 1 — [Name]**: [Specific actions]
* **Phase 2 — [Name]**: [Specific actions]
* **Phase 3 — [Name]**: [Specific actions]

## 6. Required Skills
* `code-implementation`
* `[ui-design / supabase / testing-verification / debugging]`

## 7. Verification Plan
* **Build & Integrity**: `npm run lint` / `npm run build` in `apps/app`
* **Automated Tests**: Relevant test commands (`vitest` / `tsx`)
* **Manual / Live Flow**: Concrete screens and interactions to verify locally
* **Documentation Sync**: Which `apps/app/src/features/<feature>/<feature>.md` must be checked and updated
```

---

## 5. Responsibility Boundaries & Coordination

* **Planning (This Skill)**: Categorizes the request, determines optimal planning depth, traces dependencies, and produces the blueprint. Does not write code, modify database, or update documentation.
* **Code Implementation**: Takes the approved plan, coordinates execution, writes code, and manages migration files.
* **UI Design**: Owns visual styling, single-viewport layout (`100dvh`), component reuse, design tokens, and 5-state UI coverage.
* **Supabase**: Owns PostgreSQL schema changes, RLS policies, RPC writing, and migration generation.
* **Testing & Verification**: Proves code integrity, executes automated tests, checks local DB mutations, and gathers evidence.
* **Debugging**: Isolates root causes when investigating runtime failures.
* **Code Documentation**: Reverse-engineers, maps, and automatically synchronizes feature documentation (`<feature-name>.md`) after code/database/UI changes to eliminate outdated or contradictory content.
