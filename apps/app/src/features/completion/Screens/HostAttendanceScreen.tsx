import React, { useState, useEffect, useMemo } from "react";
import { X, Search, ArrowRight, Split, Merge } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { PlanMember } from "../../../core/types";
import { normalizeStatus } from "../../../../lib/participantStatus";
import { AttendanceSearch } from "./AttendanceSearch";

export interface HostAttendanceScreenProps {
  isOpen?: boolean;
  members: PlanMember[];
  hostId: string;
  planExpense?: { total_amount: number; title?: string } | null;
  planTotalCost?: number;
  planTitle?: string;
  planCoverImage?: string;
  planId?: string;
  planCategory?: string;
  planSubcategory?: string;
  planCapacity?: number;
  isSubmitting?: boolean;
  isCompletedMode?: boolean;
  onConfirm: (
    attendanceInput: Array<{ user_id: string; attendance: 'ATTENDED' | 'DID_NOT_ATTEND' }>,
    expenseMode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE',
    usersToAdd?: string[],
    usersToRemove?: string[]
  ) => void;
  onBack: () => void;
}

export const HostAttendanceScreen: React.FC<HostAttendanceScreenProps> = ({
  isOpen = true,
  members = [],
  hostId,
  planExpense = null,
  planTotalCost,
  planTitle,
  planCoverImage,
  planId,
  planCategory,
  planSubcategory,
  planCapacity,
  isSubmitting = false,
  isCompletedMode = false,
  onConfirm,
  onBack,
}) => {
  const [step, setStep] = useState<'attendance' | 'search'>('attendance');
  const [attendanceState, setAttendanceState] = useState<Record<string, 'ATTENDED' | 'DID_NOT_ATTEND'>>({});
  const [extraMembers, setExtraMembers] = useState<PlanMember[]>([]);
  const [initialAttendedIds, setInitialAttendedIds] = useState<Set<string>>(new Set());
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  // Combine initial members + extra members added from Attendance Search
  const combinedMembers = useMemo(() => {
    return [...members, ...extraMembers];
  }, [members, extraMembers]);

  // Helper to extract user ID consistently
  const getMemberId = (m: PlanMember) => m.userId || m.userUuid || (m as any).user_id || (m as any).id;

  // Initialize attendance state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('attendance');
      setExtraMembers([]);
      const initialState: Record<string, 'ATTENDED' | 'DID_NOT_ATTEND'> = {};
      const initialIds = new Set<string>();

      members.forEach((m) => {
        const mId = getMemberId(m);
        const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);

        let isAttended = false;
        if (isCompletedMode) {
          const finalAttendance = (m as any).final_attendance;
          const finalState = (m as any).final_state;
          isAttended = isHostUser || finalAttendance === 'ATTENDED' || (status === 'JOINED' && !finalAttendance) || finalState === 'JOINED';
        } else {
          isAttended = isHostUser || status === 'JOINED';
        }

        if (isAttended) {
          initialState[mId] = 'ATTENDED';
          initialIds.add(mId);
        } else {
          initialState[mId] = 'DID_NOT_ATTEND';
        }
      });
      setAttendanceState(initialState);
      setInitialAttendedIds(initialIds);
    }
  }, [isOpen, members, hostId, isCompletedMode]);

  const isHost = (m: PlanMember) => {
    const mId = getMemberId(m);
    return m.isHost || m.role === 'HOST' || mId === hostId;
  };

  const toggleAttendance = (m: PlanMember) => {
    if (isHost(m)) return; // All hosts are preselected and cannot be deselected
    const mId = getMemberId(m);

    const isOriginalMember = members.some(
      (om) => getMemberId(om) === mId
    );

    const isCurrentlyAttended = attendanceState[mId] === 'ATTENDED';

    if (!isCurrentlyAttended) {
      // User is selecting this person as ATTENDED -> move to selected strip
      if (!isOriginalMember) {
        setExtraMembers((prev) => {
          if (prev.some((em) => getMemberId(em) === mId)) {
            return prev;
          }
          return [...prev, m];
        });
      }
      setAttendanceState((prev) => ({ ...prev, [mId]: 'ATTENDED' }));
    } else {
      // User is deselecting this person to DID_NOT_ATTEND -> remove from strip, return to unselected list
      if (!isOriginalMember) {
        setExtraMembers((prev) =>
          prev.filter((em) => getMemberId(em) !== mId)
        );
      }
      setAttendanceState((prev) => ({ ...prev, [mId]: 'DID_NOT_ATTEND' }));
    }
  };

  // Attended members: from combinedMembers (includes extraMembers selected as attended)
  const attendedMembers = useMemo(() => {
    const attended: PlanMember[] = [];

    combinedMembers.forEach((m) => {
      const mId = getMemberId(m);
      const decision = isHost(m) ? 'ATTENDED' : (attendanceState[mId] || 'DID_NOT_ATTEND');

      if (decision === 'ATTENDED') {
        attended.push(m);
      }
    });

    attended.sort((a, b) => {
      const aIsHost = isHost(a);
      const bIsHost = isHost(b);
      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return attended;
  }, [combinedMembers, attendanceState, hostId]);

  // Host members displayed first in the selected strip
  const hostMembers = useMemo(() => {
    const hosts = combinedMembers.filter(isHost);
    if (hosts.length === 0) {
      return [{ id: hostId, userId: hostId, userUuid: hostId, name: 'You' } as PlanMember];
    }
    return hosts;
  }, [combinedMembers, hostId]);

  // Selected non-host participants shown in the top strip
  const selectedParticipants = useMemo(() => {
    return combinedMembers.filter((m) => {
      if (isHost(m)) return false;
      const mId = getMemberId(m);
      return attendanceState[mId] === 'ATTENDED';
    });
  }, [combinedMembers, attendanceState, hostId]);

  // Unselected members (excluding hosts and currently attended members)
  const unselectedMembers = useMemo(() => {
    const list = combinedMembers.filter((m) => {
      if (isHost(m)) return false;
      const mId = getMemberId(m);
      return attendanceState[mId] !== 'ATTENDED';
    });

    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }, [combinedMembers, attendanceState, hostId]);

  const badgeCount = attendedMembers.length;

  const selectedStripRef = React.useRef<HTMLDivElement>(null);
  const prevCountRef = React.useRef(selectedParticipants.length);

  React.useEffect(() => {
    if (selectedParticipants.length > prevCountRef.current) {
      if (selectedStripRef.current) {
        selectedStripRef.current.scrollTo({
          left: selectedStripRef.current.scrollWidth,
          behavior: 'smooth',
        });
      }
    }
    prevCountRef.current = selectedParticipants.length;
  }, [selectedParticipants.length]);

  // Check if at least one participant has been newly selected
  const hasNewlySelected = useMemo(() => {
    return combinedMembers.some((m) => {
      if (isHost(m)) return false;
      const mId = getMemberId(m);
      return attendanceState[mId] === 'ATTENDED' && !initialAttendedIds.has(mId);
    });
  }, [combinedMembers, attendanceState, hostId, initialAttendedIds]);

  // In completed mode, check if changes were made
  const hasCompletedModeChanges = useMemo(() => {
    if (!isCompletedMode) return false;
    const currentAttendedIds = new Set(
      attendedMembers.map((m) => getMemberId(m))
    );
    let changed = false;
    currentAttendedIds.forEach((id) => {
      if (!initialAttendedIds.has(id as string)) changed = true;
    });
    initialAttendedIds.forEach((id) => {
      if (!currentAttendedIds.has(id as string)) changed = true;
    });
    return changed;
  }, [isCompletedMode, attendedMembers, initialAttendedIds]);

  // Completion flow: show arrow whenever at least one attendee is marked (includes preselected JOINED/host).
  // Completed-management mode: show arrow only when changes have been made from the initial state.
  const showFloatingCta = isCompletedMode ? hasCompletedModeChanges : attendedMembers.length > 0;

  const hasAddedParticipants = useMemo(() => {
    return attendedMembers.some((m) => {
      if (isHost(m)) return false;
      const originalStatus = normalizeStatus(m.joinState || (m as any).rsvp_status);
      return originalStatus !== 'JOINED';
    });
  }, [attendedMembers, hostId]);

  if (!isOpen) return null;

  if (step === 'search') {
    return (
      <AttendanceSearch
        isOpen={isOpen}
        combinedMembers={combinedMembers}
        attendanceState={attendanceState}
        hostId={hostId}
        onToggleAttendance={toggleAttendance}
        onBack={() => setStep('attendance')}
      />
    );
  }

  const handleActionClick = () => {
    if (isCompletedMode) {
      const currentAttendedIds = new Set(attendedMembers.map(m => getMemberId(m)));
      
      const usersToAdd: string[] = [];
      currentAttendedIds.forEach(id => {
        if (!initialAttendedIds.has(id as string)) {
          usersToAdd.push(id as string);
        }
      });

      const usersToRemove: string[] = [];
      initialAttendedIds.forEach(id => {
        if (!currentAttendedIds.has(id as string)) {
          usersToRemove.push(id as string);
        }
      });

      if (usersToAdd.length === 0 && usersToRemove.length === 0) {
        // No changes made
        onBack();
        return;
      }

      if (hasExpense) {
        setShowExpenseDialog(true);
      } else {
        executeSubmission('NONE', usersToAdd, usersToRemove);
      }
    } else {
      const countChanged = attendedMembers.length !== costDenominator;
      if (hasExpense && (hasAddedParticipants || countChanged)) {
        setShowExpenseDialog(true);
      } else {
        executeSubmission(hasExpense ? 'SPLIT_ALL' : 'NONE');
      }
    }
  };

  const executeSubmission = (mode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE', addOverride?: string[], removeOverride?: string[]) => {
    const payload = combinedMembers.map((m) => {
      const mId = getMemberId(m);
      const isHostUser = isHost(m);
      const isAttended = isHostUser || attendanceState[mId] === 'ATTENDED';

      return {
        user_id: mId,
        attendance: isAttended ? ('ATTENDED' as const) : ('DID_NOT_ATTEND' as const),
      };
    });

    const currentAttendedIds = new Set(attendedMembers.map(m => getMemberId(m)));
    const usersToAdd: string[] = addOverride ?? [];
    if (!addOverride) {
      currentAttendedIds.forEach(id => {
        if (!initialAttendedIds.has(id as string)) {
          usersToAdd.push(id as string);
        }
      });
    }

    const usersToRemove: string[] = removeOverride ?? [];
    if (!removeOverride) {
      initialAttendedIds.forEach(id => {
        if (!currentAttendedIds.has(id as string)) {
          usersToRemove.push(id as string);
        }
      });
    }

    const effectiveExpenseMode = hasExpense ? mode : 'NONE';
    setShowExpenseDialog(false);
    onConfirm(payload, effectiveExpenseMode, usersToAdd, usersToRemove);
  };

  // Calculations for Expense Split Bottom Sheet
  // Use planTotalCost if provided, fallback to planExpense.total_amount
  const totalExpense = (planTotalCost !== undefined && planTotalCost !== null && Number(planTotalCost) > 0)
    ? Number(planTotalCost)
    : (planExpense ? Number(planExpense.total_amount || 0) : 0);
  const hasExpense = totalExpense > 0;

  const currentGoingCount = attendedMembers.length;
  const splitAllCostPerPerson = currentGoingCount > 0 ? Math.round((totalExpense / currentGoingCount) * 100) / 100 : 0;

  // Use the real plan capacity (plan_size) as the denominator for the existing per-person cost.
  // Fall back to members who joined, then 1.
  const joinedMembersCount = members.filter(m => {
    const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
    return isHost(m) || status === 'JOINED';
  }).length;
  const costDenominator = (planCapacity && planCapacity > 0)
    ? planCapacity
    : (joinedMembersCount > 0 ? joinedMembersCount : 1);

  const initialPerPerson = Math.round((totalExpense / costDenominator) * 100) / 100;
  const keepCostNewTotal = Math.round(initialPerPerson * currentGoingCount * 100) / 100;
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] bg-[#000000] flex flex-col h-full overflow-hidden text-left relative" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ── Standardized Header Top Bar ── */}
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

        {/* TITLE & SUBTITLE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, sans-serif', lineHeight: '1.2' }}>
            {isCompletedMode ? "Manage Participants" : "Who attended?"}
          </h2>
          <p style={{ fontSize: 11, fontWeight: 650, color: '#A1A1AA', margin: 0, marginTop: 2, fontFamily: 'Inter, sans-serif', lineHeight: '1.2' }}>
            {`${attendedMembers.length} attended`}
          </p>
        </div>

        {/* TRAILING CONTROLS: SEARCH ICON */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setStep('search')}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              width: 32,
              height: 32,
              transition: 'opacity 0.2s'
            }}
          >
            <Search className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* ── Main Content Area matching Add Participants layout ── */}
      <div className="flex flex-col flex-1 min-h-0 relative">
        <div className="flex-1 flex flex-col px-4 pt-0 pb-0 animate-fade-in min-h-0 relative">
          <div className="flex flex-col flex-1 min-h-0">

            {/* ── Selected avatar strip — single source of truth for selection ── */}
            <div className="bg-transparent pb-2 border-b border-white/[0.08] flex items-center justify-between animate-fade-in select-none w-full gap-3">
              <div
                ref={selectedStripRef}
                className="flex-1 flex items-center gap-3.5 overflow-x-auto scrollbar-none py-1 min-w-0"
              >
                {/* Host(s) — always preselected, cannot be deselected, no remove button */}
                {hostMembers.map((hostM) => {
                  const hId = getMemberId(hostM);
                  const hPhoto = hostM.avatar || (hostM as any).profile_photo || (hostM as any).profilePhoto || '';
                  const isYou = hId === hostId;
                  const label = isYou ? 'You' : (hostM.name ? hostM.name.split(' ')[0] : 'Host');

                  return (
                    <div key={`host-${hId}`} className="flex flex-col items-center shrink-0 relative w-13">
                      <div className="relative">
                        <UserAvatar
                          src={hPhoto}
                          alt={label}
                          size="w-12 h-12"
                          className="border border-white/10"
                        />
                      </div>
                      <div className="flex flex-col items-center w-full mt-1.5 min-h-[20px]">
                        <span className="text-[10px] font-semibold text-zinc-400 truncate w-full text-center">
                          {label}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Selected participants with remove button */}
                {selectedParticipants.map((m) => {
                  const mId = getMemberId(m);
                  const photo = m.avatar || (m as any).profile_photo || (m as any).profilePhoto;
                  const name = m.name || (m as any).displayName || 'Participant';
                  const firstName = name.split(' ')[0];

                  return (
                    <div key={`selected-${mId}`} className="flex flex-col items-center shrink-0 relative w-13">
                      <div className="relative">
                        <UserAvatar
                          src={photo}
                          alt={name}
                          size="w-12 h-12"
                          className="border border-white/10"
                        />

                        {/* Remove button — restores participant to the unselected list */}
                        <button
                          type="button"
                          onClick={() => toggleAttendance(m)}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition shadow-md"
                        >
                          <X className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </div>

                      <div className="flex flex-col items-center w-full mt-1.5 min-h-[20px]">
                        <span className="text-[10px] font-semibold text-zinc-400 truncate w-full text-center">
                          {firstName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Count Orange Circular Badge */}
              <div className="shrink-0 flex items-center justify-center pr-1 pl-1">
                <div className="w-6 h-6 rounded-full bg-[#FF6B2C] text-white font-bold text-[12px] flex items-center justify-center shadow-md select-none">
                  {badgeCount}
                </div>
              </div>
            </div>

            {/* ── Unselected Participant List ── */}
            <div
              className="flex-1 flex flex-col select-none overflow-y-auto scrollbar-none pr-0 min-h-0"
              style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
            >
              {unselectedMembers.length === 0 ? (
                <div className="w-full py-8 text-center text-zinc-600 text-xs font-semibold select-none">
                  {selectedParticipants.length > 0 ? 'All participants selected' : 'No participants found'}
                </div>
              ) : (
                unselectedMembers.map((m, index) => {
                  const mId = getMemberId(m);
                  const photo = m.avatar || (m as any).profile_photo || (m as any).profilePhoto;
                  const name = m.name || (m as any).displayName || 'Participant';

                  return (
                    <button
                      key={`participant-${mId}`}
                      type="button"
                      onClick={() => toggleAttendance(m)}
                      style={{
                        width: '100%',
                        padding: '11px 2px',
                        borderBottom: index === unselectedMembers.length - 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'opacity 0.2s',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <div className="flex items-center gap-3.5 truncate">
                        <UserAvatar
                          src={photo}
                          alt={name}
                          size="w-11 h-11"
                          className="shrink-0"
                        />
                        <div className="truncate text-left">
                          <span className="block truncate text-[15px] font-semibold text-white">
                            {name}
                          </span>
                        </div>
                      </div>

                      {/* Unselected circular indicator matching Add Participants */}
                      <span className="w-6 h-6 rounded-full border border-white/20 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Floating ArrowRight action button in bottom-right corner */}
        {showFloatingCta && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleActionClick}
            title={isCompletedMode ? "Save Changes" : "Complete Plan"}
            style={{
              bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
              right: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
            }}
            className="fixed z-[75] w-12 h-12 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition-all duration-150 cursor-pointer pointer-events-auto select-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <ArrowRight className="w-6 h-6 text-white stroke-[2.5]" />
            )}
          </button>
        )}
      </div>

      {/* ── Update Cost Bottom Sheet (matches AutomaticParticipantContainer style) ── */}
      {showExpenseDialog && (
        <div
          onClick={() => {
            if (!isSubmittingExpense) {
              setShowExpenseDialog(false);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: '#1C1C1E',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              color: '#FFFFFF',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
              animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            className="select-none text-left"
          >
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pb-1 text-left flex items-center gap-3.5">
              <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900">
                {planCoverImage || planId ? (
                  <DiscoveryImages
                    src={planCoverImage}
                    planId={planId || ''}
                    category={planCategory}
                    subcategory={planSubcategory}
                    screen="Plan Actions Avatar"
                    alt={planTitle || 'Plan'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                    <span style={{ fontSize: 18 }}>🗓️</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center space-y-0.5">
                <h3 className="font-sans font-semibold text-[15px] text-white tracking-wide truncate leading-snug">
                  {planTitle || 'Plan'}
                </h3>
                <p className="font-sans text-[12px] text-zinc-400 truncate leading-tight">
                  Update the cost
                </p>
              </div>
            </div>

            <div className="px-4 pt-4 flex flex-col gap-2.5">
              {/* Option A: Split the total */}
              <button
                type="button"
                disabled={isSubmittingExpense}
                onClick={() => {
                  if (!isSubmittingExpense) {
                    setIsSubmittingExpense(true);
                    executeSubmission('SPLIT_ALL');
                    setIsSubmittingExpense(false);
                  }
                }}
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#FFFFFF',
                  textAlign: 'left',
                  cursor: isSubmittingExpense ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                  opacity: isSubmittingExpense ? 0.5 : 1,
                }}
              >
                <Split className="w-5 h-5 text-[#10B981] flex-shrink-0" />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                    Split the total
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.2,
                      marginTop: 1,
                    }}
                  >
                    {hasExpense && currentGoingCount > 0
                      ? `₹${Math.round(totalExpense).toLocaleString('en-IN')} ÷ ${currentGoingCount} = ₹${(splitAllCostPerPerson % 1 === 0 ? splitAllCostPerPerson : splitAllCostPerPerson.toFixed(2)).toLocaleString('en-IN')}/person`
                      : 'Keep the total cost and split it among attendees'}
                  </span>
                </div>
              </button>

              {/* Option B: Keep ₹X/person */}
              <button
                type="button"
                disabled={isSubmittingExpense}
                onClick={() => {
                  if (!isSubmittingExpense) {
                    setIsSubmittingExpense(true);
                    executeSubmission('KEEP_CURRENT_COST');
                    setIsSubmittingExpense(false);
                  }
                }}
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 14px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#FFFFFF',
                  textAlign: 'left',
                  cursor: isSubmittingExpense ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                  opacity: isSubmittingExpense ? 0.5 : 1,
                }}
              >
                <Merge className="w-5 h-5 text-[#10B981] flex-shrink-0" />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    flex: 1,
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                    {hasExpense
                      ? `Keep ₹${(initialPerPerson % 1 === 0 ? initialPerPerson : initialPerPerson.toFixed(2)).toLocaleString('en-IN')}/person`
                      : 'Keep cost per person'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.2,
                      marginTop: 1,
                    }}
                  >
                    {hasExpense
                      ? `New total: ₹${Math.round(keepCostNewTotal).toLocaleString('en-IN')}`
                      : 'Calculate new total based on attendee count'}
                  </span>
                </div>
              </button>

              {/* Cancel */}
              <button
                type="button"
                disabled={isSubmittingExpense}
                onClick={() => {
                  if (!isSubmittingExpense) {
                    setShowExpenseDialog(false);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 12,
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isSubmittingExpense ? 'default' : 'pointer',
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
