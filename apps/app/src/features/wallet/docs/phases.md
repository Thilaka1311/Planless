Yes. **Do not start with Wallet.** That will make this much harder because the Wallet is downstream of the participant decision.

The clean way to build this is to treat the feature as a **state transition first**, then connect Wallet afterward.

## The mental model

There are really **3 separate things**:

1. **Participant wants to leave**
2. **Host decides what happens**
3. **Wallet reflects the host's decision**

Don't build all three at once.

---

# Recommended implementation order

### Phase 1 — Participant Leave Request

Start here.

Build only:

```text
Joined participant
       ↓
Tap "Leave Plan"
       ↓
Paid plan?
       ↓
"Request to Leave"
       ↓
plan_participants
leave_requested = true
```

That's it.

**Do not touch Wallet yet.**

At this point:

```text
rsvp_status = JOINED
leave_requested = true
```

The person is still technically in the plan because the host hasn't decided.

### Goal of Phase 1

Get this working perfectly:

> A participant can request to leave, and the request is stored against their existing `plan_participants` record.

Test:

* Participant can request.
* Can't request twice.
* Free plans continue using existing leave flow.
* Paid plans create the pending request.
* Wallet is completely untouched.

---

# Phase 2 — Host Activity

Once Phase 1 works, build the discovery mechanism.

Add:

```text
plan_activity_type
    ↓
leave_requested
```

When the participant requests to leave:

```text
plan_participants
leave_requested = true

        +

plan_activity
activity_type = leave_requested
```

Then make that activity visible **only to the host**.

The host sees:

> **Thilak wants to leave Koi**

That's all initially.

No replacement.

No Wallet.

No cover-charge logic.

### Goal of Phase 2

Get this working:

```text
Participant requests leave
        ↓
Activity created
        ↓
Host opens Plan Activity
        ↓
Host sees the request
```

---

# Phase 3 — Host Decision

Now give the host the two choices.

```text
Thilak wants to leave

[ Replace Participant ]

[ Keep Payment ]
```

I'd actually change the wording from **"Cover Charge"** in the UI.

The underlying concept can still be represented as a cover-charge resolution, but "Keep Payment" is much easier for a normal user to understand.

The host's decision becomes:

### A. Replace

```text
Host chooses replacement
        ↓
Original participant leaves
        ↓
Replacement joins
```

### B. Keep Payment

This is where your latest clarification matters.

**Do NOT settle/clear the Wallet expense.**

Instead:

```text
Participant leaves plan
        ↓
Their existing financial obligation remains
        ↓
Wallet still shows the amount for that plan
```

So if:

```text
Koi
₹150/person

Thilak owes host ₹150
```

and Thilak leaves but the host chooses **Keep Payment**, the Wallet should continue showing:

```text
Koi
Thilak
₹150
```

even though:

```text
Thilak is no longer a participant
```

That is the important business rule.

---

# Phase 4 — Connect Wallet

**Only now should you modify Wallet.**

And this is why I don't recommend starting with Wallet.

At this point the Wallet already knows:

```text
expense
participant
amount_owed
status
```

You only need to answer:

> What happens to that existing Wallet participant when the host resolves the leave request?

### Keep Payment

**Nothing gets cleared.**

The existing wallet participant remains.

Conceptually:

```text
plan_participants
    Thilak → LEFT

wallet_expense_participants
    Thilak → ₹150 outstanding
```

This is intentional.

The Wallet is now saying:

> Thilak is no longer attending the plan, but the ₹150 financial obligation associated with that plan still exists.

That is exactly what you described.

---

# Phase 5 — Replacement

Build replacement **after the basic leave flow works**.

This is more complicated because you have to coordinate:

```text
Original participant
        ↓
Leaves
        ↓
Host chooses replacement
        ↓
New participant
        ↓
New wallet participant row
```

The important rule is:

> **Only the host chooses the replacement.**

Don't let the participant nominate someone yet.

First get:

```text
Host → Replace → choose existing eligible participant
```

working.

Then connect the replacement's Wallet obligation.

---

# Phase 6 — Activity Resolution

Once the host makes a decision, update the activity.

For example:

```text
leave_requested
status = RESOLVED
resolution = KEEP_PAYMENT
```

or:

```text
leave_requested
status = RESOLVED
resolution = REPLACED
```

The activity remains in history.

It doesn't disappear.

---

# Phase 7 — Clean Up UI

Only after the backend behavior is correct should you polish:

* Pending leave state
* Host activity card
* Replace button
* Keep Payment button
* Participant's post-leave state
* Wallet display
* Activity history

---

# The exact order I would follow

| Phase | Build                              | Wallet? |
| ----- | ---------------------------------- | ------- |
| **1** | Participant requests leave         | **No**  |
| **2** | Host sees request in Plan Activity | **No**  |
| **3** | Host decision UI                   | **No**  |
| **4** | Keep Payment behavior              | **Yes** |
| **5** | Host replacement flow              | **Yes** |
| **6** | Resolve Activity                   | Minimal |
| **7** | Polish all screens                 | Final   |

---

# So where should you start?

**Start with `plan_participants`.**

Not Wallet.

Your first implementation should be incredibly small:

```text
Paid Plan
    ↓
Participant taps Leave
    ↓
Confirmation
    ↓
requestPaidPlanLeave()
    ↓
plan_participants.leave_requested = true
```

Then stop.

Test it.

Once that works, move to:

```text
plan_activity
```

Then:

```text
Host decision
```

Then:

```text
Wallet
```

Then:

```text
Replacement
```

---

## One important architectural principle

Don't try to make one giant `leavePlan()` function that does everything.

Avoid:

```text
leavePlan()
 ├── participant update
 ├── wallet update
 ├── replacement
 ├── activity
 ├── settlement
 ├── notifications
 └── UI refresh
```

Instead, think in **business transitions**:

```text
requestLeave()
        ↓
hostDecision()
        ↓
keepPayment()
        OR
replaceParticipant()
```

Each step has a clear responsibility.

### Your first milestone should literally be:

> **"A participant on a paid plan can request to leave, and the host can see that request in Plan Activity."**

**Nothing involving Wallet yet.**

Once that works end-to-end, we move to the next step. This will keep the feature from becoming the tangled participant + wallet + replacement problem you're worried about.
