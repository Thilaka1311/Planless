import { supabase } from "../../../../lib/supabaseClient";
import { normalizeFriendshipUsers } from "../utils/normalize";

export interface FriendshipWithProfiles {
  id: string;
  user_1_id: string;
  user_2_id: string;
  requested_by: string;
  created_from_plan_id: string | null;
  status: "PENDING" | "ACCEPTED";
  created_at: string;
  responded_at: string | null;
  user_1: { id: string; public_id: string; full_name: string; profile_photo_path: string; bio: string } | null;
  user_2: { id: string; public_id: string; full_name: string; profile_photo_path: string; bio: string } | null;
}

export async function getCurrentUserFriendships(activeUserUuid: string): Promise<FriendshipWithProfiles[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .or(`user_1_id.eq.${activeUserUuid},user_2_id.eq.${activeUserUuid}`);

  if (error) {
    throw new Error(`Failed to fetch friendships: ${error.message}`);
  }
  return (data || []) as FriendshipWithProfiles[];
}

export async function getCompleteCurrentUserFriends(activeUserUuid: string) {
  if (!activeUserUuid) return [];
  const rawFriendships = await getCurrentUserFriendships(activeUserUuid);
  
  const acceptedFriends: any[] = [];
  rawFriendships.forEach((row: any) => {
    if (row.status === "ACCEPTED") {
      const isUser1 = row.user_1_id === activeUserUuid;
      const rawFriend = isUser1 ? row.user_2 : row.user_1;
      if (rawFriend && rawFriend.id) {
        acceptedFriends.push({
          id: rawFriend.id,
          dbUuid: rawFriend.id,
          user_id: rawFriend.public_id,
          full_name: rawFriend.full_name,
          name: rawFriend.full_name,
          username: rawFriend.full_name ? rawFriend.full_name.toLowerCase().replace(/\s+/g, "") : "",
          profile_photo: rawFriend.profile_photo_path,
          avatar: rawFriend.profile_photo_path || "",
          bio: rawFriend.bio
        });
      }
    }
  });

  return acceptedFriends;
}

export async function sendFriendRequest(
  currentUserId: string,
  targetUserId: string,
  createdFromPlanId?: string | null
): Promise<FriendshipWithProfiles> {
  if (currentUserId === targetUserId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  const { user_1_id, user_2_id } = normalizeFriendshipUsers(currentUserId, targetUserId);

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
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .single();

  if (insertError) {
    throw new Error(`Failed to send friend request: ${insertError.message}`);
  }

  return inserted as FriendshipWithProfiles;
}

export async function acceptFriendRequest(friendshipId: string): Promise<FriendshipWithProfiles> {
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
    .select(`
      *,
      user_1:users!friendships_user_1_id_fkey(id, public_id, full_name, profile_photo_path, bio),
      user_2:users!friendships_user_2_id_fkey(id, public_id, full_name, profile_photo_path, bio)
    `)
    .single();

  if (updateError) {
    throw new Error(`Failed to accept friend request: ${updateError.message}`);
  }

  return updated as FriendshipWithProfiles;
}

export async function rejectFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (error) {
    throw new Error(`Failed to reject friend request: ${error.message}`);
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (error) {
    throw new Error(`Failed to remove friend: ${error.message}`);
  }
}
