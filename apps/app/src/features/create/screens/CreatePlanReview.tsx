import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Clock, Check, MapPin } from "lucide-react";
import { UserProfile } from "../../../core/types";
import { useToast } from "../../../shared/contexts/ToastContext";
import { getPlanCover } from "../../plans/config/planCoverImages";
import { formatPlanDate } from "../../../../lib/mappers";
import { ParticipantToggleBarCreate } from "../components/ParticipantToggleBarCreate";
import { PlanDetailOverviewCard } from "../../participants/components/PlanDetailOverviewCard";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { LocationAutocompleteInput } from "../../../shared/components/LocationAutocompleteInput";


interface CreatePlanReviewProps {
  form: any;
  selectedCategory: string;
  selectedSubcategory: string | null;
  onBack: () => void;
  onEditDate?: () => void;
  onEditParticipants?: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const CreatePlanReview: React.FC<CreatePlanReviewProps> = ({
  form,
  selectedCategory,
  selectedSubcategory,
  onBack,
  onEditDate,
  onEditParticipants,
  onSubmit,
  isSubmitting
}) => {
  const { showToast } = useToast();

  // Spacing & plan attributes
  const planSize = form.totalCapacity || 2;
  const titleToUse = (form.localTitle || "New Activity").trim();

  // Plan overview popover state (matches WhoIsActuallyComing behaviour)
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);

  // Formatted date/time for PlanDetailOverviewCard
  const eventDateObj = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
  const formattedDate = eventDateObj.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const formattedTime = eventDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  // ParticipantToggleBar state
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Cost splitting states
  const [addCost, setAddCost] = useState(form.costAmount > 0);
  const [costInput, setCostInput] = useState(form.costAmount > 0 ? String(form.costAmount) : "");
  const [costConfirmed, setCostConfirmed] = useState(form.costAmount > 0);

  // Update form state live when costInput or toggle changes
  const numericCost = parseFloat(costInput) || 0;
  const splitCost = numericCost > 0 ? Math.ceil(numericCost / planSize) : 0;

  useEffect(() => {
    if (addCost && numericCost > 0) {
      form.setCostAmount(numericCost);
    } else {
      form.setCostAmount(0);
    }
  }, [addCost, numericCost]);



  // Build a synthetic Plan object for ParticipantToggleBar
  const syntheticPlan = useMemo(() => {
    const hostId = form.userProfile?.dbUuid || form.activeUserId || 'host';
    const hostName = form.userProfile?.name || 'You';
    const hostAvatar = form.userProfile?.avatar || form.userProfile?.profile_photo || '';

    const priorityIds: string[] = form.priorityGuestIds || [];

    const friendMembers = (form.selectedFriends || []).map((f: any) => {
      const fId = f.id || f.dbUuid;
      // Friends are JOINED if within capacity (priority list) else WAITLISTED
      const isInGoing = priorityIds.length > 0
        ? priorityIds.includes(fId)
        : true; // if no priority list, all friends are going (capacity enforced by totalCapacity)
      return {
        userId: fId,
        userUuid: fId,
        name: f.name,
        avatar: f.avatar || '',
        joinState: isInGoing ? 'JOINED' : 'WAITLISTED',
        reminderState: 'none',
        joinedAt: null,
        checkedIn: false,
      };
    });

    // If no priority list, slice by capacity to determine waitlist
    const membersWithState = priorityIds.length > 0
      ? friendMembers
      : friendMembers.map((m: any, idx: number) => ({
        ...m,
        // First (planSize - 1) non-host slots are JOINED, rest WAITLISTED
        joinState: idx < planSize - 1 ? 'JOINED' : 'WAITLISTED',
      }));

    return {
      id: 'preview',
      title: titleToUse,
      category: selectedCategory,
      subcategory: selectedSubcategory,
      hostId,
      creatorName: hostName,
      creatorAvatar: hostAvatar,
      maxSpots: planSize,
      status: 'LIVE',
      members: membersWithState,
      // Required Plan fields with safe defaults
      date: '',
      time: '',
      location: (form.localLocation || '').trim(),
      cost: 0,
      confirmedCount: 1,
      creatorId: hostId,
      joinedUsers: [],
      timeline: 'today',
      description: '',
      circleId: null,
      groupId: null,
      paymentAmount: 0,
      waitlistEnabled: false,
      waitlistUsers: [],
      interestedUsers: [],
    } as any;
  }, [form.userProfile, form.activeUserId, form.selectedFriends, form.priorityGuestIds, planSize, titleToUse, selectedCategory, selectedSubcategory, form.localLocation]);

  const syntheticUserProfile: UserProfile = useMemo(() => ({
    ...form.userProfile,
    user_id: form.userProfile?.dbUuid || form.activeUserId || 'host',
  }), [form.userProfile, form.activeUserId]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          form.setCustomCoverImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePublishPlan = () => {
    if (addCost && (!costInput.trim() || numericCost <= 0)) {
      showToast("Please enter a valid total cost amount.");
      return;
    }
    onSubmit();
  };

  return (
    <div
      className="flex-grow flex flex-col bg-[#000000] text-left relative overflow-hidden"
      style={{
        fontFamily: 'Inter, sans-serif',
        width: '100%',
        color: '#FFFFFF',
        height: '100%'
      }}
    >
      {/* Hidden file input for custom cover image */}
      {selectedCategory === 'custom' && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageChange}
        />
      )}

      {/* ── Scrollable Body Area ── */}
      <div className="flex-1 overflow-y-auto scrollbar-none pb-28">

        {/* ── Hero Section (contains back button + compass icon) ── */}
        <div
          id="immersive-plan-hero-container"
          className="relative w-full flex flex-col justify-end overflow-visible flex-shrink-0 h-[220px] z-30"
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-b-3xl">
            <DiscoveryImages
              src={form.customCoverImage || getPlanCover(selectedCategory, selectedSubcategory)}
              category={selectedCategory}
              alt={titleToUse}
              className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
              style={{
                cursor: selectedCategory === 'custom' ? 'pointer' : 'default',
                pointerEvents: 'auto'
              }}
              onClick={() => {
                if (selectedCategory === 'custom') {
                  fileInputRef.current?.click();
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-black/40 to-transparent pointer-events-none z-0" />
          </div>

          {/* Back button — top-left */}
          <button
            type="button"
            onClick={onBack}
            className="absolute top-4 left-4 z-20 flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#FFFFFF',
              cursor: 'pointer',
              padding: 0,
              outline: 'none'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

          {/* Category icon button — top-right, opens PlanDetailOverviewCard */}
          {(() => {
            const getCategoryStyle = (category?: string) => {
              const cat = (category || 'custom').toLowerCase();
              if (cat === 'sports') {
                return {
                  color: '#10B981',
                  bg: 'rgba(16, 185, 129, 0.22)',
                  border: '1.5px solid #10B981',
                  shadow: 'rgba(16, 185, 129, 0.25)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(16, 185, 129, 0.5))' }}>
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                  )
                };
              } else if (cat === 'movies') {
                return {
                  color: '#A78BFA',
                  bg: 'rgba(139, 92, 246, 0.22)',
                  border: '1.5px solid #8B5CF6',
                  shadow: 'rgba(139, 92, 246, 0.25)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(139, 92, 246, 0.5))' }}>
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                      <line x1="7" y1="2" x2="7" y2="22" />
                      <line x1="17" y1="2" x2="17" y2="22" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <line x1="2" y1="7" x2="7" y2="7" />
                      <line x1="2" y1="17" x2="7" y2="17" />
                      <line x1="17" y1="17" x2="22" y2="17" />
                      <line x1="17" y1="7" x2="22" y2="7" />
                    </svg>
                  )
                };
              } else if (cat === 'dining') {
                return {
                  color: '#FB7185',
                  bg: 'rgba(244, 63, 94, 0.22)',
                  border: '1.5px solid #F43F5E',
                  shadow: 'rgba(244, 63, 94, 0.25)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(244, 63, 94, 0.5))' }}>
                      <path d="m16 2-2.3 2.3c-.9.9-1.1 2.3-.4 3.3l4.7 4.7c1 .7 2.4.5 3.3-.4L22 9.6M14 6l.7.7M18 2s-3 7-3 10m0 0a3 3 0 0 0-3 3M15 12h-3m3 3h-3M3 22l6.8-6.8M20 22l-7.7-7.7M6 18c-.8.8-2 1-3 1-.3 0-.6-.3-.6-.6 0-1 .2-2.2 1-3l7-7.2L13 11z" />
                    </svg>
                  )
                };
              } else {
                return {
                  color: '#FFFFFF',
                  bg: 'rgba(255, 255, 255, 0.15)',
                  border: '1.5px solid rgba(255, 255, 255, 0.3)',
                  shadow: 'rgba(255, 255, 255, 0.1)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.4))' }}>
                      <path d="M8 2v4M16 2v4" />
                      <rect width="18" height="18" x="3" y="4" rx="2" />
                      <path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                    </svg>
                  )
                };
              }
            };
            const style = getCategoryStyle(selectedCategory);
            return (
              <button
                type="button"
                className="plan-details-toggle absolute top-4 right-4 z-20"
                onClick={() => setIsOverviewOpen(prev => !prev)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: style.bg,
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: style.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: style.color,
                  boxShadow: `0 0 10px ${style.shadow}`,
                  cursor: 'pointer',
                  transition: 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
                  transform: isOverviewOpen ? 'scale(0.94)' : 'scale(1)',
                  padding: 0,
                  outline: 'none'
                }}
              >
                {style.icon}
              </button>
            );
          })()}

          {/* PlanDetailOverviewCard — anchored below the compass icon */}
          <AnimatePresence>
            <PlanDetailOverviewCard
              planName={titleToUse}
              date={formattedDate}
              time={formattedTime}
              activityType={selectedCategory}
              visible={isOverviewOpen}
              onClose={() => setIsOverviewOpen(false)}
            />
          </AnimatePresence>

          {/* Plan title + inline date/time metadata */}
          <div className="px-5 pb-5 z-10 w-full relative">
            {(() => {
              const currentTitleValue = form.localTitle || 'MATCHDAY';
              const [isEditingTitle, setIsEditingTitle] = useState(false);
              const [titleInputValue, setTitleInputValue] = useState(currentTitleValue);
              const inputRef = React.useRef<HTMLDivElement>(null);

              useEffect(() => {
                setTitleInputValue(form.localTitle || 'MATCHDAY');
              }, [form.localTitle]);

              useEffect(() => {
                if (isEditingTitle && inputRef.current) {
                  inputRef.current.focus();
                  try {
                    const range = document.createRange();
                    range.selectNodeContents(inputRef.current);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  } catch (e) {
                    console.error("Selection failed", e);
                  }
                }
              }, [isEditingTitle]);

              const finishEditingTitle = () => {
                setIsEditingTitle(false);
                const trimmed = titleInputValue.trim();
                const finalVal = trimmed === "" ? "MATCHDAY" : trimmed;
                form.setLocalTitle(finalVal);
                setTitleInputValue(finalVal);
              };

              const isExceeded = titleInputValue.length > 30;

              if (isEditingTitle) {
                return (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginBottom: 8 }}>
                    <div
                      ref={inputRef as any}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={finishEditingTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          finishEditingTitle();
                        }
                      }}
                      onInput={(e) => {
                        const text = e.currentTarget.textContent || "";
                        if (text.length > 30) {
                          e.currentTarget.textContent = text.slice(0, 30);
                          const range = document.createRange();
                          const sel = window.getSelection();
                          range.selectNodeContents(e.currentTarget);
                          range.collapse(false);
                          sel?.removeAllRanges();
                          sel?.addRange(range);
                          setTitleInputValue(text.slice(0, 30));
                        } else {
                          setTitleInputValue(text);
                        }
                      }}
                      style={{
                        fontSize: 26,
                        fontWeight: 900,
                        letterSpacing: '-0.02em',
                        color: '#FFFFFF',
                        fontFamily: 'Inter, sans-serif',
                        margin: 0,
                        lineHeight: 1.1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        padding: 0,
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {currentTitleValue}
                    </div>
                    {isExceeded && (
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: '#EF4444', fontFamily: 'Inter, sans-serif' }}>
                        30 characters max. Keep it short and memorable.
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <h1
                  id="immersive-plan-title"
                  onClick={() => setIsEditingTitle(true)}
                  className="font-sans font-black text-[26px] text-white tracking-tight leading-none mb-2 select-text cursor-pointer"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word'
                  }}
                >
                  {currentTitleValue}
                </h1>
              );
            })()}
            {/* Single inline metadata row — clicking goes back to WhenIsPlan screen */}
            <div className="flex flex-col gap-3.5 mt-2.5 w-full">
              <div
                className="flex items-center gap-1.5 cursor-pointer active:opacity-75 transition-opacity inline-flex self-start"
                onClick={onEditDate}
              >
                <Calendar className="w-3 h-3 text-white/50 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-[12px] text-white/60 font-medium leading-none">{formattedDate}</span>
                <span className="text-[11px] text-white/30 leading-none mx-0.5">•</span>
                <Clock className="w-3 h-3 text-white/50 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-[12px] text-white/60 font-medium leading-none">{formattedTime}</span>
              </div>

              {/* Centralized Autocomplete location input container */}
              <div className="flex items-start gap-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 w-full min-w-0">
                <MapPin className="w-4 h-4 text-[#FF6B2C] shrink-0 mt-0.5" />
                <div className="flex-grow min-w-0">
                  <span className="text-[9px] text-white/40 uppercase font-extrabold tracking-wider leading-none block mb-1">Venue Location</span>
                  {form.localTitle === "Paris Panini" ? (
                    <div className="relative z-30">
                      <button
                        type="button"
                        onClick={() => setShowBranchMenu(!showBranchMenu)}
                        className="text-white text-[13px] font-semibold flex items-center gap-1 cursor-pointer transition-colors bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 hover:bg-white/10 mt-0.5"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <span>{form.localLocation || "New BEL"}</span>
                        <svg className="w-3 h-3 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {showBranchMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowBranchMenu(false)} />
                          <div className="absolute top-full left-0 mt-1 w-36 bg-zinc-950/95 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1 z-50 backdrop-blur-md">
                            {["New BEL", "Koramangala", "MG Road"].map((branch) => (
                              <button
                                key={branch}
                                type="button"
                                onClick={() => {
                                  form.setLocalLocation(branch);
                                  setShowBranchMenu(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                                  form.localLocation === branch
                                    ? "bg-white/10 text-white font-semibold"
                                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                {branch}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <LocationAutocompleteInput
                      value={form.localLocation || ""}
                      onChange={(val) => form.setLocalLocation(val)}
                      placeholder="Search venue address..."
                      className="w-full bg-transparent border-none text-white text-[13px] font-semibold leading-snug p-0 focus:outline-none placeholder-white/20"
                      onSelectPlace={(place) => {
                        form.setLocalLocation(place.name);
                        if (form.setPlaceId) form.setPlaceId(place.place_id);
                        if (form.setPlaceAddress) form.setPlaceAddress(place.formatted_address);
                        if (form.setLatitude) form.setLatitude(place.latitude);
                        if (form.setLongitude) form.setLongitude(place.longitude);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* ── ParticipantToggleBarCreate immediately below hero ── */}
        <div className="pt-3">
          <ParticipantToggleBarCreate
            plan={syntheticPlan}
            userProfile={syntheticUserProfile}
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
            onEditParticipants={onEditParticipants}
            waitlistMode={form.waitlistMode}
          />
        </div>


        {/* ── Cost Section ── */}
        <div className="px-6 pb-5 space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 font-bold block">Cost</h3>
            <div className="flex items-center gap-3 select-none">
              <span className="text-[10px] font-sans font-bold text-zinc-400">Add Cost</span>
              <button
                type="button"
                onClick={() => {
                  setAddCost(prev => !prev);
                  if (addCost) {
                    // toggling off: reset confirmed state
                    setCostConfirmed(false);
                    setCostInput("");
                  }
                }}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: addCost ? '#FF6B2C' : '#2C2C2E',
                  padding: 2,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: addCost ? 'flex-end' : 'flex-start',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: '#FFFFFF',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }}
                />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false} mode="wait">
            {addCost && !costConfirmed && (
              /* ── EDITING STATE ── */
              <motion.div
                key="cost-editor"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="bg-zinc-905 border border-zinc-900 rounded-3xl p-5 space-y-4 shadow-xl">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Total Cost</span>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#FF6B2C] font-black text-[20px] pointer-events-none">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={costInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || (/^\d*\.?\d*$/.test(val) && parseFloat(val) >= 0)) {
                              setCostInput(val);
                            }
                          }}
                          placeholder="0.00"
                          className="w-full bg-zinc-950 border border-white/8 rounded-2xl py-4 pl-10 pr-4 text-white text-[20px] font-black focus:outline-none focus:border-[#FF6B2C]/50 transition-colors"
                        />
                      </div>
                      {/* Confirm (Check) button */}
                      <button
                        type="button"
                        disabled={!costInput.trim() || numericCost <= 0}
                        onClick={() => {
                          if (numericCost > 0) {
                            form.setCostAmount(numericCost);
                            setCostConfirmed(true);
                          }
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          border: 'none',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: (!costInput.trim() || numericCost <= 0) ? 'not-allowed' : 'pointer',
                          background: (!costInput.trim() || numericCost <= 0)
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(34, 197, 94, 0.15)',
                          transition: 'all 0.2s ease',
                          boxShadow: (!costInput.trim() || numericCost <= 0)
                            ? 'none'
                            : '0 0 12px rgba(34,197,94,0.25)',
                        }}
                      >
                        <Check
                          size={16}
                          strokeWidth={2.5}
                          style={{
                            color: (!costInput.trim() || numericCost <= 0)
                              ? 'rgba(255,255,255,0.25)'
                              : '#22C55E',
                            transition: 'color 0.2s ease',
                          }}
                        />
                      </button>
                    </div>
                    {(!costInput.trim() || numericCost <= 0) && (
                      <p className="text-zinc-500 text-[10px] mt-1.5 font-medium">Please enter a cost amount to split.</p>
                    )}
                  </div>

                  {numericCost > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-medium pt-2 border-t border-white/[0.04]">
                      <span className="text-zinc-500">Split among {planSize} people</span>
                      <span className="text-[#FF6B2C] font-black text-[14px]">≈ ₹{splitCost} per person</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {addCost && costConfirmed && (
              /* ── CONFIRMED SUMMARY STATE ── */
              <motion.button
                key="cost-summary"
                type="button"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setCostConfirmed(false)}
                className="w-full text-left"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 20,
                  padding: '14px 18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                    ₹{splitCost} <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>per person</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                    Split from ₹{numericCost} · {planSize} people
                  </span>
                </div>
                {/* Edit hint */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* ── Pinned Bottom Create Button ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          background: 'linear-gradient(to top, #000000 80%, rgba(0,0,0,0))',
          zIndex: 40,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))'
        }}
      >
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handlePublishPlan}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 14,
            border: 'none',
            background: '#FF6B2C',
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(255, 107, 44, 0.3)',
            transition: 'all 0.2s',
            fontFamily: 'Inter, sans-serif'
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) e.currentTarget.style.opacity = '1';
          }}
        >
          {isSubmitting ? "Creating Plan..." : "Create Plan"}
        </button>
      </div>
    </div>
  );
};
