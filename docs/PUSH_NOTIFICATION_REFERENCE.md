# Planless Push Notification Reference

This document is the definitive audit, architecture specification, and verification record for push notifications in Planless. It details which notifications are active, how WhatsApp-style conversation-level notifications are isolated, payload structures, disabled flows, and real-device verification results.

---

## 1. Active & Disabled Push Notifications

| Feature | Triggering Action | Notification Recipient | Example Notification Title | Example Notification Body | Profile / Plan Image | Tap Destination (`url`) | Current Status | Code Source & Traceability |
|---|---|---|---|---|---|---|---|---|
| **Plan Chat (Conversation-Level Notification)** | New message(s) arrive in a plan chat | Other non-skipped participants who have unread messages | `${planTitle} • 2 unread messages` (or `1 unread message`) | `Maanastej: Booked tickets!\nBhaavya: See you there!` (up to 8 chronological unreads) | Latest sender avatar or default avatar | Primary card: `/chats?id={planId}`<br>Action: `[ Open Chat ]` | **Implemented and Verified**<br>*(One independent notification card per plan chat with `tag = 'plan-chat-{planId}'`; messages from different plans never combine)* | [sw.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/sw.ts#L80-L240)<br>[server.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/backend/server.ts#L100-L260)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L330-L380) |
| **Plan Invitation (New or Existing Plan)** | Host or member invites friends to a plan | Selected invitees | `Maanastej • Sunday Football` | `Invited you to join` | Plan artwork / category image (fallback: `planimagedefault.webp`) | `/plans?id={planId}` | **Implemented and Verified**<br>*(Maintains separate card `plan-invite-{planId}`, never merged with chat messages; strictly excludes location/venue text)* | [PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1020-L1040)<br>[plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L225-L248)<br>[sw.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/sw.ts#L125-L169) |
| **Participant Joins Plan** | Participant joins plan / accepts invitation | Plan host(s) (excluding joining actor) | `Maanastej • Sunday Football` | `Joined your plan` | Joiner circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L417-L432)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1127-L1139)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L722-L735) |
| **Waitlist Join** | Participant joins waitlist | Plan host(s) (excluding waitlisting actor) | `Bhaavya • Sunday Football` | `Joined the waitlist` | Joiner circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L417-L432)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1127-L1139)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L736-L748) |
| **Waitlist Promotion** | Waitlisted participant moves to GOING / spot opens | Promoted participant | `You're in! • Sunday Football` | `A spot opened up and you're now attending.` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [usePlanParticipants.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/hooks/usePlanParticipants.ts#L1465-L1479)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L749-L755) |
| **Participant Leaves Plan / Declines Invite** | Participant leaves plan or declines pending invite | Plan host(s) (excluding leaving actor) | `Renjith • Sunday Football` | `Left the plan` or `Declined the invitation` | Leaver circular profile photo | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L140-L156)<br>[PlansContext.tsx](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/state/PlansContext.tsx#L1155-L1170)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L756-L768) |
| **Plan Cancelled** | Host cancels a plan | Active pre-cancellation participants (JOINED, WAITLISTED, INVITED, excluding cancelling actor) | `Cancelled • Sunday Football` | `Renjith cancelled this plan` (or `Someone cancelled this plan` if name missing) | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L353-L366)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L769-L775) |
| **Plan Rescheduled** | Host updates date, time, or venue | Confirmed joined participants (RSVP JOINED, excluding host) | `Updated • Sunday Football` | `Time changed to 6:30 PM` / `Date & time changed to...` / `Venue changed to...` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified**<br>*(Only fires on actual date/time/venue changes; title/image/capacity changes do not trigger)* | [usePlanLifecycle.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/hooks/usePlanLifecycle.ts#L390-L412)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L776-L782) |
| **Host Role Assigned** | Host promotes participant to co-host | Newly assigned co-host | `You're hosting • Sunday Football` | `You're hosting this plan with Renjith and Thilaka Sundar` (or `You're hosting this plan` if sole host) | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L269-L283)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L783-L789) |
| **Participant Removed** | Host removes participant from plan | Removed participant | `Sunday Football` | `You've been removed from this plan` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L387-L401)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L790-L796) |
| **Plan Completed** | Host completes plan attendance | Attending participants (`attendance: 'ATTENDED'`, excluding host) | `Plan Completed • Sunday Football` | `Thanks for joining! Hope you had a great time.` | Plan category artwork / thumbnail | `/plans?id={planId}` | **Implemented and Verified** | [plans.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/plans/api/plans.ts#L530-L549)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L797-L803) |
| **Friend Request Sent** | User sends a friend request | Target recipient | `New Friend Request` | `Thilak sent you a friend request` | Requester circular profile photo | `/profile` | **Implemented and Verified** | [friendshipService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/friendships/services/friendshipService.ts#L74-L87)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L804-L816) |
| **Friend Request Accepted** | User accepts a pending friend request | Original requester | `Friend Request Accepted` | `Maanastej accepted your request` | Accepter circular profile photo | `/profile` | **Implemented and Verified** | [friendshipService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/features/friendships/services/friendshipService.ts#L140-L153)<br>[send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L817-L829) |
| **Plan Chat — Shared Expense** | Participant records a shared expense (`message_type: 'cost'`) | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed in `send-push`; expense records preserved)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L550-L565) |
| **Plan Chat — Poll** | Participant creates a poll (`message_type: 'poll'`) | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed in `send-push`; poll records preserved)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L550-L565) |
| **Plan Reminder — 2 Hours** | Background check for plans starting in 2 hours | — | — | — | — | — | **Disabled**<br>*(Push trigger suppressed and background sync loop removed from `pwaService.ts`)* | [send-push/index.ts](file:///Users/thilak/Documents/OS/Projects/Planless/supabase/functions/send-push/index.ts#L365-L375)<br>[pwaService.ts](file:///Users/thilak/Documents/OS/Projects/Planless/apps/app/src/shared/pwa/pwaService.ts#L180-L210) |

---

## 2. Notification Grouping & State Architecture

### 2.1 Conversation-Level Notification Workflow
1. **Tag Isolation**:
   - Each plan chat uses its own stable, unique tag: `tag = 'plan-chat-' + planId`.
   - Messages from the same plan update that plan's existing notification in place.
   - Messages from different plans have different tags and are NEVER merged into a synthetic summary like `12 messages from 2 groups`.
   - Android's native notification shade handles app-level grouping automatically under the Planless origin while keeping each conversation as an independently identifiable card.
2. **Title & Body Presentation**:
   - **Title**: Clearly identified by plan name: `${planTitle} • 1 unread message` or `${planTitle} • ${unreadCount} unread messages`.
   - **Body**: Chronological unread messages from this plan only: `${senderName}: ${content}` (up to 8 lines).
   - **Icon**: Latest sender's circular profile photo (fallback to default avatar).
   - **Tap Destination**: `/chats?id={planId}` directly opens the specific plan chat.
3. **Independent Clearing & Read Positions**:
   - When the user opens and views a plan chat in `PlanChatScreen`, `markPlanChatAsRead(planUuid)` sends `CLEAR_CHAT_NOTIFICATION` with `planId`.
   - The Service Worker closes ONLY the notification matching `tag === 'plan-chat-' + planId`.
   - Notifications for any other plan chats currently in the shade remain active and untouched.
4. **Authoritative Total App Badge**:
   - The Service Worker queries all active notifications currently sitting in the Android notification shade using `self.registration.getNotifications()`.
   - It filters for active chat notifications (`n.tag.startsWith('plan-chat-')`) and calculates the sum of remaining unread messages across all conversations.
   - Calls `navigator.setAppBadge(totalUnreads)` or `clearAppBadge()` if 0.
5. **Stale / Delayed Push Protection**:
   - The Service Worker compares `payload.timestamp` with `existingNotif.data.receivedAt`. If a push arrives with an older timestamp than the currently visible card, it is ignored and does not overwrite with stale unread counts.
6. **Anti-Spam Rapid-Message Alert Cooldown**:
   - For rapid consecutive chat messages (< 8000ms after the last alert for that conversation), the notification updates in place silently (`renotify: false`, vibration suppressed).
   - Only when a message arrives after the 8-second cooldown or for a new conversation does the device alert the user (`renotify: true`, `vibrate: [100, 50, 100]`).
   - Prevents vibrating/ringing for every rapid message in active group conversations.

### 2.2 Navigation Architecture
No new routes were invented:
- `/chats`: Displays `ChatsScreen` with unread badges across all plans.
- `/chats?id={planId}`: Directly opens `PlanChatScreen` for that specific plan conversation.
- `/plans?id={planId}`: Directly opens `PlanDetailsScreen` for invitations and lifecycle events.

### 2.3 Android PWA Capabilities & Platform Boundaries
1. **Native Android vs. Web Push**:
   - Native Android apps in Kotlin/Java can invoke `NotificationCompat.MessagingStyle`, which provides native message bubbles, inline reply inputs, and Android 11+ conversation shortcut icons.
   - Web Push PWAs on Chromium / Android PWA do not expose `MessagingStyle` to JavaScript.
   - However, by using distinct conversation tags (`tag = 'plan-chat-' + planId`), Android's notification shade automatically groups the notifications together under the Planless heading while presenting each plan as an independent card with its own title, body, sender avatar, and 1-tap navigation to `/chats?id=${planId}`.
2. **Payload Size Guard**:
   - Web Push packets are limited by platform specifications (~4KB). FCM payloads are kept safely under 3KB by bounding preview lines to the 5 most recent unread messages while the title displays the full authoritative unread count. Legacy cross-chat `groups` dictionaries are completely removed.

---

## 3. Real-Device Verification Checklist

| Scenario | Tested Condition | Expected Result | Verified Status |
|---|---|---|---|
| **1. Conversation Tag Isolation** | Message sent in plan chat | Notification has `tag: plan-chat-{planId}` | **Verified** |
| **2. Multi-Plan Independence** | Pushes received from 2 distinct plans | Two independent cards in Android shade; no combined "messages from 2 groups" text | **Verified** |
| **3. Plan Title Identifiability** | Notification displayed in shade | Title matches `${planTitle} • ${count} unread messages` | **Verified** |
| **4. Direct Navigation** | Tapping notification card or `[ Open Chat ]` | Opens `/chats?id={planId}` directly | **Verified** |
| **5. Plan-Only Previews** | Notification expanded in shade | Contains unread messages from this plan only (up to 5 recent) | **Verified** |
| **6. Selective Read Clearing** | User opens Plan A | Plan A notification closes; Plan B notification stays visible | **Verified** |
| **7. Cross-Plan Badge Sum** | 2 plans with 2 and 3 unreads | App badge displays 5; drops to 3 when Plan A is read | **Verified** |
| **8. In-Place Updates** | Consecutive messages in same plan | Updates existing card with stable tag, no duplicate cards | **Verified** |
| **9. Stale Push Protection** | Delayed push arrives with older timestamp | Stale push ignored; newer unread state preserved | **Verified** |
| **10. Separate Invitations** | Invitation arrives alongside chat pushes | Separate `plan-invite-{planId}` card; never merged into chats | **Verified** |
| **11. Disabled Types** | Calls to `cost`, `poll`, and `check-reminders` | 0 push notifications dispatched; underlying data preserved | **Verified** |
| **12. Sender Self-Exclusion** | User sends message in their own plan chat | Sender excluded (`deliveredCount: 0` to sender) | **Verified** |
| **13. Anti-Spam Vibration Cooldown** | Rapid messages in same chat (<8s) | First message vibrates; subsequent rapid messages update silently in place (`renotify: false`) | **Verified** |
| **14. Multi-Chat Simultaneous Push** | `testType: "two-chats"` dispatch | Dispatches two distinct notifications (`plan-chat-plan1` & `plan-chat-plan2`); verified delivered to device | **Verified** |

