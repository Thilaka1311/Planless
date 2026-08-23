import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { UserAvatar } from "../../../../IMGfromDB/UserAvatar";
import { PlanMember } from "../../../../core/types";
import { normalizeStatus } from "../../../../../lib/participantStatus";

export interface HostAttendanceScreenProps {
  isOpen?: boolean;
  members: PlanMember[];
  hostId: string;
  isSubmitting?: boolean;
  onConfirm: (attendanceInput: Array<{ user_id: string; attendance: 'ATTENDED' | 'DID_NOT_ATTEND' }>) => void;
  onBack: () => void;
}

export const HostAttendanceScreen: React.FC<HostAttendanceScreenProps> = ({
  isOpen = true,
  members = [],
  hostId,
  isSubmitting = false,
  onConfirm,
  onBack,
}) => {
  const [step, setStep] = useState<'attendance' | 'summary'>('attendance');
  // Local state for attendance decisions: map user_id -> 'ATTENDED' | 'DID_NOT_ATTEND'
  const [attendanceState, setAttendanceState] = useState<Record<string, 'ATTENDED' | 'DID_NOT_ATTEND'>>({});

  // Initialize attendance state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('attendance');
      const initialState: Record<string, 'ATTENDED' | 'DID_NOT_ATTEND'> = {};
      members.forEach((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);

        if (isHostUser) {
          initialState[mId] = 'ATTENDED';
        } else if (status === 'JOINED') {
          initialState[mId] = 'ATTENDED';
        } else {
          initialState[mId] = 'DID_NOT_ATTEND';
        }
      });
      setAttendanceState(initialState);
    }
  }, [isOpen, members, hostId]);

  const toggleAttendance = (mId: string) => {
    if (mId === hostId) return; // Host cannot be toggled
    setAttendanceState((prev) => ({
      ...prev,
      [mId]: prev[mId] === 'ATTENDED' ? 'DID_NOT_ATTEND' : 'ATTENDED',
    }));
  };

  const setAllJoinedToAttended = () => {
    setAttendanceState((prev) => {
      const next = { ...prev };
      members.forEach((m) => {
        const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
        const status = normalizeStatus(m.joinState || (m as any).rsvp_status);
        if (status === 'JOINED') {
          next[mId] = 'ATTENDED';
        }
      });
      return next;
    });
  };

  const getMemberSubtitle = (member: PlanMember, isAttended: boolean, isHost: boolean) => {
    if (isHost) return 'Host';
    if (isAttended) return null;

    const originalStatus = normalizeStatus(member.joinState || (member as any).rsvp_status);
    if (originalStatus === 'JOINED') return "Didn't attend";
    if (originalStatus === 'WAITLISTED') return 'Waitlisted';
    if (originalStatus === 'INVITED') return 'Invited';
    if (originalStatus === 'SKIPPED') {
      const reason = (member.skipReason || (member as any).skip_reason || '').toUpperCase();
      if (reason === 'REMOVED') return 'Removed';
      return 'Not attending';
    }
    return "Didn't attend";
  };

  const { attendedMembers, otherMembers } = useMemo(() => {
    const attended: PlanMember[] = [];
    const others: PlanMember[] = [];

    members.forEach((m) => {
      const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
      const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
      const decision = isHostUser ? 'ATTENDED' : (attendanceState[mId] || 'DID_NOT_ATTEND');

      if (decision === 'ATTENDED') {
        attended.push(m);
      } else {
        others.push(m);
      }
    });

    // Sort attended: Host first, then alphabetized
    attended.sort((a, b) => {
      const aId = a.userId || a.userUuid || (a as any).user_id || (a as any).id;
      const bId = b.userId || b.userUuid || (b as any).user_id || (b as any).id;
      const aIsHost = a.isHost || a.role === 'HOST' || aId === hostId;
      const bIsHost = b.isHost || b.role === 'HOST' || bId === hostId;
      if (aIsHost && !bIsHost) return -1;
      if (!aIsHost && bIsHost) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Sort others: alphabetized
    others.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return { attendedMembers: attended, otherMembers: others };
  }, [members, attendanceState, hostId]);

  if (!isOpen) return null;

  const summaryAttendedCount = attendedMembers.length;
  const summaryDidNotAttendCount = otherMembers.length;

  const handleHeaderBack = () => {
    if (step === 'summary') {
      setStep('attendance');
    } else {
      onBack();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-none">
      {/* Top Navigation Bar with Back Arrow and Title */}
      <div className="px-4 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-3 flex items-center gap-2 flex-shrink-0 relative z-30 min-h-[52px] border-b border-white/10">
        <button
          type="button"
          onClick={handleHeaderBack}
          className="p-2 -ml-2 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center rounded-full"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-white tracking-tight">
          {step === 'attendance' ? 'Who attended?' : 'Review Completion'}
        </h1>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-6">
        {step === 'attendance' ? (
          <>
            <div>
              <p className="text-[14px] text-white/60 leading-[1.55]">
                Confirm who actually came to the plan. Tap a participant to change their attendance state.
              </p>
            </div>

            {/* ATTENDED SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-[12px] font-semibold text-white/90 uppercase tracking-wider">
                  Attended ({attendedMembers.length})
                </h3>
                <button
                  type="button"
                  onClick={setAllJoinedToAttended}
                  className="text-[13px] font-medium text-blue-400 hover:text-blue-300 active:opacity-70 transition-opacity cursor-pointer"
                >
                  Everyone attended
                </button>
              </div>

              <div className="bg-[#111111] rounded-2xl border border-white/10 p-3 space-y-2">
                {attendedMembers.map((m) => {
                  const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
                  const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
                  const subtitle = getMemberSubtitle(m, true, isHostUser);

                  return (
                    <div key={mId} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative">
                          <UserAvatar src={m.avatar || (m as any).profile_photo} alt={m.name} size="w-full h-full" />
                          <div className="absolute inset-0 rounded-full border border-white/10" />
                        </div>
                        <div>
                          <span className="text-[15px] font-medium text-white block">
                            {m.name || 'Participant'}
                          </span>
                          {subtitle && (
                            <span className="text-[12px] text-white/40 block">{subtitle}</span>
                          )}
                        </div>
                      </div>

                      {isHostUser ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 opacity-60">
                          <Check className="w-4 h-4 text-emerald-400" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleAttendance(mId)}
                          className="w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 flex items-center justify-center border border-emerald-500/40 active:scale-95 transition-transform cursor-pointer"
                          title="Click to mark absent"
                        >
                          <Check className="w-4 h-4 text-emerald-400" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OTHER PEOPLE SECTION */}
            {otherMembers.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">
                  Other people ({otherMembers.length})
                </h3>

                <div className="bg-[#111111] rounded-2xl border border-white/10 p-3 space-y-2">
                  {otherMembers.map((m) => {
                    const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
                    const subtitle = getMemberSubtitle(m, false, false);

                    return (
                      <div key={mId} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors opacity-80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative">
                            <UserAvatar src={m.avatar || (m as any).profile_photo} alt={m.name} size="w-full h-full" />
                            <div className="absolute inset-0 rounded-full border border-white/10" />
                          </div>
                          <div>
                            <span className="text-[15px] font-medium text-white block">
                              {m.name || 'Participant'}
                            </span>
                            {subtitle && (
                              <span className="text-[12px] text-white/40 block">{subtitle}</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAttendance(mId)}
                          className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 text-[13px] font-medium active:scale-95 transition-all cursor-pointer border border-white/10"
                        >
                          Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* SUMMARY STEP */
          <div className="flex flex-col items-center text-center pt-8 space-y-6 max-w-sm mx-auto">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Check className="w-10 h-10 text-emerald-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-[24px] font-bold text-white">Complete this plan?</h2>
              <p className="text-[15px] text-white/70 leading-[1.5]">
                <span className="font-semibold text-white">{summaryAttendedCount}</span> {summaryAttendedCount === 1 ? 'person' : 'people'} attended.<br />
                {summaryDidNotAttendCount > 0 && (
                  <>
                    <span className="font-semibold text-white">{summaryDidNotAttendCount}</span> {summaryDidNotAttendCount === 1 ? 'person' : 'people'} didn't attend.
                  </>
                )}
              </p>
            </div>

            <div className="w-full bg-[#111111] p-4 rounded-2xl border border-white/10 text-left text-xs text-white/50 space-y-1">
              <p className="font-semibold text-white/70 text-sm">Note</p>
              <p>Completing this plan will move it to Past Plans. Participant attendance states will be saved permanently.</p>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Bottom Action Bar */}
      <div className="p-4 bg-[#050505]/95 backdrop-blur-md border-t border-white/10 flex flex-col gap-3 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {step === 'attendance' ? (
          <button
            type="button"
            onClick={() => setStep('summary')}
            className="w-full py-4 rounded-2xl text-[15px] font-semibold text-black active:scale-[0.98] transition-all cursor-pointer bg-white hover:bg-white/90"
          >
            Review
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                const payload = members
                  .map((m) => {
                    const mId = m.userId || m.userUuid || (m as any).user_id || (m as any).id;
                    const isHostUser = m.isHost || m.role === 'HOST' || mId === hostId;
                    const originalStatus = normalizeStatus(m.joinState || (m as any).rsvp_status);
                    const isAttended = isHostUser || attendanceState[mId] === 'ATTENDED';

                    // 1. Host or explicitly added participant -> ATTENDED
                    if (isAttended) {
                      return {
                        user_id: mId,
                        attendance: 'ATTENDED' as const,
                      };
                    }

                    // 2. JOINED participant explicitly marked absent -> DID_NOT_ATTEND
                    if (originalStatus === 'JOINED') {
                      return {
                        user_id: mId,
                        attendance: 'DID_NOT_ATTEND' as const,
                      };
                    }

                    // 3. Untouched non-JOINED participant -> Omit from payload
                    return null;
                  })
                  .filter(
                    (entry): entry is {
                      user_id: string;
                      attendance: 'ATTENDED' | 'DID_NOT_ATTEND';
                    } => entry !== null
                  );
                onConfirm(payload);
              }}
              className="w-full py-4 rounded-2xl text-[15px] font-semibold text-black active:scale-[0.98] transition-all cursor-pointer bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isSubmitting ? "Completing Plan…" : "Complete Plan"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep('attendance')}
              className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white/80 hover:text-white active:scale-[0.98] transition-all cursor-pointer bg-white/10"
            >
              Back to attendance
            </button>
          </>
        )}
      </div>
    </div>
  );
};
