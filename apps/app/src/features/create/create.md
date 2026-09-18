# Feature Documentation: Create

## 1. Overview

The **Create** feature is the plan authoring, customization, and publishing engine of Planless. It guides a host from an initial activity idea to a fully configured, published plan with invited participants, capacity limits, waitlist rules, location metadata, and expense-sharing parameters.

* **Core Function**: A multi-phase wizard that collects plan category, friends/circles, capacity and waitlist modes (Automatic vs. Assigned), schedule/deadlines, location, and cover imagery, then writes the complete plan and participant records to Supabase.
* **Product Role**: Occupies the central Create tab in bottom navigation (`activeTab === "create"`). In the active application, `MainApp.tsx` mounts `<CreateMVP />` as the streamlined creator flow, while `<CreatePlanScreen />` (`Create.tsx`) remains in the codebase as an extended multi-step discovery flow.
* **Lifecycle Boundary**: The Create feature owns state from initial category selection until the plan is committed to the database. Once published, the user sees a confirmation overlay with a shareable invite link before being redirected to the **Plans** tab (`activeTab === "plans"`, filter `JOINED`), which takes over ongoing lifecycle and coordination.

---

## 2. User Flow

### 1. Initiating Plan Creation
* The user taps the **Create** tab in bottom navigation or clicks "Create a Plan" from an empty Home/Plans state.
* `MainApp.tsx` sets `activeTab = "create"`.
* The router and draft storage restore any in-progress creation draft from `localStorage` and `IndexedDB`. If no draft exists, the flow initializes at `createPhase = "category"`.

### 2. Category Selection (`createPhase === "category"`)
* `<CreateCategoryScreen />` displays curated category cards: **Sports**, **Movies**, **Dining**, and **Custom**.
* Tapping a category assigns `selectedCategory`, sets default category metadata, and advances the wizard to `"who"`.

### 3. Participant Selection (`createPhase === "who"`)
* `<WhoIsComingScreen />` renders `<FriendsSelector />`.
* The user searches friends by name/username, toggles individual friends, or selects pre-grouped circles.
* Selected participants are staged in `useCreatePlanForm` state (`selectedFriends`, `individuallySelectedFriendIds`).
* Tapping **Continue** advances to `"who-actually"`.

### 4. Capacity & Waitlist Configuration (`createPhase === "who-actually"`)
* `<WhoIsActuallyComing />` wraps `<ParticipantManagementScreen />` in creation mode.
* The user chooses the **Participant Filtering Mode**:
  * **Automatic ("First come, first served")**: Any invitee who accepts joins immediately until capacity is reached; subsequent acceptances enter the waitlist in order of response time.
  * **Assigned ("Host decides")**: The host explicitly assigns invitees into "Going" (guaranteed spots) and "Waitlist" groups, and sets waitlist priority order.
* The host configures plan capacity (`totalCapacity`) via `<PlanSizeBottomsheet />` (stepper constraint: 2–50).
* Tapping **Continue** advances to `"review"`.

### 5. Interactive Plan Review (`createPhase === "review"`)
* `<CreatePlanReview />` mounts `<PlansDetailsScreen />` in `createMode={true}`, providing a full WYSIWYG preview of the final plan card.
* **Inline Edits & Modal Adjustments**:
  * **Title**: Tapping the title triggers inline editing or `<EditTitleModal />`.
  * **Cover Image**: Tapping the cover opens device gallery (`pickImageFromGallery`) and launches `<PlanImageEditorModal />`. The modal exports both an original image (for hero/details) and a 4:5 cropped image (for feed card).
  * **Date & Time**: Tapping the datetime card opens `<WhenIsPlanScreen />` or native picker. The user can also configure the RSVP response deadline (e.g. "Plan start", "1 Hour before", "Custom").
  * **Location**: Tapping venue opens Google Places autocomplete search to resolve `place_id`, formatted address, and coordinates.
  * **Cost / Expense**: Tapping cost opens `<EditCostModal />` to set total estimated expenses.
  * **Roster**: Tapping participants returns to `"who-actually"` or opens `<PlanSizeBottomsheet />`.

### 6. Publishing & Persistence (`handleHostPlanSubmit`)
* The host taps **Host This Plan**.
* Validation guards verify:
  * Host UUID is present.
  * Title is non-empty and not default placeholder text.
  * Date/time is valid and in the future.
  * Location has been selected.
  * Submission is not already in flight (`isSubmitting = true`).
* The client executes the publish sequence:
  1. Calls `createPlan` in `PlansContext.tsx`, inserting a new row into Supabase `plans`.
  2. Database trigger `trg_auto_insert_plan_host_participant` automatically records the creator as `HOST` / `JOINED`.
  3. Client calls `api.upsertParticipants` with initial invitees marked `PARTICIPANT` / `INVITED` (and assigns group/position in Assigned mode).
  4. Client uploads original cover image and cropped card image to the `plan-images` Supabase storage bucket via `uploadPlanImage` and `uploadPlanCardImage`.
  5. If total cost > 0, client calls `recalculate_wallet_expenses` RPC to initialize plan expense splits.
  6. Client clears local storage and IndexedDB drafts.
  7. Client transitions `createPhase` to `"confirmation"`.

### 7. Confirmation & Invite Sharing (`createPhase === "confirmation"`)
* Renders celebration overlay confirming plan creation.
* Displays the plan summary card, public invite link, and a **Copy Invite Link** button.
* Tapping **Done** or **Go to Plans** switches `activeTab` to `"plans"` with the `JOINED` filter active.

---

## 3. UI Documentation

### 1. Overall Layout & Wizard Navigation
* **Container Structure**: Full-screen dark surface (`bg-black text-white`) with fixed top navigation bar and safe-area padding.
* **Top Header Controls**:
  * Left: Circular back arrow button (`ArrowLeft`, active feedback: `active:scale-90`) to return to previous wizard phase.
  * Center: Phase-specific title (e.g. "Select Category", "Who's Coming?", "Who's Actually Coming?", "Review Plan") in bold sans-serif typography (`text-base font-semibold text-white`).
  * Right: Cancel/Close button triggering `<ExitEditingDialog />` if draft has modifications.
* **Transitions**: Wizard phases navigate with horizontal slide and opacity transitions via `AnimatePresence`.

### 2. Category Selection Screen (`CreateCategoryScreen`)
* **Grid Layout**: 2x2 grid of prominent activity cards:
  * *Sports*: Emerald gradient border, compass/trophy icon, labeled "Sports".
  * *Movies*: Violet gradient border, film clapperboard icon, labeled "Movies".
  * *Dining*: Rose gradient border, utensils icon, labeled "Dining".
  * *Custom*: Zinc/Orange gradient border, calendar icon, labeled "Custom".
* **Visual Treatment**: Rounded corners (`rounded-2xl`), semi-transparent dark backgrounds (`bg-zinc-900/60 border border-white/10`), active hover scale (`hover:scale-[1.02] active:scale-[0.98]`).

### 3. Participant Selection Screen (`WhoIsComingScreen` & `FriendsSelector`)
* **Search Bar**: Dark pill input with glass border (`bg-[#0D0D10] border border-white/10 rounded-xl px-4 py-3`), search magnifying glass icon, and clear button.
* **Circle Chips Bar**: Horizontally scrollable row of rounded pills representing friend circles (e.g. "All", "College", "Sports Crew"). Selected circles illuminate with an orange ring.
* **Friends List Rows**:
  * Left: Circular profile photo (`UserAvatar`, 40px diameter).
  * Center: Display name (`text-sm font-semibold text-white`) and username handle (`text-xs text-zinc-400`).
  * Right: Custom checkbox (empty zinc ring when unselected, solid `#FF6B2C` circle with white checkmark when selected).
* **Sticky Bottom Bar**: Fixed footer with gradient shadow and primary CTA: "Continue with X friends" (`bg-[#FF6B2C] hover:bg-[#FF8552] text-white font-bold py-3.5 rounded-xl text-center w-full shadow-lg active:scale-98`).

### 4. Capacity & Waitlist Screen (`WhoIsActuallyComing`)
* **Mode Selection Cards**: Two interactive radio cards:
  * *Automatic ("First come, first served")*: Bolt icon, subtitle explaining that early acceptances secure spots automatically.
  * *Assigned ("Host decides")*: User-check icon, subtitle explaining that host selects who gets guaranteed spots and who waitlists.
* **Capacity Pill**: Prominent rounded pill displaying current max spots (e.g. "8 Spots"). Tapping opens `<PlanSizeBottomsheet />` featuring stepper controls (`-` and `+`) and numerical readout (constrained between 2 and 50).
* **Segmented Member Lists**:
  * "Going" group: Shows green spot indicator and list of confirmed guests.
  * "Waitlist" group: Shows amber indicator and list of overflow guests with ordinal number tags (`#1`, `#2`).

### 5. Plan Review Screen (`CreatePlanReview`)
* **WYSIWYG Plan Preview**: Exact visual match of the live `PlansDetailsScreen`.
* **Hero Image Canvas**: Full-width cover with dark bottom gradient. Floating circular camera badge (`bg-[#FF6B2C] text-white p-2.5 rounded-full shadow-lg`) allows tapping to open gallery and `<PlanImageEditorModal />`.
* **Tappable Metadata Cards**:
  * *Title*: Bold editable heading (`text-xl font-bold text-white`) with pencil icon.
  * *When*: Card with calendar icon showing event date/time and RSVP deadline tag. Tapping opens scheduling modal with time wheels.
  * *Where*: Card with map pin icon showing venue name and address. Tapping launches Google Places search overlay.
  * *Cost*: Card showing per-person estimated split with Indian Rupee symbol (`₹`).
* **Sticky Publish Bar**: "Host This Plan" prominent button (`h-12 bg-[#FF6B2C] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B2C]/20 active:scale-98`). Shows spinning loader (`Loader2 animate-spin`) during async submission.

### 6. Confirmation Overlay (`createPhase === "confirmation"`)
* **Celebration Banner**: Animated spring checkmark icon in emerald ring with "Plan Published!" headline.
* **Card Summary**: Condensed preview card showing plan title, category thumbnail, and scheduled time.
* **Shareable Invite Box**: Container with read-only invite link (`planless.app/join/<token>`) and a distinct **Copy Link** button that transitions to a green "Copied!" state with checkmark.
* **Action Button**: "Go to Plans" pill button routing to the Plans tab.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `CreateMVP` | `src/features/create/screens/CreateMVP.tsx` | Active root container for the Create tab. Manages wizard phases, URL route sync, draft persistence, submission, and confirmation overlay. | Mounted in `MainApp.tsx` (`activeTab === "create"`). Instantiates `useCreatePlanForm` and coordinates wizard sub-screens. |
| `CreatePlanScreen` | `src/features/create/screens/Create.tsx` | Legacy/alternative multi-phase creator supporting discovery browsing, customizers, and sports select. | Standalone alternative to `CreateMVP`. Shares same draft storage and hooks. |
| `CreateCategoryScreen` | `src/features/create/screens/CreateCategoryScreen.tsx` | Phase 0 screen. Displays category selection cards (Sports, Movies, Dining, Custom) and handles category selection. | Rendered by `CreateMVP` when `createPhase === "category"`. |
| `WhoIsComingScreen` | `src/features/create/screens/WhoIsComingScreen.tsx` | Phase 1 screen. Renders search bar, friend list, and circle chips for selecting participants. | Renders `FriendsSelector`. Reads `AVAILABLE_FRIENDS` and passes selected items to `useCreatePlanForm`. |
| `WhoIsActuallyComing` | `src/features/create/screens/WhoIsActuallyComing.tsx` | Phase 2 screen. Configures capacity, waitlist toggle, and Automatic vs. Assigned participant grouping. | Wraps `ParticipantManagementScreen` in creation mode. Manages `priorityGuestIds` and capacity syncing. |
| `CreatePlanReview` | `src/features/create/screens/CreatePlanReview.tsx` | Phase 3 screen. Full WYSIWYG plan preview allowing inline edits to title, cover image, venue, datetime, cost, and capacity. | Mounts `PlansDetailsScreen(createMode=true)`. Uses `PlanImageEditorModal` and triggers final plan submission. |
| `WhenIsPlanScreen` | `src/features/create/screens/WhenIsPlanScreen.tsx` | Specialized scheduling screen with date/time wheel pickers, quick chips (Today, Tomorrow, Weekend), and RSVP deadline selector. | Invoked during edit date flow and legacy wizard. Uses `WheelPicker` and `RSVP`. |
| `FriendsSelector` | `src/features/create/components/FriendsSelector.tsx` | Searchable participant picker with friend checkboxes, avatar resolution, and circle grouping chips. | Consumed by `WhoIsComingScreen`. Uses `FriendshipContext`. |
| `PlanSizeBottomsheet` | `src/features/create/components/PlanSizeBottomsheet.tsx` | Modal bottom sheet stepper adjusting total plan capacity. Enters edit mode on open, adjusts freely with +/- buttons, enforces invite ceiling, and commits changes upon closing (backdrop tap, swipe-down, or drag handle) without a separate confirmation button. | Consumed across `WhoIsActuallyComing`, `CreatePlanReview`, `WhenIsPlanScreen`, and `ParticipantManagementScreen`. |
| `PlanSizeSlider` | `src/features/create/components/PlanSizeSlider.tsx` | Custom horizontal track slider with draggable thumb for setting capacity count. | Used inside `WhenIsPlanScreen`. |
| `PlanImageEditorModal` | `src/features/create/components/PlanImageEditorModal.tsx` | Dual-crop modal allowing hosts to position and crop an image into both 16:9 hero and 4:5 portrait formats. | Consumed by `CreatePlanReview` and `WhenIsPlanScreen`. Returns raw Blobs and object URLs. |
| `ExitEditingDialog` | `src/features/create/components/ExitEditingDialog.tsx` | Confirmation modal prompted when a user attempts to discard an in-progress plan creation draft. | Triggers `clearCreatePlanDraft` on discard confirmation. |
| `useCreatePlanForm` | `src/features/create/hooks/useCreatePlanForm.ts` | Central state hook managing all draft form fields, setters, derived values, and persistence triggers. | Instantiated once in `CreateMVP` / `CreatePlanScreen` and prop-drilled across child wizard screens. |
| `draftParticipantStorage` | `src/features/create/utils/draftParticipantStorage.ts` | Synchronous `localStorage` persistence layer for form text, flags, dates, and participant ID arrays. | Used by `useCreatePlanForm`, `CreateMVP`, and `WhoIsActuallyComing`. |
| `draftCoverStorage` | `src/features/create/utils/draftCoverStorage.ts` | Asynchronous `IndexedDB` persistence layer storing binary cover image Blobs across reloads without hitting `localStorage` size limits. | Invoked by `useCreatePlanForm` and `CreatePlanReview`. |

---

## 5. Data Flow

```text
[User Inputs across Wizard Phases]
  (Category, Friends, Capacity Mode, DateTime, Venue, Cost, Custom Cover)
         │
         ▼
[useCreatePlanForm Hook State]
  ├── Synchronous state (React useState)
  ├── localStorage ('planless_create_plan_draft') ── Primitives, IDs, flags
  └── IndexedDB ('planless_draft_db') ─────────────── Binary cover Blob
         │
         ▼
[CreatePlanReview (createMode = true)]
  └── Builds synthetic Plan object (`syntheticPlan`)
  └── Mounts PlansDetailsScreen for WYSIWYG preview & inline adjustments
         │
         │ (User taps "Host This Plan")
         ▼
[PlansContext.createPlan(newDbPlan, ...)]
         │
         ├──► 1. Supabase REST: INSERT INTO public.plans
         │        ├── Generates UUID (id)
         │        ├── trg_plans_public_id validates/generates public_id
         │        └── trg_auto_insert_plan_host_participant fires:
         │              Auto-inserts creator into plan_participants (role='HOST', rsvp_status='JOINED')
         │
         ├──► 2. Supabase REST: UPSERT INTO public.plan_participants
         │        ├── Inserts invitee records (role='PARTICIPANT', rsvp_status='INVITED')
         │        ├── In Assigned mode: sets assigned_group ('GOING' | 'WAITLIST') & waitlist_position
         │        └── trg_maintain_plan_invited_participants fires:
         │              Updates plans.invited_participants count
         │
         ├──► 3. Supabase Storage: uploadPlanImage & uploadPlanCardImage
         │        ├── Uploads full cover to bucket 'plan-images' (<planId>/plancoverimage1.webp)
         │        ├── Uploads cropped card to bucket 'plan-images' (<planId>/plancardimage1.webp)
         │        └── Updates plans.cover_card_image in database
         │
         ├──► 4. Supabase RPC: recalculate_wallet_expenses(p_plan_id)
         │        └── If total_cost > 0: computes per-person split, creates wallet_expenses row
         │
         ├──► 5. Local State Cleanup
         │        ├── clearCreatePlanDraft() (wipes localStorage)
         │        └── clearDraftCoverBlob() (wipes IndexedDB)
         │
         ▼
[Confirmation Screen Overlay]
  └── Renders celebration state, copyable invite link, and navigation to Hosted Plans
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.plans`
* **Role in Create**: Stores primary plan entity and configuration.
* **Columns Populated on Create**:
  * `id` (`uuid`, PK): Default `gen_random_uuid()`.
  * `public_id` (`text`, unique): Client sends prefixed string (`p_<timestamp>`).
  * `title` (`text`, not null): Plan display title (max 50 chars).
  * `category` (`text`, not null): Upper-case category (`SPORTS`, `MOVIES`, `DINING`, `CUSTOM`).
  * `subcategory` (`text`, not null): Upper-case subcategory (default `'OTHER'`).
  * `place_name` (`text`, not null): Name of destination venue.
  * `place_address` (`text`, not null): Formatted address.
  * `place_id` (`text`, nullable): Google Places identifier.
  * `latitude` / `longitude` (`double precision`, nullable): Geographic coordinates.
  * `scheduled_at` (`timestamptz`, not null): Planned start timestamp.
  * `rsvp_deadline` (`timestamptz`, not null): Response cutoff timestamp.
  * `plan_size` (`integer`, nullable): Target/max capacity limit (NULL = unlimited).
  * `total_cost` (`numeric`, not null): Total estimated cost (default 0).
  * `status` (`plan_status`, not null): Set to `'LIVE'`.
  * `participant_filtering` (`participant_filtering_type`, not null): `'AUTOMATIC'` or `'ASSIGNED'`.
  * `waitlist_order_mode` (`waitlist_order_mode_enum`, not null): `'AUTO'` (first-come) or `'CUSTOM'` (host priority).
  * `cover_image` (`text`, nullable): Fallback category asset path or uploaded storage URL.
  * `cover_card_image` (`text`, nullable): Uploaded portrait crop storage path.
  * `discovery_item_id` (`uuid`, nullable, FK `discovery_items.id`): Associated discovery template if cloned.
  * `allow_participant_invites` (`boolean`, not null): Defaults to `false`.
  * `invited_participants` (`integer`): Maintained by DB trigger.
  * `attended_participants` (`integer`, not null): Defaults to 0.

### 2. Table: `public.plan_participants`
* **Role in Create**: Stores the host and initial invitee records.
* **Columns Populated on Create**:
  * `plan_id` (`uuid`, FK `plans.id`, PK component 1)
  * `user_id` (`uuid`, FK `users.id`, PK component 2)
  * `role` (`participant_role`): `'HOST'` for plan creator, `'PARTICIPANT'` for invitees.
  * `rsvp_status` (`rsvp_status`): `'JOINED'` for host, `'INVITED'` for friends.
  * `assigned_group` (`assigned_group_enum`, nullable): In Assigned mode, set to `'GOING'` or `'WAITLIST'`. In Automatic mode, `NULL`.
  * `waitlist_position` (`integer`, nullable): In Assigned mode for waitlisted guests, sequential integer (`1, 2, 3...`). Otherwise `NULL`.
  * `delivery_status` (`varchar`): Defaults to `'DELIVERED'`.
  * `responded_at` (`timestamptz`, nullable): Set to current timestamp for host, `NULL` for invitees.

### 3. Triggers Directly Affecting Plan Creation
* **`trg_auto_insert_plan_host_participant`** (AFTER INSERT on `plans`):
  Executes `handle_new_plan_creator_participant()`. Inspects `auth.uid()`; if non-null, automatically inserts the creator into `plan_participants` with `role = 'HOST'` and `rsvp_status = 'JOINED'`.
* **`trg_plans_public_id`** (BEFORE INSERT on `plans`):
  Executes `generate_plan_public_id()`. If `public_id` is null, empty, or starts with `P_%` / `__temp__%`, assigns sequential `P000001` format.
* **`trg_maintain_plan_invited_participants`** (AFTER INSERT/UPDATE/DELETE on `plan_participants`):
  Executes `trg_maintain_plan_invited_participants()`. Recounts non-skipped participants and updates `plans.invited_participants`.
* **`trg_enforce_waitlist_position_invariant_trigger`** (BEFORE INSERT/UPDATE on `plan_participants`):
  Executes `trg_enforce_waitlist_position_invariant()`. Ensures `waitlist_position` is only populated when valid under the plan's filtering mode.

### 4. Storage Bucket: `plan-images`
* **Configuration**: Public bucket, 10MB file limit, MIME types: `image/webp, image/jpeg, image/png, image/jpg`.
* **Storage Path Scheme**: `<planId>/plancoverimage<N>.webp` (full cover) and `<planId>/plancardimage<N>.webp` (card crop).
* **RLS Enforcement**: Insert/Update guarded by `is_plan_image_host(name, auth.uid())`, which validates that the folder name matches the plan UUID and caller is an active host with `rsvp_status = 'JOINED'`.

### 5. PostgreSQL Functions / RPCs
* **`recalculate_wallet_expenses(p_plan_id uuid)`**:
  Runs as `SECURITY DEFINER`. Divides `total_cost` by `plan_size` (or joined count) and creates/updates a `wallet_expenses` row with `expense_type = 'PLAN_EXPENSE'` and child `wallet_expense_participants` records for joined attendees.

---

## 7. States & Rules

### Wizard Phase State Machine
The creation flow transitions through strictly sequenced phases:

```text
[category] ──► [who] ──► [who-actually] ──► [review] ──► [confirmation]
     ▲           │             │               │
     │           ▼             ▼               │
     └── Exit / Discard Draft Dialog ◄─────────┘
```

* `category`: Selects activity domain. Can be re-entered from review.
* `who`: Selects friends from contacts/circles.
* `who-actually`: Configures capacity, waitlist toggle, and Assigned vs. Automatic grouping.
* `review`: WYSIWYG card preview with inline edit modal triggers.
* `confirmation`: Terminal display upon successful DB write.

### Automatic vs. Assigned Waitlist Rules
* **Automatic Mode (`participant_filtering = 'AUTOMATIC'`)**:
  * `waitlist_order_mode = 'AUTO'`.
  * `assigned_group = NULL` for all invitees.
  * Invitees start as `INVITED`. When accepting, first $N$ respondents (where $N = \text{plan\_size} - \text{hostOffset}$) become `JOINED`. Subsequent acceptances become `WAITLISTED` based on timestamp (`joined_queue_at`).
* **Assigned Mode (`participant_filtering = 'ASSIGNED'`)**:
  * `waitlist_order_mode = 'CUSTOM'`.
  * Host divides invitees into "Going" (`assigned_group = 'GOING'`) and "Waitlist" (`assigned_group = 'WAITLIST'`).
  * Waitlisted invitees receive explicit integer rankings (`waitlist_position = 1, 2, 3...`).
  * When invited guests respond to their invitation, their assigned slot determines whether they become `JOINED` or `WAITLISTED`.

### Invariants & Validation Constraints
* **Deadline Ordering**: `rsvp_deadline <= scheduled_at`. The database check constraint `check_rsvp_deadline_before_scheduled` will reject any insert where the deadline is later than the event start.
* **Title Bounds**: `length(trim(title)) > 0` and `char_length(title) <= 50`.
* **Capacity Bounds**: `plan_size IS NULL OR plan_size >= 1`.
* **Host Role Invariant**: The creating user must always be recorded as an active host (`role = 'HOST'`, `rsvp_status = 'JOINED'`) to satisfy storage upload RLS policies.
* **Draft Isolation**: Binary cover images must never be placed in `localStorage`. They are stored in IndexedDB under store key `creation_cover_blob` and converted to short-lived object URLs in memory.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Supplies the authenticated user's ID (`dbUuid`), display name, and avatar. Plan creation fails validation if `userProfile` is missing.
* **`FriendshipContext` (`useFriendshipStore`)**: Supplies friend records and circle groupings to `<FriendsSelector />`.
* **Google Places API (via `useGooglePlacesAutocomplete` / Edge Function)**: Resolves venue names, formatted addresses, and coordinate pairs for mapping.
* **`imageUtils.ts` & Canvas**: Performs client-side image compression and WebP conversion before uploading.

### Downstream Impact of Changes
* **`plans` Table Schema**: Any alterations to required columns, types, or check constraints immediately affect `PlansContext.createPlan` and will block plan publication.
* **`plan-images` Storage Path Structure**: The RLS policy `is_plan_image_host` strictly expects folder `[1]` to equal the plan UUID (`<planId>/plancoverimageN.webp`). Altering this folder convention will cause image uploads to fail with storage 403 Forbidden errors.
* **Feed Filters (`home.md` & `plans.md`)**: Newly created plans are projected with `status = 'LIVE'`. The Home feed filters for unresponded invitations (`role = 'PARTICIPANT'`, `rsvp_status = 'INVITED'`), while Hosted Plans filters for `role = 'HOST'` and `rsvp_status = 'JOINED'`.

---

## 9. Important Files

* `src/features/create/screens/CreateMVP.tsx`: Active root wizard component managing navigation, draft syncing, and submission.
* `src/features/create/screens/CreatePlanReview.tsx`: Review screen presenting WYSIWYG preview and inline adjustment modals.
* `src/features/create/screens/WhoIsActuallyComing.tsx`: Participant capacity, waitlist mode, and assigned order management.
* `src/features/create/screens/WhoIsComingScreen.tsx`: Friend selection and search interface.
* `src/features/create/hooks/useCreatePlanForm.ts`: Primary form state and derived value manager.
* `src/features/create/utils/draftParticipantStorage.ts`: LocalStorage draft serializer and recovery logic.
* `src/features/create/utils/draftCoverStorage.ts`: IndexedDB persistence for custom cover image Blobs.
* `src/features/create/components/PlanImageEditorModal.tsx`: Image crop modal for dual 16:9 and portrait formats.
* `src/features/plans/state/PlansContext.tsx`: Store method `createPlan` orchestrating database inserts and RPC calls.
* `src/features/plans/api/plans.ts`: Low-level Supabase REST calls (`createPlan`, `upsertParticipants`).
* `src/shared/utils/imageUtils.ts`: Storage upload utilities (`uploadPlanImage`, `uploadPlanCardImage`).

---

## 10. Known Issues

### 1. Host Exclusion Toggle Ignored by Database Trigger
* **What Code Does**: `useCreatePlanForm` maintains an `isHostSelected` boolean. When set to `false`, `PlansContext.tsx` omits the host record from the `participantRecords` array sent to `upsertParticipants`.
* **What Database Does**: The trigger `trg_auto_insert_plan_host_participant` fires AFTER INSERT on `plans`. It checks `auth.uid()` and unconditionally inserts a row into `plan_participants` with `role = 'HOST'` and `rsvp_status = 'JOINED'`, regardless of client payloads.
* **What is Unknown**: Whether the product design intends to allow non-participating hosts (e.g. creating a plan on behalf of others without attending), or if host membership is an immutable application invariant.

### 2. Title Character Length Mismatch
* **What Code Does**: `src/features/create/utils/validation.ts` only checks `title.trim().length > 0`.
* **What Database Does**: The check constraint `check_title_max_length` strictly enforces `char_length(title) <= 50`.
* **What is Unknown**: Whether the UI should enforce a 50-character `maxLength` attribute on title inputs, or if the database constraint should be expanded to allow longer titles.

### 3. Public ID Case-Sensitivity Bypass
* **What Code Does**: `CreateMVP.tsx` and `Create.tsx` generate plan identifiers formatted as `p_${Date.now()}` using a lowercase `"p_"`.
* **What Database Does**: The trigger function `generate_plan_public_id()` checks `NEW.public_id LIKE 'P_%'` using an uppercase `"P_"`. In PostgreSQL, `LIKE` is case-sensitive, so `p_<timestamp>` does not match the pattern. The trigger ignores it and preserves the raw timestamp string instead of generating a formatted sequence (`P000001`).
* **What is Unknown**: Whether plan public IDs were intended to follow the uniform sequential format (`P000001`) or if retaining client-generated timestamps is acceptable.

### 4. Plan Size Slider Minimum vs. Database Constraint
* **What Code Does**: `PlanSizeSlider.tsx` initializes with `min = 0` and can set `totalCapacity = 0`.
* **What Database Does**: The database check constraint `check_plan_size_bounds` enforces `(plan_size IS NULL) OR (plan_size >= 1)`. Submitting a plan with capacity 0 causes an immediate check constraint violation error.
* **What is Unknown**: Why `PlanSizeSlider` allows 0 when `PlanSizeBottomsheet` enforces `minCapacity = 2`.

### 5. Coexisting Legacy and MVP Screen Implementations
* **What Code Does**: `CreateMVP.tsx` is the actively mounted component in `MainApp.tsx`, but `Create.tsx` (`CreatePlanScreen`) remains in the repository with a divergent multi-step state machine (`sports_select`, `customizer`, discovery clone).
* **What Database Does**: Both components target the same `plans` and `plan_participants` tables.
* **What is Unknown**: Whether `Create.tsx` is slated for deprecation or if its discovery customizer features will be backported to `CreateMVP.tsx`.

---

## 11. Modification Notes

### Pre-Change Verification Checklist
1. **Verify Database Check Constraints**: Ensure any modifications to form inputs adhere to database constraints (`rsvp_deadline <= scheduled_at`, `char_length(title) <= 50`, `plan_size >= 1`).
2. **Preserve Image Storage Path Format**: Do not modify the storage upload path `<planId>/plancoverimage<N>.webp` in `imageUtils.ts` without updating the PostgreSQL function `is_plan_image_host`, or RLS will block image uploads.
3. **Draft Schema Compatibility**: If adding fields to `useCreatePlanForm`, update both `CreatePlanDraft` in `draftParticipantStorage.ts` and the migration/fallback logic to prevent stale client cache crashes.

### Post-Change Verification Steps
1. **End-to-End Plan Publishing**:
   - Create a plan with custom cover image, Assigned waitlist mode, and specific capacity.
   - Confirm row insertion in `public.plans`.
   - Confirm participant rows in `public.plan_participants` with correct `assigned_group` and `waitlist_position`.
   - Verify uploaded files exist in Supabase storage bucket `plan-images`.
2. **Draft Recovery Check**:
   - Populate form fields up to Review phase, reload the browser tab, and verify that all inputs, selected friends, and cropped images are restored without memory leaks.
3. **Wallet RPC Verification**:
   - Create a plan with `cost > 0` and confirm that `recalculate_wallet_expenses` generates a corresponding row in `wallet_expenses` with type `'PLAN_EXPENSE'`.
