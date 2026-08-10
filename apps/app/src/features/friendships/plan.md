# Feature: Refactor Friends Navigation & Screens

## Summary

Refactor the Friends section into a cleaner, multi-screen navigation flow. The current Friends page contains too much information on a single screen. The goal is to make it a lightweight overview screen and move full lists and search functionality into dedicated screens.

---

## User Story

As a user, I want the Friends section to be organized into dedicated screens so that I can quickly navigate to Friend Requests, Friends, and Discover People without the main screen feeling cluttered.

---

## Requirements

### 1. Main Friends Screen

Refactor the main Friends screen into a simple overview.

#### Remove

- Search bar

#### Keep

Three sections only:

- Friend Requests
- Friends
- Discover People

The main screen should act as a navigation hub instead of displaying complete lists.

---

### 2. Friend Requests

Tapping **Friend Requests** should navigate to a dedicated screen.

This screen should continue to contain:

- Incoming friend requests
- Outgoing (sent) friend requests

Existing functionality should remain unchanged.

---

### 3. Friends

The main Friends screen should display only a preview of the user's friends.

Requirements:

- Show a limited number of friends (preview only).
- Add a **See More** button.

Tapping **See More** should navigate to a dedicated **All Friends** screen.

The All Friends screen should include:

- Search bar
- Complete friends list
- Scrolling through all friends
- Existing friend actions and functionality

---

### 4. Discover People

The main Friends screen should display only a preview of discoverable users.

Requirements:

- Show a limited number of users.
- Add a **See More** button.

Tapping **See More** should navigate to a dedicated **Discover People** screen.

The Discover People screen should include:

- Search bar
- Complete discoverable users list
- Existing discover functionality
- Existing pagination/infinite scrolling (if already implemented)

---

## Navigation Flow

```
Friends

├── Friend Requests
│   └── Friend Requests Screen
│
├── Friends
│   ├── Preview
│   └── See More
│       └── All Friends Screen
│
└── Discover People
    ├── Preview
    └── See More
        └── Discover People Screen
```

---

## Design Goals

- Remove clutter from the main Friends screen.
- Keep the main screen lightweight and easy to scan.
- Move search functionality into dedicated screens where it is actually needed.
- Improve navigation and separation of concerns.
- Preserve all existing friend management functionality.

---

## Out of Scope

- No backend changes.
- No changes to the Friends data model.
- No changes to friend request functionality.
- No changes to friend discovery logic.
- No changes to search behavior beyond moving it to dedicated screens.

---

## Acceptance Criteria

- [ ] Main screen contains only Friend Requests, Friends, and Discover People sections.
- [ ] Friend Requests opens a dedicated screen.
- [ ] Friends section shows only a preview of friends.
- [ ] Friends section includes a **See More** button.
- [ ] **See More** opens a dedicated All Friends screen.
- [ ] All Friends screen includes a search bar and full friends list.
- [ ] Discover People section shows only a preview.
- [ ] Discover People includes a **See More** button.
- [ ] **See More** opens a dedicated Discover People screen.
- [ ] Discover People screen includes a search bar and full discover list.
- [ ] Existing functionality continues to work without regressions.