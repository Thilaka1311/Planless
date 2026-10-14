import React, { useState, useEffect, useRef } from "react";
import {
  Mail,
  Users,
  LogOut,
  History,
  Camera,
  Loader2,
  AlertCircle,
  Bell,
  Share2,
  Smartphone
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
import { navigateToRoute, navigateBack, parseCurrentRoute, listenToNavigation } from "../../navigation/appRouter";
import { pwaManager } from "../../../shared/pwa/pwaService";
import { useToast } from "../../../shared/contexts/ToastContext";
import { supabase } from "../../../../lib/supabaseClient";

export type NotificationUiState =
  | 'unsupported'
  | 'ios_pwa_required'
  | 'permission_not_requested'
  | 'requesting_permission'
  | 'setting_up'
  | 'active'
  | 'denied'
  | 'failed'
  | 'disabled';

export const NOTIFICATION_STATUS_TEXT: Record<NotificationUiState, string> = {
  unsupported: 'Notifications unavailable in this browser',
  ios_pwa_required: 'Add to Home Screen required on iPhone',
  permission_not_requested: 'Tap to enable notifications',
  requesting_permission: 'Requesting permission…',
  setting_up: 'Setting up notifications…',
  active: 'On · Active on this device',
  denied: 'Blocked · Enable in browser settings',
  failed: 'Setup failed · Tap to retry',
  disabled: 'Off · Tap to enable',
};

interface ProfileScreenProps {
  onLogout: () => void;
  setSelectedPlanId: (planId: string | null) => void;
  setShowDepositModal: (show: boolean) => void;
  onToggleBottomNav?: (hide: boolean) => void;
  onOpenPastPlans?: () => void;
  onOpenFriends?: () => void;
  setSelectedPlanSource?: (source: string) => void;
}

export const ProfileScreen = ({
  onLogout,
  setSelectedPlanId,
  setShowDepositModal,
  onToggleBottomNav,
  onOpenPastPlans,
  onOpenFriends,
  setSelectedPlanSource,
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

  const { showToast } = useToast();
  const [notificationUiState, setNotificationUiState] = useState<NotificationUiState>(() => {
    if (pwaManager.isIosSafariWithoutPwa()) return 'ios_pwa_required';
    if (!pwaManager.isPushSupported()) return 'unsupported';
    const perm = pwaManager.getPushPermissionState();
    if (perm === 'denied') return 'denied';
    if (perm === 'default') return 'permission_not_requested';
    return 'disabled';
  });

  // Reconcile real permission and subscription state
  const reconcileNotificationState = async (skipIfBusy = true) => {
    if (skipIfBusy && (notificationUiState === 'requesting_permission' || notificationUiState === 'setting_up')) {
      return;
    }

    if (pwaManager.isIosSafariWithoutPwa()) {
      setNotificationUiState('ios_pwa_required');
      return;
    }

    if (!pwaManager.isPushSupported()) {
      setNotificationUiState('unsupported');
      return;
    }

    const perm = pwaManager.getPushPermissionState();
    if (perm === 'denied') {
      setNotificationUiState('denied');
      return;
    }

    if (perm === 'default') {
      setNotificationUiState('permission_not_requested');
      return;
    }

    // Permission is 'granted'. Verify actual browser subscription and Supabase persistence.
    const targetUid = activeUserUuid || activeUserId;
    const browserSub = await pwaManager.getActivePushSubscription();

    let dbHasActiveSub = false;
    if (targetUid && browserSub) {
      try {
        const { data: dbSubs } = await supabase
          .from('user_push_subscriptions')
          .select('id')
          .eq('user_id', targetUid)
          .eq('endpoint', browserSub.endpoint)
          .eq('is_active', true)
          .limit(1);

        if (dbSubs && dbSubs.length > 0) {
          dbHasActiveSub = true;
        }
      } catch {}
    }

    if (browserSub && dbHasActiveSub) {
      setNotificationUiState('active');
      return;
    }

    // If browser has an active subscription but database record is missing/inactive, attempt auto-sync
    if (targetUid && perm === 'granted') {
      try {
        const synced = await pwaManager.syncPushSubscription(targetUid);
        if (synced) {
          setNotificationUiState('active');
          return;
        }
      } catch {}
    }

    setNotificationUiState('disabled');
  };

  // Reconcile on mount and whenever the app regains focus or visibility
  useEffect(() => {
    reconcileNotificationState(false);

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        reconcileNotificationState(true);
      }
    };

    const handleFocus = () => {
      reconcileNotificationState(true);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    window.addEventListener('focus', handleFocus);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeUserUuid, activeUserId]);

  // Sub-sheet states for inline edit flows (Name, About, Friends, Past Plans, Logout, iOS PWA, Blocked Settings)
  const [activeSheet, setActiveSheet] = useState<
    'pastPlans' | 'logout' | 'friends' | 'editName' | 'editAbout' | 'iosPwaInstructions' | 'notificationsBlocked' | null
  >(() => {
    const route = parseCurrentRoute();
    if (route.subScreen === 'profile-name') return 'editName';
    if (route.subScreen === 'profile-about') return 'editAbout';
    return null;
  });

  const handleNotificationRowClick = async () => {
    if (notificationUiState === 'requesting_permission' || notificationUiState === 'setting_up') {
      return;
    }

    if (pwaManager.isIosSafariWithoutPwa()) {
      setActiveSheet('iosPwaInstructions');
      return;
    }

    if (!pwaManager.isPushSupported()) {
      showToast('Notifications are unavailable in this browser.', 'error');
      return;
    }

    const currentPerm = pwaManager.getPushPermissionState();
    if (currentPerm === 'denied' || notificationUiState === 'denied') {
      setActiveSheet('notificationsBlocked');
      return;
    }

    const targetUid = activeUserUuid || activeUserId;
    if (!targetUid) {
      showToast('Please sign in to manage notifications.', 'error');
      return;
    }

    // If notifications are active, allow disabling/pausing
    if (notificationUiState === 'active') {
      try {
        setNotificationUiState('disabled');
        await pwaManager.unsubscribeFromPush(targetUid);
        showToast('Notifications paused on this device.', 'info');
      } catch {
        showToast('Failed to pause notifications.', 'error');
        reconcileNotificationState(false);
      }
      return;
    }

    // Direct permission request from user interaction
    if (currentPerm === 'default') {
      setNotificationUiState('requesting_permission');
      let requestedPerm: NotificationPermission = 'default';
      try {
        requestedPerm = await Notification.requestPermission();
      } catch (e) {
        console.warn('[PWA] Error requesting permission:', e);
      }

      if (requestedPerm === 'denied') {
        setNotificationUiState('denied');
        setActiveSheet('notificationsBlocked');
        return;
      }

      if (requestedPerm !== 'granted') {
        setNotificationUiState('permission_not_requested');
        return;
      }
    }

    // Permission granted: register service worker, push subscription and Supabase persistence
    setNotificationUiState('setting_up');

    try {
      const res = await pwaManager.subscribeToPush(targetUid);
      if (res.success) {
        setNotificationUiState('active');
        showToast('Push notifications enabled!', 'success');
      } else if (res.requiresIosPwa) {
        setNotificationUiState('ios_pwa_required');
        setActiveSheet('iosPwaInstructions');
      } else if (res.permissionDenied) {
        setNotificationUiState('denied');
        setActiveSheet('notificationsBlocked');
      } else {
        setNotificationUiState('failed');
        showToast(res.error || 'Setup failed. Tap to retry.', 'error');
      }
    } catch (err: any) {
      setNotificationUiState('failed');
      showToast(err?.message || 'Error setting up notifications.', 'error');
    }
  };

  useEffect(() => {
    return listenToNavigation((route) => {
      if (route.subScreen === 'profile-name') {
        setActiveSheet('editName');
      } else if (route.subScreen === 'profile-about') {
        setActiveSheet('editAbout');
      } else if (activeSheet === 'editName' || activeSheet === 'editAbout') {
        setActiveSheet(null);
      }
    });
  }, [activeSheet]);

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
              onClick={() => {
                setActiveSheet('editName');
                navigateToRoute({ tab: 'profile', subScreen: 'profile-name' });
              }}
              className="font-sans font-bold text-xl text-white tracking-wide hover:opacity-80 active:scale-[0.98] transition cursor-pointer"
            >
              {userProfile?.name || "User"}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSheet('editAbout');
                navigateToRoute({ tab: 'profile', subScreen: 'profile-about' });
              }}
              className="text-zinc-550 text-[13px] font-medium leading-relaxed mt-1.5 mb-5 font-sans hover:text-zinc-400 active:scale-[0.98] transition cursor-pointer"
            >
              {userProfile?.bio || "Always spontaneous, never planless."}
            </button>
          </div>

          {/* FRIENDS BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (onOpenFriends) {
                onOpenFriends();
              } else {
                setActiveSheet('friends');
              }
            }}
            className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-zinc-900/70 border border-white/[0.05] hover:border-white/[0.10] hover:bg-zinc-900 transition active:scale-[0.97] cursor-pointer group select-none mb-6"
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

            {/* Single Interactive Notifications Row */}
            <button
              type="button"
              id="profile_notifications_row"
              onClick={handleNotificationRowClick}
              disabled={notificationUiState === 'requesting_permission' || notificationUiState === 'setting_up'}
              className="w-full flex items-center justify-between gap-4 px-1 py-2.5 rounded-xl hover:bg-zinc-900/20 transition text-left group cursor-pointer bg-transparent border-none outline-none active:scale-[0.99] transition-transform disabled:opacity-75 disabled:cursor-wait"
              aria-label={`Notifications: ${NOTIFICATION_STATUS_TEXT[notificationUiState]}`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-xl bg-zinc-900/60 border border-white/[0.02] flex items-center justify-center transition flex-shrink-0 ${
                  notificationUiState === 'active'
                    ? 'text-emerald-400 group-hover:text-emerald-300'
                    : 'text-zinc-400 group-hover:text-white'
                }`}>
                  {notificationUiState === 'requesting_permission' || notificationUiState === 'setting_up' ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Bell className="w-4.5 h-4.5" />
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-sans font-medium text-zinc-200 block">
                    Notifications
                  </span>
                  <span className="text-[11px] font-sans text-zinc-500 block truncate">
                    {NOTIFICATION_STATUS_TEXT[notificationUiState]}
                  </span>
                </div>
              </div>

              {/* Clear Enabled/Disabled Status Indicator */}
              <div className="shrink-0 flex items-center">
                {notificationUiState === 'active' ? (
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    ON
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/[0.04]">
                    OFF
                  </span>
                )}
              </div>
            </button>


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
              setSelectedPlanSource?.("past_plans");
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

        {/* 3. FRIENDS SCREEN (Fallback if onOpenFriends not provided) */}
        {activeSheet === 'friends' && (
          <FriendshipsScreen onBack={() => setActiveSheet(null)} />
        )}

        {/* 4. EDIT NAME SCREEN */}
        {activeSheet === 'editName' && (
          <Name
            activeUserUuid={activeUserUuid}
            currentValue={userProfile?.name || ""}
            onBack={() => {
              setActiveSheet(null);
              navigateBack({ tab: 'profile' });
            }}
            onSaveSuccess={(newName) => {
              setActiveSheet(null);
              navigateBack({ tab: 'profile' });
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
            onBack={() => {
              setActiveSheet(null);
              navigateBack({ tab: 'profile' });
            }}
            onSaveSuccess={(newBio) => {
              setActiveSheet(null);
              navigateBack({ tab: 'profile' });
              updateProfileBio(newBio).catch(err => {
                console.error("[ProfileScreen] Failed to save bio:", err);
              });
            }}
          />
        )}

        {/* 6. IOS PWA INSTRUCTIONS SHEET */}
        {activeSheet === 'iosPwaInstructions' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveSheet(null)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 w-full z-50 pointer-events-auto select-none"
              style={{
                background: "#18181B",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "16px 20px 24px",
                boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.4)",
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
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

              <div className="mb-5 text-left">
                <div className="w-10 h-10 rounded-2xl bg-[#FF6B2C]/10 border border-[#FF6B2C]/20 flex items-center justify-center text-[#FF6B2C] mb-3">
                  <Bell className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-bold text-lg text-white mb-1 tracking-tight">
                  Enable Lock Screen Alerts
                </h3>
                <p className="text-zinc-400 font-sans text-xs leading-relaxed">
                  On iPhone, Apple requires Planless to be on your Home Screen to receive alerts when the app is closed.
                </p>
              </div>

              <div className="space-y-3 mb-6 text-left">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-[#FF6B2C] shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs font-sans text-zinc-300 leading-normal">
                    Tap the <span className="text-white font-medium">Share</span> button in Safari's bottom navigation bar.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-[#FF6B2C] shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs font-sans text-zinc-300 leading-normal">
                    Scroll down and tap <span className="text-white font-medium">Add to Home Screen</span>.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-[#FF6B2C] shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs font-sans text-zinc-300 leading-normal">
                    Open Planless from your Home Screen and tap <span className="text-white font-medium">Enable Notifications</span>.
                  </div>
                </div>
              </div>

              <button
                type="button"
                id="btn_dismiss_ios_pwa_sheet"
                onClick={() => setActiveSheet(null)}
                className="w-full py-3.5 rounded-xl font-sans font-semibold text-sm text-black bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-[0.98] transition cursor-pointer"
              >
                Got it
              </button>
            </motion.div>
          </>
        )}

        {/* 7. NOTIFICATIONS BLOCKED INSTRUCTIONS SHEET */}
        {activeSheet === 'notificationsBlocked' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveSheet(null)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 w-full z-50 pointer-events-auto select-none"
              style={{
                background: "#18181B",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "16px 20px 24px",
                boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.4)",
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
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

              <div className="mb-5 text-left">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-bold text-lg text-white mb-1 tracking-tight">
                  Enable in Browser Settings
                </h3>
                <p className="text-zinc-400 font-sans text-xs leading-relaxed">
                  Notifications are blocked for Planless in this browser. You can re-enable them in your device settings.
                </p>
              </div>

              {pwaManager.getDevicePlatform() === 'android' ? (
                <div className="space-y-3 mb-6 text-left">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Tap the <span className="text-white font-medium">Page Info / Lock icon</span> in Chrome's top address bar.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Tap <span className="text-white font-medium">Permissions</span> or <span className="text-white font-medium">Site settings</span>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Select <span className="text-white font-medium">Notifications</span> and set to <span className="text-white font-medium">Allow</span>, then return to Planless.
                    </div>
                  </div>
                </div>
              ) : pwaManager.getDevicePlatform() === 'ios' ? (
                <div className="space-y-3 mb-6 text-left">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Open the <span className="text-white font-medium">Settings</span> app on your iPhone or iPad.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Tap <span className="text-white font-medium">Notifications</span> and select <span className="text-white font-medium">Planless</span>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Turn on <span className="text-white font-medium">Allow Notifications</span>, then switch back to Planless.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mb-6 text-left">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Click the <span className="text-white font-medium">Site settings or padlock icon</span> beside the address bar URL.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Change <span className="text-white font-medium">Notifications</span> permission from Block to <span className="text-white font-medium">Allow</span>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-amber-400 shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs font-sans text-zinc-300 leading-normal">
                      Reload this page or return to the app to activate alerts.
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                id="btn_dismiss_blocked_notifications_sheet"
                onClick={() => {
                  setActiveSheet(null);
                  reconcileNotificationState(false);
                }}
                className="w-full py-3.5 rounded-xl font-sans font-semibold text-sm text-black bg-white hover:bg-zinc-200 active:scale-[0.98] transition cursor-pointer"
              >
                Got it
              </button>
            </motion.div>
          </>
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
