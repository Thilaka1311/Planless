import React, { useState, useMemo } from "react";
import { ArrowLeft, UserPlus, UserRoundCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { FriendProfileViewerBottomSheet } from "../components/FriendProfileViewerBottomSheet";
import { SearchBar } from "../../../shared/components/SearchBar";

interface DiscoverFriendsProps {
  onBack: () => void;
  discoverableUsers: any[];
  onAddFriend?: (targetUserUuid: string, name: string) => Promise<void>;
  onOpenRequests?: () => void;
}

export const DiscoverFriends: React.FC<DiscoverFriendsProps> = ({
  onBack,
  discoverableUsers,
  onOpenRequests,
}) => {
  const { incomingRequests } = useFriendshipStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [zoomedPhoto, setZoomedPhoto] = useState<{ src: string; name: string } | null>(null);
  const [selectedUserForViewer, setSelectedUserForViewer] = useState<{ userId: string } | null>(null);

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
      const nameA = a.user.full_name || "";
      const nameB = b.user.full_name || "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
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
      <header className="h-14 shrink-0 bg-[#000000] px-5 flex items-center justify-between z-30 select-none relative">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="w-9 h-9 -ml-1.5 flex items-center justify-center text-white/90 hover:text-white transition active:scale-95 cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-sans font-bold text-xl text-white tracking-tight leading-none">Discover People</h1>
          </div>
        </div>

        {onOpenRequests && (
          <button
            onClick={onOpenRequests}
            className="w-9 h-9 -mr-1 flex items-center justify-center text-white/90 hover:text-white transition active:scale-95 cursor-pointer relative"
            title="Friend Requests"
          >
            <UserRoundCheck className="w-5 h-5" />
            {incomingRequests.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-[10px] font-sans font-bold text-white flex items-center justify-center ring-2 ring-black">
                {incomingRequests.length}
              </span>
            )}
          </button>
        )}
      </header>

      {/* SEARCH BAR */}
      <div className="px-5 pt-0.5 pb-2.5 select-none" style={{ boxSizing: 'border-box' }}>
        <SearchBar
          id="discover-people-search-input"
          name="discoverPeopleSearchInput"
          placeholder="Search friends..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* DISCOVER USERS LIST */}
      <div className="flex-1 flex flex-col overflow-y-auto px-5 pb-8">
        {filteredUsers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
            <UserPlus className="w-8 h-8 text-zinc-600 stroke-[1.5] mb-3" />
            <p className="text-zinc-400 font-sans font-medium text-sm">No users found</p>
            <p className="text-zinc-600 text-xs mt-1 max-w-[240px]">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-1 pt-1">
            {filteredUsers.map((user) => {
              return (
                <div
                  key={user.id}
                  onClick={() => setSelectedUserForViewer({ userId: user.id })}
                  className="w-full py-2.5 px-1 hover:bg-white/[0.03] active:bg-white/[0.05] rounded-xl flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1 pr-3">
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
        source="discover"
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
