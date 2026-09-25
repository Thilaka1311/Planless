# MEMORY.md — Planless Engineering Principles, Architectural Invariants & Learned Reasoning

This file stores durable engineering principles, architectural invariants, and reasoning patterns learned while building Planless. Consult this file before starting any task.

---

## 0. Universal Engineering & Debugging Principles

### The Core Axiom

> **"What actually determines this behavior right now?"** — ask this before asking **"What code should I change?"**

The visible symptom of a bug or unexpected behavior is almost never its root cause. When application state, layout, or data appears incorrect, do not immediately modify the most visible component, database field, cache, or state variable. Trace backward to the authoritative source and the exact execution lifecycle.

---

### The 12-Step Diagnostic Framework: Diagnose Before Modifying

For any bug, unexpected behavior, or regression, complete this diagnostic sequence before modifying application code:

1. **Establish the expected behavior**: Define precisely what should happen from the user and system perspective under specific preconditions.
2. **Reproduce the actual behavior**: Confirm the exact steps, inputs, and environment that trigger the divergence. Determine whether it is deterministic or timing-dependent.
3. **Trace the complete execution path**: Follow the flow from trigger to result:
   $$\text{User Action / Event} \longrightarrow \text{Handler} \longrightarrow \text{State Mutation} \longrightarrow \text{Side Effects / APIs / DB} \longrightarrow \text{Derived State} \longrightarrow \text{Render / Output}$$
   Do not stop at the first suspicious line of code.
4. **Identify the authoritative source of truth**: Determine which layer officially governs the state (URL/router, database, memory state, persistent storage, realtime stream, etc.).
5. **Identify where expected and actual behavior first diverge**: Pinpoint the earliest execution step where runtime state deviates from expectations.
6. **Check state initialization and lifecycle**: Inspect how initial state is provided, when mount-time initializers run, and what default values are assigned before external inputs arrive.
7. **Check synchronous vs. asynchronous execution and ordering**: Contrast what runs immediately during render/mount with what resolves later via Promises, microtasks, or timers.
8. **Check derived state and state overwrites**: Investigate whether downstream calculations, subsequent renders, or parallel hooks overwrite or corrupt the initial value.
9. **Check persistence, cache, server, realtime, and client state**: Verify if stale local caches, pending backend mutations, RLS filters, or socket subscriptions are conflicting with client expectations.
10. **Prove the root cause before implementing a fix**: Be able to express the defect as an unbroken causal chain:
    $$\text{Trigger } X \longrightarrow \text{Condition } Y \longrightarrow \text{Failure } Z$$
    Never make speculative edits based on suspicion alone.
11. **Make the smallest correct change at the actual source**: Resolve the problem at the originating layer, preserving existing architecture and avoiding compensatory workarounds.
12. **Test the original case plus related edge cases and regressions**: Validate the failing path, the happy path, boundary states, and adjacent user flows.

---

### Principle 1: Identify the Authoritative Source of Truth

Never assume that the component rendering a value owns that value. Always establish which architectural layer is authoritative:

| Architectural Layer | Typical Scope of Authority |
|---|---|
| **URL & Router** | Active primary route, nested sub-views, public query params, deep-link context |
| **Component State** | Ephemeral, local-only interactions (e.g., dropdown open/close, drag offsets) |
| **Props** | Read-only inputs passed down from an owning container or parent controller |
| **Derived State** | Values computed purely from other state; must never be cached in secondary state |
| **Persistent Storage (`localStorage`, `sessionStorage`)** | Offline preferences, multi-session flags; secondary to active server/URL state |
| **Local Cache** | Optimistic UI snapshots; must reconcile cleanly with authoritative backend responses |
| **Database & RPCs** | Ground truth for relational records, multi-user consistency, and business constraints |
| **Realtime Subscriptions** | Live remote broadcasts; must update client caches without resetting local view state |
| **Authentication & Session** | Identity context, active tokens; dictates permission gates and navigation routing |
| **Browser & Device State** | Viewport dimensions, virtual keyboard status, orientation, network connectivity |
| **Gesture & Event Pipeline** | Touch/pointer arbitration, gesture ownership, drag thresholds |
| **Configuration & Environment** | Feature flags, API base URLs, platform capabilities |

**Rule**: Never update or clear a secondary replica of state when another layer is the authoritative source. If the source of truth is wrong, fix the source of truth.

---

### Principle 2: Execution Order & Lifecycle Timing

A correct piece of code executing at the wrong time produces broken behavior. When analyzing any flow, explicitly evaluate what executes:

- **Before** the behavior: Prior lifecycle hooks, previous route unmounts, storage writes, or pending network requests.
- **During** the behavior: Synchronous initializers, event bubbling, state dispatch, and active render cycles.
- **Immediately after** the behavior: Microtasks, Promise resolutions, store subscriber notifications, and layout passes.
- **Across lifecycle transitions**: Mount, update, unmount, route transitions, backgrounding/foregrounding, and tab switching.
- **Across timing boundaries**: Synchronous code runs immediately; asynchronous callbacks resolve later. Synchronous initializers cannot read data that has only been scheduled for asynchronous update.

---

### Principle 3: Eliminate Root Causes, Reject Symptom Workarounds

Never implement superficial patches that mask an underlying defect. The following patterns are explicitly prohibited:

- **Adding arbitrary delays** (`setTimeout(..., 100)`): Masking race conditions or lifecycle ordering defects with timers.
- **Adding duplicate state**: Creating a secondary local variable or state mirror because synchronization with the primary source failed.
- **Adding redundant caches or duplicate API calls**: Fetching again or caching locally to avoid fixing stale store invalidation.
- **Forcing hard refreshes or artificial remounts**: Forcing reloads (`window.location.reload()`) or resetting keys instead of managing state transitions.
- **Hiding misaligned elements**: Applying CSS `overflow: hidden`, `display: none`, or manual offsets to hide broken layout constraints.
- **Blind state resets**: Resetting state back to defaults without understanding why it arrived at an incorrect value.
- **Compensating workarounds**: Writing downstream logic to handle invalid upstream data rather than fixing the upstream generator.

Unless there is an explicitly verified, documented architectural constraint, always fix the origin of the problem.

---

### Principle 4: Preserve Architectural Integrity & Reuse

When implementing changes or fixing defects:

- **Reuse existing systems**: Leverage established stores, contexts, hooks, utilities, and components before writing new ones.
- **Respect established patterns**: Do not invent new routing, state-management, or database access paradigms when established patterns already exist in the codebase.
- **No duplicate systems**: Never create parallel abstractions or copy-pasted helper functions to bypass an existing subsystem.
- **No mock replicas of production flows**: When building demo, onboarding, animation, or preview experiences that showcase an existing product capability (e.g., Create Plan, Join Plan, Waitlist), mount and drive the authentic production components rather than handwriting throwaway JSX mockups. Isolate context providers via safe store fallbacks so production interactions (e.g., Hold-to-Join progress, elliptical search, real participant management) remain 100% authentic.
- **Surgical scope**: Make the smallest change that solves the problem correctly. Do not refactor surrounding code or modify unrelated features.

---

### Principle 5: Verify Behavior, Not Just Code

Verification is not complete simply because an error message disappeared or a single happy-path screenshot looks correct. Systematically verify:

- **Normal happy path**: The standard user journey operates as expected.
- **Failing / error path**: Invalid inputs, rejected promises, and network failures degrade gracefully.
- **Inverse / opposite behavior**: Toggling off, navigating back, undoing, or deselecting restores previous clean state.
- **Boundary conditions**: Zero items (empty state), maximum capacity, single-item lists, boundary numbers, and extreme character lengths.
- **Lifecycle transitions**: Fast navigation, unmounting mid-request, app backgrounding, and tab re-entry.
- **Reload & re-entry**: Hard page refresh, session restoration, and cold app starts.
- **Multi-user / multi-device concurrency**: Changes made by one user reflect correctly for another without state stomping.
- **Stale cache & offline states**: Cache invalidation triggers correctly upon mutation.
- **Regression pathways**: Adjacent views, parent screens, and dependent flows continue functioning without unintended side effects.

---

### Principle 6: Memory-Writing Protocol & Knowledge Distillation

When updating this memory file after resolving an issue or learning a pattern:

1. **Identify the specific incident**: What broke, what symptom appeared, and what failed.
2. **Extract the underlying engineering lesson**: Identify the core mechanism (e.g., synchronous mount vs. asynchronous lifecycle, route synchronization hierarchy, mutually exclusive state machines).
3. **Write the reusable principle as the primary rule**: Formulate the lesson so it applies to any screen, feature, database table, or lifecycle event in the application.
4. **Retain the specific incident only as an illustrative example**: Keep concrete details (screens, variables, routes) strictly as supporting context to demonstrate how the principle applies in practice.

Do not record bug-specific post-mortems as standalone rules. The purpose of memory is to elevate engineering reasoning across the entire codebase.

---

## 1. Identifier Contracts: Relational Keys vs. Public Presentation Tokens

* **Core Principle**: Maintain strict separation between internal relational foreign keys and public presentation tokens. Relational integrity (foreign keys, table joins, row-level security policies, RPC arguments) requires stable, system-generated immutable identifiers. Public-facing tokens (URL slugs, short codes, search handles) are intended exclusively for human readability, indexing, and sharing. Mixing these layers compromises database integrity and causes silent query failures.
* **Invariant**: All database foreign keys, relational joins, table mutations, and RPC parameters must strictly use internal PostgreSQL UUIDs (`id` / `dbUuid`). Short text identifiers (`public_id`, `@username`) are strictly reserved for URLs, search matching, and UI presentation. Never perform a relational join or filter a foreign key column using a public presentation token.
* *Historical Context*: Early RPCs and UI components passed short alphanumeric codes (e.g., `P000001`, `U001`) into UUID database columns, leading to database-level type cast failures and empty RLS queries.

---

## 2. Mutually Exclusive State & Domain View Boundaries

* **Core Principle**: When domain entities transition through distinct lifecycle stages, views representing those stages must have mutually exclusive membership criteria. A single entity must never satisfy the predicates for multiple conflicting views simultaneously. Overlapping view criteria create UI ambiguity, duplicate display, and inconsistent user expectations.
* **Invariant**: Filter predicates for distinct feeds and views must be strictly partitioned. When an entity transitions lifecycle state, it must atomically satisfy the criteria for its new view while becoming completely excluded from its previous view.
* *Historical Context*: The Home invitation feed and Plans active feed previously had overlapping criteria, causing accepted and hosted plans to linger in the invitation feed alongside pending invites. Enforcing strict predicate boundaries (`INVITED` exclusively on Home; `JOINED`, `WAITLISTED`, `HOST` exclusively in Plans) eliminated the ambiguity.

---

## 3. Mutual Exclusion in Competing Ordering Strategies

* **Core Principle**: When a subsystem supports multiple ordering strategies (e.g., automated chronological queuing vs. manual administrative priority), the strategies must be mutually exclusive and governed by an explicit mode switch. Never allow data points from one ordering strategy to persist or execute concurrently with the other, as this inevitably causes race conditions and trigger overwrites.
* **Invariant**: Maintain strict physical and logical separation between competing ordering modes:
  * **Automated FIFO Mode**: Ordering is strictly governed by arrival timestamps (e.g., `joined_queue_at ASC`). Manual position indices must remain `NULL`. Never allow manual drag-and-drop mutations in automated mode.
  * **Manual Priority Mode**: Ordering is strictly governed by explicit position indices (e.g., `position` 1..N). Arrival timestamps must remain `NULL` or ignored for sorting.
* *Historical Context*: The dual waitlist system previously mixed queue timestamps with manual position integers on the same participant rows, causing manual drag-and-drop reorders to be wiped out whenever automated database triggers recalculated timestamps.

---

## 4. Resource Ownership & Non-Orphan Invariants

* **Core Principle**: Any entity that requires an administrative controller or owner must enforce non-zero ownership invariants at the database and state machine level. An entity must never transition into an orphaned state. Any action that would remove or demote the sole remaining owner must be blocked or require an atomic transfer of ownership to an active participant.
* **Invariant**: An active managed resource must always possess at least one confirmed, active owner/host. The sole active owner cannot leave, be removed, or be demoted without first transferring ownership to another confirmed member.
* *Historical Context*: Allowing the last host to leave a plan orphaned the record, leaving remaining participants with no ability to edit, invite, or cancel the event.

---

## 5. Reflexive Self-Accounting in Multi-Party Ledgers

* **Core Principle**: In any multi-party ledger, expense-splitting engine, or bilateral netting system, an actor cannot hold an open liability to themselves. In balance calculations, an individual's share of an expense they funded personally represents self-consumption, not an outstanding debt. Failing to auto-settle reflexive shares distorts bilateral balances and corrupts settlement summaries.
* **Invariant**: When generating or recalculating multi-party expense splits, the payer's own participant split row must always be initialized as settled (`is_paid = true`, `remaining_balance = 0`). Only non-payer participants accrue outstanding liabilities.
* *Historical Context*: Logging an expense previously left the payer's split share marked as unpaid, causing the payer to appear indebted to themselves in bilateral netting calculations.

---

## 6. Single Source of Truth for Backend Contracts

* **Core Principle**: Backend schemas, RPC signatures, triggers, and Row Level Security (RLS) policies must be verified directly against repository migration files and the active local database, never guessed, inferred, or duplicated into ad-hoc configurations.
* **Invariant**: Always inspect live database tables, RPC parameters, and migration files (`supabase/migrations/`) before implementing or modifying backend integrations. Never create parallel client-side abstractions or shadow schemas.
* *Historical Context*: Creating redundant client tooling or guessing column types produced schema drift and runtime migration conflicts.

---

## 7. Product Builder Collaboration & Decision Governance

* **Core Principle**: Prioritize user experience and product clarity over implementation mechanics. Non-technical stakeholders require clear tradeoff analyses and observable behavior, not implementation jargon.
* **Invariant**:
  * Present recommended solutions first, followed by clear tradeoffs in plain English.
  * Separate product decisions from implementation details; make UX and business implications explicit before building.
  * Never declare an implementation or fix complete without verifying it in the running application or database.
  * Make the smallest effective code change; do not refactor surrounding code unless strictly necessary.

---

## 8. Hierarchical Navigation State & Action Lifecycle Tracing

* **Core Principle**: Global store mutations must never unintentionally reset nested or active child route states. When parent data stores update, route synchronization mechanisms must preserve active detail views rather than blindly defaulting to root tabs. Tracing unexpected navigation or dismissals requires analyzing all four tiers of the action lifecycle:
  1. **Tier 1 — Event Propagation**: Pointer events, gesture bubbling, and default browser actions.
  2. **Tier 2 — Mutation Execution**: State dispatches, API calls, and RPC resolutions.
  3. **Tier 3 — Store Subscriptions**: Reactive `useEffect` hooks and route synchronizers responding to store mutations.
  4. **Tier 4 — Conditional Render Gates**: Root and container-level conditional rendering logic.
* **Invariant**: Route synchronization effects must strictly preserve active child parameters (e.g., selected entity IDs, open modal routes) across global store re-evaluations. Never navigate to a bare root path when a child detail view is active.
* *Historical Context*: In-screen actions inside a detail view triggered an RPC that updated a global collection. A top-level route sync effect responded to the collection change by calling a root-level tab navigation function that omitted the active detail ID, causing the child screen to abruptly unmount.

---

## 9. Proportional Scoping for Targeted Changes

* **Core Principle**: Investigation and planning depth must match the risk and scope of the requested change. Small, isolated UI adjustments (such as role-based button guards, styling tweaks, or modal toggles) must follow a direct, targeted inspection path rather than triggering exhaustive repository scans or heavy planning documentation.
* **Invariant**: For isolated access or UI restrictions, trace only:
  $$\text{Target View} \longrightarrow \text{Existing Role / State Flag} \longrightarrow \text{Trigger Element} \longrightarrow \text{Target Container / Prop}$$
  Reuse existing role flags immediately. Stop investigation once sufficient context exists to make the change safely.
* *Historical Context*: A request to make a bottom sheet host-only triggered an unnecessary full-codebase scan across unrelated features and containers, delaying a simple one-line boolean guard.

---

## 10. Contract Parity, Destructive Fallback Auditing & Boundary Verification in Shared UI

* **Core Principle**: When reusing UI components or sharing modal workflows across different modes, treat the visual and interaction contract as an exact specification. Multi-purpose sheets and dialogs must be audited to ensure that contextual fallbacks (especially destructive actions like cancellation or deletion) do not leak into flows where they were never intended. Components must be verified across all boundary conditions (empty, full capacity, minimum capacity).
* **Invariant**: Never pass destructive action handlers to a shared component unless that destructive capability is explicitly required for that specific flow. Always test components under boundary states (e.g., zero participants, exact capacity, oversubscribed).
* *Historical Context*: Reusing a participant management action sheet introduced a hidden conditional branch that replaced requested options with a destructive "Cancel Plan" button when capacity was full, because fallback props were passed without auditing the component's internal condition checks.

---

## 11. Targeted Codebase Discovery via Dependency Graphs

* **Core Principle**: Discover architecture through structural dependency graphs and caller hierarchies rather than unguided directory searches or broad grep scans. Targeted inspection minimizes token overhead, prevents premature assumptions, and keeps changes surgical.
* **Invariant**: Consult the structural dependency graph (`graphify-out/graph.json` or Graphify queries) first to map callers, hooks, and relationships. Inspect only the files identified along the direct dependency path.
* *Historical Context*: Broad exploratory file searches across dozens of unrelated directories slowed down targeted fixes that took only seconds once the dependency graph was consulted.

---

## 12. Viewport Dynamics & Virtual Keyboard Layout Contracts

* **Core Principle**: On mobile browsers, the viewport contract between the browser chrome, the virtual keyboard, and fixed bottom inputs must be explicitly coordinated. Relying on default browser viewport behaviors creates inconsistent overlays and obscures active input controls.
* **Invariant**: Always configure mobile HTML viewport tags with `interactive-widget=resizes-content` so browsers dynamically adapt the layout viewport when virtual keyboards open. Pair this with dynamic visual viewport tracking for bottom-pinned input composers to ensure they remain pinned cleanly above the keyboard on all mobile devices.
* *Historical Context*: Overlays-content viewport configuration caused virtual keyboards on mobile devices to render directly over chat inputs, hiding active text fields from the user.

---

## 13. Unified Gesture Controllers vs. Competing Touch Handlers

* **Core Principle**: High-precision touch interfaces (such as full-screen pagers or swipeable feeds) require a single, unified gesture controller. Combining native scroll containers (like CSS scroll-snap) with custom drag physics or child pointer capture creates gesture conflicts, jerky momentum, and unpredictable release behavior.
* **Invariant**: For custom gestural feeds, use a unified drag engine with explicit threshold formulas, unified momentum physics, and symmetric release boundaries. Never allow child components to capture pointer events (`setPointerCapture`) during primary axis navigation.
* *Historical Context*: Native CSS scroll snap combined with child pointer capture created gesture competition that intercepted vertical swipes and broke smooth card settling.

---

## 14. Synchronous State Initialization vs. Asynchronous Lifecycle & Authoritative Routing

* **Core Principle**: When application state initializes, identify which source is evaluated **synchronously at mount time**. Asynchronous operations cannot alter or fix synchronous state initializers. If an authoritative source (such as the browser URL or navigation history) contains stale state when a component mounts, clearing or mutating a secondary or asynchronous store (such as `localStorage` or a remote session restore hook) has zero effect because the synchronous initializer has already completed.
* **Invariant**:
  1. **Identify the True Synchronous Source**: When a component or view initializes, determine whether its initial state is derived synchronously from the URL, props, or local storage. The synchronous source is the true determinant of initial state.
  2. **Async Operations Cannot Fix Synchronous Mounts**: Asynchronous cleanup functions that resolve after mount cannot retroactively correct synchronous initializers.
  3. **Reset Authoritative State on Lifecycle Transitions**: When transitioning across major lifecycle boundaries (logout, authentication reset, session recovery, onboarding completion), reset the **authoritative source itself** (e.g., the browser URL / history stack) synchronously during the transition.
* *Historical Context*: After logging out from a detail view and logging back in, the application unexpectedly restored the detail view instead of the home screen. A proposed fix cleared `localStorage` asynchronously during session restore. The fix failed completely because the URL (`window.location.pathname`) still held the stale path, which was read synchronously by the route parser at mount time to initialize active tab state. Updating the authoritative source (replacing the URL history state at logout and restore) resolved the issue at its root.

---

## 15. Resting Layout Integrity, Pure CSS Containers & Independent Keyboard Overlay Separation

* **Core Principle**: 
  1. **Never Compromise the Resting State**: The resting (keyboard-closed) layout of any screen must rely on natural, unconstrained CSS (`w-full h-full flex flex-col justify-between`). Never apply hardcoded pixel heights (such as `window.innerHeight`) to nested flex children to solve keyboard behavior; doing so ignores parent headers/safe areas and pushes bottom CTAs completely off-screen.
  2. **Independent Overlay Separation**: When a button or CTA needs to dynamically float above the virtual keyboard (e.g. OTP verification), the button must **never** participate in the normal vertical layout flow. Do not shrink logos, reduce paddings, compress input boxes, or shift content upwards to make room for it. Keep the underlying screen content 100% stable and render the keyboard-aware button as an independent, `fixed` overlay positioned via viewport insets.
  3. **Preserve Existing UI Copy & Action Labels**: Never rename established primary buttons (e.g. changing `Continue` to `Next` or `Verify` to `Verify & Continue`). Respect the exact UI contract as specified.
* **Invariant**:
  - In resting state (keyboard closed), let standard flexbox manage height (`h-full`). Only freeze container height when `keyboardOpen === true` using previously measured `clientHeight` if preventing resize reflow is strictly required.
  - Floating keyboard-aware CTAs must be decoupled overlays (`fixed left-0 right-0 z-30`) that mount/unmount strictly on condition (e.g., OTP digits === 6) without causing layout reflow in the underlying view.
  - Test and verify both states: the resting state (button fully visible at bottom) AND the active keyboard state (button correctly docked without content resizing).
* *Historical Context*: An attempt to prevent virtual keyboard resize reflow applied `style={{ height: window.innerHeight }}` to the email entry container. Because the container sat beneath a 70px header, this pushed the primary CTA 70px off the bottom of the visible screen. Simultaneously, the button label was accidentally altered from `Continue` to `Next`. Reworking the architecture to keep the resting state pure CSS (`h-full`), preserving the exact `Continue` label, and treating the keyboard-docked CTA as an independent overlay resolved all layout regressions immediately.

---

## 16. Empty-State UI Composition & Layout Invariants

* **Core Principle**:
  1. **Centered Content Area**: Empty states must be vertically and horizontally centered within the available content area by default. They should not sit unnecessarily near the top of the screen or rely on arbitrary top paddings (`pt-16` or `py-12`) that break proportional centering across different device viewports.
  2. **Unified Composition**: Treat the complete empty-state composition as a single coherent unit: `icon/vector → title → description/helper text → CTA (when present)`. They must flex and center together.
  3. **No Default Circular Background**: Do not wrap empty-state vectors or icons in circular backgrounds/containers (`w-12 h-12 rounded-full bg-zinc-950 border border-white/[0.03]`) unless the existing design language explicitly requires one. Vector icons should normally render cleanly directly on the screen background.
  4. **Reuse Existing Assets & Navigation**: Always reuse existing vector/icon assets (e.g. `Users`, `UserCheck`, `UserPlus`) and existing screen navigation pathways rather than introducing ad-hoc assets or duplicate routes.
* **Invariant**: Across all app screens (Friends, Friend Requests, Discover People, etc.), empty-state containers must use natural flex centering (`flex-1 flex flex-col items-center justify-center text-center px-4 py-8`) respecting safe areas, headers, and navigation bars.
---

## 17. Explicit State Checking vs. Ephemeral PL/pgSQL `FOUND` Variables

* **Core Principle**: In database functions and stored procedures (PL/pgSQL), the system variable `FOUND` is ephemeral and is implicitly overwritten by every subsequent query statement. Aggregate queries like `SELECT COUNT(*)` always return a single result row and unconditionally set `FOUND = true`. Never rely on `FOUND` across statement boundaries to determine whether an earlier lookup query matched a record.
* **Invariant**: Always capture existence checks into explicit local boolean variables (e.g. `v_has_existing := (v_existing.role IS NOT NULL)`) immediately following the target record lookup. Use that explicit variable for downstream conditional branching (`IF v_has_existing THEN UPDATE ELSE INSERT`).
* *Historical Context*: In `public.join_plan`, an existence lookup for `plan_participants` was followed by a `SELECT COUNT(*)` query to check current plan capacity. The `SELECT COUNT(*)` query unconditionally set `FOUND = true`, causing `join_plan` to always execute the `UPDATE` branch on new users. 0 rows were updated, the `INSERT` branch was skipped, and the RPC returned `success: true` while never persisting the participant in the database.



