# Feature Documentation: Chats

## 1. Overview

The **Chats** feature is the real-time group communication and coordination hub for active plans in Planless. It provides an event-centered conversation space where attendees and hosts discuss plans, receive automated system notices, and view shared expense splits.

* **Core Function**: A two-tiered experience comprising a global plan chat directory (`ChatsScreen`) and an immersive full-screen chatroom (`PlanChatScreen`). Includes real-time message delivery, optimistic UI updates, WhatsApp-style dynamic speech bubbles, emoji scaling, and integrated participant management via a horizontal pager.
* **Product Role**: Occupies Tab 4 in primary navigation (`activeTab === "chats"`). When an involved user selects a plan conversation, `MainApp.tsx` mounts `<PlanChatScreen />` overlaying the navigation bar.
* **Scope & Boundaries**: Manages plan-scoped conversations only. Does not support 1-on-1 direct messaging outside of plans. Does not alter plan metadata directly, but embeds `<PlanParticipantManagementWrapper />` (Page 0) and links to `<PlanSettingsScreen />` and `<PlanBalances />`.

---

## 2. User Flow

### 1. Accessing the Chats Directory (`ChatsScreen`)
* The user selects the **Chats** tab from the bottom navigation bar (`activeTab === "chats"`).
* `MainApp.tsx` mounts `<ChatsScreen />`.
* The screen queries the active user's involved plans from `PlansContext`:
  * Filters for plans where the user is a host, confirmed participant, waitlisted guest, or invitee.
  * Strictly excludes `CANCELLED` and `COMPLETED` plans.
  * Sorts plans chronologically by `scheduled_at` ASC (plans occurring sooner appear first).
* The screen displays a search bar and a list of chat preview cards:
  * Each card shows the plan cover thumbnail, title, formatted scheduled date/time, participant count, and the most recent text message with relative attribution ("You: ..." vs. "Sender Name: ...").
* If no active plan conversations exist, renders `<EmptyState />` with a CTA directing to Home/Create.

### 2. Searching Active Chats
* The user types into `<SearchBar />` at the top of `ChatsScreen`.
* Filters the chat list in real time by case-insensitive title matching while preserving the chronological `scheduled_at` sort order.

### 3. Entering a Plan Chat (`onSelectChatPlan`)
* The user taps a plan card from the directory.
* `ChatsScreen` calls `onSelectChatPlan(planId)`.
* `MainApp.tsx` sets `selectedChatPlanId = planId` and pushes the route state (`tab: "chats", selectedChatPlanId: planId`).
* `<PlanChatScreen />` mounts full screen, defaulting to Page 1 ("Chat") of its horizontal motion pager.

### 4. Reading and Streaming Messages
* `PlanChatScreen` calls `useChatCache(targetPlanUuid)`:
  * Reads existing messages from the in-memory cache or fetches them via Supabase REST (`plan_messages` ordered by `created_at ASC`).
  * Subscribes to the Supabase Realtime channel `plan_messages_room:<planId>` for live inserts, updates, and deletes.
* The message list automatically scrolls to the newest message at the bottom (`scrollToBottom(false)`).
* Messages are rendered with WhatsApp-style visual grouping:
  * Consecutive messages from the same sender are clustered with a 2px gap; transitions between different senders use a 10px gap.
  * The first/single message in a cluster displays an angular speech bubble tail; subsequent messages have rounded symmetrical corners.
  * Messages containing only 1–3 emojis render with enlarged typography (32px, 28px, 24px) without speech bubble background constraints.

### 5. Sending Text Messages
* The user types in the bottom input bar and taps the **Send** button (`SendHorizontal`) or presses Enter.
* `handleSendMessage`:
  1. Creates an optimistic message with a temporary ID (`temp-${Date.now()}`) and appends it to the in-memory cache.
  2. Clears the input field and scrolls to the bottom immediately.
  3. Dispatches an `INSERT` to Supabase table `public.plan_messages` with `message_type: 'text'`.
  4. On success: replaces the temporary message in the cache with the live server row (preserving timestamps and server UUID).
  5. On error: removes the optimistic message from the cache and restores the typed text in the input bar.

### 6. Viewing Shared Expenses in Chat
* When an expense is added from the Wallet feature (`AddCost.tsx`), a special message is inserted with `message_type: 'cost'` and JSON content `{ title, amount }`.
* `PlanChatScreen` renders this as an **Added Expense Card**:
  * Displays expense title, formatted total amount in INR (`₹`), split participant count, and per-person breakdown (`₹X/ea`).

### 7. Navigating Between Chat and Participants (Horizontal Pager)
* The user swipes horizontally or taps the **Participants** tab in the sticky top `<HeroHeader />`.
* `useHorizontalPager` transitions from Page 1 (Chat) to Page 0 (Participants):
  * Mounts `<PlanParticipantManagementWrapper />` in embedded mode.
  * Enables hosts to view RSVP status, promote/demote co-hosts, manage capacity, swap participants, and reorder waitlists without leaving the chat view.
* When the user focuses the text input in Chat, `keyboardOpen` locks the horizontal pager to prevent accidental swipe transitions while typing.

### 8. Accessing Plan Details and Settings
* Tapping the top plan banner in `<HeroHeader />` triggers `onOpenPlanDetails()`, which mounts `<DetailedPlanModal />`.
* Tapping the gear icon opens `<PlanSettingsScreen />` for host controls (title edit, cover replacement, plan cancellation).
* Tapping the rupee/wallet icon opens `<PlanBalances />` (`PlanDetailsScreen`) to inspect expense settlements.

---

## 3. UI Documentation

### Chats Directory (`ChatsScreen`)
* **Layout & Container**: Root dark viewport container (`bg-[#050505] text-left flex-1 flex flex-col relative overflow-hidden h-full`) designed for seamless navigation inside Tab 4 of the main app shell.
* **Top Header**:
  * Fixed 56px bar (`h-14 bg-[#050505] px-6 shrink-0 flex items-center justify-between z-30 select-none`).
  * Left-aligned title: `Chats` in `text-stone-100 font-sans font-bold text-xl tracking-tight leading-none truncate`.
  * Right column: Empty flex spacer maintaining symmetry with Home and Plans tab headers.
* **Sticky Search Bar**:
  * Padded container (`px-4 pt-0.5 pb-2.5 bg-[#050505] shrink-0 z-20 select-none`) sitting immediately below the top header.
  * Embeds `<SearchBar />` (`#search-chats-input`) with rounded pill frame, search magnifying glass icon, placeholder "Search chats...", and active clear button (`X`).
* **Chat Directory List**:
  * Scrollable column (`px-3 pt-0.5 pb-28 overflow-y-auto scrollbar-none flex-1 flex flex-col`) with `space-y-1`.
  * **Plan Chat Card**:
    * Dimensions & interaction: Fixed height `h-[70px] w-full px-2 py-2 rounded-xl flex items-center hover:bg-white/[0.03] active:bg-white/[0.05] active:scale-[0.99] cursor-pointer transition-all duration-150 select-none`.
    * Leading thumbnail: 50x50px circular frame (`w-[50px] h-[50px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900`) containing `<DiscoveryImages />` plan cover image with subtle dark scrim (`bg-black/20 z-10`), scaling smoothly on hover (`group-hover:scale-105 transition-transform duration-200`).
    * Metadata column: Vertical flex container (`flex flex-col justify-center space-y-0.5 min-w-0 flex-1`). Plan title in bold white (`font-sans font-semibold text-[14px] text-white tracking-wide truncate leading-snug`); subtitle preview in muted zinc (`font-sans text-[12px] text-zinc-400 truncate leading-tight`) showing either real-time sender attribution snippet (`SenderName: Message Content` / `You: Message Content`) or fallback creator attribution (`Hosted by HostName`).
    * Motion transition: Animated entrance with Framer Motion (`layout`, `initial={{ opacity: 0, y: 4 }}`, `animate={{ opacity: 1, y: 0 }}`, duration 0.25s).
* **Empty States**:
  * Zero involved plans: Centered `<EmptyState />` (`py-16`) with `<MessageSquare className="w-8 h-8 text-zinc-500 stroke-[1.5]" />`, title "No chats yet", and subtitle "Create or join a plan to start chatting with your group."
  * Zero search matches: Centered `<EmptyState />` (`py-16`) with `<Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />`, title "No chats found", and subtitle "Try searching with a different plan name."

---

### Plan Chatroom & Coordination Space (`PlanChatScreen`)
* **Screen Framework & Layout**: Full-screen modal overlay (`fixed inset-0 z-50 bg-[#050505] flex flex-col w-full h-[100dvh] overflow-hidden text-left font-sans select-none`) presenting an animated spring slide-in (`initial={{ opacity: 0, x: 20 }}`, damping 25, stiffness 200).
* **Fixed Hero Header (`HeroHeader`)**:
  * Pinned top overlay (`absolute top-0 left-0 right-0 z-50 pointer-events-auto`) floating above the pager area.
  * Plan header visual: Background cover photo preview with dark vignette gradient, back arrow button (`ArrowLeft`), editable plan title (for hosts), host indicator avatars, settings button (gear icon), and balances ledger button (wallet/rupee icon).
  * Segmented Pager Switcher: Two-tab segment bar displaying "Participants" (Index 0) and "Chat" (Index 1) with active indicator underline.
* **Two-Page Horizontal Motion Pager**:
  * Pager container: `w-full flex-1 overflow-hidden relative touch-pan-y pt-[calc(96px+env(safe-area-inset-top,0px))]` housing a `w-[200%]` motion track controlled by `pageX` spring physics.
  * **Page 0 (Participants)**: Left 50% pane hosting embedded `<PlanParticipantManagementWrapper />` allowing hosts to inspect going/waitlisted attendees, modify capacity, swap participants, and manage invites directly within the chat view.
  * **Page 1 (Chat Room)**: Right 50% pane (default view) hosting conversation stream and input bar. Dynamically bounds its height to `viewportHeight - 96px` when the mobile virtual keyboard is active.
* **Chat Timeline & Message Stream**:
  * Scroll container: `flex-1 overflow-y-auto touch-pan-y pl-6 pr-4 pt-4 pb-3 flex flex-col`.
  * **System Message Pills**: Centered inline badges (`text-[12px] font-medium text-zinc-500 bg-zinc-900/60 border border-white/[0.04] px-3 py-1 rounded-full text-center tracking-wide my-1`) for plan milestones like creation ("You created <PlanTitle>"). Join/leave notifications are suppressed.
  * **Message Bubble Hierarchy & WhatsApp-Style Grouping**:
    * Sender grouping spacing: `2px` vertical margin (`mt-[2px]`) between consecutive messages from the same sender; `10px` vertical margin (`mt-2.5`) between different senders.
    * Tail styling: The first or single message in a sender cluster features an angular corner tail; subsequent chained messages use uniform symmetrical rounding (`rounded-2xl`).
    * **Outgoing Bubbles (Current User)**:
      * Positioned on the right (`items-end`).
      * Container: Warm burnt orange (`bg-[#C46A2C] text-white max-w-[87%] sm:max-w-[80%] rounded-2xl rounded-tr-none`).
      * Corner tail: Top-right clipped triangular tail on the initial bubble (`before:top-0 before:-right-[6px] before:w-[6px] before:h-[8px] before:bg-[#C46A2C] before:[clip-path:polygon(0_0,100%_0,0_100%)]`).
      * Timestamp: Muted white readout (`text-[11px] text-white/60 absolute bottom-1 right-2.5`).
    * **Incoming Bubbles (Other Participants)**:
      * Positioned on the left (`items-start`).
      * Sender Name: Rendered `2px` above the first bubble in a sender cluster (`text-[13px] font-medium text-white mb-[2px] pl-[34px] tracking-wide`).
      * Leading Avatar: 28x28px circular avatar (`w-[28px] h-[28px] rounded-full border border-white/10 overflow-hidden bg-zinc-800`) aligned with the top of the initial bubble. Subsequent grouped messages maintain an empty 28px width spacer to keep left edges vertically flush.
      * Container: Deep slate dark bubble (`bg-[#1f2c34] text-white max-w-[93%] sm:max-w-[85%] rounded-2xl rounded-tl-none`).
      * Corner tail: Top-left clipped triangular tail on the initial bubble (`before:top-0 before:-left-[6px] before:w-[6px] before:h-[8px] before:bg-[#1f2c34] before:[clip-path:polygon(100%_0,0_0,100%_100%)]`).
      * Timestamp: Muted white readout (`text-[11px] text-white/50 absolute bottom-1 right-2.5`).
  * **Dynamic Emoji Typography Scaling**:
    * 1 emoji: Giant `32px` font (`text-[32px] leading-[1.2]`) with expanded container padding (`px-3.5 pt-2.5 pb-2 min-h-[44px]`).
    * 2 emojis: Large `28px` font (`text-[28px] leading-[1.2]`).
    * 3 emojis: Medium `24px` font (`text-[24px] leading-[1.2]`).
    * 4+ emojis or mixed text: Standard `13.5px` body size (`text-[13.5px] leading-[1.4]`) with compact padding (`pl-3 pr-3 pt-2 pb-1.5 min-h-[36px]`).
  * **Added Expense Card (`message_type: 'cost'`)**:
    * Structured card container (`w-64 p-3.5 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-md my-1 text-left`).
    * Header row: Uppercase badge "ADDED EXPENSE" (`text-xs font-medium text-zinc-400 uppercase tracking-wider`) paired with formatted total cost in coral accent (`text-xs font-bold text-[#ff8b66]`) in Indian Rupee format (`₹`).
    * Body: Bold expense title (`text-sm font-semibold text-white truncate`).
    * Split breakdown: Sub-row (`mt-2 pt-2 border-t border-zinc-800/40 text-[11px] text-zinc-400`) showing recipient count ("Split with X people") and individual portion in monospace font (`font-mono font-semibold text-zinc-300`, e.g., `₹500/ea`).
* **Bottom Input Dock & Composer**:
  * **Active Plan Input Dock**: Fixed bottom bar (`bg-black/90 px-4 pt-1.5 flex items-center gap-2.5 shrink-0`) with dynamic padding adjusting for safe area and virtual keyboard (`pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]` or `pb-1.5`).
    * Input pill: Dark rounded container (`h-[46px] bg-zinc-900/90 border border-white/[0.08] rounded-full px-5 focus-within:border-white/20 transition-all shadow-lg flex-1`) wrapping transparent text input (`text-sm text-white placeholder-zinc-500 font-sans focus:outline-none`).
    * Send button: Circular 46px button (`w-[46px] h-[46px] rounded-full bg-[#FF6B2C] hover:bg-[#e05a1f] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#FF6B2C]/30 border border-white/10`) housing `<SendHorizontal className="w-5 h-5 text-white stroke-[2.2]" />`. Disabled state dims to `opacity-30 pointer-events-none`.
  * **Archived State (Completed Plans)**: Replaces input form with a fixed status bar (`bg-black/95 px-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-center select-none`) hosting a centered pill capsule (`px-4 py-2 rounded-full bg-zinc-900/80 border border-white/[0.08] text-xs font-medium text-zinc-400 tracking-wide flex items-center gap-2 shadow-inner`) with an emerald dot (`w-1.5 h-1.5 rounded-full bg-emerald-400/80`) and label "Plan completed · Chat archived".
* **Overlays & Secondary Sheets**:
  * `PlanSettingsScreen`: Full-screen sheet triggered via header gear icon for host administration (custom cover upload, plan title edits, member removal, plan cancellation).
  * `PlanDetailsScreen` (`PlanBalances`): Full-screen financial overlay (`fixed inset-0 z-[60] bg-[#050505]`) opened via rupee header icon to inspect shared balances, member splits, and settlements.
  * `AddCost`: Bottom-sheet modal invoked when adding new shared expenses to the plan.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `ChatsScreen` | `src/features/chats/screens/ChatsScreen.tsx` | Root directory screen for the Chats tab. Filters active user plans, displays search bar, fetches latest message previews, and subscribes to preview-level Realtime changes. | Rendered by `MainApp.tsx` when `activeTab === "chats"`. Passes selected plan ID to `onSelectChatPlan`. |
| `PlanChatScreen` | `src/features/chats/screens/PlanChatScreen.tsx` | Full-screen conversation and coordination view. Owns hero header, horizontal pager container, chat timeline, message input, and modal triggers. | Mounted by `MainApp.tsx` when `selectedChatPlanId` is set. Embeds `HeroHeader`, `PlanParticipantManagementWrapper`, and uses `useChatCache`. |
| `ActivityTimelineScreen` | `src/features/chats/screens/ActivityTimelineScreen.tsx` | Detailed event log screen (plan created, date changed, member joined/left). Currently unmounted / dormant due to plan activity caching pause. | Standalone component in codebase; uses `useTimestampReveal` and `useActivityCache`. |
| `useChatCache` | `src/features/chats/hooks/useChatCache.ts` | Central in-memory store and subscription hook for plan messages. Provides optimistic inserts, rollbacks, real-time cache updates, and manual invalidation. | Consumed by `PlanChatScreen`. Subscribes to Supabase Realtime channel `plan_messages_room:<planUuid>`. |
| `useHorizontalPager` | `src/features/chats/hooks/useHorizontalPager.ts` | Custom touch gesture hook managing spring-physics horizontal swiping between Page 0 (Participants) and Page 1 (Chat). Includes keyboard detection lock and screen resize recalculations. | Consumed by `PlanChatScreen`. Controls `pageX` motion value. |
| `useTimestampReveal` | `src/features/chats/hooks/useTimestampReveal.ts` | Gesture utility designed for overscroll timestamp revelation on activity cards with single-fire haptic feedback. | Used inside `ActivityTimelineScreen`. |

---

## 5. Data Flow

```text
[User Types Message in PlanChatScreen]
         │
         ▼
[handleSendMessage]
  ├── 1. Generate temp message (`temp-${Date.now()}`)
  ├── 2. Append to in-memory store (`planCache.messages`) ──► UI renders immediately (Optimistic)
  ├── 3. Clear input & scrollToBottom()
  └── 4. Send REST INSERT to Supabase
         │
         ▼
[Supabase Table: public.plan_messages]
  ├── Validates RLS: sender_id == auth.uid() AND auth.uid() in plan_participants
  └── Inserts row (assigns permanent UUID, created_at = now())
         │
         ├──► Success Callback:
         │      Replace tempId with server row in planCache ──► UI updates checkmarks
         │
         └──► Broadcasts Realtime Event:
                channel('plan_messages_room:<planId>')
                     │
                     ▼
             [Subscribed Clients in Chatroom]
               ├── useChatCache receives INSERT event
               ├── Deduplicates against existing local temp IDs
               └── Appends new message to store & notifies listeners
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.plan_messages`
* **Role in Feature**: Stores all text messages, system notices, and rich cost cards exchanged in a plan conversation.
* **Columns**:
  * `id` (`uuid`, PK): Default `gen_random_uuid()`.
  * `plan_id` (`uuid`, FK `plans.id`, not null): Plan room identifier.
  * `sender_id` (`uuid`, FK `users.id`, not null): Author user UUID.
  * `message_type` (`message_type`, not null): Enum value: `'text'`, `'system'`, `'poll'`, `'cost'`. Defaults to `'text'`.
  * `content` (`text`, not null): Raw text content or JSON string (for `'cost'` cards: `{"title": string, "amount": number}`).
  * `system_message_type` (`system_message_type`, nullable): Specific system event code when `message_type = 'system'`.
  * `created_at` (`timestamptz`, not null): Defaults to `now()`.
  * `updated_at` (`timestamptz`, nullable): Timestamp of modification.

### 2. Relevant Database Enums
* **`message_type`**:
  * `'text'`: User chat message.
  * `'system'`: Automated event notice.
  * `'poll'`: Interactive poll message (schema present, UI dormant).
  * `'cost'`: Structured expense card payload.
* **`system_message_type`**:
  * `'plan_created'`, `'participant_joined'`, `'participant_left'`, `'title_changed'`, `'description_changed'`, `'date_changed'`, `'time_changed'`, `'venue_changed'`, `'plan_cancelled'`, `'plan_restored'`, `'plan_completed'`.

### 3. Row Level Security (RLS) Policies on `plan_messages`
* **SELECT (`Allow plan participants to select messages`)**:
  * Role: `authenticated`.
  * Condition:
    ```sql
    EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_participants.plan_id = plan_messages.plan_id
         AND plan_participants.user_id = auth.uid()
    )
    ```
  * Enforces that only confirmed or invited participants of the specific plan can read its conversation.
* **INSERT (`Allow plan participants to insert messages`)**:
  * Role: `authenticated`.
  * Condition:
    ```sql
    (auth.uid() = sender_id) AND EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_participants.plan_id = plan_messages.plan_id
         AND plan_participants.user_id = auth.uid()
    )
    ```
  * Enforces that the sender must be the authenticated user and must belong to the plan's participant roster.
* **UPDATE (`Deny all updates on plan messages`)**:
  * Role: `authenticated`.
  * Condition: `USING (false) WITH CHECK (false)`. Messages are strictly immutable in the database.
* **DELETE (`Deny all deletes on plan messages`)**:
  * Role: `authenticated`.
  * Condition: `USING (false)`. Deleting messages via client REST is denied.

### 4. Realtime Channels
* **`public:plan_messages_chats_preview`**:
  * Table: `public.plan_messages`.
  * Event: `INSERT`.
  * Purpose: Updates the latest message snippet and sender name on preview cards in `ChatsScreen`.
* **`plan_messages_room:<planUuid>`**:
  * Table: `public.plan_messages`.
  * Filter: `plan_id=eq.<planUuid>`.
  * Events: `*` (INSERT, UPDATE, DELETE).
  * Purpose: Powers real-time multi-user message streaming inside `PlanChatScreen`.

---

## 7. States & Rules

### Access & Participation Rules
* **Roster Membership Requirement**: A user can only view or participate in a plan chat if a matching row exists in `public.plan_participants` for their `user_id`. Non-participants are blocked by database RLS.
* **Plan Lifecycle Exclusions**:
  * `ChatsScreen` directory strictly filters out plans where `status` is `'CANCELLED'` or `'COMPLETED'`.
  * In `PlanChatScreen`, if `status === 'CANCELLED'`, host management actions (settings, editing title) are disabled.

### Message Timeline & Bubble Formatting Rules
* **Sender Grouping**:
  * Consecutive messages from the same sender have an avatar rendered only on the first message.
  * Bubble spacing within a sender group is `2px`; spacing between different senders is `10px`.
  * First message in a group includes an angular corner tail (top-right for outgoing, top-left for incoming). Subsequent messages use uniform `rounded-2xl` styling.
* **Emoji Sizing Scale**:
  * 1 emoji: `32px` font size, line-height 1.2.
  * 2 emojis: `28px` font size, line-height 1.2.
  * 3 emojis: `24px` font size, line-height 1.2.
  * 4+ emojis or text: `13.5px` standard body size.
* **System Message Suppression**:
  * System messages with `system_message_type` `'participant_joined'` or `'participant_left'` (or content matching join/leave patterns) are suppressed from the chat timeline to prevent clutter.
  * System message `'plan_created'` renders with relative phrasing ("You created \<title\>") when viewed by the creator.

### Pager & Keyboard Invariants
* **Two-Page Layout**:
  * Page 0: Participants (`PlanParticipantManagementWrapper`).
  * Page 1: Chat timeline (`defaultPage = 1`).
* **Keyboard Gesture Guard**: When the virtual keyboard is open (`viewportHeight < window.innerHeight * 0.85`), touch-drag gestures on the horizontal pager are disabled to avoid accidental page switching while typing.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Provides `activeUserId`, `userProfile.dbUuid`, and `dbUsers` (for resolving sender names and avatars).
* **`PlansContext` (`usePlansStore`)**: Supplies `plans`, `dbPlanParticipants`, and participant management methods (`moveParticipantToGoing`, `reorderWaitlist`, `swapParticipants`, etc.).
* **`AddCost.tsx` (Wallet Feature)**: Generates and inserts `message_type = 'cost'` records into `plan_messages`.

### Downstream Impact of Changes
* **`plan_participants` Membership Changes**: Removing a participant or deleting their record immediately revokes their database RLS permissions on `plan_messages`, cutting off both read access and Realtime broadcasts.
* **`plan_messages` Schema Modifications**: Changing column names or enum values directly impacts `useChatCache.ts` and `AddCost.tsx`.
* **Realtime Quotas**: High messaging volumes across multiple active rooms consume Supabase Realtime concurrent channel connections.

---

## 9. Important Files

* `src/features/chats/screens/ChatsScreen.tsx`: Primary chats directory listing active plan conversations with latest message previews.
* `src/features/chats/screens/PlanChatScreen.tsx`: Main chatroom view featuring horizontal pager, message stream, and expense rendering.
* `src/features/chats/hooks/useChatCache.ts`: Central in-memory message cache and Supabase Realtime channel subscriber.
* `src/features/chats/hooks/useHorizontalPager.ts`: Physics-based touch pager coordinating transitions between Participants and Chat pages.
* `src/features/chats/screens/ActivityTimelineScreen.tsx`: Dormant activity log interface for historical plan events.
* `src/features/chats/hooks/useTimestampReveal.ts`: Swipe gesture hook for revealing sliding timestamps.
* `src/features/wallet/screens/AddCost.tsx`: Wallet screen responsible for creating structured cost messages.

---

## 10. Known Issues

### 1. Dormant `plan_activity` Architecture and Orphaned Screen
* **What Code Does**: `ActivityTimelineScreen.tsx` contains 1,159 lines of detailed timeline rendering for `plan_activity` events (title changes, waitlist moves, swaps, cancellations). However, `useActivityCache` in `useChatCache.ts` is hardcoded to return `rawActivities: []` with the note `[TEMPORARILY DISABLED]`, and `ActivityTimelineScreen` is not mounted in the active application router.
* **What Database Does**: Table `public.plan_activity` exists in the database with columns `plan_id`, `actor_id`, `target_user_id`, `activity_type`, and `metadata`.
* **What is Unknown**: Whether the activity timeline will be reintroduced as Page 2 of `PlanChatScreen`, or if event notifications are permanently migrating into `plan_messages` system messages.

### 2. Unimplemented Poll Message Type
* **What Code Does**: Type definitions in `useChatCache.ts` include `"poll"` in `ChatMessage['message_type']`, but no poll creation UI, voting interface, or poll message renderer exists in `PlanChatScreen.tsx`.
* **What Database Does**: Database enum `message_type` contains `'poll'`, but there is no supporting `polls` or `poll_votes` table.
* **What is Unknown**: The planned schema and interaction model for in-chat polls.

### 3. Client Optimistic Deletion vs. Database Immutability
* **What Code Does**: `useChatCache` provides a `removeOptimisticMessage(tempId)` helper and listens to Realtime `DELETE` events on `plan_messages`.
* **What Database Does**: Database RLS policy `Deny all deletes on plan messages` evaluates to `false`, preventing any client-side message deletion.
* **What is Unknown**: Whether message deletion (or soft deletion / retraction) will ever be supported, or if chats are intentionally write-only archives.

### 4. Visual Viewport Scroll Shifting on iOS Mobile Safari
* **What Code Does**: `PlanChatScreen.tsx` listens to `window.visualViewport` resize and scroll events to detect keyboard open states and restrict pager height (`viewportHeight - 96px`).
* **What Database Does**: N/A (client UI concern).
* **What is Unknown**: On certain mobile WebKit builds, quick keyboard dismissal can occasionally cause a brief 1-frame layout jitter before `visualViewport` resets to `window.innerHeight`.

---

## 11. Modification Notes

### Pre-Change Verification Checklist
1. **Verify RLS Query Context**: When testing queries against `plan_messages`, ensure the executing role is `authenticated` and the session user belongs to `plan_participants` for the target `plan_id`, or queries will return zero rows without errors.
2. **Preserve Message JSON Structure for Costs**: If modifying how expenses are rendered, maintain backwards compatibility with `AddCost.tsx`'s JSON format `{ title: string, amount: number }` stored in `content`.
3. **Respect Pager Gesture Locks**: When adding interactive swipe or drag components inside Chat or Participants pages, register them with `useHorizontalPager` (`disabled` option) to prevent conflicting drag gestures.

### Post-Change Verification Steps
1. **Real-time Chat Round-Trip**:
   - Open two browser tabs logged in as different participants of the same plan.
   - Send a message from Tab A.
   - Verify optimistic bubble renders instantly in Tab A.
   - Verify Realtime message appears in Tab B within ~300ms without page refresh.
2. **WhatsApp Bubble Grouping Verification**:
   - Send three consecutive messages from User A: verify first has tail, subsequent two have rounded corners, and spacing is `2px`.
   - Send one message from User B: verify `10px` spacing, sender name/avatar displayed, and tail positioned correctly.
3. **Expense Message Card Verification**:
   - Add a shared cost via `AddCost.tsx`.
   - Verify the message appears in chat with styled "Added Expense" card showing currency formatted in INR and correct split calculation.
