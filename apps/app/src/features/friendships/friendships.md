# Feature Documentation: Friendships

## 1. Overview

The **Friendships** feature provides social graph connectivity and relationship lifecycle management within Planless. It enables users to discover other accounts, send and accept/reject friend requests, maintain an accepted friends list, view friend profiles, and auto-connect with participants when joining shared plans.

* **Core Function**: Manages the bidirectional friend relationship between pairs of users using a canonical ordered database model (`user_1_id < user_2_id`). Exposes real-time synchronization of friendship statuses, friend count triggers, and request queues.
* **Product Role**: Eliminates coordination friction by enabling organizers to quickly select established friends during plan creation (`FriendsSelector.tsx`), while automatically weaving social ties whenever participants meet and join plans together (`syncPlanFriendships`).
* **Scope & Boundaries**: Covers sending friend requests, accepting/rejecting incoming requests, cancelling outgoing requests, removing accepted friends, viewing user profile cards, and client-side discovery. Does not handle in-plan group chats, plan invitations, or wallet expense splits directly (those consume accepted friends from `FriendshipContext`).

---

## 2. User Flow

### 1. Navigating to the Friends Hub
* User taps the **Friends** button in their Profile screen (`ProfileScreen.tsx`), which displays their current friend count and an indicator badge if pending incoming requests exist.
* The application mounts `<FriendshipsScreen onBack={...} />`.
* The main hub view displays:
  * Top navigation bar with Back button, "Friends" title, followed by an ordered right action dock: `[Friend request text badge] [Discover Friends icon]`. The text badge displays the actual pending request count (`1 friend request`, `2 friend requests`, etc.) and conditionally hides when 0 requests are pending.
  * Inline `SearchBar` to search existing friends.
  * Alphabetically ordered **Friends** section (sorted case-insensitively by full name) displaying the list of accepted friends.

### 2. Discovering Friends
* User taps the **Discover People** icon in the header.
* The view switches to `<DiscoverFriends />`.
* All platform users except the active user are listed in alphabetical order.
* User can search discoverable users by name or public username via `SearchBar`.
* Rows display user avatar, full name, and bio without right-side action buttons.
* Tapping anywhere on a user's row opens `<FriendProfileViewerBottomSheet />` where friend status is displayed and actions (add friend, cancel request, remove friend) can be performed.

### 3. Reviewing & Responding to Friend Requests
* User taps the friend requests icon (`UserRoundCheck`) in the header of the main hub or Discover People.
* The view switches to `<FriendRequestsScreen />` (returning cleanly back to the originating screen upon dismissal).
* **Incoming Requests**:
  * If pending incoming requests exist, each item shows the sender's avatar, name, and bio, with two action buttons:
    * **Accept** (green checkmark): Calls `acceptFriendRequest(friendshipId)`. Optimistically moves the user to the `friends` list, increments user's friends count via database trigger, and sets `status = 'ACCEPTED'` in Supabase.
    * **Reject** (red cross): Calls `rejectFriendRequest(friendshipId)`. Optimistically removes the item from incoming requests and deletes the record from the database.
  * If empty: shows a dashed placeholder ("No pending friend requests").
* Note: The Friend Requests screen exclusively presents incoming requests. Underlying sent requests data and store methods remain available in `FriendshipContext` for other flows.

### 4. Viewing and Managing Friends
* From the main hub (or search results):
  * All friends and search results remain ordered alphabetically by full name (`localeCompare(..., undefined, { sensitivity: 'base' })`).
  * Tapping a friend row opens `<FriendProfileViewerBottomSheet />` displaying full photo, name, bio, total friend count, and a destructive **Remove Friend** action button.
  * Tapping **Remove Friend** deletes the friendship row from Supabase, updates local state, and decrements friend counts for both users via PostgreSQL triggers.

### 5. Automatic Plan-Based Friendship Sync
* When an authenticated user joins a plan (or enters an active plan roster), `syncPlanFriendships(joiningUserUuid, planUuid)` is invoked.
* The client queries all active participants on the plan and bulk-inserts canonical records into `friendships` with `status = 'ACCEPTED'` and `created_from_plan_id = planUuid` for any participant pairs who are not yet connected.

---

## 3. UI Documentation

### Visual Theme & Styling Standards
* **Color Palette**: Pitch black background (`#000000`), zinc surfaces (`#0A0A0C`, `zinc-900`, `zinc-950`), subtle borders (`border-white/[0.04]`, `border-white/[0.06]`), and muted typography (`text-zinc-500`, `text-zinc-400`, `text-zinc-200`).
* **Accent Colors**: Orange accent (`#FF6B2C`) on loading indicators, Emerald green (`text-green-400`, `bg-green-500/10`) for request approvals, Red (`#EF4444`, `text-red-500`, `bg-red-500/10`) for rejection/cancellation badges.
* **Typography**: Clean sans-serif hierarchy (`font-sans`), bold section titles (`text-xl font-bold`), uppercase section tracking (`text-[11px] font-bold uppercase tracking-wider text-zinc-500`), and compact subtext (`text-[11.5px]`).

### Screen Layouts

#### 1. Friends Hub Screen (`FriendshipsScreen.tsx`)
* **Header**: Height `h-14` sticky header with `ArrowLeft` on the left, "Friends" title, and ordered right action dock: `[Friend request text badge] [Discover Friends icon]`. The text badge displays the actual pending request count (`1 friend request`, `2 friend requests`, etc.) and conditionally hides when 0 requests are pending.
* **Search Bar**: Sticky container housing reusable `SearchBar` with placeholder "Search friends...".
* **Friends List Section**: Alphabetically sorted friends list:
  * List items: 44px (`w-11 h-11`) circular `UserAvatar` with border `border-white/[0.06]`, bold title `text-sm text-zinc-200`, and single-line truncated bio.
  * Empty state: Centered round icon (`Users`) with text "No friends yet" / "No friends found".

#### 2. Friend Requests Screen (`FriendRequestsScreen.tsx`)
* **Header**: Height `h-14` header with `ArrowLeft` and title "Friend Requests".
* **Incoming Section**:
  * Rows feature sender avatar and bio on the left, paired with two square action buttons (`w-9 h-9 rounded-xl`): green `Check` button and red `X` button.
  * Empty state: Dashed border container with `UserCheck` icon.

#### 3. Discover People Screen (`DiscoverFriends.tsx`)
* **Header**: Height `h-14` header with `ArrowLeft`, title "Discover People", and `UserRoundCheck` with count badge when incoming requests exist.
* **Search Bar**: Reusable `SearchBar` with auto-filtering across name and username.
* **User List**:
  * Rows display avatar, full name, and bio in a single clickable card.
  * Right-side buttons (`Add Friend`, `Cancel`, `Friends`) are removed to keep the list clean and browse-focused. Tapping any user row immediately launches the `<FriendProfileViewerBottomSheet />`.

#### 4. Friend Profile Bottom Sheet (`FriendProfileViewerBottomSheet.tsx`)
* **Container**: Anchored bottom sheet (`#1C1C1E`, rounded top corners `20px`, padding `16px 20px 32px`, bottom safe-area offset).
* **Header Drag Handle**: Centered pill handle (`36px x 5px`, `rgba(255, 255, 255, 0.15)`).
* **Profile Layout**:
  * Large circular avatar: `w-35 h-35` (140px) rounded-full with border `border-white/10` and shadow.
  * Full Name: Bold title `text-lg text-white`.
  * Bio: Centered text `text-xs text-zinc-400` (defaults to "Always spontaneous, never planless.").
  * Stat: Clean vertical stack showing total friends count (`font-bold text-base text-white`) over label "Friends" (`text-[12px] text-white/40`).
* **Action Buttons**:
  * Already Friends: Full-width button with `UserMinus` icon and label "Remove Friend" (`bg-red-500/10 text-red-400`).
  * Outgoing Request: Full-width button "Cancel Request" (`bg-zinc-800 text-zinc-300`).
  * Incoming Request: Side-by-side buttons: green "Accept" and red "Decline".
  * No Relationship: Full-width button with `UserPlus` icon and label "Add Friend" (`bg-[#FF6B2C] text-white`).

#### 5. Photo Zoom Modal
* Fullscreen translucent overlay (`fixed inset-0 bg-white/10 backdrop-blur-[2px] z-[100]`).
* Displays a `280px x 280px` full-resolution preview of the profile image with user name header and top-right close (`X`) button.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `FriendshipsScreen` | `src/features/friendships/screens/FriendshipsScreen.tsx` | Main navigation hub. Houses search, discover trigger, friend roster, and switches between sub-screens. | Mounted by `ProfileScreen.tsx` when `activeSheet === 'friends'`. |
| `FriendRequestsScreen` | `src/features/friendships/screens/FriendRequestsScreen.tsx` | Displays pending incoming friend requests (with accept/reject actions) and collapsible sent requests. | Rendered as sub-screen within `FriendshipsScreen`. |
| `DiscoverFriends` | `src/features/friendships/screens/DiscoverFriends.tsx` | Full-screen directory of non-connected platform users with search and instant friend-request toggling. | Rendered as sub-screen within `FriendshipsScreen`. |
| `AllFriendsScreen` | `src/features/friendships/screens/AllFriendsScreen.tsx` | Standalone full-list screen for friends with dedicated search bar and removal options. | Created as part of navigation refactor plan; ready for hub preview mode. |
| `FriendProfileViewerBottomSheet` | `src/features/friendships/components/FriendProfileViewerBottomSheet.tsx` | Modal bottom sheet previewing any user's profile card with dynamic contextual friendship actions. | Invoked across `FriendshipsScreen`, `DiscoverFriends`, and `FriendRequestsScreen`. |
| `FriendshipContext` | `src/features/friendships/state/FriendshipContext.tsx` | Global React context store. Manages state for `friends`, `incomingRequests`, `outgoingRequests`, and realtime subscriptions. | Consumed by `FriendshipsScreen`, `ProfileScreen`, `HostAttendanceScreen`, `AttendanceSearch`. |
| `friendshipService.ts` | `src/features/friendships/services/friendshipService.ts` | Service layer handling database queries, canonical UUID ordering, request verification, and plan syncing. | Shared backend caller utilized by `FriendshipContext` and plan flows. |
| `api/friendships.ts` | `src/features/friendships/api/friendships.ts` | Direct Supabase CRUD caller and data mapper for friendship records with expanded user profile joins. | Called by `FriendshipContext`. |
| `normalize.ts` | `src/features/friendships/utils/normalize.ts` | Pure utility enforcing canonical order: `user_1_id < user_2_id`. | Used by all friendship mutation and lookup services. |

---

## 5. Data Flow

### 1. Initial Load & Realtime Synchronization
```text
FriendshipProvider Mount
  → Read activeUserUuid from ProfileContext
  → Call api.getCurrentUserFriendships(activeUserUuid)
  → Supabase queries public.friendships WHERE user_1_id = uid OR user_2_id = uid (joined with public.users)
  → Client categorizes into:
      • friends (status = 'ACCEPTED')
      • incomingRequests (status = 'PENDING' AND requested_by != activeUserUuid)
      • outgoingRequests (status = 'PENDING' AND requested_by == activeUserUuid)
  → State updated (friends, incomingRequests, outgoingRequests, friendCount)
  → Realtime channel 'friendships-realtime-<uid>' listens to table 'friendships'
  → Any postgres_changes event automatically triggers refreshFriendships()
```

### 2. Sending a Friend Request
```text
User taps "Add Friend" on Discover / Profile Sheet
  → sendFriendRequest(currentUserId, targetUserId)
  → normalizeFriendshipUsers(currentUserId, targetUserId) ensures user_1_id < user_2_id
  → Check if existing row exists:
      • If ACCEPTED: error "Already friends"
      • If PENDING: error "Request already pending"
  → INSERT INTO public.friendships (user_1_id, user_2_id, requested_by, status='PENDING')
  → Optimistic/Realtime refresh updates outgoingRequests
  → UI updates button to "Cancel"
```

### 3. Accepting a Friend Request
```text
User taps Accept (Checkmark) on FriendRequestsScreen
  → acceptFriendRequest(friendshipId)
  → Optimistic UI update:
      • Remove request from incomingRequests
      • Push sender to friends array
  → UPDATE public.friendships SET status = 'ACCEPTED', responded_at = now() WHERE id = friendshipId
  → Database trigger "trg_update_user_friends_count" runs automatically:
      • Increments users.friends count for both user_1_id and user_2_id
  → Realtime broadcast notifies both participants
  → Context executes refreshFriendships() to synchronize final state
```

### 4. Rejecting a Request or Removing a Friend
```text
User taps Reject / Cancel / Remove Friend
  → rejectFriendRequest(friendshipId) or removeFriend(friendshipId)
  → Optimistic UI update: removes item from incomingRequests/friends
  → DELETE FROM public.friendships WHERE id = friendshipId
  → Database trigger "trg_update_user_friends_count" runs:
      • Decrements users.friends count for affected users if status was 'ACCEPTED'
  → Row deleted completely (no 'REJECTED' rows preserved)
```

---

## 6. Backend & Database

### 1. Tables & Schema

#### `public.friendships`
Authoritative table managing bilateral user relationships.

| Column | Data Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique friendship record identifier. |
| `user_1_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Lexicographically smaller user UUID (`user_1_id < user_2_id`). |
| `user_2_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Lexicographically larger user UUID. |
| `requested_by` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | User UUID who initiated the request (must equal `user_1_id` or `user_2_id`). |
| `created_from_plan_id`| `UUID` | `NULL REFERENCES plans(id) ON DELETE CASCADE` | Optional plan UUID where the connection originated. |
| `status` | `friendship_status` | `NOT NULL DEFAULT 'PENDING'` | Enum: `'PENDING'`, `'ACCEPTED'`. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp. |
| `responded_at` | `TIMESTAMPTZ` | `NULL` | Timestamp when request was accepted. |

#### Constraints:
* `check_canonical_order`: `CHECK (user_1_id < user_2_id)` — Prevents duplicate symmetric rows (`(A, B)` and `(B, A)`).
* `check_requested_by`: `CHECK (requested_by = user_1_id OR requested_by = user_2_id)`.
* `unique_friendship`: `UNIQUE (user_1_id, user_2_id)` — Enforces at most one relationship record per user pair.

### 2. Enums
* `public.friendship_status`: Enum containing exactly `'PENDING'` and `'ACCEPTED'`. (Note: `'REJECTED'` status was deprecated and removed in migration `050_refactor_friendship_status_enum.sql`; declining or removing deletes the record).

### 3. Database Triggers & Functions
* **Trigger**: `trg_update_user_friends_count` on `public.friendships`:
  * Runs `AFTER INSERT OR DELETE OR UPDATE` for each row.
  * Function `public.update_user_friends_count()` counts all rows with `status = 'ACCEPTED'` involving the user and updates `public.users.friends = count`.

### 4. Row Level Security (RLS) Policies
Enabled on `public.friendships`:
* **SELECT**: `auth.uid() = user_1_id OR auth.uid() = user_2_id` (Users can only view friendships they are party to).
* **INSERT**: `(auth.uid() = user_1_id OR auth.uid() = user_2_id)` (Users can only initiate friendships involving themselves).
* **UPDATE**: `(auth.uid() = user_1_id OR auth.uid() = user_2_id)` with identical `WITH CHECK`.
* **DELETE**: `auth.uid() = user_1_id OR auth.uid() = user_2_id` (Either party can cancel, reject, or remove a friend).

Cross-table RLS policy on `public.users`:
* **Policy**: `"Users can view accepted friends profiles"` on `public.users` permits reading user profile records if an `ACCEPTED` friendship exists between `auth.uid()` and `users.id`.

---

## 7. States & Rules

### Relationship State Machine
```
   [ No Record ]
         │
         │ sendFriendRequest()
         ▼
   [ PENDING ] ───( reject / cancel )───► [ DELETED / No Record ]
         │
         │ acceptFriendRequest()
         ▼
   [ ACCEPTED ] ───( removeFriend )────► [ DELETED / No Record ]
```

### Business Rules & Invariants
1. **Canonical UUID Ordering**: `user_1_id` must strictly be lexicographically smaller than `user_2_id` (`user_1_id < user_2_id`). All frontend queries and inserts must invoke `normalizeFriendshipUsers(idA, idB)` prior to hitting Supabase.
2. **Self-Requests Prohibited**: A user can never send a friend request to themselves (`currentUserId !== targetUserId`).
3. **Sender Cannot Accept**: The user recorded in `requested_by` cannot call `acceptFriendRequest`. Only the recipient may accept.
4. **Clean Deletion Model**: Rejected friend requests, cancelled requests, and removed friends are permanently deleted from `friendships` rather than updated to a tombstone status.
5. **Denormalized Friends Count**: The `friends` column on `public.users` is automatically kept in sync by PostgreSQL database triggers. The frontend must treat `users.friends` as read-only.
6. **Plan Auto-Friendship**: Participants joining a plan establish bilateral `ACCEPTED` relationships with fellow active attendees via `syncPlanFriendships`.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Supplies `activeUserUuid` and profile state.
* **`public.users`**: Foreign-key dependency for `user_1_id`, `user_2_id`, and `requested_by`.
* **Supabase Realtime**: Powers automatic channel updates for instant synchronization across devices.

### Downstream Impact
* **`ProfileScreen.tsx`**: Renders friend counter badge and opens `FriendshipsScreen`.
* **`FriendsSelector.tsx` (`StepWho`)**: Used during plan creation to select attendees from `useFriendshipStore().friends`.
* **`HostAttendanceScreen.tsx` & `AttendanceSearch.tsx`**: Used during plan completion to search and add attendees from friends.
* **`WalletRelationshipCard.tsx` / `EditCost.tsx`**: Uses friend avatar and display names for settling plan expenses.
* **User Profile Privacy**: RLS policy on `public.users` uses `friendships` to grant visibility into other user profiles. Breaking friendship queries will cascade into broken profile views across the application.

---

## 9. Important Files

* `apps/app/src/features/friendships/state/FriendshipContext.tsx`: Global React store managing friend lists, request counts, and realtime subscriptions.
* `apps/app/src/features/friendships/screens/FriendshipsScreen.tsx`: Main user-facing hub screen.
* `apps/app/src/features/friendships/screens/FriendRequestsScreen.tsx`: Incoming and outgoing request management screen.
* `apps/app/src/features/friendships/screens/DiscoverFriends.tsx`: User discovery and request dispatching screen.
* `apps/app/src/features/friendships/components/FriendProfileViewerBottomSheet.tsx`: Bottom sheet profile viewer with context-sensitive action triggers.
* `apps/app/src/features/friendships/services/friendshipService.ts`: Core service logic enforcing canonical ordering and RPC/table queries.
* `apps/app/src/features/friendships/api/friendships.ts`: Direct Supabase API queries with joined profile selections.
* `apps/app/src/features/friendships/utils/normalize.ts`: Lexicographical UUID normalization helper.
* `supabase/migrations/historical/006_create_friendships.sql`: Original table definition and canonical constraints.
* `supabase/migrations/historical/050_refactor_friendship_status_enum.sql`: Migration establishing clean `PENDING`/`ACCEPTED` state and trigger behaviors.

---

## 10. Known Issues

### 1. Client-Side Full Users Fetch for Discovery
* **What Code Does**: `FriendshipsScreen.tsx` executes `supabase.from("users").select("id, public_id, full_name, profile_photo_path, bio")` with no limit or pagination, loading all platform users into memory on mount.
* **What Database Does**: Fully returns all users visible under `users` RLS policies.
* **What is Unknown**: As the platform userbase scales, this query will degrade in memory and performance unless converted to a paginated or debounced server-side search RPC.

### 2. Dual Service Implementations
* **What Code Does**: Both `apps/app/src/features/friendships/services/friendshipService.ts` and `apps/app/src/features/friendships/api/friendships.ts` implement similar operations (`sendFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `getFriends`), with minor differences in return types and join structures.
* **What Database Does**: Interacts with the identical `friendships` table.
* **What is Unknown**: Whether one of these files was intended to be deprecated in favor of the other during previous refactoring cycles.

---

## 11. Modification Notes

### Pre-Modification Checklist
* [ ] Verify that any query or insertion into `public.friendships` routes through `normalizeFriendshipUsers(idA, idB)` to ensure `user_1_id < user_2_id`.
* [ ] Ensure all user identifiers passed to mutations are PostgreSQL UUIDs (`dbUuid`), not short public IDs (`user_id`).
* [ ] Remember that declining a request or removing a friend requires `DELETE`, not `UPDATE status = 'REJECTED'`.
* [ ] Confirm that `FriendshipProvider` wraps the modified screen in the component hierarchy (`App.tsx` / `MainApp.tsx`).

### Post-Modification Verification
* [ ] **Send Request**: Verify that sending a friend request inserts a row with `status = 'PENDING'` and correctly updates the button state to "Cancel".
* [ ] **Accept Request**: Verify that accepting an incoming request updates `status = 'ACCEPTED'`, increments the `friends` count on both user profiles in `users`, and moves the contact into the friends list.
* [ ] **Decline / Cancel / Remove**: Verify that cancelling a sent request, rejecting an incoming request, or removing an existing friend deletes the row from `public.friendships` and appropriately updates the UI.
* [ ] **Realtime**: Verify that actions taken by one user update the corresponding screen on the other user's session without manual page refresh.
* [ ] **Build Validation**: Run `npm run build` in `apps/app` to verify TypeScript compile integrity and Vite bundle generation.
