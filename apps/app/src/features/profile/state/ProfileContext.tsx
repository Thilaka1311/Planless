import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from "react";
import { UserProfile, User, DbFriendship } from "../../../core/types";
import { updateDbUser } from "../../../../lib/db";
import { supabase } from "../../../../lib/supabaseClient";
import { evictImageCache, ImageType } from "../../../shared/imaging/imageResolver";

interface ProfileState {
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  activeUserId: string;      // Short display identifier e.g. "U001" — for UI comparisons only
  activeUserUuid: string;    // Postgres UUID (users.id) — for all DB writes
  isAdmin: boolean;          // Derived: userProfile.role === 'admin'
  dbUsers: User[];
  setDbUsers: React.Dispatch<React.SetStateAction<User[]>>;
  updateProfile: (updated: UserProfile) => Promise<void>;
  updateProfileName: (name: string) => Promise<boolean>;
  updateProfileBio: (bio: string) => Promise<boolean>;
  updateProfileAvatar: (avatarPath: string) => Promise<boolean>;
}

const ProfileContext = createContext<ProfileState | undefined>(undefined);

export const ProfileProvider = ({
  children,
  initialProfile,
  onProfileChange
}: {
  children: ReactNode;
  initialProfile: UserProfile | null;
  onProfileChange?: (profile: UserProfile | null) => void;
}) => {
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(initialProfile);
  const [dbUsers, setDbUsers] = useState<User[]>(() => {
    if (initialProfile) {
      return [{
        id: initialProfile.dbUuid,
        user_id: initialProfile.user_id || "U001",
        username: initialProfile.name.toLowerCase().replace(/\s+/g, "") || "thilak",
        full_name: initialProfile.name,
        phone_number: initialProfile.phone,
        profile_photo: initialProfile.avatar,
        bio: initialProfile.bio || "Always spontaneous, never planless.",
        college_or_work: initialProfile.college_or_work || "SRM Chennai",
        created_at: new Date().toISOString(),
        wallet_balance: 0,
        active_status: true,
      }];
    }
    return [];
  });

  const onProfileChangeRef = useRef(onProfileChange);
  useEffect(() => {
    onProfileChangeRef.current = onProfileChange;
  }, [onProfileChange]);

  // Keep internal state in sync if initialProfile changes from props (e.g. session restoration)
  useEffect(() => {
    if (initialProfile) {
      setUserProfileState(prev => {
        if (!prev) return initialProfile;
        // Avoid overwriting with stale initialProfile if user already modified state
        return prev;
      });
    }
  }, [initialProfile]);

  const setUserProfile = useCallback((newProfile: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => {
    setUserProfileState(prev => {
      const val = typeof newProfile === "function" ? newProfile(prev) : newProfile;
      if (onProfileChangeRef.current) onProfileChangeRef.current(val);
      return val;
    });
  }, []);

  const activeUserId = userProfile?.dbUuid || (userProfile as any)?.id || userProfile?.user_id || "";
  const activeUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || userProfile?.user_id || "";
  const isAdmin = userProfile?.role === "admin";

  // References for optimistic updates and rollback
  const profileRef = useRef(userProfile);
  profileRef.current = userProfile;
  const dbUsersRef = useRef(dbUsers);
  dbUsersRef.current = dbUsers;

  /**
   * Optimistically update the user's name:
   * 1. Updates local cache and UI immediately (0ms).
   * 2. Persists to Supabase in background.
   * 3. Rolls back immediately on network/DB failure.
   */
  const updateProfileName = useCallback(async (newName: string): Promise<boolean> => {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Name cannot be empty");

    const previousProfile = profileRef.current;
    const previousDbUsers = dbUsersRef.current;

    if (previousProfile) {
      setUserProfile({ ...previousProfile, name: trimmed });
    }

    setDbUsers(prev => prev.map(u => {
      if (u.id === activeUserUuid || u.user_id === activeUserId) {
        return { ...u, full_name: trimmed };
      }
      return u;
    }));

    try {
      const { error } = await supabase
        .from("users")
        .update({ full_name: trimmed })
        .eq("id", activeUserUuid);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("[ProfileContext] Failed to persist name update, rolling back:", err);
      if (previousProfile) setUserProfile(previousProfile);
      setDbUsers(previousDbUsers);
      throw err;
    }
  }, [activeUserUuid, activeUserId, setUserProfile]);

  /**
   * Optimistically update the user's bio/about:
   * 1. Updates local cache and UI immediately (0ms).
   * 2. Persists to Supabase in background.
   * 3. Rolls back immediately on network/DB failure.
   */
  const updateProfileBio = useCallback(async (newBio: string): Promise<boolean> => {
    const trimmed = newBio.trim();
    const previousProfile = profileRef.current;
    const previousDbUsers = dbUsersRef.current;

    if (previousProfile) {
      setUserProfile({ ...previousProfile, bio: trimmed });
    }

    setDbUsers(prev => prev.map(u => {
      if (u.id === activeUserUuid || u.user_id === activeUserId) {
        return { ...u, bio: trimmed };
      }
      return u;
    }));

    try {
      const { error } = await supabase
        .from("users")
        .update({ bio: trimmed })
        .eq("id", activeUserUuid);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("[ProfileContext] Failed to persist bio update, rolling back:", err);
      if (previousProfile) setUserProfile(previousProfile);
      setDbUsers(previousDbUsers);
      throw err;
    }
  }, [activeUserUuid, activeUserId, setUserProfile]);

  /**
   * Optimistically update the user's avatar:
   * 1. Invalidates avatar cache and updates UI immediately (0ms).
   * 2. Persists to Supabase in background.
   * 3. Rolls back immediately on network/DB failure.
   */
  const updateProfileAvatar = useCallback(async (avatarPath: string): Promise<boolean> => {
    const previousProfile = profileRef.current;
    const previousDbUsers = dbUsersRef.current;

    // Invalidate caches
    evictImageCache(avatarPath, ImageType.Avatar);
    if (previousProfile?.avatar) {
      evictImageCache(previousProfile.avatar, ImageType.Avatar);
    }

    if (previousProfile) {
      setUserProfile({ ...previousProfile, avatar: avatarPath });
    }

    setDbUsers(prev => prev.map(u => {
      if (u.id === activeUserUuid || u.user_id === activeUserId) {
        return {
          ...u,
          profile_photo: avatarPath,
          profile_photo_path: avatarPath
        };
      }
      return u;
    }));

    // If it's a blob preview URL, don't persist to DB yet (the caller will call after storage upload)
    if (avatarPath.startsWith("blob:") || avatarPath.startsWith("data:")) {
      return true;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({ profile_photo_path: avatarPath })
        .eq("id", activeUserUuid);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("[ProfileContext] Failed to persist avatar update, rolling back:", err);
      if (previousProfile) {
        setUserProfile(previousProfile);
        if (previousProfile.avatar) evictImageCache(previousProfile.avatar, ImageType.Avatar);
      }
      setDbUsers(previousDbUsers);
      throw err;
    }
  }, [activeUserUuid, activeUserId, setUserProfile]);

  /**
   * General profile update with optimistic updates & rollback on DB error
   */
  const updateProfile = useCallback(async (updated: UserProfile) => {
    const previousProfile = profileRef.current;
    const previousDbUsers = dbUsersRef.current;

    setUserProfile(updated);

    if (updated.avatar && previousProfile?.avatar !== updated.avatar) {
      evictImageCache(updated.avatar, ImageType.Avatar);
    }

    setDbUsers(prev => prev.map(u => {
      if (u.id === updated.dbUuid || u.user_id === updated.user_id) {
        return {
          ...u,
          full_name: updated.name,
          bio: updated.bio || u.bio,
          college_or_work: updated.college_or_work || u.college_or_work,
          profile_photo: updated.avatar || u.profile_photo,
          profile_photo_path: updated.avatar || u.profile_photo_path
        };
      }
      return u;
    }));

    if (updated.dbUuid) {
      try {
        await updateDbUser({
          id: updated.dbUuid,
          full_name: updated.name,
          bio: updated.bio || "",
          profile_photo: updated.avatar || "",
          college_or_work: updated.college_or_work || ""
        });
      } catch (err) {
        console.error("[ProfileContext] Failed to persist profile updates to DB, rolling back:", err);
        if (previousProfile) setUserProfile(previousProfile);
        setDbUsers(previousDbUsers);
        throw err;
      }
    }
  }, [setUserProfile]);

  // Realtime subscription on users table
  useEffect(() => {
    if (!activeUserUuid) return;

    const channel = supabase
      .channel(`profile-users-realtime-${activeUserUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users"
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          if (!newRow && !oldRow) return;

          const rowId = newRow?.id || oldRow?.id;
          if (!rowId) return;

          // Reconcile active user profile if this event targets activeUserUuid
          if (rowId === activeUserUuid) {
            if (payload.eventType === "DELETE") return;

            const updatedName = newRow.full_name;
            const updatedBio = newRow.bio;
            const updatedPhoto = newRow.profile_photo_path;

            // When photo is updated, always evict image cache so any client viewing this canonical path re-renders with ?v=...
            if (updatedPhoto) {
              evictImageCache(updatedPhoto, ImageType.Avatar);
            }

            setUserProfileState(prev => {
              if (!prev) return prev;
              const nameChanged = updatedName !== undefined && updatedName !== prev.name;
              const bioChanged = updatedBio !== undefined && updatedBio !== prev.bio;
              const avatarChanged = updatedPhoto !== undefined && updatedPhoto !== prev.avatar;

              // Deduplicate: If state already reflects incoming data (optimistic update), bail out to prevent flicker
              if (!nameChanged && !bioChanged && !avatarChanged) {
                return prev;
              }

              const nextProfile: UserProfile = {
                ...prev,
                name: updatedName !== undefined ? updatedName : prev.name,
                bio: updatedBio !== undefined ? updatedBio : prev.bio,
                avatar: updatedPhoto !== undefined ? updatedPhoto : prev.avatar
              };

              if (onProfileChangeRef.current) {
                onProfileChangeRef.current(nextProfile);
              }
              return nextProfile;
            });
          }

          // Reconcile dbUsers list
          setDbUsers(prev => {
            const index = prev.findIndex(u => u.id === rowId);

            if (payload.eventType === "DELETE") {
              if (index === -1) return prev;
              return prev.filter(u => u.id !== rowId);
            }

            if (index === -1) {
              const newUser: User = {
                id: newRow.id,
                user_id: newRow.public_id || newRow.user_id || "U001",
                username: newRow.username || "",
                full_name: newRow.full_name || "",
                phone_number: newRow.phone_number || newRow.phone || "",
                profile_photo: newRow.profile_photo_path || "",
                profile_photo_path: newRow.profile_photo_path || "",
                bio: newRow.bio || "",
                college_or_work: newRow.college_or_work || "",
                created_at: newRow.created_at || new Date().toISOString(),
                wallet_balance: newRow.wallet_balance || 0,
                active_status: newRow.active_status ?? true,
                friends: newRow.friends,
                profile_completed: newRow.profile_completed
              };
              return [...prev, newUser];
            }

            const existing = prev[index];
            const updatedUser: User = {
              ...existing,
              full_name: newRow.full_name ?? existing.full_name,
              bio: newRow.bio ?? existing.bio,
              profile_photo: newRow.profile_photo_path ?? existing.profile_photo,
              profile_photo_path: newRow.profile_photo_path ?? existing.profile_photo_path,
              username: newRow.username ?? existing.username,
              friends: newRow.friends ?? existing.friends,
              profile_completed: newRow.profile_completed ?? existing.profile_completed
            };

            // Deduplicate: Don't create a new array reference if no values changed
            if (
              existing.full_name === updatedUser.full_name &&
              existing.bio === updatedUser.bio &&
              existing.profile_photo === updatedUser.profile_photo &&
              existing.profile_photo_path === updatedUser.profile_photo_path &&
              existing.friends === updatedUser.friends &&
              existing.username === updatedUser.username
            ) {
              return prev;
            }

            const updatedList = [...prev];
            updatedList[index] = updatedUser;
            return updatedList;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserUuid]);

  const contextValue = useMemo(() => ({
    userProfile,
    setUserProfile,
    activeUserId,
    activeUserUuid,
    isAdmin,
    dbUsers,
    setDbUsers,
    updateProfile,
    updateProfileName,
    updateProfileBio,
    updateProfileAvatar
  }), [
    userProfile,
    setUserProfile,
    activeUserId,
    activeUserUuid,
    isAdmin,
    dbUsers,
    updateProfile,
    updateProfileName,
    updateProfileBio,
    updateProfileAvatar
  ]);

  return (
    <ProfileContext.Provider value={contextValue}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfileStore = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfileStore must be used within a ProfileProvider");
  }
  return context;
};

