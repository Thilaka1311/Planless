Paid Plan Leave Decisions — Implementation Plan
Objective

Move all pending paid-plan leave decisions out of the Plan Activity Timeline and into the Host Participant Management screen.

The Participant Management screen should become the only place where the host makes decisions about participants who want to leave.

The Activity Timeline should only show the result/history of those decisions.

1. Pending Decision Component

Add a new Pending Decisions component to the Host Participant Management screen.

Placement:

Plan Size → Pending Decisions → Joined / Waitlist Toggle → Participants

This component should only appear when there is at least one participant with:

leave_requested = true

It should be completely hidden when there are no pending requests.

This is host-only. Normal participants should never see it.

2. What the Component Shows

Each participant who has requested to leave should appear similarly to the existing participant rows.

For example:

Pending Decision

Thilak Sundar
Wants to leave this plan

Actions:

Replace Participant
Keep Payment

If multiple people have requested to leave, show each person separately with their own two actions.

3. Replace Participant

When the host selects Replace Participant, open the existing Friend Selector / Add Participants screen.

Do not create another replacement screen.

Use the replacement mode that has already been implemented:

Title: Replace Thilak Sundar
Only one person can be selected.
The selected friend remains visibly selected.
The host confirms the replacement.

After confirmation:

Original participant

The participant being replaced must become:

rsvp_status = SKIPPED
skip_reason = REPLACED
leave_requested = false

They must no longer appear in the Joined section.

Replacement participant

The selected friend must become:

rsvp_status = INVITED

They must appear in the Invited section.

They must not become Joined immediately.

They must not go to the Waitlist.

They should follow the existing invitation flow and only become Joined after accepting the invitation.

4. Keep Payment

When the host selects Keep Payment, the participant is allowed to leave the plan, but their existing financial obligation remains.

The participant becomes:

rsvp_status = SKIPPED
skip_reason = LEFT
leave_requested = false

The important part is that their Wallet obligation is not cleared.

For example:

Plan Participant

Thilak Sundar
SKIPPED / LEFT

But in Wallet:

Thilak Sundar
₹150 outstanding

The existing Wallet expense participant should remain.

Do not:

Delete the wallet record.
Set the amount to zero.
Mark it as settled.
Remove the expense.

The financial obligation remains because the host chose to keep the payment.

5. Wallet Synchronization

Wallet should reflect the result of the host's decision.

Keep Payment

The participant leaves the plan, but the Wallet remains outstanding.

Conceptually:

plan_participants

Thilak Sundar → SKIPPED / LEFT

wallet_expense_participants

Thilak Sundar → ₹150 outstanding

Replace Participant

The original participant becomes:

SKIPPED / REPLACED

Their existing Wallet obligation should remain untouched for now.

The replacement participant becomes:

INVITED

Do not create duplicate Wallet expenses or clear the original obligation as part of this change.

6. Activity Timeline

Remove all actionable leave-request UI from the Activity Timeline.

It should no longer show things such as:

Thilak wants to leave

with:

Replace Participant
Keep Payment

The Activity Timeline should not be used to make decisions.

Instead:

Participant Management = Action

Activity Timeline = History

7. Activity After Resolution

After the host makes a decision, the Activity Timeline can show the resulting event.

For replacement:

Thilak was replaced

For Keep Payment:

Thilak left the plan — payment retained

The exact wording should follow the existing Plan Activity style.

The important thing is that these are historical records only.

They should not contain decision buttons.

The activity should remain in the timeline rather than disappearing.

8. Leave Request State

The pending state continues to use:

plan_participants.leave_requested

When the participant requests to leave:

leave_requested = true

The Pending Decisions component appears for the host.

After the host resolves it:

leave_requested = false

This applies to both:

Replace Participant
Keep Payment
9. Multiple Requests

The component should support multiple pending leave requests independently.

For example:

Pending Decisions

Thilak Sundar
Wants to leave this plan
[Replace Participant] [Keep Payment]

Pranav
Wants to leave this plan
[Replace Participant] [Keep Payment]

Each request should be resolved independently.

Resolving one request must not affect the others.

10. Backend Requirements

The host decision must be handled atomically.

For Replace Participant:

Original:

JOINED → SKIPPED / REPLACED

Replacement:

→ INVITED

For Keep Payment:

Original:

JOINED → SKIPPED / LEFT

Wallet:

UNCHANGED

The backend must verify that:

The user making the decision is the plan host.
The target participant belongs to the plan.
The target participant has an active leave request.
The replacement candidate is eligible.
The replacement candidate is not already Joined.
The replacement candidate is not the same person being replaced.

Do not rely only on frontend checks.

11. UI Structure

The Host Participant Management screen should effectively become:

Plan Size

↓

Pending Decisions
People who need a host decision

↓

Joined / Waitlist Toggle

↓

Invite Participants

↓

Participant List

The Pending Decisions section disappears when there are no outstanding requests.

12. Important Rules

Do not:

Create another leave-request table.
Create another replacement table.
Add notifications.
Allow the leaving participant to choose their replacement.
Allow participants to make replacement decisions.
Automatically Join the replacement.
Put the replacement on the Waitlist.
Clear Wallet obligations when Keep Payment is selected.
Put decision buttons in the Activity Timeline.
Change the existing normal Add Participants flow.

Reuse the existing:

plan_participants
leave_requested
skip_reason
plan_activity
Wallet tables
Friend Selector
Participant Management screen
Existing invitation system
Final Architecture

Participant requests to leave

→ leave_requested = true

→ Host Participant Management

→ Host chooses:

Replace Participant

→ Original: SKIPPED / REPLACED
→ Replacement: INVITED

OR

Keep Payment

→ Original: SKIPPED / LEFT
→ Wallet obligation remains outstanding

→ Activity Timeline

→ Show only the final result as history.

Core principle

Participant Management = Decisions

Wallet = Financial State

Activity Timeline = History