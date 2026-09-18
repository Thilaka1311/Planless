# GEMINI.md — Planless Operating System

Read this file before working on the Planless codebase. It defines what Planless is, where its context lives, how Thilak prefers you to work, and the core engineering and product rules you must follow.

---

## 1. What Planless Is

* **Category**: Social planning and real-world coordination platform.
* **Core Idea**: Turn "we should do this" into an actual plan. Planless eliminates messy group chat coordination, bringing scheduling, RSVPs, capacity limits, expense splits, venue discovery, and memories into a structured **Plan**.
* **Core Promise**: *"Less planning. More doing."* The goal is to spend less time figuring out logistics online and more time experiencing things offline.
* **Primary User**: The **organizer inside a friend group**—the person who takes responsibility for asking who's coming, booking the venue, tracking attendance, and splitting costs.

---

## 2. Context Hierarchy — Read Before Any Task

Never rely on assumptions. Load and consult the relevant context files before making product, architectural, or implementation changes:

```text
Personal Operating System (~/Documents/OS/gemini/GEMINI.md)
   ↓
Planless Project Operating System (Projects/Planless/GEMINI.md)
   ↓
Planless Shared Context (Projects/Planless/context/)
   ├── product.md                 # Core loop, Plan/Circle objects, non-goals
   ├── ideal-customer-profile.md  # The organizer persona, pains, viral adoption loop
   ├── business.md                # Business model, monetization, two-sided network
   ├── offer.md                   # Value proposition, before/after transformation
   └── values.md                  # Decision filters (Real Life Over Screens, Simplicity)
   ↓
Feature-Level Implementation Context (Projects/Planless/context/features/)
   ├── GEMINI.md                  # Operating rules for feature documentation
   └── <feature>.md               # Technical maps (home, plans, create, profile,
                                  # chats, participants, wallet, discovery,
                                  # completion, auth, admin, invite_link)
   ↓
Working Codebase (apps/app/src/ & supabase/)
```

* **For Feature Modifications**: Read `context/features/<feature>.md` first. It maps the current verified implementation (screens, components, data flows, Supabase tables, RPCs, states, and known issues).
* **For Product or Workflow Decisions**: Check `context/product.md`, `context/ideal-customer-profile.md`, and `context/values.md` to ensure changes align with product principles.

---

## 3. How Thilak Likes to Work

* **Plan First**: For anything beyond a trivial fix, outline the approach and explain tradeoffs before writing code. Break large tasks into clear phases.
* **Show, Don't Assume**: Never claim something works without verifying it. Test the actual affected flow in code and database, then explain what changed and how it was verified.
* **Keep Thilak in Control**: Thilak is a product builder and non-technical founder. Explain technical concepts in plain English without unnecessary jargon. Make product implications clear before implementing.
* **Build on What Already Exists**: Inspect existing components, animations, database schemas, hooks, and UI flows before creating new ones. Do not reinvent existing functionality.
* **Smallest Effective Diff**: Make focused changes that solve the problem. A feature request is not an excuse to refactor surrounding code unless strictly necessary.
* **Think Like a Product Builder**: Prioritize the actual user experience over technical complexity. Filter every change through: *"Does this make it easier for people to actually do something?"*
* **Flag Uncertainties Early**: When something is ambiguous, don't silently guess. Identify the uncertainty and present clear options with tradeoffs.

---

## 4. Engineering & Implementation Rules

* **Existing Product is Source of Truth**: Document and code against the actual working implementation, not an imagined or future design.
* **Database Source of Truth**: Supabase PostgreSQL is the authoritative backend. Internal joins, foreign keys, and mutations must strictly use PostgreSQL UUIDs (`id` / `dbUuid`). Short text IDs (`P000001`, `@username`) are reserved for public URLs, display, and search.
* **UI & Design Aesthetics**: Planless uses a curated dark aesthetic (`#000000` / `#050505`), custom typography (Inter, Outfit, Grand Hotel), micro-animations, glassmorphic badges, and Indian Rupee (`₹`) currency formatting. Never introduce generic placeholders, default browser styling, or unstyled controls.
* **State Machine Integrity**: Respect established lifecycle state machines (Plan: `LIVE` → `OVERDUE` → `COMPLETED` / `CANCELLED`; Participant: `INVITED`, `JOINED`, `WAITLISTED`, `SKIPPED`, `REJOINED`). UI state is never authoritative over the database.
* **Keep Documentation Synchronized**: When code changes materially alter components, data flows, database schemas, or business rules, update the corresponding file in `context/features/`.

---

## 5. Memory — Persistent Learned Rules

Your project memory lives in `MEMORY.md`. It stores durable lessons, corrections, and implementation invariants learned across Planless sessions:

@MEMORY.md

When Thilak corrects an approach or an implementation detail, record the lesson into `MEMORY.md` as a permanent rule. Check it before every task.
