---
name: debugging
description: >-
  Investigate, isolate, and resolve bugs, runtime exceptions, data anomalies, and unexpected behaviors in Planless.
  Use this skill whenever investigating why something is broken, failing, throwing an error, or behaving incorrectly.
  Enforces local reproduction, systematic root-cause tracing, local Supabase usage, strict production read-only rules,
  smallest effective diffs, coordination with specialist skills, and concrete verification before declaring an issue fixed.
---

# Planless Debugging Skill

This skill defines the authoritative workflow for diagnosing, isolating, and resolving defects in the Planless application and database.

Debugging is disciplined diagnosis, not trial-and-error guessing. The objective is to identify the genuine root cause, implement the smallest effective fix, and prove resolution without collateral regression.

---

## 1. Absolute Production Rule: Read-Only Reference Material

**Production is strictly read-only reference material.** The AI agent must **never directly modify, test against, experiment on, or alter production**.

This applies equally to:
1. **Production Supabase / Database** (schemas, tables, functions, RLS, triggers, live data).
2. **Production Code / Files / Branches** (remote deployment branches, production configs).

### Invariants:
* **All debugging and testing must use local Supabase** (`127.0.0.1:54322`, Studio at `http://127.0.0.1:54323`).
* **Production is read-only reference**: Inspect production schema, database, or code only when strictly necessary for comparison.
* **Never mutate production**: Never run test queries, experimental mutations, data fixes, or debugging scripts against production.
* **Never pull or merge production**: Do not pull, merge, or overwrite local code with production files or branches.
* **Report differences**: If local and production environments differ, report the discrepancy to the user rather than altering production.

---

## 2. Core Debugging Workflow

```text
Understand the Issue
       ↓
Read Relevant Context / Feature Documentation
       ↓
Reproduce Locally
       ↓
Trace the Affected Code / Data Flow
       ↓
Identify the Root Cause
       ↓
Make the Smallest Necessary Fix
       ↓
Test Locally (via Local Supabase)
       ↓
Verify No Regression
```

---

## 3. Step-by-Step Execution Guide

### Step 1: Understand the Issue
* Gather the exact symptom: user action taken, expected outcome, actual outcome, console errors, network failures, or unexpected database state.
* Clarify ambiguous bug reports before jumping to code.

### Step 2: Read Relevant Context & Feature Documentation
* Check the feature's documentation file: `apps/app/src/features/<feature-name>/<feature-name>.md`.
* Review documented data flows, state machines (Plan, Participant, Friendship), RLS policies, and known issues.
* Check `context/product.md` or `context/values.md` if the issue touches business logic or core product invariants.

### Step 3: Reproduce Locally
* Always reproduce the defect in the local environment (`http://localhost:3000` or via isolated test scripts).
* For multi-user bugs, use session switching query parameters: `?session=userA` vs `?user=U001`.
* For backend or calculation bugs, create or run a minimal reproduction script using `npx tsx scratch/<repro>.ts` or `vitest`.
* **If it cannot be reproduced locally**: Verify environment parity (local Supabase running, migrations applied, seeds populated). Do not guess.

### Step 4: Trace the Affected Code & Data Flow
Follow the execution chain backward from the symptom to the origin:
```text
UI Symptom (Component render / gesture / click)
       ↓
State Hook / Context (`state/`)
       ↓
Service / API Wrapper (`services/`)
       ↓
Supabase Call / RPC (`execute_sql` / local client)
       ↓
Database Object (Table constraint, RLS policy, Trigger, RPC definition)
```
* Inspect actual runtime payloads, network responses, and error objects.
* When inspecting database behavior, coordinate with the **Supabase skill** using local tools (`execute_sql`, local Studio).

### Step 5: Identify the Root Cause
* Distinguish between **symptoms** and the **underlying root cause**:
  * *Symptom*: Button spinner spins indefinitely.
  * *Immediate Cause*: Promise never resolves.
  * *Root Cause*: Supabase query rejected silently by an RLS policy missing an `UPDATE` `USING` clause.
* **No Guessing Rule**: If the root cause is uncertain or multiple hypotheses exist, surface the uncertainty. State:
  1. What is confirmed by evidence.
  2. What remains uncertain.
  3. The specific tests needed to disambiguate.

### Step 6: Make the Smallest Necessary Fix
* **Smallest Effective Diff**: Fix the root cause with minimal, surgical changes.
* **Build on What Exists**: Reuse existing utilities, error handlers, and state actions. Do not introduce redundant abstractions.
* **No Unrelated Refactoring**: Do not clean up, reformat, or refactor surrounding code while fixing a bug.
* **Preserve State Machines**: Never hack around established status transitions (`LIVE`, `JOINED`, `ACCEPTED`) to make a fix easier.
* For code modifications, follow the **Code Implementation skill**.
* For database schema/function changes, coordinate with the **Supabase skill** (develop against local Supabase, generate migration file).

### Step 7: Test Locally
* Re-run the exact reproduction step locally to confirm the bug no longer occurs.
* Verify the fix in the live local environment:
  * Application build: `npm run build` in `apps/app/` (0 errors).
  * Type check: `npm run lint` in `apps/app/` (0 errors).
  * Logic tests: Run relevant unit or logic tests via `vitest` or `tsx`.
  * Local DB mutations: Inspect local Supabase rows and trigger results.
* Delegate rigorous proof to the **Testing & Verification skill**.
* **Never Claim Fixed Without Verification**: An issue is only resolved when backed by concrete proof.

### Step 8: Verify No Regression
* Test adjacent user paths and dependent components (e.g., did fixing participant RSVP break waitlist sorting or attendee counts?).
* Review `git diff` to ensure only intended changes are included.
* Update feature documentation (`<feature-name>.md`) under Known Issues or Modification Notes if behavior or edge cases were clarified.

---

## 4. Coordination with Specialist Skills

Do not duplicate the responsibilities of other Planless skills. Delegate according to the established division of labor:

* **Code Documentation Skill (`skills/code-documentation/SKILL.md`)**:
  * Consult when locating where a feature lives, tracing component structures, or checking documented state machines.
* **Supabase Skill (`.agents/skills/supabase/SKILL.md`)**:
  * Consult when diagnosing database errors (RLS failures, RPC bugs, constraint violations, trigger side effects) and creating migration files for verified database fixes.
* **UI Design Skill (`skills/ui-design/SKILL.md`)**:
  * Consult when diagnosing visual bugs, CSS/Tailwind layout breaks, viewport clipping, color token mismatches, or animation glitches.
* **Code Implementation Skill (`skills/code-implementation/SKILL.md`)**:
  * Consult when implementing multi-file changes, coordinating database migrations, or adding services.
* **Testing & Verification Skill (`skills/testing-verification/SKILL.md`)**:
  * Consult when executing regression suites, validating multi-step flows, or generating evidence reports.

---

## 5. Common Planless Bug Archetypes & Diagnostic Pointers

| Category | Typical Symptom | Common Root Causes & Inspection Points |
|---|---|---|
| **RLS Permission Errors** | Empty lists returned or silent mutation failure with 0 rows affected | Missing `TO authenticated`, missing `SELECT` policy required by `UPDATE`, or policy using `raw_user_meta_data` instead of `auth.uid()`. |
| **UUID vs Public ID Mismatch** | Foreign key errors, 404s, or joined relation returns null | Query passing short text ID (`P000001`, `@username`) to a column expecting PostgreSQL UUID (`id` / `dbUuid`), or vice-versa. |
| **Silent Mutation Failure** | UI updates optimistically then reverts or shows stale state | Missing error handling around Supabase response; unhandled trigger exceptions rolling back transaction in PostgreSQL. |
| **Viewport & Scrolling Bugs** | Window double scrollbar, bottom nav obscured, or page jumps | Violation of `h-[100dvh] w-screen overflow-hidden`; scroll container not set to `flex-1 overflow-y-auto`; missing safe area insets. |
| **State Desynchronization** | Component renders outdated data after an action | Cache not invalidated, missing Realtime subscription handler, or state updater mutating state in place. |

---

## 6. Debugging Summary Template

Conclude every debugging task with this structured breakdown:

```markdown
### Bug Resolution Summary

#### 1. Symptom & Reproduction
* **Reported Issue**: [Description of failure]
* **Local Reproduction**: [How the issue was reproduced on localhost / via test script]

#### 2. Root Cause Analysis
* **Mechanism**: [Why the bug occurred—tracing from trigger to root fault]
* **Files Involved**: [List of affected files]

#### 3. Resolution Applied
* **Fix**: [Description of smallest surgical fix made]
* **Diff Scope**: [Files modified, lines changed]

#### 4. Verification Evidence
* [x] Local reproduction resolved (bug no longer reproduces)
* [x] Code integrity verified: `npm run lint` & `npm run build`
* [x] Local database state verified (local Supabase only; 0 production mutations)
* [x] Regression check passed for dependent flows
```
