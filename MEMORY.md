# MEMORY.md — Planless Learned Rules & Invariants

This file stores durable lessons, corrections, architectural invariants, and workflow preferences learned while building Planless. Consult this file before starting any task.

---

## 1. Database & Identifier Contracts

* **Lesson**: Code frequently intermixed short public alphanumeric IDs (e.g. `P000001`, `U001`) with internal UUIDs, causing foreign-key constraint failures and empty RLS queries.
* **Rule**: All database relationships, foreign keys, RPC parameters, and table mutations must strictly use PostgreSQL UUIDs (`id` / `dbUuid`). Short text IDs (`public_id`) are exclusively reserved for display, public URL sharing, and search matching.

---

## 2. Tab Boundaries: Home vs. Plans

* **Lesson**: Early implementations allowed hosted or confirmed plans to appear in the Home feed, blurring the boundary between incoming invitations and confirmed commitments.
* **Rule**: The Home feed (`HomeScreen.tsx`) is strictly reserved for unaccepted invitations (`role === 'PARTICIPANT'` and `rsvp_status === 'INVITED'`). Once a plan is accepted (`JOINED`), waitlisted (`WAITLISTED`), or hosted (`role === 'HOST'`), it must leave the Home feed completely and appear exclusively in the Plans tab.

---

## 3. Dual Waitlist Architecture

* **Lesson**: Mixing queue timestamps with manual position indices created race conditions where manual reorders were overwritten by automated database triggers.
* **Rule**: Maintain strict separation between waitlist modes:
  * **Automatic Waitlist**: Ordering is strictly First-Come, First-Served governed by `joined_queue_at ASC`. `assigned_group` must remain `NULL`. Never allow manual drag-and-drop reordering.
  * **Assigned Waitlist**: Ordering is strictly manual governed by `waitlist_position` (1..N). `joined_queue_at` must remain `NULL`. Host controls placement between `GOING` and `WAITLIST`.

---

## 4. Last-Host Protection

* **Lesson**: Allowing the sole host to leave or be removed without transfer orphaned plans, leaving them without an administrator.
* **Rule**: Every active plan must always have at least one active Host (`role === 'HOST'`, `rsvp_status === 'JOINED'`). The sole active host cannot leave, be removed, or demoted without first transferring host ownership to another confirmed participant.

---

## 5. Wallet Payer Self-Settlement

* **Lesson**: When expenses were logged, the payer's own split share was left open as an unpaid liability, causing the payer to appear indebted to themselves in bilateral netting.
* **Rule**: When creating or recalculating an expense, the payer's row in `wallet_expense_participants` must always be initialized with `is_paid = true` and `remaining_balance = 0`.

---

## 6. Supabase Tooling & Integration

* **Lesson**: Creating redundant MCP configurations or guessing database schemas caused configuration drift and migration errors.
* **Rule**: Always use the existing Composio/MCP connection and Supabase skill. Inspect live tables, RPC definitions, triggers, and RLS policies in `supabase/migrations/` before writing code or modifying backend calls.

---

## 7. Working with Thilak (Founder Preferences)

* **Lesson**: Over-explaining technical implementation details without highlighting product implications created friction.
* **Rule**:
  * Present the recommended option first, followed by clear tradeoffs in plain English.
  * Separate product decisions from implementation details; make product implications explicit before building.
  * Never claim a feature or fix works without verifying it in the running application or database.
  * Prefer the smallest effective code change; do not refactor surrounding code unless necessary.

---

## 8. First-Try Defect Isolation & Router Synchronization Invariants

* **Lesson**: When waitlist reordering was performed inside `PlanChatScreen`, the user was booted back to `ChatsScreen`. Previous attempts mistakenly diagnosed this as a local Framer Motion gesture conflict, missing that the reorder RPC updated `plans` in `PlansContext`, which triggered a route synchronization `useEffect` in `MainApp.tsx` that omitted `selectedChatPlanId` and called `navigateToRoute({ tab: 'chats' })`, resetting `selectedChatPlanId` to null and unmounting `PlanChatScreen`.
* **Rules**:
  1. **Router Synchronization Invariant**: In `MainApp.tsx` and any route synchronization effects, every active sub-route state (`selectedChatPlanId`, `selectedPlanId`) must be strictly preserved across store updates (`plans`, `profile`, `friendships`). Never default to bare root tab paths (`/chats`, `/plans`) when a child detail view is open.
  2. **4-Tier Action Lifecycle Tracing**: When an in-screen action causes an unexpected navigation or dismiss, trace the full stack before proposing a fix:
     - Tier 1: Local DOM gesture/pointer events and bubbling.
     - Tier 2: State mutations and API/RPC completions.
     - Tier 3: Global store subscribers and router synchronization `useEffect` hooks.
     - Tier 4: Root-level conditional rendering gates (`{selectedChatPlanId && <PlanChatScreen />}`).
  3. **Honor User Clues & File Tags Literally**: If the user tags `ChatsScreen.tsx` and says "it's going back to the main chat screen", investigate how `ChatsScreen` became visible (i.e. parent unmount) rather than assuming an internal component page flick.
  4. **Preserve Working Visuals**: When resolving behavioral regressions, never alter or replace an already working visual interaction/animation unless explicitly requested.

---

## 9. Efficient Safe Path for Small UI & Access Changes

* **Lesson**: When asked to make the Plan Size bottom sheet host-only, execution became unnecessarily slow and complex because investigation ballooned across every participant screen, container, and tab file instead of focusing on the directly relevant screen, its host detection, and its trigger. Furthermore, an extensive formal implementation plan artifact was produced for a simple UI condition check.
* **Rules**:
  1. **Classify by Complexity & Risk First**:
     - **Small / Isolated UI or Access Change** (e.g. disabling an action, hiding/disabling a button based on existing roles, guarding a modal):
       - Do **NOT** scan whole features, backend tables, or unrelated components.
       - Do **NOT** create a heavy multi-section implementation plan artifact unless architectural or database changes are involved.
  2. **Direct Investigation Chain**:
     - For role/access UI restrictions, strictly trace:
       $$\text{Target Screen} \longrightarrow \text{Existing Role/Host Flag} \longrightarrow \text{Trigger Element} \longrightarrow \text{Target Sheet/Modal Prop}$$
     - Reuse the existing role check (e.g. `isHost`, `effectiveIsHost`, `isHostUser`).
     - Stop investigation immediately once you have enough context to make the change safely.
  3. **Smallest Effective Diff & Local Verification**:
     - Apply the check directly to the trigger button (`disabled={!isHost}`, guard `onClick`) and guard the modal's `isOpen`.
     - Run `npm run lint` and verify actual behavior locally without side-tracking into surrounding code.

---

## 10. UI Mode Parity & Action Sheet Invariants

* **Lesson**: When asked to replicate the Assigned "Remove Participant" bottom sheet in Automatic participant management with the same 3 options ("Decrease Plan Size", "Replace Participant", "Cancel"), the agent retained an `if (activeInvitedAndJoinedCount === capacity)` branch. When tested on a full plan, this branch hijacked the sheet—changing its title to "Decrease Plan Size", altering the subtitle, hiding "Replace Participant", and rendering an unwanted destructive "Cancel Plan" button. This forced the user to repeat the request across multiple prompts with screenshots.
* **Rules**:
  1. **Strict UI Option & Flow Parity**: When asked to use the "exact same bottom sheet / modal with options X, Y, Z" from another flow/screen, treat the visual contract (avatar, title, subtitle, buttons) as an exact specification. Do NOT let hidden conditional branches or state math alter titles, hide requested action buttons, or change the flow unless explicitly instructed.
  2. **Audit Action Sheet Props & Fallbacks**: When reusing multi-purpose sheet components (e.g. `RemoveGoingParticipantBottomSheet`), audit every prop passed (`title`, `subtitle`, `onCancelPlan`, etc.). Do NOT pass destructive fallback handlers (like `onCancelPlan`) to an action sheet unless that destructive option was explicitly requested.
  3. **Verify Boundary & Real-World States**: Never assume a UI component renders correctly based only on one state. Check how it behaves under full capacity (`activeCount === capacity`), empty waitlists, and min capacity (`capacity === 2`) before declaring work complete.
  4. **Reference Screen as Ground Truth**: When the user provides a reference screenshot or mentions an existing screen/sheet as the source of truth, compare the rendered component directly against that reference to ensure identical options and layout.

---

## Adding New Learned Rules

When Thilak makes a correction or an architectural invariant is established, append it using this format:

```markdown
### [Category / Topic Name]
* **Lesson**: What happened or what was corrected.
* **Rule**: The concrete invariant or rule to follow in all future sessions.
```


