import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserMinus, UserPlus, UserCheck, Users, X } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useToast } from "../../../shared/contexts/ToastContext";

interface FriendProfileViewerBottomSheetProps {
  friendUserId: string | null;
  onClose: () => void;
}

interface FriendProfileData {
  id: string;
  public_id?: string;
  full_name: string;
  profile_photo_path?: string;
  bio?: string;
  friends?: number;
}

export const FriendProfileViewerBottomSheet: React.FC<FriendProfileViewerBottomSheetProps> = ({
  friendUserId,
  onClose,
}) => {
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
  } = useFriendshipStore();
  const { showToast } = useToast();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FriendProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    async function fetchAuthUser() {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.id) {
          setCurrentUserId(sessionData.session.user.id);
        }
      } catch (err) {
        console.error("Error fetching current authenticated user:", err);
      }
    }
    fetchAuthUser();
  }, []);

  const isSelfProfile = useMemo(() => {
    if (!currentUserId || !friendUserId) return false;
    return String(currentUserId).trim().toLowerCase() === String(friendUserId).trim().toLowerCase();
  }, [currentUserId, friendUserId]);

  // Derive relationship status dynamically from the central Friendship store
  const relationship = useMemo(() => {
    if (!friendUserId) return { type: "NONE" as const, friendshipId: null };

    const friendRecord = friends.find((f) => f.friend?.id === friendUserId);
    if (friendRecord) {
      return { type: "ACCEPTED" as const, friendshipId: friendRecord.friendshipId };
    }

    const outgoingRecord = outgoingRequests.find((r) => r.recipient?.id === friendUserId);
    if (outgoingRecord) {
      return { type: "PENDING_OUTGOING" as const, friendshipId: outgoingRecord.friendshipId };
    }

    const incomingRecord = incomingRequests.find((r) => r.sender?.id === friendUserId);
    if (incomingRecord) {
      return { type: "PENDING_INCOMING" as const, friendshipId: incomingRecord.friendshipId };
    }

    return { type: "NONE" as const, friendshipId: null };
  }, [friendUserId, friends, incomingRequests, outgoingRequests]);

  useEffect(() => {
    if (!friendUserId) {
      setProfile(null);
      return;
    }

    async function fetchFriendProfile() {
      setLoadingProfile(true);
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, public_id, full_name, profile_photo_path, bio, friends")
          .eq("id", friendUserId)
          .single();

        if (error) {
          console.error("Error fetching friend profile:", error.message);
          showToast("Failed to load friend profile.");
        } else if (data) {
          setProfile(data as unknown as FriendProfileData);
        }
      } catch (err: any) {
        console.error("Failed to fetch friend profile:", err);
      } finally {
        setLoadingProfile(false);
      }
    }

    fetchFriendProfile();
  }, [friendUserId]);

  const handleAction = async () => {
    if (!friendUserId || actionLoading) return;
    setActionLoading(true);

    try {
      if (relationship.type === "ACCEPTED" && relationship.friendshipId) {
        await removeFriend(relationship.friendshipId);
        showToast(`Removed ${profile?.full_name || "friend"} from your friends.`);
      } else if (relationship.type === "PENDING_OUTGOING" && relationship.friendshipId) {
        await rejectFriendRequest(relationship.friendshipId);
        showToast(`Cancelled friend request to ${profile?.full_name || "User"}.`);
      } else if (relationship.type === "PENDING_INCOMING" && relationship.friendshipId) {
        await acceptFriendRequest(relationship.friendshipId);
        showToast(`Accepted ${profile?.full_name || "User"}'s friend request!`);
      } else if (relationship.type === "NONE") {
        await sendFriendRequest(friendUserId);
        showToast(`Sent friend request to ${profile?.full_name || "User"}!`);
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectIncoming = async () => {
    if (!friendUserId || actionLoading || relationship.type !== "PENDING_INCOMING" || !relationship.friendshipId) return;
    setActionLoading(true);
    try {
      await rejectFriendRequest(relationship.friendshipId);
      showToast(`Declined ${profile?.full_name || "User"}'s friend request.`);
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to decline request.");
    } finally {
      setActionLoading(false);
    }
  };

  const isOpen = Boolean(friendUserId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-[80] pointer-events-auto"
          />

          {/* Bottom Sheet Container */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[85] pointer-events-auto select-none"
            style={{
              background: "#1C1C1E",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: "16px 20px 32px",
              boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.3)",
              paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {/* Drag Handle (No X / Close Button) */}
            <div className="flex justify-center mb-5">
              <div
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 2.5,
                  background: "rgba(255, 255, 255, 0.15)",
                }}
              />
            </div>

            {loadingProfile ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#FF6B2C] border-t-transparent animate-spin" />
                <p className="text-zinc-500 font-sans font-medium text-xs">Loading profile...</p>
              </div>
            ) : profile ? (
              <div className="flex flex-col items-center text-center">
                {/* 1. Large Circular Avatar */}
                <div className="mb-3.5">
                  <UserAvatar
                    src={profile.profile_photo_path || ""}
                    alt={profile.full_name}
                    className="w-35 h-35 rounded-full border border-white/10 object-cover shadow-xl"
                  />
                </div>

                {/* 2. Full Name */}
                <h2 className="font-sans font-bold text-lg text-white tracking-tight">
                  {profile.full_name}
                </h2>

                {/* 3. Bio */}
                <p className="font-sans font-medium text-xs text-zinc-400 mt-1 max-w-[280px] leading-relaxed">
                  {profile.bio && profile.bio.trim()
                    ? profile.bio
                    : "Always spontaneous, never planless."}
                </p>

                {/* 4. Friends Count (Clean Stacked Typography) */}
                <div className="mt-4 flex flex-col items-center justify-center">
                  <span className="font-sans font-bold text-base text-white leading-none">
                    {profile.friends ?? 0}
                  </span>
                  <span className="font-sans font-medium text-[12px] text-white/40 mt-1">
                    Friends
                  </span>
                </div>

                {/* 5. Dynamic Relationship Action Buttons */}
                {!isSelfProfile && (
                  <div className="mt-6 w-full space-y-2">
                    {relationship.type === "PENDING_INCOMING" ? (
                      <div className="flex gap-2.5 w-full">
                        <button
                          type="button"
                          onClick={handleAction}
                          disabled={actionLoading}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "rgba(34, 197, 94, 0.12)",
                            border: "none",
                            borderRadius: 12,
                            color: "#4ADE80",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          className="flex items-center justify-center gap-2 active:scale-[0.99] transition cursor-pointer disabled:opacity-50"
                        >
                          <UserCheck className="w-4 h-4 flex-shrink-0" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRejectIncoming}
                          disabled={actionLoading}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "rgba(239, 68, 68, 0.10)",
                            border: "none",
                            borderRadius: 12,
                            color: "#EF4444",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          className="flex items-center justify-center gap-2 active:scale-[0.99] transition cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-4 h-4 flex-shrink-0" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAction}
                        disabled={actionLoading}
                        style={{
                          width: "100%",
                          padding: "14px",
                          background:
                            relationship.type === "ACCEPTED"
                              ? "rgba(239, 68, 68, 0.08)"
                              : "rgba(255, 255, 255, 0.06)",
                          border: "none",
                          borderRadius: 12,
                          color:
                            relationship.type === "ACCEPTED"
                              ? "#EF4444"
                              : "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        className="flex items-center justify-center gap-2 active:scale-[0.99] transition cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <span>Processing...</span>
                        ) : relationship.type === "ACCEPTED" ? (
                          <>
                            <UserMinus className="w-4 h-4 flex-shrink-0" />
                            <span>Remove Friend</span>
                          </>
                        ) : relationship.type === "PENDING_OUTGOING" ? (
                          <>
                            <UserMinus className="w-4 h-4 flex-shrink-0" />
                            <span>Cancel Request</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4 flex-shrink-0" />
                            <span>Add Friend</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500 font-sans text-xs">
                Could not load user profile.
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
