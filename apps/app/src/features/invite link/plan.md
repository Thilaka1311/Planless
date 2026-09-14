Planless — Invite by Link

1. Feature Goal

Allow a host to share a Planless plan through a link.

When someone opens the link:

If they already have a Planless account, the plan is added to their Home feed and they become an INVITED participant.

If they do not have an account, they complete the normal sign-up/login and onboarding flow first. After onboarding, the shared plan is added to their Home feed and they become an INVITED participant.

The link is an alternative invitation path to the existing friend-based invitation flow.

2. Core User Flows

Case A — Existing User

Shared Plan Link → Planless → Authenticated User → Resolve Plan → Ensure INVITED Participant → Home

Expected:

Resolve the shared plan.

Create or reuse the user's plan_participants relationship.

Set the RSVP state to INVITED only when appropriate.

Show the plan on Home.

Do not automatically make the user JOINED.

Case B — New User

Shared Plan Link → Authentication → Existing Onboarding → Restore Pending Link → Ensure INVITED Participant → Home

Expected:

Preserve the shared-plan context during authentication and onboarding.

After onboarding completes, process the pending plan link.

Add the user as INVITED.

Show the plan on Home.

Do not automatically join the plan.

3. Link / Routing

Use the existing Planless plan routing/deep-link architecture where possible.

Do not create a second competing plan URL system.

The link must work for authenticated and unauthenticated users.

The plan reference must survive authentication and onboarding.

Re-opening the same link must be safe and idempotent.

If a dedicated share token is required, use an opaque token rather than exposing sensitive internal data.

Follow the existing Planless plan URL/name-routing convention.

4. Database

The existing public.plan_participants relationship is the source of truth for the user's relationship with a plan.

The current architecture uses participant roles rather than plans.host_id; the plan creator is represented through a HOST participant. fileciteturn19file0L1-L8

Before changing the database, audit the current schema and RPCs.

For a valid link invitation, the expected relationship is conceptually:

plan_id       = referenced plan
user_id       = authenticated user
rsvp_status   = INVITED
role          = normal participant role

Important:

Do not create duplicate plan_participants rows.

Do not overwrite an existing JOINED, WAITLISTED, or other meaningful participant state just because a user opened a link.

Reuse an existing secure RPC if one already supports this operation.

Add a narrowly scoped RPC/migration only if the current database does not support the feature safely.

Preserve the existing friend invitation flow.

5. Authentication + Onboarding

Existing User

If authenticated:

Link → Resolve Plan → Ensure INVITED Participant → Home

No onboarding should be shown.

New User

If unauthenticated:

Link → Store Pending Invite → Authentication → Existing Onboarding → Process Pending Invite → Home

The pending invite must survive the complete existing authentication/onboarding flow.

Do not create the participant until a real authenticated user exists.

Do not store OTPs or authentication secrets in pending invite state.

6. Participant State Rules

The link invitation means INVITED, not automatically joined.

Examples:

Existing State

Opening Link

No participant

Create INVITED

INVITED

No change

JOINED

Keep JOINED

WAITLISTED

Keep existing state

SKIPPED

Follow existing RSVP/rejoin rules; do not silently overwrite

The existing waitlist system promotes participants based on vacancies and queue ordering, so the link flow must not bypass those rules. fileciteturn18file0L1-L8

7. Home Feed

After successful processing:

The plan appears on the user's Home feed.

It is represented as an invited plan.

No manual refresh should be required.

Reuse the existing Home feed participant filtering/state logic.

Do not create a parallel feed implementation.

If the plan is cancelled, completed, invalid, or otherwise unavailable according to existing lifecycle rules, follow those existing rules.

8. Idempotency

The operation must be safe to repeat.

First open

No participant
→ Create INVITED participant
→ Plan appears on Home

Same link opened again

INVITED already exists
→ No duplicate row
→ No state reset

Already joined

JOINED already exists
→ Keep JOINED

The same principle applies to existing waitlisted/skipped participants: never silently downgrade or overwrite their state.

9. Security

Opening a link must only provide the ability to become an invited participant.

It must not:

Automatically join the plan.

Bypass capacity or waitlist rules.

Grant host permissions.

Expose private participant information.

Bypass RLS.

Allow arbitrary plan modification.

Participant creation must use the existing security model or a narrowly scoped secure RPC.

10. Frontend Areas to Audit

Audit the existing implementation before making changes.

Inspect:

Plan route/deep-link handling.

Authentication state.

Existing email/OTP flow.

Onboarding completion state.

Home feed loading/filtering.

plan_participants mapping.

Existing invitation hooks/functions.

Supabase RPC layer.

Navigation/state restoration.

Prefer reusing existing participant and navigation logic rather than creating parallel systems.

11. Pending Invite State

For unauthenticated users:

Capture the shared-plan reference when the link opens.

Preserve it through authentication.

Preserve it through onboarding.

Process it after onboarding succeeds.

Clear it after successful processing.

Safely clear invalid/unavailable invite context.

The pending state should contain only the information required to resolve the invitation.

12. Error Handling

Handle:

Invalid link.

Plan not found.

Plan unavailable/cancelled.

User already participating.

Authentication interruption.

Onboarding interruption.

Participant creation failure.

Network failure.

Never show the plan as successfully invited if the database operation failed.

13. Implementation Phases

Phase 1 — Audit

Trace the current plan routing.

Trace authentication and onboarding.

Trace Home feed participant filtering.

Inspect plan_participants.

Inspect existing invitation RPCs.

Identify the canonical RSVP state source.

Determine whether a database migration/RPC is actually required.

Phase 2 — Link Resolution

Add/reuse the share-link route.

Resolve the referenced plan.

Support authenticated and unauthenticated entry.

Preserve the pending link through auth/onboarding.

Phase 3 — Participant Invitation

Ensure the authenticated user has the correct INVITED relationship.

Make the operation idempotent.

Preserve existing participant states.

Use secure database-side authorization.

Phase 4 — Home Integration

Ensure invited plans appear on Home.

Update Home state without requiring a refresh.

Reuse existing feed logic.

Phase 5 — New User Flow

Test:

Shared Link → Sign Up → OTP → Onboarding → INVITED Participant → Home

Ensure the link is not lost at any stage.

Phase 6 — Verification

Test:

Existing user opens a valid link.

Existing user opens the same link twice.

New user opens the link and completes onboarding.

New user abandons onboarding and returns later.

Existing joined participant opens the link.

Existing waitlisted participant opens the link.

Existing skipped participant opens the link.

Invalid link.

Cancelled/unavailable plan.

Network failure during invitation.

Home updates without refresh.

14. Acceptance Criteria

The feature is complete when:

A valid shared link resolves to the correct plan.

Existing users receive the plan as INVITED.

New users retain the link through authentication and onboarding.

New users receive the plan as INVITED after onboarding.

The invited plan appears on Home.

Opening a link never automatically joins the plan.

Duplicate participant rows cannot be created.

Existing participant states are not incorrectly overwritten.

Existing friend-based invitations continue working.

Existing authentication/onboarding behavior remains unchanged.

Invalid/unavailable plans are handled safely.

No RLS/security bypass is introduced.

15. Constraints

Do not rewrite the existing authentication flow.

Do not create a second participant-state system.

Do not automatically convert an invited user to JOINED.

Do not bypass capacity or waitlist rules.

Do not modify unrelated plan lifecycle behavior.

Do not add database changes until the existing schema/RPCs have been audited.

Prefer a focused implementation over a broad rewrite.

16. Deliverables

Shareable plan-link flow.

Existing-user invitation handling.

New-user pending-link handling.

Post-onboarding invitation processing.

INVITED participant creation/ensuring.

Home feed integration.

Required Supabase migration/RPC only if the audit proves it is necessary.

Verification of all acceptance cases.