import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronRight, UserRoundPlus, Users, X } from "lucide-react";
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
  initialScreen?: "hub" | "requests" | "discover";
}

export const FriendshipsScreen: React.FC<FriendshipsScreenProps> = ({
  onBack,
  initialScreen = "hub",
}) => {
  const { activeUserUuid } = useProfileStore();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    sendFriendRequest,
  } = useFriendshipStore();

  // Navigation screen states
  const [activeScreen, setActiveScreen] = useState<"hub" | "requests" | "discover">(initialScreen);
  const [requestsReturnScreen, setRequestsReturnScreen] = useState<"hub" | "discover">(initialScreen === "discover" ? "discover" : "hub");
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

  // Compute discoverable users client-side: show EVERYONE except active user
  const discoverableUsers = useMemo(() => {
    if (!activeUserUuid) return [];

    return allUsers
      .filter(u => u.id !== activeUserUuid)
      .map(u => ({
        ...u,
        profile_photo: u.profile_photo_path || u.profile_photo
      }))
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" }));
  }, [allUsers, activeUserUuid]);

  // Sort complete friend list alphabetically by display name (case-insensitive)
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const nameA = a.friend?.full_name || "";
      const nameB = b.friend?.full_name || "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
  }, [friends]);

  // Compute filtered & ranked friends for inline search across all friends (Exact -> StartsWith -> Contains)
  const filteredFriends = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedFriends;

    const matchesWithScore: { item: any; score: number }[] = [];

    sortedFriends.forEach((item) => {
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
      const nameA = a.item.friend?.full_name || "";
      const nameB = b.item.friend?.full_name || "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });

    return matchesWithScore.map((m) => m.item);
  }, [searchQuery, sortedFriends]);

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
          {/* STICKY HEADER (Back button, Friends title, Discover button, Friend Requests button) */}
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
            <div className="flex items-center space-x-2 -mr-1">
              {incomingRequests.length > 0 && (
                <button
                  id="btn-friend-requests-badge"
                  onClick={() => {
                    setRequestsReturnScreen("hub");
                    setActiveScreen("requests");
                  }}
                  className="px-2.5 py-1 rounded-full bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 text-[#FF854C] hover:bg-[#FF6B2C]/25 text-xs font-sans font-semibold tracking-tight transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                  title="Friend Requests"
                >
                  {incomingRequests.length} {incomingRequests.length === 1 ? "friend request" : "friend requests"}
                </button>
              )}
              <button
                id="btn-discover-friends"
                onClick={() => setActiveScreen("discover")}
                className="w-9 h-9 flex items-center justify-center text-white/90 hover:text-white transition active:scale-95 cursor-pointer"
                title="Discover Friends"
              >
                <UserRoundPlus className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* SCROLLABLE CONTENT (Search bar, Friends list) */}
          <div className="flex-1 flex flex-col overflow-y-auto px-5 pt-0.5 pb-8">
            {/* SEARCH FRIENDS BAR (Scrolls with content) */}
            <div
              className="pt-0.5 pb-3 select-none shrink-0"
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

            {/* 2. FRIENDS LIST */}
            {filteredFriends.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
                <Users className="w-8 h-8 text-zinc-600 stroke-[1.5] mb-3" />
                <h3 className="font-sans font-semibold text-sm text-zinc-300">
                  {searchQuery ? "No friends found" : "No friends yet"}
                </h3>
                {searchQuery && (
                  <p className="text-zinc-500 font-sans text-xs mt-1 max-w-[240px]">
                    Try searching for a different name.
                  </p>
                )}
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setActiveScreen("discover")}
                    className="mt-4 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 active:scale-95 border border-white/[0.08] text-white font-sans font-medium text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <UserRoundPlus className="w-4 h-4 text-white/90" />
                    <span>Discover Friends</span>
                  </button>
                )}
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
      )}

      {/* 2. DEDICATED FRIEND REQUESTS SCREEN */}
      <AnimatePresence>
        {activeScreen === "requests" && (
          <FriendRequestsScreen
            onBack={() => setActiveScreen(requestsReturnScreen)}
            onZoomPhoto={setZoomedPhoto}
          />
        )}
      </AnimatePresence>



      {/* 4. DEDICATED DISCOVER PEOPLE SCREEN */}
      <AnimatePresence>
        {activeScreen === "discover" && (
          <DiscoverFriends
            onBack={() => {
              if (initialScreen === "discover") {
                onBack();
              } else {
                setActiveScreen("hub");
              }
            }}
            discoverableUsers={discoverableUsers}
            onAddFriend={handleAddFriend}
            onOpenRequests={() => {
              setRequestsReturnScreen("discover");
              setActiveScreen("requests");
            }}
          />
        )}
      </AnimatePresence>

      {/* FRIEND PROFILE VIEWER BOTTOM SHEET */}
      <FriendProfileViewerBottomSheet
        friendUserId={selectedFriendForViewer?.userId || null}
        onClose={() => setSelectedFriendForViewer(null)}
        source="friends"
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
