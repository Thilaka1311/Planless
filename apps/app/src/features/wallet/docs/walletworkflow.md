Planless Wallet — How Wallet Actions Work

Purpose

The Planless Wallet is where users see money they owe to other people and money other people owe them.

The core principle is:

The person who is owed the money controls when that money is marked as settled.

The person who owes the money cannot mark the debt as settled themselves.

This gives the recipient control over confirming that a payment has actually been received.

1. Wallet Structure

The Wallet has two primary views.

People

The People view answers:

"Who do I currently owe, and who currently owes me?"

Each person represents the user's outstanding net balance with that person.

Examples:

Renjith — +₹100 — Renjith owes you ₹100

Maanastej — -₹50 — You owe Maanastej ₹50

The People view is about the relationship between two individuals, regardless of which plan created the balance.

Plans

The Plans view answers:

"What money is still outstanding for each plan?"

Each plan shows the outstanding wallet amount associated with that plan.

This allows a user to understand where a balance came from rather than only seeing the aggregated person-to-person balance.

For example:

People

Renjith       +₹100
Maanastej      -₹50

while Plans might show:

Play 365       +₹100
Koi             -₹50

The People view is the relationship-level summary.

The Plans view is the source/context-level breakdown.

Only unsettled wallet amounts should contribute to outstanding balances.

2. What "Owes You" Means

A positive balance means:

That person owes you money.

Example:

Renjith
Owes you
+₹100

In this situation, you control settlement.

You are the person who is owed the money, so you can use Settle Up.

3. What "You Owe" Means

A negative balance means:

You owe that person money.

Example:

Maanastej
You owe
-₹50

In this situation, you cannot settle the debt from your Wallet.

The other person — the person who is owed the money — controls settlement.

Therefore, the debtor does not see a Settle Up action.

This is intentional.

If the debtor could mark the transaction as settled, they could claim that they had paid even though the recipient had not actually received the money.

Planless instead gives settlement control to the person receiving the money.

4. Settlement Ownership

The fundamental rule is:

The creditor settles. The debtor does not.

Where:

Creditor = person who is owed money

Debtor = person who owes money

Example

If:

Renjith owes Thilak ₹100

Then:

Thilak

sees ₹100

sees Settle Up

can settle the balance

Renjith

sees -₹100

does not see Settle Up

cannot mark the debt as settled

5. Settlement Is All-or-Nothing

Planless does not support partial settlement.

A settlement means:

Settle the entire outstanding amount represented by the settlement action.

There is no:

partial settlement

custom settlement amount

partial plan fee settlement

partial expense settlement

percentage-based settlement

If the applicable outstanding amount is:

₹150

the settlement action settles:

₹150

not:

₹50
₹75
₹100

Once the user decides to settle, the entire applicable amount is settled.

6. People vs Plans Settlement Scope

A person can have multiple outstanding expenses across multiple plans.

For example:

Play 365
Renjith owes you ₹100

Koi
Renjith owes you ₹50

The People view may show:

Renjith
Owes you
+₹150

The Plans view can show the underlying breakdown:

Play 365     +₹100
Koi           +₹50

The product must make the scope of Settle Up unambiguous.

If Settle Up is triggered from the People view, it should represent the entire outstanding relationship balance with that person.

If settlement is ever exposed from the Plans view, it should be explicitly plan-scoped and must not accidentally settle unrelated balances from other plans.

There should never be an ambiguous settlement action.

7. Settlement Lifecycle

Conceptually:

OUTSTANDING
     ↓
Creditor chooses Settle
     ↓
SETTLED

Once settled:

it no longer contributes to the outstanding balance

it should no longer appear as an unsettled wallet obligation

it cannot be settled again

historical settlement information can remain available if transaction history supports it

8. Settlement Must Be Atomic

Settlement should be one atomic database operation.

When a creditor settles:

Identify the exact outstanding obligation(s).

Verify that the current user is the creditor.

Verify that the obligation is still outstanding.

Mark the applicable obligation(s) as settled.

Recalculate the affected wallet balances.

Prevent the same obligation from being settled again.

The system must never reach a state where:

the UI says something is settled but the underlying obligation is still outstanding

the expense is settled but the balance still shows as outstanding

two concurrent requests settle the same obligation

the same obligation is settled twice

These protections must exist at the database/RPC level, not only in the frontend.

9. Settlement Authorization

The backend must never trust the frontend to determine who is allowed to settle.

The settlement operation must verify:

current_user = creditor

before allowing settlement.

It must reject attempts where:

current_user = debtor

It must also reject:

settling someone else's balance

settling an already-settled obligation

settling an obligation that no longer exists

settling an obligation outside the permitted plan scope

The frontend should hide invalid actions, but the backend must enforce the rule independently.

10. Participant Replacement and Wallet

Participant replacement is a separate lifecycle from settlement.

When a participant requests to leave a paid plan and the host chooses:

Replace Participant

the replacement candidate may initially be:

INVITED

The replacement candidate should not receive the wallet cost until they actually join the plan.

Therefore:

Replacement selected
        ↓
Replacement candidate = INVITED
        ↓
No new wallet cost for replacement yet
        ↓
Candidate joins
        ↓
New participant receives applicable plan/expense split

This must not behave like an immediate financial swap.

An invited replacement may never join, so the system must not create the replacement's wallet obligation merely because they were invited.

11. Abuse / Loophole Checks

The settlement model is intentionally creditor-controlled, but several technical and product edge cases need protection.

A. Double settlement

Two settlement requests could happen almost simultaneously.

Example:

Balance = ₹100

Request A → Settle
Request B → Settle

Only one should succeed.

The database operation should be atomic/idempotent so the second request cannot settle the same obligation again.

B. Debtor calling the RPC directly

Hiding the button is not security.

A malicious client could call the settlement RPC directly.

The backend must independently verify that:

current_user = creditor

before settling.

C. Stale Wallet Screen

A user may open Wallet, wait while another action changes the balance, and then press Settle Up.

The backend should re-check the current state before settling.

It must not blindly trust the amount or state displayed by an old screen.

D. Concurrent expense changes

A participant could be:

replaced

removed

added

moved between participant states

or have their expense recalculated

while a settlement is attempted.

Settlement must operate on the current valid outstanding state.

E. Replacement before settlement

Selecting a replacement must not accidentally behave as settlement.

A replacement candidate can be invited without joining.

Therefore:

Replacement selected
→ no replacement wallet cost yet

Replacement joins
→ replacement receives the applicable wallet share

The participant lifecycle and wallet lifecycle must remain separate but coordinated.

F. Multiple plans with the same person

A person can owe money from several plans.

Example:

Play 365     +₹100
Koi           +₹50
Total        +₹150

The system must clearly define whether the current Settle Up action means:

Settle all ₹150 with this person

or:

Settle only Play 365's ₹100

The People-level action should be relationship-level if that is the intended product behavior.

The Plans-level view should retain plan-level context.

G. Positive/negative balance confusion

The system should consistently calculate direction:

+₹100 → They owe you
-₹100 → You owe them

The wording and available actions must follow the actual calculated direction.

H. Zero balance

A person with:

₹0

should not have an active settlement action.

Once all applicable obligations are settled, the outstanding balance should disappear from the active Wallet view.

I. Self-balances

The system should never create:

creditor_id = debtor_id

A user should never owe themselves money.

This should be protected at the business/data layer.

J. Cancelled or deleted plans

If a plan or expense is cancelled after creating a wallet obligation, there must be a deterministic rule for what happens to that obligation.

Cancellation must not leave an orphaned balance that can still be settled indefinitely.

12. Wallet Is Not a Payment Processor

The Planless Wallet records and manages shared financial obligations.

It does not mean that pressing Settle Up sends money through Planless.

The conceptual flow is:

Expense created
        ↓
Planless calculates who owes whom
        ↓
Outstanding balance exists
        ↓
Creditor receives payment outside/independently
        ↓
Creditor chooses Settle Up
        ↓
Planless closes the obligation

Therefore Settle Up should be understood as:

"I have received/confirmed this money, and I am closing the outstanding obligation."

It should not mean:

"Planless is sending this money now."

13. Core Wallet Rules

Rule

Behavior

People

Shows person-to-person outstanding balances

Plans

Shows outstanding balances grouped by plan

Positive balance

They owe you

Negative balance

You owe them

Who can settle?

The person who is owed

Who cannot settle?

The person who owes

Partial settlement

Not supported

Full settlement

Required

Settlement

Closes the entire applicable outstanding amount

Already settled

Cannot be settled again

Replacement invited

No new wallet cost yet

Replacement joined

New participant receives applicable wallet share

Authorization

Enforced server-side

Settlement state

Re-validated against current database state

Duplicate settlement

Prevented atomically

14. Core Product Philosophy

The simplest definition of the Planless Wallet is:

Planless calculates who owes whom. The person who is owed controls when that debt is closed. Settlement is always complete, never partial.

This gives the creditor the final say over whether an outstanding obligation has actually been resolved while keeping wallet balances tied to the actual plan and expense data.