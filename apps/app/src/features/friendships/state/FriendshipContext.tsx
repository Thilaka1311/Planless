import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import * as api from "../api/friendships";

interface FriendshipContextType {
  friends: any[];
  incomingRequests: any[];
  outgoingRequests: any[];
  friendCount: number;
  loading: boolean;
  sendFriendRequest: (targetUserId: string, createdFromPlanId?: string | null) => Promise<void>;
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  rejectFriendRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  refreshFriendships: () => Promise<void>;
}

const FriendshipContext = createContext<FriendshipContextType | undefined>(undefined);

export const FriendshipProvider = ({ children }: { children: ReactNode }) => {
  const { activeUserUuid } = useProfileStore();

  const [friends, setFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const friendCount = useMemo(() => friends.length, [friends]);

  const refreshFriendships = useCallback(async () => {
    if (!activeUserUuid) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      return;
    }

    setLoading(true);
    try {
      const data = await api.getCurrentUserFriendships(activeUserUuid);

      const friendsList: any[] = [];
      const incomingList: any[] = [];
      const outgoingList: any[] = [];

      data.forEach((row: any) => {
        const isUser1 = row.user_1_id === activeUserUuid;
        const rawFriend = isUser1 ? row.user_2 : row.user_1;
        const friendProfile = rawFriend ? {
          id: rawFriend.id,
          user_id: rawFriend.public_id,
          full_name: rawFriend.full_name,
          username: rawFriend.full_name.toLowerCase().replace(/\s+/g, ""),
          profile_photo: rawFriend.profile_photo_path,
          bio: rawFriend.bio
        } : null;

        if (row.status === "ACCEPTED") {
          friendsList.push({
            friendshipId: row.id,
            friend: friendProfile,
            created_at: row.created_at,
            responded_at: row.responded_at
          });
        } else if (row.status === "PENDING") {
          if (row.requested_by === activeUserUuid) {
            outgoingList.push({
              friendshipId: row.id,
              recipient: friendProfile,
              created_at: row.created_at
            });
          } else {
            incomingList.push({
              friendshipId: row.id,
              sender: friendProfile,
              created_at: row.created_at
            });
          }
        }
      });

      setFriends(friendsList);
      setIncomingRequests(incomingList);
      setOutgoingRequests(outgoingList);
    } catch (err) {
      console.error("[FriendshipContext] Failed to refresh friendships:", err);
    } finally {
      setLoading(false);
    }
  }, [activeUserUuid]);

  const sendFriendRequest = useCallback(async (targetUserId: string, createdFromPlanId?: string | null) => {
    if (!activeUserUuid) throw new Error("Authentication required.");
    await api.sendFriendRequest(activeUserUuid, targetUserId, createdFromPlanId);
    await refreshFriendships();
  }, [activeUserUuid, refreshFriendships]);

  const acceptFriendRequest = useCallback(async (friendshipId: string) => {
    const prevFriends = friends;
    const prevIncoming = incomingRequests;
    const req = incomingRequests.find(r => r.friendshipId === friendshipId);
    if (req) {
      setIncomingRequests(prev => prev.filter(r => r.friendshipId !== friendshipId));
      setFriends(prev => [...prev, { friendshipId, friend: req.sender, created_at: req.created_at, responded_at: new Date().toISOString() }]);
    }
    try {
      await api.acceptFriendRequest(friendshipId);
      await refreshFriendships();
    } catch (err) {
      console.error("[FriendshipContext] Failed to accept friend request:", err);
      setFriends(prevFriends);
      setIncomingRequests(prevIncoming);
      throw err;
    }
  }, [friends, incomingRequests, refreshFriendships]);

  const rejectFriendRequest = useCallback(async (friendshipId: string) => {
    const prevIncoming = incomingRequests;
    setIncomingRequests(prev => prev.filter(r => r.friendshipId !== friendshipId));
    try {
      await api.rejectFriendRequest(friendshipId);
      await refreshFriendships();
    } catch (err) {
      console.error("[FriendshipContext] Failed to reject friend request:", err);
      setIncomingRequests(prevIncoming);
      throw err;
    }
  }, [incomingRequests, refreshFriendships]);

  const removeFriend = useCallback(async (friendshipId: string) => {
    const prevFriends = friends;
    setFriends(prev => prev.filter(f => f.friendshipId !== friendshipId));
    try {
      await api.removeFriend(friendshipId);
      await refreshFriendships();
    } catch (err) {
      console.error("[FriendshipContext] Failed to remove friend:", err);
      setFriends(prevFriends);
      throw err;
    }
  }, [friends, refreshFriendships]);

  // Load initial data and subscribe to realtime updates
  useEffect(() => {
    if (!activeUserUuid) return;

    refreshFriendships();

    const channel = supabase
      .channel(`friendships-realtime-${activeUserUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships"
        },
        () => {
          refreshFriendships();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserUuid, refreshFriendships]);

  const value = useMemo(() => ({
    friends,
    incomingRequests,
    outgoingRequests,
    friendCount,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    refreshFriendships
  }), [
    friends,
    incomingRequests,
    outgoingRequests,
    friendCount,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    refreshFriendships
  ]);

  return (
    <FriendshipContext.Provider value={value}>
      {children}
    </FriendshipContext.Provider>
  );
};

export const useFriendshipStore = () => {
  const context = useContext(FriendshipContext);
  if (context === undefined) {
    throw new Error("useFriendshipStore must be used within a FriendshipProvider");
  }
  return context;
};
