# Feature Documentation: Participants

> **CANONICAL BASELINE LINK:**  
> The complete state machine specification, transition matrix, and baseline freeze rules live in:  
> [docs/participants/PARTICIPANT_STATE_MACHINE.md](../../docs/participants/PARTICIPANT_STATE_MACHINE.md)

---

## 1. Overview

The **Participants** feature is Planless's core attendee orchestration and roster management engine. It governs how friends are invited, placed into attendance groups, ordered in waitlists, promoted upon vacancies, and managed across the entire plan lifecycle.

* **Core Function**: Delivers a dual-architecture participant system supporting two distinct waitlist models:
  1. **Automatic Waitlist (`AUTOMATIC`)**: First-come, first-served (FCFS) queue governed strictly by acceptance timestamp (`joined_queue_at ASC`). Drag-and-drop reordering is disabled. Vacancies trigger database triggers that automatically promote the earliest queued candidate.
  2. **Assigned Waitlist (`ASSIGNED`)**: Host-curated placement with manual drag-and-drop ordering via `waitlist_position` (1..N). Hosts manually assign attendees to `GOING` vs `WAITLIST`.
* **Product Role**: Operates in two distinct modes:
  1. `wizard` mode: Used during plan creation (`WhoIsActuallyComing.tsx` in `Create`) to establish initial capacity and initial group allocations.
  2. `editor` mode: Embedded directly into the plan chat header (`PlanChatScreen.tsx` Page 0), plan details modals (`PlansPreviewScreen.tsx`), and standalone participant sheets.
* **Scope & Boundaries**: Owns roster membership, role promotions/demotions (Host vs Participant), waitlist reordering, capacity adjustments, and leave/rejoin approvals. Does not create plans directly or calculate wallet splits, but synchronizes with `plans` and notifies `walletSyncService` when roster changes alter cost allocations.

---

## 2. User Flow

### 1. Initial Roster Setup During Plan Creation (`mode === 'wizard'`)
* Host selects friends from `WhoIsComingScreen` and progresses to `WhoIsActuallyComing`.
* `ParticipantManagementScreen` mounts with `mode = 'wizard'`.
* Host chooses the waitlist strategy via `WaitlistModeSelector`:
  * **Automatic Waitlist**: Host sets a plan size limit; attendees are seated strictly based on who accepts the invite first.
  * **Assigned Waitlist**: Host specifies plan size and manually selects which guests are seated in `GOING` and which are queued in `WAITLIST`.
* Host adjusts joined capacity (`plan_size`) using `PlanSizeCard` or `EditCapacityBottomSheet`.
* Host taps **Continue**, passing configured participant lists to the final review step (`CreatePlanReview.tsx`).

### 2. Viewing the Participant Roster (`mode === 'editor'`)
* Inside an active plan (via Tab 4 Chat Page 0 or Tab 2 Plan Details), the user opens the participants view.
* The screen displays the plan header, waitlist mode indicator, and segmented tabs:
  * **Going** / **Joined**: Displays active attendees who count against plan capacity (`actualJoinedCount / capacity`).
  * **Waitlist**: Displays participants queued for attendance. In Automatic mode, shows FCFS order; in Assigned mode, shows numbered positions (`#1`, `#2`, ...).
  * **Skipped**: Displays invited guests who declined, participants who left, or attendees who were removed/replaced.
  * **Pending Decisions**: Highlighted banner when a participant has submitted a leave request or a skipped user has requested to rejoin.

### 3. Host Managing Participants in Automatic Mode
* Host taps any participant row in `Going` or `Waitlist` to open `AutomaticWaitlistActions` bottom sheet:
  * **Promote to Host / Demote from Host**: Transfers administrative privileges.
  * **Remove Participant**: Marks user as `SKIPPED` with `skip_reason = 'REMOVED'`.
  * **Resolve Leave Request**: Tapping a participant who requested to leave directly opens the spot handling sheet (`RemoveGoingParticipantBottomSheet`) with immediate options to **Replace Participant** or **Remove Participant** (bypassing any intermediate "Wants to leave this plan" sheet).
  * **Resolve Rejoin Request**:
    * When available capacity exists or on No-Limit plans: Host re-admits participant via `Add to Plan` (moving them from `SKIPPED` to `JOINED` immediately without changing plan capacity).
    * When the plan is full (`actualJoinedCount >= capacity`): Tapping directly opens `PlanIsFullBottomSheet`, offering immediate choices to either **Increase Plan Size** or **Add to Waitlist** (bypassing the intermediate sheet).
* In Automatic mode, host *cannot* manually drag-and-drop waitlist positions or manually force-swap spots; vacancies trigger database triggers that automatically promote the earliest `joined_queue_at` candidate.

### 4. Host Managing Participants in Assigned Mode
* Host can drag and drop participants in the `Waitlist` tab to reorder priority. `onReorderWaitlistComplete` executes `reorder_waitlist` RPC, updating `waitlist_position` values in Postgres.
* Host taps a participant row to open `AssignedParticipantActions`:
  * Can manually move users between `Going` and `Waitlist`.
  * Can swap a joined participant with a waitlisted participant. The demoted participant inherits the exact `waitlist_position` of the promoted participant.
  * Can adjust capacity via the header Plan Size adjuster (`[ 👥 N ]`), opening `EditCapacityBottomSheet`.
  * **Resolve Rejoin Request**:
    * When available capacity exists: Tapping opens `AssignedParticipantActions` with "Add to Joined" (atomically increasing `plan_size + 1`) and "Cancel".
    * When the plan is full (`displayGoing.length >= effectiveCapacity`): Tapping directly opens `PlanIsFullBottomSheet` with immediate choices to **Increase Plan Size** (`resolve_rejoined_participant(..., 'JOINED')`, expanding `plan_size + 1`) or **Add to Waitlist** (`resolve_rejoined_participant(..., 'WAITLIST')`, leaving `plan_size` unchanged and appending to waitlist at `max_pos + 1`).

### 5. Inviting Additional Participants
* Host (or attendee, if `allow_participant_invites` is true) taps the floating orange action button (`UserPlus` icon).
* In Automatic mode: newly added friends are dispatched with `assigned_group = NULL` and `rsvp_status = 'INVITED'`.
* In Assigned mode:
  * When invited by host: host specifies `assigned_group` (defaults to `'GOING'`).
  * When invited by non-host via shared link: claimant is placed into `assigned_group = 'WAITLIST'` with sequential `waitlist_position = max_pos + 1` and `rsvp_status = 'INVITED'`.

---

## 3. UI Documentation

### Screen Container & Layout Hierarchy
* **Container**: Dark full-height container (`bg-[#000000] text-white flex-1 flex flex-col h-full relative font-sans select-none`).
* **Standalone Header (`ParticipantHeader`)**:
  * Pinned top bar with back chevron (`ArrowLeft`), centered plan title and date/time subtitle, trailing activity log button, and **Plan Size adjuster** button (`#header_plan_size_btn`).
  * **Plan Size Adjuster**: Rendered for active hosts in both Automatic and Assigned modes. Displays the `Users` icon and current numerical capacity (e.g. `[ 👥 4 ]`). Tapping opens `EditCapacityBottomSheet` allowing the host to increase or decrease the plan size.
  * In embedded chat pager mode, `ParticipantHeader` is suppressed in favor of the floating `HeroHeader`.

### Waitlist Mode Selector (`WaitlistModeSelector`)
* **Visual Card**: Rounded container (`bg-zinc-900/80 border border-white/[0.08] px-4 py-3 mx-5 my-2 rounded-2xl flex items-center justify-between cursor-pointer hover:border-white/20 transition-all`).
* **Left Column**:
  * Title: "Waitlist Mode" in semibold white (`text-sm font-semibold text-white`).
  * Subtitle: Dynamic contextual summary explaining how capacity applies:
    * Automatic: *"The first X people will join, and the remaining Y people will be waitlisted."*
    * Assigned: *"You choose who joins and who is waitlisted."*
* **Right Column**: Dropdown trigger displaying active mode badge ("Automatic" or "Assigned") with `ChevronDown` indicator.
* **Dropdown Menu**: Animated popover sheet (`AnimatePresence`, `motion.div`) allowing the host to toggle modes. Displays checkmark on the active option.

### Plan Capacity Controls (`PlanSizeCard` & `EditCapacityBottomSheet`)
* **PlanSizeCard**:
  * Collapsed state: Row displaying "Plan Size" label, current limit count (e.g. "8 spots"), and an inline "Edit" button.
  * Expanded inline editor: Embeds `PlanSizeSlider` with smooth drag slider, min/max limit notches, and immediate click-outside save listeners.
* **EditCapacityBottomSheet (`PlanSizeBottomsheet`)**: Modal bottom sheet invoked from the header Plan Size adjuster (`#header_plan_size_btn`) in both creation wizard and active plan editor modes. Enters edit mode immediately upon opening. Features stepper controls (`-` and `+`) with live numerical readout, and an `Add Participants` shortcut when capacity reaches the active invite limit. In Automatic mode (`isAutomatic={true}`), projected attendance is dynamically calculated directly from plan capacity and invited participants (`going = plan_size`, `waitlisted = invited_count - plan_size`), allowing expansion up to 50 for prospective joiners. Closing the sheet automatically commits changes if capacity was altered. If capacity increases when waitlisted candidates exist, closing triggers `GuidedCapacityAdjustmentBottomSheet` for host-guided candidate selection. In Assigned mode, plan size is capped and cannot exceed active invited participants (`Going + Waitlist + Invited`, excluding skipped).

### Segmented Participant Tabs (`AutomaticParticipantTabs` / `AssignedParticipantTabs`)
* **Pill Navigation Bar**: Horizontal segmented container (`px-5 py-2 flex items-center gap-2 border-b border-white/[0.06]`).
* **Tab Badges**:
  * **Going / Joined**: Shows count formatted against capacity (e.g. `Going (6/8)` or `Joined (6)`).
  * **Waitlist**: Shows queued count (e.g. `Waitlist (3)`). Only visible if waitlist count > 0 or in editor mode.
  * **Skipped**: Shows inactive count (e.g. `Skipped (2)`). Suppressed in wizard mode.
* **Active Tab Indicator**: Bright white active text with bold pill highlight (`bg-white/10 text-white rounded-full px-3 py-1.5 text-xs font-medium`). Inactive tabs render in muted zinc (`text-zinc-400 hover:text-zinc-200`).

### Participant Row (`StackingFriends`)
* **Row Geometry**: Full-width item (`px-1 py-2.5 flex items-center rounded-lg hover:bg-white/[0.04] transition-colors select-none`).
* **Leading Position Badge**:
  * In Assigned mode: Contiguous rank badge `#1`, `#2`, `#3`, etc. rendered for all waitlist members (`assigned_group === 'WAITLIST'`), including `INVITED` members.
  * In Automatic mode: Rendered strictly and exclusively for confirmed `WAITLISTED` participants. Invited members in the waitlist section never display numbers.
* **Avatar**:
  * 28x28px circular frame (`w-7 h-7 rounded-full border border-white/10 overflow-hidden bg-zinc-800 mr-3 flex-shrink-0`). Dims to `opacity-60` for `INVITED` and `SKIPPED`.
* **Identity & Role**:
  * Display name in semibold white (`text-[13px] font-semibold text-white truncate`).
  * Host indicator: Gold crown icon (`<Crown className="w-3.5 h-3.5 text-amber-400 ml-1.5" />`) next to the host's name.
* **Status Badges & Chips**:
  * Request Indicator (`!`): Amber indicator (`#F59E0B`, 14px bold) rendered next to the participant's name exclusively for active hosts when a leave request or rejoin request is pending.
  * Skip Reason: Muted text label (`text-[11px] text-zinc-500 ml-auto`) rendering "Left", "Removed", "Replaced", "Payment Kept", or "Declined".
* **Drag Handle (Assigned Mode Waitlist)**: Row becomes draggable (`cursor-grab active:cursor-grabbing`); dragged item dims to `opacity-25` with dashed border (`border-dashed border-white/20`).

### Participant Action Sheets (`AutomaticWaitlistActions` / `AssignedParticipantActions`)
* **Bottom Sheet Container**: Pinned bottom modal with backdrop scrim (`bg-black/80 backdrop-blur-md`).
* **Header**: Shows target user avatar, full name, and current role / RSVP status.
* **Action Buttons**:
  * Move to Going / Move to Waitlist (Assigned mode).
  * Promote to Host / Demote from Host.
  * View Profile (opens `FriendProfileViewerBottomSheet`).
  * Remove from Plan (destructive red styling `text-red-400 hover:bg-red-500/10`).

### Direct Spot-Handling Action Flow (Leave Requests)
* When an attendee has requested to leave (`leave_requested === true`), tapping their row directly opens `RemoveGoingParticipantBottomSheet`, bypassing intermediate sheets.
* Options presented: **Replace Participant**, **Remove Participant**, and **Cancel**.

### Floating Invite Button
* Absolute floating action button anchored in bottom-right corner (`absolute z-40 w-12 h-12 rounded-full bg-[#FF6B2C] text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 active:scale-95 transition-all`).
* Persistently mounted across tab transitions. Displays `UserPlus` icon (`w-5 h-5`). Hidden when plan is completed or in wizard mode.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `ParticipantManagementScreen` | `src/features/participants/screens/ParticipantManagementScreen.tsx` | Mode router component. Inspects `props.waitlistMode` and delegates rendering to either `AssignedParticipantScreen` or `AutomaticParticipantScreen`. | Consumed by `PlanParticipantManagementWrapper` and `WhoIsActuallyComing`. |
| `AutomaticParticipantScreen` | `src/features/participants/automatic/AutomaticParticipantScreen.tsx` | Renders roster for plans using first-come, first-served queuing. Disables drag-and-drop; partitions members via `partitionAutomaticParticipants`. | Renders `AutomaticParticipantTabs`, `GoingSection`, `WaitlistSection`, and `AutomaticWaitlistActions`. |
| `AssignedParticipantScreen` | `src/features/participants/assigned/AssignedParticipantScreen.tsx` | Renders roster for host-curated plans. Implements drag-and-drop reordering, draft participant persistence, and manual group swaps. | Renders `AssignedParticipantTabs`, `AssignedParticipantActions`, and uses `assignedCapacityLogic.ts`. |
| `WaitlistModeSelector` | `src/features/participants/shared/WaitlistModeSelector.tsx` | Dropdown control allowing hosts to switch between Automatic and Assigned waitlist modes. | Embedded in `AutomaticParticipantScreen` and `AssignedParticipantScreen`. |
| `PlanSizeCard` | `src/features/participants/shared/PlanSizeCard.tsx` | Interactive capacity management card with inline slider. | Used in participant screen headers. |
| `GoingSection` | `src/features/participants/components/GoingSection.tsx` | Renders list of confirmed attendees (`rsvp_status === 'JOINED'` or `assigned_group === 'GOING'`). | Maps items into `StackingFriends`. |
| `WaitlistSection` | `src/features/participants/components/WaitlistSection.tsx` | Renders list of waitlisted attendees. Manages drag-and-drop events in Assigned mode. | Maps items into `StackingFriends`. |
| `StackingFriends` | `src/features/participants/components/StackingFriends.tsx` | Unified participant row rendering avatar, name, host crown, waitlist rank, status chips, and action listeners. | Child component of `GoingSection`, `WaitlistSection`, and Skipped lists. |
| `AutomaticWaitlistActions` | `src/features/participants/automatic/AutomaticWaitlistActions.tsx` | Action sheet for managing participants in Automatic mode (removal, host toggle, leave/rejoin resolution). | Mounted inside `AutomaticParticipantScreen`. |
| `AssignedParticipantActions` | `src/features/participants/assigned/AssignedParticipantActions.tsx` | Action sheet for managing participants in Assigned mode (movement, swapping, removal, host toggle). | Mounted inside `AssignedParticipantScreen`. |
| `EditCapacityBottomSheet` | `src/features/plans/components/BottomSheets.tsx` | Standalone bottom sheet for adjusting plan capacity. | Triggered by header capacity chips. |

---

## 5. Data Flow

```text
[Host Adjusts Capacity or Switches Mode in Participants UI]
                         │
                         ▼
             [ParticipantManagementScreen]
              ├── Mode: Automatic ──► AutomaticParticipantScreen
              └── Mode: Assigned  ──► AssignedParticipantScreen
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
[Automatic Mutation]            [Assigned Mutation]
  • FCFS queue ordering           • Manual reorder / swap
  • Calls update_plan_capacity    • Calls reorder_waitlist RPC
         │                               │
         └───────────────┬───────────────┘
                         ▼
             [Supabase Database (Postgres)]
  ├── Triggers:
  │     ├── trg_enforce_invited_rsvp_immutable
  │     ├── trg_handle_switch_waitlist_mode
  │     ├── trg_maintain_joined_queue_at_trigger
  │     └── trg_auto_promote_on_vacancy_trigger
  ├── RPCs:
  │     ├── join_plan(p_plan_id)
  │     ├── claim_plan_invite(p_plan_id)
  │     ├── leave_plan(p_plan_id)
  │     ├── remove_participant(p_plan_id, p_target_user_id)
  │     ├── resolve_rejoined_participant(p_plan_id, p_target_user_id, p_decision)
  │     ├── auto_promote_waitlist_for_assigned(p_plan_id, p_vacated_group)
  │     └── auto_promote_waitlist_for_automatic(p_plan_id)
  └── Updates public.plan_participants & public.plans
                         │
                         ▼
        [Supabase Realtime Broadcast: plan_participants]
                         │
                         ▼
            [PlansContext Store Listener]
  ├── Receives Postgres change payload
  ├── Updates dbPlanParticipants state
  ├── Recalculates getHomeFeedPlans() and active roster
  └── Re-renders ParticipantManagementScreen with updated slots
```

---

## 6. Backend & Database

### 1. Table: `public.plan_participants`
* Composite Primary Key: `(plan_id, user_id)`.
* Columns:
  * `plan_id` (`uuid`, FK `plans.id`)
  * `user_id` (`uuid`, FK `users.id`)
  * `role` (`participant_role`): `'HOST'` or `'PARTICIPANT'`.
  * `rsvp_status` (`rsvp_status`): `'INVITED'`, `'JOINED'`, `'WAITLISTED'`, `'SKIPPED'`, `'REJOINED'`.
  * `assigned_group` (`assigned_group_enum`, nullable): `'GOING'`, `'WAITLIST'`, or `NULL`.
  * `waitlist_position` (`integer`, nullable): Contiguous 1..N rank for Assigned mode waitlists. Enforced `NULL` for `JOINED` and `SKIPPED`.
  * `joined_queue_at` (`timestamptz`, nullable): FCFS queue timestamp for Automatic mode. Enforced `NULL` in Assigned mode.
  * `leave_requested` (`boolean`, default `false`): Flag for voluntary leave requests.
  * `leave_requested_at` (`timestamptz`, nullable): Timestamp of leave submission.
  * `skip_reason` (`skip_reason`, nullable): `'LEFT'`, `'REMOVED'`, `'REPLACED'`, `'PAYMENT_KEPT'`, `'SKIPPED'`.
  * `cost_per_participant` (`numeric`, default 0): Calculated cost share.
* Unique Constraints & Indexes:
  * `idx_uniq_plan_waitlist_position`: Unique partial B-tree index on `(plan_id, waitlist_position)` where `assigned_group = 'WAITLIST'`.
  * `idx_plan_participants_user_id`: B-tree index on `(user_id)`.

### 2. Table: `public.plans` (Participant Columns)
* `plan_size` (`integer`, nullable): Joined capacity (including hosts). `NULL` denotes No Limit (capped at 50).
* `invited_participants` (`integer`, not null): Count of active non-skipped members.
* `participant_filtering` (`participant_filtering_type`): `'AUTOMATIC'` or `'ASSIGNED'`.
* `allow_participant_invites` (`boolean`, default `false`): Non-host invitation toggle.

### 3. Canonical RPCs and Triggers
* See [docs/participants/PARTICIPANT_STATE_MACHINE.md](../../docs/participants/PARTICIPANT_STATE_MACHINE.md#6-database-and-code-dependencies-mapping) for complete function signatures and trigger mappings.

---

## 7. States & Rules

1. **RSVP Status Is Immutable Once An Invite Exists (`trg_enforce_invited_rsvp_immutable`)**:
   - Only the participant themselves can transition their RSVP status from `'INVITED'` to `'JOINED'` or `'WAITLISTED'`. Host actions, capacity edits, and mode switches can only alter `assigned_group`, never `rsvp_status`.
2. **Atomic Capacity in Assigned Rejoin Flow**:
   - In Assigned mode, when host chooses "Add to Joined", `plan_size` atomically increments by 1. When choosing "Add to Waitlist", `plan_size` remains unchanged and attendee receives `waitlist_position = max_pos + 1`.
3. **Automatic Mode Waitlist Numbering**:
   - Waitlist numbers (`#1..N`) are displayed strictly for confirmed `WAITLISTED` participants. Invited members in the waitlist section never display numbers.
4. **Host Protection & Non-Orphan Invariant**:
   - Every active plan must have at least one active Host (`role = 'HOST'`, `rsvp_status = 'JOINED'`). Sole host cannot leave without transferring host role first.
5. **Vacancy Auto-Promotion in Assigned Mode**:
   - Candidate #1 moves to `GOING`: if their status was `WAITLISTED`, they become `JOINED`; if their status was `INVITED`, their status remains `INVITED`.

---

## 8. Dependencies & Change Impact

* **Upstream**:
  * `ProfileContext` (`useProfileStore`): Authenticated user ID and profile metadata.
  * `PlansContext` (`usePlansStore`): Live `dbPlanParticipants` collection and dispatch mechanisms.
  * `Friendships`: Friend selection rosters.
* **Downstream**:
  * `Home Feed (`HomeScreen.tsx`)`: Renders plans where user is `INVITED` and `PARTICIPANT`. Confirming attendance moves plan from Home to Plans feed.
  * `Wallet (`WalletContext.tsx`)`: Recalculates cost shares (`cost_per_participant`) when roster membership changes.
  * `Plan Chat (`PlanChatScreen.tsx`)`: Database RLS gates messaging by active roster membership.

---

## 9. Important Files

* Canonical Documentation: `docs/participants/PARTICIPANT_STATE_MACHINE.md`
* Roster Router: `apps/app/src/features/participants/screens/ParticipantManagementScreen.tsx`
* Automatic Screen: `apps/app/src/features/participants/automatic/AutomaticParticipantScreen.tsx`
* Assigned Screen: `apps/app/src/features/participants/assigned/AssignedParticipantScreen.tsx`
* Central Mutation Hook: `apps/app/src/features/plans/hooks/usePlanParticipants.ts`
* Typed RPC Wrappers: `apps/app/src/features/plans/api/plans.ts`
* Status Helpers: `apps/app/lib/participantStatus.ts`
* Regression Suite: `apps/app/src/features/participants/__tests__/participantStateMachineTransitions.test.ts`

---

## 10. Modification Notes & Invariants

Always run the full participant test suite before declaring any task complete:
```bash
npx vitest run src/features/participants
npm run lint
```
Never modify participant business logic without checking both Automatic and Assigned modes and verifying the 7 governing rules in `docs/participants/PARTICIPANT_STATE_MACHINE.md`.
