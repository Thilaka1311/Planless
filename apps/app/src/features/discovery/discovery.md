# Feature Documentation: Discovery

## 1. Overview

The **Discovery** feature is Planless's curated experience and venue catalog. It provides a visual, inspiration-first gateway where users browse hand-picked activities—spanning sports turfs, cinema releases, dining hotspots, and recreational activities—to instantly bootstrap and schedule new social plans.

* **Core Function**: Presents categorized horizontally scrolling rails and dedicated drill-down showcases (`Sports`, `Movies`, `Dining`). Selecting any discovery experience pre-fills event metadata (title, category, venue location, suggested capacity, duration, and cover image) and launches directly into the Plan Creation wizard.
* **Product Role**: Integrated into the plan creation experience as an alternative to building custom blank plans, and accessible as a dedicated browsing section.
* **Scope & Boundaries**: Manages browsing, category filtering, search, and admin content curation (adding/editing experience cards). Does not manage live attendees, chat, or payments; once an item is selected, control transitions to the `Create` feature.

---

## 2. User Flow

### 1. Browsing Experiences (`Discovery.tsx`)
* User enters the Discovery screen (`BrowseExperiencesStep`).
* The app loads cached sections via `getCachedSections()` or queries `discovery_sections` and `discovery_items` from Supabase via `getSectionsByCategory('all')`.
* The screen displays:
  * Top header with search bar.
  * Category quick-filter tabs (`Sports`, `Movies`, `Dining`).
  * Horizontal carousel rails for active sections (e.g. "Trending Turfs", "Blockbuster Releases", "Top Weekend Dining").
* If database queries return empty or network fails, gracefully falls back to structured category defaults.

### 2. Searching Discovery Catalog
* User enters text into the search bar.
* Client filters active sections in real-time by matching against `title`, `description`, `category`, and `subcategory`.
* Sections with zero matching items are dynamically hidden.

### 3. Drilling into Dedicated Showcases
* Tapping a category card (e.g. "Sports") navigates to its dedicated sub-screen:
  * `<DiscoverSports />`: Filtered sports venues (turfs, badminton courts, clay tennis).
  * `<DiscoverMovies />`: Curated cinema premiers and theater listings.
  * `<DiscoverDining />`: Curated brunch spots, rooftop bistros, and cafes.
* Sub-screens provide specialized subcategory tabs (e.g. Football vs Cricket vs Badminton) and hero spotlight carousels.

### 4. Bootstrapping a Plan from an Item
* User taps on a `<DiscoveryCard />`.
* `onSelectDiscoveryItem(item)` triggers:
  * Extracts experience metadata: `title`, `category`, `subcategory`, `location`, `suggested_capacity`, `suggested_duration_minutes`, and `cover_image_url`.
  * Pre-hydrates draft plan state.
  * Advances directly to Step 2/3 of the Plan Creation wizard (`WhoIsComingScreen.tsx`).

### 5. Admin In-App Curation (Admin Only)
* If `isAdmin` is true in `ProfileContext`:
  * Admin long-presses (500ms threshold) any `<DiscoveryCard />` to open `<AdminContextSheet />`.
  * Can edit title, venue address, cover photo, display order, or trigger soft-deletion (`status = 'INACTIVE'`).
  * Can tap floating "Add Item" action button to open `<EditCard />` form drawer.

---

## 3. UI Documentation

### Main Discovery Screen (`Discovery.tsx`)
* **Container**: Dark full-height viewport (`bg-[#000000] text-white flex-1 flex flex-col h-full overflow-y-auto scrollbar-none font-sans select-none text-left`).
* **Header Bar**:
  * Pinned top navigation header (`HomeHeader`) with Planless logo and profile shortcut.
  * Search bar container (`px-5 pt-1 pb-3`) with rounded input (`h-11 bg-zinc-900/90 border border-white/[0.08] rounded-full px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/20`).
* **Category Navigation Pills**:
  * Horizontal pill strip (`flex items-center gap-2.5 px-5 py-2 overflow-x-auto scrollbar-none`).
  * Pills feature category icons (`Film`, `Compass`, `UtensilsCrossed`) with smooth scale and background transitions (`hover:bg-white/10 active:scale-95`).

### Discovery Experience Card (`DiscoveryCard.tsx`)
* **Card Dimensions**: Vertical card frame (`w-[230px] h-[310px] shrink-0 rounded-3xl relative overflow-hidden bg-zinc-950 border border-white/[0.04] shadow-2xl flex flex-col justify-end p-5 cursor-pointer hover:border-white/10 transition-all duration-300 group select-none`).
* **Imagery & Scrim**:
  * Full-bleed cover photo rendered via `<DiscoveryImages />` (`absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-[1.03] transition-transform duration-500`).
  * Vertical dark gradient overlay (`absolute inset-0 bg-gradient-to-t from-[#000000] via-[#000000]/50 to-transparent z-0`).
* **Content Metadata**:
  * Title: Bold white headline (`text-sm font-bold text-white leading-tight tracking-wide truncate`).
  * Location Footer: Pinned bottom bar (`pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[9px] font-mono text-zinc-500 font-bold tracking-wider`) with `<MapPin className="w-3 h-3 text-zinc-500 shrink-0" />` and address snippet.

### Sub-Category Showcase Screens (`DiscoverSports`, `DiscoverMovies`, `DiscoverDining`)
* **Header**: Top back chevron (`ChevronLeft`), title headline, and category sparkle badge (`<Sparkles className="w-4 h-4 text-amber-400" />`).
* **Hero Carousel**: Large interactive swipe card deck showcasing featured items with duration chips and capacity tags.
* **Vertical Experience Grid**: 2-column or list view showing all category items with distance and pricing indicators.

### Admin In-App Management Overlays (`AdminDiscovery.tsx` & `EditCard.tsx`)
* **Context Sheet**: Slide-up bottom sheet with actions: "Edit Experience", "Change Cover", "Toggle Active Status", "Delete Card".
* **Edit Drawer (`EditCard.tsx`)**: Full-screen modal form with text inputs, category dropdowns, address lookup, image uploader, and preview thumbnail.

---

## 4. Components

| Component | File Path | Responsibilities | Key Relationships |
|---|---|---|---|
| `BrowseExperiencesStep` | `src/features/discovery/screens/Discovery.tsx` | Main root discovery screen. Manages section caching, search query filtering, sub-screen navigation, and admin context triggers. | Mounted during create flow or discovery tab. |
| `DiscoverSports` | `src/features/discovery/screens/DiscoverSports.tsx` | Dedicated sports showcase screen featuring turf and court filtering, duration suggestions, and booking links. | Child sub-screen of `Discovery.tsx`. |
| `DiscoverMovies` | `src/features/discovery/screens/DiscoverMovies.tsx` | Dedicated cinema showcase screen filtering theater premiers and genre tags. | Child sub-screen of `Discovery.tsx`. |
| `DiscoverDining` | `src/features/discovery/screens/DiscoverDining.tsx` | Dedicated dining showcase screen filtering cafes, bistros, and brunch venues. | Child sub-screen of `Discovery.tsx`. |
| `DiscoveryCard` | `src/features/discovery/components/DiscoveryCard.tsx` | 230x310px vertical card component rendering cover photo, title, location snippet, and long-press admin listener. | Used across horizontal carousel rails. |
| `EditCard` | `src/features/discovery/components/EditCard.tsx` | Admin form modal for creating or editing discovery item records. | Triggered by admin actions. |
| `AdminDiscovery` | `src/features/discovery/screens/AdminDiscovery.tsx` | Admin context drawer and category config bindings. | Mounted when `isAdmin === true`. |
| `discoveryService` | `src/features/discovery/services/discoveryService.ts` | In-memory caching and public API abstraction for discovery section fetching and mutations. | Consumed by screens; calls `discoveryQueries.ts`. |
| `discoveryQueries` | `src/features/discovery/services/discoveryQueries.ts` | Direct Supabase REST queries executing SELECT, INSERT, UPDATE on discovery tables. | Calls `supabaseClient`. |
| `discoveryMapper` | `src/features/discovery/services/discoveryMapper.ts` | Bidirectional data transformer between Postgres database rows and TypeScript frontend models. | Used in `discoveryService.ts`. |

---

## 5. Data Flow

```text
[User Opens Discovery or Types Search]
                   │
                   ▼
       [BrowseExperiencesStep]
                   │
    ├── Check in-memory cache (getCachedSections)
    └── If miss or forceRefresh:
                   │
                   ▼
     [discoveryService.getSectionsByCategory]
                   │
                   ▼
     [discoveryQueries.fetchActiveSectionsWithItems]
                   │
                   ▼
     [Supabase REST: discovery_sections & discovery_items]
       ├── Filter: status = 'ACTIVE'
       ├── Order: display_order ASC
       └── Join: discovery_items ON section_id = discovery_sections.id
                   │
                   ▼
         [discoveryMapper.mapDbSectionToFrontend]
                   │
                   ▼
       [Render Discovery Rails & Cards]
                   │
[User Taps DiscoveryCard]
                   │
                   ▼
[onSelectDiscoveryItem(item)]
                   │
                   ▼
[Create Wizard Hydrated: Title, Category, Location, Image, Capacity]
```

---

## 6. Backend & Database

* **Target Supabase Environment**: Local instance at `http://127.0.0.1:54321` (DB: `127.0.0.1:54322`, ref: `wecmpncixopetvunkkyd`).

### 1. Table: `public.discovery_sections`
* **Role in Feature**: Groups discovery items into themed horizontal sections (e.g. "Popular Turfs", "Weekend Dining").
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`): Unique section identifier.
  * `title` (`text`, not null): Section header title.
  * `category` (`text`, not null): `'SPORTS'`, `'MOVIES'`, `'DINING'`, `'DRINKS'`, `'CUSTOM'`.
  * `display_order` (`integer`, default 0): Sort order for horizontal rails.
  * `status` (`text`, default `'ACTIVE'`): `'ACTIVE'` or `'INACTIVE'`.
  * `created_at` (`timestamptz`, default `now()`).
  * `updated_at` (`timestamptz`, default `now()`).

### 2. Table: `public.discovery_items`
* **Role in Feature**: Individual experience cards displayed within sections.
* **Columns**:
  * `id` (`uuid`, PK, default `gen_random_uuid()`): Unique item UUID.
  * `public_id` (`text`, nullable): Friendly alphanumeric identifier.
  * `section_id` (`uuid`, FK `discovery_sections.id`, not null): Parent section.
  * `title` (`text`, not null): Experience name (e.g. "Tiki Taka Arena").
  * `category` (`text`, not null): Primary category.
  * `subcategory` (`text`, nullable): Specific sub-genre (e.g. `'turfs'`, `'courts'`).
  * `description` (`text`, nullable): Summary of activity or venue.
  * `cover_image_url` (`text`, not null): Relative or absolute URL to cover asset.
  * `location` (`text`, nullable): Street address or neighborhood.
  * `suggested_duration_minutes` (`integer`, nullable): Default event duration (e.g. 90).
  * `suggested_cost_amount` (`numeric`, nullable): Estimated expense per group or ticket.
  * `suggested_capacity` (`integer`, nullable): Default recommended plan size.
  * `default_rsvp_offset_minutes` (`integer`, nullable): Default RSVP deadline buffer.
  * `display_order` (`integer`, default 0): Sorting within section rail.
  * `featured` (`boolean`, default `false`): Spotlight banner flag.
  * `status` (`text`, default `'ACTIVE'`): `'ACTIVE'` or `'INACTIVE'`.
  * `created_at` (`timestamptz`, default `now()`).
  * `updated_at` (`timestamptz`, default `now()`).

### 3. RLS Policies
* **`discovery_sections` & `discovery_items`**:
  * SELECT: Enabled for `anon` and `authenticated` roles (`USING (status = 'ACTIVE')`).
  * INSERT / UPDATE / DELETE: Restricted to admin users via custom JWT claims (`auth.jwt() ->> 'role' = 'admin'`).

---

## 7. States & Rules

### Catalog Invariants
* **Soft Deletion**: Deleting an item or section sets `status = 'INACTIVE'`; records are never purged via client APIs to preserve historical analytics.
* **Ordering Hierarchy**: Sections sort by `discovery_sections.display_order ASC`; child items within each section sort by `discovery_items.display_order ASC`.
* **Category Partitioning**: Category filters enforce strict uppercase normalization (`SPORTS`, `MOVIES`, `DINING`, `DRINKS`).
* **Wizard Pre-Hydration Rules**:
  * Tapping an item sets `plan.title = item.title`, `plan.category = item.category`, `plan.place_name = item.location`, and `plan.plan_size = item.suggested_capacity || 8`.
  * The user retains full ability to modify any of these values in subsequent creation steps before finalizing the plan.

---

## 8. Dependencies & Change Impact

### Upstream Dependencies
* **`ProfileContext` (`useProfileStore`)**: Provides `isAdmin` flag and auth token for unlocking curation controls.
* **`DiscoveryImages` (`src/IMGfromDB/PlanImages.tsx`)**: Resolves storage URLs or bundles default fallbacks for experience cover images.

### Downstream Impact of Changes
* **Create Wizard (`CreateMVP.tsx`, `CreatePlanReview.tsx`)**: Form pre-fill values originate directly from `DiscoveryItem` models. Altering field names in `discoveryMapper.ts` will break wizard initialization.
* **Storage Buckets**: Uploading cover photos via `discoveryAdminService` places files into Supabase Storage bucket `plan-covers`.

---

## 9. Important Files

* `src/features/discovery/screens/Discovery.tsx`: Main discovery overview and category hub.
* `src/features/discovery/components/DiscoveryCard.tsx`: Standard experience card component.
* `src/features/discovery/screens/DiscoverSports.tsx`: Sports-specific venue showcase.
* `src/features/discovery/screens/DiscoverMovies.tsx`: Cinema showcase screen.
* `src/features/discovery/screens/DiscoverDining.tsx`: Dining and cafe showcase screen.
* `src/features/discovery/services/discoveryService.ts`: Caching and API layer.
* `src/features/discovery/services/discoveryQueries.ts`: Supabase database queries.
* `src/features/discovery/services/discoveryMapper.ts`: Database row to frontend model transformer.
* `src/features/discovery/screens/AdminDiscovery.tsx`: In-app curation overlays and admin drawer.

---

## 10. Known Issues

### 1. Dual Hardcoded Mock Fallback vs Live Database
* **What Code Does**: If `discovery_sections` or `discovery_items` returns empty rows, `DiscoverSports.tsx` and `DiscoverDining.tsx` fall back to local static mock arrays (`defaultTurfs`, `defaultCourts`).
* **What Database Does**: Empty tables return `[]` without error.
* **What is Unknown**: Whether production instances should seed discovery tables during migration, removing client-side static mock objects.

### 2. Admin Role Claim Validation Client-Side Only
* **What Code Does**: `useLongPress` unlocks admin context sheets based on `userProfile.isAdmin` in client React state.
* **What Database Does**: Postgres RLS expects custom claims or table role checks; if RLS policies are missing on `discovery_items`, unauthorized authenticated updates could theoretically succeed.
* **What is Unknown**: The exact Postgres RLS definition applied to `discovery_items` on production Supabase instances.

---

## 11. Modification Notes

### Pre-Modification Checklist
1. **Preserve Mapper Field Contracts**: When adding fields to `discovery_items`, update `discoveryMapper.ts` and `DiscoveryItem` TypeScript interfaces simultaneously to prevent UI `undefined` crashes.
2. **Verify Storage Permissions**: Ensure image upload methods in `discoveryAdminService.ts` point to valid Supabase storage bucket policies for image writes.

### Post-Modification Verification Steps
1. **Catalog Load & Cache Verification**:
   - Open Discovery screen: verify sections load from cache without network latency on return visits.
   - Force refresh: verify latest active items appear in correct `display_order`.
2. **Item Selection & Wizard Pre-fill**:
   - Tap any card (e.g. "Tiki Taka Arena"): verify Create flow opens with pre-populated title, category, and venue location.
3. **Admin Edit Flow**:
   - Long-press card as admin: verify context sheet appears, edit title, save, and verify immediate UI update.
