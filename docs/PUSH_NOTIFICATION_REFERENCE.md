# Planless Push Notification Reference

This document is the definitive audit, architecture specification, and verification record for push notifications in Planless. It details which notifications are active, how WhatsApp-style multi-group chat notifications are aggregated, payload structures, disabled flows, and real-device verification results.

---

## 1. Active & Disabled Push Notifications

| Feature | Triggering Action | Notification Recipient | Example Notification Title | Example Notification Body | Profile / Plan Image | Tap Destination (`url`) | Current Status | Code Source & Traceability |
|---|---|---|---|---|---|---|---|---|
| **Multi-Group Chat Summary** | New messages arrive from 2 or more different plan chats | Other non-skipped participants in those plans | `4 messages from 2 groups` | `Mandaadi:\n  Maanastej: Booked tickets!\n  Bhaavya: See you there!\n\nSmash Guys:\n  Renjith: Court 3 is booked\n  Chris: I'll bring shuttles` | Latest sender avatar or default avatar | Primary card: `/chats`<br>Quick actions: `[ Open Mandaadi ]`, `[ Open Smash Guys ]` | **Implemented and Verified** | [sw.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/sw.ts#L129-L308)<br>[server.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/backend/server.ts#L290-L450)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L235-L330) |
| **Plan Chat (Single Group, >4 Messages)** | Multiple messages arrive in the same plan chat (no 4-message cap) | Other non-skipped plan participants | `Mandaadi • 6 messages` | `Maanastej: Are you coming?\nBhaavya: Booked tickets!\nRenjith: See you at 6\nMaanastej: Got popcorn vouchers\nBhaavya: Screen 2\nRenjith: 5 mins away` | Latest sender avatar | `/chats?id={planId}` | **Implemented and Verified** | [sw.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/sw.ts#L244-L264)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L256-L325) |
| **Plan Chat (Single Message)** | A participant sends a single message in a plan chat | Other non-skipped plan participants | `Maanastej • Mandaadi` | `Movie starts in 15 mins! See you there` | Sender circular profile photo | `/chats?id={planId}` | **Implemented and Verified** | [PlanChatScreen.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/chats/screens/PlanChatScreen.tsx#L581-L597)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L540-L630) |
| **Plan Invitation (New or Existing Plan)** | Host or member invites friends to a plan | Selected invitees | `Maanastej • Sunday Football` | `Invited you to join • Turf Club` | Inviter profile photo or plan artwork | `/plans?id={planId}` | **Implemented and Verified**<br>*(Maintains separate card `plan-invite-{planId}`, never merged with chat messages)* | [PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1020-L1040)<br>[plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L225-L248)<br>[sw.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/sw.ts#L83-L124) |
| **Participant Joins Plan** | Participant joins plan / accepts invitation | Plan host(s) (excluding joining actor) | `Maanastej • Sunday Football` | `Joined your plan` | Joiner circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L417-L432)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1127-L1139)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L722-L735) |
| **Waitlist Join** | Participant joins waitlist | Plan host(s) (excluding waitlisting actor) | `Bhaavya • Sunday Football` | `Joined the waitlist` | Joiner circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L417-L432)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1127-L1139)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L736-L748) |
| **Waitlist Promotion** | Waitlisted participant moves to GOING / spot opens | Promoted participant | `You're in! • Sunday Football` | `A spot opened up and you're now attending.` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [usePlanParticipants.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/hooks/usePlanParticipants.ts#L1465-L1479)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L749-L755) |
| **Participant Leaves Plan / Declines Invite** | Participant leaves plan or declines pending invite | Plan host(s) (excluding leaving actor) | `Renjith • Sunday Football` | `Left the plan` or `Declined the invitation` | Leaver circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L140-L156)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1155-L1170)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L756-L768) |
| **Plan Cancelled** | Host cancels a plan | Active pre-cancellation participants (JOINED, WAITLISTED, INVITED, excluding host) | `Cancelled • Sunday Football` | `The host cancelled this plan` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L353-L366)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L769-L775) |
| **Plan Rescheduled** | Host updates date, time, or venue | Confirmed joined participants (RSVP JOINED, excluding host) | `Updated • Sunday Football` | `Time changed to 6:30 PM` / `Date & time changed to...` / `Venue changed to...` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified**<br>*(Only fires on actual date/time/venue changes; title/image/capacity changes do not trigger)* | [usePlanLifecycle.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/hooks/usePlanLifecycle.ts#L390-L412)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L776-L782) |
| **Host Role Assigned** | Host promotes participant to co-host | Newly assigned co-host | `Host Role • Sunday Football` | `You've been made a co-host` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L269-L283)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L783-L789) |
| **Participant Removed** | Host removes participant from plan | Removed participant | `Sunday Football` | `You've been removed from this plan` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L387-L401)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L790-L796) |
| **Plan Completed** | Host completes plan attendance | Attending participants (`attendance: 'ATTENDED'`, excluding host) | `Plan Completed • Sunday Football` | `Thanks for joining! Hope you had a great time.` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L530-L549)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L797-L803) |
| **Friend Request Sent** | User sends a friend request | Target recipient | `New Friend Request` | `Thilak sent you a friend request` | Requester circular profile photo | `/profile` | **Implemented and Verified** | [friendshipService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/friendships/services/friendshipService.ts#L74-L87)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L804-L816) |
| **Friend Request Accepted** | User accepts a pending friend request | Original requester | `Friend Request Accepted` | `Maanastej accepted your request` | Accepter circular profile photo | `/profile` | **Implemented and Verified** | [friendshipService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/friendships/services/friendshipService.ts#L140-L153)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L817-L829) |
| **Plan Chat — Shared Expense** | Participant records a shared expense (`message_type: 'cost'`) | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed in `send-push`; expense records preserved)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L550-L565) |
| **Plan Chat — Poll** | Participant creates a poll (`message_type: 'poll'`) | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed in `send-push`; poll records preserved)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L550-L565) |
| **Plan Reminder — 2 Hours** | Background check for plans starting in 2 hours | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed and background sync loop removed from `pwaService.ts`)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L365-L375)<br>[pwaService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/shared/pwa/pwaService.ts#L180-L210) |

---

## 2. Notification Grouping & State Architecture

### 2.1 Multi-Group Aggregation Workflow
1. **Tag Isolation**:
   - All chat messages use the unified tag: `tag = 'plan-chats'`.
   - Plan invitations use: `tag = 'plan-invite-' + planId` with `notificationType = 'PLAN_INVITATION'`. Because tags and notification types differ, invitations **never** merge into chat message summaries.
2. **State Retention Across Background Pushes**:
   - When a push arrives, the Service Worker inspects currently active notifications in the Android notification shade using `self.registration.getNotifications()`.
   - If an active `plan-chats` notification is present, its conversation dictionary (`existingChatNotif.data.groups`) is merged with incoming messages.
   - Message IDs are deduplicated using a `Set` to prevent duplicate counting when rapid pushes arrive.
3. **Primary Summary Notification ("X messages from Y groups")**:
   - If `distinctGroupsCount > 1`:
     - **Title**: `${totalMessages} messages from ${groupCount} groups` (e.g., `4 messages from 2 groups`).
     - **Body**: Each group displayed under its plan title, with sender names and message previews.
     - **Primary Card Click Destination**: Navigates to `/chats` (the unread chats inbox).
     - **Android Quick Actions**: Attaches quick action buttons (e.g., `[ Open Mandaadi ]` and `[ Open Smash Guys ]`). Tapping an action button opens `/chats?id={planId}` directly.
4. **Single Group Notification (No 4-Message Cap)**:
   - If `distinctGroupsCount === 1`:
     - **Title**: `${planTitle} • ${messageCount} messages` (or `${senderName} • ${planTitle}` for 1 message).
     - **Body**: Chronological conversation history formatted as `Sender: Content`.
     - **Cap Removal**: Displays all recent messages up to the platform payload limit (15 messages), completely eliminating the previous 4-message restriction.
     - **Click Destination**: Navigates directly to `/chats?id={planId}`.

### 2.2 Navigation Architecture
No new routes were invented. Planless routes were utilized directly:
- `/chats`: Displays `ChatsScreen` with unread badges across all plans.
- `/chats?id={planId}`: Directly opens `PlanChatScreen` for that specific plan.
- `/plans?id={planId}`: Directly opens `PlanDetailsScreen` for invitations.

### 2.3 Android PWA Capabilities & Platform Boundaries
1. **Native Android vs. Web Push**:
   - Native Kotlin Android apps can render individual conversation rows via `NotificationCompat.MessagingStyle`.
   - Web Push PWAs on Chrome for Android do not expose `MessagingStyle` directly to JavaScript; however, multi-line structured text, persistent active notification inspection (`getNotifications`), and Android Quick Action buttons (`actions: [{ action, title }]`) deliver a clean grouped notification experience that allows expanding groups and opening individual plan chats with one tap.
2. **Payload Size Guard**:
   - Web Push packets are limited by platform specifications (~4KB). Bounding recent in-flight history to 15 messages prevents payload overflow while ensuring all conversation context is visible.

---

## 3. Real-Device Verification Checklist

| Scenario | Tested Condition | Expected Result | Verified Status |
|---|---|---|---|
| **1. Multi-Group Summary** | 4 messages across 2 plan chats | Primary title: `4 messages from 2 groups` | **Verified** |
| **2. Expanded Grouping** | Notification expanded in Android shade | Both groups shown distinctly under plan headings | **Verified** |
| **3. Group Direct Navigation** | Tapping quick action `[ Open Plan ]` | Directly opens `/chats?id={planId}` | **Verified** |
| **4. Primary Summary Navigation** | Tapping primary notification body | Directly opens `/chats` (all groups inbox) | **Verified** |
| **5. No 4-Message Cap** | 6 messages in 1 plan chat | All 6 messages displayed without truncation | **Verified** |
| **6. Rapid Message Arrive** | Pushes received in quick succession | Deduplicated message IDs, correct totals | **Verified** |
| **7. Separate Invitations** | Invitation arrives alongside chat pushes | Separate `plan-invite-*` card; not in chat count | **Verified** |
| **8. Multiple Invitations** | Multiple invitations arrive | Grouped under invitation category, never in chat count | **Verified** |
| **9. Disabled Types** | Calls to `cost`, `poll`, and `check-reminders` | 0 push notifications dispatched; underlying data preserved | **Verified** |
| **10. Sender Self-Exclusion** | User sends message in their own plan chat | Sender excluded (`deliveredCount: 0` to sender) | **Verified** |
| **11. Participant Joins Plan** | Non-host user joins plan / accepts invite | Host receives `${joiner} • ${plan} — Joined your plan` with joiner avatar | **Verified** |
| **12. Waitlist Join** | User joins waitlist | Host receives `${joiner} • ${plan} — Joined the waitlist` with joiner avatar | **Verified** |
| **13. Waitlist Promotion** | Waitlisted user moved to GOING | User receives `You're in! • ${plan} — A spot opened up` | **Verified** |
| **14. Participant Leaves Plan** | Joined user leaves or declines invite | Host receives `${leaver} • ${plan} — Left the plan` (or `Declined...`) | **Verified** |
| **15. Plan Cancelled** | Host cancels plan | Pre-cancellation participants receive `Cancelled • ${plan}` | **Verified** |
| **16. Plan Rescheduled** | Host changes date/time/venue | Confirmed participants receive `Updated • ${plan} — Time changed to...` | **Verified** |
| **17. Host Role Assigned** | Host promotes participant to co-host | New co-host receives `Host Role • ${plan} — You've been made a co-host` | **Verified** |
| **18. Participant Removed** | Host removes participant from plan | Removed user receives `${plan} — You've been removed from this plan` | **Verified** |
| **19. Plan Completed** | Host completes plan attendance | Attending participants receive `Plan Completed • ${plan} — Thanks for joining!` | **Verified** |
| **20. Friend Request Sent** | User sends friend request | Target recipient receives `New Friend Request — ${requester} sent you a friend request` | **Verified** |
| **21. Friend Request Accepted** | User accepts pending friend request | Original requester receives `Friend Request Accepted — ${accepter} accepted...` | **Verified** |
