# Planless — Unified Assigned & Automatic Waitlist Plan

## 0. Objective

Establish one clear, explicit state model for both waitlist modes:

- **Assigned Waitlist** = host-controlled ordering/placement.
- **Automatic Waitlist** = first-come-first-served ordering based on `joined_queue_at`.

The two modes must not mix their ordering mechanisms.

### Fundamental rules

| Concept | Assigned Waitlist | Automatic Waitlist |
|---|---|---|
| Who controls ordering? | Host | System / join time |
| Ordering source | Manual participant arrangement | `joined_queue_at` |
| `assigned_group` | Used | Always `NULL` |
| `joined_queue_at` | `NULL` | Used |
| Host can manually move Joined ↔ Waitlist? | Yes | No |
| Host can directly change RSVP? | No | No |
| Automatic promotion? | No | Yes, according to queue |
| Participant RSVP | Participant-controlled | Participant-controlled |

The implementation must preserve this distinction throughout the frontend,
hooks, RPCs, PostgreSQL functions, triggers, realtime state, and UI.

---

# 1. Core Participant State Model

There are two separate concepts.

## 1.1 RSVP status

`rsvp_status` represents the participant's actual RSVP state.

Relevant values:

- `INVITED`
- `JOINED`
- `WAITLISTED`
- `SKIPPED`

The participant controls their own RSVP.

The host must not have a generic ability to change another participant's RSVP.

### Host exception

The host/system may transition a participant to `SKIPPED` only through the
existing explicit removal/replacement/leave-request flows:

- Remove participant
- Replace participant
- Payment kept from a leave request
- Participant replaced through a leave-request resolution

Ordinary movement must never be used to arbitrarily change RSVP.

---

# 2. Assigned Group

`assigned_group` is used ONLY by Assigned Waitlist.

Allowed values:

- `GOING`
- `WAITLIST`
- `NULL`

## Assigned mode invariant

```text
waitlist_mode = ASSIGNED
→ assigned_group may be GOING / WAITLIST / NULL
→ joined_queue_at = NULL
```

The host decides participant placement and waitlist order through the existing
manual arrangement functionality.

---

# 3. Joined Queue Timestamp

`joined_queue_at` is the ordering mechanism for Automatic Waitlist.

## Automatic mode invariant

```text
waitlist_mode = AUTOMATIC
→ assigned_group = NULL
→ joined_queue_at is the source of queue ordering
```

The system must not use `assigned_group` to determine Automatic waitlist order.

The earlier a participant accepts/joins, the earlier their `joined_queue_at`
value, and therefore the earlier their position in the Automatic queue.

---

# 4. Assigned Waitlist Behavior

## 4.1 Host controls assignment

The host can manually arrange participants between:

- `GOING`
- `WAITLIST`
- `NULL`

This is already implemented and working and should remain the source of truth
for Assigned ordering.

The host's movement controls affect assignment.

They do not provide general RSVP editing privileges.

---

# 5. Assigned Waitlist — Invited Participant

If:

```text
rsvp_status = INVITED
```

then moving the participant between assigned groups changes ONLY
`assigned_group`.

### Going → Waitlist

Before:

```text
assigned_group = GOING
rsvp_status = INVITED
```

After:

```text
assigned_group = WAITLIST
rsvp_status = INVITED
```

### Waitlist → Going

Before:

```text
assigned_group = WAITLIST
rsvp_status = INVITED
```

After:

```text
assigned_group = GOING
rsvp_status = INVITED
```

### Critical rule

The host moving an invited participant does NOT mean that the participant
accepted the plan.

Never perform:

```text
INVITED → JOINED
```

or:

```text
INVITED → WAITLISTED
```

as a side effect of host assignment.

---

# 6. Assigned Waitlist — Joined / Waitlisted Participant

When the participant already has an active RSVP state, assignment and RSVP
remain synchronized with the movement.

## Joined → Waitlist

```text
assigned_group: GOING → WAITLIST
rsvp_status: JOINED → WAITLISTED
```

## Waitlisted → Going

```text
assigned_group: WAITLIST → GOING
rsvp_status: WAITLISTED → JOINED
```

This is a state synchronization rule for participants who have already
interacted with the plan; it is not a generic host RSVP-editing capability.

---

# 7. Assigned Waitlist — RSVP Matrix

| Current RSVP | Host Action | `assigned_group` after | RSVP after |
|---|---|---|---|
| `INVITED` | Going → Waitlist | `WAITLIST` | `INVITED` |
| `INVITED` | Waitlist → Going | `GOING` | `INVITED` |
| `INVITED` | Move to NULL | `NULL` | `INVITED` |
| `JOINED` | Going → Waitlist | `WAITLIST` | `WAITLISTED` |
| `WAITLISTED` | Waitlist → Going | `GOING` | `JOINED` |
| `JOINED` | Stay/Move Going | `GOING` | `JOINED` |
| `WAITLISTED` | Stay/Move Waitlist | `WAITLIST` | `WAITLISTED` |
| Any applicable state | Remove/Replace exception | Flow-dependent | `SKIPPED` when required |

---

# 8. Automatic Waitlist Behavior

Automatic Waitlist is fundamentally different.

The host does **not** have a free manual movement action for:

```text
JOINED → WAITLIST
```

or:

```text
WAITLIST → JOINED
```

The system determines placement automatically based on first-come-first-served
ordering.

Therefore there is no reason to use `assigned_group` in Automatic mode.

---

# 9. Automatic Waitlist Ordering

The source of truth is:

```text
plan_participants.joined_queue_at
```

When a participant accepts/joins the plan, their queue timestamp determines
their position in the Automatic queue.

Example:

```text
A joined_queue_at = 10:00
B joined_queue_at = 10:03
C joined_queue_at = 10:07
D joined_queue_at = 10:10
```

If capacity is 3:

```text
Joined:
A
B
C

Waitlist:
D
```

The queue position is derived from `joined_queue_at`.

Do not introduce an additional Automatic ordering field.

---

# 10. Automatic Waitlist — `assigned_group`

This is a strict invariant:

```text
Automatic plan
→ assigned_group = NULL
```

This must be true for every participant in an Automatic plan.

Do not:

- assign `GOING`
- assign `WAITLIST`
- calculate order from `assigned_group`
- preserve an old Assigned `assigned_group`
- update `assigned_group` during promotion
- update `assigned_group` during demotion
- use `assigned_group` in Automatic rendering

If an Automatic plan contains historical participant rows with a non-null
`assigned_group`, those rows need to be cleaned safely.

---

# 11. Automatic Waitlist — Participant RSVP

Participants still control their RSVP.

The system may determine whether a participant is currently in the available
capacity or the waitlist based on:

- capacity
- RSVP participation
- `joined_queue_at`
- first-come-first-served ordering

But the host does not get a manual "Move to Going" / "Move to Waitlist"
control in Automatic mode.

---

# 12. Automatic Participant Management Bottom Sheet

For Automatic Waitlist, the participant-management bottom sheet should only
show the actions that actually make sense.

The options are:

- **Remove from Plan**
- **Make Host**
- **Cancel**

Do NOT show:

- Move to Going
- Move to Waitlist
- Assign to Going
- Assign to Waitlist
- Manual waitlist ordering
- Any other manual placement action

The system handles Automatic placement.

---

# 13. Automatic Removal Rule — Minimum Plan Size

A Planless plan must have at least two participants to continue.

Therefore, when removing the **last participant other than the host**, the host
must not be allowed to simply remove them and leave the plan with only the
host.

The UI must require a replacement.

The flow should ask the host to replace that participant with another eligible
friend.

Expected concept:

```text
Host
+
One remaining participant
        ↓
Remove participant
        ↓
Replacement required
        ↓
Select eligible friend
        ↓
Replacement participant is invited
```

Use the existing replacement/leave-request implementation where applicable
rather than creating a second replacement system.

---

# 14. Automatic Capacity Logic

Automatic Waitlist is capacity-driven.

Example:

```text
Capacity = 3

Queue:
A
B
C
D
E
```

Expected:

```text
A → Joined
B → Joined
C → Joined
D → Waitlist
E → Waitlist
```

If a Joined participant leaves and a capacity slot becomes available, the
system may automatically promote the earliest eligible participant according
to `joined_queue_at`.

The host does not manually choose the next participant.

---

# 15. Automatic Queue Invariants

The Automatic queue must be deterministic.

For eligible participants:

```text
ORDER BY joined_queue_at ASC
```

The earlier join timestamp gets the earlier position.

Do not:

- reorder based on UI order
- reorder based on participant name
- reorder based on `assigned_group`
- assign manual waitlist numbers
- create a second queue mechanism

If two timestamps are identical, use a deterministic secondary ordering such
as participant row ID, but only if required by the existing schema/implementation.

---

# 16. Assigned vs Automatic Data Invariants

This distinction must be enforced everywhere.

## Assigned

```text
assigned_group = GOING / WAITLIST / NULL
joined_queue_at = NULL
```

The host manually determines assignment/order.

## Automatic

```text
assigned_group = NULL
joined_queue_at = populated for participants who have joined/entered the queue
```

The system determines placement/order.

Do not populate both ordering mechanisms for the same mode.

---

# 17. Database / RPC Audit

Audit every RPC/function that reads or writes `plan_participants`.

Specifically inspect:

- participant invitation
- participant acceptance
- participant joining
- waitlist insertion
- waitlist promotion
- participant removal
- participant replacement
- leave-request resolution
- capacity changes
- participant movement
- host transfer
- participant addition
- any Automatic promotion logic
- any Assigned manual movement logic

For every function, determine whether it belongs to:

- Assigned
- Automatic
- Shared behavior

Then enforce the correct data invariant.

---

# 18. Assigned RPC Rules

Assigned movement RPCs may modify:

```text
assigned_group
```

and, for already active `JOINED` / `WAITLISTED` participants, the corresponding
RSVP state according to the matrix above.

For `INVITED` participants, ordinary movement must preserve:

```text
rsvp_status = INVITED
```

Do not allow an Assigned movement RPC to blindly overwrite RSVP.

---

# 19. Automatic RPC Rules

Automatic promotion/demotion logic must NOT write `assigned_group`.

Any Automatic RPC that currently contains:

```sql
assigned_group = ...
```

must be audited and corrected.

For Automatic participants:

```sql
assigned_group = NULL
```

must remain the invariant.

Automatic ordering must instead use:

```text
joined_queue_at
```

---

# 20. Existing Automatic Data Cleanup

Before changing existing data:

1. Count Automatic plans.
2. Count Automatic `plan_participants` rows.
3. Find Automatic rows where `assigned_group IS NOT NULL`.
4. Review whether any application logic still depends on those values.
5. Set invalid Automatic `assigned_group` values to `NULL`.

Do not modify Assigned rows.

Do not delete participant history.

Do not alter `joined_queue_at` unless the audit proves it is invalid.

---

# 21. Frontend Rendering Rules

The architecture already separates:

- `PlanParticipantManagementWrapper.tsx` — data fetching, bottom sheets,
  leave requests, backend operations.
- `ParticipantManagementScreen.tsx` — thin mode router.
- `AssignedParticipantScreen.tsx` — Assigned UI.
- `AutomaticParticipantScreen.tsx` — Automatic UI.

Preserve this architecture.

The mode router can continue selecting the appropriate screen.

Assigned UI:

- manual placement controls
- Joined/Waitlist movement
- manual arrangement

Automatic UI:

- no manual movement controls
- system-controlled ordering
- appropriate participant actions only

Do not duplicate backend business logic inside either screen.

---

# 22. Bottom Sheet Rules

## Assigned

The participant action bottom sheet may expose the existing Assigned actions
according to participant state, including:

- Move to Going
- Move to Waitlist
- Remove from Plan
- Make Host
- Replace Participant where applicable
- Cancel

The exact conditional visibility must follow the existing working Assigned
implementation.

## Automatic

Only:

- Remove from Plan
- Make Host
- Cancel

Manual movement actions must not appear.

---

# 23. Activity Logging

Use the current Phase 3 activity enum values.

Assigned manual movement:

```text
WAITLIST → GOING
```

should generate:

```text
participant_moved_to_joined
```

Assigned:

```text
GOING → WAITLIST
```

should generate:

```text
participant_moved_to_waitlist
```

Automatic promotion should generate the appropriate activity for the actual
system transition, without pretending the host manually assigned the
participant.

Do not reintroduce legacy enum values such as:

- `participant_added`
- `participant_moved`
- `participant_promoted`
- `participant_invited`
- `leave_requested`
- `capacity_changed`

unless they are valid in the current enum. The current Phase 3 activity
system is the source of truth.

---

# 24. Realtime / Cache Rules

After a movement or automatic promotion:

1. Database state is authoritative.
2. Realtime updates must not duplicate the participant.
3. Local state must not apply the same mutation twice.
4. Refetching must reconstruct the same state.
5. Automatic ordering must be recomputed from `joined_queue_at`.
6. Assigned ordering must be reconstructed from `assigned_group` / existing
   manual ordering.

Avoid optimistic updates that conflict with RPC results or realtime events.

---

# 25. Important Edge Cases

## Assigned — invited participant moved

```text
INVITED + GOING
→ INVITED + WAITLIST
```

No RSVP mutation.

## Assigned — last waitlisted participant moved to Going

If there is one waitlisted participant and they are moved to Going:

```text
Waitlist = 1
→ Waitlist = 0

Joined increases by exactly 1
```

No duplicate participant or double count.

## Automatic — full capacity

When capacity is full:

```text
remaining eligible participants → waitlist
```

according to `joined_queue_at`.

## Automatic — capacity becomes available

The earliest eligible participant should be promoted automatically according to
the queue.

The host should not manually select the participant.

## Automatic — final non-host participant removal

Replacement must be requested so the plan does not end up with fewer than two
participants.

---

# 26. Testing Matrix

## Assigned

### Invited

- [ ] Going → Waitlist changes only `assigned_group`
- [ ] Waitlist → Going changes only `assigned_group`
- [ ] RSVP remains `INVITED`

### Joined

- [ ] Going → Waitlist changes `assigned_group` and `JOINED → WAITLISTED`
- [ ] Waitlist → Going changes `assigned_group` and `WAITLISTED → JOINED`

### Exceptions

- [ ] Remove can produce `SKIPPED`
- [ ] Replace can produce `SKIPPED`
- [ ] Payment-kept leave resolution can produce `SKIPPED`
- [ ] Normal movement never produces `SKIPPED`

### Data

- [ ] Assigned participants may have `assigned_group`
- [ ] Assigned participants have `joined_queue_at = NULL`

---

## Automatic

### Ordering

- [ ] Queue order is based on `joined_queue_at`
- [ ] Earlier join time gets earlier queue position
- [ ] No `assigned_group` is used

### Data

- [ ] Every Automatic participant has `assigned_group = NULL`
- [ ] Automatic promotion does not populate `assigned_group`
- [ ] Automatic demotion does not populate `assigned_group`

### UI

- [ ] No Move to Going action
- [ ] No Move to Waitlist action
- [ ] Bottom sheet contains only Remove from Plan / Make Host / Cancel

### Capacity

- [ ] First eligible participants fill capacity
- [ ] Remaining participants waitlist
- [ ] Leaving a Joined participant can trigger automatic promotion
- [ ] Promotion follows `joined_queue_at`

### Minimum plan size

- [ ] Removing the final non-host participant requires replacement
- [ ] Replacement participant is invited correctly

---

# 27. Final Acceptance Criteria

The implementation is correct only when all of the following are true:

1. **Assigned Waitlist is host-controlled.**
2. **Automatic Waitlist is first-come-first-served.**
3. **Assigned uses `assigned_group`.**
4. **Automatic always has `assigned_group = NULL`.**
5. **Automatic ordering uses `joined_queue_at`.**
6. **Assigned has `joined_queue_at = NULL`.**
7. **Assigned host movement does not arbitrarily change RSVP.**
8. **Invited participants remain `INVITED` during ordinary Assigned movement.**
9. **Joined/Waitlisted participants transition consistently when moved in Assigned.**
10. **Automatic has no manual Joined ↔ Waitlist movement controls.**
11. **Automatic promotion is handled by the system using queue order.**
12. **The Automatic bottom sheet contains only Remove from Plan, Make Host, and Cancel.**
13. **The final non-host participant cannot be removed without a replacement.**
14. **Remove/replace/payment-kept leave flows retain the existing `SKIPPED` semantics.**
15. **No duplicate participant/count updates occur.**
16. **Database, frontend, realtime, and refreshed state agree.**
17. **Assigned and Automatic do not use each other's ordering fields.**

---

# 28. Final Mental Model

Think of the two modes as two completely different ways of answering:

> "Who gets the available spots?"

### Assigned

```text
HOST DECIDES

Participants
    ↓
Host manually arranges
    ↓
assigned_group
    ↓
GOING / WAITLIST
```

`joined_queue_at = NULL`

### Automatic

```text
TIME DECIDES

Participant accepts
    ↓
joined_queue_at
    ↓
First come, first served
    ↓
Capacity determines
    ↓
JOINED / WAITLISTED
```

`assigned_group = NULL`

The two mechanisms must never be mixed.
