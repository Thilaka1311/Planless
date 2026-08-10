import React, { useState } from "react";
import { ArrowLeft, Check, UserCheck, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendshipStore } from "../state/FriendshipContext";
import { useToast } from "../../../shared/contexts/ToastContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { FriendProfileViewerBottomSheet } from "../components/FriendProfileViewerBottomSheet";

interface FriendRequestsScreenProps {
  onBack: () => void;
  onZoomPhoto?: (photo: { src: string; name: string }) => void;
}

export const FriendRequestsScreen: React.FC<FriendRequestsScreenProps> = ({ onBack, onZoomPhoto }) => {
  const { showToast } = useToast();
  const {
    incomingRequests,
    outgoingRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    loading
  } = useFriendshipStore();

  const [showSentRequests, setShowSentRequests] = useState(false);
  const [selectedSentUserForViewer, setSelectedSentUserForViewer] = useState<{ friendshipId: string; userId: string } | null>(null);
  const [selectedIncomingUserForViewer, setSelectedIncomingUserForViewer] = useState<{ userId: string } | null>(null);

  const handleAccept = async (friendshipId: string, name: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      showToast(`Accepted ${name}'s friend request!`);
    } catch (err: any) {
      showToast(err.message || "Failed to accept request.");
    }
  };

  const handleReject = async (friendshipId: string, name: string) => {
    try {
      await rejectFriendRequest(friendshipId);
      showToast(`Declined ${name}'s friend request.`);
    } catch (err: any) {
      showToast(err.message || "Failed to decline request.");
    }
  };

  const handleCancelSentRequest = async (friendshipId: string, name: string) => {
    try {
      await rejectFriendRequest(friendshipId);
      showToast(`Cancelled friend request to ${name}.`);
    } catch (err: any) {
      showToast(err.message || "Failed to cancel request.");
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
            <h1 className="font-sans font-bold text-xl text-white">Friend Requests</h1>
            <p className="text-[11px] font-sans font-medium text-zinc-500 mt-0.5">
              {incomingRequests.length} pending request{incomingRequests.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* INCOMING REQUESTS SECTION */}
        <div>
          <h3 className="text-[11px] font-sans font-bold uppercase tracking-wider text-zinc-500 mb-3.5">
            Incoming Requests
          </h3>
          {incomingRequests.length === 0 ? (
            <div className="p-6 bg-[#0A0A0C]/50 border border-white/[0.02] border-dashed rounded-2xl text-center">
              <p className="text-zinc-600 font-sans font-medium text-xs">No pending friend requests</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {incomingRequests.map((item) => (
                <div
                  key={item.friendshipId}
                  className="w-full p-4 bg-[#0A0A0C] border border-white/[0.03] rounded-2xl flex items-center justify-between"
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

        {/* OUTGOING / SENT REQUESTS SECTION */}
        {outgoingRequests.length > 0 && (
          <div className="border-t border-white/[0.04] pt-4">
            <button
              onClick={() => setShowSentRequests(!showSentRequests)}
              className="w-full flex items-center justify-between py-2 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <span className="font-sans font-bold text-xs uppercase tracking-wider">
                Sent Requests ({outgoingRequests.length})
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${showSentRequests ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {showSentRequests && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 pt-3 overflow-hidden"
                >
                  {outgoingRequests.map((item) => (
                    <div
                      key={item.friendshipId}
                      className="w-full p-4 bg-[#0A0A0C]/60 border border-white/[0.03] rounded-2xl flex items-center justify-between"
                    >
                      <div
                        onClick={() => setSelectedSentUserForViewer({ friendshipId: item.friendshipId, userId: item.recipient?.id })}
                        className="flex items-center space-x-3.5 flex-1 pr-3 cursor-pointer group"
                      >
                        <UserAvatar
                          src={item.recipient?.profile_photo || ""}
                          alt={item.recipient?.full_name || "User"}
                          className="w-10 h-10 rounded-full border border-white/[0.06] object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div>
                          <h4 className="font-sans font-bold text-sm text-zinc-300 group-hover:text-white transition">
                            {item.recipient?.full_name}
                          </h4>
                          <p className="text-[11px] font-sans font-medium text-zinc-550 line-clamp-1">
                            {item.recipient?.bio || "Always spontaneous, never planless."}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelSentRequest(item.friendshipId, item.recipient?.full_name || "User");
                        }}
                        className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-white/[0.04] hover:border-white/[0.08] text-zinc-400 hover:text-white font-sans font-semibold text-[11px] rounded-lg transition active:scale-[0.97] cursor-pointer whitespace-nowrap flex-shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* FRIEND PROFILE VIEWER BOTTOM SHEET (For Outgoing & Incoming Requests) */}
      <FriendProfileViewerBottomSheet
        friendUserId={selectedSentUserForViewer?.userId || selectedIncomingUserForViewer?.userId || null}
        onClose={() => {
          setSelectedSentUserForViewer(null);
          setSelectedIncomingUserForViewer(null);
        }}
      />
    </motion.div>
  );
};
