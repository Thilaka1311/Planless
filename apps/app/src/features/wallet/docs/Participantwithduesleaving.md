Plan — Preserve Additional Expense Obligations When a Participant Leaves

Objective

Separate plan membership from financial obligations.

When a participant leaves a plan, leaving must never erase an existing financial obligation created while they were part of the plan.

Existing Plan Expense / PAYMENT_KEPT behavior must remain intact.

For existing ADDITIONAL_EXPENSE records, preserve the participant's existing share after they leave. They remain financially responsible until the expense is settled or otherwise resolved.

After leaving, the participant must not be selectable for new expenses.

Phase 1 — Audit Existing Architecture

Inspect:

plan participant leave flow

plan_participants

rsvp_status

skip_reason

PAYMENT_KEPT

wallet_expenses

wallet_expense_participants

PLAN_EXPENSE

ADDITIONAL_EXPENSE

settlement records

Expense Details

People Balances

Plan Balances

Add Cost

Edit Cost

walletService.ts

participant join/leave RPCs

expense recalculation RPCs/functions

Trace what currently happens when someone leaves:

Are expense participant rows deleted?

Are Additional Expense shares recalculated?

Does the user's balance disappear?

How is Plan Expense handled?

How are settled/unsettled splits represented?

How does PAYMENT_KEPT work?

Which queries filter financial data based on current membership?

Do not modify code in this phase.

Phase 2 — Establish the Core Rule

Implement this invariant:

Leaving a plan must never erase an existing financial obligation.

Example:

Plan membership:
Renjith = LEFT

Financial obligation:
Renjith = ₹300 outstanding

If an Additional Expense existed while Renjith was part of the plan:

Dinner — ₹900

You       ₹300
Renjith   ₹300
Vikram    ₹300

After Renjith leaves:

Dinner — ₹900

You       ₹300
Renjith   ₹300   ← still owes
Vikram    ₹300

Do NOT delete, redistribute, reduce, or otherwise erase Renjith's existing share.

Phase 3 — Separate Membership From Financial Participation

Do not use current plan membership state as a reason to delete an existing financial obligation.

If a wallet_expense_participants row represents historical expense participation, preserve it after the participant leaves.

The distinction must be:

ACTIVE PLAN PARTICIPATION
Renjith = LEFT

EXISTING FINANCIAL PARTICIPATION
Renjith = ₹300 outstanding

Do not unnecessarily change the schema if existing expense participant records already preserve this relationship.

Phase 4 — Protect Existing Additional Expenses

When someone leaves, existing ADDITIONAL_EXPENSE records must remain unchanged.

Example:

Plan Fee        ₹300
Dinner          ₹900
Taxi            ₹600

Renjith is involved in all three.

After leaving:

Plan Fee → existing Plan Fee / PAYMENT_KEPT / replacement logic

Dinner → unchanged

Taxi → unchanged

Leaving must NOT delete Renjith from, redistribute, reduce, or modify the settlement state of existing Additional Expenses.

Phase 5 — Prevent New Expenses After Leaving

After plan_participants indicates LEFT, the participant must not be selectable for new expenses.

For Add Cost / Edit Cost:

JOINED → selectable

LEFT → not selectable

WAITLISTED → not selectable

INVITED → not selectable

SKIPPED → not selectable

This applies only to new expense participation.

Historical expenses are different: an existing wallet_expense_participants row must be preserved.

Do not globally filter LEFT users from historical financial queries.

Phase 6 — Expense Details for Former Participants

If a participant has left but has an existing expense split, they must still appear in that expense's details.

Example:

Dinner — ₹900

You       ₹300
Renjith   ₹300
Vikram    ₹300

After Renjith leaves:

You
₹300

Renjith
Left plan · ₹300 owed

Vikram
₹300

If settled:

Renjith
Left plan · Settled

Show the user because they have an actual participant/split record for that specific expense, not merely because they exist in plan_participants.

Phase 7 — People Balances and Plan Balances

Outstanding historical Additional Expense obligations must remain financially visible.

Example:

Dinner     ₹300
Taxi       ₹150

Renjith leaves.

Expected outstanding balance:

₹450

Do NOT make the balance disappear merely because rsvp_status = LEFT.

The balance reaches zero only when obligations are actually settled or resolved according to existing rules.

At the same time:

Renjith is no longer an active plan participant.

Renjith cannot participate in new expenses.

Renjith can view and settle historical obligations.

Phase 8 — Allow Former Participants to Settle

A participant who has left must still be able to settle existing obligations.

Example:

Renjith leaves.

Dinner      ₹300
Taxi        ₹150

Outstanding = ₹450

After settling ₹450:

Dinner → Settled
Taxi   → Settled
Outstanding → ₹0

Do not require rejoining the plan. Do not create a new expense to represent settlement. Use the existing settlement architecture and preserve settlement dates/history.

Phase 9 — Preserve Already Settled Expenses

If an Additional Expense was already settled before leaving:

Dinner ₹900
Renjith ₹300 → SETTLED

and Renjith leaves:

Dinner remains unchanged.

Settlement remains settled.

Settlement history remains intact.

Do not reopen or redistribute the settled amount.

Phase 10 — Keep Plan Expense / PAYMENT_KEPT Separate

Do not merge Additional Expense leave behavior with Plan Expense behavior.

Plan Expense continues using existing:

Keep Payment

Replace participant

PAYMENT_KEPT

Plan Fee lifecycle

participant replacement/promotion behavior

Additional Expenses follow:

Existing split
→ preserve
→ remain financially responsible
→ settle later

Do NOT use PAYMENT_KEPT as a substitute for ordinary Additional Expense obligations.

Do not change skip_reason on Additional Expense records merely because the participant leaves.

Phase 11 — Remove Accidental Cleanup

Search the leave flow and related functions for logic that:

deletes wallet_expense_participants

deletes wallet_expenses

recalculates all plan expenses

redistributes all expenses

removes LEFT users from wallet queries

filters financial obligations using only current plan membership

Review all such logic.

The intended flow is:

Participant leaves
        ↓
Plan membership changes
        ↓
Existing Additional Expenses remain intact
        ↓
Existing outstanding balance remains
        ↓
Participant cannot join NEW expenses
        ↓
Participant can settle OLD expenses

Do not allow leave logic to trigger global Additional Expense recalculation.

Phase 12 — Leave Confirmation With Outstanding Balance

When a participant has outstanding financial obligations, inform them before completing the leave.

Suggested UI:

You have outstanding expenses

You still owe ₹450 from expenses in this plan.

Leaving the plan won't remove these expenses. You'll still need to settle them.

Continue Leaving

Cancel

Use existing Planless confirmation UI patterns.

Do not block leaving solely because money is owed unless existing product rules explicitly require it.

Phase 13 — Historical vs New Expense Queries

Enforce this distinction:

Active participant selection

Only currently eligible participants, normally JOINED, should be selectable.

Historical expense display

A user can appear when they have an actual wallet_expense_participants record for that expense, even if they later left.

Financial balances

Users with outstanding historical obligations remain financially visible.

Do not globally add rsvp_status = JOINED to all wallet queries.

Phase 14 — End-to-End Testing

Scenario 1 — Leave With Unsettled Additional Expense

Dinner — ₹900:

You ₹300

Renjith ₹300

Vikram ₹300

After Renjith leaves:

Dinner remains ₹900.

Renjith remains attached to Dinner.

Renjith still owes ₹300.

Renjith is no longer active.

Renjith cannot be selected for new expenses.

Scenario 2 — Leave With Multiple Expenses

Dinner → Renjith owes ₹300.
Taxi → Renjith owes ₹150.

After leaving: outstanding = ₹450. Both expenses remain unchanged.

Scenario 3 — Leave Then Settle

After settling ₹450:

Dinner → Settled

Taxi → Settled

Balance → ₹0

Settlement history preserved

Scenario 4 — Already Settled

If Renjith's Dinner split was already settled, leaving causes no financial changes.

Scenario 5 — New Expense

After leaving, Renjith must not appear in Add Cost / Edit Cost participant selection.

Scenario 6 — Plan Fee

Leaving a paid plan continues existing Keep Payment / Replace / PAYMENT_KEPT behavior without regression.

Scenario 7 — Additional Expense Isolation

Leaving must not change any Additional Expense amounts, participants, splits, or settlement states.

Phase 15 — Database Integrity and Security

Verify:

historical participant rows are preserved

no orphaned wallet expenses

no deleted outstanding obligations

no duplicate participant rows

no negative balances caused by leaving

settled records remain settled

outstanding records remain outstanding

PAYMENT_KEPT remains valid

LEFT users cannot be added to new expenses

former participants can access legitimate historical financial records

Check RLS and RPC behavior carefully.

Do not weaken authorization policies merely to expose historical obligations.

Phase 16 — Final Verification

Run:

npx tsc -p apps/app/tsconfig.json --noEmit

Fix errors introduced.

Verify:

Leave Plan

Expense Details

People Balances

Plan Balances

Add Cost

Edit Cost

Settlement

Settlement History

Plan Expense

Additional Expense

PAYMENT_KEPT

If Graphify is part of the normal workflow:

graphify update .

Remove temporary debug logs introduced during implementation.

Final Business Rule

                  PARTICIPANT LEAVES
                         │
              ┌──────────┴──────────┐
              │                     │
       PLAN MEMBERSHIP       FINANCIAL HISTORY
              │                     │
              ↓                     ↓
           LEFT                  PRESERVED
              │                     │
              │             Existing expenses
              │                     │
              │              ┌──────┴──────┐
              │              │             │
              │        PLAN EXPENSE   ADDITIONAL
              │              │         EXPENSE
              │              │             │
              │       Existing logic   Keep existing
              │       Keep/Replace     shares
              │       PAYMENT_KEPT         │
              │                           ↓
              │                      Settle later
              │                           │
              └───────────────────────────┘

Core invariant

Leaving a plan must never erase an existing financial obligation.

A user can stop being a plan participant while still owing money from expenses that occurred while they were part of the plan.

They must be unable to participate in new expenses after leaving, but must remain able to view and settle existing financial obligations.