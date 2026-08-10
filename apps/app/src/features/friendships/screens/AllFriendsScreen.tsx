import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, MoreVertical, Trash2, User, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useToast } from "../../../shared/contexts/ToastContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

interface AllFriendsScreenProps {
  onBack: () => void;
  onZoomPhoto?: (photo: { src: string; name: string }) => void;
}

export const AllFriendsScreen: React.FC<AllFriendsScreenProps> = ({ onBack, onZoomPhoto }) => {
  const { showToast } = useToast();
  const { friends, removeFriend, loading } = useFriendshipStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [friendToRemove, setFriendToRemove] = useState<{ id: string; name: string } | null>(null);

  const filteredFriends = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter(
      (item) =>
        item.friend?.full_name?.toLowerCase().includes(query) ||
        item.friend?.bio?.toLowerCase().includes(query)
    );
  }, [searchQuery, friends]);

  const handleSettleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(null);
  };

  const confirmRemoveFriend = (friendshipId: string, name: string) => {
    setFriendToRemove({ id: friendshipId, name });
    setActiveMenuId(null);
  };

  const handleRemoveFriend = async () => {
    if (!friendToRemove) return;
    try {
      await removeFriend(friendToRemove.id);
      showToast(`Removed ${friendToRemove.name} from friends.`);
    } catch (err: any) {
      showToast(err.message || "Failed to remove friend.");
    } finally {
      setFriendToRemove(null);
    }
  };

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
            <h1 className="font-sans font-bold text-xl text-white">All Friends</h1>
            <p className="text-[11px] font-sans font-medium text-zinc-500 mt-0.5">
              {friends.length} friend{friends.length === 1 ? "" : "s"}
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
            placeholder="Search friends..."
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

      {/* FRIENDS LIST */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {filteredFriends.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 pt-16">
            <div className="w-16 h-16 rounded-full bg-zinc-950 border border-white/[0.03] flex items-center justify-center text-zinc-650 mb-4">
              <User className="w-7 h-7" />
            </div>
            <h3 className="font-sans font-bold text-base text-zinc-200">
              {searchQuery ? "No friends found" : "No friends yet"}
            </h3>
            <p className="text-zinc-550 text-xs mt-1.5 max-w-[220px] leading-relaxed">
              {searchQuery ? "Try searching for a different name" : "Start connecting with people on Planless."}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 pt-2">
            {filteredFriends.map((item) => (
              <div
                key={item.friendshipId}
                className="relative w-full p-4 bg-[#0A0A0C] border border-white/[0.03] rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center space-x-3.5">
                  <UserAvatar
                    src={item.friend?.profile_photo || ""}
                    alt={item.friend?.full_name || "User"}
                    onClick={() => onZoomPhoto?.({ src: item.friend?.profile_photo || "", name: item.friend?.full_name || "User" })}
                    className="w-11 h-11 rounded-full border border-white/[0.06] object-cover cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200"
                  />
                  <div>
                    <h4 className="font-sans font-bold text-sm text-zinc-200">
                      {item.friend?.full_name || "User"}
                    </h4>
                    <p className="text-[11.5px] font-sans font-medium text-zinc-500 mt-0.5 line-clamp-1">
                      {item.friend?.bio || "Always spontaneous, never planless."}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === item.friendshipId ? null : item.friendshipId);
                    }}
                    className="w-9 h-9 rounded-full border border-white/[0.04] hover:bg-white/[0.02] flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    <MoreVertical className="w-4.5 h-4.5" />
                  </button>

                  <AnimatePresence>
                    {activeMenuId === item.friendshipId && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={handleSettleAction} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-11 w-44 bg-[#111113] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
                        >
                          <button
                            onClick={(e) => {
                              handleSettleAction(e);
                              showToast(`Viewing profile of ${item.friend?.full_name || "friend"}...`);
                            }}
                            className="w-full px-4 py-3 text-left font-sans font-semibold text-[11px] text-zinc-200 hover:bg-white/[0.02] transition cursor-pointer flex items-center gap-2"
                          >
                            <User className="w-3.5 h-3.5 text-zinc-400" />
                            View Profile
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmRemoveFriend(item.friendshipId, item.friend?.full_name || "friend");
                            }}
                            className="w-full px-4 py-3 text-left font-sans font-semibold text-[11px] text-[#EF4444] hover:bg-[#EF4444]/5 transition border-t border-white/[0.04] cursor-pointer flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove Friend
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REMOVE FRIEND CONFIRMATION DIALOG */}
      <AnimatePresence>
        {friendToRemove && (
          <div
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6"
            onClick={() => setFriendToRemove(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-[280px] bg-[#0A0A0C] border border-white/10 rounded-2xl p-5 text-center shadow-2xl relative select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center text-[#EF4444] mx-auto mb-3.5">
                <Trash2 className="w-5 h-5" />
              </div>

              <h3 className="font-sans font-bold text-base text-white mb-1.5">Remove Friend?</h3>
              <p className="text-zinc-550 text-xs leading-normal mb-5">
                You will no longer appear in each other's friends list.
              </p>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setFriendToRemove(null)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/5 text-zinc-350 hover:text-white font-semibold text-xs tracking-wide transition active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveFriend}
                  className="flex-1 py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#F87171] text-white font-semibold text-xs tracking-wide transition active:scale-95 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
