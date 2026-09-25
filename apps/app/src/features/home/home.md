# Feature Documentation: Home

## 1. Overview

The **Home** feature is the primary invitation and discovery feed in Planless. Its purpose is to surface active plans requiring the user's attention and facilitate fast, low-friction RSVP decisions.

* **Core Function**: Presents a full-screen vertical swipeable card stack of invitations where the authenticated user has been invited but has not yet accepted, waitlisted, or declined.
* **Product Role**: Home serves as the default entry point of the application (`activeTab === "home"`). It is focused strictly on incoming, unresponded invitations. Once a user responds to an invitation (joining, waitlisting, or skipping), that plan leaves the Home feed and transitions to the **Plans** tab (the activity hub), where ongoing coordination takes place.
* **Deep Linking Entry**: Direct invite links (e.g. claimed via link) resolve to destination `"HOME"` when the user has not yet responded, immediately scrolling and focusing the targeted plan card.

---

## 2. User Flow

### 1. Entering Home / Feed Initialization
* When the user opens the application or selects the Home tab, `MainApp` mounts `<HomeScreen />`.
* `getHomeFeedPlans(activeUserId)` filters active plans from `PlansContext`.
* **If feed is empty**: Renders `<EmptyState />` featuring an animated Venn diagram category-morphing illustration and a "Create a Plan" CTA that routes to `/create`.
* **If feed contains plans**: The vertical feed resets scroll position to `scrollTop = 0`. If a deep link or active card target is set (`activeCardId`), the container automatically scrolls to bring that specific card into view.

### 2. Browsing the Card Stack
* The user scrolls vertically through full-bleed plan cards using mouse wheel or touch swipe.
* `<PlanStack />` enforces CSS mandatory snap scrolling (`snap-y snap-mandatory`). Wheel events are captured with a 500ms debounce to advance one plan at a time smoothly.
* As the active card index changes, `activeCardId` updates.
* At the bottom of the feed past the final plan, an `<EndCard />` ("You're all caught up") appears with a "Create a Plan" button.

### 3. Inspecting Card Details & Badges
* **Category Badge** (top-left): Displays category-specific iconography (Film for movies, Utensils for dining, Compass for sports, Calendar for custom). Tapping toggles a floating glass popover displaying the category title.
* **RSVP Countdown Badge** (top-right): Shows an hourglass icon with dynamic countdown urgency (`X days`, `X hours`, or `X minutes`). Tapping opens a glass popover with the full deadline timestamp (e.g., "Today • 20:00", "Tomorrow • 18:30"). Popovers auto-dismiss after 5 seconds or when the card loses focus.
* **Participant Strip** (bottom): Shows the plan title, date/time, and a gradient capacity progress bar (`joinedCount / maxSpots`). Tapping anywhere on the strip toggles expansion.
* **Expanded Participants View**: Reveals an avatar cluster of up to 4 participants (prioritizing members with uploaded profile photos) and an overflow pill (`+N`), along with a "View Participants →" action button.

### 4. Opening Full Plan Details Modal
* Tapping the plan card (outside interactive buttons and hold gestures) or tapping "View Participants →" calls `setSelectedPlan(planId)`.
* This mounts `<DetailedPlanModal />`, which renders `<HomePlansPreviewScreen />` with complete plan details, full participant roster, venue maps, and expense breakdowns.

### 5. Responding via "Hold to Accept"
* The user presses and holds anywhere on the card surface (outside interactive elements with `.no-hold`).
* **Gesture Tracking (`useHoldToAccept`)**:
  * An initial 400ms delay prevents accidental taps from triggering the hold animation.
  * Once active, the screen dims once via a smooth transition (`<HoldToAcceptOverlay />` with semi-transparent backdrop blur), keeping the card and plan details card completely stable in position and layout, while the circular SVG progress ring (0% to 100%), percentage counter, plan title, location pin, host avatar with name, and per-person cost run smoothly on top.
  * **Holding to completion (1400ms)**:
    * *If plan has open spots*: Sets success mode to `"join"`, displays an emerald checkmark overlay ("JOINED"), dispatches payment and join notifications, opens payment success feedback, and invokes `handleToggleJoin(planId)`.
    * *If plan is at capacity*: Sets success mode to `"waitlist"`, displays an amber checkmark overlay ("WAITLISTED"), dispatches waitlist notifications, and invokes `waitlistPlan(planId, userProfile)`.
    * In both cases, the user's `rsvp_status` in `plan_participants` changes from `INVITED` to `JOINED` or `WAITLISTED`, which immediately removes the plan from the Home feed.
  * **Releasing early**: The hold progress decays smoothly to 0 over 350ms, canceling the action without submitting.

### 6. Snoozing via Downward Drag
* During a pointer press, dragging downwards by more than 120px activates the snooze action (`handleSnoozePlan`). The plan ID is added to `snoozedPlanIds` in session state.

### 7. Expired Plans
* If the plan's `rsvp_deadline` has passed, an overlay displays "RESPONSES CLOSED" and pointer hold interactions are disabled.

---

## 3. UI Documentation

### 1. Overall Layout & Container
* **Viewport Structure**: Full-height, mobile-first feed container (`fixed inset-0` or `h-full`) with a pitch-black background (`#000000`).
* **Top Navigation Bar (`HomeHeader.tsx`)**:
  * Pinned top bar (`h-14 bg-[#050505] px-6 select-none z-30 flex items-center justify-between`).
  * Left side renders the stylized "Planless" script logo in *Grand Hotel* font (`text-white text-[28px] font-normal`).
  * Right side utility group houses the Friends shortcut button (`Users` icon) with an unread indicator dot (`bg-[#EF4444]`) whenever pending incoming friend requests exist. Tapping opens `DiscoverFriendsScreen`.
* **Scroll Mechanics**: Implements mandatory vertical snapping (`snap-y snap-mandatory scroll-smooth overflow-y-auto`) via `<PlanStack />`. Each plan card occupies 100% of the viewport height minus the bottom navigation bar clearance (`pb-20`).
* **Debounced Page Stepping**: Wheel events are debounced by 500ms to lock navigation into clean, single-card transitions rather than free-flowing scrolls.

### 2. Plan Card Visual Elements (`PlanCard.tsx`)
* **Hero Media**: Full-bleed 9:16 aspect ratio photography (`DiscoveryImages`). Layered directional black gradients (`linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.85) 85%, #000 100%)`) ensure top badges and bottom text remain crisp and legible against bright photos.
* **Top Header Badges (Frosted Glass)**:
  * **Category Badge (Top-Left)**: Rounded pill with frosted glass styling (`rgba(10, 10, 12, 0.62)`, `backdrop-blur-[18px]`, `border border-white/10`). Houses category-specific iconography:
    * *Movies*: Violet Film icon (`text-violet-400`).
    * *Dining*: Rose UtensilsCrossed icon (`text-rose-400`).
    * *Sports*: Emerald Compass icon (`text-emerald-400`).
    * *Custom*: Zinc CalendarDays icon (`text-zinc-400`).
    * *Interaction*: Tapping opens a floating glass popover displaying the category title with spring animations.
  * **RSVP Countdown Badge (Top-Right)**: Pill badge with `Hourglass` icon and dynamic color coding derived from urgency:
    * *Days left*: Emerald green (`text-emerald-400`, `border-emerald-400/40`).
    * *Hours left*: Amber yellow (`text-amber-400`, `border-amber-400/40`).
    * *Minutes left (< 1h)*: Rose red (`text-rose-400`, `border-rose-400/40`).
    * *Interaction*: Tapping reveals a floating glass popover with the full formatted deadline (e.g. "Today • 20:00").
* **Bottom Metadata Capsule (`ParticipantToggleBar`)**:
  * Floating frosted dark glass container anchored near the bottom above the tab bar (`rounded-2xl bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-4`).
  * **Title**: Bold white heading (`text-base font-bold text-white tracking-wide truncate`).
  * **Date & Time**: Secondary text with calendar icon (`text-xs text-zinc-400 font-medium`).
  * **Capacity Indicator**: Right-aligned `X/Y filled` counter accompanied by a status dot (emerald for available spots, amber for full/waitlist).
  * **Progress Bar**: 2px horizontal track with a dynamic gradient fill representing joined participants versus max spots.
  * **Expanded View (On Tap)**:
    * Overlapping horizontal avatar cluster of up to 4 circular photos (32px diameter, 2px ring borders).
    * Overflow indicator pill (`+N more`) for rosters exceeding 4.
    * "View Participants →" right-aligned text button in accent orange (`#FF6B2C`).

### 3. Hold-to-Accept Visual Feedback (`HoldToAcceptOverlay`)
* **Press Initialization**: After 400ms contact, card scales down (`scale-[0.97]`) and dims with background blur (`backdrop-blur-md bg-black/60`).
* **Radial Progress Ring**: Centered circular SVG progress ring animating from 0% to 100% stroke dash with an inline numerical percentage counter (`tabular-nums font-bold text-white text-2xl`).
* **Contextual Plan Metadata**: Displays plan title, venue address with pin icon, host avatar with "Hosted by <Name>", and bold per-person cost (`₹<Amount>` or "Free").
* **Success Completion States**:
  * *Open Capacity (Join)*: Card is flooded with an emerald wash (`bg-emerald-500/20`), displaying a bold emerald checkmark and prominent "JOINED" badge.
  * *Full Capacity (Waitlist)*: Card receives an amber wash (`bg-amber-500/20`), displaying an amber checkmark and "WAITLISTED" badge.
* **Cancellation Decay**: Releasing prior to 1400ms smoothly un-winds the radial SVG progress ring to 0% over 350ms without submitting.

### 4. Empty & End States
* **Empty Feed (`EmptyState.tsx`)**:
  * Rendered when all invites have been acted upon.
  * Features a continuous looping SVG illustration of four category spheres morphing through a central Venn diagram with subtle pulsing scale.
  * Typography: "You're all caught up" in white (`text-xl font-bold`) with muted body text "Plans you're invited to will appear here." (`text-sm text-zinc-400`).
  * Primary Action: "Create a Plan" pill button in brand orange (`bg-[#FF6B2C] hover:bg-[#FF8552] text-white font-semibold text-sm px-6 py-3 rounded-full shadow-lg shadow-[#FF6B2C]/25 active:scale-95`).
* **End of Feed Card (`EndCard.tsx`)**:
  * Snaps past the final invitation card in the stack.
  * Dark glass card with celebratory checkmark and secondary CTA linking to plan creation.
* **Expired State**:
  * If the plan's RSVP deadline has passed, a semi-transparent dark wash locks the card with a centered "RESPONSES CLOSED" badge. Pointer hold gestures are disabled.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `HomeScreen` | `src/features/home/screens/HomeScreen.tsx` | Root container for the Home tab. Manages active card index, deep-link target scrolling, modal return scroll restoration, and toggles empty state vs plan feed. | Receives store actions and feed data from `MainApp`. Renders `EmptyState` or `PlanStack`. |
| `PlanStack` | `src/features/home/components/PlanFeed.tsx` | Full-height scroll container with CSS mandatory vertical snap. Handles mouse wheel page-snapping and active card index tracking. Uses `useVerticalPager` for spring-physics page transitions. | Maps `plansToRender` to `PlanCard` components. Renders `EndCard` at the bottom. |
| `EndCard` | `src/features/home/components/PlanFeed.tsx` | End-of-feed card displayed after all discoverable plans. Shows "You're all caught up" message and a "Create a Plan" button. | Invokes `onNavigateToCreate` passed from `HomeScreen` / `MainApp`. |
| `PlanCard` | `src/features/home/components/PlanCard.tsx` | Individual full-screen snap card. Renders full-bleed cover image (`DiscoveryImages`), top category/deadline badges, glass popovers, participant strip, and completion overlays. | Hooks into `useLivePlan`, `usePlansStore`, and `useHoldToAccept`. Renders `ParticipantToggleBar` and `HoldToAcceptOverlay`. |
| `ParticipantToggleBar` | `src/features/home/components/PlanDetailsCard.tsx` | Floating glass capsule at bottom of `PlanCard`. Displays plan title, date/time, and capacity progress bar. Expands to reveal avatar cluster and "View Participants →" button. | Uses `useProfileStore` to resolve participant photos; fetches missing user profiles directly from Supabase `users` table if needed. |
| `HoldToAcceptOverlay` | `src/features/home/components/HoldToAccept.tsx` | Full-screen overlay visible during active hold gesture. Renders SVG radial progress ring, percentage text, location, host avatar/name, and dynamic cost text. | Consumes `useLivePlan`, `usePlansStore`, and `useProfileStore` to resolve host and cost details. |
| `EmptyState` | `src/features/home/components/EmptyState.tsx` | Displayed when no discoverable plans exist. Contains a continuous looped animation morphing through category circles, Venn overlap, friend avatars, and calendar. | Triggers `onNavigateToCreate` on CTA button click. |
| `useHoldToAccept` | `src/features/home/hooks/useHoldForStatus.ts` | Custom gesture hook managing pointer capture, 400ms start delay, 1400ms requestAnimationFrame progress loop, 350ms release decay, and downward drag snooze detection (>120px). | Triggers `handleToggleJoin`, `waitlistPlan`, and `setNotifications`. |
| `useVerticalPager` | `src/features/home/hooks/useVerticalPager.ts` | Spring-physics vertical pager hook. Manages `pageY` motion value, container height measurement, `goToPage` transitions, and drag/pan gesture handling for smooth vertical swipe navigation between plan cards. | Consumed by `PlanStack` in `PlanFeed.tsx`. |
| `HomePlansPreviewScreen` | `src/features/home/screens/HomePlansPreview/HomePlansPreviewScreen.tsx` | Detailed plan preview screen displayed inside `DetailedPlanModal` when a plan card is tapped from the Home feed. | Mounted by `src/components/common screens/DetailedPlanModal/index.tsx` when `activeTab === "home"`. |
| `TimeRSVPCard` | `src/features/home/screens/HomePlansPreview/Components/TimeRSVPCard.tsx` | Compact glass card in `HomePlansPreviewScreen` displaying event date/time, cost, and countdown urgency indicator. | Uses `useRSVPDeadline` and `formatPlanDate`. |
| `HomeHeader` | `src/components/HomeHeader.tsx` | Top navigation bar for the Home tab rendering the stylized "Planless" script logo and action shortcuts (Friends button with red request badge, search, hosted plans). | Rendered conditionally in `MainApp` when `activeTab === "home"` or `"plans"`. |

---

## 5. Data Flow

```text
[Supabase Database]
  ├── `plans` (status = 'LIVE', rsvp_deadline > NOW())
  ├── `plan_participants` (user_id = me, role = 'PARTICIPANT', rsvp_status = 'INVITED')
  └── `users` (profiles for hosts and participants)
         │
         ▼ (Realtime postgres_changes + initial REST query)
[PlansContext Store (`usePlansStore`)]
  ├── `plans`: Unified transformed plan objects with member rosters
  └── `dbPlanParticipants`: Normalized participant records
         │
         ▼ `getHomeFeedPlans(activeUserId)`
[MainApp.tsx]
  └── Calculates `discoverablePlans`:
        - Filter: plan.status in ['LIVE', 'ACTIVE']
        - Filter: NOW() <= plan.response_deadline_at
        - Filter: user has record with role == 'PARTICIPANT' && rsvp_status == 'INVITED'
        - Sort: timeline section -> day index -> time
         │
         ▼ Props
[HomeScreen.tsx] ──> [PlanStack] ──> [PlanCard]
         │
         │ (User holds card for 1400ms)
         ▼
[useHoldToAccept Hook]
         │
         ├── Optimistic UI: Emerald ("JOINED") or Amber ("WAITLISTED") overlay + push Notifications
         │
         ▼ Async Mutation Call
[PlansContext: joinPlan / waitlistPlan]
         │
         ▼ Supabase Client API
  UPDATE `plan_participants`
  SET rsvp_status = 'JOINED' (or 'WAITLISTED'),
      responded_at = NOW(),
      waitlist_position = <calculated>
  WHERE plan_id = :planUuid AND user_id = :userUuid
         │
         ▼ Postgres Triggers
  - `trigger_set_participant_cost_share_on_join` (updates per-person cost share)
  - `trg_maintain_joined_queue_at_trigger` (maintains queue timestamp)
  - `trg_auto_promote_on_vacancy_trigger` (promotes waitlist if vacancy arises)
         │
         ▼ Realtime Broadcast
[PlansContext receives update]
  └── `dbPlanParticipants` updated: rsvp_status is now 'JOINED' or 'WAITLISTED'
         │
         ▼
[getHomeFeedPlans recalculates]
  └── Plan no longer has `rsvp_status === 'INVITED'`: automatically leaves Home feed
```

---

## 6. Backend & Database

### Tables
* **`plans`**: Stores plan core records. Key columns relevant to Home: `id` (UUID PK), `status` (must be `'LIVE'`), `rsvp_deadline` (must be in the future), `scheduled_at`, `place_name`, `cover_image`, `cover_card_image` (9:16 crop for Home cards), `category`, `plan_size`/`max_participants` (capacity limit), and `total_cost`.
* **`plan_participants`**: Tracks member invitations and statuses. Composite PK (`plan_id`, `user_id`). Key columns: `role` (must be `'PARTICIPANT'`), `rsvp_status` (must be `'INVITED'`), `responded_at`, `waitlist_position`, and `cost_per_participant`.
* **`users`**: Provides member and host profiles (`full_name`, `profile_photo_path`).

### RPCs & Functions
* **`claim_plan_invite`**: Inserts a `plan_participants` record with `rsvp_status = 'INVITED'` upon claiming an invite link, routing the user to `"HOME"`.
* **`recalculate_wallet_expenses`**: Recalculates cost splits when a participant joins.

### Triggers & RLS
* **Triggers**: `trigger_set_participant_cost_share_on_join` assigns cost share on join; `trg_auto_promote_on_vacancy_trigger` promotes waitlisted users on vacancies; `trg_maintain_joined_queue_at_trigger` maintains queue ordering.
* **RLS**: Authenticated users can SELECT `plans` and `plan_participants`, and UPDATE their own participant record (`auth.uid() = user_id`) when accepting or waitlisting.

---

## 7. States & Rules

### Feed Visibility Rules
A plan appears in the Home feed if and only if all of the following conditions hold:
1. **Plan Status**: `plan.status` is `'LIVE'` or `'ACTIVE'`.
2. **RSVP Deadline**: If `plan.response_deadline_at` is set, `Date.now() <= new Date(plan.response_deadline_at).getTime()`. Expired plans are excluded.
3. **Membership Record**: The current user exists in `dbPlanParticipants` for this plan.
4. **Non-Host Role**: `participant.role !== 'HOST'`. (Hosts view their plans under Hosted Plans in the Plans tab).
5. **Pending Invitation**: `normalizeStatus(participant.rsvp_status) === 'INVITED'`.

### Gesture & Interaction Rules
* **Hold Initiation Delay**: 400ms delay before hold progress starts, ensuring that quick taps to open the plan modal or swipe gestures do not trigger the hold overlay.
* **Hold Duration**: 1400ms (`HOLD_DURATION`) of continuous pointer contact is required to trigger acceptance.
* **Hold Cancellation Decay**: Releasing the pointer before 1400ms causes the progress to animate backward to 0% over 350ms (`DECREASE_DURATION`).
* **Snooze Gesture Threshold**: Dragging down vertically by >120px while pressing down initiates snooze, temporarily removing the card from the active session view.
* **No-Hold Targets**: Elements with CSS class `.no-hold`, `<button>`, `<input>`, or `<a>` bypass hold gesture listeners.

### Capacity & Waitlist Rules
* `capacity = plan.plan_size || plan.maxSpots || plan.capacity || (movies ? 10 : sports ? 14 : 8)`.
* `joinedCount = members.filter(m => m.joinState === 'JOINED' || m.role === 'HOST' || m.isHost).length`.
* **Automatic Mode**: If `joinedCount >= capacity`, the plan is marked full (`isFull = true`). Completing the hold action invokes `waitlistPlan` instead of `joinPlan`, setting status to `'WAITLISTED'` and assigning the next `waitlist_position`.
* **Assigned Mode**: If `participant_filtering === 'ASSIGNED'`, the host's pre-assigned group in `assigned_group` dictates whether the user becomes `'JOINED'` or `'WAITLISTED'`, regardless of join timing.

### Plan Preview CTA Rules (`getPlanPreviewCtaState`)
* **Assigned Plans**:
  * Uses the participant's `assigned_group` as the strict source of truth.
  * `assigned_group === 'GOING'` → shows `Join Plan` (or `Rejoin Plan` if skipped).
  * `assigned_group === 'WAITLIST'` → shows `Join Waitlist` (or `Rejoin Waitlist` if skipped).
  * General plan capacity does not override this placement.
* **Automatic Plans**:
  * Determines the CTA strictly from current capacity:
  * `joined_count < plan_size` → shows `Join Plan` (or `Rejoin Plan` if skipped).
  * `joined_count >= plan_size` → shows `Join Waitlist` (or `Rejoin Waitlist` if skipped).

---

## 8. Dependencies & Change Impact

### What Home Depends On
* **`PlansContext` (`src/features/plans/state/PlansContext.tsx`)**:
  * Core state provider for `plans`, `dbPlans`, `dbPlanParticipants`, `getHomeFeedPlans`, `joinPlan`, and `waitlistPlan`.
* **`ProfileContext` (`src/features/profile/state/ProfileContext.tsx`)**:
  * Provides `dbUsers` cache for user avatars, names, and profiles.
* **`useLivePlan` (`src/features/plans/hooks/useLivePlan.ts`)**:
  * Keeps individual plan card state live and reactive to participant updates.
* **`DetailedPlanModal` (`src/components/common screens/DetailedPlanModal/index.tsx`)**:
  * Conditionally renders `HomePlansPreviewScreen` when `activeTab === "home"` and a card is tapped.
* **`MainApp` (`src/MainApp.tsx`)**:
  * Mounts `HomeScreen`, manages `activeTab`, handles deep-link invite resolution (`destination === "HOME"`), and tracks `activeCardId` and `snoozedPlanIds`.

### What Depends on Home / Impact of Changes
* **Badge Counts in Main Navigation**:
  * `homeBadgeCount` in `MainApp.tsx` directly derives from `discoverablePlans.length`. Changing Home filter logic alters the unread notification badge on the bottom navigation bar.
* **Deep-Link Invite Onboarding**:
  * `resolveInviteDestination()` directs invited users to `"HOME"`, expecting `activeCardId` to scroll to the target plan. Breaking `activeCardId` focus logic will cause invite links to land on the top card instead of the invited plan.
* **Plan Transitions to Plans Hub**:
  * Once a user joins via `useHoldToAccept`, the plan disappears from Home and appears in the Plans Hub under `getHubPlans()`. Inconsistencies between `rsvp_status` updates can cause plans to either vanish from both feeds or remain stuck in Home.
* **Shared Component Visual Parity**:
  * `ParticipantToggleBar`, `HoldToAcceptOverlay`, and `DiscoveryImages` are designed for visual parity between Home feed cards and Plan Preview screens. Styling changes here affect the visual identity of the feed.

---

## 9. Important Files

* `src/features/home/screens/HomeScreen.tsx`: Root container for the Home screen; manages focus, card index, and empty state toggle.
* `src/features/home/components/PlanFeed.tsx`: Contains `PlanStack` and `EndCard`; handles scroll snapping and vertical pager transitions.
* `src/features/home/components/PlanCard.tsx`: Core card component with hero cover image, countdown badges, popovers, and gesture hooks.
* `src/features/home/components/PlanDetailsCard.tsx`: Contains `ParticipantToggleBar`, capacity progress bar, and expandable participant avatar cluster.
* `src/features/home/components/HoldToAccept.tsx`: Visual overlay with circular SVG progress ring and host/venue metadata.
* `src/features/home/components/EmptyState.tsx`: Looping multi-phase SVG animation and CTA button when feed is empty.
* `src/features/home/hooks/useHoldForStatus.ts`: Gesture tracking hook for pointer down, hold progress, drag snooze, and status mutations.
* `src/features/home/hooks/useVerticalPager.ts`: Spring-physics vertical pager hook consumed by `PlanStack` for smooth card-to-card navigation.
* `src/features/home/screens/HomePlansPreview/HomePlansPreviewScreen.tsx`: Full-screen modal view of plan details accessed from the Home feed.
* `src/features/plans/state/PlansContext.tsx`: Defines `getHomeFeedPlans()`, `joinPlan()`, `waitlistPlan()`, and feeds real-time plan state.
* `src/features/plans/hooks/usePlanParticipants.ts`: Implements database mutations for joining, waitlisting, and updating `plan_participants`.
* `src/MainApp.tsx`: Orchestrates tab switching, invite token processing, and passes down store callbacks.

---

## 10. Known Issues

* **Apparent Inconsistency in Fallback Capacities**: `maxSpots` in `PlanCard` falls back to hardcoded client-side numbers based on category strings (`movies ? 10 : sports ? 14 : 8`) if `plan.maxSpots` is missing, conflicting with the database-level bounds on `plan_size` / `max_participants`.
* **Apparent Inconsistency in Snooze State Persistence**: While plan invitations and RSVP responses persist in PostgreSQL via Supabase, snoozed plan IDs (`snoozedPlanIds`) live only in transient React state in `MainApp.tsx` and reset upon browser refresh.
* **Apparent Inconsistency in Profile Data Fetching**: `ParticipantToggleBar` executes direct Supabase queries (`supabase.from("users").select(...)`) inside a component `useEffect` rather than relying consistently on the centralized `ProfileContext` store.
* **Apparent Inconsistency in Navigation Parameter Passing**: Tapping "View Participants →" writes to browser `sessionStorage` (`expand_participants_once`) to communicate state to `DetailedPlanModal` rather than passing structured route or component props.
* **Dual ID Matching**: Plans use both a database UUID (`id` or `dbUuid`) and a short string (`public_id`), requiring defensive checks across `HomeScreen` and `PlanCard` to avoid scroll-focus mismatches.

---

## 11. Modification Notes

### Pre-Modification Checklist
Before modifying the Home feature, verify:
1. **Feed Invariant**: Never alter `getHomeFeedPlans()` without verifying that only `role = 'PARTICIPANT'` and `rsvp_status = 'INVITED'` are returned. Allowing `JOINED` or `HOST` plans into Home breaks the separation between Home (invitation feed) and Plans (coordination hub).
2. **Gesture Isolation**: Any new interactive elements added to `PlanCard` or `ParticipantToggleBar` must include the `.no-hold` CSS class or handle event propagation (`e.stopPropagation()`); otherwise, tapping them will inadvertently trigger pointer capture for the hold-to-accept gesture.
3. **Modal Routing**: Remember that tapping a card opens `DetailedPlanModal`, which branches based on `activeTab === "home"` to mount `HomePlansPreviewScreen` rather than `PlansDetailsScreen`. Ensure changes are reflected in the correct screen component.
4. **Cover Image Hierarchy**: Respect the image resolution hierarchy: prefer `plan.cover_card_image` (9:16 crop) -> `plan.cover_image` -> category default via `getPlanCover()`.

### Post-Modification Verification
After modifying the Home feature, test the following:
* [ ] **Snap Scrolling**: Verify vertical wheel and touch swipe navigation properly snaps to each card and locks to one card transition at a time.
* [ ] **Hold-to-Join (Open Plan)**: Hold a plan card with open spots for 1.4s. Verify emerald checkmark overlay appears, payment/join notifications fire, and the card leaves the Home feed.
* [ ] **Hold-to-Waitlist (Full Plan)**: Hold a plan card that has reached capacity. Verify amber checkmark overlay appears, waitlist notification fires, and the card updates to waitlisted.
* [ ] **Cancellation Decay**: Press and hold for ~0.8s, then release. Confirm circular ring smoothly unwinds to 0% and does not trigger join or modal open.
* [ ] **Card Click Navigation**: Quick tap on the card background. Confirm `DetailedPlanModal` opens with `HomePlansPreviewScreen`.
* [ ] **Participant Expand**: Tap the bottom capsule. Confirm avatar cluster expands with up to 4 photos + overflow count, and "View Participants →" opens the modal.
* [ ] **Empty State**: Clear or respond to all plans. Confirm `EmptyState` displays the morphing category animation loop and "Create a Plan" CTA.
* [ ] **Deep-Link Invite Routing**: Test opening an invite link for an unresponded plan. Verify app opens directly to Home and automatically scrolls to focus the invited plan card.
