import React from 'react';
import { X, Crown, ArrowLeftRight, Check } from 'lucide-react';
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
  }, [friends, searchPeopleQuery, hostId]);

  const isItemDisabled = (item: ParticipantItem): boolean =>
    !!disabledUserIds?.has(item.id);

  // Selected avatar strip displays selected friends (host is implicitly part of plan and omitted from this row)
  const displaySelectedItems = selectedFriends;
  const selectedStripRef = React.useRef<HTMLDivElement>(null);
  const prevCountRef = React.useRef(displaySelectedItems.length);

  React.useEffect(() => {
    if (displaySelectedItems.length > prevCountRef.current) {
      if (selectedStripRef.current) {
        selectedStripRef.current.scrollTo({
          left: selectedStripRef.current.scrollWidth,
          behavior: 'smooth',
        });
      }
    }
    prevCountRef.current = displaySelectedItems.length;
  }, [displaySelectedItems.length]);

  return (
    <div className="flex-1 flex flex-col px-4 pt-0 pb-0 animate-fade-in min-h-0 relative">
      <div className="flex flex-col flex-1 min-h-0">

        {/* ── Selected avatar strip — single source of truth for selection ── */}
        {!isReplacementMode && displaySelectedItems.length > 0 && (
          <div className="bg-transparent pb-2 border-b border-white/[0.08] flex items-center animate-fade-in select-none w-full">
            <div
              ref={selectedStripRef}
              className="w-full flex items-center gap-3.5 overflow-x-auto scrollbar-none py-1"
            >
              {displaySelectedItems.map((item) => {
                const photo = item.avatar || item.profilePhoto;
                const name = item.name || item.displayName || 'Friend';

                return (
                  <div key={item.id} className="flex flex-col items-center shrink-0 relative w-13">
                    <div className="relative">
                      <UserAvatar
                        src={photo}
                        alt={name}
                        size="w-12 h-12"
                        className="border border-white/10"
                      />

                      {/* Remove button — restores friend to the available list */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedItem(item)}
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition shadow-md"
                      >
                        <X className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>

                    <div className="flex flex-col items-center w-full mt-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-zinc-400 truncate w-full text-center">
                        {(name || 'Friend').split(' ')[0]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Friends list — all participants with check indicators ── */}
        <div className="flex-1 flex flex-col select-none overflow-y-auto scrollbar-none pr-0 min-h-0 pb-1">
          {availableItems.length === 0 ? (
            <div className="w-full py-8 text-center text-zinc-600 text-xs font-semibold select-none">
              {searchPeopleQuery ? 'No friends matched your search' : 'No friends found'}
            </div>
          ) : (
            availableItems.map((item, index) => {
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
                    padding: '11px 2px',
                    borderBottom: index === availableItems.length - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'opacity 0.2s',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    outline: 'none',
                  }}
                >
                  <div className="flex items-center gap-3.5 truncate">
                    <UserAvatar
                      src={item.profilePhoto}
                      alt="Avatar"
                      size="w-11 h-11"
                      className="shrink-0"
                    />
                    <div className="truncate text-left">
                      <span className="block truncate text-[15px] font-semibold text-white">
                        {item.displayName}
                      </span>
                    </div>
                  </div>

                  {/* Selection circular check indicator */}
                  {isSelected ? (
                    <span className="w-6 h-6 rounded-full bg-[#FF6B2C] flex items-center justify-center shrink-0 shadow-sm">
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-full border border-white/20 shrink-0" />
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

