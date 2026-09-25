# Feature Documentation: Plans

## 1. Overview

The **Plans** feature is the central coordination hub of Planless. It owns the entire operational lifecycle of every active and historical plan once invitations have been accepted, waitlisted, skipped, or hosted.

* **Core Function**: Provides a centralized workspace for participants and hosts to coordinate attendance, view schedules and venues, manage participant capacity and waitlists, organize teams, communicate via plan chat, and settle shared expenses.
* **Product Role**: Occupies the Plans tab in primary navigation (`activeTab === "plans"`). Home handles incoming, unresponded invitations; once an invitation is answered, ownership of the user experience transitions entirely to the Plans feature.
* **Scope**: Encompasses the main multi-tab plans directory (`PlansScreen`), host management view (`HostedPlansScreen`), cancelled plans archive (`CancelledPlans`), full-text search (`SearchYourPlansScreen`), and the multi-page detailed plan modal (`PlansDetailsScreen`).

---

## 2. User Flow

### 1. Accessing the Plans Directory
* When the user selects the Plans tab, `MainApp` mounts `<PlansScreen />`.
* The sticky top divider (`PlansDivider`) lets users filter their involved plans by RSVP state:
  * **Joined** (default): Shows active plans the user is attending.
  * **Waitlisted**: Shows active plans where the user is on the waiting list.
  * **Skipped**: Shows plans the user declined or left.
* Plans are sorted chronologically and grouped under date headers: `Today`, `Tomorrow`, `This Week`, `Later`, and `Past`.
* If a plan requires host attention (such as an unresolved leave request or overdue status), an amber exclamation mark (`!`) appears on that row.

### 2. Viewing Hosted & Cancelled Plans
* Tapping the Crown icon in the navigation header opens `<HostedPlansScreen />`.
* Displays active plans where the authenticated user is an active Host (`role === 'HOST'` and `rsvp_status === 'JOINED'`).
* If any cancelled plans exist where the user was a host, a bottom action bar ("View Cancelled Plans →") appears, opening `<CancelledPlans />`.

### 3. Searching Plans
* Tapping the Search icon in the header opens `<SearchYourPlansScreen />`.
* As the user types into the search input, plans are filtered in real-time by title, location, category, subcategory, date, or time.
* Each result displays a relationship badge indicating the user's role: `Cancelled`, `Host`, `Going`, `Waitlist`, `Skipped`, or `Invited`.

### 4. Opening Plan Details
* Tapping any plan row opens `<DetailedPlanModal />`, which mounts `<PlansDetailsScreen />` (`PlansPreviewScreen.tsx`).
* The modal header (`HeroHeader`) displays the title, host avatar/name, close button, share icon, and navigation icons.
* Below the hero cover image sits the floating `HeroMetadataCard`, showing date/time, capacity, location link (opening Google Maps), RSVP countdown, and a per-person cost breakdown popover (`CostBreakdownPopover`).
* The current user's RSVP status is rendered via `LiveActionButton` (e.g. "You're Going", "You're Hosting", "Leave Request Pending", "Plan Cancelled").

### 5. Participant Actions
* **Leaving a Plan**: A joined participant taps "Leave Plan". If the plan has no shared expense, `leavePlanRPC` executes immediately, setting status to `SKIPPED` with skip reason `LEFT` and auto-promoting the next waitlisted user. If the plan has costs, `<LeavePlanBottomSheet />` submits a formal leave request (`leave_requested = true`), notifying the host.
* **Rejoining a Plan**: A skipped user can tap "Request to Rejoin" via `<RejoinPlanBottomSheet />`, setting status to `REJOINED` awaiting host approval.

### 6. Host Coordination & Roster Management
* **Editing Plan Details**: Hosts can edit the title inline in the header, update date/time via `<EditDateTimeBottomSheet />`, update location via Google Places autocomplete, or change cover images via `<EditPlanImageScreen />` (which saves both the original image and a 9:16 card crop).
* **Setting Plan Cost**: The host opens `<SetCostScreen />` to enter a total plan expense. The per-person cost is automatically divided by the plan capacity (`plan_size`).
* **Managing Roster**: The host opens `<PlanParticipantManagementWrapper />`:
  * *Adjusting Capacity*: Pinned header Plan Size adjuster (`[ 👥 N ]`) opens `EditCapacityBottomSheet`. Adjusts freely and commits on close. If expanded, host selects which waitlisted participants move to Joined via `GuidedCapacityAdjustmentBottomSheet` (in both Automatic and Assigned modes). Total plan size cannot exceed the number of active invited participants.
  * *Automatic Mode*: Roster ordered by queue timestamp (`joined_queue_at ASC`).
  * *Assigned Mode*: Host explicitly assigns participants between `GOING` and `WAITLIST`, reorders the waitlist via drag-and-drop, or swaps individuals.
* **Inviting Friends**: Hosts (or participants if `allow_participant_invites` is enabled) invite friends using `<WhoIsComingScreen />` or generate a shareable link via `<SharePlanLinkBottomSheet />` (which follows the Plan Actions visual hierarchy with actual plan avatar, plan title, and 'Plan Actions' context).
* **Host Succession**: Hosts can promote other members to host (`promoteToHostRPC`), demote hosts (`demoteFromHostRPC`), or step down while appointing a replacement (`stopHostingWithReplacementRPC`).

### 7. Plan Conclusion
* **Completing a Plan**: Host initiates completion via `<CompletePlanConfirmationBottomSheet />` or `<HostAttendanceScreen />`. The host marks final attendance (`ATTENDED` vs `DID_NOT_ATTEND`) for each participant, chooses an expense distribution mode (`SPLIT_ALL`, `KEEP_CURRENT_COST`, or `NONE`), and completes the plan. Once completed, a 24-hour management window allows late adjustments before the plan locks permanently.
* **Cancelling a Plan**: Host initiates cancellation via `<CancelPlanBottomSheet />`. Cancelling deletes all team assignments, transitions status to `CANCELLED`, and dispatches cancellation alerts to all participants.

---

## 3. UI Documentation

### 1. Overall Layout & Tab Structure
* **Viewport Container**: Full-screen dark container (`bg-black text-white h-full relative flex flex-col`).
* **Top Navigation Bar**:
  * Title: Bold "Plans" header (`text-xl font-bold text-white`).
  * Right Action Buttons:
    * *Search Button*: Search magnifying glass icon (`Search`, active feedback: `active:scale-90`) opening `<SearchYourPlansScreen />`.
    * *Crown Button*: Crown icon (`Crown`) opening `<HostedPlansScreen />`. Features an amber alert badge (`w-2 h-2 rounded-full bg-amber-400 ring-2 ring-black`) if host action is required (e.g. pending leave requests).
* **Segmented Status Filter (`PlansDivider`)**:
  * Three interactive pill tabs: **Joined** (default), **Waitlisted**, and **Skipped**.
  * Active pill styling: White text with dark background fill and subtle border; inactive pills use muted gray text (`text-zinc-500`).
  * Count Badges: Inline counters displaying the number of plans in each category.

### 2. Plans Directory List View (`PlansScreen.tsx`)
* **Section Headers**: Sticky uppercase section headers (`TODAY`, `TOMORROW`, `THIS WEEK`, `LATER`, `PAST`) in bold tracking-wider text (`text-xs font-bold text-zinc-500 py-2.5 px-4 bg-black/80 backdrop-blur-sm`).
* **Plan Row Item**:
  * *Left Column*: Formatted time column (e.g. "8:00 PM", `text-xs font-medium text-zinc-400 w-14 shrink-0`).
  * *Thumbnail*: 48px circular cover image (`rounded-full border border-white/10 shrink-0 bg-zinc-900 object-cover`).
  * *Center Content*:
    * Title: White bold text (`text-sm font-semibold text-white truncate`).
    * Subtitle: Formatted venue name or category, accompanied by "Hosted by <Name>" in muted gray (`text-xs text-zinc-400 truncate`).
  * *Right Column*: Attendee count pill or status indicator; amber exclamation mark (`!`) if an unread action or pending request exists.
  * *Row Interaction*: Subtle hover and active press highlight (`active:bg-zinc-900/40 transition`).
* **Empty State**: Centered state when no plans match the active filter tab, rendering category iconography, informative title (e.g. "No joined plans yet"), and a CTA to explore or create.

### 3. Hosted & Cancelled Plans Screens
* **Hosted Plans Screen (`HostedPlansScreen.tsx`)**:
  * Dedicated listing showing exclusively plans where the active user is an organizer (`role === 'HOST'`).
  * Sticky Bottom Action Bar: Floating pill banner "View Cancelled Plans →" (`rounded-xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-zinc-300 flex items-center justify-between`) linking to `<CancelledPlans />`.
* **Cancelled Plans Archive (`CancelledPlans.tsx`)**:
  * Clean archive list of cancelled plans with strike-through title styling, cancellation date, and cancellation reason pills.

### 4. Search Screen (`SearchYourPlansScreen.tsx`)
* **Search Header**: Auto-focused dark input bar (`bg-[#0D0D10] border border-white/10 rounded-xl px-4 py-3 text-white text-sm`) with search icon and clear button.
* **Live Result Cards**: Card list updating on each keystroke, featuring title, category, formatted date, and color-coded status pills:
  * `Host`: White text with crown accent.
  * `Going`: Emerald green pill.
  * `Waitlist`: Amber yellow pill.
  * `Skipped`: Muted rose pill.
  * `Cancelled`: Red pill.

### 5. Detailed Plan Modal (`PlansDetailsScreen` / `PlansPreviewScreen`)
* **Hero Header (`HeroHeader.tsx`)**:
  * Full-bleed hero cover image with layered dark bottom gradient.
  * Sticky Top Controls: Circular back button, truncated plan title, host avatar with name, share link button (`Share2`), chat icon (`MessageSquare`), and 3-dot overflow menu (`MoreVertical`).
* **Floating Hero Metadata Card (`HeroMetadataCard.tsx`)**:
  * Dark frosted glass capsule floating over the hero cover image (`bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl`):
    * *When*: Calendar icon, formatted date/time, and dynamic RSVP countdown urgency badge (`Respond within 2h`).
    * *Where*: Pin icon, place name, full address, and "Directions" external map link.
    * *Capacity*: Spots counter (`X/Y filled`) with a horizontal 2px gradient capacity track.
    * *Cost*: Per-person cost badge with Rupee icon (`₹`). Tapping toggles `<CostBreakdownPopover />` detailing total cost, participating headcount, and per-head splits.
* **Live Action Button (`LiveActionButton.tsx`)**:
  * Prominent status bar indicating user's participation state:
    * "You're Going": Emerald checkmark and green pill.
    * "You're Hosting": White pill with crown icon.
    * "Waitlisted (#1)": Amber pill with queue rank.
    * "Leave Plan": Tappable link initiating leave flows.
* **Participant Roster (`InlineParticipantView.tsx`)**:
  * Segmented tabs: "Going" and "Waitlist".
  * List of participant rows with circular profile photos (`UserAvatar`), full names, RSVP status badges, and host administration trigger menus.

### 6. Interactive Bottom Sheets (`BottomSheets.tsx`)
* **Standard Visual Presentation**: iOS-style slide-up panels with dimmed frosted backdrops (`bg-black/70 backdrop-blur-sm`), rounded top borders (`rounded-t-[20px] bg-[#1C1C1E] border-t border-white/10`), and centered drag pill handles (36px by 5px).
* **Key Sheet Variants**:
  * *Leave Plan*: Explains consequences of leaving; shows cost warning if expenses are shared.
  * *Cancel Plan*: Red destructive confirmation button (`#EF4444`) with cancellation reason field.
  * *Discard / Exit Plan*: Plan Action confirmation sheet with Plan identity header (`DiscoveryImages`, title, "Plan Actions" subtitle), unsaved changes advisory, and standard destructive action styling (`Discard`, text-only `Cancel`).
  * *Edit Date/Time*: Dual time wheels and quick-select day chips (Today, Tomorrow, Weekend).
  * *Host Attendance*: Roster checklist to mark each member as `ATTENDED` or `DID_NOT_ATTEND` before final plan closure.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `PlansScreen` | `src/features/plans/screens/PlansScreen/PlansScreen.tsx` | Main directory for the Plans tab. Renders sticky status filter tabs (`PlansDivider`), date-grouped sections, and plan list rows. | Consumes `usePlansStore` and `useProfileStore`. Renders `PlansDivider` and `DiscoveryImages`. |
| `HostedPlansScreen` | `src/features/plans/screens/PlansScreen/HostedPlansScreen.tsx` | Dedicated view for plans where the user is an active Host. Provides access to cancelled plans. | Toggled from header crown button in `MainApp`. Links to `CancelledPlans`. |
| `CancelledPlans` | `src/features/plans/screens/PlansScreen/CancelledPlans.tsx` | Read-only archive of cancelled plans hosted by the user. | Opened from footer button in `HostedPlansScreen`. |
| `SearchYourPlansScreen` | `src/features/plans/screens/PlansScreen/SearchYourPlansScreen.tsx` | Real-time search screen across all plans with user relationship badges. | Opened from header search icon in `MainApp`. |
| `PlansDetailsScreen` | `src/features/plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen.tsx` | Core multi-page modal view for an individual plan. Hosts details, hero header, metadata cards, roster previews, and nested navigation. | Mounted by `DetailedPlanModal` when `activeTab !== "home"`. Controls child screens and bottom sheets. |
| `PlanSettingsScreen` | `src/features/plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen.tsx` | Host and participant settings panel. Handles leave/cancel actions, participant invite permissions, title edits, and image changes. | Rendered inside `PlansDetailsScreen`. Connects to `usePlanLifecycle`. |
| `PlanParticipantManagementWrapper` | `src/features/plans/screens/PlansScreen/PlansPreview/PlanParticipantManagementWrapper.tsx` | Full-screen roster manager. Coordinates capacity changes, group movement (Going vs Waitlist), waitlist reordering, swaps, and removals. | Wraps `ParticipantManagementScreen`. Interfaces with `usePlanParticipants`. |
| `EditPlanImageScreen` | `src/features/plans/screens/PlansScreen/PlansPreview/EditPlanImageScreen.tsx` | Manages dual image uploads: full-bleed cover image (`cover_image`) and 9:16 portrait crop (`cover_card_image`). | Uses `PlanImageEditorModal` and `uploadOriginalPlanImage` / `uploadPlanCardImage`. |
| `SetCostScreen` | `src/features/plans/components/SetCost.tsx` | Numeric input screen for setting plan total cost and previewing per-person cost share. | Invoked from `HeroMetadataCard` or `PlansDetailsScreen`. |
| `HeroHeader` | `src/features/plans/components/HeroHeader.tsx` | Sticky navigation bar for plan preview with inline title editing, host badge, share button, and overflow menu. | Embedded at top of `PlansDetailsScreen`. |
| `HeroMetadataCard` | `src/features/plans/components/HeroMetadataCard.tsx` | Floating glass card displaying formatted date, capacity pill, location link, and cost breakdown popover trigger. | Uses `useRSVPDeadline`, `formatPlanDate`, and `CostBreakdownPopover`. |
| `LiveActionButton` | `src/features/plans/components/LiveActionButton.tsx` | Status pill on plan preview representing user's current participation state and leave requests. | Embedded below hero media in `PlansDetailsScreen`. |
| `CostBreakdownPopover` | `src/features/plans/components/CostBreakdownPopover.tsx` | Popover explaining total expense, dividing headcount, and per-person cost breakdown. | Attached to `HeroMetadataCard`. |
| `InlineParticipantView` | `src/features/plans/components/InlineParticipantView.tsx` | Segmented participant roster embedded directly on the plan preview page (Going, Invited, Waitlist, Skipped). | Rendered inside `PlansDetailsScreen`. Opens `FriendProfileViewerBottomSheet`. |
| `BottomSheets` | `src/features/plans/components/BottomSheets.tsx` | Library of animated bottom sheets for user confirmations (leave, cancel, complete, edit date/time, edit capacity, share link). | Invoked dynamically across `PlansDetailsScreen` and management screens. |
| `usePlanLifecycle` | `src/features/plans/hooks/usePlanLifecycle.ts` | Hook encapsulating host transfer, plan details update, plan cancellation, completion, and post-completion adjustments. | Called by `PlansContext`. Interacts with `api/plans.ts`. |
| `usePlanParticipants` | `src/features/plans/hooks/usePlanParticipants.ts` | Hook managing joining, leaving, waitlisting, skipping, capacity rebalancing, waitlist reordering, and swaps. | Called by `PlansContext`. Interacts with Supabase client and RPCs. |
| `usePlanTeams` | `src/features/plans/hooks/usePlanTeams.ts` | Hook managing team assignments (Team A / Team B) for competitive sports plans. | Used by `PlansContext` and `TeamOrganizerModal`. |
| `useLivePlan` | `src/features/plans/hooks/useLivePlan.ts` | Reactive hook returning real-time transformed plan object matching a slug, UUID, or short public ID. | Consumed across plan preview and feed cards. |

---

## 5. Data Flow

```text
[Supabase Postgres Tables]
  ├── `plans` (all active & historical plans)
  ├── `plan_participants` (membership, roles, RSVP states, waitlist ranks)
  ├── `plan_team_assignments` (A/B team groupings)
  └── `users` (profiles)
         │
         ▼ 1. Initial Load & Recovery (`getCurrentUserPlans` in `api/plans.ts`)
         │   - Phase 1: Fetch plan IDs where user is participant or host
         │   - Phase 2: Fetch full plan rows for those IDs
         │   - Phase 3: Fetch all participant rows with linked user profiles
         │   - Phase 4: Merge and return joined plan structures
         │
         ▼ 2. Realtime Updates (`supabase.channel("plans-realtime-sync")`)
         │   - Listens to INSERT, UPDATE, DELETE on `plans`, `plan_participants`, `memories`
         │   - Updates `dbPlans`, `dbPlanParticipants`, `dbMemories` in React state
         │
         ▼ 3. Periodic Status Sync (`setInterval` every 15s)
         │   - Detects plans where `status === 'LIVE'` and `scheduled_at < now()`
         │   - Optimistically sets status to `'OVERDUE'` and invokes `sync_overdue_plans` RPC
         │
         ▼ 4. Unified Data Projection (`mapPlansToLegacyPlans` in `lib/mappers.ts`)
[PlansContext Store (`usePlansStore`)]
  ├── `plans`: Enriched UI models with member rosters, host details, and cover paths
  ├── `dbPlans`: Raw database plan entities
  └── `dbPlanParticipants`: Normalized participant records
         │
         ├──► [PlansScreen] (Filters by participantMap: JOINED, WAITLISTED, SKIPPED)
         ├──► [HostedPlansScreen] (Filters by role === 'HOST' && rsvp_status === 'JOINED')
         ├──► [CancelledPlans] (Filters by status === 'CANCELLED' && role === 'HOST')
         └──► [SearchYourPlansScreen] (Full-text query across all plan attributes)
         │
         │ (User performs action: leave, cancel, update capacity, complete)
         ▼
[Hook Mutation Layer (`usePlanLifecycle` / `usePlanParticipants` / `api/plans.ts`)]
         │
         ├── 5. Optimistic State Mutation (instant UI feedback)
         │
         ├── 6. Supabase RPC / SQL Mutation Execution:
         │      - `leave_plan`
         │      - `cancel_plan`
         │      - `complete_plan`
         │      - `update_plan_capacity`
         │      - `remove_participant`
         │      - `rejoin_plan`
         │      - `resolve_rejoined_participant`
         │      - `stop_hosting_with_replacement`
         │
         ├── 7. Database Triggers Fire in Postgres:
         │      - `trg_auto_promote_on_vacancy_trigger` (promotes next waitlisted user)
         │      - `trg_maintain_joined_queue_at_trigger` (maintains FCFS queue timestamps)
         │      - `trg_enforce_waitlist_position_invariant_trigger` (verifies waitlist positions)
         │      - `trigger_sync_plan_participant_cost_share` (updates per-person expense shares)
         │
         └── 8. Wallet Expense Recalculation:
                - `recalculateWalletExpenses(planUuid)` automatically syncs expense splits
```

---

## 6. Backend & Database

### Tables

* **`plans`**: Primary plan entity.
  * Columns: `id` (UUID PK), `public_id` (e.g. `P000001`), `title` (max 50 chars), `place_id`, `place_name`, `place_address`, `scheduled_at` (TIMESTAMPTZ), `rsvp_deadline` (TIMESTAMPTZ), `plan_size` (JOINED participant capacity limit), `max_participants` (invited participant upper bound), `status` (`LIVE`, `OVERDUE`, `COMPLETED`, `CANCELLED`), `total_cost` (NUMERIC), `cover_image` (full image URL), `cover_card_image` (9:16 crop URL), `category`, `subcategory`, `latitude`, `longitude`, `allow_participant_invites` (BOOLEAN), `participant_filtering` (`AUTOMATIC`, `ASSIGNED`), `waitlist_order_mode` (`AUTO`, `CUSTOM`), `attended_participants` (INT).
* **`plan_participants`**: Roster records mapping users to plans.
  * Composite PK (`plan_id`, `user_id`).
  * Columns: `role` (`HOST`, `PARTICIPANT`), `rsvp_status` (`INVITED`, `JOINED`, `WAITLISTED`, `SKIPPED`, `REJOINED`), `assigned_group` (`GOING`, `WAITLIST`), `waitlist_position` (INT, contiguous 1..N), `joined_queue_at` (TIMESTAMPTZ, used for FCFS sorting in Automatic mode), `leave_requested` (BOOLEAN), `leave_requested_at` (TIMESTAMPTZ), `skip_reason` (`LEFT`, `REMOVED`, `REPLACED`, `PAYMENT_KEPT`, `SKIPPED`), `cost_per_participant` (NUMERIC), `final_attendance` (`ATTENDED`, `DID_NOT_ATTEND`), `final_state` (`JOINED`, `SKIPPED`).
* **`plan_team_assignments`**: Assigns participants to teams for activities.
  * Columns: `id` (UUID PK), `plan_id`, `user_id`, `team` (`A`, `B`, `TEAM_1`, `TEAM_2`).
* **`plan_outcomes`**: Stores post-completion ratings, scores, and MVP voting records.
  * Columns: `id` (UUID PK), `plan_id`, `category`, `data` (JSONB).
* **`wallet_expenses` & `wallet_expense_participants`**: Stores bill splits and individual payment shares associated with a `plan_id`.

### RPCs & Functions

| RPC Function | Parameters | Security | Description |
|---|---|---|---|
| `sync_overdue_plans` | None | `SECURITY DEFINER` | Bulk updates any `LIVE` plans where `scheduled_at < now()` to `OVERDUE`. |
| `leave_plan` | `p_plan_id uuid` | `SECURITY DEFINER` | Marks caller as `SKIPPED` (`skip_reason = 'LEFT'`), enforces last-host protection, promotes waitlist candidate, and recalculates costs. |
| `request_host_leave_with_replacement` | `p_plan_id uuid, p_replacement_user_id uuid` | `SECURITY DEFINER` | Atomically promotes replacement user to Host and executes or queues leave request for current host. |
| `stop_hosting_with_replacement` | `p_plan_id uuid, p_replacement_user_id uuid` | `SECURITY DEFINER` | Promotes replacement to Host and demotes caller to Participant without leaving the plan. |
| `claim_plan_invite` | `p_plan_id uuid` | `SECURITY DEFINER` | Claims a plan invite link. Always inserts new participants with `rsvp_status = 'INVITED'`, regardless of plan mode or capacity. If the participant row already exists, their existing status is preserved unchanged. |
| `invite_participants` | `p_plan_id uuid, p_invitee_user_ids uuid[], p_assigned_group text` | `SECURITY DEFINER` | Invites multiple users, enforcing host permissions or `allow_participant_invites`. |
| `update_plan_capacity` | `p_plan_id uuid, p_plan_size int, p_auto_promote boolean DEFAULT true` | `SECURITY DEFINER` | Updates `plan_size`. When `p_auto_promote = true`, auto-promotes waitlisted users; when false, leaves waitlist untouched for host-guided selection. |
| `promote_to_host` / `demote_from_host` | `p_plan_id uuid, p_target_user_id uuid` | `SECURITY DEFINER` | Switches a user's role between `HOST` and `PARTICIPANT`. |
| `remove_participant` | `p_plan_id uuid, p_target_user_id uuid` | `SECURITY DEFINER` | Removes a participant. If user was `INVITED`, deletes the row; if active, sets `SKIPPED` (`skip_reason = 'REMOVED'`). |
| `rejoin_plan` | `p_plan_id uuid` | `SECURITY DEFINER` | Allows a skipped user to request re-entry, transitioning status to `REJOINED`. |
| `resolve_rejoined_participant` | `p_plan_id uuid, p_target_user_id uuid, p_decision text` | `SECURITY DEFINER` | Host approves rejoining user as `JOINED` or `WAITLISTED`, or rejects with `REMOVE`. |
| `replace_participant` | `p_plan_id uuid, p_target_user_id uuid, p_replacement_user_id uuid` | `SECURITY DEFINER` | Replaces an active participant with another user directly. |
| `move_participant_to_waitlist_and_decrease_capacity` | `p_plan_id uuid, p_target_user_id uuid` | `SECURITY DEFINER` | Moves a joined user to waitlist and decrements `plan_size` by 1. |
| `complete_plan` | `p_plan_id uuid, p_attendance_input jsonb, p_expense_mode text` | `SECURITY DEFINER` | Marks plan as `COMPLETED`, finalizes individual attendance, and calculates final expense shares. |
| `manage_completed_plan_participants` | `p_plan_id uuid, p_users_to_add uuid[], p_users_to_remove uuid[], p_expense_mode text` | `SECURITY DEFINER` | Allows host to add or remove attendees within 24 hours after plan end time. |
| `cancel_plan` | `p_plan_id uuid` | `SECURITY DEFINER` | Marks plan as `CANCELLED` and cleans up associated team assignments. |

### Database Triggers

* `trg_check_plan_overdue`: On `plans` (BEFORE INSERT OR UPDATE of `status`, `scheduled_at`). Transitions `LIVE` plans past `scheduled_at` to `OVERDUE`; transitions `OVERDUE` plans rescheduled to the future back to `LIVE`.
* `trg_plans_public_id`: On `plans` (BEFORE INSERT). Generates sequential public ID formatted as `P` followed by 6 digits (e.g. `P000001`).
* `trg_auto_insert_plan_host_participant`: On `plans` (AFTER INSERT). Automatically inserts the plan creator into `plan_participants` with `role = 'HOST'` and `rsvp_status = 'JOINED'`.
* `trg_maintain_joined_queue_at_trigger`: On `plan_participants` (BEFORE INSERT OR UPDATE). Sets `joined_queue_at = now()` when a user enters `JOINED` or `WAITLISTED` in Automatic mode; enforces `joined_queue_at = NULL` in Assigned mode.
* `trg_auto_promote_on_vacancy_trigger`: On `plan_participants` (AFTER UPDATE). Automatically promotes the earliest waitlisted participant when a spot opens up.
* `trg_enforce_waitlist_position_invariant_trigger`: On `plan_participants` (BEFORE INSERT OR UPDATE). Ensures `waitlist_position` is only populated for waitlisted rows and is `NULL` for `JOINED` or `SKIPPED` rows.
* `enforce_skip_reason_null_trigger`: On `plan_participants` (BEFORE INSERT OR UPDATE). Validates that `skip_reason` is `NULL` unless `rsvp_status === 'SKIPPED'`.
* `trigger_set_participant_cost_share_on_join` / `trigger_sync_plan_participant_cost_share`: On `plan_participants` / `plans`. Recalculates `cost_per_participant` when participants join or plan total cost / capacity changes.
* `trigger_enforce_plan_participants_completion_lifecycle`: On `plans` (AFTER UPDATE of `status`). Validates participant integrity when a plan transitions to `COMPLETED`.

### RLS Policies

* **`plans`**:
  * SELECT: Enabled for all `authenticated` users (`USING (true)`).
  * INSERT: Enabled for all `authenticated` users (`WITH CHECK (true)`).
  * UPDATE: Restricted to plan hosts via `is_plan_host(id, auth.uid())`.
* **`plan_participants`**:
  * SELECT: Enabled for all `authenticated` users (`USING (true)`).
  * INSERT: Enabled for all `authenticated` users (`WITH CHECK (true)`).
  * UPDATE / DELETE: Restricted to either the user themselves (`auth.uid() = user_id`) or an active host of the plan.

---

## 7. States & Rules

### Plan Lifecycle State Machine
A plan exists in one of four states:
1. **`LIVE`**: The plan is active and upcoming (`scheduled_at > now()`). Participants can RSVP, join, or waitlist.
2. **`OVERDUE`**: The plan's `scheduled_at` has passed, but the host has not yet marked it completed or cancelled. If the host updates `scheduled_at` to a future timestamp, the plan automatically returns to `LIVE`.
3. **`COMPLETED`**: The host finalized attendance. The plan is an archived historical record. Participants cannot RSVP. Host can modify attendees only within a 24-hour window from `scheduled_at`. A completed plan cannot be cancelled.
4. **`CANCELLED`**: The host cancelled the plan. All team assignments are wiped. The plan cannot be reopened.

### Participant RSVP States
* **`INVITED`**: User was invited but has not yet accepted or declined. Does not count toward capacity.
* **`JOINED`**: User is attending the plan. Occupies 1 slot of `plan_size`.
* **`WAITLISTED`**: Plan capacity is full (Automatic mode) or host placed user on waitlist (Assigned mode).
* **`SKIPPED`**: User declined the invite, left the plan, or was removed. Carries `skip_reason`:
  * `LEFT`: User voluntarily left.
  * `REMOVED`: Host removed user.
  * `REPLACED`: Host replaced user with another person.
  * `PAYMENT_KEPT`: User left a paid plan where their payment was retained.
  * `SKIPPED`: User declined initial invitation.
* **`REJOINED`**: Skipped user requested to return; awaits host resolution.

### Capacity & Filtering Modes
* **`plan_size`**: The single authoritative joined capacity limit (including the host).
* **Automatic Mode (`participant_filtering === 'AUTOMATIC'`)**:
  * Strictly First-Come, First-Served based on `joined_queue_at`.
  * If joined count `< plan_size`, accepting users become `JOINED`.
  * If joined count `>= plan_size`, accepting users become `WAITLISTED`.
  * When a spot vacates or capacity increases, `auto_promote_waitlist_for_automatic` promotes the waitlisted user with the earliest `joined_queue_at`.
* **Assigned Mode (`participant_filtering === 'ASSIGNED'`)**:
  * Host assigns each invitee to `assigned_group = 'GOING'` or `'WAITLIST'`.
  * Waitlist ordering uses explicit `waitlist_position` (1..N).
  * On capacity increase, `auto_promote_waitlist_for_assigned` promotes top waitlisted candidates. If a candidate was `INVITED`, their `assigned_group` switches to `GOING` while their `rsvp_status` remains `INVITED`.

### Host Rules & Invariants
* Every plan must have at least one active Host (`role === 'HOST'`, `rsvp_status === 'JOINED'`).
* **Last-Host Protection**: The sole active host cannot leave the plan or be removed without transferring ownership first (`request_host_leave_with_replacement` or `changePlanHost`).
* Host always occupies 1 capacity slot in `plan_size`.

---

## 8. Dependencies & Change Impact

### What Plans Depends On
* **`ProfileContext` (`src/features/profile/state/ProfileContext.tsx`)**: Supplies `activeUserId`, `userProfile`, and cached `dbUsers`.
* **`Friendships` (`src/features/friendships/api/friendships.ts`)**: Supplies user's friend list for inviting participants.
* **`Wallet` (`src/features/wallet/services/walletSyncService.ts`)**: Executes `recalculateWalletExpenses(planUuid)` to maintain cost split allocations on attendance changes.
* **`PlanChatScreen` (`src/features/chats/screens/PlanChatScreen.tsx`)**: In-plan group chat tab.
* **`Google Places API` (`useGooglePlacesAutocomplete`)**: Location selection and venue details.

### What Depends on Plans / Impact of Changes
* **`HomeScreen` (`src/features/home/screens/HomeScreen.tsx`)**:
  * Consumes `getHomeFeedPlans()`, `joinPlan()`, and `waitlistPlan()` from `PlansContext`.
  * Any alteration to participant normalization (`normalizeStatus`) or `dbPlanParticipants` structure immediately alters which plans appear on the Home feed.
* **Main Navigation Badges (`MainApp.tsx`)**:
  * Unread badge count for Home derives from `getHomeFeedPlans().length`.
* **Memories Feature (`src/features/memories/`)**:
  * Completed and cancelled plans feed into user memory timelines and post-plan reviews.
* **Wallet & Settlements**:
  * Expense redistribution relies directly on `plan_participants.cost_per_participant` and attendance states.

---

## 9. Important Files

* `src/features/plans/state/PlansContext.tsx`: Central store provider for all plans, participants, realtime subscriptions, and lifecycle dispatchers.
* `src/features/plans/screens/PlansScreen/PlansScreen.tsx`: Root component for the Plans tab displaying filtered chronological plan lists.
* `src/features/plans/screens/PlansScreen/HostedPlansScreen.tsx`: Host-only plan management screen.
* `src/features/plans/screens/PlansScreen/CancelledPlans.tsx`: Archive of user's cancelled plans.
* `src/features/plans/screens/PlansScreen/SearchYourPlansScreen.tsx`: Search interface across all user plans.
* `src/features/plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen.tsx`: Full-featured modal for inspecting, editing, and managing an individual plan.
* `src/features/plans/screens/PlansScreen/PlansPreview/PlanParticipantManagementWrapper.tsx`: Interactive roster management wrapper handling capacity adjustments, swaps, and group allocations.
* `src/features/plans/screens/PlansScreen/PlansPreview/PlanSettingsScreen.tsx`: Host/participant settings screen for administrative actions.
* `src/features/plans/screens/PlansScreen/PlansPreview/EditPlanImageScreen.tsx`: Dual-image cover uploader (original cover + 9:16 card crop).
* `src/features/plans/components/BottomSheets.tsx`: Modal bottom sheets for plan operations (leave, cancel, complete, edit date/time, edit capacity).
* `src/features/plans/components/HeroMetadataCard.tsx`: Floating card displaying plan schedule, capacity, venue link, and cost breakdown.
* `src/features/plans/components/LiveActionButton.tsx`: Status indicator displaying current user participation state.
* `src/features/plans/hooks/usePlanLifecycle.ts`: Lifecycle business logic (cancel, complete, update details, host transfer).
* `src/features/plans/hooks/usePlanParticipants.ts`: Participant mutations (join, leave, skip, waitlist, capacity rebalance).
* `src/features/plans/api/plans.ts`: Direct Supabase client calls and RPC invocations for the Plans feature.
* `lib/participantStatus.ts`: Shared RSVP status normalization and status display helpers.
* `lib/mappers.ts`: Transforms raw database rows into rich UI `Plan` models.

---

## 10. Known Issues

* **`OVERDUE` Lifecycle State Conflict**: The product specification document (`apps/app/src/features/plans/plan.md`) states that a plan exists in exactly one of three states (`LIVE`, `COMPLETED`, `CANCELLED`) and can never leave the `LIVE` state and return to it. In actual implementation, PostgreSQL and the client introduce a 4th state (`OVERDUE`), and database trigger `check_plan_overdue_trigger` allows bidirectional transitions between `LIVE` and `OVERDUE` when a plan is rescheduled.
* **`plan_size` vs `max_participants` Terminology Split**: In early migrations, `max_participants` denoted capacity. In recent migrations, `plan_size` became the joined capacity limit while `max_participants` was repurposed as an upper bound for total invited participants. Fallback logic across several frontend components still checks `plan.plan_size || plan.joinLimit || plan.capacity || plan.maxSpots || plan.max_participants`, risking subtle boundary bugs.
* **Hardcoded Fallback Capacities**: `InlineParticipantView.tsx` and `HeroMetadataCard.tsx` fall back to category-based hardcoded capacities (`movies ? 10 : sports ? 14 : 8`) if `plan_size` is missing, conflicting with explicit database constraints.
* **Unimplemented Plan Outcomes Database Writes**: `usePlanOutcomes.ts` bypasses database persistence for `submitReview`, `submitStats`, and `submitMvp` with code comments stating "Plan Outcomes not implemented yet: bypass DB write", despite the `plan_outcomes` table existing in Postgres.
* **Dual ID Overhead**: Plans are identified by both UUIDs (`id` / `dbUuid`) and short alphanumeric identifiers (`public_id` / `plan_id`), requiring regular normalization (`cleanPlanId`, `findPlanBySlugOrId`, regex checks) across components.
* **Direct Table Fetching in UI Subcomponents**: Several components (e.g. `PlanParticipantManagementWrapper`, `InlineParticipantView`, `EditDateTimeBottomSheet`) execute raw Supabase queries directly rather than using centralized getters in `PlansContext`.

---

## 11. Modification Notes

### Pre-Modification Checklist
Before modifying the Plans feature, verify:
1. **Separation of Concerns with Home**: Never modify `getHomeFeedPlans()` or `getHubPlans()` without ensuring that Home receives only `role === 'PARTICIPANT'` and `rsvp_status === 'INVITED'`. Joined, waitlisted, and hosted plans must exclusively belong to the Plans tab.
2. **Dual Image Protocol**: When modifying cover images, ensure both `cover_image` (full original) and `cover_card_image` (9:16 portrait crop) are updated to preserve Home feed card formatting.
3. **Capacity Invariant (`plan_size`)**: Any changes to capacity must update `plan_size` (not `max_participants`) and invoke `updatePlanCapacityRPC` so PostgreSQL auto-promotes waitlist candidates.
4. **Last-Host Rule**: Never allow a host removal or leave action without checking whether other active hosts exist on the plan. If the user is the sole active host, require host transfer first.
5. **Wallet Sync**: Any operation that mutates joined participants or `plan_size` must invoke `recalculateWalletExpenses(planUuid)` to maintain cost split integrity.

### Post-Modification Verification
After modifying the Plans feature, test the following:
* [ ] **Directory Filtering**: Switch between `Joined`, `Waitlisted`, and `Skipped` tabs in `PlansScreen`. Confirm counts match and plans are correctly grouped under date headers.
* [ ] **Hosted & Cancelled Screens**: Tap Crown icon to enter `HostedPlansScreen`. Verify only plans where user is host appear. Tap "View Cancelled Plans" to verify cancelled plans view.
* [ ] **Search**: Search by plan title and location in `SearchYourPlansScreen`. Confirm correct relationship pills display.
* [ ] **Plan Preview Opening**: Open a plan from `PlansScreen`. Verify `HeroHeader`, `HeroMetadataCard`, `LiveActionButton`, and `InlineParticipantView` render with accurate data.
* [ ] **Leave Flow**: Test leaving as an unpaid participant (instant skip + auto-promotion) and as a paid participant (leave request bottom sheet).
* [ ] **Rejoin Flow**: Test requesting to rejoin as a skipped participant and verify host receives the pending action badge.
* [ ] **Capacity Adjustments**: Increase and decrease capacity in `PlanParticipantManagementWrapper`. Verify Automatic mode promotes/demotes based on FCFS timestamps and Assigned mode preserves manual assignments.
* [ ] **Completion Flow**: Complete a live plan as host. Verify final attendance tracking, expense distribution mode selection, and the 24-hour post-completion edit window.
* [ ] **Cancellation Flow**: Cancel a plan as host. Confirm confirmation modal, status transition to `CANCELLED`, team assignment cleanup, and display in `CancelledPlans`.
