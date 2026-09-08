import { supabase } from "../../../../lib/supabaseClient";
import { normalizeFriendshipUsers } from "../utils/normalize";

export interface Friendship {
  id: string;
  user_1_id: string;
  user_2_id: string;
  requested_by: string;
  created_from_plan_id: string | null;
  status: "PENDING" | "ACCEPTED";
  created_at: string;
  responded_at: string | null;
}

export type RelationshipStatus = "NO_RELATIONSHIP" | "PENDING_SENT" | "PENDING_RECEIVED" | "FRIENDS";

/**
 * Sends a friend request.
 * Enforces canonical ordering, checks for duplicate rows/pending requests, and self-requests.
 */
export async function sendFriendRequest(
  currentUserId: string,
  targetUserId: string,
  createdFromPlanId?: string | null
): Promise<Friendship> {
  if (currentUserId === targetUserId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  const { user_1_id, user_2_id } = normalizeFriendshipUsers(currentUserId, targetUserId);

  // Check for existing relationship
  const { data: existing, error: checkError } = await supabase
    .from("friendships")
    .select("*")
    .eq("user_1_id", user_1_id)
    .eq("user_2_id", user_2_id)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to check existing relationship: ${checkError.message}`);
  }

  if (existing) {
    if (existing.status === "ACCEPTED") {
      throw new Error("You are already friends with this user.");
    }
    if (existing.status === "PENDING") {
      if (existing.requested_by === currentUserId) {
        throw new Error("You have already sent a pending request to this user.");
      } else {
        throw new Error("You have an incoming pending friend request from this user.");
      }
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("friendships")
    .insert({
      user_1_id,
      user_2_id,
      requested_by: currentUserId,
      status: "PENDING",
      created_from_plan_id: createdFromPlanId || null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to send friend request: ${insertError.message}`);
  }

  return inserted as Friendship;
}

/**
 * Accepts a pending friend request.
 */
export async function acceptFriendRequest(friendshipId: string): Promise<Friendship> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user?.id) {
    throw new Error("Authentication required to accept a friend request.");
  }
  const currentUserId = session.user.id;

  const { data: existing, error: checkError } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", friendshipId)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to retrieve friendship: ${checkError.message}`);
  }
  if (!existing) {
    throw new Error("Friendship record not found.");
  }

  if (existing.status === "ACCEPTED") {
    throw new Error("This friendship request has already been accepted.");
  }

  if (existing.user_1_id !== currentUserId && existing.user_2_id !== currentUserId) {
    throw new Error("You are not authorized to accept this friend request.");
  }

  if (existing.requested_by === currentUserId) {
    throw new Error("You cannot accept a friend request that you sent.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("friendships")
    .update({
      status: "ACCEPTED",
      responded_at: new Date().toISOString()
    })
    .eq("id", friendshipId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to accept friend request: ${updateError.message}`);
  }

  return updated as Friendship;
}


/**
 * Rejects a pending friend request by deleting the row.
 */
export async function rejectFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (error) {
    throw new Error(`Failed to reject friend request: ${error.message}`);
  }
}

/**
 * Removes a friendship by deleting the row.
 */
export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (error) {
    throw new Error(`Failed to remove friend: ${error.message}`);
  }
}

/**
 * Retrieves all accepted friendships for a user, mapped to show the friend's profile.
 */
export async function getFriends(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .eq("status", "ACCEPTED")
    .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`);

  if (error) {
    throw new Error(`Failed to fetch friends: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    const isUser1 = row.user_1_id === userId;
    const rawFriend = isUser1 ? row.user_2 : row.user_1;
    const friendProfile = rawFriend ? {
      id: rawFriend.id,
      user_id: rawFriend.public_id,
      full_name: rawFriend.full_name,
      username: rawFriend.full_name.toLowerCase().replace(/\s+/g, ""),
      profile_photo: rawFriend.profile_photo_path,
      bio: rawFriend.bio
    } : null;

    return {
      friendshipId: row.id,
      friend: friendProfile,
      created_at: row.created_at,
      responded_at: row.responded_at
    };
  });
}

/**
 * Retrieves incoming pending requests where the current user is the recipient.
 */
export async function getIncomingFriendRequests(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .eq("status", "PENDING")
    .neq("requested_by", userId)
    .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`);

  if (error) {
    throw new Error(`Failed to fetch incoming requests: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    const isUser1 = row.user_1_id === userId;
    const rawSender = isUser1 ? row.user_2 : row.user_1;
    const senderProfile = rawSender ? {
      id: rawSender.id,
      user_id: rawSender.public_id,
      full_name: rawSender.full_name,
      username: rawSender.full_name.toLowerCase().replace(/\s+/g, ""),
      profile_photo: rawSender.profile_photo_path,
      bio: rawSender.bio
    } : null;

    return {
      friendshipId: row.id,
      sender: senderProfile,
      created_at: row.created_at
    };
  });
}

/**
 * Retrieves outgoing pending requests sent by the current user.
 */
export async function getOutgoingFriendRequests(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .eq("status", "PENDING")
    .eq("requested_by", userId);

  if (error) {
    throw new Error(`Failed to fetch outgoing requests: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    const isUser1 = row.user_1_id === userId;
    const rawRecipient = isUser1 ? row.user_2 : row.user_1;
    const recipientProfile = rawRecipient ? {
      id: rawRecipient.id,
      user_id: rawRecipient.public_id,
      full_name: rawRecipient.full_name,
      username: rawRecipient.full_name.toLowerCase().replace(/\s+/g, ""),
      profile_photo: rawRecipient.profile_photo_path,
      bio: rawRecipient.bio
    } : null;

    return {
      friendshipId: row.id,
      recipient: recipientProfile,
      created_at: row.created_at
    };
  });
}

/**
 * Determines relationship status between two users.
 */
export async function getRelationship(currentUserId: string, otherUserId: string): Promise<RelationshipStatus> {
  if (currentUserId === otherUserId) {
    return "NO_RELATIONSHIP";
  }

  const { user_1_id, user_2_id } = normalizeFriendshipUsers(currentUserId, otherUserId);

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("user_1_id", user_1_id)
    .eq("user_2_id", user_2_id)
    .maybeSingle();

  if (error || !data) {
    return "NO_RELATIONSHIP";
  }

  if (data.status === "ACCEPTED") {
    return "FRIENDS";
  }

  if (data.status === "PENDING") {
    return data.requested_by === currentUserId ? "PENDING_SENT" : "PENDING_RECEIVED";
  }

  return "NO_RELATIONSHIP";
}

/**
 * Synchronizes accepted friendships between a joining user and all existing active participants in a plan.
 */
export async function syncPlanFriendships(joiningUserUuid: string, planUuid: string): Promise<void> {
  try {
    const { data: participants, error: partError } = await supabase
      .from("plan_participants")
      .select("user_id, rsvp_status")
      .eq("plan_id", planUuid);

    if (partError || !participants) {
      console.error("[syncPlanFriendships] Failed to fetch plan participants:", partError);
      return;
    }

    const otherParticipantUuids = participants
      .filter(p => p.user_id && p.user_id !== joiningUserUuid)
      .map(p => p.user_id as string);

    if (otherParticipantUuids.length === 0) return;

    const { data: existingFriendships, error: friendsError } = await supabase
      .from("friendships")
      .select("user_1_id, user_2_id")
      .or(`user_1_id.eq.${joiningUserUuid},user_2_id.eq.${joiningUserUuid}`);

    if (friendsError) {
      console.error("[syncPlanFriendships] Failed to fetch existing friendships:", friendsError);
      return;
    }

    const existingSet = new Set<string>(
      (existingFriendships || []).map(f => `${f.user_1_id}_${f.user_2_id}`)
    );

    const friendshipsToInsert: {
      user_1_id: string;
      user_2_id: string;
      requested_by: string;
      status: "ACCEPTED";
      created_from_plan_id: string | null;
    }[] = [];

    for (const otherUuid of otherParticipantUuids) {
      const normalized = normalizeFriendshipUsers(joiningUserUuid, otherUuid);
      const key = `${normalized.user_1_id}_${normalized.user_2_id}`;
      if (!existingSet.has(key)) {
        friendshipsToInsert.push({
          user_1_id: normalized.user_1_id,
          user_2_id: normalized.user_2_id,
          requested_by: joiningUserUuid,
          status: "ACCEPTED",
          created_from_plan_id: planUuid
        });
        existingSet.add(key);
      }
    }

    if (friendshipsToInsert.length === 0) return;

    const { error: insertError } = await supabase
      .from("friendships")
      .insert(friendshipsToInsert);

    if (insertError) {
      console.error("[syncPlanFriendships] Error inserting plan friendships:", insertError);
    }
  } catch (err) {
    console.error("[syncPlanFriendships] Unexpected error:", err);
  }
}
