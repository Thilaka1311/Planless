Planless — Paid Plan Leave Request Flow

Scope

This plan covers only the flow where a participant wants to leave a paid plan and the host is notified and decides what happens next.

It does not cover:

General Wallet implementation

Additional expenses

Normal free-plan leaving

Replacement creation by participants

Payment processing

No-show/attendance handling

Other Wallet features

1. Core Rule

For a paid plan:

A participant cannot add or choose their own replacement.

If a participant wants to leave, they only communicate their intention to the host.

The host has complete control over what happens next.

The host can:

Replace the participant

Keep the participant's payment as a cover charge

The participant does not select, invite, or approve the replacement.

2. Participant Flow

When a participant is already part of a paid plan and wants to leave:

Participant opens plan
        ↓
Selects "Leave Plan"
        ↓
Participant confirms they want to leave
        ↓
Leave request is created
        ↓
Host is notified
        ↓
Participant waits for host decision

The participant's action should be treated as a request, not an immediate departure.

Important

Do not immediately:

Remove the participant

Remove their wallet obligation

Change the slot

Add a replacement

Refund their money

The host must decide what happens first.

3. Participant Confirmation

Before submitting the request, show a confirmation dialog.

Suggested wording:

Title

Leave Plan?

Message

We'll let the host know that you want to leave this plan. The host will decide what happens to your spot and payment.

Buttons:

Request to Leave

Cancel

The participant should understand that pressing the button does not immediately complete the departure.

4. Request State

After the participant submits the request, the system should record that they have requested to leave.

Suggested state:

leave_requested

This should be separate from:

LEFT

The participant is not yet left.

Example:

Participant RSVP:
JOINED

Leave request:
PENDING

This distinction is important.

The participant remains part of the plan until the host makes a decision.

5. Participant UI After Request

After submitting the request, the participant should see that the request is pending.

Suggested wording:

Leave request sent

The host has been notified. You'll leave the plan once the host decides what to do with your spot and payment.

The participant should not be able to repeatedly submit the same request.

The UI should prevent duplicate leave requests.

6. Host Notification

When a participant requests to leave, the host receives a notification.

Example:

Thilak wants to leave Koi

Supporting text:

They've requested to leave the plan. Decide what to do with their spot and payment.

The notification should take the host directly to the relevant plan/leave request.

7. Host Decision

When the host opens the request, they should see:

Thilak wants to leave

Plan: Koi
Cost: ₹150 / person

What would you like to do?

The host has two choices.

Option A — Replace the Participant

Only the host can initiate the replacement.

The host chooses the replacement participant.

The participant who originally requested to leave does not choose the replacement.

Flow:

Participant requests to leave
        ↓
Host receives notification
        ↓
Host chooses "Replace"
        ↓
Host selects/adds replacement
        ↓
Replacement becomes the new participant
        ↓
Original participant is removed/released
        ↓
Original participant's payment is handled as a refund
        ↓
Replacement receives the plan cost obligation

The replacement flow itself can be implemented separately. This document only establishes that the host is the person who starts it.

Option B — Keep as Cover Charge

The host can decide not to replace the participant.

The host keeps the participant's paid amount as a cover charge.

Flow:

Participant requests to leave
        ↓
Host receives notification
        ↓
Host chooses "Keep as Cover Charge"
        ↓
Participant leaves
        ↓
Host keeps the paid amount
        ↓
Wallet records the amount as COVER_CHARGE

The participant should no longer have an outstanding wallet obligation.

The original payment should remain in financial history.

8. Host Decision Dialog

Suggested UI:

Title

Thilak wants to leave

Supporting text

What would you like to do with their spot and payment?

Actions:

Replace Participant

Keep as Cover Charge

Potential secondary action:

Cancel

If the host cancels/closes the dialog, nothing changes.

The leave request remains pending.

9. Important State Transitions

The flow should be explicit.

Initial state

RSVP: JOINED
Leave request: NONE
Wallet: PENDING / SETTLED

Participant requests leave

RSVP: JOINED
Leave request: PENDING
Wallet: unchanged

Host chooses replacement

Final state:

Original participant:
RSVP → LEFT
Leave request → RESOLVED

Replacement:
RSVP → JOINED
Wallet → owes host the plan cost

The exact refund/financial transition should be handled by the replacement flow.

Host chooses cover charge

Final state:

Original participant:
RSVP → LEFT
Leave request → RESOLVED

Wallet:
Payment → COVER_CHARGE

10. Do Not Change Financial State Too Early

The most important implementation rule is:

Requesting to leave must not automatically change the Wallet.

When the participant presses "Request to Leave":

Leave request = PENDING

Nothing else should be financially settled, refunded, or removed yet.

Only after the host chooses an outcome should the corresponding wallet operation occur.

This prevents situations such as:

Participant requests leave
        ↓
Wallet obligation disappears
        ↓
Host later decides to keep the payment

The wallet should remain accurate throughout the pending state.

11. Host-Only Authority

The backend must enforce the host-only rule.

Do not rely only on hiding UI controls.

The backend must verify:

requesting_user = plan participant

for creating a leave request.

And:

acting_user = plan host

for resolving the request.

A normal participant must not be able to:

Choose a replacement

Approve their own replacement

Resolve their own leave request

Mark their payment as refunded

Mark their payment as a cover charge

The host is the decision-maker.

12. Notifications

At minimum, create a notification for the host when a participant requests to leave.

Example:

Type:
PLAN_LEAVE_REQUEST

Recipient:
Plan host

Actor:
Participant requesting leave

Plan:
Koi

Message:
"Thilak wants to leave Koi."

The notification should link to the relevant plan and pending leave request.

After the host resolves the request, the participant should receive a notification about the outcome.

Replacement

Your request to leave Koi was approved.

Cover charge

Your request to leave Koi was approved. Your payment was kept as a cover charge.

The exact replacement/refund wording can be refined when that flow is implemented.

13. Duplicate Request Protection

A participant should only have one active leave request per plan.

If:

leave_requested = true

then pressing "Leave Plan" again should not create another request.

The UI should instead show:

Leave request pending

The database/backend should also enforce this where practical.

14. Cancellation of a Pending Request

For the first implementation, keep this simple.

The participant can request to leave.

The host receives the request.

The host decides.

If cancellation of a pending request is needed later, it should be introduced as a separate state transition:

PENDING → CANCELLED

Do not silently delete the request.

For the initial implementation, cancellation by the participant is optional and should not be added unless explicitly required.

15. Edge Cases

Participant requests leave twice

Prevent duplicate requests.

Participant requests leave after the plan has ended

Do not allow the request.

Participant requests leave from a free plan

This paid-plan flow should not be used. Free-plan leaving remains a separate normal leave flow.

Host opens the request after the participant has already been removed

The backend should validate the current participant/request state before applying the host decision.

Two host actions happen at the same time

The backend should make the resolution atomic so that only one outcome can win.

For example:

PENDING → COVER_CHARGE

and

PENDING → REPLACED

must not both succeed.

16. Recommended Data State

The exact schema should be determined after auditing the existing database.

Conceptually, the system needs:

leave_request
    id
    plan_id
    participant_id
    status
    created_at
    updated_at
    resolved_at
    resolved_by
    resolution

Possible request statuses:

PENDING
RESOLVED
CANCELLED

Possible resolutions:

REPLACED
COVER_CHARGE

Do not add these fields blindly. First inspect the existing schema and determine whether an existing participant/request/notification structure can represent them cleanly.

17. Backend Operations

Prefer explicit backend operations rather than several independent frontend updates.

Create leave request

request_plan_leave(plan_id)

Validates:

User is a participant.

User is not the host.

Plan is still active.

No existing pending leave request exists.

Creates:

leave_request = PENDING

Creates host notification.

Does not change wallet state.

Resolve leave request

Conceptually:

resolve_plan_leave(request_id, resolution)

Validates:

Acting user is the host.

Request is still pending.

Participant is still in the expected state.

Then atomically applies the selected resolution.

18. Implementation Sequence

Step 1 — Audit Existing Code

Inspect:

plan_participants

Existing leave/skip logic

leave_plan RPC

Notification system

Plan host identification

Existing Wallet state

Existing participant cost logic

Existing leave-related UI

Do not rewrite existing leave logic until the current flow is understood.

Step 2 — Add Leave Request State

Introduce the smallest possible representation for:

PENDING
RESOLVED

and:

REPLACED
COVER_CHARGE

if the existing schema cannot represent them.

Step 3 — Participant Request Flow

Implement:

Leave Plan
    ↓
Confirmation dialog
    ↓
Request submitted
    ↓
Host notification
    ↓
Participant sees pending state

Step 4 — Host Request Flow

Implement:

Notification
    ↓
Leave request
    ↓
Replace Participant
    OR
Keep as Cover Charge

Only the host can perform these actions.

Step 5 — Connect Wallet

Only when the host resolves the request:

Replacement → refund/reassign financial responsibility according to the replacement flow.

Cover charge → mark the paid amount as cover charge.

Do not modify Wallet state at request creation.

Step 6 — Notifications

Implement:

Host receives leave request.

Participant receives resolution.

Step 7 — Testing

Test:

Participant

Can request leave.

Cannot create replacement.

Cannot resolve request.

Cannot submit duplicate request.

Sees pending state.

Host

Receives notification.

Can open request.

Can replace participant.

Can keep payment as cover charge.

Cannot resolve the same request twice.

Wallet

Requesting leave does not change wallet.

Replacement applies the correct financial transition.

Cover charge applies the correct financial transition.

Historical payment remains intact.

Security

Attempt the host resolution operation as a non-host and verify that the backend rejects it.

19. Final Product Flow

The entire feature should feel like this:

PARTICIPANT

"I want to leave."
        ↓
Request to Leave
        ↓
"Your request has been sent to the host."
        ↓
Wait

HOST

"Thilak wants to leave Koi."
        ↓
What do you want to do?
        ↓
┌───────────────────────┐
│ Replace Participant   │
│ Keep as Cover Charge  │
└───────────────────────┘

The central product rule is:

The participant asks to leave. The host decides what happens to their spot and payment. Only the host can initiate a replacement.