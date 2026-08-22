Plan — Expense Participant Deletion & Split Redistribution

Objective

Implement safe deletion of an individual participant from an expense when the user opens the participant action sheet and chooses Delete.

Current behavior:

Edit edits the entire expense split.

Settle settles only the selected participant's split.

Delete must remove only the selected participant from that expense and redistribute the existing expense total across the remaining participants.

The implementation must preserve the existing Planless financial architecture, especially:

wallet_expenses

expense participant/split records

Plan Expense vs Additional Expense

settlement state/history

PAYMENT_KEPT

Plan Fee recalculation

additional-expense isolation

Do not introduce a parallel financial model if existing services/RPCs can be reused safely.

Phase 1 — Inspect Existing Architecture

Before modifying behavior, inspect the existing implementation and identify:

wallet_expenses

wallet expense participant/split records

Expense Details

Plan Balances

People Balances

Edit Expense

Settle participant split

Delete Expense

Plan Expense identification

Additional Expense identification

PAYMENT_KEPT handling

Settlement records/history

Existing split redistribution/recalculation logic

Existing Plan Fee recalculation logic

Existing RPCs/services used for expense mutations

Trace exactly:

how a participant split is stored

how shares are calculated

how rounding is handled

how settled state is stored

how Plan Expense is identified

how Additional Expense is identified

how PAYMENT_KEPT is represented

how participant status affects wallet calculations

how UI cache/context refreshes after expense mutations

Do not make speculative architectural changes.

Reuse existing patterns wherever possible.

Phase 2 — Delete Confirmation UI

When the user opens a participant's action sheet:

Edit

Settle

Delete

keep Edit and Settle behavior unchanged.

When Delete is tapped, show a confirmation bottom sheet/dialog.

Suggested copy:

Remove Vikram?

This will remove Vikram from this expense.
The expense total will remain unchanged and the remaining participants will be resplit.

Cancel
Remove

The selected participant's actual name must be shown dynamically.

Do not perform deletion until the user confirms.

Use the existing Planless modal/bottom-sheet components and styling.

Phase 3 — Normal Participant Deletion

Implement deletion of an unsettled participant from an expense.

Example:

Expense: Water — ₹700

You — ₹175

Vikram — ₹175

Renjith — ₹175

Maanastej — ₹175

Delete Vikram.

Result:

You — ₹233.33

Renjith — ₹233.33

Maanastej — ₹233.34

Requirements:

Delete only the selected participant's split.

Never delete the parent wallet_expenses record.

Keep the original expense total unchanged.

Recalculate only the remaining participants.

Ensure all resulting shares sum exactly to the original expense total.

Handle rounding deterministically.

Do not modify unrelated expenses.

Do not modify other participants' settlement states.

Do not create duplicate split records.

Do not leave orphaned split records.

Support:

4 → 3 participants

3 → 2 participants

2 → 1 participant

If one participant remains, that participant receives 100% of the expense.

Phase 4 — Settled Split Protection

Before deleting a participant, determine whether that specific split is already settled.

If settled, block deletion.

Show:

Cannot remove settled split

Vikram has already settled this expense. Settled expense history cannot be removed.

OK

This validation must exist at the service/database level, not only in the UI.

Frontend validation is only for UX.

Backend/database validation is the actual protection.

If the split is settled:

do not delete it

do not redistribute it

do not modify settlement history

do not modify the expense total

do not modify other participants

Phase 5 — Atomic Database Operation

Participant deletion and redistribution must be atomic.

Prefer an existing RPC/transaction pattern.

If necessary, create a dedicated RPC/service operation for:

remove_expense_participant_and_redistribute

The operation should:

Validate the expense exists.

Validate the participant exists in that expense.

Validate the selected split is not settled.

Validate at least one participant will remain.

Remove the selected participant's split.

Recalculate remaining shares.

Ensure shares sum exactly to the original expense total.

Commit everything together.

If any step fails, roll back the entire operation.

Never allow partial states such as:

participant deleted but shares not recalculated

shares recalculated but participant still present

expense total unexpectedly changed

only some split rows updated

Follow the project's existing security/RLS/RPC conventions.

Phase 6 — Last Participant Handling

Explicitly handle the two-participant case.

Example:

Water — ₹700

You — ₹350

Vikram — ₹350

Delete Vikram.

Result:

You — ₹700

The expense itself must remain.

If deleting the participant would leave zero participants, block the operation.

Show:

Cannot remove participant

An expense must have at least one participant.

If the project already has a Delete Expense action, the user can use that to remove the entire expense.

Do not create an expense with zero participants.

Phase 7 — Plan Expense Handling

Plan Expense is special and must remain connected to the Plan Fee architecture.

Before implementing this phase, inspect the existing Plan Expense flow and reuse its established source of truth.

When deleting a participant from a Plan Expense:

do not accidentally recalculate all wallet expenses

do not touch Additional Expenses

do not modify Dinner/Taxi/Tickets/etc.

do not add/remove participants from unrelated expenses

do not alter unrelated settlement states

The Plan Expense must remain consistent with:

plan cost

cost per participant

joined participants

plan capacity

Plan Fee

wallet expense representation

PAYMENT_KEPT

Do not create a second competing Plan Fee calculation path.

The existing Plan Fee recalculation mechanism should remain the source of truth wherever appropriate.

Phase 8 — PAYMENT_KEPT Protection

Integrate the existing PAYMENT_KEPT rules.

PAYMENT_KEPT is not a normal unpaid split.

Do not:

set skip_reason to NULL

erase PAYMENT_KEPT history

remove retained payment accidentally

alter its settlement history

convert PAYMENT_KEPT into an ordinary participant

modify unrelated participant states

Maintain the existing invariant:

Once skip_reason becomes PAYMENT_KEPT, it must not become NULL.

It may transition according to the existing participant lifecycle rules, such as the existing removed/replaced/left behavior, but participant deletion must not violate the PAYMENT_KEPT invariant.

Follow the existing implementation rather than inventing new PAYMENT_KEPT behavior.

Phase 9 — Refresh Wallet Screens

After successful deletion, all affected wallet views must update without requiring the user to manually leave and reopen screens.

Update/revalidate:

Expense Details

Plan Balances

People Balances

Wallet summary

Participant count

Individual balance

Expense participant shares

Example:

Before:

Water — ₹700

You — ₹175

Vikram — ₹175

Renjith — ₹175

Maanastej — ₹175

After deleting Vikram:

Water — ₹700

You — ₹233.33

Renjith — ₹233.33

Maanastej — ₹233.34

Vikram must disappear from this expense.

Use the existing context/cache invalidation mechanisms.

Do not introduce unnecessary global refetching if the project already has targeted invalidation.

Phase 10 — Additional Expense Isolation

Participant deletion from an Additional Expense must affect only that expense.

Example:

Water — ₹700

Dinner — ₹900

Taxi — ₹600

Delete Vikram from Water.

Only Water changes.

Dinner must remain exactly unchanged.

Taxi must remain exactly unchanged.

Do not:

recalculate other expenses

change other expense totals

add/remove participants from other expenses

change other splits

change settlement states

change titles

trigger unnecessary global Plan Fee recalculation

This is critical because Plan Fee recalculation already exists.

Participant deletion must not accidentally invoke a global wallet expense recalculation that modifies Additional Expenses.

Phase 11 — Split/Rounding Rules

Use deterministic split redistribution.

For an expense total T and N remaining participants:

baseShare = floor(T / N, currency precision)

Distribute the remainder deterministically so:

sum(all shares) === T

For INR, shares should normally be rounded to two decimal places.

Example:

₹1000 / 3:

₹333.33

₹333.33

₹333.34

Do not produce:

₹333.33

₹333.33

₹333.33

because that totals ₹999.99.

The final total must always equal the parent expense total exactly.

Follow existing project rounding conventions if they already exist.

Phase 12 — UI State and Error Handling

While deletion is in progress:

prevent duplicate deletion requests

show the existing loading/progress state

disable the confirmation action if appropriate

On success:

close the confirmation sheet

refresh affected data

show the updated expense state

On failure:

keep the participant intact

keep all existing shares intact

show the existing Planless error UI/toast pattern

do not leave a partially updated state

The user should never see a successful-looking UI update if the database operation failed.

Phase 13 — Regression Testing

Test all of the following.

Test 1 — Additional Expense

₹700 / 4 participants.

Delete one participant.

Expected:

₹700 / 3 participants.

Test 2 — Rounding

₹1000 / 3 participants.

Expected:

₹333.33

₹333.33

₹333.34

Total = ₹1000 exactly.

Test 3 — Two Participants

₹700:

You — ₹350

Vikram — ₹350

Delete Vikram.

Expected:

You — ₹700

Test 4 — Settled Participant

Attempt to delete a settled participant.

Expected:

Deletion is blocked.

Settlement history remains intact.

Test 5 — Plan Expense

Delete an eligible participant from the Plan Expense.

Expected:

Plan Fee and wallet state remain consistent.

Test 6 — PAYMENT_KEPT

Verify PAYMENT_KEPT is not:

cleared

converted to NULL

deleted incorrectly

converted to a normal unpaid split

Test 7 — Additional Expense Isolation

Modify/delete a participant from one Additional Expense.

Verify every other expense remains unchanged.

Test 8 — UI Refresh

After deletion:

Expense Details updates

Plan Balances updates

People Balances updates

participant count updates

deleted participant disappears

remaining shares are correct

Test 9 — Database Integrity

Verify:

no orphaned split records

no orphaned expenses

no zero-participant expenses

no negative shares

shares always equal expense total

settled records remain intact

PAYMENT_KEPT invariant remains intact

Phase 14 — Final Verification

Run:

npx tsc -p apps/app/tsconfig.json --noEmit

Fix all TypeScript errors introduced by this implementation.

Also inspect for:

unused imports

duplicated split logic

unnecessary database calls

accidental global recalculation

incorrect Plan Expense identification

incorrect Additional Expense identification

stale wallet state

console/debug logs introduced during implementation

Do not remove existing useful logs unless they are directly related to this feature.

If the project uses Graphify as part of the normal workflow, run:

graphify update .

Final Acceptance Criteria

The implementation is complete only when all of these are true:

Delete opens a confirmation UI.

Delete removes only the selected participant's split.

Parent expense remains.

Total expense amount remains unchanged.

Remaining participants are automatically resplit.

Shares always total exactly to the original expense amount.

Settled participants cannot be deleted.

Zero-participant expenses cannot be created.

Operation is atomic.

Plan Expenses follow existing Plan Fee rules.

Additional Expenses remain completely isolated.

PAYMENT_KEPT is preserved according to existing rules.

PAYMENT_KEPT never becomes NULL because of this operation.

Expense Details refreshes correctly.

Plan Balances refreshes correctly.

People Balances refreshes correctly.

Wallet balances remain correct.

No unrelated expense is modified.

No unrelated participant is modified.

TypeScript compilation passes.

No new debug logs remain.

Existing Edit and Settle behavior continues to work.

Important Implementation Principle

Do not solve this by simply deleting a row from the frontend.

The financial mutation must be treated as a transactional operation:

validate → remove participant → redistribute shares → verify total → commit → refresh wallet state

The existing Planless financial architecture and database/RPC rules should remain the source of truth.