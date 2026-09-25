import React, { useState } from "react";
import { ArrowLeft, Check, UserCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { FriendProfileViewerBottomSheet } from "../components/FriendProfileViewerBottomSheet";

interface FriendRequestsScreenProps {
  onBack: () => void;
  onZoomPhoto?: (photo: { src: string; name: string }) => void;
}

export const FriendRequestsScreen: React.FC<FriendRequestsScreenProps> = ({ onBack, onZoomPhoto }) => {
  const {
    incomingRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    loading
  } = useFriendshipStore();

  const [selectedIncomingUserForViewer, setSelectedIncomingUserForViewer] = useState<{ userId: string } | null>(null);

  const handleAccept = async (friendshipId: string, name: string) => {
    try {
      await acceptFriendRequest(friendshipId);
    } catch (err: any) {
      console.error("[handleAccept] Error:", err);
    }
  };

  const handleReject = async (friendshipId: string, name: string) => {
    try {
      await rejectFriendRequest(friendshipId);
    } catch (err: any) {
      console.error("[handleReject] Error:", err);
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
            <h1 className="font-sans font-bold text-xl text-white tracking-tight leading-none">Friend Requests</h1>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <div className={`flex-1 overflow-y-auto px-5 py-5 ${incomingRequests.length === 0 ? "flex flex-col justify-center" : "space-y-6"}`}>
        {/* INCOMING REQUESTS SECTION */}
        <div className={incomingRequests.length === 0 ? "flex-1 flex flex-col items-center justify-center" : ""}>
          {incomingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-8">
              <UserCheck className="w-8 h-8 text-zinc-600 stroke-[1.5] mb-3" />
              <p className="text-zinc-400 font-sans font-medium text-sm">No pending friend requests</p>
              <p className="text-zinc-600 text-xs mt-1 max-w-[240px]">
                When someone sends you a friend request, it will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {incomingRequests.map((item) => (
                <div
                  key={item.friendshipId}
                  className="w-full py-2.5 px-1 hover:bg-white/[0.03] active:bg-white/[0.05] rounded-xl flex items-center justify-between transition"
                >
                  <div
                    onClick={() => setSelectedIncomingUserForViewer({ userId: item.sender?.id })}
                    className="flex items-center space-x-3.5 min-w-0 flex-1 pr-3 cursor-pointer group"
                  >
                    <UserAvatar
                      src={item.sender?.profile_photo || ""}
                      alt={item.sender?.full_name || "User"}
                      className="w-11 h-11 rounded-full border border-white/[0.06] object-cover transition-transform duration-200 group-hover:scale-105 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-sans font-bold text-sm text-zinc-200 group-hover:text-white transition truncate">
                        {item.sender?.full_name || "User"}
                      </h4>
                      <p className="text-[11.5px] font-sans font-medium text-zinc-500 mt-0.5 line-clamp-1 truncate">
                        {item.sender?.bio || "Always spontaneous, never planless."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccept(item.friendshipId, item.sender?.full_name || "User");
                      }}
                      title="Accept"
                      className="w-9 h-9 rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 flex items-center justify-center text-green-400 transition active:scale-95 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[2.5px]" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(item.friendshipId, item.sender?.full_name || "User");
                      }}
                      title="Reject"
                      className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center text-red-500 transition active:scale-95 cursor-pointer"
                    >
                      <X className="w-4 h-4 stroke-[2.5px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FRIEND PROFILE VIEWER BOTTOM SHEET (For Incoming Requests) */}
      <FriendProfileViewerBottomSheet
        friendUserId={selectedIncomingUserForViewer?.userId || null}
        onClose={() => {
          setSelectedIncomingUserForViewer(null);
        }}
        source="requests"
      />
    </motion.div>
  );
};
