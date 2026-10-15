import { Plan, PlanMember } from "../../../core/types";
import { HostInfo } from "../components/HeroHeader";
import { normalizeStatus } from "../../../../lib/participantStatus";
import defaultAvatar from "../../../assets/default_avatar.webp";

export interface GetPlanHostsOptions {
  viewerUserId?: string | null;
  dbUsers?: any[];
  currentUserProfile?: any;
}

/**
 * Authoritatively retrieves and formats the list of hosts for a plan.
 *
 * Rules:
 * 1. An active host is a plan member where isHost === true or role === 'HOST'
 *    AND their join status is 'JOINED'.
 * 2. If no joined host members are found in plan.members (e.g. during initial hydration
 *    or when creator is not yet in members array), fallback to plan.hostId / plan.creatorId.
 * 3. Never display non-host participants as hosts.
 * 4. Deduplicate multiple entries representing the same host.
 * 5. Resolve host avatars using member avatar, dbUsers profile photo, or defaultAvatar.
 * 6. Display current user as "You" when applicable, and position "You" first.
 * 7. Sort remaining hosts alphabetically A-Z.
 */
export function getPlanHosts(
  plan: Plan | null | undefined,
  options?: GetPlanHostsOptions
): HostInfo[] {
  if (!plan) return [];

  const viewerId =
    options?.viewerUserId ||
    options?.currentUserProfile?.dbUuid ||
    options?.currentUserProfile?.id ||
    options?.currentUserProfile?.user_id ||
    null;

  const isCurrentViewer = (id: string | null | undefined): boolean => {
    if (!id || !viewerId) return false;
    if (id === viewerId) return true;
    if (
      options?.currentUserProfile &&
      (id === options.currentUserProfile.id ||
        id === options.currentUserProfile.user_id ||
        id === options.currentUserProfile.dbUuid)
    ) {
      return true;
    }
    return false;
  };

  const resolveAvatar = (
    userId: string | undefined,
    fallbackAvatar: string | undefined
  ): string => {
    if (userId && options?.currentUserProfile && isCurrentViewer(userId)) {
      if (options.currentUserProfile.avatar) {
        return options.currentUserProfile.avatar;
      }
    }

    if (userId && options?.dbUsers && options.dbUsers.length > 0) {
      const match = options.dbUsers.find(
        (u) => u.id === userId || u.user_id === userId
      );
      if (match) {
        const photo = match.profile_photo_path || match.profile_photo;
        if (photo && photo.trim()) return photo;
      }
    }

    if (fallbackAvatar && fallbackAvatar.trim()) {
      return fallbackAvatar;
    }

    return defaultAvatar;
  };

  const members: PlanMember[] = plan.members || [];

  // Filter for authoritatively assigned hosts who are active/joined
  const hostMembers = members.filter((m) => {
    const isHostRole = Boolean(m.isHost === true || (m as any).role === "HOST");
    const status = normalizeStatus(m.rsvp_status || m.joinState);
    return isHostRole && status === "JOINED";
  });

  const seenIds = new Set<string>();
  const collectedHosts: HostInfo[] = [];

  for (const m of hostMembers) {
    const id = m.userId || m.userUuid || (m as any).user_id || (m as any).id || "";
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);

    const isMe = isCurrentViewer(id);
    const name = isMe ? "You" : (m.name || m.displayName || (m as any).full_name || "Host");
    const avatar = resolveAvatar(id, m.avatar || m.profile_photo);

    collectedHosts.push({
      id,
      name,
      avatar,
      isCreator: id === plan.hostId || id === (plan as any).creatorId,
    });
  }

  // Fallback to creator if no joined host members found
  if (collectedHosts.length === 0) {
    const creatorId = plan.hostId || (plan as any).creatorId || "";
    const isMe = isCurrentViewer(creatorId);
    const name = isMe
      ? "You"
      : (plan.creatorName || (plan as any).creator_name || "Host");
    const avatar = resolveAvatar(
      creatorId,
      isMe ? options?.currentUserProfile?.avatar || plan.creatorAvatar : plan.creatorAvatar
    );

    return [
      {
        id: creatorId,
        name,
        avatar,
        isCreator: true,
      },
    ];
  }

  // Sorting: "You" first, then remaining hosts alphabetically A-Z
  const currentUserHost = collectedHosts.find((h) => h.name === "You" || isCurrentViewer(h.id));
  const remainingHosts = collectedHosts
    .filter((h) => h !== currentUserHost)
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      })
    );

  return [
    ...(currentUserHost ? [currentUserHost] : []),
    ...remainingHosts,
  ];
}
