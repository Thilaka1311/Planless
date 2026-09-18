# Feature Documentation: Completion

## 1. Overview

The **Completion** feature manages the post-event conclusion lifecycle for plans in Planless. When an event finishes, the host transitions the plan from `LIVE` or `OVERDUE` to `COMPLETED`, officially recording actual physical attendance, reconciling group expense splits, and archiving the event.

* **Core Function**: A multi-step completion workflow allowing the host to verify who showed up (`ATTENDED` vs `DID_NOT_ATTEND`), add surprise walk-in guests, select an expense settlement redistribution strategy (`SPLIT_ALL`, `KEEP_CURRENT_COST`, `NONE`), and close the plan.
* **Product Role**: Triggered from `PlansScreen` or `PlansPreviewScreen` when a plan's `scheduled_at` has passed (or manually completed early by host). Completed plans are moved from active tabs to the user's historical archive (`PastPlans.tsx` in Profile and Memories).
* **Scope & Boundaries**: Owns attendance reconciliation, final participant state transitions, and post-completion participant editing within a 24-hour grace period (`manage_completed_plan_participants`). Interacts closely with `wallet_expenses` to adjust shares, but does not execute direct bank/UPI payouts.

---

## 2. User Flow

### 1. Initiating Plan Completion
* When a plan passes its `scheduled_at` timestamp, the system flags it as `OVERDUE` (or host taps "Complete Plan" in `<PlanSettingsScreen />` / `<HeroMetadataCard />`).
* The host taps the **Complete Plan** CTA.
* The application mounts `<HostAttendanceScreen />` (or opens `<CompletePlanBottomSheet />`).

### 2. Finalizing Attendance Roster
* Host inspects the attendee checklist:
  * Confirmed joined participants default to `ATTENDED`.
  * The host is permanently locked as `ATTENDED` (cannot be unselected).
  * Waitlisted and invited participants default to `DID_NOT_ATTEND`.
* Host toggles attendance for each member:
  * Checking a member marks them `ATTENDED`.
  * Unchecking marks them `DID_NOT_ATTEND`.
  * "Select All" / "Deselect All" convenience buttons allow bulk updating.
* If uninvited friends attended, host taps "Add Attendee" to open `<AttendanceSearch />` and select them from their friend list.

### 3. Resolving Shared Expenses (`ExpenseMode`)
* If the plan has associated wallet expenses (`wallet_expenses`), host is prompted with an Expense Resolution dialog:
  * **Split Among Attendees (`SPLIT_ALL`)**: Divides the total plan bill equally among verified attendees (`ATTENDED`). Attendees who did not attend are excused from future share splits.
  * **Keep Current Cost (`KEEP_CURRENT_COST`)**: Retains previous individual share allocations and absorbs differences.
  * **No Changes (`NONE`)**: Preserves existing expense records as-is without re-splitting.
* If no expenses exist on the plan, this step is bypassed.

### 4. Database Finalization (`complete_plan` RPC)
* Host taps **Finalize & Complete Plan**.
* Dispatches `complete_plan(p_plan_id, p_attendance_input, p_expense_mode)` to Supabase:
  * Sets `plans.status = 'COMPLETED'`.
  * Updates `plans.attended_participants` count.
  * Sets `plan_participants.final_attendance` and `final_state`.
  * Recalculates `wallet_expenses` and individual balances.
* The plan transitions into historical archive mode; chat room switches to archived banner.

### 5. Post-Completion 24-Hour Adjustments
* For 24 hours following `scheduled_at`, the host retains administrative access to edit attendance via `<ManageCompletedParticipantsScreen />`.
* Calling `manage_completed_plan_participants` allows adding or removing attendees if mistakes were made during the initial completion.

---

## 3. UI Documentation

### Attendance Reconciliation Screen (`HostAttendanceScreen.tsx`)
* **Container**: Full-screen modal overlay (`fixed inset-0 z-50 bg-[#000000] text-white flex flex-col h-full font-sans select-none text-left`).
* **Header Bar**:
  * Pinned top bar (`h-14 px-5 border-b border-white/[0.08] flex items-center justify-between`).
  * Left: Close button (`<X className="w-5 h-5 text-white" />`).
  * Center: Screen title "Who attended?" (`text-base font-bold text-white`).
  * Right: "Select All" / "Deselect All" text toggle button (`text-xs font-semibold text-[#FF6B2C] hover:underline`).
* **Attendance Checklist**:
  * Scrollable list (`flex-1 overflow-y-auto px-5 py-4 space-y-2`).
  * **Attendee Row**:
    * Layout: Row container (`p-3 rounded-2xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-between hover:bg-zinc-900 transition-colors`).
    * Left side: Avatar (`UserAvatar` 36x36px circular), display name in semibold white (`text-sm font-semibold text-white`), and status label (e.g. "Joined" or "Host").
    * Right side: Interactive checkbox or toggle circle (`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all`). Checked state renders vibrant orange/coral (`bg-[#FF6B2C] border-[#FF6B2C]`) with a white `<Check className="w-3.5 h-3.5 stroke-[2.5]" />`. Host row checkbox is disabled/locked.
* **Add Walk-In Guest Button**:
  * Dashed pill container (`w-full py-3 px-4 rounded-2xl border border-dashed border-white/20 flex items-center justify-center gap-2 text-zinc-400 hover:text-white hover:border-white/40 transition-colors cursor-pointer my-2`).
  * Icon: `<Search className="w-4 h-4 text-zinc-400" />` + label "Add another friend who attended".

### Walk-In Attendee Search Sheet (`AttendanceSearch.tsx`)
* **Layout**: Slide-up search modal with top search input field and real-time friend roster.
* **Search Input**: Pill input with magnifying glass icon and instant debounce filtering.
* **Result Items**: Displays avatar, name, and username with a plus button to append the user to `extraMembers`.

### Expense Resolution Dialog (`showExpenseDialog`)
* **Modal Overlay**: Centered dialog card (`w-[90%] max-w-sm p-6 bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl space-y-4`).
* **Header**: Title "How should expenses be split?" with subtitle displaying total plan cost in INR (`₹`).
* **Option Cards**:
  * **Split Among Attendees**: Radio card highlighting recalculated per-person cost (`₹X/ea`).
  * **Keep Current Cost**: Radio card keeping original per-person share.
  * **Skip Expenses**: Radio card bypassing cost changes.

### Post-Completion Management (`ManageCompletedParticipantsScreen.tsx`)
* Dedicated review screen active during the 24-hour grace window. Displays "Attended (X)" and "Did Not Attend (Y)" sections with options to re-toggle members.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `HostAttendanceScreen` | `src/features/completion/Screens/HostAttendanceScreen.tsx` | Primary attendance verification screen. Manages member toggle states, walk-in extra members, and expense dialog. | Invoked when completing plan; calls `complete_plan` RPC. |
| `AttendanceSearch` | `src/features/completion/Screens/AttendanceSearch.tsx` | Search modal allowing hosts to look up and append uninvited friends who showed up. | Sub-component of `HostAttendanceScreen`. |
| `ManageCompletedParticipantsScreen` | `src/features/completion/Screens/ManageCompletedParticipantsScreen.tsx` | Post-completion participant adjustment interface active during the 24-hour grace window. | Calls `manage_completed_plan_participants` RPC. |
| `CompletePlanBottomSheet` | `src/features/plans/components/BottomSheets.tsx` | Bottom sheet alternative launching the completion and attendance workflow. | Mounted inside `PlansPreviewScreen.tsx`. |
| `usePlanLifecycle` | `src/features/plans/hooks/usePlanLifecycle.ts` | Dispatches lifecycle mutations and coordinates completion state with `PlansContext`. | Bridges UI components to Supabase API. |

---

## 5. Data Flow

```text
[Host Finalizes Attendance in HostAttendanceScreen]
                         │
                         ▼
        [Calls completePlan(planId, attendanceInput, expenseMode)]
                         │
                         ▼
             [Supabase RPC: public.complete_plan]
  ├── 1. Validates host authorization (is_plan_host)
  ├── 2. Locks plans row (FOR UPDATE)
  ├── 3. Inserts newly added extra attendees into plan_participants (ATTENDED / JOINED)
  ├── 4. Updates all existing plan_participants:
  │        • final_attendance = 'ATTENDED' | 'DID_NOT_ATTEND'
  │        • final_state = 'JOINED' | 'SKIPPED'
  │        • rsvp_status = 'JOINED' | 'SKIPPED'
  ├── 5. Counts total attended (v_final_count)
  ├── 6. Updates plans:
  │        • status = 'COMPLETED'
  │        • attended_participants = v_final_count
  └── 7. If expense_mode != 'NONE':
           • Recalculates wallet_expenses.total_amount
           • Updates wallet_expense_participants shares
                         │
                         ▼
      [Supabase Realtime Broadcast: plans & plan_participants]
                         │
                         ▼
               [PlansContext Store]
  ├── Moves plan from Live/Overdue to Completed
  ├── Re-filters getHomeFeedPlans() and active tabs
  └── Updates chat room to display archived banner
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.plans` (Completion Fields)
* `status` (`plan_status`, not null): Transitions from `'LIVE'` or `'OVERDUE'` to `'COMPLETED'`.
* `attended_participants` (`integer`, default 0): Authoritative count of verified attendees.
* `scheduled_at` (`timestamptz`): Used to enforce the 24-hour post-event participant modification window.

### 2. Table: `public.plan_participants` (Completion Fields)
* `final_attendance` (`attendance_status`, nullable): `'ATTENDED'` or `'DID_NOT_ATTEND'`.
* `final_state` (`rsvp_status`, nullable): `'JOINED'` (attended) or `'SKIPPED'` (did not attend / left / replaced).
* `cost_per_participant` (`numeric`): Final individual financial liability.

### 3. Table: `public.wallet_expenses` & `public.wallet_expense_participants`
* Stores plan bills and individual member obligation records redistributed during completion.

### 4. Relevant Database Functions / RPCs
* **`complete_plan(p_plan_id uuid, p_attendance_input jsonb, p_expense_mode text)`**:
  * Security: `SECURITY DEFINER`.
  * Executes atomic transition to `COMPLETED`, finalizes participant attendance records, and reconciles wallet shares.
* **`manage_completed_plan_participants(p_plan_id uuid, p_users_to_add uuid[], p_users_to_remove uuid[], p_expense_mode text)`**:
  * Security: `SECURITY DEFINER`.
  * Enforces invariant: `scheduled_at + interval '24 hours' >= now()`.
  * Allows host to add or remove attendees within 24 hours post-event.

---

## 7. States & Rules

### Completion State Invariants
* **Terminal Status**: Once marked `COMPLETED`, a plan cannot transition back to `LIVE`, `OVERDUE`, or `CANCELLED`.
* **Host Attendance Invariant**: The completing host is unconditionally marked as `ATTENDED` and `final_state = 'JOINED'`. Hosts cannot mark themselves as absent.
* **Attendance vs RSVP Status Synchronization**:
  * Marked `ATTENDED` → `final_attendance = 'ATTENDED'`, `final_state = 'JOINED'`, `rsvp_status = 'JOINED'`, `skip_reason = NULL`.
  * Marked `DID_NOT_ATTEND` → `final_attendance = 'DID_NOT_ATTEND'`, `final_state = 'SKIPPED'`, `rsvp_status = 'SKIPPED'`.
* **24-Hour Edit Window**: Post-completion participant edits via `manage_completed_plan_participants` are strictly rejected by the database if `now() > scheduled_at + interval '24 hours'`.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`PlansContext` (`usePlansStore`)**: Supplies plan member rosters and dispatches completion RPCs.
* **`WalletContext` (`walletSyncService`)**: Provides existing plan expense totals and handles settlement synchronization.

### Downstream Impact of Changes
* **Memories & Profile Archive (`PastPlans.tsx`)**: Completed plans appear in user archives and historical event recaps. Only users with `final_state === 'JOINED'` see the plan as an attended event.
* **Chat Room (`PlanChatScreen.tsx`)**: The message input composer is replaced with a locked "Plan completed · Chat archived" status bar.
* **Wallet Settlements (`WalletScreen.tsx`)**: Member debt obligations reflect the finalized attendee count and updated `cost_per_participant`.

---

## 9. Important Files

* `src/features/completion/Screens/HostAttendanceScreen.tsx`: Primary attendance checklist and finalization screen.
* `src/features/completion/Screens/AttendanceSearch.tsx`: Walk-in attendee search and selection modal.
* `src/features/completion/Screens/ManageCompletedParticipantsScreen.tsx`: Post-completion attendee adjustment interface.
* `src/features/plans/components/BottomSheets.tsx`: Contains `CompletePlanBottomSheet`.
* `src/features/plans/hooks/usePlanLifecycle.ts`: Lifecycle hook coordinating completion calls.
* `src/features/plans/api/plans.ts`: Supabase RPC client caller for `complete_plan`.
* `supabase/migrations/20260908190100_sync_overdue_plans.sql`: Authoritative PostgreSQL definition of `complete_plan`.

---

## 10. Known Issues

### 1. Unimplemented Standalone Screen Routing
* **What Code Does**: `HostAttendanceScreen.tsx` and `ManageCompletedParticipantsScreen.tsx` are located under `apps/app/src/features/completion/docs/Screens/` rather than the primary `src/features/completion/screens/` directory, while `CompletePlanBottomSheet` inside `BottomSheets.tsx` is used in active production flows.
* **What Database Does**: Fully supports `complete_plan` and `manage_completed_plan_participants` RPCs.
* **What is Unknown**: Whether the `docs/Screens/` implementations are reference prototypes destined to replace `CompletePlanBottomSheet` or legacy artifacts.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Preserve Expense Mode Contract**: When modifying completion inputs, ensure `expenseMode` strictly passes `'SPLIT_ALL'`, `'KEEP_CURRENT_COST'`, or `'NONE'`. Passing invalid text triggers PostgreSQL enum conversion errors.
2. **Respect Host Locking**: Never allow UI controls to uncheck or set the host to `DID_NOT_ATTEND`.

### Post-Modification Verification Steps
1. **Completion Round-Trip**:
   - Create plan with 3 joined participants and a shared ₹600 expense.
   - Complete plan marking 2 as `ATTENDED` and 1 as `DID_NOT_ATTEND` with mode `SPLIT_ALL`.
   - Verify plan status changes to `COMPLETED`.
   - Verify `attended_participants = 2` and per-person cost recalculates to `₹300/ea`.
2. **Archive Mode Verification**:
   - Open plan chatroom: verify bottom composer is replaced by archived pill banner.
   - Open Profile Past Plans: verify plan appears in historical list.
