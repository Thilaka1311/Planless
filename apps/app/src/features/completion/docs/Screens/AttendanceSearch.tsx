import React, { useState, useMemo } from "react";
import { X, Check, Search } from "lucide-react";
import { UserAvatar } from "../../../../IMGfromDB/UserAvatar";
import { PlanMember } from "../../../../core/types";
import { useFriendshipStore } from "../../../friendships/state/FriendshipContext";

export interface AttendanceSearchProps {
  isOpen?: boolean;
  combinedMembers: PlanMember[];
  attendanceState: Record<string, 'ATTENDED' | 'DID_NOT_ATTEND'>;
  hostId: string;
  onToggleAttendance: (member: PlanMember) => void;
  onBack: () => void;
}

export const AttendanceSearch: React.FC<AttendanceSearchProps> = ({
  isOpen = true,
  combinedMembers = [],
  attendanceState = {},
  hostId,
  onToggleAttendance,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Get user friends from FriendshipContext safely
  let storeFriends: any[] = [];
  try {
    const friendshipStore = useFriendshipStore();
    storeFriends = friendshipStore?.friends || [];
  } catch (err) {
    storeFriends = [];
  }

  // Helper to convert friend store items to PlanMember
  const normalizeFriendToPlanMember = (f: any): PlanMember => {
    const raw = f.friend || f;
    const id = raw.id || raw.userId || raw.userUuid || raw.user_id || f.id;
    const name = raw.full_name || raw.displayName || raw.name || f.name || 'Friend';
    const avatar = raw.profile_photo || raw.profilePhoto || raw.avatar || f.avatar || '';
    const username = raw.username || f.username || '';

    return {
      userId: id,
      userUuid: id,
      name,
      avatar,
      joinState: 'INVITED' as const,
      reminderState: 'none',
      joinedAt: new Date().toISOString(),
      username,
    } as any;
  };

  // Build complete list of all selectable people (combinedMembers + all user friends)
  const allSelectablePeople = useMemo(() => {
    const result: PlanMember[] = [...combinedMembers];
    const existingIds = new Set(
      combinedMembers.map((m) => m.userId || m.userUuid || (m as any).user_id || (m as any).id)
    );

    (storeFriends || []).forEach((f: any) => {
      const memberObj = normalizeFriendToPlanMember(f);
      const fId = memberObj.userId;
      if (fId && !existingIds.has(fId) && fId !== hostId) {
        existingIds.add(fId);
        result.push(memberObj);
      }
    });

    return result;
  }, [combinedMembers, storeFriends, hostId]);

  // Filter search results across all selectable people
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const searchRes: PlanMember[] = [];

    allSelectablePeople.forEach((p) => {
      const matchesSearch = !q || (p.name || '').toLowerCase().includes(q) || ((p as any).username || '').toLowerCase().includes(q);
      if (matchesSearch) {
        searchRes.push(p);
      }
    });

    searchRes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return searchRes;
  }, [allSelectablePeople, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-[#000000] flex flex-col h-full overflow-hidden text-left relative" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Standardized Integrated Top Navigation Row ── */}
      <div
        className="w-full shrink-0 px-5 flex items-center bg-[#000000] border-b border-white/[0.08] relative z-40 gap-3"
        style={{ height: '72px', boxSizing: 'border-box' }}
      >
        {/* BACK BUTTON */}
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: 0,
            width: 24,
            height: 24,
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        {/* INTEGRATED HEADER SEARCH BAR */}
        <div className="flex-1 flex items-center bg-[#111111] border border-white/10 rounded-xl px-3.5 py-2 gap-2.5">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            id="attendance-search-field"
            name="attendanceSearchField"
            type="text"
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-white placeholder-zinc-500 w-full"
            autoFocus
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Friends Search List ── */}
      <div className="flex-1 flex flex-col pt-3 pb-24 animate-fade-in min-h-0 relative select-none">
        <div className="flex-1 flex flex-col space-y-1.5 overflow-y-auto scrollbar-none px-5 pt-1 pr-2 min-h-0">
          {searchResults.length === 0 ? (
            <div className="w-full py-12 text-center text-zinc-600 text-xs font-semibold">
              {searchQuery ? 'No friends found matching search' : 'No friends available'}
            </div>
          ) : (
            searchResults.map((m) => {
              const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
              const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
              const isAttended = isHostUser || attendanceState[mId] === 'ATTENDED';
              const photo = m.avatar || (m as any).profile_photo;
              const name = m.name || 'Participant';

              return (
                <button
                  key={`search-friend-row-${mId}`}
                  type="button"
                  onClick={() => onToggleAttendance(m)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <div className="flex items-center gap-3 truncate">
                    <UserAvatar
                      src={photo}
                      alt={name}
                      size="w-8 h-8"
                      className="shrink-0"
                    />
                    <span className="block truncate text-xs font-bold text-white">
                      {name}
                    </span>
                  </div>

                  {/* Selected / Unselected Indicator */}
                  {isAttended ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black shrink-0 shadow-sm">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border-2 border-zinc-600 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Fixed Bottom CTA Button ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          background: 'linear-gradient(to top, #000000 80%, rgba(0,0,0,0))',
          zIndex: 40,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          pointerEvents: 'auto'
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 14,
            border: 'none',
            background: '#FFFFFF',
            color: '#000000',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
