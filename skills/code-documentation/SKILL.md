---
name: code-documentation
description: >-
  Analyze, document, and synchronize feature-level implementations in Planless.
  Use this skill to (1) understand, document, or reverse-engineer a feature, and
  (2) automatically synchronize feature documentation (<feature-name>.md) after any
  code, database, or UI changes. Ensures documentation strictly reflects the current
  verified implementation by replacing outdated or contradictory details. Does not modify
  application code or database schema.
---

# Code Documentation


## Automatic Documentation Synchronization After Changes

Whenever any file or implementation inside a Planless feature is changed (screens, components, services, state, database RPCs/triggers, or UI interactions):

* **Mandatory Post-Change Check**: The corresponding feature documentation must be checked immediately after implementation and verification.
* **Compare Implementation vs Documentation**: Compare the current verified code and database behavior against the existing `<feature-name>.md` file in `apps/app/src/features/<feature-name>/<feature-name>.md`.
* **Update Mismatches**: If the current implementation differs from what is documented, update `<feature-name>.md` immediately.
* **Purge Contradictory & Outdated Content**: Remove or replace any previous documentation that contradicts the new implementation. Do not keep historical behavior that is no longer true.
* **No Changelog Appending**: Do not append changelogs, version history, or "before/after" notes. The feature document must describe the **current verified implementation**.
* **Holistic Update**: Do not document only the isolated new change; update every affected section (User Flow, UI Documentation, Components, Data Flow, Backend & Database, States & Rules, Dependencies, Important Files, Known Issues, Modification Notes) so the entire feature document remains accurate and complete.
* **Colocated Destination**: Feature documentation remains strictly inside the actual feature folder in the codebase (`apps/app/src/features/<feature-name>/<feature-name>.md`). Never create duplicate copies or place feature documentation in `context/`.

The standard operating rule is:
**Code changes → feature documentation updated → documentation accurately reflects the current implementation.**

---

## Role & Architecture

The Code Documentation skill acts as the **feature-level investigator and synchronizer**. When a feature touches Supabase, the Supabase skill acts as the **database-level investigator**.

The relationship is:

```text
Code Documentation
        ↓ (reads and consults)
Relevant Supabase Skill
        ↓ (guides tool usage and access)
Composio / MCP
        ↓
Supabase tools
        ↓
Actual Supabase project
```

### Separation of Concerns
* **Code Documentation** remains responsible for producing and maintaining the final feature documentation. It defines **when** and **why** the Supabase skill must be used.
* **Supabase Skill** is responsible for providing guidance on inspecting, querying, and understanding Supabase schema, behaviors, and tools.
* **Do not merge** the Supabase skill into Code Documentation.
* **Do not duplicate** the Supabase skill's instructions inside Code Documentation.
* **Keep the integration lean**: Do not create a new Supabase integration. Do not create new API keys. Do not create another MCP configuration. Always use the existing Composio/MCP connection and the existing Supabase skill.

---

## Process Workflow

### A. Automatic Synchronization Workflow (Post-Implementation)
When code or database implementation in a feature has been modified:
1. Locate the feature documentation at `apps/app/src/features/<feature-name>/<feature-name>.md`. (If absent, create it using the standard 11-section structure).
2. Review the verified changes made to screens, components, hooks, services, state, or database RPCs/triggers.
3. Read the existing `<feature-name>.md` and identify all outdated descriptions, incorrect props, altered UI flows, or changed business rules.
4. Update every affected section of the document to accurately describe the new verified implementation.
5. Delete all contradictory statements or legacy behavior.
6. Verify the file remains in `apps/app/src/features/<feature-name>/<feature-name>.md`.

### B. Initial Mapping Workflow (Feature Reverse-Engineering)
When documenting a feature from scratch:

1. **Identify the feature folder**: Locate the actual feature folder in the Planless codebase by inspecting existing directories (e.g., `apps/app/src/features/<feature-name>/`).
2. **Inspect feature implementation**: Locate all components, screens, state stores, services, and utilities directly related to the feature.
3. **Inspect surrounding code & dependencies**: Inspect upstream callers, downstream side effects, cross-feature contracts, and shared components.
4. **Consult supporting context**: Read relevant Planless context (e.g. `Projects/Planless/context/`) and existing feature docs as background context when useful. Remember that the context directory is purely supporting reference, NOT the destination for feature documentation.
5. **Consult Supabase skill**: If Supabase is involved, locate and read the existing Supabase skill before documenting database behavior.
6. **Connect via existing Composio/MCP**: Use the Supabase skill's available tools through the existing Composio/MCP connection.
7. **Identify project environment**: Identify the actual Supabase project/environment used by the application.
8. **Inspect relevant database objects**: Trace from the feature code to inspect only the database objects that directly affect the feature.
9. **Compare code vs database**: Compare the database structure and behavior with how the application code uses it, verifying actual definitions.
10. **Detect mismatches**: Flag any discrepancies between code assumptions and live database behavior for the Known Issues section.
11. **Document findings inside the feature folder**: Create or update the documentation file inside that feature's own folder in the codebase (`<feature-folder>/<feature-name>.md`), using the feature name as the filename and following the standard 11-section structure. Document only the database objects that actually affect the feature.
12. **Eliminate duplication**: Review the document to ensure each fact lives in its authoritative section without redundancy.

Do not stop at the main screen or component. Follow the feature until its important dependencies and database objects are understood.

---

## Supabase & Database Investigation

For a feature using Supabase, inspect the relevant database objects. Do not inspect or document the entire database unnecessarily.

### Database Objects to Inspect
Trace outward from the feature's code to inspect relevant:
* Tables
* Columns and data types
* Primary keys
* Foreign keys
* Relationships and constraints
* Enums
* Views
* RPCs / PostgreSQL functions
* Triggers
* Row Level Security (RLS) policies
* Edge Functions
* Relevant indexes or constraints
* Other database objects that directly affect the feature

### Follow Relationship Chains
Trace dependencies from the feature's code to the relevant database objects:

```text
Frontend component
  → hook / service
  → Supabase query / RPC
  → table / function
  → related tables
  → RLS / trigger / constraint
```

Trace this chain far enough to understand the feature's actual behavior.

### Code vs Database Verification
Do not assume that the frontend code accurately describes the database. Verify important claims against actual Supabase schema and database definitions:
* If the code uses `supabase.from("plan_participants")`, inspect the actual `plan_participants` table schema and constraints.
* If the code calls `supabase.rpc("leave_plan")`, inspect the actual `leave_plan` function definition.
* If a database trigger affects the result of a mutation, inspect that trigger's definition and logic.
* If RLS can affect query results or mutation permissions, inspect the relevant RLS policy expressions.

### Tool Usage & Connection Rules
* **Use the existing Composio/MCP Supabase connection**:
  1. Read the existing Supabase skill.
  2. Follow the tool-selection and authentication instructions defined by that skill.
  3. Use the Supabase tools exposed through the existing Composio/MCP setup.
  4. Do not ask the user to provide Supabase credentials if the existing connection is already available.
  5. Do not create another integration when an existing connected tool can perform the task.
* **Handling Unavailable Tools**: If a required Supabase tool is unavailable, do not guess the database structure. Explicitly mark the relevant information as **unknown** and continue documenting the code that can be verified.

---

## Detect & Document Mismatches

Compare the application implementation with the actual Supabase database. Identify discrepancies such as:
* Code references a column that does not exist in the database.
* Database contains columns or required fields the feature does not use or handle.
* RPC parameters differ from the frontend call.
* RPC behavior differs from what the frontend assumes.
* Enum values differ from frontend assumptions or constants.
* Foreign-key relationships differ from frontend assumptions.
* RLS prevents or changes an operation.
* A trigger changes the result of a mutation.
* Database behavior conflicts with product documentation.

### Reporting Rules
* Document all discrepancies under **`## 10. Known Issues`**.
* **Do not fix the discrepancy** (Code Documentation only analyzes and documents).
* **Do not silently choose which version is correct.**
* **Clearly distinguish**:
  * What the code does
  * What the database does
  * What is unknown

---

## Documentation Rules

* The Code Documentation skill remains responsible for producing the final feature documentation.
* The Supabase skill is responsible for helping inspect and understand Supabase.
* **Do not copy the entire Supabase schema** into the feature document.
* Only include database information that helps another AI agent understand:
  * How the feature stores data
  * How the feature retrieves data
  * How the feature mutates data
  * What database rules affect the feature
  * What dependencies exist
  * What could break if the feature is modified
* Keep **Backend & Database** concise and lean.

---

## Section Purposes (Internal Reference)

Use this reference internally to ensure each section has a distinct purpose without overlap. **Never include this table in generated feature documentation files.**

| Section | Purpose |
|---|---|
| Overview | What the feature is |
| User Flow | What the user does |
| UI Documentation | What the UI looks like and how it visually behaves |
| Components | Where the implementation lives |
| Data Flow | How information moves |
| Backend & Database | What backend objects are involved |
| States & Rules | Authoritative behavior and rules |
| Dependencies & Change Impact | What the feature depends on and what may be affected if it changes |
| Important Files | Files an AI agent should inspect |
| Known Issues | Problems, inconsistencies, technical debt, or unclear behavior discovered during the review |
| Modification Notes | Things to verify before and after changing the feature |

---

## Documentation Structure

Generated feature files must start directly with `# Feature Documentation: <Feature Name>` followed by `## 1. Overview`. Never add a Section Purpose table or section to output files.

Structure:

# Feature Documentation: <Feature Name>

## 1. Overview
* What the feature does, its purpose, and where it fits in the product.

## 2. User Flow
* Step-by-step user actions and resulting system behavior.

## 3. UI Documentation
* Documents what the feature currently looks like and how it visually behaves based on the actual implementation.
* Before documenting the UI, inspect the relevant frontend implementation, including where applicable:
  * Screen/page components and child UI components
  * CSS, Tailwind classes, styling files, design-system files, and theme files
  * Typography and color definitions
  * Images, icons, and SVGs
  * Modals, bottom sheets, popovers, and overlays
  * Animations, transitions, and responsive layouts
* Include:
  * Overall screen layout and visual hierarchy
  * Major sections and their order, component placement
  * Important cards, buttons, inputs, and controls
  * Typography and text hierarchy
  * Colors and visual treatments (borders, shadows, gradients, blur)
  * Spacing and sizing when relevant
  * Images and icons
  * Loading, empty, error, and success states
  * Important animations and transitions
  * Responsive behavior
  * Visual changes caused by user interaction or state changes
* Rules & Boundaries:
  * Document the current implementation, not the intended design.
  * Do not guess visual properties; if a visual detail cannot be determined from the implementation, mark it as unknown rather than inventing it.
  * Do not copy large JSX, CSS, or Tailwind blocks. Summarize in plain English and reference relevant files.
  * Keep the section concise.
  * Do not duplicate information already documented in User Flow, Components, or States & Rules.

## 4. Components
* Key components, project-relative file paths, responsibilities, and relationships.

## 5. Data Flow
* How data moves through the feature:
  `UI → Logic → API/Supabase → Database → Response → UI`
  (Adapt to actual implementation).

## 6. Backend & Database
* Relevant tables, columns, RPCs, triggers, and RLS policies that directly affect the feature.
* Keep concise: document feature-specific roles without dumping whole schemas or repeating general business rules.

## 7. States & Rules
* The single authoritative location for feature behavior: UI states, RSVP/lifecycle state machines, business rules, capacity/filtering logic, permissions, and invariants.

## 8. Dependencies & Change Impact
* Actual upstream dependencies and downstream impact of changes. Explain relationships and consequences rather than restating the full behavior of those dependencies.

## 9. Important Files
* Key files an AI agent should inspect before modifying the feature, formatted with project-relative paths (e.g. `src/features/plans/state/PlansContext.tsx`).

## 10. Known Issues
* Bugs, inconsistencies, technical debt, or discrepancies between code, database definitions, and product specs discovered during review. Clearly distinguish: what code does, what database does, and what is unknown. Document them as issues; do not fix them.

## 11. Modification Notes
* Guidance on what an AI agent needs to check before and test after making a change. Focus on invariants and verification steps—do not repeat implementation details documented in earlier sections.

---

## Duplication Prevention

UI Documentation must have a distinct responsibility. Use these boundaries:
* **User Flow** → what the user does and what happens
* **UI Documentation** → what the user sees and how the interface visually behaves
* **Components** → where the UI is implemented and what each component is responsible for
* **States & Rules** → authoritative system states, business rules, permissions, and invariants
* **Modification Notes** → what to verify before and after making changes

Do not repeat the same information across these sections.

Before finalizing any feature documentation:
* Review the entire document for duplicated information across sections.
* Specifically check whether UI details have been unnecessarily repeated in Components, User Flow, States & Rules, or Modification Notes, and remove unnecessary duplication.
* Keep each fact in the section where it is most authoritative:
  * **States & Rules** is the authoritative location for state transitions, invariants, and business rules.
  * **Backend & Database** documents backend objects and their roles without restating business logic.
  * **Dependencies & Change Impact** explains connections and risks without detailing the dependent systems.
  * **Modification Notes** focuses strictly on pre-change checks and post-change testing without re-explaining the feature.
* Each important fact should appear only once.

---

## Formatting & File Paths

* **Project-Relative Paths**: Always use paths relative to the project root (e.g., `src/features/plans/state/PlansContext.tsx`). Never use machine-specific absolute paths.
* **Plain English for AI Agents**: Be concise. Use bullets and tables where useful. Do not copy large code blocks.
* **Document Current Implementation**: Document what the code and database actually do today, not what was intended. If product specs conflict with the code or database, document both as a known issue. Mark unknowns explicitly.

---

## Output Location & File Naming Rules

### Authoritative Destination
Store generated documentation directly inside the actual feature directory in the Planless codebase:

`<Planless project>/features/<feature-name>/<feature-name>.md`

In the Planless codebase, this path is located under:
`apps/app/src/features/<feature-name>/<feature-name>.md`
(e.g., `apps/app/src/features/home/home.md`, `apps/app/src/features/plans/plans.md`, `apps/app/src/features/friendships/friendships.md`).

### Critical Rules:
1. **Colocated With Code**: Feature documentation MUST live directly inside the feature's actual folder in the codebase alongside its components, state, and services.
2. **Filename Must Match Feature Name**: The filename must strictly be `<feature-name>.md` (e.g., `friendships.md`, `home.md`, `plans.md`).
3. **DO NOT Store in Context**: Documentation must **NOT** be stored inside `Projects/Planless/context/features/` or any subfolder of `context/`.
4. **NO Duplicate Copies**: Never create a second copy of feature documentation inside `context/`.
5. **Context vs Feature Documentation Distinction**:
   - **Planless Context** (`Projects/Planless/context/`): Contains overarching project-level architecture, business rules, and shared operating context. It serves as background reference only.
   - **Feature Documentation** (`<feature-folder>/<feature-name>.md`): Technical implementation maps authored by this skill, belonging exclusively inside their respective feature folders in the working application.

---

## Scope & Operational Boundaries

The Code Documentation skill only analyzes, inspects, and documents.
* It **does not** modify source code, refactor, or fix bugs.
* It **does not** modify database schema, execute destructive database operations, create/alter tables, RPCs, triggers, or RLS policies.
* It **does not** create new Supabase integrations, API keys, or MCP configs.

Its operational role is:
`Codebase → Identify relevant Supabase dependencies → Supabase Skill → Composio/MCP → Inspect actual database → Verify → Document.`

---

## Completion Requirements

The Code Documentation review should not be considered complete until the important UI implementation has been inspected where applicable, and for a Supabase-backed feature until:
* [ ] The feature's UI structure and important visual behavior have been inspected and documented.
* [ ] The relevant Supabase skill has been located and read.
* [ ] The relevant database structure has been inspected where tools allow.
* [ ] Code/database relationships and dependency chains have been traced.
* [ ] Important database behavior (RPCs, triggers, RLS, constraints) has been verified against actual definitions.
* [ ] Code/database mismatches have been identified and documented under Known Issues.
* [ ] The final feature documentation contains only the relevant database information (kept lean and concise).
* [ ] The final document has been checked for unnecessary duplication across sections.
* [ ] The documentation file is saved directly inside the feature's actual codebase folder (`apps/app/src/features/<feature-name>/<feature-name>.md`) and NOT in `context/`.
* [ ] For post-implementation synchronization: all changed behaviors, UI flows, components, props, and database contracts have been verified against the actual working code.
* [ ] All obsolete, contradictory, or superseded documentation has been completely purged (no changelogs or outdated historical behavior preserved).
* [ ] The entire `<feature-name>.md` document accurately reflects the current verified implementation.
