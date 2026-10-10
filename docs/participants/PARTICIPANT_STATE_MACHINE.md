# Planless Participant State Machine — Canonical Documentation & Baseline Freeze

> **AUTHORITATIVE BASELINE SPECIFICATION**  
> **Status:** FROZEN BASELINE & SOURCE OF TRUTH  
> **Last Verified:** October 10, 2026  
> **Target System:** Planless Attendee Management Engine (Frontend: React 19 + TypeScript / Backend: Supabase PostgreSQL)

---

## 1. Executive Summary & Baseline Freeze Declaration

This document establishes the canonical baseline for the **Planless Participant State Machine**. The working implementation in `Projects/Planless` is verified, fully tested, and frozen as the authoritative reference for all participant lifecycle operations.

### Scope of the State Machine
The participant state machine governs:
1. **Join Flows**: Free plans, paid plans, capacity-limited plans, No-Limit plans (up to the 50-participant system ceiling), invite link claims, and participant-shared invitations.
2. **Leave & Leave-Request Flows**: Free plan immediate departures, paid plan voluntary leave requests (`leave_requested = true`), waitlist departures, host leave approvals, direct participant removal, direct participant replacement, and host departure with replacement.
3. **Rejoin Flows**: Skipped attendees requesting to return (`REJOINED`), host resolution in Automatic mode, and host resolution in Assigned mode (atomic `plan_size + 1` increments for "Add to Joined" vs. sequential queue placement for "Add to Waitlist").
4. **Participant Management Modes**:
   - **Automatic Mode (`AUTOMATIC`)**: Pure first-come, first-served (FCFS) chronological queuing governed strictly by acceptance timestamp (`joined_queue_at ASC`). Drag-and-drop reordering is prohibited. Vacancies trigger automatic promotions via database triggers.
   - **Assigned Mode (`ASSIGNED`)**: Host-curated bucket assignment (`GOING` vs. `WAITLIST`). Waitlist priority is governed by explicit integer ranks (`waitlist_position` 1..N). Hosts manually reorder waitlists and execute controlled promotions.
5. **Orthogonal State Dimensions**: Strict physical and logical separation between attendance commitment (`rsvp_status`), bucket assignment (`assigned_group`), and administrative privileges (`role`).
6. **Host Ownership & Non-Orphan Invariants**: Every active plan enforces at least one active Host (`role = 'HOST'`, `rsvp_status = 'JOINED'`). The sole active host cannot leave or be demoted without transferring ownership.

---

## 2. Canonical State Model

Participant state is defined across orthogonal dimensions stored in `public.plan_participants` and governed by plan-level configuration in `public.plans`.

### A. Authoritative Fields & Database Enums

| Field | PostgreSQL Type | Allowed Values | Semantic Meaning & Governance |
|---|---|---|---|
| `rsvp_status` | `public.rsvp_status` (ENUM) | `'INVITED'`, `'JOINED'`, `'WAITLISTED'`, `'SKIPPED'`, `'REJOINED'` | **Attendance Commitment.** Represents the user's explicit response. Immutable by external actors when `'INVITED'`. Consumes a join spot strictly when `'JOINED'`. |
| `assigned_group` | `public.assigned_group_enum` (ENUM / NULL) | `'GOING'`, `'WAITLIST'`, `NULL` | **Bucket Placement.** Used exclusively in Assigned mode. Dictates whether the host allocated a spot in Going or Waitlist. Strictly `NULL` in Automatic mode. |
| `role` | `public.participant_role` (ENUM) | `'HOST'`, `'PARTICIPANT'` | **Administrative Authority.** Grants roster management, capacity editing, invite approvals, and plan settings access. |
| `skip_reason` | `public.skip_reason` (ENUM / NULL) | `'LEFT'`, `'REMOVED'`, `'REPLACED'`, `'PAYMENT_KEPT'`, `'SKIPPED'`, `NULL` | **Reason for Inactivity.** Non-null only when `rsvp_status = 'SKIPPED'`. Enforced `NULL` for active participants (`JOINED`, `WAITLISTED`, `INVITED`, `REJOINED`). |
| `waitlist_position` | `integer` (NULLable) | `1..N`, `NULL` | **Sequential Rank.** Contiguous 1..N integer index for waitlisted participants in Assigned mode. Unique per plan via partial index `idx_uniq_plan_waitlist_position`. Strictly `NULL` in Automatic mode database records. |
| `joined_queue_at` | `timestamptz` (NULLable) | ISO-8601 Timestamp, `NULL` | **Queue Timestamp.** First-come, first-served chronological timestamp for Automatic mode. Strictly `NULL` in Assigned mode database records. |
| `leave_requested` | `boolean` (NOT NULL) | `true`, `false` | **Voluntary Leave Flag.** Indicates an active, unresolved request to leave a paid plan. Reset to `false` upon cancellation, removal, or resolution. |
| `leave_requested_at`| `timestamptz` (NULLable) | ISO-8601 Timestamp, `NULL` | **Leave Request Timestamp.** Recorded when a paid plan attendee requests to leave. |

### B. Plan-Level Capacity & Mode Fields

| Field | PostgreSQL Type | Semantic Meaning & Business Rules |
|---|---|---|
| `plan_size` | `integer` (NULLable) | Maximum confirmed joined capacity (including hosts). `NULL` denotes **No Limit** (unbounded capacity, capped only by system ceiling of 50). |
| `participant_filtering` | `public.participant_filtering_type` | `'AUTOMATIC'` or `'ASSIGNED'`. Governs whether roster uses FCFS queue timestamps or manual host assignments. |
| `waitlist_order_mode` | `public.waitlist_order_mode_enum` | `'AUTO'` (timestamp-governed) or `'CUSTOM'` (position-governed). |
| `invited_participants` | `integer` (NOT NULL) | Total count of active, non-skipped participants (`rsvp_status != 'SKIPPED'`). Synchronized atomically by triggers and RPCs. |
| `allow_participant_invites` | `boolean` (NOT NULL) | When `true`, non-host attendees can invite friends or share join links. In Assigned mode, participants invited by non-hosts enter `assigned_group = 'WAITLIST'`. |

### C. Valid Field Combinations & Orthogonal Invariants

```text
               ┌────────────────────────────────────────────────────────┐
               │                   PARTICIPANT STATE                    │
               ├────────────────────────────┬───────────────────────────┤
               │   Attendance Commitment    │     Bucket Placement      │
               │       (rsvp_status)        │     (assigned_group)      │
               ├────────────────────────────┼───────────────────────────┤
               │ INVITED                    │ GOING, WAITLIST, or NULL  │
               │ JOINED                     │ GOING (or NULL if auto)   │
               │ WAITLISTED                 │ WAITLIST (or NULL if auto)│
               │ REJOINED                   │ NULL (awaiting decision)  │
               │ SKIPPED                    │ NULL (inactive)           │
               └────────────────────────────┴───────────────────────────┘
```

1. **RSVP Status Immutability Invariant (`trg_enforce_invited_rsvp_immutable`)**:
   - Once an invitation exists (`rsvp_status = 'INVITED'`), the host, mode changes, and capacity adjustments **cannot** force the participant into `'JOINED'` or `'WAITLISTED'`.
   - Only the invited participant themselves can transition their status to `'JOINED'` or `'WAITLISTED'` via their authenticated RSVP flow.
2. **Mutual Exclusion Between Ordering Strategies**:
   - **Automatic Mode**: `assigned_group = NULL`, `waitlist_position = NULL`, `joined_queue_at = timestamptz`.
   - **Assigned Mode**: `assigned_group IN ('GOING', 'WAITLIST')`, `joined_queue_at = NULL`, `waitlist_position = 1..N` (for `WAITLIST`).
3. **No-Vacant-Slots Capacity Invariant**:
   - In both Automatic and Assigned modes, if eligible waitlisted candidates exist and capacity opens in `GOING`, spots must be filled immediately.
   - In Automatic mode: Earliest `joined_queue_at ASC` is promoted to `JOINED`.
   - In Assigned mode: Position #1 (`waitlist_position = 1`) is moved to `GOING`. If their status was `WAITLISTED`, they become `JOINED`; if their status was `INVITED`, their status remains `INVITED`.
4. **Non-Orphan Host Invariant**:
   - Every active plan must have at least one participant with `role = 'HOST'` and `rsvp_status = 'JOINED'`.
   - The sole active host cannot leave the plan, demote themselves, or be removed without first promoting another confirmed attendee to host.

---

## 3. Comprehensive Transition Matrix

The table below defines every supported transition across Automatic and Assigned modes.

| User / System Action | Management Mode | Previous State (`rsvp`, `group`, `role`) | Resulting `rsvp_status` | Resulting `assigned_group` | Count & Capacity Effect | Waitlist Effect | Authoritative RPC / DB Operation |
|---|---|---|---|---|---|---|---|
| **Join Plan** (spots available) | `AUTOMATIC` | `INVITED`, `NULL`, `PARTICIPANT` | `JOINED` | `NULL` | Joined count increments by 1. | None. Sets `joined_queue_at = now()`. | `public.join_plan` |
| **Join Plan** (spots available) | `ASSIGNED` | `INVITED`, `'GOING'`, `PARTICIPANT` | `JOINED` | `'GOING'` | Joined count increments by 1. Plan size unchanged. | None. Position remains `NULL`. | `public.join_plan` |
| **Join Plan** (spots available) | `ASSIGNED` (New user via link) | New record | `JOINED` | `'GOING'` | Joined count increments by 1. `invited_participants + 1`. | None. Position is `NULL`. | `public.join_plan` |
| **Join Plan** (plan full) | `AUTOMATIC` | `INVITED`, `NULL`, `PARTICIPANT` | `WAITLISTED` | `NULL` | Joined count unchanged. | Enters FCFS queue at `joined_queue_at = now()`. | `public.join_plan` |
| **Join Plan** (plan full) | `ASSIGNED` | `INVITED`, `'WAITLIST'`, `PARTICIPANT` | `WAITLISTED` | `'WAITLIST'` | Joined count unchanged. | Preserves existing `waitlist_position`. | `public.join_plan` |
| **Join Plan** (plan full) | `ASSIGNED` (New user via link) | New record | `WAITLISTED` | `'WAITLIST'` | Joined count unchanged. `invited_participants + 1`. | Appended to waitlist at `max_pos + 1`. | `public.join_plan` |
| **Join Plan** (No-Limit) | `AUTOMATIC` / `ASSIGNED` | `INVITED` or New record | `JOINED` | `NULL` | Joined count increments by 1. | No waitlist. Direct admission up to 50 cap. | `public.join_plan` |
| **Claim Plan Invite** (Non-host link) | `ASSIGNED` (`allow_participant_invites = true`) | New record | `INVITED` | `'WAITLIST'` | Joined count unchanged. `invited_participants + 1`. | Assigned next contiguous `waitlist_position = max_pos + 1`. | `public.claim_plan_invite` |
| **Claim Plan Invite** (Non-host link) | `AUTOMATIC` | New record | `INVITED` | `NULL` | Joined count unchanged. `invited_participants + 1`. | Unnumbered invited member. | `public.claim_plan_invite` |
| **Leave Plan** (Free plan participant) | Any | `JOINED`, any, `PARTICIPANT` | `SKIPPED` (`skip_reason = 'LEFT'`) | `NULL` | Joined count decrements by 1. `invited_participants - 1`. | Triggers promotion: earliest FCFS (Auto) or Pos #1 (Assigned). | `public.leave_plan` |
| **Leave Plan** (Waitlisted participant) | Any (Free or Paid) | `WAITLISTED`, any, `PARTICIPANT` | `SKIPPED` (`skip_reason = 'LEFT'`) | `NULL` | Joined count unchanged. `invited_participants - 1`. | Renumbers remaining waitlist members 1..N. | `public.leave_plan` |
| **Request to Leave** (Paid plan joined) | Any | `JOINED`, any, `PARTICIPANT` | `JOINED` (`leave_requested = true`) | Preserved | Count unchanged. Obligation remains pending. | No promotion until host resolves. Displays `!` badge. | `public.request_paid_plan_leave` |
| **Cancel Leave Request** | Any | `JOINED` (`leave_requested = true`) | `JOINED` (`leave_requested = false`) | Preserved | Count unchanged. | Clears `leave_requested_at`. Badge removed. | `public.cancel_paid_plan_leave_request` |
| **Resolve Leave: Replace** | Any | `JOINED` (`leave_requested = true`) | `SKIPPED` (`skip_reason = 'REPLACED'`) | `NULL` | Outgoing leaving member removed from wallet. | Replacement participant invited into vacated spot. | `public.resolve_paid_plan_leave_request` |
| **Resolve Leave: Keep Payment** | Any | `JOINED` (`leave_requested = true`) | `SKIPPED` (`skip_reason = 'PAYMENT_KEPT'`) | `NULL` | Outgoing member marked payment kept. | Triggers vacancy promotion for next candidate. | `public.resolve_paid_plan_leave_request` |
| **Remove Participant** | `AUTOMATIC` | `JOINED` or `WAITLISTED` | `SKIPPED` (`skip_reason = 'REMOVED'`) | `NULL` | If `JOINED`: Joined count - 1. `invited_participants - 1`. | If `JOINED`: Promotes earliest FCFS. Clears queue time. | `public.remove_participant` |
| **Remove Participant** | `ASSIGNED` | `GOING` or `WAITLIST` | `SKIPPED` (`skip_reason = 'REMOVED'`) | `NULL` | If `GOING`: Joined count - 1. `invited_participants - 1`. | Promotes Pos #1 to GOING. Renumbers waitlist 1..N. | `public.remove_participant` |
| **Request to Rejoin** | Any | `SKIPPED` (`skip_reason` set) | `REJOINED` | `NULL` | Count unchanged. Frozen awaiting host. | Placed into Skipped tab with amber `!` badge. | `public.rejoin_plan` |
| **Resolve Rejoin: Add to Plan** | `AUTOMATIC` (Spots available / No-Limit) | `REJOINED`, `NULL` | `JOINED` | `NULL` | Joined count increments by 1. Plan size unchanged. | Clears `skip_reason`, `leave_requested`. | `public.resolve_rejoined_participant` |
| **Resolve Rejoin: Increase Size** | `AUTOMATIC` (Plan is full) | `REJOINED`, `NULL` | `JOINED` | `NULL` | Host increases size (`update_plan_capacity`) then adds. | Admitted into newly opened spot. | `update_plan_capacity` + `resolve_rejoined_participant` |
| **Resolve Rejoin: Add to Joined** | `ASSIGNED` | `REJOINED`, any | `JOINED` | `'GOING'` | `plan_size = plan_size + 1` atomically! Joined count + 1. | No waitlist promotion triggered. Wallet recalculated. | `public.resolve_rejoined_participant` |
| **Resolve Rejoin: Add to Waitlist** | `ASSIGNED` | `REJOINED`, any | `WAITLISTED` | `'WAITLIST'` | `plan_size` strictly unchanged. Joined count unchanged. | Appended to waitlist at `max_pos + 1`. | `public.resolve_rejoined_participant` |
| **Reorder Waitlist** | `ASSIGNED` | Multiple `WAITLIST` rows | Preserved | `'WAITLIST'` | Counts and plan size unchanged. | Reassigns `waitlist_position = 1..N` matching drag order. | `public.reorder_waitlist` |
| **Promote to Host** | Any | `JOINED`, any, `PARTICIPANT` | `JOINED` | Preserved | Role transitions to `'HOST'`. Count unchanged. | Crown icon added. Can manage participants. | `public.promote_to_host` |
| **Demote from Host** | Any | `JOINED`, any, `HOST` | `JOINED` | Preserved | Role transitions to `'PARTICIPANT'`. Blocked if sole host. | Crown icon removed. | `public.demote_from_host` |
| **Stop Hosting (Transfer)** | Any | `JOINED`, any, `HOST` | `JOINED` | Preserved | Caller becomes `'PARTICIPANT'`. Target becomes `'HOST'`. | Caller remains in the plan! No leave request created. | `public.stop_hosting_with_replacement` |
| **Host Leaves with Replacement** | Any (Free or Paid) | `JOINED`, any, `HOST` | `SKIPPED` (`skip_reason = 'LEFT'`) | `NULL` | Target becomes `'HOST'`. Caller demoted and leaves. | Triggers vacancy promotion for caller's spot. | `public.request_host_leave_with_replacement` |
| **Switch Mode: Auto → Assigned** | Plan Update | Any non-skipped rows | Preserved | `'GOING'` (1..plan_size) / `'WAITLIST'` | Plan size unchanged. RSVP status IMMUTABLE! | Numbered 1..N contiguously for `'WAITLIST'`. | `trg_handle_switch_waitlist_mode` |
| **Switch Mode: Assigned → Auto** | Plan Update | Any non-skipped rows | Preserved | `NULL` | Plan size unchanged. RSVP status IMMUTABLE! | `assigned_group` and `waitlist_position` set to `NULL`. | `trg_handle_switch_waitlist_mode` |

---

## 4. Detailed Flow Specifications

### A. Normal Join Flow

```text
[User Opens Plan / Taps Join / Holds to Accept]
                    │
                    ▼
          [public.join_plan RPC]
                    │
     Is plan_size NULL? (No Limit)
        ├── YES ──► If count < 50 ──► rsvp_status = 'JOINED', assigned_group = NULL
        │           If count >= 50 ──► RAISE EXCEPTION 'Plan size reached (50)'
        └── NO
             │
   participant_filtering Mode?
        ├── AUTOMATIC
        │     ├── joined_count < plan_size ──► rsvp_status = 'JOINED', queue_at = now()
        │     └── joined_count >= plan_size ─► rsvp_status = 'WAITLISTED', queue_at = now()
        └── ASSIGNED
              ├── Existing row with assigned_group?
              │     ├── 'GOING'    ──► rsvp_status = 'JOINED', assigned_group = 'GOING'
              │     └── 'WAITLIST' ──► rsvp_status = 'WAITLISTED', preserves waitlist_position
              └── New row via link
                    ├── joined_count < plan_size ──► rsvp_status = 'JOINED', group = 'GOING'
                    └── joined_count >= plan_size ─► rsvp_status = 'WAITLISTED', group = 'WAITLIST', pos = max + 1
```

1. **Capacity Evaluation Rule**:
   - In JavaScript/TypeScript, comparisons against `null` or `undefined` must be guarded (`isNoLimit = capacity === null || capacity === undefined`). A raw comparison `count < null` evaluates to `false` in JS, which would erroneously flag No-Limit plans as full.
2. **Joined Count Calculation**:
   - The Joined count is derived **strictly from confirmed `JOINED` RSVP status or host role** (`isJoinedRsvpParticipant`).
   - In Assigned mode, an invited guest allocated to `assigned_group = 'GOING'` does **not** count towards Joined until they explicitly confirm.

### B. Leave and Leave-Request Flows

1. **Free Plan Participant Departure**:
   - Participant taps "Leave Plan".
   - Executes `public.leave_plan(p_plan_id)`.
   - Atomically updates target participant to `rsvp_status = 'SKIPPED'`, `skip_reason = 'LEFT'`, clears `assigned_group = NULL`, `waitlist_position = NULL`, resets `leave_requested = false`.
   - Synchronizes `plans.invited_participants`.
   - Triggers automated vacancy promotion (`auto_promote_waitlist_for_automatic` or `auto_promote_waitlist_for_assigned`).
2. **Waitlisted Participant Departure (Free or Paid Plan)**:
   - Waitlisted participants hold no expense obligation because they are not confirmed attendees.
   - Even on a paid plan (`total_cost > 0`), the UI directly offers **Leave Plan** (never "Request to leave").
   - Executes `public.leave_plan(p_plan_id)`.
   - Renumbers remaining waitlist members contiguously 1..N.
3. **Paid Plan Joined Participant Departure**:
   - A confirmed `JOINED` participant on a paid plan taps "Request to leave".
   - Executes `public.request_paid_plan_leave(p_plan_id)`.
   - Sets `leave_requested = true`, `leave_requested_at = now()`.
   - `rsvp_status` remains `JOINED` until resolved by the host.
   - An amber indicator (`!`) renders next to the participant's name for the host.
4. **Direct Spot Handling (Leave Request Resolution)**:
   - When the host taps a leave-requested attendee (`leave_requested === true`), the UI directly mounts `RemoveGoingParticipantBottomSheet` (bypassing any intermediate "Wants to leave" dialog).
   - Host chooses:
     - **Replace Participant**: Executes `public.resolve_paid_plan_leave_request(..., 'REPLACED', p_replacement_user_id)`. Outgoing member becomes `SKIPPED` (`skip_reason = 'REPLACED'`), and replacement candidate enters `INVITED`.
     - **Remove Participant**: Executes `public.remove_participant(p_plan_id, p_target_user_id)`. Outgoing member becomes `SKIPPED` (`skip_reason = 'REMOVED'`), and a vacancy opens for waitlist promotion.
     - **Keep Payment**: Outgoing member becomes `SKIPPED` (`skip_reason = 'PAYMENT_KEPT'`), and next waitlist candidate is promoted.

### C. Rejoin Flow

1. **Initiation**:
   - A skipped participant (`rsvp_status === 'SKIPPED'`) views the plan preview and taps **Rejoin Plan**.
   - Executes `public.rejoin_plan(p_plan_id)`.
   - Transitions to `rsvp_status = 'REJOINED'`, clears `skip_reason = NULL`.
   - Renders in the host's Skipped tab with an amber `!` badge and subtitle "Wants to rejoin this plan".
2. **Resolution in Automatic Mode**:
   - **Available Capacity or No-Limit**: Host taps participant $\rightarrow$ opens `AutomaticWaitlistActions` $\rightarrow$ selects **Add to Plan** $\rightarrow$ executes `resolve_rejoined_participant(..., 'JOINED')`. Moves immediately to `JOINED` without altering plan capacity.
   - **Plan is Full (`actualJoinedCount >= capacity`)**: Host taps participant $\rightarrow$ directly opens `PlanIsFullBottomSheet` (bypassing intermediate sheet) $\rightarrow$ host chooses **Increase Plan Size** (`update_plan_capacity(capacity + 1)` then `resolve_rejoined_participant(..., 'JOINED')`) or **Add to Waitlist** (`resolve_rejoined_participant(..., 'WAITLIST')`).
3. **Resolution in Assigned Mode**:
   - **Add to Joined**: Atomically increments `plans.plan_size = plan_size + 1`. Transitions participant to `rsvp_status = 'JOINED'`, `assigned_group = 'GOING'`, clears waitlist position and queue timestamp. Does **not** trigger waitlist promotion, as the spot was created specifically for the rejoining member.
   - **Add to Waitlist**: Leaves `plan_size` unchanged. Transitions participant to `rsvp_status = 'WAITLISTED'`, `assigned_group = 'WAITLIST'`, appends to the end of the waitlist at `waitlist_position = max_pos + 1`.
   - **Plan is Full (`displayGoing.length >= effectiveCapacity`)**: Tapping directly opens `PlanIsFullBottomSheet` with immediate options to **Increase Plan Size** or **Add to Waitlist**.

### D. Waitlist Ordering and Promotion

1. **Automatic Mode (First-Come, First-Served)**:
   - Ordering is determined exclusively by queue arrival timestamp: `joined_queue_at ASC NULLS LAST`, with alphabetical name tie-breaking.
   - Database `waitlist_position` column is strictly `NULL`.
   - Displayed queue badges (`#1`, `#2`, `#3`) are rendered strictly for participants whose `rsvp_status === 'WAITLISTED'`. Invited members in the waitlist section never display numbers.
   - On vacancy: `public.auto_promote_waitlist_for_automatic` promotes the candidate with earliest `joined_queue_at` to `JOINED`.
2. **Assigned Mode (Manual Priority)**:
   - Ordering is determined exclusively by explicit integer rank: `waitlist_position` (1..N).
   - Drag-and-drop triggers `public.reorder_waitlist(p_plan_id, p_ordered_user_ids)`.
   - On vacancy: `public.auto_promote_waitlist_for_assigned` inspects the candidate at position #1:
     - If candidate's status is `'WAITLISTED'` or `'REJOINED'`: Promoted to `assigned_group = 'GOING'`, `rsvp_status = 'JOINED'`, `waitlist_position = NULL`.
     - If candidate's status is `'INVITED'`: Moved to `assigned_group = 'GOING'`, `waitlist_position = NULL`, but **`rsvp_status` remains strictly `'INVITED'`** (immutability invariant).
3. **Safe Two-Stage Staging Renumbering Pattern**:
   - PostgreSQL unique index `idx_uniq_plan_waitlist_position` checks uniqueness per row during `UPDATE`.
   - To prevent error `23505: duplicate key value violates unique constraint`, contiguous renumbering is always executed via a safe two-stage update:
     - **Stage 1 (Temporary High Offset)**: `UPDATE ... SET waitlist_position = 10000 + new_pos`.
     - **Stage 2 (Final Rank Assignment)**: `UPDATE ... SET waitlist_position = waitlist_position - 10000`.
     - **Stage 3 (Cleanup)**: Sets `waitlist_position = NULL` for all non-waitlist or skipped rows.

### E. Host Lifecycle

1. **Initial Host Assignment**:
   - The creator is assigned `role = 'HOST'`, `rsvp_status = 'JOINED'`, `assigned_group = 'GOING'` (or `NULL` if auto) during plan creation via `create_plan_with_participants` or database trigger `trg_auto_insert_plan_host_participant`.
2. **Promote / Demote Host**:
   - `public.promote_to_host(p_plan_id, p_target_user_id)`: Target must be currently `JOINED`. Promotes target to `role = 'HOST'`.
   - `public.demote_from_host(p_plan_id, p_target_user_id)`: Demotes host to `role = 'PARTICIPANT'`. Enforces that at least one active host remains.
3. **Stop Hosting with Replacement (Transfer Only)**:
   - `public.stop_hosting_with_replacement(p_plan_id, p_replacement_user_id)`: Caller transfers host authority to another confirmed attendee.
   - Caller is demoted to `role = 'PARTICIPANT'` but **remains in the plan as a confirmed attendee (`rsvp_status = 'JOINED'`)**. No leave request is created.
4. **Host Leave with Replacement (Transfer & Leave)**:
   - `public.request_host_leave_with_replacement(p_plan_id, p_replacement_user_id)`: Caller promotes replacement attendee to `role = 'HOST'`, then immediately leaves via `leave_plan(p_plan_id)`.
   - Caller transitions to `role = 'PARTICIPANT'`, `rsvp_status = 'SKIPPED'`, `skip_reason = 'LEFT'`.
   - Vacated spot triggers waitlist promotion. Operates identically on free and paid plans.

---

## 5. End-to-End State Persistence & UI Synchronization Pipeline

For every state transition, the frontend and backend coordinate through eight discrete lifecycle stages:

```text
[1. UI Action Trigger]
       │  (Button tap, drag release, swipe gesture)
       ▼
[2. Frontend Handler]
       │  (AssignedParticipantContainer, AutomaticParticipantContainer)
       ▼
[3. Hook / Context Mutation]
       │  (usePlanParticipants, PlansContext)
       ▼
[4. Optimistic State Application]
       │  (Immediate local update to dbPlanParticipants for smooth UI response)
       ▼
[5. PostgreSQL RPC Execution]
       │  (Security Definer RPC via Supabase Client with parameter validation)
       ▼
[6. Database Trigger Evaluation]
       │  (Immutability triggers, vacancy promotion triggers, queue triggers)
       ▼
[7. Authoritative Refresh & Realtime Reconciliation]
       │  (Realtime broadcast -> refreshPlans() fetches canonical DB state)
       ▼
[8. Error Rollback]
          (If RPC fails, catch block invokes refreshPlans() to revert optimistic state)
```

### Component Responsibilities vs. Database Responsibilities

| Subsystem | Frontend Responsibility | Database Responsibility |
|---|---|---|
| **Join Flow** | Button disablement, hold progress animation, loading state. | Capacity verification (`FOR UPDATE`), slot allocation, queue timestamp, ceiling enforcement. |
| **Waitlist Drag-and-Drop** | Smooth dragging, reorder animations, drag preview styles. | Contiguous 1..N renumbering via `reorder_waitlist`, unique constraint validation. |
| **Leave / Removal** | Confirmation bottom sheets, direct leave-request spot routing. | Expense ledger cleanup, last-host protection, vacancy auto-promotion, count synchronization. |
| **Rejoin Flow** | Direct interception to `PlanIsFullBottomSheet` when full. | Atomic `plan_size + 1` expansion, wallet recomputation, sequential position allocation. |
| **Mode Switching** | Mode dropdown selection, guided capacity adjustment sheets. | `trg_handle_switch_waitlist_mode`, enforcing `trg_enforce_invited_rsvp_immutable`. |

---

## 6. Database and Code Dependencies Mapping

### A. Source File Locations

| File Path | Primary Responsibilities |
|---|---|
| `apps/app/src/features/participants/screens/ParticipantManagementScreen.tsx` | Mode router delegating rendering between Automatic and Assigned screens. |
| `apps/app/src/features/participants/automatic/AutomaticParticipantScreen.tsx` | Automatic mode roster rendering, tab selection, participant tapping. |
| `apps/app/src/features/participants/automatic/AutomaticParticipantContainer.tsx` | Automatic mode action state, bottom sheet controllers, rejoin capacity handling. |
| `apps/app/src/features/participants/automatic/AutomaticWaitlistActions.tsx` | Host actions bottom sheet for Automatic mode (promote, demote, remove, add to plan). |
| `apps/app/src/features/participants/assigned/AssignedParticipantScreen.tsx` | Assigned mode roster rendering, drag-and-drop waitlist reordering, group tabs. |
| `apps/app/src/features/participants/assigned/AssignedParticipantContainer.tsx` | Assigned mode state container, spot decision modal orchestration, rejoin resolution. |
| `apps/app/src/features/participants/assigned/AssignedParticipantActions.tsx` | Host actions bottom sheet for Assigned mode (move to Going/Waitlist, swap, remove). |
| `apps/app/src/features/participants/assigned/assignedCapacityLogic.ts` | Pure functions for group allocation, draft persistence, boundary limits. |
| `apps/app/src/features/plans/hooks/usePlanParticipants.ts` | Centralized hook orchestrating participant mutations, RPC invocations, and optimistic cache updates. |
| `apps/app/src/features/plans/api/plans.ts` | Typed Supabase RPC wrapper functions. |
| `apps/app/src/features/plans/state/PlansContext.tsx` | Central state provider managing `dbPlanParticipants`, Realtime subscriptions, and refresh coordination. |
| `apps/app/lib/participantStatus.ts` | Pure status normalization (`normalizeStatus`), classification (`isJoinedRsvpParticipant`), and partitioning (`partitionAutomaticParticipants`). |

### B. Canonical Database Functions & Signatures

| Database Function Signature | Migration File | Canonical Purpose |
|---|---|---|
| `public.join_plan(p_plan_id uuid)` | `20261007182500_fix_join_plan_remove_nonexistent_created_by.sql` | Transactional join RPC enforcing plan capacity, No-Limit 50 cap, and queue timestamps. |
| `public.claim_plan_invite(p_plan_id uuid)` | `20261009181500_fix_assigned_waitlist_position_for_invited_participants.sql` | Resolves invite link claims, placing Assigned invitees into waitlist with next sequential position. |
| `public.invite_participants(p_plan_id uuid, p_invitee_user_ids uuid[], p_assigned_group assigned_group_enum)` | `20261009183500_fix_invite_participants_found_clobber.sql` | Atomic batch invitation RPC with explicit boolean `FOUND` protection. |
| `public.leave_plan(p_plan_id uuid)` | `20261010140000_fix_host_leave_with_replacement_paid_plan.sql` | Immediate voluntary leave RPC for regular attendees and waitlisted participants. |
| `public.request_paid_plan_leave(p_plan_id uuid)` | `20260904200000_baseline_current_production.sql` | Submits pending leave request on paid plans (`leave_requested = true`). |
| `public.cancel_paid_plan_leave_request(p_plan_id uuid)` | `20260904200000_baseline_current_production.sql` | Cancels pending leave request on paid plans. |
| `public.resolve_paid_plan_leave_request(p_plan_id uuid, p_target_user_id uuid, p_resolution text, p_replacement_user_id uuid)` | `20260904200000_baseline_current_production.sql` | Resolves leave request via `REPLACED` or `KEEP_PAYMENT`. |
| `public.remove_participant(p_plan_id uuid, p_target_user_id uuid)` | `20261010103000_fix_assigned_remove_participant_and_promotion.sql` | Host removal setting `SKIPPED`/`REMOVED` and triggering vacancy promotion. |
| `public.replace_participant(p_plan_id uuid, p_target_user_id uuid, p_replacement_user_id uuid)` | `20260904200000_baseline_current_production.sql` | Direct participant replacement without active leave request. |
| `public.rejoin_plan(p_plan_id uuid)` | `20260904200000_baseline_current_production.sql` | Skipped participant requests to return (`rsvp_status = 'REJOINED'`). |
| `public.resolve_rejoined_participant(p_plan_id uuid, p_target_user_id uuid, p_decision text)` | `20261010111500_fix_rejoin_plan_size_and_assignment.sql` | Resolves rejoin request. In Assigned mode, increments `plan_size + 1` on `'JOINED'`. |
| `public.auto_promote_waitlist_for_automatic(p_plan_id uuid)` | `20260915070942_migrate_max_participants_to_invited_participants.sql` | Promotes earliest FCFS candidate in Automatic mode upon vacancy. |
| `public.auto_promote_waitlist_for_assigned(p_plan_id uuid, p_vacated_group assigned_group_enum)` | `20261010104500_fix_assigned_promotion_preserve_invited.sql` | Promotes Pos #1 to GOING, preserving `INVITED` status, and renumbers waitlist safely. |
| `public.reorder_waitlist(p_plan_id uuid, p_ordered_user_ids uuid[])` | `20260904200000_baseline_current_production.sql` | Persists manual drag-and-drop order for Assigned mode waitlists. |
| `public.promote_to_host(p_plan_id uuid, p_target_user_id uuid)` | `20260907160000_disable_plan_activity_system.sql` | Promotes active confirmed participant to host. |
| `public.demote_from_host(p_plan_id uuid, p_target_user_id uuid)` | `20260904200000_baseline_current_production.sql` | Demotes host to participant, enforcing minimum 1 active host. |
| `public.stop_hosting_with_replacement(p_plan_id uuid, p_replacement_user_id uuid)` | `20260907160000_disable_plan_activity_system.sql` | Transfers hosting while maintaining caller in plan as confirmed attendee. |
| `public.request_host_leave_with_replacement(p_plan_id uuid, p_replacement_user_id uuid)` | `20261010140000_fix_host_leave_with_replacement_paid_plan.sql` | Promotes replacement to host and executes immediate leave for caller. |

### C. Active Database Triggers

| Trigger Name | Table | Event | Function |
|---|---|---|---|
| `trg_enforce_invited_rsvp_immutable` | `public.plan_participants` | `BEFORE UPDATE OF rsvp_status` | `public.trg_enforce_invited_rsvp_immutable()` |
| `trg_handle_switch_waitlist_mode` | `public.plans` | `AFTER UPDATE OF participant_filtering` | `public.handle_switch_to_assigned_mode()` |
| `trg_maintain_joined_queue_at_trigger` | `public.plan_participants` | `BEFORE INSERT OR UPDATE` | `public.maintain_joined_queue_at()` |
| `trg_auto_promote_on_vacancy_trigger` | `public.plan_participants` | `AFTER UPDATE OR DELETE` | `public.auto_promote_waitlist_on_vacancy()` |
| `trg_auto_insert_plan_host_participant` | `public.plans` | `AFTER INSERT` | `public.auto_insert_plan_host_participant()` |

---

## 7. Regression Test Suite & Verification Commands

All participant state machine behaviors are protected by 15 test files comprising 132 automated tests.

### Running Participant Regression Tests
Execute from `Projects/Planless/apps/app`:

```bash
# Run the complete participant state machine test suite
npx vitest run src/features/participants

# Run related plans feature tests verifying participant contracts
npx vitest run \
  src/features/plans/__tests__/joinedParticipantCountContract.test.ts \
  src/features/plans/__tests__/leavePlanBottomSheetWaitlist.test.ts \
  src/features/plans/__tests__/participantCompletedCancelledActions.test.ts \
  src/features/plans/__tests__/simplifyRejoinFlow.test.ts \
  src/features/plans/__tests__/noLimitSystemMax50.test.ts

# Execute TypeScript type verification
npm run lint
```

### Test File Coverage Map

| Test File | Verified Invariants |
|---|---|
| `src/features/participants/__tests__/participantStateMachineTransitions.test.ts` | Canonical state transitions: Normal join, full plan queue, No-Limit 50 ceiling, Assigned mode join, invite claim, leave, leave request, rejoin expansion, vacancy promotion, host transfer/departure, count synchronization. |
| `src/features/participants/__tests__/stopHostingTransferHost.test.tsx` | Host transfer (`stop_hosting_with_replacement`), preserving caller in plan as regular participant. |
| `src/features/participants/__tests__/hostLeaveWithReplacement.test.tsx` | Host departure with replacement (`request_host_leave_with_replacement`) on free and paid plans. |
| `src/features/participants/__tests__/simplifyLeaveRequestFlow.test.tsx` | Direct spot handling sheet (`RemoveGoingParticipantBottomSheet`) on leave requests. |
| `src/features/participants/assigned/__tests__/rejoinPlanSizeAssignedMode.test.ts` | Atomic `plan_size + 1` expansion on "Add to Joined" vs. preserving size on "Add to Waitlist". |
| `src/features/participants/assigned/__tests__/rejoinFlowAssignedMode.test.tsx` | Direct `PlanIsFullBottomSheet` interception for rejoin requests on full Assigned plans. |
| `src/features/participants/assigned/__tests__/removeParticipantAssignedMode.test.ts` | Host participant removal in Assigned mode, `REMOVED` skip reason, vacancy auto-promotion. |
| `src/features/participants/assigned/__tests__/moveWaitlistToJoinedCount.test.tsx` | Moving waitlist to joined count, transitioning `WAITLISTED` $\rightarrow$ `JOINED`, preserving `INVITED`. |
| `src/features/participants/assigned/__tests__/moveToWaitlistDistinct.test.tsx` | Moving from Going to Waitlist in Assigned mode, sequential rank assignment. |
| `src/features/participants/assigned/__tests__/switchWaitlistModeState.test.ts` | Preserving `rsvp_status` across Automatic $\leftrightarrow$ Assigned mode switches. |
| `src/features/participants/assigned/__tests__/swapParticipants.test.ts` | Swapping participants between Going and Waitlist, preserving waitlist position ranks. |
| `src/features/participants/assigned/__tests__/assignedCapacityLogic.test.ts` | Pure functions for group allocation, draft capacity boundaries, and reordering. |
| `src/features/participants/assigned/__tests__/skippedPlacementSheetUI.test.tsx` | UI rendering and options for skipped participants. |
| `src/features/participants/automatic/__tests__/automaticWaitlistNumbering.test.tsx` | Numbering waitlist badges strictly for `WAITLISTED`, never for `INVITED`, in FCFS queue order. |
| `src/features/participants/automatic/__tests__/rejoinFlowNoLimit.test.tsx` | Direct admission for rejoin requests on No-Limit plans without capacity error. |

---

## 8. Governing Invariants & Rules for Future Development

Future developers and AI coding agents working on Planless must adhere to these seven rules:

1. **Source of Truth Rule**: This document (`docs/participants/PARTICIPANT_STATE_MACHINE.md`) is the canonical source of truth for participant state machine behavior.
2. **Behavioral Preservation Rule**: Existing working behavior must be preserved unless Thilak explicitly requests a product change.
3. **Dual-Mode Impact Rule**: Every participant state change must identify its effects on **both** Automatic and Assigned modes.
4. **Consistency Rule**: Database functions, triggers, frontend handlers, and UI status projections (`lib/participantStatus.ts`) must remain strictly synchronized.
5. **Atomic Verification Rule**: Any intentional change must update this canonical document and add/update regression tests in the exact same task.
6. **No Phantom States Rule**: Never introduce new participant statuses, alternate sources of truth, or shadow state machines without explicit approval.
7. **Discrepancy Reporting Rule**: If documentation and code disagree, report the discrepancy immediately rather than silently altering either.
