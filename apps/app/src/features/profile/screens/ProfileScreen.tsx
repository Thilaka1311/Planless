import React, { useState, useEffect } from "react";
import {
  Mail,
  Users,
  LogOut,
  History
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useProfileStore } from "../state/ProfileContext";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";
import { UserProfile } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { FriendshipsScreen } from "../../friendships/screens/FriendshipsScreen";
import { Name } from "./Name";
import { About } from "./About";
import { PastPlans } from "./PastPlans";

interface ProfileScreenProps {
  onLogout: () => void;
  setSelectedPlanId: (planId: string | null) => void;
  setShowDepositModal: (show: boolean) => void;
  onToggleBottomNav?: (hide: boolean) => void;
  onOpenPastPlans?: () => void;
}

export const ProfileScreen = ({
  onLogout,
  setSelectedPlanId,
  setShowDepositModal,
  onToggleBottomNav,
  onOpenPastPlans,
}: ProfileScreenProps) => {
  const { userProfile, activeUserId, activeUserUuid, updateProfile, dbUsers, setDbUsers } = useProfileStore();
  const { friendCount } = useFriendshipStore();

  const currentUser = dbUsers.find(u => u.id === activeUserUuid || u.user_id === activeUserId);

  // Sub-sheet states for inline edit flows (Name, About, Friends, Past Plans, Logout)
  const [activeSheet, setActiveSheet] = useState<'pastPlans' | 'logout' | 'friends' | 'editName' | 'editAbout' | null>(null);

  // Keep footer navigation opening the main Profile page directly
  useEffect(() => {
    const handleProfileNavClick = () => {
      setActiveSheet(null);
    };
    const profileBtn = document.getElementById('nav_item_profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', handleProfileNavClick);
      return () => profileBtn.removeEventListener('click', handleProfileNavClick);
    }
  }, []);

  // Hide bottom navigation only when a modal/overlay sub-screen is actively open
  useEffect(() => {
    onToggleBottomNav?.(activeSheet !== null);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [activeSheet, onToggleBottomNav]);

  // Email calculation
  const emailDisplay = userProfile?.phone || (userProfile as any)?.email || currentUser?.email || "thilakasundar1311@gmail.com";

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full bg-black">
      {/* CORE SCROLLABLE PORT */}
      <div className="flex-1 overflow-y-auto scrollbar-none pb-28">
        <div className="w-full px-6 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] flex flex-col items-center">

          {/* LARGE CENTRED PROFILE PICTURE (Non-clickable static UI element) */}
          <div className="relative w-[136px] h-[136px] rounded-full mb-4 select-none">
            <UserAvatar
              src={userProfile?.avatar}
              alt={userProfile?.name || "User"}
              size="w-full h-full"
            />
          </div>

          {/* NAME AND BIO HEADER SECTIONS (Tappable to edit) */}
          <div className="text-center select-none max-w-[280px] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setActiveSheet('editName')}
              className="font-sans font-bold text-xl text-white tracking-wide hover:opacity-80 active:scale-[0.98] transition cursor-pointer"
            >
              {userProfile?.name || "User"}
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet('editAbout')}
              className="text-zinc-550 text-[13px] font-medium leading-relaxed mt-1.5 mb-5 font-sans hover:text-zinc-400 active:scale-[0.98] transition cursor-pointer"
            >
              {userProfile?.bio || "Always spontaneous, never planless."}
            </button>
          </div>

          {/* FRIENDS BUTTON */}
          <button
            type="button"
            onClick={() => setActiveSheet('friends')}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-zinc-900/70 border border-white/[0.05] hover:border-white/[0.10] hover:bg-zinc-900 transition active:scale-[0.97] cursor-pointer group select-none mb-6"
          >
            <Users className="w-4 h-4 text-zinc-400 group-hover:text-white transition" />
            <span className="font-sans font-semibold text-[13px] text-zinc-200">
              {friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}
            </span>
          </button>

          {/* PROFILE OPTIONS: Email, Past Plans, Logout */}
          <div className="w-full select-none space-y-3 text-left">

            {/* Email Option */}
            <div className="w-full flex items-start gap-4 px-1 py-1.5 rounded-xl hover:bg-zinc-900/20 transition text-left group">
              <div className="w-9 h-9 rounded-xl bg-zinc-900/60 border border-white/[0.02] flex items-center justify-center text-zinc-400 mt-0.5 transition group-hover:text-[#FF6B2C] group-hover:border-[#FF6B2C]/30 group-hover:shadow-[0_0_12px_rgba(255,107,44,0.15)] group-hover:bg-[#FF6B2C]/5 flex-shrink-0">
                <Mail className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="block text-[11px] font-sans font-medium text-zinc-500 uppercase tracking-wider">
                  Email
                </span>
                <span className="text-sm font-sans font-medium text-zinc-200 block mt-0.5 truncate">
                  {emailDisplay}
                </span>
              </div>
            </div>

            {/* Past Plans Option */}
            <button
              type="button"
              onClick={() => {
                if (onOpenPastPlans) {
                  onOpenPastPlans();
                } else {
                  setActiveSheet('pastPlans');
                }
              }}
              className="w-full flex items-center gap-4 px-1 py-2.5 rounded-xl hover:bg-zinc-900/20 active:scale-[0.99] transition text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-900/60 border border-white/[0.02] flex items-center justify-center text-zinc-400 transition group-hover:text-white flex-shrink-0">
                <History className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-sm font-sans font-medium text-zinc-200 block">
                  Past Plans
                </span>
              </div>
            </button>

            {/* Logout Option */}
            <button
              type="button"
              onClick={() => setActiveSheet('logout')}
              className="w-full flex items-center gap-4 px-1 py-2.5 rounded-xl hover:bg-zinc-900/20 active:scale-[0.99] transition text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-900/60 border border-white/[0.02] flex items-center justify-center text-zinc-400 transition group-hover:text-white flex-shrink-0">
                <LogOut className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-sm font-sans font-medium text-zinc-200 block">
                  Logout
                </span>
              </div>
            </button>

          </div>

        </div>
      </div>

      {/* --- MODALS & SUB-SCREENS --- */}
      <AnimatePresence>

        {/* 1. PAST PLANS SHEET */}
        {activeSheet === 'pastPlans' && (
          <PastPlans
            onBack={() => setActiveSheet(null)}
            setSelectedPlanId={(id) => {
              setSelectedPlanId(id);
              setActiveSheet(null);
            }}
          />
        )}

        {/* 2. LOGOUT MODAL OVERLAY */}
        {activeSheet === 'logout' && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6" onClick={() => setActiveSheet(null)}>
            <div
              className="w-full max-w-[280px] bg-[#0A0A0C] border border-white/10 rounded-2xl p-5 text-center shadow-2xl relative select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#FF4F00]/10 border border-[#FF4F00]/20 flex items-center justify-center text-[#FF4F00] mx-auto mb-3.5">
                <LogOut className="w-5 h-5 ml-0.5" />
              </div>

              <h3 className="font-sans font-bold text-base text-white mb-1.5">Sign Out?</h3>
              <p className="text-zinc-550 text-xs leading-normal mb-5">
                Are you sure you want to end your current spontaneous plan-making session?
              </p>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setActiveSheet(null)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/5 text-zinc-350 hover:text-white font-semibold text-xs tracking-wide transition active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setActiveSheet(null);
                    setTimeout(() => {
                      onLogout();
                    }, 500);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#D95A23] hover:bg-[#FF6B2C] text-white font-semibold text-xs tracking-wide transition active:scale-95 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. FRIENDS SCREEN */}
        {activeSheet === 'friends' && (
          <FriendshipsScreen onBack={() => setActiveSheet(null)} />
        )}

        {/* 4. EDIT NAME SCREEN */}
        {activeSheet === 'editName' && (
          <Name
            activeUserUuid={activeUserUuid}
            currentValue={userProfile?.name || ""}
            onBack={() => setActiveSheet(null)}
            onSaveSuccess={(newName) => {
              setDbUsers(prev => prev.map(u => u.id === activeUserUuid ? { ...u, full_name: newName } : u));
              if (userProfile) {
                updateProfile({ ...userProfile, name: newName });
              }
              setActiveSheet(null);
            }}
          />
        )}

        {/* 5. EDIT ABOUT SCREEN */}
        {activeSheet === 'editAbout' && (
          <About
            activeUserUuid={activeUserUuid}
            currentValue={userProfile?.bio || ""}
            onBack={() => setActiveSheet(null)}
            onSaveSuccess={(newBio) => {
              setDbUsers(prev => prev.map(u => u.id === activeUserUuid ? { ...u, bio: newBio } : u));
              if (userProfile) {
                updateProfile({ ...userProfile, bio: newBio });
              }
              setActiveSheet(null);
            }}
          />
        )}

      </AnimatePresence>

    </div>
  );
};
