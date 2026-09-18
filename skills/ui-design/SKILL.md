---
name: ui-design
description: >-
  Design, inspect, and modify user interfaces for the Planless application.
  Use this skill whenever creating new screens, modifying existing UI components,
  styling features, adjusting layouts, or evaluating design consistency in Planless.
  Enforces established Planless design language, component reuse, mobile-first
  single-viewport conventions, and token consistency.
---

# Planless UI Design Skill

This skill defines how an AI agent must design, modify, and implement user interfaces in the Planless project. Planless has an established, highly intentional visual language and component ecosystem. UI work must build upon what already exists rather than introducing generic web patterns or arbitrary design systems.

---

## 1. Core Operating Principles

* **Real Life Over Screens**: Planless exists to turn intentions into real-world activities (*"Less planning. More doing."*). UI must prioritize rapid decision-making, clear commitments, and minimal cognitive friction. Avoid decorative bloat or endless scrolling mechanics.
* **Inspect Before Designing**: Never design or code UI from assumptions. Always inspect the existing feature implementation, shared components, and feature documentation before touching code.
* **Reuse Over Reinvention**: If a pattern, component, modal drawer, or input already exists, reuse or adapt it. Introducing a duplicate component or a competing styling abstraction is strictly prohibited.
* **Single-Viewport Mobile Constraint**: Planless is designed as a mobile-first application fitted to a strict viewport (`h-[100dvh] w-screen overflow-hidden`). UI flows must respect fixed headers, bottom nav bars, safe area insets, and internal scroll boundaries.
* **OLED Dark Surface Hierarchy**: Planless uses a warm, restrained dark aesthetic grounded in pure black (`#050505`), charcoal surfaces (`#121214`, `#1C1C1E`), white typography, and vibrant brand accents (`#ff5e3a`, `#ff8b66`). There is no light mode.

---

## 2. Investigation Workflow (Inspect First)

Before proposing, designing, or implementing any UI change, execute the following 4-step discovery process:

```text
1. Feature Documentation   → Inspect Projects/Planless/context/features/<feature>.md
2. Existing Feature Code   → Inspect apps/app/src/features/<feature>/
3. Shared Components       → Inspect apps/app/src/shared/components/ & apps/app/src/components/
4. Token & Styling Ground  → Inspect apps/app/src/index.css & theme variables
```

### Discovery Checklist
1. **Read Feature Context**: Check Section 3 (*UI Documentation*) and Section 4 (*Components*) of the corresponding file in `Projects/Planless/context/features/`.
2. **Identify Screen Shell & Navigation**: Determine whether the screen belongs to the main tab navigation (Home, Plans, Create, Chats, Profile) or is an immersive flow (e.g. Create wizard steps 2–5, Chat message view, Plan details modal) where the bottom navigation bar must be hidden.
3. **Identify Reusable Primitives**: Check if avatars (`UserAvatar`), plan covers (`DiscoveryImages`), search inputs (`SearchBar`), location pickers (`LocationAutocompleteInput`), or date selectors (`NativeDateTimeField`) are required.
4. **Determine Motion & States**: Identify how entry/exit transitions, empty states, loading indicators, and active gestures should behave.

---

## 3. Pattern Decision Framework

When considering a UI change, follow this decision sequence:

```text
Existing Pattern Exists
       ↓
Determine Why It Exists (UX purpose, interaction ergonomics, brand consistency)
       ↓
Does It Apply to the Current Problem?
  ├── YES → Reuse or adapt existing component/pattern
  └── NO  → Justify the deviation, ensure token alignment, and introduce cleanly
```

### When Is a New UI Pattern Justified?
A new pattern or component is justified **only** if:
1. The existing components cannot support the required interaction without degrading their current use cases.
2. The user experience directly benefits from a distinct physical metaphor (e.g., the radial gesture in `HoldToAcceptOverlay`).
3. The new component adheres strictly to the existing color tokens, typography scales, border radii, and motion springs.

---

## 4. Design System Tokens & Style Foundations

All styling uses Tailwind CSS v4 configured via `@theme` in `apps/app/src/index.css`. Never use raw arbitrary hex codes when established theme variables exist.

### 4.1 Color Palette & Surfaces

| Token / Value | Role | Usage in Planless |
|---|---|---|
| `#050505` | Canvas Background | Root application background (`App.tsx`, `MainApp.tsx`, tab containers). |
| `#0C0C0E` | Body Base | Global HTML body background fallback. |
| `#09090B` (95% blur) | Navigation Shell | Fixed bottom navigation footer background (`NavigationFooter.tsx`). |
| `#121214` (`--color-surface-dark`) | Sheet / Drawer Surface | Bottom sheet drawers, modals (`DepositCashModal.tsx`, `BottomSheets.tsx`). |
| `#18181B` | Input & Control Surface | Pill inputs, search bars (`SearchBar.tsx`), elevated action panels. |
| `#1C1C1E` (`--color-surface-card`) | Card Surface | Standard list cards, preview cards, secondary container backgrounds. |
| `#262629` (`--color-surface-hover`) | Elevated / Hover State | Hovered list items, active filter surfaces, pressed card states. |
| `border-white/[0.06]` to `0.12` | Hairline Borders | Subtle structural outlines across cards, dividers, and circular avatars. |
| `border-zinc-800` / `zinc-850` | Form & Sheet Outlines | Bottom sheet top borders, input outlines, modal dividers. |

### 4.2 Brand & Semantic Accents

| Token / Value | Role | Usage in Planless |
|---|---|---|
| `#ff5e3a` (`--color-brand-orange`) | Primary Brand CTA | Main action buttons, active toggles, submit actions, branded glow layers. |
| `#ff8b66` (`--color-brand-peach`) | Secondary Accent | Active tab text/icons, focused input underlines, brand highlights. |
| `#FF6B2C` | Tactile Action Ring | Radial progress SVG stroke in `HoldToAcceptOverlay`. |
| `#10B981` / `text-emerald-400` | Joined / Success | "Joined" tab pill in `PlansDivider`, active participant badges, WhatsApp chat bubble accents. |
| `#F59E0B` / `text-amber-400` | Waitlisted / Warning | "Waitlisted" tab pill, host action required exclamation mark (`!`), pending attendance reminders. |
| `#F43F5E` / `#EF4444` | Skipped / Destructive | "Skipped" tab pill, leave plan buttons, friend request badges, error toasts. |
| `bg-[#ff5e3a]/10 blur-[120px]` | Ambient Glow | Atmospheric background gradient blobs in auth, startup, and splash screens. |

### 4.3 Typography Scale

Planless loads fonts via Google Fonts and local OTF files in `index.css`:

| Font Family | CSS Variable / Class | Where Used |
|---|---|---|
| **Inter** | `var(--font-sans)` / `font-sans` | Primary typography for all UI, buttons, lists, descriptions, and body text. |
| **Grand Hotel** | `var(--font-grand-hotel)` / `font-grand-hotel` | Signature brand logo text (`HomeHeader.tsx`, Auth entry screens, welcome headers). Cursive, size `text-[28px] leading-none`. |
| **Space Grotesk** | `var(--font-display)` / `font-display` | Stylized display headings, category hero labels, section titles. |
| **JetBrains Mono** | `var(--font-mono)` / `font-mono` | Uppercase category chips, time stamps, numeric currency (`₹`), OTP inputs, capacity counts. |
| **Transcity Regular** | `var(--font-transcity)` / `font-transcity` | Editorial features, specialized discovery titles, branded showcase banners. |

#### Text Hierarchy Standards
* **Hero Screen Title**: `font-sans font-bold text-xl tracking-tight text-stone-100` (or `Grand Hotel` 28px for app title).
* **Card Title**: `font-sans font-semibold text-[14px] text-white tracking-wide truncate`.
* **Section Header**: `font-sans font-medium text-[12px] text-[#8E8E93] tracking-normal uppercase` with horizontal rule (`h-[0.5px] bg-[#1C1C1E]`).
* **Metadata & Timestamps**: `font-sans font-medium text-[11px] text-[#8E8E93]`.
* **Micro Label / Badge**: `font-mono font-bold text-[9px]` to `text-[10.5px] uppercase tracking-wider`.

---

## 5. Viewport, Shell & Layout Conventions

### 5.1 Single-Viewport Architecture
Planless screens do not scroll the entire browser window. The outer shell is locked:
```tsx
<div className="h-[100dvh] w-screen bg-[#050505] flex flex-col font-sans overflow-hidden">
  {/* Content Area */}
  <div className="flex-1 overflow-hidden relative">
    {/* Internal scrollable view */}
  </div>
</div>
```

### 5.2 Header Pattern (`HomeHeader.tsx`)
* Height: Fixed `h-14` (56px), `bg-[#050505]`, `px-6`, `z-30`.
* Left: App logo or screen title with graceful truncation.
* Right: Action utility cluster. Buttons use `w-9.5 h-9.5 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-95`. Active state glows amber: `text-amber-400 bg-amber-500/10 border border-amber-500/20`.

### 5.3 Footer Navigation (`NavigationFooter.tsx`)
* Height: Fixed `h-20` (80px), `border-t border-zinc-950/20 bg-[#09090b]/95 backdrop-blur-xl`.
* Safe Area: Must include `pb-[env(safe-area-inset-bottom,8px)]`.
* 5 Navigation Items:
  1. **Home**: `Home` icon, rose numeric badge (`bg-[#f43f5e] text-[8.5px] font-black w-4 h-4 rounded-full`).
  2. **Plans**: `Calendar` icon.
  3. **Create**: Center button with rounded square housing (`w-[34px] h-[34px] rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center`).
  4. **Chats**: `MessageSquare` icon.
  5. **Profile**: `UserAvatar` (`w-6 h-6 rounded-full`), red dot indicator for friend requests.
* Active item color: `#ff8b66` (`text-[#ff8b66]`); inactive: `text-zinc-500 hover:text-zinc-300`.

### 5.4 When to Hide Bottom Navigation
The bottom navigation bar must be hidden (`onToggleBottomNav(true)`) during:
* Multi-step wizard screens (e.g., Create flow phases: `who`, `who-actually`, `when`, `review`, `confirmation`).
* Full-screen detail modals (`DetailedPlanModal`, full plan preview).
* Active direct chat message room (`PlanChatScreen`).
* Sub-sheet full-screen drawers (e.g. `PastPlans`, `FriendshipsScreen`).

When returning to root tabs (Home, Plans list, Category select, Chats list, Profile root), restore the navigation footer (`onToggleBottomNav(false)`).

---

## 6. Shared Component Catalog & Reuse Rules

Always use these established components rather than recreating them:

### 6.1 Avatars (`apps/app/src/IMGfromDB/UserAvatar.tsx`)
* Handles image loading, fallback initials generation via `getInitialsAvatar`, and border styling.
* Standard sizes:
  * Bottom nav: `w-6 h-6`
  * Chat list / Plan row: `w-[44px] h-[44px]` or `w-[50px] h-[50px]`
  * Host metadata card: `w-10 h-10`
  * Profile screen hero: `w-[136px] h-[136px]` with circular border `border-2 border-white/10`.

### 6.2 Plan Cover Images (`apps/app/src/IMGfromDB/PlanImages.tsx`)
* Component: `<DiscoveryImages />`
* Resolves covers from Supabase storage buckets, category fallbacks, and local presets via `getPlanCover()`.
* Formats:
  * Home feed: Full bleed 9:16 vertical card with smooth dark gradient overlay at bottom (`bg-gradient-to-t from-black/90 via-black/40 to-transparent`).
  * Plans & Chats lists: `rounded-full overflow-hidden border border-white/[0.06] bg-zinc-950`.
  * Discovery: `w-[230px] h-[310px] rounded-2xl object-cover`.

### 6.3 Search Bar (`apps/app/src/shared/components/SearchBar.tsx`)
* Height: Fixed `46px`.
* Styling: `rounded-full bg-[#18181B] border border-white/[0.08] px-3.5 focus-within:border-white/20 focus-within:bg-[#202024]`.
* Internal: `Search` icon on left (`w-5 h-5 text-white/50`), clear `X` button on right when query is non-empty.

### 6.4 Location & Date Fields
* **Location Picker**: `<LocationAutocompleteInput />` in `shared/components/LocationAutocompleteInput.tsx` (Google Places autocomplete with dropdown).
* **Date & Time Picker**: `<NativeDateTimeField />` in `shared/components/NativeDateTimeField.tsx` (standardized date and time formatting via `formatPlanDate`).

### 6.5 Segmented Tab Controls (`PlansDivider.tsx` pattern)
* Container: `w-full bg-[#0A0A0C] border border-[#1A1A1A] rounded-[24px] p-0 overflow-hidden`.
* Pill Indicator: Animated via Motion's `layoutId="plans_divider_active_pill"`:
  ```tsx
  <motion.div
    layoutId="active_pill"
    className={`absolute inset-0 rounded-[22px] border shadow-md pointer-events-none z-0 ${tab.activeBg}`}
    transition={{ type: "spring", stiffness: 450, damping: 35 }}
  />
  ```

### 6.6 Bottom Sheets & Modal Drawers
* Standard Modal Backdrop: `absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in`.
* Bottom Sheet Container: `w-full bg-[#121214] border-t border-zinc-800 rounded-t-[2.5rem] p-6 pb-8 space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto`.
* Handle / Header: Top centered pull handle (`w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3`) or uppercase monospace section tag (`text-xs font-mono font-bold text-zinc-400 uppercase`).

### 6.7 Buttons & Interactive States
* **Primary Branded CTA**:
  ```html
  <button className="w-full py-3.5 px-6 rounded-xl bg-[#ff5e3a] hover:bg-[#e05230] text-white font-semibold text-sm transition-all shadow-lg shadow-[#ff5e3a]/25 active:scale-[0.98] disabled:opacity-50 cursor-pointer">
    Action Label
  </button>
  ```
* **Secondary / Muted Button**:
  ```html
  <button className="w-full py-3 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-sm transition-all border border-zinc-800 active:scale-[0.98] cursor-pointer">
    Secondary Label
  </button>
  ```
* **Destructive Button**:
  ```html
  <button className="w-full py-3.5 px-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold text-sm hover:bg-rose-500/20 active:scale-[0.98] cursor-pointer">
    Leave / Delete
  </button>
  ```

### 6.8 Empty States (`EmptyState.tsx`)
* Component: `<EmptyState icon={...} title={...} description={...} actionLabel={...} onAction={...} />`
* Icon: Contained in circular or soft-square background (`w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center`).
* Typography: Bold title (`text-white text-base font-semibold`), muted description (`text-zinc-400 text-xs mt-1 max-w-xs leading-relaxed`).

---

## 7. Motion, Gestures & Tactile Physics

Planless uses `motion/react` (Motion v12) for purposeful feedback, never for gratuitous decoration.

### 7.1 Spring Physics
For tabs, drawers, and modal transitions, use standard spring configurations:
```ts
transition={{ type: "spring", stiffness: 450, damping: 35 }}
```
For subtle fade/slide in place:
```ts
transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
```

### 7.2 Micro-Interactions & Tap States
* Every clickable element must provide immediate tactile feedback using `active:scale-[0.98]` (for cards and full-width buttons) or `active:scale-95` (for circular action buttons).
* Never leave buttons without clear hover and active styling.

### 7.3 Hold-to-Act Metaphor (`HoldToAcceptOverlay`)
* For high-commitment actions (e.g. accepting an RSVP on Home feed), Planless uses a press-and-hold radial progress indicator rather than a casual tap.
* Progress ring: SVG circle with `stroke-dashoffset` driven by hold percentage (0 to 100%). Color: `#FF6B2C`.
* Background overlay: Dynamically deepens opacity from `rgba(0, 0, 0, 0.55)` to `rgba(0, 0, 0, 0.92)` with `backdrop-blur-[2px]`.
* Hero title subtly scales from `0.96` to `1.04` as the hold approaches completion.

---

## 8. Screen-Level State Coverage

Every screen, tab, or sheet designed for Planless must explicitly account for all five essential UI states:

1. **Loading State**:
   - For full screens: Centered brand spinner with glowing background gradients (`bg-[#ff5e3a]/10 blur-[120px]`) and pulsing status text (`text-zinc-400 text-xs tracking-widest uppercase font-bold`).
   - For lists/cards: Skeleton placeholders with `bg-zinc-900/60 animate-pulse rounded-xl`.
2. **Empty State**:
   - Use `<EmptyState />` with contextual Lucide icon, clear title, explanatory copy, and relevant CTA (e.g., "Create a Plan").
3. **Populated State**:
   - Clean card lists with consistent vertical rhythm (`space-y-2.5` to `space-y-4`).
   - Text truncation (`truncate` or `line-clamp-2`) to prevent layout breakage from long user inputs.
4. **Error State**:
   - Contextual error card or banner with clear explanation, a retry trigger, and no technical stack dumps.
5. **Success / Confirmation State**:
   - Immediate visual feedback (e.g., checkmark animation, modal confirmation, or toast notification via `ToastContext`).

---

## 9. Pre-Implementation Verification Checklist

Before considering any UI design or modification complete, verify against this checklist:

- [ ] **Context Verified**: Did you read the relevant feature document in `Projects/Planless/context/features/`?
- [ ] **No Duplicate Components**: Did you search `shared/components/`, `components/`, and `IMGfromDB/` before creating a new component?
- [ ] **Viewport Integrity**: Does the screen fit within `100dvh` without unwanted horizontal or vertical window scrollbars?
- [ ] **Navigation Shell Compliant**: Is the bottom navigation bar correctly shown or hidden depending on flow depth?
- [ ] **Token Adherence**: Are colors drawn strictly from the Planless palette (`#050505`, `#121214`, `#1C1C1E`, `#ff5e3a`, `#ff8b66`)?
- [ ] **Typography Grounded**: Are fonts mapped properly (`Inter` for UI, `Grand Hotel` for brand header, `JetBrains Mono` for chips/counters)?
- [ ] **All 5 States Addressed**: Are loading, empty, populated, error, and success states explicitly handled?
- [ ] **Tactile Feedback**: Do buttons and cards include `active:scale-[0.98]` or `active:scale-95`?
- [ ] **Safe Area Protected**: Are bottom sheets and footers padded for mobile devices (`env(safe-area-inset-bottom)`)?
