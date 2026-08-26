import React, { useState, useEffect, useMemo } from "react";
import { X, Check, Search } from "lucide-react";
import { UserAvatar } from "../../../../IMGfromDB/UserAvatar";
import { PlanMember } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";
import { AttendanceSearch } from "./AttendanceSearch";

export interface HostAttendanceScreenProps {
  isOpen?: boolean;
  members: PlanMember[];
  hostId: string;
  planExpense?: { total_amount: number; title?: string } | null;
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

  const toggleAttendance = (m: PlanMember) => {
    const mId = getMemberId(m);
    if (mId === hostId) return; // Host cannot be toggled

    const isOriginalMember = members.some(
      (om) => getMemberId(om) === mId
    );

    const isCurrentlyAttended = attendanceState[mId] === 'ATTENDED';

    if (!isCurrentlyAttended) {
      // User is selecting this person as ATTENDED
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
      // User is deselecting this person to DID_NOT_ATTEND
      if (!isOriginalMember) {
        setExtraMembers((prev) =>
          prev.filter((em) => getMemberId(em) !== mId)
        );
      }
      setAttendanceState((prev) => ({ ...prev, [mId]: 'DID_NOT_ATTEND' }));
    }
  };

  const setAllToAttended = () => {
    setAttendanceState((prev) => {
      const next = { ...prev };
      combinedMembers.forEach((m) => {
        const mId = getMemberId(m);
        next[mId] = 'ATTENDED';
      });
      return next;
    });
  };

  // Attended members: from combinedMembers (includes extraMembers selected as attended)
  const attendedMembers = useMemo(() => {
    const attended: PlanMember[] = [];

    combinedMembers.forEach((m) => {
      const mId = getMemberId(m);
      const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
      const decision = isHostUser ? 'ATTENDED' : (attendanceState[mId] || 'DID_NOT_ATTEND');

      if (decision === 'ATTENDED') {
        attended.push(m);
      }
    });

    attended.sort((a, b) => {
      const aId = getMemberId(a);
      const bId = getMemberId(b);
      const aIsHost = a.isHost || a.role === 'HOST' || aId === hostId;
      const bIsHost = b.isHost || b.role === 'HOST' || bId === hostId;
      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return attended;
  }, [combinedMembers, attendanceState, hostId]);

  // Other members: ONLY original plan members who are NOT attending
  const otherMembers = useMemo(() => {
    const others: PlanMember[] = [];

    members.forEach((m) => {
      const mId = getMemberId(m);
      const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
      if (isHostUser) return;

      const decision = attendanceState[mId] || 'DID_NOT_ATTEND';
      if (decision !== 'ATTENDED') {
        others.push(m);
      }
    });

    others.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return others;
  }, [members, attendanceState, hostId]);

  const hasAddedParticipants = useMemo(() => {
    return attendedMembers.some((m) => {
      const mId = getMemberId(m);
      const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
      if (isHostUser) return false;
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

      if (planExpense && Number(planExpense.total_amount || 0) > 0) {
        setShowExpenseDialog(true);
      } else {
        executeSubmission('NONE', usersToAdd, usersToRemove);
      }
    } else {
      if (planExpense && Number(planExpense.total_amount || 0) > 0 && hasAddedParticipants) {
        setShowExpenseDialog(true);
      } else {
        executeSubmission('SPLIT_ALL');
      }
    }
  };

  const executeSubmission = (mode: 'SPLIT_ALL' | 'KEEP_CURRENT_COST' | 'NONE', addOverride?: string[], removeOverride?: string[]) => {
    const payload = combinedMembers.map((m) => {
      const mId = getMemberId(m);
      const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
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

    const effectiveExpenseMode = planExpense && Number(planExpense.total_amount || 0) > 0 ? mode : 'NONE';
    setShowExpenseDialog(false);
    onConfirm(payload, effectiveExpenseMode, usersToAdd, usersToRemove);
  };

  // Calculations for Expense Split Bottom Sheet
  const totalExpense = planExpense ? Number(planExpense.total_amount || 0) : 0;
  const currentGoingCount = attendedMembers.length;
  const splitAllCostPerPerson = currentGoingCount > 0 ? Math.round((totalExpense / currentGoingCount) * 100) / 100 : 0;

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

      {/* ── Main Content Area ── */}
      <div className="flex flex-col flex-1 min-h-0 relative">
        <div className="flex-1 flex flex-col px-5 pt-4 pb-24 animate-fade-in min-h-0 relative">
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* ── ATTENDED SECTION HEADER & SELECT ALL ── */}
            <div className="flex items-center justify-between pb-1 select-none">
              <h3 className="text-[12px] font-semibold text-white/90 uppercase tracking-wider">
                ATTENDED ({attendedMembers.length})
              </h3>
              {otherMembers.length > 0 && (
                <button
                  type="button"
                  onClick={setAllToAttended}
                  className="text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer"
                >
                  Select all
                </button>
              )}
            </div>

            {/* ── Attended Selected Strip ── */}
            {attendedMembers.length > 0 && (
              <div className="bg-transparent border-b border-white/[0.08] pb-4 flex items-center gap-3 animate-fade-in select-none">
                <div className="flex-1 flex items-center gap-4 overflow-x-auto scrollbar-none py-1">
                  {attendedMembers.map((m) => {
                    const mId = getMemberId(m);
                    const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
                    const photo = m.avatar || (m as any).profile_photo;
                    const name = m.name || 'Participant';
                    const firstName = name.split(' ')[0];

                    return (
                      <div key={`attended-strip-${mId}`} className="flex flex-col items-center shrink-0 relative w-14">
                        <div className="relative">
                          <UserAvatar
                            src={photo}
                            alt={name}
                            size="w-12 h-12"
                            className="border border-white/10"
                          />

                          {/* Remove button for non-hosts */}
                          {!isHostUser && (
                            <button
                              type="button"
                              onClick={() => toggleAttendance(m)}
                              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition shadow-md"
                            >
                              <X className="w-3 h-3 stroke-[2.5]" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-col items-center w-full mt-1.5 min-h-[16px]">
                          <span className="text-[10px] font-semibold text-zinc-400 truncate w-full text-center">
                            {firstName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Unattended / Available Members List ── */}
            <div className="flex-1 flex flex-col select-none space-y-1 overflow-y-auto scrollbar-none pr-1 min-h-0">
              {otherMembers.length === 0 ? (
                <div className="w-full py-8 text-center text-zinc-600 text-xs font-semibold select-none">
                  Everyone is marked as attended
                </div>
              ) : (
                otherMembers.map((m) => {
                  const mId = getMemberId(m);
                  const photo = m.avatar || (m as any).profile_photo;
                  const name = m.name || 'Participant';

                  return (
                    <button
                      key={`unattended-row-${mId}`}
                      type="button"
                      onClick={() => toggleAttendance(m)}
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

                      {/* Unselected circular radio indicator */}
                      <span className="w-4.5 h-4.5 rounded-full border-2 border-zinc-600 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
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
            disabled={isSubmitting}
            onClick={handleActionClick}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 14,
              border: 'none',
              background: isSubmitting ? '#E5E5E5' : '#FFFFFF',
              color: '#000000',
              fontSize: 15,
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              transition: 'all 0.2s',
              fontFamily: 'Inter, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isSubmitting && (
              <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isSubmitting
              ? (isCompletedMode ? "Saving Changes…" : "Completing Plan…")
              : (isCompletedMode ? "Save Changes" : "Complete Plan")}
          </button>
        </div>
      </div>

      {/* ── Expense Options Bottom Sheet ── */}
      {showExpenseDialog && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full bg-[#111111] rounded-t-3xl border border-white/10 p-6 pb-8 shadow-2xl flex flex-col gap-4 animate-slide-up">
            <h2 className="text-white text-[18px] font-bold tracking-tight">
              {isCompletedMode ? "Updated Expense Split" : "How should the plan expense be handled?"}
            </h2>

            {/* Recalculated Cost Split Summary Card */}
            {totalExpense > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Total Plan Expense</span>
                  <span className="text-white font-semibold text-sm">₹{totalExpense.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>Going Participants</span>
                  <span className="text-white font-semibold text-sm">{currentGoingCount} people</span>
                </div>
                <div className="h-[1px] bg-white/10 my-1" />
                <div className="flex justify-between items-center text-xs text-zinc-300 font-semibold">
                  <span>Recalculated Split</span>
                  <span className="text-emerald-400 font-bold text-base">₹{splitAllCostPerPerson.toLocaleString('en-IN')} / person</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => executeSubmission('SPLIT_ALL')}
              className="w-full bg-white/10 hover:bg-white/15 border border-white/5 rounded-xl p-4 text-left transition cursor-pointer"
            >
              <div className="text-white text-[15px] font-semibold">Split the plan expense</div>
              <div className="text-zinc-400 text-[13px] font-medium mt-1">
                Recalculate total expense across all {currentGoingCount} Going participants (₹{splitAllCostPerPerson.toLocaleString('en-IN')} each).
              </div>
            </button>

            <button
              type="button"
              onClick={() => executeSubmission('KEEP_CURRENT_COST')}
              className="w-full bg-white/10 hover:bg-white/15 border border-white/5 rounded-xl p-4 text-left transition cursor-pointer"
            >
              <div className="text-white text-[15px] font-semibold">Keep current cost per person</div>
              <div className="text-zinc-400 text-[13px] font-medium mt-1">
                Use the existing per-person cost for everyone added.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowExpenseDialog(false)}
              className="w-full mt-2 py-3 rounded-xl text-zinc-400 hover:text-white font-semibold text-[15px] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
