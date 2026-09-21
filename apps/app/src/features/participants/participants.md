# Feature Documentation: Participants

## 1. Overview

The **Participants** feature is Planless's core attendee orchestration and roster management engine. It governs how friends are invited, placed into attendance groups, ordered in waitlists, promoted upon vacancies, and managed across the entire plan lifecycle.

* **Core Function**: Delivers a dual-architecture participant system supporting two distinct waitlist models: **Automatic Waitlist** (first-come, first-served queue governed strictly by acceptance timestamp `joined_queue_at`) and **Assigned Waitlist** (host-curated placement with manual drag-and-drop ordering via `waitlist_position`).
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
  * **Automatic Waitlist**: Host sets a plan size limit; the system will seat attendees strictly based on who accepts the invite first.
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
  * **Resolve Leave Request**: Host can replace the leaving user with a waitlist candidate (`REPLACED`) or keep their payment (`PAYMENT_KEPT`).
  * **Resolve Rejoin Request**: Host can re-admit the participant to `JOINED` or `WAITLIST`, or reject and remove them.
* In Automatic mode, host *cannot* manually drag-and-drop waitlist positions or manually force-swap spots; vacancies trigger database triggers that automatically promote the earliest `joined_queue_at` candidate.

### 4. Host Managing Participants in Assigned Mode
* Host can drag and drop participants in the `Waitlist` tab to reorder priority. `onReorderWaitlistComplete` updates `waitlist_position` values in Postgres.
* Host taps a participant row to open `AssignedParticipantActions`:
  * Can manually move users between `Going` and `Waitlist`.
  * Can swap a joined participant with a waitlisted participant. The participant moved from Joined → Waitlist inherits the exact `waitlist_position` of the participant who moved from Waitlist → Joined (e.g. swapping with #2 gives the demoted participant #2, without appending to the end or recalculating independent order).
  * Can adjust capacity via the header Plan Size adjuster (`[ 👥 N ]`), opening `EditCapacityBottomSheet`. If capacity is increased and waitlisted guests exist, the host selects which candidates move to Joined (`GuidedCapacityAdjustmentBottomSheet`), rather than automatic promotion. If capacity is decreased below joined count, the host selects which joined members move to the waitlist.

### 5. Inviting Additional Participants
* Host (or attendee, if `allow_participant_invites` is true) taps the floating orange action button (`UserPlus` icon).
* Opens friend selection sheet; newly added friends are dispatched via `addParticipantsToPlan` with the appropriate `assigned_group`.

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
* **EditCapacityBottomSheet (`PlanSizeBottomsheet`)**: Modal bottom sheet invoked from the header Plan Size adjuster (`#header_plan_size_btn`) in both creation wizard and active plan editor modes. Enters edit mode immediately upon opening. Features stepper controls (`-` and `+`) with live numerical readout, and an `Add Participants` shortcut when capacity reaches the active invite limit. In Automatic mode (`isAutomatic={true}`), the summary line dynamically calculates projected attendance directly from the selected plan capacity and total invited participants (`going = plan_size`, `waitlisted = invited_count - plan_size`, formatted as `X going • Y waitlisted`), rather than actual live RSVP states. The `Done` button has been removed: hosts make adjustments freely, and closing the sheet (via backdrop tap, swipe-down gesture, or drag handle tap) automatically commits the changes if the capacity was altered. If capacity increases when waitlisted candidates exist, closing the sheet triggers `GuidedCapacityAdjustmentBottomSheet` for host-guided selection of candidates moving from Waitlist to Joined (featuring a clean, left-aligned title header, dynamic CTA showing the count of participants still needed e.g. `Select 2 participants` / `Select 1 participant` transitioning to `Move to Join` or `Move to Waitlist` when complete, candidate list styling and checkmark indicators aligned with `FriendsSelector`, where tapping beyond the limit automatically replaces the most recently selected participant with the newly tapped candidate). The plan size is strictly capped and cannot exceed the count of active invited participants (`Going + Waitlist + Invited`, excluding skipped).

### Segmented Participant Tabs (`AutomaticParticipantTabs` / `AssignedParticipantTabs`)
* **Pill Navigation Bar**: Horizontal segmented container (`px-5 py-2 flex items-center gap-2 border-b border-white/[0.06]`).
* **Tab Badges**:
  * **Going / Joined**: Shows count formatted against capacity (e.g. `Going (6/8)` or `Joined (6)`).
  * **Waitlist**: Shows queued count (e.g. `Waitlist (3)`). Only visible if waitlist count > 0 or in editor mode.
  * **Skipped**: Shows inactive count (e.g. `Skipped (2)`). Suppressed in wizard mode.
* **Active Tab Indicator**: Bright white active text with bold bottom border or pill highlight (`bg-white/10 text-white rounded-full px-3 py-1.5 text-xs font-medium`). Inactive tabs render in muted zinc (`text-zinc-400 hover:text-zinc-200`).

### Participant Row (`StackingFriends`)
* **Row Geometry**: Full-width item (`px-1 py-2.5 flex items-center rounded-lg hover:bg-white/[0.04] transition-colors select-none`).
* **Leading Position Badge**:
  * Rendered when `showIndex` is active. Displays `#1`, `#2`, etc. in monospace font (`text-xs font-mono text-zinc-500 w-7 flex-shrink-0`).
* **Avatar**:
  * 28x28px circular frame (`w-7 h-7 rounded-full border border-white/10 overflow-hidden bg-zinc-800 mr-3 flex-shrink-0`).
  * If user is unaccepted (`INVITED`) or `SKIPPED`, avatar dims to `opacity-60`.
* **Identity & Role**:
  * Display name in semibold white (`text-[13px] font-semibold text-white truncate`).
  * Host indicator: Gold crown icon (`<Crown className="w-3.5 h-3.5 text-amber-400 ml-1.5" />`) next to the host's name.
* **Status Badges & Chips**:
  * Request Indicator (`!`): An amber indicator (`#F59E0B`, 14px bold) rendered next to the participant's name exclusively when viewed by the plan host (`isHost === true`) if the participant has a pending leave or rejoin request. Non-host participants never see this indicator, and the inline participant toggle (`InlineParticipantView`) never renders it under any circumstances.
  * Skip Reason: Muted text label (`text-[11px] text-zinc-500 ml-auto`) rendering "Left", "Removed", or "Declined".
* **Drag Handle (Assigned Mode Waitlist)**: Row becomes draggable (`cursor-grab active:cursor-grabbing`); dragged item dims to `opacity-25` with dashed border (`border-dashed border-white/20`).

### Participant Action Sheets (`AutomaticWaitlistActions` / `AssignedParticipantActions`)
* **Bottom Sheet Container**: Pinned bottom modal with backdrop scrim (`bg-black/80 backdrop-blur-md`).
* **Header**: Shows target user avatar, full name, and current role / RSVP status.
* **Action Buttons**: Vertical stack of high-contrast action rows:
  * Move to Going / Move to Waitlist (Assigned mode).
  * Promote to Host / Demote from Host.
  * View Profile (opens `FriendProfileViewerBottomSheet`).
  * Remove from Plan (destructive red styling `text-red-400 hover:bg-red-500/10`).

### Cost-Splitting / Plan Fee Modal (`showUpdatePlanFeeModal`)
* **Visual Hierarchy**: Matches the `CancelPlanBottomSheet` ("Manage this plan") bottom-sheet layout:
  * Top centered drag handle (`w-9 h-1 rounded-full bg-white/20`).
  * Plan Identity Header: 44x44px circular plan avatar (`DiscoveryImages`), plan title (`text-[15px] font-semibold text-white`), and subtitle `"Update the cost"` (`text-[12px] text-zinc-400`).
  * Action options: "Split the total" and "Keep cost per person", followed by "Cancel".

### Floating Invite Button
* Absolute floating action button anchored in bottom-right corner (`absolute z-40 w-12 h-12 rounded-full bg-[#FF6B2C] text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 active:scale-95 transition-all`).
* Remains persistently mounted on the Participants screen across tab transitions (sliding seamlessly with the horizontal pager).
* Displays `UserPlus` icon (`w-5 h-5`). Hidden when plan is completed or in wizard mode.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `ParticipantManagementScreen` | `src/features/participants/screens/ParticipantManagementScreen.tsx` | Mode router component. Inspects `props.waitlistMode` and delegates rendering to either `AssignedParticipantScreen` or `AutomaticParticipantScreen`. | Consumed by `PlanParticipantManagementWrapper` and `WhoIsActuallyComing`. |
| `AutomaticParticipantScreen` | `src/features/participants/automatic/AutomaticParticipantScreen.tsx` | Renders roster for plans using first-come, first-served queuing. Disables drag-and-drop; partitions members via `partitionAutomaticParticipants`. | Renders `AutomaticParticipantTabs`, `GoingSection`, `WaitlistSection`, and `AutomaticWaitlistActions`. |
| `AssignedParticipantScreen` | `src/features/participants/assigned/AssignedParticipantScreen.tsx` | Renders roster for host-curated plans. Implements drag-and-drop reordering, draft participant persistence, and manual group swaps. | Renders `AssignedParticipantTabs`, `AssignedParticipantActions`, and uses `assignedCapacityLogic.ts`. |
| `WaitlistModeSelector` | `src/features/participants/shared/WaitlistModeSelector.tsx` | Dropdown control allowing hosts to switch between Automatic and Assigned waitlist modes, providing explanatory copy based on capacity. | Embedded in `AutomaticParticipantScreen` and `AssignedParticipantScreen`. |
| `PlanSizeCard` | `src/features/participants/shared/PlanSizeCard.tsx` | Interactive capacity management card with inline slider for editing joined attendee limits. | Used in participant screen headers. |
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
  • Calls update_plan_capacity    • Calls reorderWaitlist RPC
         │                               │
         └───────────────┬───────────────┘
                         ▼
             [Supabase Database (Postgres)]
  ├── Triggers:
  │     ├── trg_auto_promote_on_vacancy_trigger
  │     ├── trg_maintain_joined_queue_at_trigger
  │     └── trg_enforce_waitlist_position_invariant_trigger
  ├── RPCs:
  │     ├── update_plan_capacity(p_plan_id, p_max_participants)
  │     ├── remove_participant(p_plan_id, p_target_user_id)
  │     └── resolve_rejoined_participant(...)
  └── Updates public.plan_participants
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

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.plan_participants`
* **Role in Feature**: Authoritative roster linking users to plans with RSVP and queue metadata.
* **Columns**:
  * `plan_id` (`uuid`, PK, FK `plans.id`): Target plan.
  * `user_id` (`uuid`, PK, FK `users.id`): Member user.
  * `role` (`participant_role`, default `'PARTICIPANT'`): `'HOST'` or `'PARTICIPANT'`.
  * `rsvp_status` (`participant_status`, default `'INVITED'`): `'INVITED'`, `'JOINED'`, `'WAITLISTED'`, `'SKIPPED'`, `'REJOINED'`.
  * `assigned_group` (`text`, nullable): Used in Assigned mode (`'GOING'`, `'WAITLIST'`, or `NULL`).
  * `waitlist_position` (`integer`, nullable): Contiguous 1..N rank for Assigned mode waitlists. Enforced `NULL` for `JOINED` and `SKIPPED`.
  * `joined_queue_at` (`timestamptz`, nullable): FCFS queue timestamp for Automatic mode. Enforced `NULL` in Assigned mode.
  * `leave_requested` (`boolean`, default `false`): Flag for voluntary leave requests.
  * `leave_requested_at` (`timestamptz`, nullable): Timestamp of leave submission.
  * `skip_reason` (`skip_reason`, nullable): `'LEFT'`, `'REMOVED'`, `'REPLACED'`, `'PAYMENT_KEPT'`, `'SKIPPED'`.
  * `cost_per_participant` (`numeric`, default 0): Member's calculated share of plan costs.

### 2. Table: `public.plans` (Participant-Related Columns)
* `plan_size` (`integer`, not null): Maximum confirmed joined capacity (including hosts).
* `max_participants` (`integer`, nullable): Upper bound for total invited guests.
* `participant_filtering` (`text`, default `'AUTOMATIC'`): `'AUTOMATIC'` or `'ASSIGNED'`.
* `waitlist_order_mode` (`text`, default `'AUTO'`): `'AUTO'` (timestamp-based) or `'CUSTOM'` (position-based).
* `allow_participant_invites` (`boolean`, default `false`): Enables non-hosts to invite friends.

### 3. Relevant RPC Functions
* `join_plan(p_plan_id uuid)`: Atomic transactional join RPC using row-level locking (`FOR UPDATE`) on `plans`. Determines available slots against `plan_size`, assigning `JOINED` or `WAITLISTED`. In Automatic mode, records queue order with `joined_queue_at = now()` and sets `assigned_group = NULL`. In Assigned mode, honors `'GOING'` pre-assignment if capacity allows, otherwise sets `assigned_group = 'WAITLIST'` with sequential `waitlist_position`.
* `claim_plan_invite(p_token text)`: Validates invite token, ensures caller has a valid profile, marks token claimed (if single-use), and calls `join_plan` to assign attendance slot atomically.
* `invite_participants(p_plan_id uuid, p_target_user_ids uuid[])`: Dispatches invites to friends with `rsvp_status = 'INVITED'`. Strictly decoupled from `plan_size` (inviting guests never inflates join capacity).
* `update_plan_capacity(p_plan_id uuid, p_plan_size int, p_auto_promote boolean DEFAULT true)`: Updates `plan_size`. When `p_auto_promote = true` (legacy/default), automatically promotes waitlisted guests if capacity expands, or demotes guests if capacity contracts. When invoked from the host-guided adjustment flow, `p_auto_promote = false` is passed to leave waitlist members untouched, allowing the application to explicitly promote only host-selected candidates via batch state mutation.
* `promote_to_host(p_plan_id uuid, p_target_user_id uuid)`: Sets `role = 'HOST'`.
* `demote_from_host(p_plan_id uuid, p_target_user_id uuid)`: Sets `role = 'PARTICIPANT'`.
* `remove_participant(p_plan_id uuid, p_target_user_id uuid)`: Soft-removes attendee by setting `rsvp_status = 'SKIPPED'` and `skip_reason = 'REMOVED'`. Strictly preserves `plan_size` without shrinking capacity.
* `resolve_rejoined_participant(p_plan_id uuid, p_target_user_id uuid, p_decision text)`: Resolves a rejoin request with `'JOINED'`, `'WAITLISTED'`, or `'REMOVE'`.
* `reorder_waitlist(p_plan_id uuid, p_ordered_uuids uuid[])`: Updates `waitlist_position` values sequentially for Assigned mode.

### 4. Database Triggers
* `trg_maintain_joined_queue_at_trigger`: Sets `joined_queue_at = now()` when a user enters `JOINED` or `WAITLISTED` in Automatic mode; resets to `NULL` in Assigned mode.
* `trg_auto_promote_on_vacancy_trigger`: Automatically promotes the earliest waitlisted participant when a spot opens up in Automatic mode.
* `trg_enforce_waitlist_position_invariant_trigger`: Validates that `waitlist_position` is non-null only for `WAITLISTED` participants.

---

## 7. States & Rules

### Waitlist Mode Invariants
* **Automatic Mode (`participant_filtering === 'AUTOMATIC'`)**:
  * Ordering is strictly determined by `joined_queue_at ASC`.
  * `assigned_group` must remain `NULL`.
  * Hosts cannot manually reorder or drag-and-drop waitlist positions.
  * Vacancies trigger automated promotions immediately via Postgres triggers.
* **Assigned Mode (`participant_filtering === 'ASSIGNED'`)**:
  * Ordering is strictly determined by `waitlist_position` (1..N).
  * `joined_queue_at` must remain `NULL`.
  * Host manually decides who is seated in `GOING` versus `WAITLIST`.
  * Host can drag-and-drop waitlist candidates to reorder priority.

### RSVP Status Lifecycle
* **`INVITED`**: User has received an invite but not acted on it. Does not occupy a spot in `plan_size`.
* **`JOINED`**: User has confirmed attendance and occupies 1 spot in `plan_size`.
* **`WAITLISTED`**: User accepted but capacity is full (Automatic) or host assigned them to waitlist (Assigned).
* **`SKIPPED`**: User declined, was removed, left, or was replaced. Requires valid `skip_reason`.
* **`REJOINED`**: Skipped user requested to return; frozen until host approves or rejects.

### Host Protection Rules
* Every plan must maintain at least one active Host (`role === 'HOST'`, `rsvp_status === 'JOINED'`).
* The sole active host cannot leave the plan or be removed without first promoting another participant to host.
* Hosts always occupy 1 spot in `plan_size`.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Supplies `activeUserId`, `userProfile`, and cached friend metadata (`dbUsers`).
* **`PlansContext` (`usePlansStore`)**: Supplies centralized participant records (`dbPlanParticipants`) and dispatches mutations.
* **`Friendships` (`src/features/friendships`)**: Supplies user friend lists for participant selection and profile views.

### Downstream Impact of Changes
* **Home Feed (`HomeScreen.tsx`)**: The Home feed only displays plans where the user is `role === 'PARTICIPANT'` and `rsvp_status === 'INVITED'`. Changing participant status to `JOINED` or `WAITLISTED` immediately moves the plan from Home to Plans.
* **Wallet & Settlements (`WalletContext.tsx`)**: Adding or removing participants, or resolving leave requests, triggers `walletSyncService` to recalculate individual cost shares (`cost_per_participant`).
* **Plan Chat (`PlanChatScreen.tsx`)**: Chat access is restricted to roster members by database RLS. Removing a participant immediately cuts off Realtime messaging and chat history access.

---

## 9. Important Files

* `src/features/participants/screens/ParticipantManagementScreen.tsx`: Top-level router selecting between Automatic and Assigned screens.
* `src/features/participants/automatic/AutomaticParticipantScreen.tsx`: Automatic waitlist screen implementation.
* `src/features/participants/assigned/AssignedParticipantScreen.tsx`: Assigned waitlist screen implementation with drag-and-drop.
* `src/features/participants/assigned/assignedCapacityLogic.ts`: Pure functions calculating group allocation and draft capacity persistence.
* `src/features/participants/shared/WaitlistModeSelector.tsx`: Dropdown component for switching between waitlist strategies.
* `src/features/participants/shared/PlanSizeCard.tsx`: Interactive capacity card with inline slider.
* `src/features/participants/components/StackingFriends.tsx`: Individual participant list row component.
* `src/features/participants/components/GoingSection.tsx`: Confirmed attendee section list.
* `src/features/participants/components/WaitlistSection.tsx`: Queued waitlist section list.
* `src/features/participants/automatic/AutomaticWaitlistActions.tsx`: Action sheet for automatic participant management.
* `src/features/participants/assigned/AssignedParticipantActions.tsx`: Action sheet for assigned participant management.
* `lib/participantStatus.ts`: Shared RSVP normalization and partition helpers (`partitionAutomaticParticipants`).

---

## 10. Known Issues

### 1. Hardcoded Fallback Capacities in UI Subcomponents
* **What Code Does**: `InlineParticipantView.tsx` and legacy helpers fall back to category-based capacities (`movies ? 10 : sports ? 14 : 8`) if `plan_size` is undefined, despite the database requiring an explicit integer.
* **What Database Does**: Table `plans` enforces `plan_size NOT NULL`.
* **What is Unknown**: Whether hardcoded category defaults will be removed in favor of strict database fallback constants.

### 2. Client-Side Draft Storage vs Realtime Conflict
* **What Code Does**: `AssignedParticipantScreen` writes draft allocations to `localStorage` via `saveDraftParticipants` during wizard mode. If an invitee responds via invite link while the host is editing drafts, the local draft can overwrite the live state upon plan creation.
* **What Database Does**: Database creates rows atomically during `create_plan_with_participants`.
* **What is Unknown**: Whether draft participant synchronization should query live invite tokens before committing.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Preserve Mode Separation**: Never mix `joined_queue_at` and `assigned_group`. Automatic mode must never write to `assigned_group`; Assigned mode must never write to `joined_queue_at`.
2. **Verify Last-Host Invariant**: Ensure any modification to removal or demotion logic checks that at least one host with `rsvp_status === 'JOINED'` remains on the plan.
3. **Trigger Compatibility**: When adding participant mutation RPCs, verify compatibility with `trg_auto_promote_on_vacancy_trigger` to prevent double-promotion race conditions.

### Post-Modification Verification Steps
1. **Automatic Mode Queue Round-Trip**:
   - Create an Automatic plan with `plan_size = 2`.
   - Have two participants accept: verify both are `JOINED`.
   - Have a third participant accept: verify they enter `WAITLISTED` with `joined_queue_at` set.
   - Host removes one joined participant: verify third participant is automatically promoted to `JOINED`.
2. **Assigned Mode Reordering**:
   - Create an Assigned plan with 3 waitlisted guests.
   - Drag guest #3 to position #1: verify `reorder_waitlist` executes and positions persist upon reload.
3. **Leave and Rejoin Resolution**:
   - Submit leave request from a participant: verify orange badge appears in host UI.
   - Resolve with replacement: verify replaced user transitions to `SKIPPED` with `skip_reason = 'REPLACED'`.
