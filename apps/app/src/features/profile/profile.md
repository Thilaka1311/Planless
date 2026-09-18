# Feature Documentation: Profile

## 1. Overview

The **Profile** feature manages the public identity, personal presentation, and activity summary of every user in Planless. It acts as the centralized identity backbone for the entire application, supplying user profiles, avatars, display names, and friendship counts to plans, chats, wallet transactions, and navigation components.

* **Core Function**: A dedicated profile screen (`ProfileScreen`) providing inline inspection and editing of personal details (full name, bio/about, circular cropped avatar), friend count indicators with real-time badges, an activity archive of completed plans (`PastPlans`), and an iOS-styled logout confirmation sheet.
* **Product Role**: Occupies Tab 5 in the primary bottom navigation bar (`activeTab === "profile"`). Additionally, `ProfileContext` (`useProfileStore`) wraps the root application, maintaining global profile state and the loaded `dbUsers` roster for all other feature modules.
* **Scope & Boundaries**: Responsible strictly for public user identity (`public.users` table and `avatars` Supabase Storage bucket). It does not manage authentication credentials or tokens (owned by `supabase.auth` and bootstrapped in `App.tsx`), friendship graph mutations (owned by `FriendshipContext`), or financial transaction histories.

---

## 2. User Flow

### 1. Navigating to the Profile Tab
* The user taps the **Profile** icon in the bottom navigation bar (`NavigationFooter`).
* `MainApp.tsx` sets `activeTab = "profile"` and renders `<ProfileScreen />`.
* `ProfileScreen` reads current identity state from `useProfileStore`:
  * Displays user profile photo via `<UserAvatar />` with an interactive camera badge.
  * Displays full name (tappable to edit) and bio/about (tappable to edit).
  * Displays an interactive Friends counter pill (`{friendCount} Friends`), displaying an unread indicator dot if incoming friend requests exist.
  * Displays personal email address, Past Plans navigation row, and Logout button.

### 2. Updating Profile Avatar (Crop, Upload, & Cache Invalidation)
1. **File Selection**: User taps the avatar circle or camera button. A hidden file input (`<input type="file" accept="image/jpeg,image/png,image/webp">`) triggers device image selection.
2. **Client Validation**: `validateImageFile` verifies the file type and ensures the image size does not exceed 10MB.
3. **Circular Crop & Scale**: `PlanImageEditorModal` opens with `cropShape="circle"`, presenting a "Move and Scale" interactive canvas where the user drags and pinches/zooms to frame their headshot.
4. **Optimistic Preview (0ms Latency)**: Upon confirming the crop, `handleSaveAvatarCrop` immediately calls `updateProfileAvatar(previewUrl)` with an in-memory blob URL. The avatar in the UI updates instantly without network latency.
5. **Background Storage Upload**: `useProfileUpload.uploadImage` retrieves the authenticated user ID (`auth.uid()`), creates a WebP blob, and uploads to Supabase Storage bucket `avatars` at key `{authUserId}/avatar` with `upsert: true` and `cacheControl: "0"`.
6. **Obsolete File Cleanup**: Any legacy files in `{authUserId}/` (e.g., `avatar.webp`, `avatar.jpg`) are removed to ensure exactly one canonical avatar file exists.
7. **Database Persistence & Cache Busting**: The canonical path (`avatars/{authUserId}/avatar`) is persisted to `public.users.profile_photo_path`. `evictImageCache` invalidates memory caches so all avatar instances across the app re-render with fresh query parameters.
8. **Rollback on Failure**: If upload or DB update fails, the avatar reverts to the prior image URL with an error alert banner.

### 3. Editing Full Name
1. User taps the full name heading on `ProfileScreen`.
2. The screen transitions to sub-sheet `activeSheet === 'editName'`, mounting `<Name />`.
3. An input field pre-filled with the current name autofocuses. A character counter tracks input up to 30 characters (`MAX_NAME_LENGTH = 30`).
4. User modifies text and taps **Save** (or presses Enter).
5. If unchanged, the view returns to Profile without making network calls.
6. If changed and non-empty, `updateProfileName` executes:
   * Optimistically updates `userProfile.name` and the corresponding record in `dbUsers` (0ms).
   * Asynchronously calls `supabase.from("users").update({ full_name: trimmed }).eq("id", activeUserUuid)`.
   * On failure, rolls back to previous state and displays a console warning.

### 4. Editing Bio / About
1. User taps the bio text below their name.
2. The screen transitions to sub-sheet `activeSheet === 'editAbout'`, mounting `<About />`.
3. An auto-expanding textarea autofocuses, positioning the cursor at the end of the current text. A counter enforces a 140-character limit (`MAX_ABOUT_LENGTH = 140`).
4. User edits bio and taps **Save**.
5. `updateProfileBio` performs an immediate optimistic update on local state, followed by an async update to `public.users.bio`. On failure, state rolls back.

### 5. Accessing Friends Directory
* User taps the Friends pill button.
* `activeSheet` is set to `'friends'`, mounting `<FriendshipsScreen />`.
* Allows user to search friends, manage incoming/outgoing requests, and remove connections.
* Closing the friendships screen returns directly to `ProfileScreen`.

### 6. Viewing Past Completed Plans
* User taps the **Past Plans** row.
* `activeSheet` is set to `'pastPlans'`, mounting `<PastPlans />`.
* `PastPlans` queries all plans from `usePlansStore()` where `status === 'COMPLETED'` and the active user was a participant.
* Plans are sorted descending by scheduled date/time (newest first).
* Each card renders date, time, circular plan cover, title, and relative attendance status:
  * **Hosted** (white text): User was the plan organizer/host.
  * **Joined** (emerald green text): User RSVP'd and attended.
  * **Skipped** (rose red text): User skipped or did not attend.
* Tapping any plan row calls `setSelectedPlanId(plan.id)`, navigating directly to that plan's detailed view.

### 7. Logging Out
1. User taps the **Logout** row.
2. An iOS-style bottom sheet modal slides up with a dimmed backdrop (`activeSheet === 'logout'`).
3. User can tap **Cancel** or the backdrop to dismiss the sheet.
4. Tapping the red **Log out** button dismisses the sheet and triggers `onLogout()` after a 250ms spring delay, signing out from Supabase Auth and clearing cached session keys from `localStorage`.

---

## 3. UI Documentation

### 1. Overall Layout & Screen Structure
* **Viewport & Canvas**: Full-screen dark container (`bg-black text-white h-full relative overflow-hidden flex flex-col`) with safe-area inset spacing (`pt-[calc(4.5rem+env(safe-area-inset-top,0px))] pb-28`).
* **Visual Hierarchy**: Centered identity stack at top (interactive circular headshot, display name, bio, and friends counter pill), followed by a structured vertical options list (Email, Past Plans, Logout).
* **Navigation Isolation**: When sub-sheets or crop editors mount, the bottom navigation bar is automatically suppressed (`onToggleBottomNav(true)`).

### 2. Main Profile Screen Elements (`ProfileScreen.tsx`)
* **Avatar & Upload Badge**:
  * Large circular container: 136px by 136px (`w-[136px] h-[136px] rounded-full overflow-hidden select-none relative shadow-lg shadow-black/40 ring-2 ring-white/10 group-hover:ring-[#FF6B2C]/50 active:scale-[0.98] transition`).
  * Camera Action Button: Positioned at bottom-right (`w-9 h-9 rounded-full bg-[#FF6B2C] hover:bg-[#FF8552] border-2 border-black flex items-center justify-center text-white shadow-xl active:scale-90 transition`).
  * Uploading State: Semi-transparent blurred dark backdrop (`bg-black/50 backdrop-blur-[2px]`) with centered spinning loader (`Loader2 text-[#FF6B2C] animate-spin`).
  * Upload Error Banner: Compact red error alert (`bg-red-950/40 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-1 flex items-center gap-1.5 animate-fade-in`).
* **Name & Bio Section**:
  * Name: Bold sans-serif button (`font-sans font-bold text-xl text-white tracking-wide hover:opacity-80 active:scale-[0.98] transition`).
  * Bio: Medium gray text button (`text-zinc-550 text-[13px] font-medium leading-relaxed mt-1.5 mb-5 hover:text-zinc-400 active:scale-[0.98] transition max-w-[280px] text-center`).
* **Friends Pill Button**:
  * Capsule container (`bg-zinc-900/70 border border-white/[0.05] hover:border-white/[0.10] hover:bg-zinc-900 rounded-2xl px-5 py-2.5 flex items-center gap-2.5 active:scale-[0.97] mb-6`).
  * Icon & Label: `Users` icon (`text-zinc-400 group-hover:text-white`) and text `{friendCount} Friends` (`font-semibold text-[13px] text-zinc-200`).
  * Unread Indicator: Solid red notification badge at top-right (`w-2.5 h-2.5 rounded-full bg-[#EF4444] ring-2 ring-black`) when unhandled incoming friend requests exist.
* **Profile Options List**:
  * *Email Row*: Dark rounded icon tile (`bg-zinc-900/60 border border-white/[0.02] text-zinc-400`), uppercase "EMAIL" category label (`text-[11px] text-zinc-500 font-medium tracking-wider`), and user email (`text-sm font-medium text-zinc-200 truncate`).
  * *Past Plans Row*: Interactive button tile with `History` icon and "Past Plans" label (`text-sm font-medium text-zinc-200 hover:bg-zinc-900/20 rounded-xl px-1 py-2.5`).
  * *Logout Row*: Interactive button tile with `LogOut` icon and "Logout" label (`text-sm font-medium text-zinc-200 hover:bg-zinc-900/20 rounded-xl px-1 py-2.5`).

### 3. Edit Sub-Screens (`Name.tsx` & `About.tsx`)
* **Edit Name Sub-Screen (`Name.tsx`)**:
  * Full-screen black overlay (`absolute inset-0 bg-black z-50 flex flex-col text-zinc-200 animate-fade-in`).
  * Header: Back chevron (`ArrowLeft`) and "Name" heading.
  * Input: Dark container with accent orange border (`bg-[#0D0D10] border border-[#FF6B2C] rounded-xl px-4 py-3.5 text-sm text-zinc-200`).
  * Live Character Counter: Bottom-right tabular digits (`X/30 text-[11px] text-zinc-500`).
  * Save Button: Brand orange CTA (`bg-[#FF6B2C] hover:bg-[#FF8552] text-white py-3.5 rounded-xl font-bold text-xs tracking-wide shadow-lg shadow-[#FF6B2C]/10 active:scale-98`).
* **Edit About Sub-Screen (`About.tsx`)**:
  * Similar full-screen dark container.
  * Dynamic Auto-Expanding Textarea: Expands smoothly from 72px up to 120px height based on text content (`min-h-[72px] max-h-[120px] resize-none leading-relaxed`).
  * Live Character Counter: Bottom-right tabular digits (`X/140`).
  * Save Button: Brand orange CTA with inline spinning loader during saves.

### 4. Past Plans Archive Screen (`PastPlans.tsx`)
* **Header**: Glass blur header (`bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3.5`) with left back arrow and centered "Past Plans" title.
* **Plan Cards List**:
  * Left Column: Fixed 68px width showing stacked event date (bold uppercase white, e.g. "OCT 24") and time (zinc-400, e.g. "7:30 PM").
  * Center Column: 48px circular plan cover thumbnail (`rounded-full border border-white/10`) and plan title in bold white (`text-sm font-bold text-white truncate`).
  * Right Column: Color-coded attendance status badge:
    * *Hosted*: Clean white text (`text-white`).
    * *Joined*: Emerald green text (`text-emerald-400`).
    * *Skipped*: Rose red text (`text-rose-400`).
* **Empty State**: Centered `EmptyState` component with `History` icon, "No past plans yet", and subtitle "Completed plans will appear here."

### 5. Logout Bottom Sheet Modal
* **Backdrop**: Fixed dimmed overlay (`bg-black/70 backdrop-blur-sm fixed inset-0 z-50`).
* **Bottom Sheet Surface**: Rounded top panel (`background: #1C1C1E, border-t border-white/[0.08] rounded-t-[20px] p-5 pb-8 shadow-2xl`).
* **Drag Handle**: Centered pill handle (36px wide, 5px high, `rgba(255, 255, 255, 0.2)`).
* **Typography**: Bold headline "Log out?" (`text-lg font-bold text-white mb-1`) and reassurance subtitle "Your plans will be here when you come back." (`text-zinc-400 text-sm`).
* **Actions**:
  * Primary Action: Red button (`background: #EF4444 text-white font-semibold text-[15px] h-12 rounded-xl active:scale-[0.98]`).
  * Secondary Action: Subdued text button "Cancel" (`color: rgba(255, 255, 255, 0.4)`).

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `ProfileScreen` | `src/features/profile/screens/ProfileScreen.tsx` | Main profile view. Houses avatar display, camera upload trigger, name/bio buttons, friends counter, options list (Email, Past Plans, Logout), and sheet routing. | Rendered by `MainApp.tsx` on Tab 5. Emits `onLogout`, `setSelectedPlanId`, and `onToggleBottomNav`. |
| `ProfileContext` / `ProfileProvider` | `src/features/profile/state/ProfileContext.tsx` | Central state container and React Context. Stores `userProfile`, `activeUserId`, `activeUserUuid`, `isAdmin`, and `dbUsers`. Manages optimistic mutations and Realtime sync. | Wraps `AppContent` in `App.tsx`. Consumed globally via `useProfileStore()`. |
| `Name` | `src/features/profile/screens/Name.tsx` | Sub-screen modal for editing display name. Enforces 30-char limit, validates non-empty strings, and triggers name updates. | Mounted conditionally by `ProfileScreen` when `activeSheet === 'editName'`. |
| `About` | `src/features/profile/screens/About.tsx` | Sub-screen modal for editing bio. Auto-expands height dynamically up to 120px, enforces 140-char limit, and triggers bio updates. | Mounted conditionally by `ProfileScreen` when `activeSheet === 'editAbout'`. |
| `PastPlans` | `src/features/profile/screens/PastPlans.tsx` | Dedicated full-screen sheet displaying historical completed plans for the active user, with attendance badge indicators. | Mounted conditionally by `ProfileScreen` when `activeSheet === 'pastPlans'`. Reads `usePlansStore`. |
| `useProfileUpload` | `src/features/profile/hooks/useProfileUpload.ts` | Custom hook managing avatar validation, WebP processing, Supabase Storage uploads to bucket `avatars`, and folder cleanup. | Consumed by `ProfileScreen` during photo crop save. |
| `UserAvatar` | `src/IMGfromDB/UserAvatar.tsx` | Unified component for rendering user avatars across the app. Subscribes to cache eviction events and falls back to default avatar. | Used in `ProfileScreen`, `NavigationFooter`, chats, and plan member lists. |
| `PlanImageEditorModal` | `src/features/create/components/PlanImageEditorModal.tsx` | Canvas-based gesture editor supporting pan, zoom, and circular cropping for avatar images. | Reused by `ProfileScreen` for avatar framing. |

---

## 5. Data Flow

```text
[User Edits Profile in UI (Avatar / Name / Bio)]
                     │
                     ▼
             [Optimistic Update]
  ├── 1. `ProfileContext` updates `userProfile` state immediately (0ms)
  ├── 2. Corresponding user in `dbUsers` cache is updated in memory
  ├── 3. If avatar: calls `evictImageCache` to bust URL cache
  └── 4. UI reflects modifications instantly across all open views
                     │
                     ▼
            [Persist to Backend]
  ┌──────────────────┴────────────────────────────────┐
  │ Avatar Upload Flow                                │ Text Field Flow (Name / Bio)
  │                                                   │
  ▼                                                   ▼
[useProfileUpload]                                  [Supabase REST API]
  ├── Validate MIME/size (<= 10MB)                    ├── supabase.from('users').update({
  ├── Convert to WebP blob                            │     full_name: trimmed,
  ├── Upload to `avatars/<userId>/avatar`             │     bio: trimmed
  ├── Clean obsolete files in `<userId>/`             │   }).eq('id', activeUserUuid)
  └── Persist path in `users.profile_photo_path`      │
  └──────────────────┬────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
      Success                 Failure
         │                       │
         │                       ▼
         │           [Optimistic Rollback]
         │             ├── Restores `userProfile` to `previousProfile`
         │             ├── Restores `dbUsers` to `previousDbUsers`
         │             └── Displays error banner / alert in UI
         ▼
[Supabase PostgreSQL: public.users]
  └── Emits Realtime Event (`postgres_changes` on `public.users`)
         │
         ▼
[profile-users-realtime-<activeUserUuid> Channel]
  ├── Receives UPDATE event payload
  ├── Deduplicates against current optimistic state (prevents flicker)
  ├── Updates `userProfile` and `dbUsers` for other tabs / devices
  └── Notifies `onProfileChange` callback (persisting to `localStorage`)
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.users`
* **Role in Feature**: Stores persistent user identity, display name, public sequential identifier, bio, role, completed status, and friendship counter.
* **Columns**:
  * `id` (`uuid`, PK, not null): Foreign key referencing `auth.users(id)` with `ON DELETE CASCADE`.
  * `public_id` (`text`, unique, not null): Human-readable sequential identifier (e.g. `U000001`, `U000155`), generated by database sequence `user_public_id_seq`.
  * `full_name` (`text`, not null, default `''`): User's display name. Enforces check constraint `char_length(full_name) <= 40`.
  * `profile_photo_path` (`text`, nullable): Storage path reference in bucket `avatars` (e.g. `avatars/<uuid>/avatar`).
  * `bio` (`text`, not null, default `''`): Short personal bio or about snippet.
  * `created_at` (`timestamptz`, not null, default `now()`): Creation timestamp.
  * `updated_at` (`timestamptz`, not null, default `now()`): Timestamp of last profile update.
  * `profile_completed` (`boolean`, not null, default `false`): Flag indicating completion of onboarding profile setup.
  * `username` (`text`, nullable): Optional short handle. Enforces check constraint `char_length(username) <= 15`.
  * `role` (`user_role`, not null, default `'user'`): User authorization role enum (`'user'`, `'admin'`).
  * `friends` (`integer`, not null, default `0`): Cached count of accepted friendships.

### 2. Constraints & Indexes on `public.users`
* `users_pkey`: Primary key btree index on `(id)`.
* `users_public_id_key`: Unique btree index on `(public_id)`.
* `users_id_fkey`: Foreign key `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`.
* `full_name_length_check`: `CHECK ((full_name IS NULL) OR (char_length(full_name) <= 40))`.
* `username_length_check`: `CHECK ((username IS NULL) OR (char_length(username) <= 15))`.

### 3. Row Level Security (RLS) Policies on `public.users`
* **SELECT (`select_users`)**:
  * Roles: `{public}`
  * Condition: `true` (Allows public/unauthenticated resolution of basic profile records).
* **SELECT (`Allow authenticated users to read all profiles`)**:
  * Roles: `{authenticated}`
  * Condition: `true` (Permits authenticated members to view profiles of fellow users across plans).
* **INSERT (`Users can create their own profile`)**:
  * Roles: `{authenticated}`
  * Check: `(auth.uid() = id)` (Ensures new profile rows match the session user's auth UUID).
* **UPDATE (`Users can update their own profile`)**:
  * Roles: `{authenticated}`
  * Condition / Check: `(auth.uid() = id)` (Prevents users from modifying other members' profile rows).

### 4. Storage Bucket & Policies: `avatars`
* **Bucket Metadata**: Name: `avatars`, Public: `true`.
* **SELECT (`Public read avatars`)**:
  * Role: `{public}`
  * Condition: `bucket_id = 'avatars'` (Allows anyone to retrieve avatar images via public URL).
* **INSERT (`Users can upload own avatar`)**:
  * Role: `{authenticated}`
  * Check: `(bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text)` (Enforces that uploaded avatars must reside in a folder matching the user's auth UUID).
* **UPDATE (`Users can update own avatar`)**:
  * Role: `{authenticated}`
  * Condition / Check: `(bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text)`.
* **DELETE (`Users can delete own avatar`)**:
  * Role: `{authenticated}`
  * Condition: `(bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())::text)`.

### 5. Database Functions & Triggers
* **`update_user_friends_count()`**:
  * Trigger: `trg_update_user_friends_count` on table `public.friendships` (AFTER INSERT, UPDATE, DELETE).
  * Behavior: Automatically recounts accepted friendships where `user_1_id = users.id OR user_2_id = users.id` and updates `users.friends`.
* **`generate_user_public_id()`**:
  * RPC function called during user onboarding in `App.tsx`.
  * Increments sequence `user_public_id_seq` and formats the public ID as `'U' || lpad(next_val::text, 6, '0')`.

### 6. Realtime Channels
* **`profile-users-realtime-${activeUserUuid}`**:
  * Table: `public.users`.
  * Filter: Target record matching the active user UUID.
  * Events: `*` (INSERT, UPDATE, DELETE).
  * Behavior: Propagates remote changes (e.g. name or avatar changed on another client) into `ProfileContext` with duplicate filtering.

---

## 7. States & Rules

### Validation & Input Rules
* **Display Name**:
  * Client limit: 30 characters maximum (enforced via `maxLength` and slicing in `Name.tsx`).
  * DB limit: 40 characters maximum (`full_name_length_check`).
  * Cannot be empty or purely whitespace.
* **Bio / About**:
  * Client limit: 140 characters maximum (`MAX_ABOUT_LENGTH = 140`).
  * UI text area smoothly auto-expands from 72px up to 120px height (`Math.min(scrollHeight, 120)`).
  * Cannot be empty or purely whitespace.
* **Avatar File Requirements**:
  * Allowed formats: `image/jpeg`, `image/png`, `image/webp`.
  * Max file size: 10MB (`MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024`).
  * Crop format: 1:1 circular aspect ratio WebP blob.

### Invariants & Operational Rules
* **Single Canonical Avatar**: Each user maintains exactly one avatar file in Supabase Storage at key `{authUserId}/avatar`. After an upload succeeds, `useProfileUpload` lists the user directory and removes any legacy or alternate-format files.
* **0ms Optimistic Latency**: Name, bio, and avatar changes take effect immediately in the local React context. If background Supabase writes fail, state reverts to the exact snapshot taken prior to the mutation.
* **Realtime Deduplication**: Incoming Realtime events check if `newRow.full_name`, `newRow.bio`, and `newRow.profile_photo_path` match existing state. If identical, the event is discarded to avoid unnecessary re-renders or layout shifts.
* **Bottom Bar Auto-Suppression**: When any sub-screen (`editName`, `editAbout`, `pastPlans`, `friends`) or image crop editor is open, `onToggleBottomNav?.(true)` hides the global navigation footer to prevent navigation collisions.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`supabase.auth`**: Provides user authentication sessions and auth user UUIDs required for RLS checks and storage path routing.
* **`FriendshipContext` (`useFriendshipStore`)**: Provides live `friendCount` and `incomingRequests` to `ProfileScreen`.
* **`PlansContext` (`usePlansStore`)**: Supplies completed plans for rendering the activity history in `PastPlans.tsx`.
* **`PlanImageEditorModal`**: Provides circular image repositioning, zooming, and WebP canvas export.
* **`imageResolver` & `imagePipeline`**: Manages WebP compression, URL resolution (`resolveImage`), and cache invalidation (`evictImageCache`).

### Downstream Impact of Changes
* **Identity across the App**: `useProfileStore` is consumed by nearly every screen in the system:
  * `NavigationFooter`: Renders the active user's avatar thumbnail in Tab 5.
  * `ChatsScreen` & `PlanChatScreen`: Uses `dbUsers` and `userProfile` for message author names, avatar resolution, and sender bubbles.
  * `WalletScreen` & `TransactionScreen`: Balances, participant breakdowns, and ledger entries reference `users.id`.
  * `PlansContext`: Host indicators, member listings, and permissions depend on `activeUserUuid`.
* **Schema Modifications on `users`**: Modifying column names (such as `profile_photo_path` or `full_name`) requires synchronized updates in `ProfileContext.tsx`, `db.ts` (`updateDbUser`), and `App.tsx` (`restoreSessionAndProfile`).
* **Storage Bucket Invariants**: Changing the avatar path structure requires updating storage RLS policies (`(storage.foldername(name))[1] = auth.uid()::text`) and resolver logic in `imageResolver.ts`.

---

## 9. Important Files

* `apps/app/src/features/profile/screens/ProfileScreen.tsx`: Main profile screen with avatar preview, edit triggers, and bottom sheet dialogs.
* `apps/app/src/features/profile/state/ProfileContext.tsx`: Root identity provider managing `userProfile`, `dbUsers`, optimistic updates, and Realtime sync.
* `apps/app/src/features/profile/screens/Name.tsx`: Edit modal for user full name with character count validation.
* `apps/app/src/features/profile/screens/About.tsx`: Edit modal for user bio with auto-expanding textarea.
* `apps/app/src/features/profile/screens/PastPlans.tsx`: Archive view displaying completed plans and member attendance states.
* `apps/app/src/features/profile/hooks/useProfileUpload.ts`: Storage upload hook enforcing WebP encoding and single-file cleanup.
* `apps/app/src/IMGfromDB/UserAvatar.tsx`: Universal user avatar renderer with fallback handling and cache subscription.
* `apps/app/src/shared/imaging/imageResolver.ts`: Central image URL resolution and cache eviction layer.
* `apps/app/src/App.tsx`: App root bootstrapping profile session restoration and user record initialization.

---

## 10. Known Issues

### 1. Code Issues
* **Email Display Fallback Overload**: `ProfileScreen.tsx` displays `emailDisplay = userProfile?.phone || (userProfile as any)?.email || ...`. In `App.tsx`, the profile mapping sets `phone: authUser.email || ""` because the `UserProfile` interface lacks a dedicated `email` field. This conflates phone and email fields across type boundaries.
* **Dual Property Naming (`profile_photo` vs. `profile_photo_path`)**: The frontend `User` interface defines both `profile_photo` and `profile_photo_path`. The database table uses `profile_photo_path`. Code in `ProfileContext.tsx` and `db.ts` performs manual bridging to populate both fields, introducing minor redundancy.
* **Hardcoded Initial Profile Fallbacks**: In `ProfileContext.tsx` and `App.tsx`, `college_or_work` is hardcoded to `"SRM Chennai"` and the fallback bio defaults to `"Always spontaneous, never planless."` when fields are null or uninitialized.

### 2. Database Issues
* **Redundant Public Read Policy**: The `users` table has an open SELECT policy (`select_users` allowing `{public}`) alongside authenticated policies (`Allow authenticated users to read all profiles` and `Users can view accepted friends profiles`). Because RLS policies are additive (`OR`), the open `select_users` policy effectively renders the friend-restricted policy moot.
* **Unused `username` Column**: The `public.users` table contains a `username` column with a 15-character check constraint. However, there is no username editing flow or display field in `ProfileScreen` (user handles default to null or sanitized full name strings).
* **Missing Schema Columns for Frontend Types**: Frontend types `User` declare `phone_number` and `college_or_work`, but these do not exist as physical columns in `public.users`.

### 3. Unknowns
* **Unique Handle / Username Roadmap**: Whether `@username` handles will be incorporated as an editable public identity field with unique constraints in future profile revisions.
* **Phone Verification Architecture**: Whether user phone numbers will be stored in `auth.users(phone)` via Supabase Phone Auth OTP or introduced as a dedicated column in `public.users`.

---

## 11. Modification Notes

### Pre-Change Verification Checklist
1. **Verify Auth UID Consistency**: Ensure all updates to `public.users` pass `id = activeUserUuid` (where `activeUserUuid === auth.uid()`). Any mismatched ID will be silently rejected by RLS without throwing a visible database error.
2. **Preserve Optimistic Rollback Pattern**: Always clone `profileRef.current` and `dbUsersRef.current` before updating state in `ProfileContext`. If a background network request fails, restore both references and log the exception.
3. **Bust Avatar Cache on Update**: Always invoke `evictImageCache(avatarPath, ImageType.Avatar)` whenever an avatar is updated or replaced so that `UserAvatar` components fetch the newly uploaded asset.
4. **Maintain Bottom Navigation Guard**: If adding new modals or sheets to `ProfileScreen`, ensure they register with `onToggleBottomNav?.(isOpen)` to avoid layout collisions with the persistent footer.

### Post-Change Verification Steps
1. **Name & Bio Edit Flow**:
   - Tap full name, edit text, tap Save. Confirm instant 0ms update in UI. Refresh page and verify persistence in Supabase table `public.users`.
   - Tap bio, input multi-line text, verify auto-expanding textarea, tap Save. Confirm instant update and persistence.
2. **Avatar Upload & Crop Flow**:
   - Tap avatar, choose an image (>1MB), adjust zoom/pan in circular crop modal, tap Save.
   - Confirm instant optimistic image preview.
   - Inspect Supabase Storage bucket `avatars` to verify the new file exists at `{authUserId}/avatar` and that obsolete files are cleaned up.
   - Refresh the page and ensure the avatar loads without broken image placeholders.
3. **Multi-Session Realtime Sync**:
   - Open two browser tabs logged in as the same user.
   - Change the name or avatar in Tab 1.
   - Verify Tab 2 updates automatically within ~300ms without manual refresh.
4. **Logout Bottom Sheet**:
   - Tap Logout. Verify bottom sheet slides up smoothly with dimmed backdrop.
   - Tap Cancel: verify sheet dismisses and navigation remains functional.
   - Tap Logout: verify user is logged out, local storage session key is cleared, and onboarding/login view appears.
