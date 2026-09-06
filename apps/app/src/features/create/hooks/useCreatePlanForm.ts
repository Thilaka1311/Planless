import { useState, useEffect, useMemo, useCallback } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";
import {
  getSavedCreatePlanDraft,
  saveCreatePlanDraft,
  clearCreatePlanDraft,
} from "../utils/draftParticipantStorage";
import {
  saveDraftCoverBlob,
  getDraftCoverBlob,
  clearDraftCoverBlob,
} from "../utils/draftCoverStorage";

export function useCreatePlanForm() {
  const { userProfile } = useProfileStore();
  const { friends } = useFriendshipStore();
  const activeUserId = userProfile?.dbUuid || "";

  // Load initial draft synchronously for seamless refresh restoration
  const initialDraft = useMemo(() => getSavedCreatePlanDraft(), []);

  // Form inputs
  const [localLocation, setLocalLocation] = useState(() => initialDraft?.localLocation || '');
  const [eventDateTime, setEventDateTime] = useState<Date>(() => {
    if (initialDraft?.eventDateTime) {
      const d = new Date(initialDraft.eventDateTime);
      if (!isNaN(d.getTime())) return d;
    }
    const now = new Date();
    return new Date(now.getTime() + 60 * 60 * 1000);
  });
  const [isDateManuallySet, setIsDateManuallySet] = useState(() => initialDraft?.isDateManuallySet ?? false);
  const [searchPeopleQuery, setSearchPeopleQuery] = useState('');
  const [individuallySelectedFriendIds, setIndividuallySelectedFriendIds] = useState<string[]>(
    () => initialDraft?.individuallySelectedFriendIds || []
  );
  const [selectedFriends, setSelectedFriends] = useState<any[]>(
    () => initialDraft?.selectedFriends || []
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(() => initialDraft?.waitlistEnabled ?? false);
  const [totalCapacity, setTotalCapacity] = useState<number | undefined>(
    () => initialDraft?.totalCapacity
  );
  const [isCapacityManuallySet, setIsCapacityManuallySet] = useState(
    () => initialDraft?.isCapacityManuallySet ?? false
  );
  const [rsvpDeadline, setRsvpDeadline] = useState<string | null>(
    () => initialDraft?.rsvpDeadline || null
  );
  const [customDeadline, setCustomDeadline] = useState<Date>(() => {
    if (initialDraft?.customDeadline) {
      const d = new Date(initialDraft.customDeadline);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [costAmount, setCostAmount] = useState(() => initialDraft?.costAmount ?? 0);
  const [isCostManuallySet, setIsCostManuallySet] = useState(() => initialDraft?.isCostManuallySet ?? false);
  const [quickNote, setQuickNote] = useState(() => initialDraft?.quickNote || '');
  const [localTitle, setLocalTitle] = useState(() => initialDraft?.localTitle || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(
    () => initialDraft?.customCoverImage || null
  );
  const [customCoverBlob, setCustomCoverBlob] = useState<Blob | null>(null);

  const handleSetCustomCover = useCallback((previewUrl: string | null, blob?: Blob | null) => {
    setCustomCoverImage((prev) => {
      if (prev && prev.startsWith("blob:") && prev !== previewUrl) {
        URL.revokeObjectURL(prev);
      }
      return previewUrl;
    });
    setCustomCoverBlob(blob || null);

    if (blob) {
      saveDraftCoverBlob(blob).catch(() => {});
    } else if (previewUrl === null) {
      clearDraftCoverBlob().catch(() => {});
    }
  }, []);

  // Restore custom cover blob from IndexedDB on startup if persisted in draft
  useEffect(() => {
    let isMounted = true;
    if (initialDraft?.customCoverImage === 'custom_draft_blob') {
      getDraftCoverBlob().then((blob) => {
        if (!isMounted || !blob) return;
        const objectUrl = URL.createObjectURL(blob);
        setCustomCoverImage(objectUrl);
        setCustomCoverBlob(blob);
      }).catch((err) => {
        console.warn('[useCreatePlanForm] Failed to restore draft cover blob:', err);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [initialDraft]);

  const [isHostSelected, setIsHostSelected] = useState(() => initialDraft?.isHostSelected ?? true);
  const [priorityGuestIds, setPriorityGuestIds] = useState<string[]>(
    () => initialDraft?.priorityGuestIds || []
  );
  const [discoveryItemId, setDiscoveryItemId] = useState<string | null>(
    () => initialDraft?.discoveryItemId || null
  );
  const [waitlistMode, setWaitlistMode] = useState<'automatic' | 'assigned'>(
    () => initialDraft?.waitlistMode || 'automatic'
  );

  // Google Maps resolved details
  const [placeId, setPlaceId] = useState<string | null>(() => initialDraft?.placeId || null);
  const [latitude, setLatitude] = useState<number | null>(() => initialDraft?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(() => initialDraft?.longitude ?? null);
  const [placeAddress, setPlaceAddress] = useState<string | null>(() => initialDraft?.placeAddress || null);

  // Reconcile and enrich selectedFriends with latest profile data when friendship store loads from Supabase
  useEffect(() => {
    if (!friends || friends.length === 0) return;

    const friendsById = new Map<string, any>();
    friends.forEach((fr) => {
      if (fr.friend) {
        friendsById.set(fr.friend.id, fr.friend);
      }
    });

    setSelectedFriends((prev) => {
      if (prev.length === 0) {
        if (
          initialDraft &&
          Array.isArray(initialDraft.individuallySelectedFriendIds) &&
          initialDraft.individuallySelectedFriendIds.length > 0
        ) {
          const mapped = initialDraft.individuallySelectedFriendIds
            .map((id) => {
              const u = friendsById.get(id);
              if (!u) return null;
              return {
                id: u.id,
                dbUuid: u.id,
                name: u.full_name,
                username: u.username,
                avatar: u.profile_photo || '',
              };
            })
            .filter(Boolean);
          if (mapped.length > 0) {
            setIndividuallySelectedFriendIds(mapped.map((f: any) => f.id));
            return mapped;
          }
        }
        return prev;
      }

      // Enrich existing selected friends with fresh profile data, strictly preserving current order
      return prev.map((sf) => {
        const u = friendsById.get(sf.id) || friendsById.get(sf.dbUuid);
        if (u) {
          return {
            ...sf,
            name: u.full_name || sf.name,
            username: u.username || sf.username,
            avatar: u.profile_photo || sf.avatar,
          };
        }
        return sf;
      });
    });
  }, [friends, initialDraft]);

  // Continuously persist unsaved form fields to draft storage
  useEffect(() => {
    saveCreatePlanDraft({
      localTitle,
      localLocation,
      quickNote,
      costAmount,
      isCostManuallySet,
      eventDateTime: eventDateTime.toISOString(),
      isDateManuallySet,
      rsvpDeadline,
      customDeadline: customDeadline.toISOString(),
      placeId,
      latitude,
      longitude,
      placeAddress,
      discoveryItemId,
      customCoverImage,
      totalCapacity,
      isCapacityManuallySet,
      waitlistEnabled,
      waitlistMode,
      isHostSelected,
      individuallySelectedFriendIds,
      selectedFriends,
      priorityGuestIds,
    });
  }, [
    localTitle,
    localLocation,
    quickNote,
    costAmount,
    isCostManuallySet,
    eventDateTime,
    isDateManuallySet,
    rsvpDeadline,
    customDeadline,
    placeId,
    latitude,
    longitude,
    placeAddress,
    discoveryItemId,
    customCoverImage,
    totalCapacity,
    isCapacityManuallySet,
    waitlistEnabled,
    waitlistMode,
    isHostSelected,
    individuallySelectedFriendIds,
    selectedFriends,
    priorityGuestIds,
  ]);

  const AVAILABLE_FRIENDS = useMemo(() => {
    return friends
      .map((f) => {
        const u = f.friend;
        if (!u) return null;
        return {
          id: u.id || "",
          dbUuid: u.id,
          name: u.full_name,
          username: u.username,
          avatar: u.profile_photo || ""
        };
      })
      .filter(Boolean);
  }, [friends]);

  const totalInvitedCount = selectedFriends.length;

  // Derived: waitlistCapacity is the non-host capacity
  const waitlistCapacity = totalCapacity ? Math.max(0, totalCapacity - 1) : 0;

  const handleSetTotalCapacity = useCallback((val: number) => {
    setTotalCapacity(val);
    setIsCapacityManuallySet(true);
  }, []);

  const handleSetSelectedFriends = useCallback((updater: any[] | ((prev: any[]) => any[])) => {
    setSelectedFriends((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const ids = next.map((f: any) => f.id || f.dbUuid).filter(Boolean);
      setIndividuallySelectedFriendIds(ids);
      return next;
    });
  }, []);

  const toggleFriendSelection = useCallback((friend: any) => {
    const friendId = friend.id || friend.dbUuid;
    if (!friendId) return;

    setSelectedFriends((prev) => {
      const exists = prev.some((f) => (f.id || f.dbUuid) === friendId);
      const next = exists
        ? prev.filter((f) => (f.id || f.dbUuid) !== friendId)
        : [
            ...prev,
            {
              id: friend.id || friend.dbUuid || '',
              dbUuid: friend.dbUuid || friend.id || '',
              name: friend.full_name || friend.name || friend.displayName || '',
              username: friend.username || '',
              avatar: friend.profile_photo || friend.avatar || '',
            },
          ];
      setIndividuallySelectedFriendIds(next.map((f: any) => f.id || f.dbUuid).filter(Boolean));
      return next;
    });
  }, []);

  const handleRemoveSelectedItem = useCallback((item: { id: string; dbUuid?: string; type?: string; name?: string }) => {
    const itemId = item.id || item.dbUuid;
    setSelectedFriends((prev) => {
      const next = prev.filter((f) => (f.id || f.dbUuid) !== itemId && f.id !== item.id && f.dbUuid !== item.id);
      setIndividuallySelectedFriendIds(next.map((f: any) => f.id || f.dbUuid).filter(Boolean));
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setLocalTitle('');
    setLocalLocation('');
    const now = new Date();
    setEventDateTime(new Date(now.getTime() + 60 * 60 * 1000));
    setIsDateManuallySet(false);
    setCustomDeadline(new Date(now.getTime()));
    setIndividuallySelectedFriendIds([]);
    setSelectedFriends([]);
    setWaitlistEnabled(false);
    setTotalCapacity(undefined);
    setIsCapacityManuallySet(false);
    setRsvpDeadline(null);
    setCostAmount(0);
    setIsCostManuallySet(false);
    setQuickNote('');
    handleSetCustomCover(null, null);
    clearDraftCoverBlob().catch(() => {});
    setIsHostSelected(true);
    setPriorityGuestIds([]);
    setPlaceId(null);
    setLatitude(null);
    setLongitude(null);
    setPlaceAddress(null);
    setDiscoveryItemId(null);
    setWaitlistMode('automatic');
    clearCreatePlanDraft();
  }, [handleSetCustomCover]);

  // Keep plan time one valid slot ahead continuously
  useEffect(() => {
    const keepTimeAhead = () => {
      const now = Date.now();
      if (now >= eventDateTime.getTime()) {
        const fiveMinMs = 5 * 60 * 1000;
        const minValid = new Date(Math.ceil(now / fiveMinMs) * fiveMinMs + fiveMinMs);
        setEventDateTime(minValid);
      }
    };

    keepTimeAhead();
    const interval = setInterval(keepTimeAhead, 5000);
    return () => clearInterval(interval);
  }, [eventDateTime]);

  return {
    localLocation, setLocalLocation,
    eventDateTime, setEventDateTime,
    isDateManuallySet, setIsDateManuallySet,
    searchPeopleQuery, setSearchPeopleQuery,
    selectedFriends, setSelectedFriends: handleSetSelectedFriends,
    waitlistEnabled, setWaitlistEnabled,
    waitlistCapacity, setWaitlistCapacity: handleSetTotalCapacity,
    rsvpDeadline, setRsvpDeadline,
    totalCapacity, setTotalCapacity: handleSetTotalCapacity,
    isCapacityManuallySet, setIsCapacityManuallySet,
    customDeadline, setCustomDeadline,
    costAmount, setCostAmount,
    isCostManuallySet, setIsCostManuallySet,
    quickNote, setQuickNote,
    localTitle, setLocalTitle,
    isSubmitting, setIsSubmitting,
    customCoverImage, setCustomCoverImage: handleSetCustomCover,
    customCoverBlob,
    isHostSelected, setIsHostSelected,
    priorityGuestIds, setPriorityGuestIds,
    placeId, setPlaceId,
    latitude, setLatitude,
    longitude, setLongitude,
    placeAddress, setPlaceAddress,
    discoveryItemId, setDiscoveryItemId,
    waitlistMode, setWaitlistMode,
    AVAILABLE_FRIENDS,
    totalInvitedCount,
    toggleFriendSelection,
    handleRemoveSelectedItem,
    resetForm,
    userProfile,
    activeUserId
  };
}
