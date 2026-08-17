import React from 'react';
import { X, Crown, ArrowLeftRight } from 'lucide-react';
import { UserAvatar } from '../../../IMGfromDB/UserAvatar';

interface StepWhoProps {
  searchPeopleQuery: string;
  setSearchPeopleQuery: (q: string) => void;
  selectedFriends: any[];
  toggleFriendSelection: (friend: any) => void;
  friends: any[];
  waitlistEnabled: boolean;
  setWaitlistEnabled: (enabled: boolean) => void;
  waitlistCapacity: number;
  setWaitlistCapacity: (cap: number) => void;
  totalInvitedCount: number;
  handleRemoveSelectedItem: (item: any) => void;
  setCustomizerStep: (step: number) => void;
  disabledUserIds?: Set<string>;
  confirmLabel?: string;
  onConfirmEdit?: () => void;
  hideCapacity?: boolean;
  cameFromReview?: boolean;
  userProfile?: any;
  activeUserId?: string;
  hideConfirmButton?: boolean;
  isHostSelected?: boolean;
  onToggleHostSelection?: () => void;
  isReplacementMode?: boolean;
  leavingParticipant?: { name: string; avatar?: string | null } | null;
  selectedReplacementFriend?: any | null;

  // Optional plan details for the compact header
  localTitle?: string;
  localLocation?: string;
  eventDateTime?: Date;
  category?: string;
  subcategory?: string | null;
}

interface ParticipantItem {
  id: string;
  itemType: 'friend';
  displayName: string;
  fullName?: string;
  username?: string;
  profilePhoto?: string;
  rawFriend?: any;
}

export const StepWho: React.FC<StepWhoProps> = ({
  searchPeopleQuery,
  selectedFriends,
  toggleFriendSelection,
  waitlistEnabled,
  setWaitlistEnabled,
  waitlistCapacity,
  setWaitlistCapacity,
  totalInvitedCount,
  handleRemoveSelectedItem,
  friends,
  setCustomizerStep,
  disabledUserIds,
  confirmLabel,
  onConfirmEdit,
  hideCapacity = false,
  cameFromReview = false,
  userProfile,
  activeUserId,
  hideConfirmButton = false,
  isHostSelected = true,
  onToggleHostSelection,
  isReplacementMode = false,
  leavingParticipant = null,
  selectedReplacementFriend = null,
}) => {
  const totalParticipantsCount = totalInvitedCount + (isHostSelected ? 1 : 0);

  // IDs of currently selected friends — used to exclude them from the available list.
  const selectedIds = React.useMemo(
    () => new Set(selectedFriends.map((f) => f.id)),
    [selectedFriends],
  );

  // The host's own id — excluded from the selectable list (host handled via its own toggle).
  const hostId = activeUserId || userProfile?.dbUuid;

  // ─── Available friends, filtered by search query ──────────────
  const availableItems = React.useMemo((): ParticipantItem[] => {
    const q = searchPeopleQuery.toLowerCase().trim();

    return friends
      .filter((u) => {
        // In normal mode: exclude already-selected friends so they move to the top strip
        // In replacement mode: keep selected friend in the list so they remain visible with radio state
        if (!isReplacementMode && selectedIds.has(u.id)) return false;
        // Exclude the host entry from the scrollable list
        if (u.id === hostId) return false;
        // Apply search filter
        if (!q) return true;
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q)
        );
      })
      .map((u) => ({
        id: u.id,
        itemType: 'friend' as const,
        displayName: u.name || '',
        fullName: u.name,
        username: u.username,
        profilePhoto: u.avatar,
        rawFriend: u,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [friends, searchPeopleQuery, selectedIds, hostId]);

  const isItemDisabled = (item: ParticipantItem): boolean =>
    !!disabledUserIds?.has(item.id);

  // Build the selected avatar strip (host first, then friends in selection order).
  const hostItem = userProfile && isHostSelected
    ? {
        id: hostId,
        type: 'friend',
        displayName: userProfile.name || 'You',
        avatar: userProfile.avatar,
        isHost: true,
      }
    : null;

  const displaySelectedItems = hostItem ? [hostItem, ...selectedFriends] : selectedFriends;

  return (
    <div className="flex-1 flex flex-col px-5 pt-0 pb-6 animate-fade-in min-h-0 relative">
      <div className="flex flex-col flex-1 min-h-0 space-y-4">

        {/* ── Selected avatar strip — single source of truth for selection ── */}
        {!isReplacementMode && displaySelectedItems.length > 0 && (
          <div className="bg-transparent border-b border-white/[0.08] pb-4 flex items-center justify-between gap-3 animate-fade-in select-none">
            <div className="flex-1 flex items-center gap-4 overflow-x-auto scrollbar-none py-1">
              {displaySelectedItems.map((item) => {
                const photo = item.avatar || item.profilePhoto;
                const name = item.name || item.displayName || 'Friend';
                const isHostItem = (item as any).isHost;

                return (
                  <div key={item.id} className="flex flex-col items-center shrink-0 relative w-14">
                    <div className="relative">
                      <UserAvatar
                        src={photo}
                        alt={name}
                        size="w-12 h-12"
                        className="border border-white/10"
                      />

                      {/* Host crown badge */}
                      {isHostItem && (
                        <div className="absolute -top-1 -right-1 bg-[#FFD700] text-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-black font-bold shadow-md">
                          <Crown className="w-2.5 h-2.5 text-black" fill="currentColor" />
                        </div>
                      )}

                      {/* Remove button — restores friend to the available list */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isHostItem && onToggleHostSelection) {
                            onToggleHostSelection();
                          } else {
                            handleRemoveSelectedItem(item);
                          }
                        }}
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition shadow-md"
                      >
                        <X className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>

                    <div className="flex flex-col items-center w-full mt-1.5 min-h-[24px]">
                      <span className="text-[10px] font-semibold text-zinc-400 truncate w-full text-center">
                        {(name || 'Friend').split(' ')[0]}
                      </span>
                      {isHostItem && (
                        <span className="text-[8px] font-medium text-zinc-500 uppercase tracking-wider text-center">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total count bubble */}
            <div className="shrink-0 flex items-center justify-center bg-[#FFFFFF] text-[#000000] text-xs font-black rounded-full w-8 h-8">
              {totalParticipantsCount}
            </div>
          </div>
        )}

        {/* ── Available friends list — only unselected participants ── */}
        <div className="flex-1 flex flex-col select-none space-y-1 overflow-y-auto scrollbar-none pr-1 min-h-0">
          {availableItems.length === 0 ? (
            <div className="w-full py-8 text-center text-zinc-600 text-xs font-semibold select-none">
              {searchPeopleQuery ? 'No friends matched your search' : 'All friends selected'}
            </div>
          ) : (
            availableItems.map((item) => {
              const disabled = isItemDisabled(item);
              const isSelected = selectedIds.has(item.id);

              return (
                <button
                  key={`friend-${item.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleFriendSelection(item.rawFriend)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: isSelected ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    outline: 'none',
                  }}
                >
                  <div className="flex items-center gap-3 truncate">
                    <UserAvatar
                      src={item.profilePhoto}
                      alt="Avatar"
                      size="w-8 h-8"
                      className="shrink-0"
                    />
                    <div className="truncate text-left">
                      <span className="block truncate text-xs font-bold text-white">
                        {item.displayName}
                      </span>
                    </div>
                  </div>

                  {/* Selection radio indicator */}
                  {isSelected ? (
                    <span className="w-4.5 h-4.5 rounded-full bg-white flex items-center justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-black" />
                    </span>
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border border-white/20 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

      </div>

      {!cameFromReview && !hideConfirmButton && (
        <div className="pt-4 mt-auto space-y-4" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={() => {
              if (onConfirmEdit) {
                onConfirmEdit();
              } else {
                setCustomizerStep(3);
              }
            }}
            style={{
              width: '100%',
              background: '#FFFFFF',
              color: '#000000',
              padding: '14px 0',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: 'none',
              transition: 'opacity 0.2s, transform 0.1s',
              boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)',
            }}
          >
            <span>{confirmLabel || 'Continue'}</span>
          </button>
        </div>
      )}

    </div>
  );
};

