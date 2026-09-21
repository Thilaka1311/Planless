import { describe, it, expect } from "vitest";

export function shouldShowProfileAction({
  isSelfProfile,
  relationshipType,
  source,
}: {
  isSelfProfile: boolean;
  relationshipType: "NONE" | "ACCEPTED" | "PENDING_INCOMING" | "PENDING_OUTGOING";
  source?: string;
}): boolean {
  if (isSelfProfile) return false;
  if (relationshipType === "ACCEPTED") {
    return source === "friends";
  }
  return true;
}

describe("FriendProfileViewerBottomSheet context-specific actions", () => {
  it("shows no action on own profile regardless of context", () => {
    expect(shouldShowProfileAction({ isSelfProfile: true, relationshipType: "NONE", source: "friends" })).toBe(false);
    expect(shouldShowProfileAction({ isSelfProfile: true, relationshipType: "ACCEPTED", source: "friends" })).toBe(false);
    expect(shouldShowProfileAction({ isSelfProfile: true, relationshipType: "ACCEPTED", source: "plan" })).toBe(false);
  });

  it("shows Add Friend everywhere when not friends", () => {
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "NONE", source: "friends" })).toBe(true);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "NONE", source: "plan" })).toBe(true);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "NONE", source: "preview" })).toBe(true);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "NONE" })).toBe(true);
  });

  it("shows Accept & Decline everywhere when friend request received", () => {
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "PENDING_INCOMING", source: "friends" })).toBe(true);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "PENDING_INCOMING", source: "plan" })).toBe(true);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "PENDING_INCOMING", source: "preview" })).toBe(true);
  });

  it("shows Remove Friend ONLY when opened from the Friends screen", () => {
    // Friends screen -> shows Remove Friend
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED", source: "friends" })).toBe(true);

    // Plan screen -> do not show Remove Friend
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED", source: "plan" })).toBe(false);

    // Plan preview screen -> do not show Remove Friend
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED", source: "preview" })).toBe(false);

    // Any other screen / default -> do not show Remove Friend
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED", source: "discover" })).toBe(false);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED", source: "requests" })).toBe(false);
    expect(shouldShowProfileAction({ isSelfProfile: false, relationshipType: "ACCEPTED" })).toBe(false);
  });
});
