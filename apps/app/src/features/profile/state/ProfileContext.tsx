import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";
import { UserProfile, User, DbFriendship } from "../../../core/types";
import { updateDbUser } from "../../../../lib/db";

interface ProfileState {
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  activeUserId: string;      // Short display identifier e.g. "U001" — for UI comparisons only
  activeUserUuid: string;    // Postgres UUID (users.id) — for all DB writes
  isAdmin: boolean;          // Derived: userProfile.role === 'admin'
  dbUsers: User[];
  setDbUsers: React.Dispatch<React.SetStateAction<User[]>>;
  updateProfile: (updated: UserProfile) => void;
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

  const onProfileChangeRef = React.useRef(onProfileChange);
  React.useEffect(() => {
    onProfileChangeRef.current = onProfileChange;
  }, [onProfileChange]);

  const setUserProfile = useCallback((newProfile: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => {
    setUserProfileState(prev => {
      const val = typeof newProfile === "function" ? newProfile(prev) : newProfile;
      if (onProfileChangeRef.current) onProfileChangeRef.current(val);
      return val;
    });
  }, []);

  const updateProfile = useCallback((updated: UserProfile) => {
    setUserProfile(updated);

    if (updated.dbUuid) {
      updateDbUser({
        id: updated.dbUuid,
        full_name: updated.name,
        bio: updated.bio || "",
        profile_photo: updated.avatar || "",
        college_or_work: updated.college_or_work || ""
      }).catch(err => {
        console.error("[ProfileContext] Failed to persist profile updates to DB:", err);
      });
    }

    setDbUsers(prev => prev.map(u => {
      if (u.id === updated.dbUuid || u.user_id === updated.user_id) {
        return {
          ...u,
          full_name: updated.name,
          bio: updated.bio || u.bio,
          college_or_work: updated.college_or_work || u.college_or_work,
          profile_photo: updated.avatar || u.profile_photo
        };
      }
      return u;
    }));
  }, [setUserProfile]);



  const activeUserId = userProfile?.dbUuid || (userProfile as any)?.id || "";
  const activeUserUuid = userProfile?.dbUuid || (userProfile as any)?.id || "";
  const isAdmin = userProfile?.role === "admin";

  const contextValue = useMemo(() => ({
    userProfile,
    setUserProfile,
    activeUserId,
    activeUserUuid,
    isAdmin,
    dbUsers,
    setDbUsers,
    updateProfile
  }), [
    userProfile,
    setUserProfile,
    activeUserId,
    activeUserUuid,
    isAdmin,
    dbUsers,
    updateProfile
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
