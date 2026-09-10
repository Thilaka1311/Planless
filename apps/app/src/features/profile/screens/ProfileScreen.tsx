import React, { useState, useEffect, useRef } from "react";
import {
  Mail,
  Users,
  LogOut,
  History,
  Camera,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProfileStore } from "../state/ProfileContext";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";
import { UserProfile } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { useProfileUpload } from "../hooks/useProfileUpload";
import { validateImageFile } from "../../../shared/imaging/imagePipeline";
import { FriendshipsScreen } from "../../friendships/screens/FriendshipsScreen";
import { Name } from "./Name";
import { About } from "./About";
import { PastPlans } from "./PastPlans";
import { PlanImageEditorModal } from "../../create/components/PlanImageEditorModal";

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
  const {
    userProfile,
    activeUserId,
    activeUserUuid,
    updateProfile,
    updateProfileName,
    updateProfileBio,
    updateProfileAvatar,
    dbUsers,
    setDbUsers
  } = useProfileStore();
  const { friendCount, incomingRequests } = useFriendshipStore();
  const hasIncomingRequests = incomingRequests && incomingRequests.length > 0;
  const { uploadImage, uploading: isUploadingAvatar, uploadError } = useProfileUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSeqRef = useRef(0);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Profile photo editor state
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);

  const currentUser = dbUsers.find(u => u.id === activeUserUuid || u.user_id === activeUserId);

  // Sub-sheet states for inline edit flows (Name, About, Friends, Past Plans, Logout)
  const [activeSheet, setActiveSheet] = useState<'pastPlans' | 'logout' | 'friends' | 'editName' | 'editAbout' | null>(null);

  // Step 1: User selects file from device -> open editor immediately if valid
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const validationErr = validateImageFile(file);
    if (validationErr) {
      setAvatarError(validationErr);
      return;
    }

    setAvatarError(null);
    setSelectedImageFile(file);
    setIsCropEditorOpen(true);
  };

  // Step 3: User confirms circular crop in PlanImageEditorModal -> upload & persist
  const handleSaveAvatarCrop = async ({
    blob,
    previewUrl,
  }: {
    previewUrl: string;
    blob: Blob;
    originalBlob: Blob | null;
    originalPreviewUrl: string;
    width: number;
    height: number;
  }) => {
    setIsCropEditorOpen(false);
    setSelectedImageFile(null);

    const currentSeq = ++uploadSeqRef.current;
    const prevAvatar = userProfile?.avatar || "";

    // 1. Update UI and local cache immediately (0ms optimistic latency)
    updateProfileAvatar(previewUrl);
    setAvatarError(null);

    try {
      // 2. Upload cropped WebP to Supabase Storage in background
      const storagePath = await uploadImage(blob, activeUserUuid);
      if (!storagePath) {
        throw new Error(uploadError || "Upload failed");
      }

      // If another upload started while this was in flight, do not overwrite with stale image
      if (currentSeq !== uploadSeqRef.current) {
        return;
      }

      // 3. Persist storage path in DB and bust cache
      await updateProfileAvatar(storagePath);
    } catch (err: any) {
      if (currentSeq !== uploadSeqRef.current) {
        return;
      }
      console.error("[ProfileScreen] Failed to save new avatar:", err);
      setAvatarError("Failed to update profile photo. Reverting...");
      if (prevAvatar) {
        updateProfileAvatar(prevAvatar);
      }
    }
  };

  // Keep footer navigation opening the main Profile page directly
  useEffect(() => {
    const handleProfileNavClick = () => {
      setActiveSheet(null);
      setIsCropEditorOpen(false);
    };
    const profileBtn = document.getElementById('nav_item_profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', handleProfileNavClick);
      return () => profileBtn.removeEventListener('click', handleProfileNavClick);
    }
  }, []);

  // Hide bottom navigation only when a modal/overlay sub-screen or crop editor is actively open
  useEffect(() => {
    onToggleBottomNav?.(activeSheet !== null || isCropEditorOpen);
    return () => {
      onToggleBottomNav?.(false);
    };
  }, [activeSheet, isCropEditorOpen, onToggleBottomNav]);

  // Email calculation
  const emailDisplay = userProfile?.phone || (userProfile as any)?.email || (currentUser as any)?.email || "thilakasundar1311@gmail.com";

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden h-full bg-black">
      {/* CORE SCROLLABLE PORT */}
      <div className="flex-1 overflow-y-auto scrollbar-none pb-28">
        <div className="w-full px-6 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] flex flex-col items-center">

          {/* LARGE CENTRED PROFILE PICTURE (Interactive with instant optimistic preview & camera badge) */}
          <div className="relative w-[136px] h-[136px] rounded-full mb-4 select-none group">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full rounded-full overflow-hidden cursor-pointer active:scale-[0.98] transition relative shadow-lg shadow-black/40 ring-2 ring-white/10 group-hover:ring-[#FF6B2C]/50"
              title="Change profile photo"
            >
              <UserAvatar
                src={userProfile?.avatar}
                alt={userProfile?.name || "User"}
                size="w-full h-full"
              />
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] rounded-full flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-[#FF6B2C] animate-spin" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-[#FF6B2C] hover:bg-[#FF8552] border-2 border-black flex items-center justify-center text-white shadow-xl transition active:scale-90 cursor-pointer group-hover:scale-105"
              aria-label="Change profile photo"
            >
              <Camera className="w-4 h-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFileSelect}
              className="hidden"
            />
          </div>

          {avatarError && (
            <div className="mb-3 px-3 py-1 rounded-lg bg-red-950/40 border border-red-500/20 text-red-400 text-xs flex items-center gap-1.5 animate-fade-in">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{avatarError}</span>
            </div>
          )}

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
            className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-zinc-900/70 border border-white/[0.05] hover:border-white/[0.10] hover:bg-zinc-900 transition active:scale-[0.97] cursor-pointer group select-none mb-6"
          >
            <Users className="w-4 h-4 text-zinc-400 group-hover:text-white transition" />
            <span className="font-sans font-semibold text-[13px] text-zinc-200">
              {friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}
            </span>
            {hasIncomingRequests && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#EF4444] ring-2 ring-black" />
            )}
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

        {/* 2. LOGOUT BOTTOM SHEET */}
        {activeSheet === 'logout' && (
          <>
            {/* Dimmed Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveSheet(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 pointer-events-auto"
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 w-full z-50 pointer-events-auto select-none"
              style={{
                background: "#1C1C1E",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "16px 20px 24px",
                boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.3)",
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="flex justify-center mb-4">
                <div
                  style={{
                    width: 36,
                    height: 5,
                    borderRadius: 2.5,
                    background: "rgba(255, 255, 255, 0.2)",
                  }}
                />
              </div>

              {/* Text Content */}
              <div className="mb-5">
                <h3 className="font-sans font-bold text-lg text-white mb-1 tracking-tight">
                  Log out?
                </h3>
                <p className="text-zinc-400 font-sans text-sm leading-normal">
                  Your plans will be here when you come back.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-center w-full pt-1">
                {/* Primary Action: Log out */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSheet(null);
                    setTimeout(() => {
                      onLogout();
                    }, 250);
                  }}
                  className="w-full h-12 rounded-xl text-center font-sans font-semibold text-[15px] text-white active:scale-[0.98] transition-transform cursor-pointer flex items-center justify-center border-none shadow-sm"
                  style={{ background: "#EF4444" }}
                >
                  Log out
                </button>

                {/* Secondary Action: Cancel */}
                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="w-full text-center font-sans font-medium text-[14px] text-white/40 hover:text-white/60 active:opacity-70 transition cursor-pointer"
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
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
              setActiveSheet(null);
              updateProfileName(newName).catch(err => {
                console.error("[ProfileScreen] Failed to save name:", err);
              });
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
              setActiveSheet(null);
              updateProfileBio(newBio).catch(err => {
                console.error("[ProfileScreen] Failed to save bio:", err);
              });
            }}
          />
        )}

      </AnimatePresence>

      {/* 6. PROFILE PHOTO CROP & MOVE EDITOR (Reusing PlanImageEditorModal with circular crop) */}
      <PlanImageEditorModal
        imageSrc={selectedImageFile}
        isOpen={isCropEditorOpen}
        cropShape="circle"
        title="Move and Scale"
        subtitle="Drag to position, pinch or slide to zoom"
        onClose={() => {
          setIsCropEditorOpen(false);
          setSelectedImageFile(null);
        }}
        onSave={handleSaveAvatarCrop}
      />

    </div>
  );
};
