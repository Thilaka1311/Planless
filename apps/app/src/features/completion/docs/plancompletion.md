# Planless — Plan Completion & Attendance

## 1. Purpose

Implement the complete **Plan Completion lifecycle** for Planless.

When a host ends a plan, Planless must distinguish between:

* Who originally joined the plan
* Who was waitlisted
* Who was only invited
* Who skipped/left/was replaced/removed
* Who actually attended
* Who ultimately belongs to the completed plan
* Who still has financial obligations

The most important principle is:

> **RSVP state, attendance, final state, and financial state are separate concepts.**

Completing a plan must **not delete expenses or Wallet obligations**.

---

# 2. Final Participant State Model

Each `plan_participants` row should represent the person's relationship with the plan.

The lifecycle has these concepts:

```text
Initial State
      ↓
Skip Reason
      ↓
Final Attendance
      ↓
Final State
      ↓
Expense
      ↓
Past Plan
      ↓
Wallet
```

## Initial State

Existing `rsvp_status` values:

```text
JOINED
WAITLISTED
INVITED
SKIPPED
```

Do not introduce a separate `DECLINED` state.

`SKIPPED + LEFT` represents someone who left/declined the plan.

---

# 3. Database Changes

## 3.1 Existing `plan_participants`

The existing table already contains:

* `plan_id`
* `user_id`
* `rsvp_status`
* `skip_reason`
* `cost_per_participant`
* `circle_id`

The existing system already uses `skip_reason`, including `REPLACED`. 

The completion system should **extend this table**.

---

## 3.2 Add `final_attendance`

Add a nullable field:

```sql
final_attendance
```

Recommended type:

```text
ATTENDED
DID_NOT_ATTEND
```

Nullable because the plan has not necessarily been completed yet.

Before completion:

```text
final_attendance = NULL
```

After attendance reconciliation:

```text
ATTENDED
```

or:

```text
DID_NOT_ATTEND
```

Do not use `NULL` to mean "didn't attend."

`NULL` means:

> Attendance has not yet been finalized.

---

## 3.3 Add `final_state`

Add:

```sql
final_state
```

Allowed values:

```text
JOINED
SKIPPED
```

This is deliberately limited to **two states**.

### Mapping

```text
final_attendance = ATTENDED
        ↓
final_state = JOINED
```

```text
final_attendance = DID_NOT_ATTEND
        ↓
final_state = SKIPPED
```

Before completion:

```text
final_state = NULL
```

---

# 4. Why `final_state` is separate

Do not overwrite the original `rsvp_status`.

Example:

```text
Initial State:
INVITED

Final Attendance:
ATTENDED

Final State:
JOINED
```

This tells us:

> They were only invited originally, but actually attended the plan.

Another example:

```text
Initial State:
JOINED

Final Attendance:
DID_NOT_ATTEND

Final State:
SKIPPED
```

This tells us:

> They joined the plan but ultimately didn't attend.

The original state is preserved as history.

---

# 5. Skip Reason

Continue using the existing `skip_reason`.

Valid completion-related meanings:

```text
LEFT
REPLACED
REMOVED
PAYMENT_KEPT
```

## Rules

### SKIPPED + LEFT

Can have an expense **only if they attended**.

```text
SKIPPED + LEFT + DID_NOT_ATTEND
→ NO EXPENSE
```

```text
SKIPPED + LEFT + ATTENDED
→ Expense allowed
```

---

### SKIPPED + REPLACED

Never has an expense.

```text
SKIPPED + REPLACED
→ EXPENSE = NO
```

---

### SKIPPED + REMOVED

Never has an expense.

```text
SKIPPED + REMOVED
→ EXPENSE = NO
```

---

### SKIPPED + PAYMENT_KEPT

Must have an expense.

```text
SKIPPED + PAYMENT_KEPT
→ EXPENSE = YES
```

The existing replacement implementation already removes/recreates wallet participant obligations according to participant lifecycle, so completion must not bypass or duplicate that wallet logic. 

---

# 6. Attendance Rules

## Joined

Default:

```text
JOINED
→ ATTENDED
```

The host can change it to:

```text
DID_NOT_ATTEND
```

---

## Waitlisted

If they actually came:

```text
WAITLISTED
→ ATTENDED
→ FINAL_STATE = JOINED
```

If they didn't:

```text
WAITLISTED
→ DID_NOT_ATTEND
→ FINAL_STATE = SKIPPED
```

A waitlisted person who didn't attend **cannot have an expense**.

---

## Invited

If they actually came:

```text
INVITED
→ ATTENDED
→ FINAL_STATE = JOINED
```

If they didn't:

```text
INVITED
→ DID_NOT_ATTEND
→ FINAL_STATE = SKIPPED
```

An invited person who didn't attend **cannot have an expense**.

---

## Skipped

A skipped person can still have attended.

Example:

```text
SKIPPED
skip_reason = LEFT

→ ATTENDED
→ FINAL_STATE = JOINED
```

This means:

> They originally left but ultimately came to the plan.

The original `SKIPPED` state and `LEFT` reason must remain preserved.

---

# 7. Complete State Matrix

|  # | Initial State | Skip Reason  | Final Attendance | Final State | Expense | Past Plan | Wallet | Final Meaning                                       |
| -: | ------------- | ------------ | ---------------- | ----------- | ------- | --------- | ------ | --------------------------------------------------- |
|  1 | Joined        | —            | Attended         | **Joined**  | No      | Yes       | No     | Normal participant                                  |
|  2 | Joined        | —            | Attended         | **Joined**  | Yes     | Yes       | Yes    | Participant with financial activity                 |
|  3 | Joined        | —            | Didn't attend    | **Skipped** | No      | No        | No     | Joined but didn't participate                       |
|  4 | Joined        | —            | Didn't attend    | **Skipped** | Yes     | No        | Yes    | Didn't attend but has existing financial obligation |
|  5 | Waitlisted    | —            | Attended         | **Joined**  | No      | Yes       | No     | Waitlisted but actually attended                    |
|  6 | Waitlisted    | —            | Attended         | **Joined**  | Yes     | Yes       | Yes    | Waitlisted but attended with financial activity     |
|  7 | Waitlisted    | —            | Didn't attend    | **Skipped** | No      | No        | No     | Waitlisted but never participated                   |
|  8 | Invited       | —            | Attended         | **Joined**  | No      | Yes       | No     | Invited but actually attended                       |
|  9 | Invited       | —            | Attended         | **Joined**  | Yes     | Yes       | Yes    | Invited but attended with financial activity        |
| 10 | Invited       | —            | Didn't attend    | **Skipped** | No      | No        | No     | Invited but never participated                      |
| 11 | Skipped       | Left         | Attended         | **Joined**  | No      | Yes       | No     | Left originally but ultimately attended             |
| 12 | Skipped       | Left         | Attended         | **Joined**  | Yes     | Yes       | Yes    | Left originally but attended and has expense        |
| 13 | Skipped       | Left         | Didn't attend    | **Skipped** | No      | No        | No     | Left and never participated                         |
| 14 | Skipped       | Replaced     | Attended         | **Joined**  | No      | Yes       | No     | Replaced originally but added back and attended     |
| 15 | Skipped       | Removed      | Attended         | **Joined**  | No      | Yes       | No     | Removed originally but added back and attended      |
| 16 | Skipped       | Payment Kept | Attended         | **Joined**  | Yes     | Yes       | Yes    | Attended and payment remains                        |
| 17 | Skipped       | Payment Kept | Didn't attend    | **Skipped** | Yes     | No        | Yes    | Didn't attend but payment remains                   |

---

# 8. Invalid States

These must be prevented at the database/business-logic level.

| Initial State          | Attendance    | Expense | Valid? |
| ---------------------- | ------------- | ------- | ------ |
| Waitlisted             | Didn't attend | Yes     | **NO** |
| Invited                | Didn't attend | Yes     | **NO** |
| Skipped + Left         | Didn't attend | Yes     | **NO** |
| Skipped + Replaced     | Didn't attend | Yes     | **NO** |
| Skipped + Replaced     | Attended      | Yes     | **NO** |
| Skipped + Removed      | Didn't attend | Yes     | **NO** |
| Skipped + Removed      | Attended      | Yes     | **NO** |
| Skipped + Payment Kept | Didn't attend | No      | **NO** |
| Skipped + Payment Kept | Attended      | No      | **NO** |

The UI should not allow these states, but the database/business logic should also protect against them.

---

# 9. Host Completion Flow

## Entry

Host opens:

```text
You're Hosting
      ↓
Mark as Complete
```

---

# 10. Early Completion

Compare:

```text
now
```

against:

```text
plans.scheduled_at
```

If:

```text
now < scheduled_at
```

show:

### Complete plan early?

> This plan is scheduled for [date/time]. Since you're completing it now, the plan time will be updated to now.

Actions:

```text
Cancel
Complete Plan
```

If confirmed:

```text
scheduled_at = now
rsvp_deadline = now
```

The existing database uses `scheduled_at`, not `datetime`, and `rsvp_deadline` must remain `<= scheduled_at`.

---

# 11. Normal Completion

If:

```text
now >= scheduled_at
```

do not change:

```text
scheduled_at
rsvp_deadline
```

Proceed directly to attendance reconciliation.

---

# 12. Attendance Reconciliation Screen

Header:

**Who attended?**

Subtitle:

**Confirm who actually came to the plan.**

The screen is host-only.

---

# 13. Default Attendance

All participants currently in:

```text
JOINED
```

are automatically selected as:

```text
ATTENDED
```

The Host is always:

```text
ATTENDED
```

and cannot be deselected.

Example:

```text
✓ You
✓ Ranjith
✓ Maanastej
✓ Thilaka
```

---

# 14. Everyone Attended

Provide:

**Everyone attended**

When selected:

* All eligible `JOINED` participants become `ATTENDED`.
* Do not automatically add Invited participants.
* Do not automatically add Waitlisted participants.
* Do not automatically add Skipped participants.

This is the fast path.

---

# 15. Changing Attendance

Host can tap a Joined participant:

```text
ATTENDED
↓
DID_NOT_ATTEND
```

Visual:

```text
○ Maanastej
  Didn't attend
```

This change is initially **local UI state**.

Do not write each tap immediately to Supabase.

Persist the final selections only when the Host confirms completion.

---

# 16. Other People

People who aren't currently Joined should appear in a secondary section.

Possible groups:

```text
Other people
```

### Waitlisted

```text
Arun
Waitlisted
+ Add
```

### Invited

```text
Karthik
Invited
+ Add
```

### Previously Skipped

```text
Renjith
Left
+ Add back
```

---

# 17. Add Person

When Host taps **Add** / **Add back**:

```text
Final Attendance = ATTENDED
Final State = JOINED
```

Move them into the attendee list.

Do not erase:

```text
Initial State
Skip Reason
```

Example:

```text
Initial State = INVITED
Final Attendance = ATTENDED
Final State = JOINED
```

or:

```text
Initial State = SKIPPED
Skip Reason = LEFT
Final Attendance = ATTENDED
Final State = JOINED
```

---

# 18. Replaced / Removed

For:

```text
SKIPPED + REPLACED
SKIPPED + REMOVED
```

show:

**Add back**

If the Host confirms they actually attended:

```text
Final Attendance = ATTENDED
Final State = JOINED
```

However:

```text
Expense = NO
```

must remain enforced for these states.

---

# 19. Payment Kept

For:

```text
SKIPPED + PAYMENT_KEPT
```

the participant must already have an expense.

Do not modify that expense during attendance reconciliation.

Possible outcomes:

### Didn't attend

```text
Final State = SKIPPED
Expense = YES
Wallet = YES
```

### Attended

```text
Final State = JOINED
Expense = YES
Wallet = YES
```

---

# 20. Expenses Are Independent

The completion screen must **never become an expense editor**.

Attendance does not automatically:

* Delete an expense
* Add an expense
* Change a split
* Change who owes whom
* Settle anything
* Refund anything

The existing Wallet system remains the source of truth for financial relationships.

The existing wallet architecture derives participant obligations from `wallet_expense_participants.amount_owed`. 

---

# 21. Complete Plan Summary

Before final completion:

```text
3 people attended
1 person didn't attend
```

Button:

**Complete Plan**

---

# 22. Final Confirmation

Show:

### Complete this plan?

> 3 people attended
> 1 person didn't attend
>
> The plan will move to Past Plans. Existing expenses and unsettled balances will remain in Wallet until they are settled.

Actions:

```text
Cancel
Complete Plan
```

---

# 23. Database Completion Transaction

Only after confirmation:

### Update plan

```text
plans.status = COMPLETED
```

For early completion:

```text
plans.scheduled_at = now
plans.rsvp_deadline = now
plans.status = COMPLETED
```

For normal completion:

```text
plans.status = COMPLETED
```

Preserve the original time.

---

# 24. Update Participant Records

For every participant involved in the reconciliation:

### Attended

```text
final_attendance = ATTENDED
final_state = JOINED
```

### Didn't attend

```text
final_attendance = DID_NOT_ATTEND
final_state = SKIPPED
```

Do not overwrite:

```text
rsvp_status
skip_reason
```

unless an explicit existing lifecycle operation requires it.

---

# 25. Past Plans

Past Plans should be based on:

```text
final_state = JOINED
```

or equivalently:

```text
final_attendance = ATTENDED
```

Therefore:

```text
Joined → Attended
→ appears in Past Plans
```

but:

```text
Joined → Didn't attend
→ does NOT appear as a participant in Past Plans
```

Likewise:

```text
Invited → Attended
→ appears in Past Plans
```

This means Past Plans represent **actual participation**, not RSVP intention.

---

# 26. Wallet

Wallet is independent of Past Plans.

If a participant has an outstanding expense:

```text
expense exists
+
balance != 0
```

their financial relationship remains.

Example:

```text
Joined
→ Didn't attend
→ Final State = Skipped
→ Expense = Yes
→ Past Plan = No
→ Wallet = Yes
```

This is valid.

Completing the plan must never automatically clear that debt.

---

# 27. Wallet → Plans

Completed plans must be removed from:

**Wallet → Plans**

even if they have unsettled expenses.

The existing plan itself and financial records must remain in the database.

Only the Wallet **Plans list** should filter completed plans out.

The outstanding financial relationship continues through the appropriate Wallet/People view.

---

# 28. Chat

Once:

```text
plans.status = COMPLETED
```

the Plan Chat becomes archived.

Remove:

* Message input
* Send button
* Add Cost button

Replace with:

> **Plan completed · Chat archived**

Keep the existing chat history.

Do not delete historical messages.

---

# 29. Plan Screen

After completion:

Bottom host button changes:

```text
You're Hosting
```

to:

```text
Plan Completed
```

The completed state must come from:

```text
plans.status = COMPLETED
```

No additional completion flag should be introduced.

---

# 30. Three-Dot Menu

Keep the existing three-dot menu:

```text
Chat
Expenses
Settings
```

Completion does not add another menu item.

`Mark as Complete` remains under:

```text
You're Hosting
```

for active plans.

Once completed, that host action is no longer available.

---

# 31. Data Integrity Rules

The implementation must guarantee:

### Rule 1

```text
Final Attendance = ATTENDED
→ Final State = JOINED
```

### Rule 2

```text
Final Attendance = DID_NOT_ATTEND
→ Final State = SKIPPED
```

### Rule 3

```text
Invited + Didn't Attend
→ Expense = NO
```

### Rule 4

```text
Waitlisted + Didn't Attend
→ Expense = NO
```

### Rule 5

```text
Skipped + Left + Didn't Attend
→ Expense = NO
```

### Rule 6

```text
Skipped + Replaced
→ Expense = NO
```

### Rule 7

```text
Skipped + Removed
→ Expense = NO
```

### Rule 8

```text
Skipped + Payment Kept
→ Expense = YES
```

### Rule 9

```text
Final State = SKIPPED
→ Not a Past Plan participant
```

### Rule 10

```text
Outstanding Expense
→ Wallet relationship remains
```

### Rule 11

```text
Plan Completed
→ Wallet → Plans excludes plan
```

### Rule 12

```text
Plan Completed
→ Chat archived
```

---

# 32. Database Migration Requirements

Create a new Supabase migration.

Do **not** manually modify the production database without a migration.

The migration should:

1. Add `final_attendance`.
2. Add `final_state`.
3. Add appropriate constraints/checks.
4. Add indexes only where they materially help completion/Past Plans queries.
5. Preserve all existing participant data.
6. Preserve all existing `rsvp_status`.
7. Preserve all existing `skip_reason`.
8. Preserve all Wallet relationships.

Before applying the migration, inspect the current `plan_participants` schema and existing enum definitions. Do not assume enum names or types without verifying them.

---

# 33. Backward Compatibility

Existing participant rows will have:

```text
final_attendance = NULL
final_state = NULL
```

until their plan is completed.

Do not retroactively guess historical attendance for existing completed plans.

For already-completed plans, only backfill if there is an authoritative existing attendance source.

If there is no authoritative source:

```text
final_attendance = NULL
final_state = NULL
```

and handle those plans safely in the UI.

---

# 34. RLS / Permissions

The Host must be able to finalize attendance for all participants in their plan.

Participants must not be able to finalize another participant's attendance.

The existing `plan_participants` policies already allow updates by the participant themselves or the plan host. 

The new completion operation should preserve that security model.

Prefer a secure server-side/RPC transaction for final completion so the Host's authority is verified server-side.

---

# 35. Transaction Safety

Plan completion should behave as one logical operation.

Avoid this state:

```text
Plan = COMPLETED
Participants = not updated
```

or:

```text
Participants = updated
Plan = still LIVE
```

Prefer an RPC or transactional server operation that:

1. Verifies the authenticated user is the Host.
2. Verifies the plan is still active.
3. Updates participant final states.
4. Updates plan time if early completion.
5. Updates plan status.
6. Returns the final plan/participant state.

If any step fails, the operation should fail cleanly.

---

# 36. Realtime / State Refresh

After completion:

* Plans state must refresh.
* Participant state must refresh.
* Wallet state must remain intact.
* Wallet → Plans must remove the completed plan.
* Past Plans must immediately show the completed plan.
* Chat must immediately switch to archived state.

Do not require the user to manually reload the application.

The existing application already listens to `plan_participants` and `plans` Realtime changes and refreshes plan state.  Reuse that architecture rather than adding another global realtime system.

---

# 37. UI Implementation Order

Implement in this order:

### Phase 1 — Database

* Add `final_attendance`.
* Add `final_state`.
* Add constraints.
* Verify existing data.
* Verify RLS.

### Phase 2 — Completion backend

* Add attendance finalization logic.
* Add early completion handling.
* Add transaction/RPC.
* Add validation rules.

### Phase 3 — Participant state

* Update participant types.
* Update PlansContext/state.
* Update participant selectors.
* Ensure existing Joined/Waitlisted/Invited/Skipped flows continue working.

### Phase 4 — Host attendance screen

Build:

```text
Who attended?
```

with:

* Joined participants preselected
* Host locked as attended
* Everyone attended
* Individual attendance toggle
* Other people
* Add
* Add back
* Final attendance summary

### Phase 5 — Completion confirmation

Build:

```text
Complete this plan?
```

and connect it to the transaction.

### Phase 6 — Past Plans

Filter completed plan participation using:

```text
final_state = JOINED
```

### Phase 7 — Wallet

Ensure:

```text
COMPLETED
→ removed from Wallet → Plans
```

while expenses remain available through the existing Wallet relationship system.

### Phase 8 — Chat

Completed plan:

```text
Plan completed · Chat archived
```

No composer.

### Phase 9 — Plan screen

Change:

```text
You're Hosting
```

to:

```text
Plan Completed
```

---

# 38. Testing Matrix

Before calling this feature complete, test at minimum:

| Scenario                               | Expected                          |
| -------------------------------------- | --------------------------------- |
| Joined → Attended                      | Joined / Past Plan                |
| Joined → Didn't attend                 | Skipped / Not Past Plan           |
| Joined → Didn't attend + Expense       | Skipped / Not Past Plan / Wallet  |
| Waitlisted → Attended                  | Joined / Past Plan                |
| Waitlisted → Didn't attend             | Skipped / No Wallet               |
| Invited → Attended                     | Joined / Past Plan                |
| Invited → Didn't attend                | Skipped / No Wallet               |
| Skipped + Left → Attended              | Joined / Past Plan                |
| Skipped + Left → Didn't attend         | Skipped / No Wallet               |
| Skipped + Replaced → Attended          | Joined / Past Plan                |
| Skipped + Replaced → Didn't attend     | Skipped / No Wallet               |
| Skipped + Removed → Attended           | Joined / Past Plan                |
| Skipped + Removed → Didn't attend      | Skipped / No Wallet               |
| Skipped + Payment Kept → Attended      | Joined / Past Plan / Wallet       |
| Skipped + Payment Kept → Didn't attend | Skipped / No Past Plan / Wallet   |
| Early completion                       | `scheduled_at = now`              |
| Normal completion                      | Original `scheduled_at` preserved |
| Completed plan                         | Past Plans                        |
| Completed plan                         | Removed from Wallet → Plans       |
| Completed plan                         | Chat archived                     |
| Completed plan                         | Existing expenses preserved       |
| Completed plan                         | Bottom button = Plan Completed    |

---

# 39. Non-Goals

Do **not** use this feature to:

* Rebuild the Wallet system.
* Rebuild participant invitation logic.
* Rebuild RSVP logic.
* Delete expenses.
* Settle expenses automatically.
* Delete chat history.
* Create a second participant table.
* Create a second completion status.
* Create a separate attendance table unless the existing schema proves that `plan_participants` cannot safely represent the required state.
* Change the existing `rsvp_status` semantics.

---

# 40. Final Architecture

The final architecture should be:

```text
                    PLAN
                     │
                     ▼
              HOST COMPLETES
                     │
                     ▼
          ┌─────────────────────┐
          │ Attendance Review   │
          └──────────┬──────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      ATTENDED              DIDN'T ATTEND
          │                     │
          ▼                     ▼
   FINAL_STATE=JOINED    FINAL_STATE=SKIPPED
          │                     │
          ▼                     ▼
     PAST PLANS             NO PAST PLAN
          │
          └──────────┐
                     │
                     ▼
                  WALLET
                     │
             Expense exists?
                /          \
              YES          NO
               │            │
               ▼            ▼
          Keep balance    Nothing
```

The core principle for implementation is:

> **Completion freezes what actually happened, but it does not erase the financial history of what happened.**

And for the database specifically, I would **first create the migration for `final_attendance` and `final_state` and verify the current `plan_participants` schema before touching the UI**. Your existing participant system already has the necessary lifecycle foundation, including `rsvp_status` and `skip_reason`, so this should be an extension rather than a rewrite. 
