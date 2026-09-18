# Feature Context Directory: AI Agent Operating Guidelines

## 1. Purpose of the Folder

The directory `Projects/Planless/context/features/` is the authoritative collection of feature-level implementation documentation for the Planless application.

* **Current Implementation Record**: These documents describe how individual features currently operate in the actual Planless codebase and live database.
* **Agent Accelerant**: They exist so AI agents can rapidly establish an implementation-level understanding of an existing feature before making changes, eliminating the need to reverse-engineer the entire codebase on every task.
* **Not Speculative**: This folder is strictly implementation context. It is **not** a product roadmap, product specification, feature wishlist, or design proposal. It represents verified working reality.

---

## 2. What a Feature File Is

Each `.md` file in this directory represents one specific Planless feature (e.g., `home.md`, `plans.md`, `create.md`, `profile.md`, `chats.md`, `participants.md`, `wallet.md`).

A feature file provides an AI agent with an authoritative, technical, implementation-level mental model of how that feature is constructed across the frontend, state stores, networking hooks, and backend database objects.

---

## 3. What Each Feature File Contains

Every feature file follows a strict, standardized 11-section framework:

1. **Overview**
   * What the feature is.
   * Its role and placement in the product.
   * Key high-level architectural and implementation boundaries.

2. **User Flow**
   * Step-by-step user actions and resulting application responses.
   * Key interaction branches, navigation triggers, and terminal paths.

3. **UI Documentation**
   * Visual and structural hierarchy of the actual implementation.
   * Overall screen layout and component placement.
   * Visible interactive controls, inputs, and buttons.
   * Typography definitions and text styling hierarchy.
   * Color palettes, borders, shadows, gradients, and blur/glassmorphic treatments.
   * Spacing, sizing, and layout constraints where relevant.
   * Images, icons, and SVG assets.
   * Modals, bottom sheets, popovers, and overlays.
   * Animations, motion transitions, and spring physics.
   * Loading, empty, error, and success states.
   * Responsive adaptations and virtual keyboard handling.
   * Visual changes driven by user interactions or state transitions.
   * *Rule*: Only document visual properties directly verified from code.

4. **Components**
   * Inventory of relevant frontend components with project-relative paths.
   * Concrete technical responsibilities of each component.
   * Important hooks, stores, context providers, and utilities involved.

5. **Data Flow**
   * End-to-end trace of how information moves through the feature:
     `UI → Event Handler → Context/Hook → Supabase Client/RPC → PostgreSQL Database → Realtime Broadcast → State Store → UI Re-render`.
   * Optimistic updates, cache layers, rollbacks, and transformations.

6. **Backend & Database**
   * Relevant Supabase tables and critical columns.
   * Primary keys, foreign keys, relationships, and constraints.
   * Database enums, RPCs, PostgreSQL functions, and triggers.
   * Row Level Security (RLS) policies and execution permissions.
   * *Rule*: Kept lean and strictly feature-specific.

7. **States & Rules**
   * Authoritative source of truth for feature behavior.
   * State machines (RSVP statuses, plan lifecycle, attendance states).
   * Business logic, permissions, capacity constraints, and queue rules.
   * System invariants that must never be broken.

8. **Dependencies & Change Impact**
   * Upstream dependencies required for the feature to function.
   * Downstream impact: what other screens, features, or background services could break if this feature changes.
   * Integration points and cross-feature contracts.

9. **Important Files**
   * Curated list of high-priority source files an AI agent should inspect before making modifications.
   * Formatted using project-relative paths (e.g. `apps/app/src/features/plans/state/PlansContext.tsx`). Never use machine-specific absolute paths.

10. **Known Issues**
    * Confirmed bugs, discrepancies, or technical debt discovered during review.
    * Explicit separation:
      * What the code does.
      * What the database does.
      * What is unknown or unverified.

11. **Modification Notes**
    * Invariants to verify before touching the codebase.
    * Specific manual and automated verification checklists to execute after changes.
    * Critical edge cases and potential side effects to inspect.

---

## 4. Evidence and Accuracy Rules

Feature documentation must strictly describe the **CURRENT IMPLEMENTATION**.

AI agents writing or reading this documentation must maintain rigorous distinctions between:
* **Verified implementation**: Behavior proven by inspecting actual code, database schemas, RPC functions, or triggers.
* **Inferred behavior**: Reasonable deductions based on surrounding code patterns (must be explicitly labeled as inferred).
* **Unknown / unverified behavior**: Logic that cannot be definitively determined from available evidence (must be explicitly labeled as unknown).
* **Product intention / future ideas**: Proposed specs or comments that are not active in code (must never be documented as current behavior).

**Core Rules**:
* Never treat product requirements, comments, or wishlist specifications as implemented behavior.
* If a detail cannot be verified from the codebase or database, mark it as unknown rather than guessing.
* Never silently invent missing implementation details.

---

## 5. How AI Agents Should Use This Folder

When tasked with modifying, fixing, or extending an existing Planless feature:

1. **Identify**: Determine which feature file in `Projects/Planless/context/features/` governs the area of work.
2. **Read**: Review the feature documentation to build a rapid mental model of the current implementation.
3. **Inspect Important Files**: Open and inspect the primary files listed in Section 9 of the feature document.
4. **Verify Against Code**: Cross-reference critical claims in the document with active code. The codebase remains the ultimate source of truth.
5. **Verify Database Behavior**: If the feature touches Supabase, inspect the live database schema, RPCs, triggers, and RLS policies using available database inspection tools.
6. **Check Known Issues**: Review Section 10 to avoid tripping over known technical debt or discrepancies.
7. **Check Dependencies & Impact**: Review Section 8 to identify cross-feature contracts that could be broken by changes.
8. **Plan & Implement**: Execute code changes adhering strictly to the system rules and invariants detailed in Section 7.
9. **Test & Verify**: Follow the post-change verification steps outlined in Section 11.
10. **Keep Documentation Fresh**: If code modifications materially alter components, data flow, schema, states, or UI behavior, update the corresponding feature file immediately.

*Important*: Reading a feature file **does not replace** inspecting the actual code. The feature documentation is a structured map that makes understanding the codebase faster and safer.

---

## 6. Relationship with Other Context Files

The context hierarchy in Planless is organized by specificity:

* `Projects/Planless/`
  → Product-level context (business model, values, customer profiles, high-level architecture).
* `Projects/Planless/context/`
  → Shared project-wide context (cross-cutting rules, core data structures, shared services).
* `Projects/Planless/context/features/`
  → Feature-level implementation context (how individual capabilities work).
* `Projects/Planless/context/features/<feature>.md`
  → Deep technical documentation for one specific feature.

Feature files must focus on implementation-level knowledge and must not duplicate general Planless product descriptions or high-level company strategy.

---

## 7. File Organization Rules

* **One File per Feature**: Exactly one Markdown file per feature domain.
* **Naming Conventions**:
  * All file names must be lowercase.
  * Multi-word feature names must use hyphens (e.g. `invite-link.md`, `participant-management.md`).
* **Location**: All feature documentation files must live directly in `Projects/Planless/context/features/`.
* **Prohibited Content**:
  * Do not place random notes, scratch scripts, temporary files, screenshots, or logs here.
  * Do not place research documents here (research belongs in `Projects/research/<research-topic>/`).
  * Do not place high-level business strategy or product pitches here.

---

## 8. Documentation Philosophy

* **Current Implementation Over Intended Behavior**: Document what the code actually does today, not what comments or PRDs wished it did.
* **Evidence Over Assumptions**: Verify with ripgrep, AST inspection, and schema checks before recording facts.
* **One Fact → One Authoritative Location**: Maintain clean separation across sections to prevent drift and contradictions.
* **Implementation Map, Not Specification**: Guide future developers and agents through the codebase rather than prescribing abstract design goals.
* **Concise Yet Complete**: Provide enough technical depth for an agent to work safely without unneeded conversational filler.
* **Document the Perimeter**: Always map upstream triggers, downstream side effects, and database constraints—never stop at the primary screen component.
* **Verify Before Changing**: Check invariants and known issues before editing code.
* **Continuous Synchronization**: Keep documentation updated whenever the implementation materially changes.
