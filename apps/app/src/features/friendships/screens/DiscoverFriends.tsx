import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, UserPlus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useToast } from "../../../shared/contexts/ToastContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { FriendProfileViewerBottomSheet } from "../components/FriendProfileViewerBottomSheet";

interface DiscoverFriendsProps {
  onBack: () => void;
  discoverableUsers: any[];
  onAddFriend: (targetUserUuid: string, name: string) => Promise<void>;
}

export const DiscoverFriends: React.FC<DiscoverFriendsProps> = ({
  onBack,
  discoverableUsers,
  onAddFriend,
}) => {
  const { showToast } = useToast();
  const { outgoingRequests, rejectFriendRequest } = useFriendshipStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [zoomedPhoto, setZoomedPhoto] = useState<{ src: string; name: string } | null>(null);
  const [selectedUserForViewer, setSelectedUserForViewer] = useState<{ userId: string } | null>(null);

  const handleCancelRequest = async (friendshipId: string, name: string) => {
    try {
      await rejectFriendRequest(friendshipId);
      showToast(`Cancelled friend request to ${name}.`);
    } catch (err: any) {
      showToast(err.message || "Failed to cancel request.");
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return discoverableUsers;

    const matchesWithScore: { user: any; score: number }[] = [];

    discoverableUsers.forEach((user) => {
      const name = (user.full_name || "").toLowerCase();
      const publicId = (user.public_id || user.id || "").toLowerCase();
      const nameWords = name.split(/\s+/);

      const isExact = name === query || publicId === query;
      const isStartsWith =
        name.startsWith(query) ||
        publicId.startsWith(query) ||
        nameWords.some((w) => w.startsWith(query));
      const isContains = name.includes(query) || publicId.includes(query);

      if (isExact) {
        matchesWithScore.push({ user, score: 1 });
      } else if (isStartsWith) {
        matchesWithScore.push({ user, score: 2 });
      } else if (isContains) {
        matchesWithScore.push({ user, score: 3 });
      }
    });

    matchesWithScore.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      const nameA = (a.user.full_name || "").toLowerCase();
      const nameB = (b.user.full_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return matchesWithScore.map((m) => m.user);
  }, [searchQuery, discoverableUsers]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-[#000000] flex flex-col z-50 select-none"
    >
      {/* HEADER */}
      <header className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full border border-white/[0.06] hover:bg-white/[0.03] flex items-center justify-center text-white transition active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="font-sans font-bold text-xl text-white">Discover People</h1>
            <p className="text-[11px] font-sans font-medium text-zinc-500 mt-0.5">
              Find new connections on Planless
            </p>
          </div>
        </div>
      </header>

      {/* SEARCH BAR */}
      <div className="px-5 py-3.5">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-4 h-4 text-zinc-550 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 bg-zinc-950 border border-white/[0.05] rounded-xl pl-11 pr-10 text-sm text-white placeholder-zinc-550 focus:outline-none focus:border-white/[0.12] transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* USERS LIST */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {filteredUsers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pt-16">
            <p className="text-zinc-550 font-sans font-medium text-xs">
              {searchQuery ? "No people found" : "No discoverable users"}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {filteredUsers.map((user) => {
              const pendingRequest = outgoingRequests.find(
                (r) => r.recipient?.id === user.id || (r.recipient as any)?.public_id === user.public_id
              );

              return (
                <div
                  key={user.id}
                  className="w-full p-4 bg-[#0A0A0C] border border-white/[0.03] rounded-2xl flex items-center justify-between"
                >
                  <div
                    onClick={() => setSelectedUserForViewer({ userId: user.id })}
                    className="flex items-center space-x-3.5 min-w-0 flex-1 pr-3 cursor-pointer group"
                  >
                    <UserAvatar
                      src={user.profile_photo_path || user.profile_photo}
                      alt={user.full_name || "User"}
                      className="w-11 h-11 rounded-full border border-white/[0.06] object-cover transition-transform duration-200 flex-shrink-0 group-hover:scale-105"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-sans font-bold text-sm text-zinc-200 group-hover:text-white transition truncate">
                        {user.full_name}
                      </h4>
                      <p className="text-[11.5px] font-sans font-medium text-zinc-500 mt-0.5 line-clamp-1 truncate">
                        {user.bio || "Always spontaneous, never planless."}
                      </p>
                    </div>
                  </div>

                  {pendingRequest ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(pendingRequest.friendshipId, user.full_name);
                      }}
                      className="px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 border border-white/[0.04] hover:border-white/[0.08] text-zinc-400 hover:text-white font-sans font-bold text-xs rounded-xl transition active:scale-[0.97] cursor-pointer whitespace-nowrap flex-shrink-0 min-w-[95px] flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddFriend(user.id, user.full_name);
                      }}
                      className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-850 border border-white/[0.04] text-white font-sans font-bold text-xs rounded-xl transition active:scale-[0.97] cursor-pointer whitespace-nowrap flex-shrink-0 min-w-[95px] flex items-center justify-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Add Friend</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FRIEND / USER PROFILE VIEWER BOTTOM SHEET */}
      <FriendProfileViewerBottomSheet
        friendUserId={selectedUserForViewer?.userId || null}
        onClose={() => setSelectedUserForViewer(null)}
      />

      {/* PHOTO ZOOM MODAL */}
      <AnimatePresence>
        {zoomedPhoto && (
          <div
            className="fixed inset-0 bg-white/10 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center p-6"
            onClick={() => setZoomedPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative max-w-[90vw] max-h-[80vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setZoomedPhoto(null)}
                className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>

              {/* User Name Header */}
              <h3 className="absolute -top-11 left-0 font-sans font-bold text-base text-white">
                {zoomedPhoto.name}
              </h3>

              {/* Image wrapper */}
              <div className="bg-[#0A0A0C] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                <UserAvatar
                  src={zoomedPhoto.src}
                  alt={zoomedPhoto.name}
                  className="w-[280px] h-[280px] rounded-none object-cover"
                  size=""
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
