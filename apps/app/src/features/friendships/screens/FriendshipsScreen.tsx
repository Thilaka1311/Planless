import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronRight, UserRoundPlus, Users, UserRoundCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { supabase } from "../../../../lib/supabaseClient";

import { FriendRequestsScreen } from "./FriendRequestsScreen";
import { AllFriendsScreen } from "./AllFriendsScreen";
import { DiscoverFriends } from "./DiscoverFriends";
import { FriendProfileViewerBottomSheet } from "../components/FriendProfileViewerBottomSheet";
import { SearchBar } from "../../../shared/components/SearchBar";

interface FriendshipsScreenProps {
  onBack: () => void;
}

export const FriendshipsScreen: React.FC<FriendshipsScreenProps> = ({ onBack }) => {
  const { activeUserUuid } = useProfileStore();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    sendFriendRequest,
  } = useFriendshipStore();

  // Navigation screen states
  const [activeScreen, setActiveScreen] = useState<"hub" | "requests" | "discover">("hub");
  const [searchQuery, setSearchQuery] = useState("");
  const [zoomedPhoto, setZoomedPhoto] = useState<{ src: string; name: string } | null>(null);
  const [selectedFriendForViewer, setSelectedFriendForViewer] = useState<{ friendshipId: string; userId: string } | null>(null);

  // Discovery states
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);

  // Fetch all users once on mount
  useEffect(() => {
    async function loadAllUsers() {
      setLoadingUsers(true);
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, public_id, full_name, profile_photo_path, bio");
        if (error) {
          console.error("Failed to load users for discovery:", error.message);
        } else {
          setAllUsers(data || []);
        }
      } catch (err) {
        console.error("Failed to load users for discovery:", err);
      } finally {
        setLoadingUsers(false);
      }
    }
    loadAllUsers();
  }, []);

  // Compute discoverable users client-side (including users with outgoing requests so they can show Cancel)
  const discoverableUsers = useMemo(() => {
    if (!activeUserUuid) return [];

    const friendIds = new Set(friends.map(f => f.friend?.id).filter(Boolean));
    const incomingIds = new Set(incomingRequests.map(r => r.sender?.id).filter(Boolean));

    return allUsers
      .filter(u => {
        if (u.id === activeUserUuid) return false;
        if (friendIds.has(u.id)) return false;
        if (incomingIds.has(u.id)) return false;
        return true;
      })
      .map(u => ({
        ...u,
        profile_photo: u.profile_photo_path || u.profile_photo
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [allUsers, friends, incomingRequests, activeUserUuid]);

  // Compute filtered & ranked friends for inline search across all friends (Exact -> StartsWith -> Contains)
  const filteredFriends = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return friends;

    const matchesWithScore: { item: any; score: number }[] = [];

    friends.forEach((item) => {
      const name = (item.friend?.full_name || "").toLowerCase();
      const username = (item.friend?.username || item.friend?.user_id || item.friend?.public_id || "").toLowerCase();
      const nameWords = name.split(/\s+/);

      const isExact = name === query || username === query;
      const isStartsWith =
        name.startsWith(query) ||
        username.startsWith(query) ||
        nameWords.some((w) => w.startsWith(query));
      const isContains = name.includes(query) || username.includes(query);

      if (isExact) {
        matchesWithScore.push({ item, score: 1 });
      } else if (isStartsWith) {
        matchesWithScore.push({ item, score: 2 });
      } else if (isContains) {
        matchesWithScore.push({ item, score: 3 });
      }
    });

    matchesWithScore.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      const nameA = (a.item.friend?.full_name || "").toLowerCase();
      const nameB = (b.item.friend?.full_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return matchesWithScore.map((m) => m.item);
  }, [searchQuery, friends]);

  const handleAddFriend = async (targetUserUuid: string, name: string) => {
    try {
      await sendFriendRequest(targetUserUuid);
    } catch (err: any) {
      console.error("[handleAddFriend] Error:", err);
    }
  };

  const isLoadingCombined = loading || loadingUsers;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-[#000000] flex flex-col z-40 select-none overflow-hidden"
    >
      {/* 1. MAIN FRIENDS HUB SCREEN */}
      {activeScreen === "hub" && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* STICKY HEADER (Back button, Friends title, Discover button) */}
          <header className="h-14 shrink-0 bg-[#000000] px-5 flex items-center justify-between z-30 select-none relative">
            <div className="flex items-center space-x-3">
              <button
                onClick={onBack}
                className="w-9 h-9 -ml-1.5 flex items-center justify-center text-white/90 hover:text-white transition active:scale-95 cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-sans font-bold text-xl text-white tracking-tight leading-none">Friends</h1>
              </div>
            </div>
            <button
              onClick={() => setActiveScreen("requests")}
              className="w-9 h-9 -mr-1 flex items-center justify-center text-white/90 hover:text-white transition active:scale-95 cursor-pointer relative"
              title="Friend Requests"
            >
              <UserRoundCheck className="w-5 h-5" />
              {incomingRequests.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF4444] ring-2 ring-black" />
              )}
            </button>
          </header>

          {/* SCROLLABLE CONTENT (Search bar, Discover Friends, Friends list) */}
          <div className="flex-1 overflow-y-auto px-5 pt-0.5 pb-8 space-y-4">
            {/* SEARCH FRIENDS BAR (Scrolls with content) */}
            <div
              className="pt-0.5 pb-1 select-none"
              style={{ boxSizing: 'border-box' }}
            >
              <SearchBar
                id="search-friends-input"
                name="searchFriendsInput"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>

            {/* 2. DISCOVER FRIENDS ROW (Hidden when searchQuery is non-empty) */}
            {searchQuery === "" && (
              <button
                onClick={() => setActiveScreen("discover")}
                className="w-full py-2.5 px-1 flex items-center justify-between hover:bg-white/[0.03] active:bg-white/[0.05] rounded-xl transition cursor-pointer text-left group"
              >
                <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                  <div className="w-11 h-11 flex items-center justify-center text-white/90 group-hover:text-white flex-shrink-0 transition-colors">
                    <UserRoundPlus className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans font-bold text-sm text-zinc-100 group-hover:text-white transition truncate">
                      Discover Friends
                    </h3>
                    <p className="text-[11.5px] font-sans font-medium text-zinc-500 mt-0.5 truncate">
                      Find and connect with people
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition flex-shrink-0 ml-2" />
              </button>
            )}

            {/* 3. FRIENDS LIST */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-500">
                  Friends ({filteredFriends.length})
                </h3>
              </div>

              {filteredFriends.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-950 border border-white/[0.03] flex items-center justify-center text-zinc-600 mx-auto mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <p className="text-zinc-500 font-sans font-medium text-xs">
                    {searchQuery ? "No friends found" : "No friends yet"}
                  </p>
                  <p className="text-zinc-600 text-[11px] mt-1">
                    {searchQuery ? "Try searching for a different name." : "Tap the icon at top right to discover people."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredFriends.map((item) => (
                    <div
                      key={item.friendshipId}
                      onClick={() => setSelectedFriendForViewer({ friendshipId: item.friendshipId, userId: item.friend?.id })}
                      className="w-full py-2.5 px-1 flex items-center justify-between hover:bg-white/[0.03] active:bg-white/[0.05] rounded-xl transition cursor-pointer group select-none text-left"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        <UserAvatar
                          src={item.friend?.profile_photo || ""}
                          alt={item.friend?.full_name || "User"}
                          className="w-11 h-11 rounded-full border border-white/[0.06] object-cover transition-transform duration-200 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-sans font-bold text-sm text-zinc-200 group-hover:text-white transition truncate">
                            {item.friend?.full_name || "User"}
                          </h4>
                          <p className="text-[11.5px] font-sans font-medium text-zinc-500 mt-0.5 line-clamp-1 truncate">
                            {item.friend?.bio || "Always spontaneous, never planless."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. DEDICATED FRIEND REQUESTS SCREEN */}
      <AnimatePresence>
        {activeScreen === "requests" && (
          <FriendRequestsScreen
            onBack={() => setActiveScreen("hub")}
            onZoomPhoto={setZoomedPhoto}
          />
        )}
      </AnimatePresence>



      {/* 4. DEDICATED DISCOVER PEOPLE SCREEN */}
      <AnimatePresence>
        {activeScreen === "discover" && (
          <DiscoverFriends
            onBack={() => setActiveScreen("hub")}
            discoverableUsers={discoverableUsers}
            onAddFriend={handleAddFriend}
          />
        )}
      </AnimatePresence>

      {/* FRIEND PROFILE VIEWER BOTTOM SHEET */}
      <FriendProfileViewerBottomSheet
        friendUserId={selectedFriendForViewer?.userId || null}
        onClose={() => setSelectedFriendForViewer(null)}
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
              <button
                onClick={() => setZoomedPhoto(null)}
                className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>

              <h3 className="absolute -top-11 left-0 font-sans font-bold text-base text-white">
                {zoomedPhoto.name}
              </h3>

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
