import { describe, it, expect } from "vitest";

// Pure helper replicating the FriendshipsScreen alphabetical sorting logic
export function sortFriendsAlphabetically<T extends { friend?: { full_name?: string } | null }>(
  friends: T[]
): T[] {
  return [...friends].sort((a, b) => {
    const nameA = a.friend?.full_name || "";
    const nameB = b.friend?.full_name || "";
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}

// Pure helper replicating the FriendshipsScreen discoverable users filtering logic
export function getDiscoverableUsers<T extends { id: string; full_name?: string }>(
  allUsers: T[],
  activeUserUuid: string | null
): T[] {
  if (!activeUserUuid) return [];
  return allUsers
    .filter((u) => u.id !== activeUserUuid)
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" }));
}

// Pure helper replicating DiscoverFriends relationship-aware status detection
export type UserRelationshipState = "FRIEND" | "INCOMING" | "OUTGOING" | "NONE";

export function getUserRelationshipState({
  userId,
  userPublicId,
  friends,
  incomingRequests,
  outgoingRequests,
}: {
  userId: string;
  userPublicId?: string;
  friends: Array<{ friend?: { id?: string; user_id?: string; public_id?: string } | null }>;
  incomingRequests: Array<{ sender?: { id?: string; user_id?: string; public_id?: string } | null }>;
  outgoingRequests: Array<{ recipient?: { id?: string; user_id?: string; public_id?: string } | null }>;
}): UserRelationshipState {
  const isFriend = friends.some(
    (f) => f.friend?.id === userId || (userPublicId && (f.friend?.user_id === userPublicId || f.friend?.public_id === userPublicId))
  );
  if (isFriend) return "FRIEND";

  const isIncoming = incomingRequests.some(
    (r) => r.sender?.id === userId || (userPublicId && (r.sender?.user_id === userPublicId || r.sender?.public_id === userPublicId))
  );
  if (isIncoming) return "INCOMING";

  const isOutgoing = outgoingRequests.some(
    (r) => r.recipient?.id === userId || (userPublicId && (r.recipient?.user_id === userPublicId || r.recipient?.public_id === userPublicId))
  );
  if (isOutgoing) return "OUTGOING";

  return "NONE";
}

describe("FriendshipsScreen and DiscoverFriends UI logic", () => {
  describe("Alphabetical sorting of friends", () => {
    it("sorts friends alphabetically by display name (case-insensitive)", () => {
      const unsorted = [
        { friend: { full_name: "Zoe Adams" } },
        { friend: { full_name: "alice smith" } },
        { friend: { full_name: "Bob Jones" } },
        { friend: { full_name: "charlie Brown" } },
      ];

      const sorted = sortFriendsAlphabetically(unsorted);
      expect(sorted.map((s) => s.friend?.full_name)).toEqual([
        "alice smith",
        "Bob Jones",
        "charlie Brown",
        "Zoe Adams",
      ]);
    });
  });

  describe("Discoverable users computation", () => {
    it("shows EVERY user except the active user (does not exclude friends or incoming senders)", () => {
      const activeUserUuid = "user-me";
      const allUsers = [
        { id: "user-1", full_name: "Alice" },
        { id: "user-me", full_name: "Self" },
        { id: "user-2", full_name: "Bob (Friend)" },
        { id: "user-3", full_name: "Charlie (Incoming Request)" },
        { id: "user-4", full_name: "David (Unconnected)" },
      ];

      const discoverable = getDiscoverableUsers(allUsers, activeUserUuid);

      expect(discoverable.map((u) => u.id)).toEqual(["user-1", "user-2", "user-3", "user-4"]);
      expect(discoverable.some((u) => u.id === activeUserUuid)).toBe(false);
    });
  });

  describe("DiscoverFriends relationship-aware actions", () => {
    const friends = [{ friend: { id: "friend-1", full_name: "Friend One" } }];
    const incomingRequests = [{ sender: { id: "sender-1", full_name: "Sender One" } }];
    const outgoingRequests = [{ recipient: { id: "recipient-1", full_name: "Recipient One" } }];

    it("identifies friend as FRIEND indicator state", () => {
      const state = getUserRelationshipState({
        userId: "friend-1",
        friends,
        incomingRequests,
        outgoingRequests,
      });
      expect(state).toBe("FRIEND");
    });

    it("identifies incoming request sender as INCOMING (Respond action)", () => {
      const state = getUserRelationshipState({
        userId: "sender-1",
        friends,
        incomingRequests,
        outgoingRequests,
      });
      expect(state).toBe("INCOMING");
    });

    it("identifies outgoing request recipient as OUTGOING (Cancel action)", () => {
      const state = getUserRelationshipState({
        userId: "recipient-1",
        friends,
        incomingRequests,
        outgoingRequests,
      });
      expect(state).toBe("OUTGOING");
    });

    it("identifies unconnected user as NONE (Add Friend action)", () => {
      const state = getUserRelationshipState({
        userId: "stranger-1",
        friends,
        incomingRequests,
        outgoingRequests,
      });
      expect(state).toBe("NONE");
    });
  });

  describe("Friend Request Header Text Badge Formatting", () => {
    function formatFriendRequestBadge(count: number): string | null {
      if (count <= 0) return null;
      return `${count} ${count === 1 ? "friend request" : "friend requests"}`;
    }

    it("does not render when count is 0", () => {
      expect(formatFriendRequestBadge(0)).toBeNull();
    });

    it("formats 1 pending request as singular '1 friend request'", () => {
      expect(formatFriendRequestBadge(1)).toBe("1 friend request");
    });

    it("formats 2 pending requests as plural '2 friend requests'", () => {
      expect(formatFriendRequestBadge(2)).toBe("2 friend requests");
    });

    it("formats 3 pending requests as plural '3 friend requests'", () => {
      expect(formatFriendRequestBadge(3)).toBe("3 friend requests");
    });

    it("formats larger numbers correctly with plural 'friend requests'", () => {
      expect(formatFriendRequestBadge(12)).toBe("12 friend requests");
    });
  });
});

