import { useState, useEffect, useMemo, useCallback } from "react";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useFriendshipStore } from "../../friendships/state/FriendshipContext";

export function useCreatePlanForm() {
  const { userProfile } = useProfileStore();
  const { friends } = useFriendshipStore();
  const activeUserId = userProfile?.dbUuid || "";

  // Form inputs
  const [localLocation, setLocalLocation] = useState('');
  const [eventDateTime, setEventDateTime] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getTime() + 60 * 60 * 1000);
  });
  const [isDateManuallySet, setIsDateManuallySet] = useState(false);
  const [searchPeopleQuery, setSearchPeopleQuery] = useState('');
  const [individuallySelectedFriendIds, setIndividuallySelectedFriendIds] = useState<string[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [totalCapacity, setTotalCapacity] = useState<number | undefined>(undefined);
  const [isCapacityManuallySet, setIsCapacityManuallySet] = useState(false);
  const [rsvpDeadline, setRsvpDeadline] = useState<string | null>(null);
  const [customDeadline, setCustomDeadline] = useState<Date>(() => {
    return new Date();
  });
  const [costAmount, setCostAmount] = useState(0);
  const [isCostManuallySet, setIsCostManuallySet] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(null);
  const [isHostSelected, setIsHostSelected] = useState(true);
  const [priorityGuestIds, setPriorityGuestIds] = useState<string[]>([]);
  const [discoveryItemId, setDiscoveryItemId] = useState<string | null>(null);
  const [waitlistMode, setWaitlistMode] = useState<'automatic' | 'assigned'>('automatic');

  // Google Maps resolved details
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeAddress, setPlaceAddress] = useState<string | null>(null);

  // Sync selectedFriends whenever individuallySelectedFriendIds or friends changes
  useEffect(() => {
    const mapped = individuallySelectedFriendIds.map((id) => {
      const f = friends.find((fr) => fr.friend?.id === id);
      if (!f || !f.friend) return null;
      const u = f.friend;
      return {
        id: u.id,
        dbUuid: u.id,
        name: u.full_name,
        username: u.username,
        avatar: u.profile_photo || ""
      };
    }).filter(Boolean);

    setSelectedFriends(mapped);
  }, [individuallySelectedFriendIds, friends]);

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

  const toggleFriendSelection = useCallback((friend: any) => {
    setIndividuallySelectedFriendIds((prev) =>
      prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
    );
  }, []);

  const handleRemoveSelectedItem = useCallback((item: { id: string; type: 'friend'; name: string }) => {
    setIndividuallySelectedFriendIds((prev) => prev.filter((id) => id !== item.id));
  }, []);

  const resetForm = useCallback(() => {
    setLocalTitle('');
    setLocalLocation('');
    const now = new Date();
    setEventDateTime(new Date(now.getTime() + 60 * 60 * 1000));
    setIsDateManuallySet(false);
    setCustomDeadline(new Date(now.getTime()));
    setIndividuallySelectedFriendIds([]);
    setWaitlistEnabled(false);
    setTotalCapacity(undefined);
    setIsCapacityManuallySet(false);
    setRsvpDeadline(null);
    setCostAmount(0);
    setIsCostManuallySet(false);
    setQuickNote('');
    setCustomCoverImage(null);
    setIsHostSelected(true);
    setPriorityGuestIds([]);
    setPlaceId(null);
    setLatitude(null);
    setLongitude(null);
    setPlaceAddress(null);
    setDiscoveryItemId(null);
    setWaitlistMode('automatic');
  }, []);

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
    selectedFriends, setSelectedFriends,
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
    customCoverImage, setCustomCoverImage,
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
