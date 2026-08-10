import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserMinus, Users, X } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useToast } from "../../../shared/contexts/ToastContext";

interface FriendProfileViewerBottomSheetProps {
  friendshipId: string | null;
  friendUserId: string | null;
  onClose: () => void;
  onFriendRemoved?: () => void;
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
  friendshipId,
  friendUserId,
  onClose,
  onFriendRemoved,
}) => {
  const { removeFriend } = useFriendshipStore();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<FriendProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

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

  const handleRemoveFriend = async () => {
    if (!friendshipId || isRemoving) return;
    setIsRemoving(true);
    try {
      await removeFriend(friendshipId);
      showToast(`Removed ${profile?.full_name || "friend"} from your friends.`);
      if (onFriendRemoved) onFriendRemoved();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to remove friend.");
    } finally {
      setIsRemoving(false);
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
                <div className="mb-3">
                  <UserAvatar
                    src={profile.profile_photo_path || ""}
                    alt={profile.full_name}
                    className="w-20 h-20 rounded-full border border-white/10 object-cover shadow-lg"
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

                {/* 5. Full-Width Destructive Remove Action (Only for confirmed friends) */}
                <div className="mt-6 w-full space-y-2">
                  {friendshipId && (
                    <button
                      type="button"
                      onClick={handleRemoveFriend}
                      disabled={isRemoving}
                      style={{
                        width: "100%",
                        padding: "14px",
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "none",
                        borderRadius: 12,
                        color: "#EF4444",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                      className="active:scale-[0.99] transition cursor-pointer disabled:opacity-50"
                    >
                      {isRemoving ? "Removing..." : "Remove"}
                    </button>
                  )}

                  {/* 6. Cancel Action Footer */}
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: "none",
                      border: "none",
                      borderRadius: 12,
                      color: "rgba(255, 255, 255, 0.4)",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    className="active:scale-[0.99] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
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
