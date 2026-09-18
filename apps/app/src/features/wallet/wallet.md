# Feature Documentation: Wallet & Expense Splits

## 1. Overview

The **Wallet** feature is Planless's financial settlement, group expense sharing, and debt ledger hub. It eliminates the friction of post-event bill splitting by automatically tracking shared costs, computing peer-to-peer net balances, and reconciling settlements across all active plans.

* **Core Function**: A dual-dimension ledger interface offering:
  1. **People View** (`PeopleBalances.tsx`): Aggregates net bilateral balances across all mutual plans with individual friends ("You owe X ₹350" or "Y owes you ₹500"), with one-tap debt settlement (`SettleUpScreen.tsx`).
  2. **Plans View** (`PlanBalances.tsx`): Displays event-scoped expense sheets detailing who paid, participant splits (`₹/ea`), unpaid balances, and in-plan cost cards.
  3. **Expense Creation & Editing** (`AddCost.tsx` / `EditCost.tsx`): Allows hosts and attendees to log costs with equal or custom splits, notifying the group by posting an expense card directly into the plan chat.
* **Product Role**: Occupies Tab 5 in primary navigation (`activeTab === 'wallet'`). Also directly accessible from plan chat headers (via rupee/balances icon) and plan preview screens.
* **Scope & Boundaries**: Tracks financial obligations, splits, and recorded settlements in Indian Rupees (INR / `₹`). Acts as a ledger and calculation engine; does not execute direct bank-to-bank UPI fund transfers.

---

## 2. User Flow

### 1. Navigating the Wallet Hub (`WalletScreen.tsx`)
* User selects the **Wallet** tab from bottom navigation.
* `WalletContext` loads user expenses, participant shares, and recorded settlements from Supabase.
* The header displays the user's aggregate financial position:
  * **"You are owed ₹X"** (in bold green) if net positive.
  * **"You owe ₹X"** (in bold coral/orange) if net negative.
  * **"Settled Up"** if net zero.
* User toggles between two views:
  * **People**: Lists each friend with an active balance.
  * **Plans**: Lists each active plan showing total expenses and the user's share.

### 2. Logging a Shared Expense (`AddCost.tsx`)
* User taps the **"+"** button on `WalletScreen` or inside `PlanBalances`.
* `AddCost` opens as an interactive modal:
  * User selects target plan (pre-selected if opened from plan chat).
  * Inputs expense title (e.g. "Turf Booking", "Dinner & Drinks") and total amount in INR (`₹`).
  * Payer defaults to the authenticated user (can be assigned to another attendee).
  * **Split Configuration**: Defaults to equal split among all confirmed plan participants (`total_amount / N`). User can toggle individual participants in or out of the split.
* User taps **Add Expense**:
  * Inserts record into `public.wallet_expenses`.
  * Inserts individual share rows into `public.wallet_expense_participants`.
  * Automatically injects a rich `cost` message card into the plan's chatroom (`PlanChatScreen.tsx`).
  * Updates `plans.total_cost` and `plan_participants.cost_per_participant`.

### 3. Inspecting Bilateral Balances with a Friend (`PeopleBalances.tsx`)
* In the "People" tab, user taps on a friend's card.
* `RelationshipDetailsScreen` mounts:
  * Displays mutual net balance in large hero typography.
  * Lists every shared plan containing unpaid expenses between the two users.
  * Itemizes exact breakdown: which plan the expense originated from, what the original bill was, and what the recipient's share is.

### 4. Settling Debts (`SettleUpScreen.tsx`)
* On `RelationshipDetailsScreen`, user taps **Settle Up**.
* User selects settlement amount (defaults to total net balance owed).
* Selects payment method note (e.g. "UPI / Google Pay", "Cash", "Other").
* User confirms **Record Payment**:
  * Dispatches `recordSettlement` to Supabase:
    * Inserts record into `public.wallet_settlements`.
    * Allocates settled amounts across outstanding `wallet_expense_participants` rows via `wallet_settlement_allocations`.
    * Reduces `remaining_balance`; marks `is_paid = true` if fully satisfied.
  * Screen plays a celebration animation and moves the friendship into the "Settled Up" section.

### 5. Reviewing an Individual Expense Receipt (`ExpenseDetail.tsx`)
* User taps on any expense card in `PlanBalances` or `TransactionHistoryScreen`.
* `ExpenseDetail` displays:
  * Total bill amount, creator/payer name and avatar, date/time timestamp.
  * List of all split recipients showing their assigned share, paid status, and remaining dues.
  * Host/payer controls to edit (`EditCost.tsx`) or delete the expense.

---

## 3. UI Documentation

### Wallet Hub Screen (`WalletScreen.tsx`)
* **Container**: Full-height dark viewport (`bg-[#000000] text-white flex flex-col h-full overflow-hidden text-left font-sans select-none`).
* **Header Bar**:
  * Pinned top bar with screen title "Wallet" (`text-xl font-bold text-white tracking-tight`) and search magnifying glass icon.
* **Hero Net Balance Capsule**:
  * Center prominent summary box (`p-5 mx-4 my-2 rounded-3xl bg-zinc-950 border border-white/[0.06] shadow-xl text-center flex flex-col items-center justify-center`).
  * Label: "TOTAL NET BALANCE" in muted monospace uppercase (`text-[10px] font-mono text-zinc-400 tracking-wider`).
  * Amount Typography: Huge bold amount in INR (`₹`):
    * Positive (owed to user): Vibrant emerald (`text-3xl font-extrabold text-emerald-400`).
    * Negative (user owes): Vibrant coral/orange (`text-3xl font-extrabold text-[#FF6B2C]`).
    * Zero: Muted zinc (`text-3xl font-bold text-zinc-400`).
* **View Switcher Segment Bar**:
  * Pill-shaped segmented switcher (`flex items-center p-1 mx-4 my-2 bg-zinc-900/90 rounded-full border border-white/[0.08]`):
    * Option 1: "People" (`Users` icon) with active count badge.
    * Option 2: "Plans" (`Calendar` icon) with active count badge.
* **List Views**:
  * Scrollable column (`px-4 pt-1 pb-28 overflow-y-auto scrollbar-none flex-1 space-y-2.5`).
  * **Friend Relationship Card (`WalletRelationshipCard.tsx`)**:
    * Geometry: Rounded card (`p-4 rounded-2xl bg-zinc-950/90 border border-white/[0.06] flex items-center justify-between hover:border-white/10 active:scale-[0.99] transition-all cursor-pointer`).
    * Left side: Avatar (`UserAvatar` 44x44px), friend's full name, and shared plan count snippet (e.g. "Across 2 plans").
    * Right side: Balance readout with directional subtitle ("owes you ₹500" in green or "you owe ₹250" in orange) + right chevron (`ChevronRight`).
  * **Plan Expense Card (`WalletPlanCard.tsx`)**:
    * Displays plan cover thumbnail (52x52px), plan title, total cost (`₹X`), and current user's individual share (`₹Y`).

### Add / Edit Cost Modal (`AddCost.tsx` & `EditCost.tsx`)
* **Container**: Slide-up full-screen sheet (`bg-[#050505] text-white flex flex-col h-full text-left font-sans select-none`).
* **Amount Input**: Giant centered rupee amount field (`text-4xl font-extrabold text-center text-white bg-transparent border-none focus:outline-none placeholder-zinc-700 py-4 font-mono`) with floating `₹` currency symbol.
* **Title Input**: Clean rounded input field (`h-12 bg-zinc-900 border border-white/10 rounded-xl px-4 text-sm text-white placeholder-zinc-500`).
* **Payer Selector**: Horizontal scroll of attendee chips; active payer is highlighted with an orange border.
* **Split Roster**: Interactive checklist of attendees. Checking/unchecking automatically recalculates the per-person preview chip (`₹X/ea`) in real-time.

### Settlement Screen (`SettleUpScreen.tsx`)
* **Visual Presentation**: Focused payment confirmation card showing payer avatar pointing with an animated arrow to receiver avatar.
* **Amount Selector**: Pre-filled with total outstanding balance, with quick-tap pills for partial payments.
* **Action CTA**: Large rounded button (`w-full py-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-base shadow-lg shadow-emerald-500/20 active:scale-95`).

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `WalletScreen` | `src/features/wallet/screens/WalletScreen.tsx` | Root wallet view. Toggles People vs Plans, computes net balance summary, and hosts search. | Primary screen mounted by `MainApp.tsx` on Tab 5. |
| `RelationshipDetailsScreen` | `src/features/wallet/screens/PeopleBalances.tsx` | Itemized debt ledger between the authenticated user and a specific friend. | Child screen of `WalletScreen`; triggers `SettleUpScreen`. |
| `PlanDetailsScreen` | `src/features/wallet/screens/PlanBalances.tsx` | Plan-level financial overview detailing expenses, paid shares, and balance settlements. | Accessible from `WalletScreen`, `PlanChatScreen`, and `PlansPreviewScreen`. |
| `PlanOverallCost` | `src/features/wallet/screens/PlanOverallCost.tsx` | Host interface for reviewing total plan cost and finalizing expenses. | Used during plan wrap-up and completion. |
| `AddCost` | `src/features/wallet/screens/AddCost.tsx` | Creation modal for logging expenses, configuring participant splits, and inserting chat cards. | Standalone sheet called from Wallet, Plan Balances, and Chat. |
| `EditCost` | `src/features/wallet/screens/EditCost.tsx` | Modification modal for adjusting existing expense amounts or participant splits. | Child sheet of `ExpenseDetail.tsx`. |
| `ExpenseDetail` | `src/features/wallet/screens/ExpenseDetail.tsx` | Detailed receipt breakdown showing each attendee's share, balance, and payment state. | Opened by tapping any expense card. |
| `SettleUpScreen` | `src/features/wallet/screens/SettleUpScreen.tsx` | Debt settlement interface recording payments between two participants. | Dispatches `recordSettlement`. |
| `WalletRelationshipCard` | `src/features/wallet/components/WalletRelationshipCard.tsx` | Reusable card rendering friend avatar, name, mutual plan count, and net balance. | Used in People list. |
| `WalletPlanCard` | `src/features/wallet/components/WalletPlanCard.tsx` | Reusable card rendering plan thumbnail, title, total cost, and individual user share. | Used in Plans list. |
| `WalletContext` | `src/features/wallet/state/WalletContext.tsx` | State store managing transactions, settlements, and optimistic store updates. | Context provider consumed across wallet screens. |
| `walletService` | `src/features/wallet/services/walletService.ts` | Pure computation functions calculating bilateral net balances, debts, and settled lists. | Consumed by `WalletScreen` and `PeopleBalances`. |
| `walletSyncService` | `src/features/wallet/services/walletSyncService.ts` | Service synchronizing roster participant changes with wallet expense allocations. | Bridges `PlansContext` with `WalletContext`. |

---

## 5. Data Flow

```text
[User Logs Expense in AddCost]
             │
             ▼
[Insert wallet_expenses row] ──► (plan_id, payer_id, total_amount, title)
             │
             ▼
[Insert wallet_expense_participants rows]
  ├── One row per split attendee
  └── initial_share = total_amount / N, remaining_balance = initial_share, is_paid = (user == payer)
             │
             ▼
[Insert message in public.plan_messages]
  ├── message_type: 'cost'
  └── content: JSON { title, amount, splitWith, costPerPerson } ──► Live in Chat
             │
             ▼
[Update public.plans: total_cost & plan_participants: cost_per_participant]
             │
             ▼
[User Executes Settle Up in SettleUpScreen]
             │
             ▼
[Insert public.wallet_settlements] ──► (payer_id, receiver_id, amount)
             │
             ▼
[Insert public.wallet_settlement_allocations]
  └── Links payment to specific wallet_expense_participants rows
             │
             ▼
[Updates wallet_expense_participants: remaining_balance & is_paid]
             │
             ▼
[WalletContext updates in-memory stores & recalculates calculateWalletSummary]
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.wallet_expenses`
* **Role in Feature**: Primary record of a shared group expense.
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`): Unique expense ID.
  * `plan_id` (`uuid`, FK `plans.id`, not null): Plan the expense belongs to.
  * `payer_id` (`uuid`, FK `users.id`, not null): User who paid the bill upfront.
  * `title` (`text`, not null): Expense description (e.g. "Turf booking").
  * `total_amount` (`numeric`, not null): Total monetary amount.
  * `expense_type` (`text`, default `'GENERAL'`): Classification tag.
  * `split_type` (`split_type`, default `'EQUAL'`): `'EQUAL'`, `'CUSTOM'`, `'PERCENTAGE'`.
  * `created_at` (`timestamptz`, default `now()`).
  * `updated_at` (`timestamptz`, default `now()`).

### 2. Table: `public.wallet_expense_participants`
* **Role in Feature**: Individual debt shares owed by each participant for an expense.
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`): Unique participant share ID.
  * `expense_id` (`uuid`, FK `wallet_expenses.id`, not null): Parent expense.
  * `user_id` (`uuid`, FK `users.id`, not null): Participant who owes the share.
  * `initial_share` (`numeric`, not null): Computed share amount.
  * `remaining_balance` (`numeric`, not null): Unpaid amount.
  * `is_paid` (`boolean`, default `false`): True if fully settled.
  * `created_at` (`timestamptz`, default `now()`).

### 3. Table: `public.wallet_settlements`
* **Role in Feature**: Record of a peer-to-peer debt repayment.
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`): Settlement ID.
  * `payer_id` (`uuid`, FK `users.id`, not null): User paying off the debt.
  * `receiver_id` (`uuid`, FK `users.id`, not null): User receiving the repayment.
  * `amount` (`numeric`, not null): Amount paid.
  * `settlement_method` (`text`, default `'MANUAL'`): e.g. `'UPI'`, `'CASH'`.
  * `notes` (`text`, nullable): Optional memo.
  * `created_at` (`timestamptz`, default `now()`).

### 4. Table: `public.wallet_settlement_allocations`
* **Role in Feature**: Maps a settlement payment directly to specific `wallet_expense_participants` rows to reconcile specific outstanding dues.
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`).
  * `settlement_id` (`uuid`, FK `wallet_settlements.id`, not null).
  * `expense_participant_id` (`uuid`, FK `wallet_expense_participants.id`, not null).
  * `amount` (`numeric`, not null).

### 5. Row Level Security (RLS) Policies
* **`wallet_expenses` & `wallet_expense_participants`**:
  * SELECT: Enabled for authenticated users who are participants of the parent `plan_id`.
  * INSERT: Enabled for authenticated participants of the plan.
  * UPDATE / DELETE: Restricted to the expense `payer_id` or an active plan `HOST`.
* **`wallet_settlements`**:
  * SELECT / INSERT: Restricted to users where `auth.uid() IN (payer_id, receiver_id)`.

---

## 7. States & Rules

### Financial Calculation Invariants
* **Bilateral Netting**: The calculation engine nets all debts between two individuals across all shared plans:
  ```text
  Net Balance = (Total amount User A paid on behalf of User B) - (Total amount User B paid on behalf of User A)
  ```
* **Payer Self-Settlement**: When an expense is created, the payer's own row in `wallet_expense_participants` is automatically marked with `remaining_balance = 0` and `is_paid = true`.
* **Currency Formatting**: All currency values are standardized to Indian Rupees (INR / `₹`), with integers displayed without decimal noise (e.g. `₹500`) and fractions rounded to 2 decimal places.
* **Expense Deletion & Cancellation**:
  * Deleting an expense removes child participant rows and allocations, automatically readjusting mutual net balances.
  * Completing a plan does *not* wipe or archive debts; outstanding wallet obligations persist until explicitly settled.

### Settlement Authorization & Invariants
* **Creditor-Controlled Settlement**: Only the creditor (the user who is owed money) can initiate or record a settlement. The person who owes cannot mark their own debts as settled.
* **Complete Settlement Required**: Settlements cover the full outstanding bilateral balance; partial settlements are not supported.
* **Participant Replacement Decoupling**: When an attendee leaves and a replacement candidate is selected, the candidate remains `INVITED` without receiving financial obligations. The replacement assumes cost shares only upon officially confirming attendance (`JOINED`).

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`PlansContext` (`usePlansStore`)**: Supplies active plan entities and participant rosters for populating split options.
* **`ProfileContext` (`useProfileStore`)**: Supplies `activeUserUuid` and cached profile details (`dbUsers`) for resolving debtor/creditor names.

### Downstream Impact of Changes
* **Plan Chatroom (`PlanChatScreen.tsx`)**: Creating an expense inserts a `message_type: 'cost'` row into `public.plan_messages`. Modifying cost payload structures requires matching updates in `renderCostCard()`.
* **Plan Completion (`HostAttendanceScreen.tsx`)**: The `complete_plan` RPC recalculates `wallet_expenses` when attendance changes with mode `SPLIT_ALL`.

---

## 9. Important Files

* `src/features/wallet/screens/WalletScreen.tsx`: Root wallet screen with People and Plans views.
* `src/features/wallet/screens/PeopleBalances.tsx`: Bilateral friend debt ledger.
* `src/features/wallet/screens/PlanBalances.tsx`: Plan-specific expense sheet.
* `src/features/wallet/screens/AddCost.tsx`: Expense creation modal.
* `src/features/wallet/screens/EditCost.tsx`: Expense editing modal.
* `src/features/wallet/screens/ExpenseDetail.tsx`: Individual expense breakdown receipt.
* `src/features/wallet/screens/SettleUpScreen.tsx`: Peer-to-peer settlement screen.
* `src/features/wallet/state/WalletContext.tsx`: Core wallet state provider.
* `src/features/wallet/services/walletService.ts`: Pure net balance calculation algorithms.
* `src/features/wallet/services/walletSyncService.ts`: Roster-to-wallet synchronization handlers.

---

## 10. Known Issues

### 1. In-Memory Detail Cache Desynchronization
* **What Code Does**: `updateExpenseDetailCache` in `ExpenseDetail.tsx` caches expense metadata in module-scoped JavaScript memory to provide fast sheet transitions.
* **What Database Does**: Live updates from other attendees arrive via Supabase Realtime in `WalletContext.tsx`.
* **What is Unknown**: If a user keeps `ExpenseDetail` open while another participant settles or modifies the bill, the local module cache must be manually invalidated or it can momentarily show stale split numbers until dismissed and re-opened.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Preserve Payer Self-Paid Invariant**: When adding new split types, ensure the `payer_id` row in `wallet_expense_participants` is always initialized with `is_paid = true` and `remaining_balance = 0` to prevent the payer from appearing indebted to themselves.
2. **Backwards Compatibility with Chat Messages**: Never alter the JSON keys (`title`, `amount`, `costPerPerson`, `splitWith`) inserted into `plan_messages` without maintaining backwards compatibility in `PlanChatScreen.tsx`.

### Post-Modification Verification Steps
1. **Expense Creation & Chat Card**:
   - In Plan A, log an expense of ₹900 split among 3 attendees.
   - Verify each attendee owes ₹300.
   - Open plan chat: verify rich "Added Expense" card renders with `₹900` total and `₹300/ea`.
2. **Bilateral Net Balance & Settlement**:
   - Open Wallet tab -> People view: verify friend owes you ₹300.
   - Tap friend -> tap "Settle Up" -> record payment of ₹300.
   - Verify balance reduces to ₹0 and friend moves to "Settled Up" section.
