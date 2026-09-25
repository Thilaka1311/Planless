import React, { useState, useEffect, useRef, useCallback } from "react";
import { OnboardingFlow } from "./features/auth/Logged Out/screens/OnboardingFlow";
import MainApp from "./MainApp";
import { UserProfile } from "./core/types";
import { SimulatorStatusBar } from "./components/SimulatorStatusBar";
import { SimulatorHomeBar } from "./components/SimulatorHomeBar";
import { PlansProvider } from "./features/plans/state/PlansContext";
import { ProfileProvider, useProfileStore } from "./features/profile/state/ProfileContext";
import { WalletProvider } from "./features/wallet/state/WalletContext";
import { ToastProvider } from "./shared/contexts/ToastContext";
import { FriendshipProvider } from "./features/friendships/state/FriendshipContext";
import { supabase } from "../lib/supabaseClient";
import defaultAvatar from "./assets/default_avatar.png";
import {
  extractInviteTokenFromPath,
  getStoredPendingInviteToken,
  setStoredPendingInviteToken,
  clearStoredPendingInviteToken,
} from "./features/plans/services/planInviteService";
import { PwaUpdatePrompt } from "./shared/pwa/PwaUpdatePrompt";

const WalletProviderComp = WalletProvider as React.ComponentType<{ children: React.ReactNode; userId?: string }>;
const PlansProviderComp = PlansProvider as React.ComponentType<{ children: React.ReactNode; userId?: string }>;

export default function App() {
  const query = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const sessionKey = query.get("session") || query.get("user") || "default";
  const localStorageKey = `planless_active_user_${sessionKey}`;

  // Detect /join/:token invite URLs and/or restore pending invite token from storage
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const tokenFromPath = extractInviteTokenFromPath(window.location.pathname);
    const storedToken = getStoredPendingInviteToken();
    console.log('[INVITE_TRACE] App.tsx useState init: pathname=', window.location.pathname, '| tokenFromPath=', tokenFromPath, '| storedToken=', storedToken);
    if (tokenFromPath) {
      setStoredPendingInviteToken(tokenFromPath);
      return tokenFromPath;
    }
    return storedToken;
  });

  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user_id) {
          return parsed;
        }
      } catch (e) {
        localStorage.removeItem(localStorageKey);
      }
    }
    return null;
  });

  const [isSimulatorMode, setIsSimulatorMode] = useState(true);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const minutes = now.getMinutes();
      const minStr = String(minutes).padStart(2, '0');
      setCurrentTime(`${hh}:${minStr}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 15000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize invite token if URL changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncTokenFromUrl = () => {
      const tokenFromPath = extractInviteTokenFromPath(window.location.pathname);
      if (tokenFromPath) {
        setStoredPendingInviteToken(tokenFromPath);
        setPendingInviteToken(tokenFromPath);
      }
    };
    window.addEventListener("popstate", syncTokenFromUrl);
    window.addEventListener("planless-navigation", syncTokenFromUrl);
    return () => {
      window.removeEventListener("popstate", syncTokenFromUrl);
      window.removeEventListener("planless-navigation", syncTokenFromUrl);
    };
  }, []);

  const handleProfileSync = useCallback(async (profile: UserProfile | null) => {
    if (profile) {
      localStorage.setItem(localStorageKey, JSON.stringify(profile));
    } else {
      localStorage.removeItem(localStorageKey);
    }
  }, [localStorageKey]);

  return (
    <ProfileProvider initialProfile={initialProfile} onProfileChange={handleProfileSync}>
      <AppContent
        isSimulatorMode={isSimulatorMode}
        setIsSimulatorMode={setIsSimulatorMode}
        currentTime={currentTime}
        localStorageKey={localStorageKey}
        pendingInviteToken={pendingInviteToken}
        setPendingInviteToken={setPendingInviteToken}
      />
    </ProfileProvider>
  );
}

function AppContent({
  isSimulatorMode,
  setIsSimulatorMode,
  currentTime,
  localStorageKey,
  pendingInviteToken,
  setPendingInviteToken,
}: {
  isSimulatorMode: boolean;
  setIsSimulatorMode: React.Dispatch<React.SetStateAction<boolean>>;
  currentTime: string;
  localStorageKey: string;
  pendingInviteToken: string | null;
  setPendingInviteToken: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { userProfile, setUserProfile } = useProfileStore();
  const [appState, setAppState] = useState<"initializing" | "unauthenticated" | "ready" | "startupError" | "retrying">("initializing");
  
  const isRestoringRef = useRef(false);
  const lastInitializedUserIdRef = useRef<string | null>(null);
  const currentSessionRef = useRef<any>(null);

  const restoreSessionAndProfile = useCallback(async (session: any) => {
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;
    currentSessionRef.current = session;
    try {
      const authUser = session.user;

      // Fetch profile from public.users
      let dbProfile = null;
      const { data: existingProfile, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (fetchError) {
        console.error("[App Startup] Failed to fetch profile due to server/network error:", fetchError);
        setAppState("startupError");
        return;
      }

      if (existingProfile) {
        dbProfile = existingProfile;
      } else {
        // Double-check that the auth user actually exists on the server before inserting public profile
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
          console.warn("[App Startup] Session references a non-existent auth user on the server (stale session):", userError?.message);
          await supabase.auth.signOut().catch(() => {});
          localStorage.removeItem(localStorageKey);
          currentSessionRef.current = null;
          lastInitializedUserIdRef.current = null;
          setUserProfile(null);
          setAppState("unauthenticated");
          return;
        }

        // Retrieve sequential public ID from the database RPC safely
        const { data: publicId, error: rpcError } = await supabase.rpc("generate_user_public_id");
        if (rpcError) {
          console.error("[App Startup] RPC generate_user_public_id failed:", rpcError);
          setAppState("startupError");
          return;
        }
        if (publicId) {
          const { data: newProfile, error: insertError } = await supabase
            .from("users")
            .upsert({
              id: authUser.id,
              public_id: publicId,
              full_name: "",
              profile_photo_path: null,
              bio: "",
              profile_completed: false
            }, { onConflict: "id", ignoreDuplicates: true })
            .select("*")
            .single();

          if (insertError) {
            // Foreign key violation (23503) on users_id_fkey means authUser.id does not exist in auth.users
            if (insertError.code === "23503") {
              console.warn("[App Startup] Foreign key violation (23503) on users_id_fkey: auth user not found in auth.users. Clearing stale session.");
              await supabase.auth.signOut().catch(() => {});
              localStorage.removeItem(localStorageKey);
              currentSessionRef.current = null;
              lastInitializedUserIdRef.current = null;
              setUserProfile(null);
              setAppState("unauthenticated");
              return;
            }

            console.error("[App Startup] Failed to create user profile row:", insertError);
            setAppState("startupError");
            return;
          }
          if (newProfile) {
            dbProfile = newProfile;
          }
        }
      }

      if (dbProfile) {
        const mappedProfile: UserProfile = {
          name: dbProfile.full_name,
          phone: authUser.email || "", // Email maps to phone/identifier in UI fallback
          bio: dbProfile.bio || "",
          avatar: dbProfile.profile_photo_path || defaultAvatar,
          joined: true,
          college_or_work: "SRM Chennai",
          user_id: dbProfile.public_id,
          dbUuid: dbProfile.id,
          token: session.access_token,
          profile_completed: dbProfile.profile_completed,
          role: dbProfile.role || "user",
        };
        setUserProfile(mappedProfile);
        localStorage.setItem(localStorageKey, JSON.stringify(mappedProfile));
        localStorage.removeItem("planless_active_tab");
        // Reset URL to /home so parseCurrentRoute() returns 'home' when MainApp mounts.
        // Without this, a stale URL like /profile would make MainApp open on the profile tab.
        if (typeof window !== "undefined" && window.location.pathname !== "/home" && window.location.pathname !== "/" && !window.location.pathname.startsWith("/join/")) {
          window.history.replaceState(null, "", "/home");
        }
        lastInitializedUserIdRef.current = authUser.id;
        const pathToken = typeof window !== "undefined" ? extractInviteTokenFromPath(window.location.pathname) : null;
        const storedToken = getStoredPendingInviteToken();
        const effectiveToken = pathToken || storedToken;
        console.log('[INVITE_TRACE] restoreSessionAndProfile: pathname=', window.location.pathname, '| pathToken=', pathToken, '| storedToken=', storedToken, '| effectiveToken=', effectiveToken);
        if (pathToken) {
          setStoredPendingInviteToken(pathToken);
        }
        if (effectiveToken) {
          console.log('[INVITE_TRACE] restoreSessionAndProfile: setting pendingInviteToken =', effectiveToken);
          setPendingInviteToken(effectiveToken);
        }
        console.log('[INVITE_TRACE] restoreSessionAndProfile: calling setAppState(ready), profile_completed=', dbProfile.profile_completed);
        setAppState(dbProfile.profile_completed ? "ready" : "unauthenticated");
      } else {
        setUserProfile(null);
        lastInitializedUserIdRef.current = null;
        setAppState("unauthenticated");
      }
    } catch (err) {
      console.error("[App Startup] Connection exception during session restore:", err);
      setAppState("startupError");
    } finally {
      isRestoringRef.current = false;
    }
  }, [setUserProfile, localStorageKey]);

  // Sync Supabase active session and database profile
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // If we are currently showing a startup error or retrying manually, do not auto-trigger
      if (appState === "startupError" || appState === "retrying") return;

      if (session && session.user) {
        if (isRestoringRef.current) return;
        if (lastInitializedUserIdRef.current === session.user.id && appState === "ready") return;

        restoreSessionAndProfile(session);
      } else {
        lastInitializedUserIdRef.current = null;
        setUserProfile(null);
        setAppState("unauthenticated");
        localStorage.removeItem(localStorageKey);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUserProfile, localStorageKey, restoreSessionAndProfile, appState]);

  const handleRetry = useCallback(async () => {
    if (isRestoringRef.current || appState === "retrying") return;
    setAppState("retrying");

    if (currentSessionRef.current) {
      await restoreSessionAndProfile(currentSessionRef.current);
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await restoreSessionAndProfile(session);
        } else {
          setAppState("unauthenticated");
        }
      } catch (err) {
        console.error("[App Startup] Failed to get session on manual retry:", err);
        setAppState("startupError");
      }
    }
  }, [restoreSessionAndProfile, appState]);

  const handleClearPendingInviteToken = useCallback(() => {
    setPendingInviteToken(null);
    clearStoredPendingInviteToken();
  }, [setPendingInviteToken]);

  const handleOnboardingComplete = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    localStorage.setItem(localStorageKey, JSON.stringify(newProfile));
    // Always start on Home after completing onboarding/login
    localStorage.removeItem("planless_active_tab");
    try {
      localStorage.removeItem("planless_onboarding_screen");
    } catch {}

    // Ensure any stored pending invite is active in state
    const storedToken = getStoredPendingInviteToken();
    console.log('[INVITE_TRACE] handleOnboardingComplete: storedToken=', storedToken);
    if (storedToken) {
      setPendingInviteToken(storedToken);
    }

    setAppState("ready");
  };

  const handleLogoutReset = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Failed to sign out via Supabase auth:", e);
    }
    setUserProfile(null);
    localStorage.removeItem(localStorageKey);
    localStorage.removeItem("planless_active_tab");
    try {
      localStorage.removeItem("planless_onboarding_screen");
    } catch {}
    // Reset URL to /home so that when MainApp remounts after next login,
    // parseCurrentRoute() returns 'home' instead of the stale previous tab URL.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/home");
    }
    setAppState("unauthenticated");
  };

  if (appState === "initializing" || appState === "retrying") {
    return (
      <div className="h-[100dvh] w-screen bg-[#050505] flex items-center justify-center font-sans relative overflow-hidden">
        {/* Sleek Gradient Glows */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#ff5e3a]/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
        
        <div className="flex flex-col items-center space-y-6 z-10">
          <h1 className="text-white text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
            Planless
          </h1>
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
          <p className="text-zinc-400 text-xs tracking-widest uppercase font-bold animate-pulse">
            {appState === "retrying" ? "Reconnecting..." : "Setting things up..."}
          </p>
        </div>
      </div>
    );
  }

  if (appState === "startupError") {
    return (
      <div className="h-[100dvh] w-screen bg-[#050505] flex items-center justify-center font-sans relative overflow-hidden p-6">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#ff5e3a]/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

        <div className="flex flex-col items-center space-y-6 z-10 max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#ff5e3a]">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-white text-xl font-bold tracking-tight">Unable to connect to Planless</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              We're having trouble reaching the server. Please try again.
            </p>
          </div>

          <div className="w-full flex flex-col space-y-2">
            <button
              type="button"
              onClick={handleRetry}
              className="w-full py-3.5 px-6 rounded-xl bg-[#ff5e3a] hover:bg-[#e05230] text-white font-semibold text-sm transition-all shadow-lg shadow-[#ff5e3a]/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleLogoutReset}
              className="w-full py-3 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-sm transition-all border border-zinc-800 active:scale-[0.98]"
            >
              Sign In with Another Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] flex flex-col font-sans selection:bg-[#ff5e3a]/35 overflow-hidden">
      <PwaUpdatePrompt />
      <div className="flex-1 w-full h-full z-10 overflow-hidden">
        {appState === "unauthenticated" ? (
          <PlansProviderComp key="plans-onboarding">
            <FriendshipProvider>
              <ToastProvider>
                <div className="w-full h-full bg-[#050505] flex flex-col relative">
                  <div className="flex-1 overflow-hidden relative">
                    <OnboardingFlow
                      onComplete={handleOnboardingComplete}
                      initialStep={(userProfile && lastInitializedUserIdRef.current) ? "PROFILE_SETUP" : "ENTRY"}
                      existingProfile={lastInitializedUserIdRef.current ? userProfile : null}
                    />
                  </div>
                </div>
              </ToastProvider>
            </FriendshipProvider>
          </PlansProviderComp>
        ) : (
          (() => {
            const providerKey = userProfile?.user_id || "anonymous";
            return (
              <WalletProviderComp key={`wallet-${providerKey}`} userId={userProfile?.dbUuid}>
                <PlansProviderComp key={`plans-${providerKey}`} userId={userProfile?.dbUuid}>
                  <FriendshipProvider>
                    <div className="flex flex-row items-stretch justify-center w-full h-full relative overflow-hidden">
                      {/* Responsive Container */}
                      <div className="w-full h-full bg-[#050505] flex flex-col relative">
                        <div className="flex-1 overflow-hidden relative">
                          <ToastProvider>
                            <MainApp
                              userProfile={userProfile!}
                              activeUserId={userProfile?.dbUuid || "U001"}
                              onLogout={handleLogoutReset}
                              pendingInviteToken={pendingInviteToken}
                              onClearPendingInvite={handleClearPendingInviteToken}
                            />
                          </ToastProvider>
                        </div>
                      </div>
                    </div>
                  </FriendshipProvider>
                </PlansProviderComp>
              </WalletProviderComp>
            );
          })()
        )}
      </div>
    </div>
  );
}

