import React, { useState, useEffect } from "react";
import { X, Compass, Film, UtensilsCrossed, CalendarDays, Users, Plus, Minus, ChevronRight, Clock, UserCheck } from "lucide-react";
import { WheelPicker } from "../components/WheelPicker";
import { RSVP } from "../components/RSVP";
import { ExitEditingDialog } from "../components/ExitEditingDialog";
import { PlanSizeSlider } from "../components/PlanSizeSlider";
import { ContinueButton } from "../components/ContinueButton";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { pickImageFromGallery } from "../../../shared/utils/imageUtils";
import { PlanImageEditorModal } from "../components/PlanImageEditorModal";

interface WhenIsPlanScreenProps {
  form: any;
  coverImage: string;
  title: string;
  onBack: () => void;
  onContinue: () => void;
  setWhenStepValid?: (isValid: boolean) => void;
  selectedCategory?: string;
  selectedSubcategory?: string | null;
}

export const WhenIsPlanScreen: React.FC<WhenIsPlanScreenProps> = ({
  form,
  coverImage,
  title,
  onBack,
  onContinue,
  selectedCategory = 'custom',
}) => {
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [editorImageFile, setEditorImageFile] = useState<File | Blob | string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const isAlreadySetup = form.totalCapacity !== undefined && form.totalCapacity >= 2 && form.totalCapacity <= 50;

  const handlePickCoverImage = async () => {
    try {
      const file = await pickImageFromGallery();
      if (!file) return;
      setEditorImageFile(file);
      setIsEditorOpen(true);
    } catch (err: any) {
      console.error("[WhenIsPlanScreen] Error picking cover image:", err);
    }
  };

  const [activeExpandedSection, setActiveExpandedSection] = useState<'date' | 'time' | 'rsvp' | 'plansize' | null>(() => isAlreadySetup ? null : 'date');
  const [targetExpandedSection, setTargetExpandedSection] = useState<'date' | 'time' | 'rsvp' | 'plansize' | null>(() => isAlreadySetup ? null : 'date');
  const [rsvpDeadline, setRsvpDeadline] = useState<string | null>(form.rsvpDeadline || null);
  const [showSportsTooltip, setShowSportsTooltip] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(() => isAlreadySetup);
  const [planSizeErrorText, setPlanSizeErrorText] = useState<string | null>(null);
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Keep a ref so click-outside handler always reads the latest capacity
  const totalCapacityRef = React.useRef(form.totalCapacity);
  useEffect(() => { totalCapacityRef.current = form.totalCapacity; }, [form.totalCapacity]);
  const activeExpandedSectionRef = React.useRef(activeExpandedSection);
  useEffect(() => { activeExpandedSectionRef.current = activeExpandedSection; }, [activeExpandedSection]);
  // Ref that Done button sets synchronously before triggering navigation, so the guard can pass
  const planSizeDoneCommittedRef = React.useRef(false);

  // Title editing state - pulled to top level
  const defaultTitleFallback = selectedCategory === 'custom' ? 'Enter Title' : 'MATCHDAY';
  const [isEditingTitle, setIsEditingTitle] = useState(() => {
    return selectedCategory === 'custom' && (!form.localTitle || form.localTitle === 'Enter Title');
  });
  const [titleInputValue, setTitleInputValue] = useState(() => form.localTitle || defaultTitleFallback);
  const titleInputRef = React.useRef<HTMLDivElement>(null);

  // Sync titleInputValue when form.localTitle changes (e.g. from reset)
  useEffect(() => {
    setTitleInputValue(form.localTitle || defaultTitleFallback);
  }, [form.localTitle, defaultTitleFallback]);

  // Focus and select title input when editing is enabled
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(titleInputRef.current);
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
    const finalVal = trimmed === "" ? defaultTitleFallback : trimmed;
    form.setLocalTitle(finalVal);
    setTitleInputValue(finalVal);
  };

  // Guided flow step completion flags (Date and Time have default values initialized on mount, so they are completed by default)
  const [hasCompletedDate, setHasCompletedDate] = useState(true);
  const [hasCompletedTime, setHasCompletedTime] = useState(true);
  const [hasCompletedRSVP, setHasCompletedRSVP] = useState(true); // Default RSVP Plan Start is pre-filled
  const [hasCompletedPlanSize, setHasCompletedPlanSize] = useState(() => isAlreadySetup);
  const [isPressedCategoryBadge, setIsPressedCategoryBadge] = useState(false);

  // Auto-dismiss logic for category tooltip
  useEffect(() => {
    if (showSportsTooltip) {
      const timer = setTimeout(() => {
        setShowSportsTooltip(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSportsTooltip]);

  // Auto-set branch default for Paris Panini
  useEffect(() => {
    const currentTitleValue = form.localTitle || defaultTitleFallback;
    if (currentTitleValue === "Paris Panini" && !["New BEL", "Koramangala", "MG Road"].includes(form.localLocation)) {
      form.setLocalLocation("New BEL");
    }
  }, [form.localTitle, form.localLocation, defaultTitleFallback]);

  // Document level click handler to dismiss tooltip when clicking elsewhere
  useEffect(() => {
    if (showSportsTooltip) {
      const handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && !target.closest('.sports-badge-container')) {
          setShowSportsTooltip(false);
        }
      };
      document.addEventListener('click', handleOutsideClick);
      return () => document.removeEventListener('click', handleOutsideClick);
    }
  }, [showSportsTooltip]);

  // Helper to calculate minimum valid plan time (rounded up to the next 5-minute boundary + 5 mins)
  const getMinValidPlanTime = (): Date => {
    const timeMs = Date.now();
    const fiveMinMs = 5 * 60 * 1000;
    return new Date(Math.ceil(timeMs / fiveMinMs) * fiveMinMs + fiveMinMs);
  };

  // Track the running state of date/time from WheelPicker's onChange
  const [selectedDateTime, setSelectedDateTime] = useState<Date>(() => form.eventDateTime || getMinValidPlanTime());

  // Periodically check if plan time has become stale (reaches or exceeds current time)
  useEffect(() => {
    const checkStaleTime = () => {
      const now = Date.now();
      if (now >= selectedDateTime.getTime()) {
        const fiveMinMs = 5 * 60 * 1000;
        const minValid = new Date(Math.ceil(now / fiveMinMs) * fiveMinMs + fiveMinMs);
        setSelectedDateTime(minValid);
        form.setEventDateTime(minValid);
      }
    };

    // Run check immediately on mount
    checkStaleTime();

    // Check system time every 5 seconds
    const interval = setInterval(checkStaleTime, 5000);
    return () => clearInterval(interval);
  }, [selectedDateTime]);

  // Sync selectedDateTime when form.eventDateTime is updated by the hook's background monitor
  useEffect(() => {
    if (form.eventDateTime && form.eventDateTime.getTime() !== selectedDateTime.getTime()) {
      setSelectedDateTime(form.eventDateTime);
    }
  }, [form.eventDateTime]);

  const initialDate = selectedDateTime;
  const initialHours = selectedDateTime.getHours();
  const initialMinutes = selectedDateTime.getMinutes();

  // Helper text definitions
  const hasValidPlanSize = form.totalCapacity !== undefined && form.totalCapacity >= 2 && form.totalCapacity <= 50;

  // RSVP Validation helper
  const getRsvpDeadlineDate = (date: Date, rsvp: string | null): Date => {
    const d = new Date(date.getTime());
    if (!rsvp) return d;
    if (rsvp.includes('1 Hour')) {
      d.setHours(d.getHours() - 1);
    } else if (rsvp.includes('12 Hours')) {
      d.setHours(d.getHours() - 12);
    } else if (rsvp.includes('24 Hours')) {
      d.setHours(d.getHours() - 24);
    }
    return d;
  };

  const calculatedRsvpDate = getRsvpDeadlineDate(selectedDateTime, rsvpDeadline);
  const isRsvpValid = calculatedRsvpDate.getTime() > Date.now();
  const allStepsCompleted = hasCompletedDate && hasCompletedTime && hasCompletedRSVP && hasValidPlanSize && isRsvpValid;

  // When the plan size card opens with no value set yet, immediately show the sentinel error
  useEffect(() => {
    if (activeExpandedSection === 'plansize' && form.totalCapacity === undefined) {
      setPlanSizeErrorText('Planless');
    }
  }, [activeExpandedSection]);

  const handleWheelChange = (hours: number, minutes: number, date: Date) => {
    setSelectedDateTime(date);
    if (activeExpandedSection === 'date') {
      setHasCompletedDate(true);
    } else if (activeExpandedSection === 'time') {
      setHasCompletedTime(true);
    }
  };

  // Click outside to collapse in review mode
  useEffect(() => {
    if (!setupCompleted || activeExpandedSection === null || showExitDialog) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.when-is-plan-card') && !target.closest('.sports-badge-container')) {
        // If plan size card is open in review mode, block if value is invalid
        if (activeExpandedSectionRef.current === 'plansize') {
          const cap = totalCapacityRef.current;
          const hasPlanSizeError = cap === undefined || cap < 2 || cap > 50;
          if (hasPlanSizeError) {
            // Only upgrade the error text if still in the unset (-1) state;
            // for 0/1/>50 the onChange message is already visible — leave it.
            if (cap === undefined) setPlanSizeErrorText('Set a plan size.');
            return;
          }
        }
        handleSectionToggle(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [setupCompleted, activeExpandedSection, showExitDialog]);

  const handleSectionToggle = (section: 'date' | 'time' | 'rsvp' | 'plansize' | null) => {
    // If collapsing the RSVP section but it's currently invalid, block the collapse action
    if (activeExpandedSection === 'rsvp' && section !== 'rsvp' && !isRsvpValid) {
      return;
    }

    // If collapsing the Plan Size section, block based on flow mode:
    // - Guided flow (!setupCompleted): ALWAYS block — user must use the Done button to exit,
    //   UNLESS the Done button explicitly committed via planSizeDoneCommittedRef
    // - Review mode (setupCompleted): block only when current value is invalid
    if (activeExpandedSection === 'plansize' && section !== 'plansize') {
      const hasPlanSizeError = form.totalCapacity === undefined || form.totalCapacity < 2 || form.totalCapacity > 50;
      const doneCommitted = planSizeDoneCommittedRef.current;
      planSizeDoneCommittedRef.current = false; // always reset after reading
      if (hasPlanSizeError && ((!setupCompleted && !doneCommitted) || setupCompleted)) {
        // Only overwrite the error if still in unset state; otherwise leave onChange's message.
        if (form.totalCapacity === undefined) setPlanSizeErrorText('Set a plan size.');
        return;
      }
    }

    let nextTargetSection = section;

    if (setupCompleted) {
      // In review mode: toggle sections without sequential progression
      nextTargetSection = section;
    } else {
      // Sequential expansion logic on collapse events
      if (section === null) {
        if (activeExpandedSection === 'date') {
          nextTargetSection = 'time';
        } else if (activeExpandedSection === 'time') {
          nextTargetSection = 'rsvp';
        } else if (activeExpandedSection === 'rsvp') {
          nextTargetSection = 'plansize';
        } else if (activeExpandedSection === 'plansize') {
          nextTargetSection = null;
        }
      }
    }

    const isExpanding = nextTargetSection !== null;
    const isButtonCurrentlyVisible = setupCompleted && allStepsCompleted && activeExpandedSection === null;

    setTargetExpandedSection(nextTargetSection);
    setActiveExpandedSection(nextTargetSection);
  };

  const handleConfirm = () => {
    form.setEventDateTime(selectedDateTime);
    if (form.setRsvpDeadline) {
      form.setRsvpDeadline(rsvpDeadline);
    } else {
      form.rsvpDeadline = rsvpDeadline;
    }
    onContinue();
  };

  // Format date parts for live summary sentence
  const formattedDate = selectedDateTime.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const formattedTime = selectedDateTime.toLocaleDateString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).split(',')[1]?.trim() || selectedDateTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div
      className="flex flex-col bg-[#000000] text-left select-none overflow-hidden"
      style={{
        fontFamily: 'Inter, sans-serif',
        height: '100dvh',
        width: '100%',
        position: 'relative'
      }}
    >
      {/* ── Hero image (Vercel Core: sharp top container, full color backdrop) ── */}
      <div
        onClick={handlePickCoverImage}
        className="relative w-full shrink-0 h-[220px] cursor-pointer"
        title="Tap to change photo"
      >
        <DiscoveryImages
          src={coverImage}
          category={selectedCategory}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-black/40 to-transparent pointer-events-none z-0" />

        {/* Top Action Row: [X] - Pinned centered Title - [Badge] */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 0,
            right: 0,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 20
          }}
        >
          {/* X button (Translucent/frameless, only cross symbol visible) */}
          <button
            type="button"
            onClick={() => setShowExitDialog(true)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              outline: 'none',
              padding: 0
            }}
          >
            <X className="w-4 h-4" />
          </button>

          {/* Centered navigation bar spacing */}
          <div style={{ width: 32 }} />

          {/* Right-aligned Category Badge (Highly visible glass badge with white border and bright icon) */}
          <div style={{ position: 'relative', zIndex: 30 }}>
            {(() => {
              // Derive config (colors, icon, label) based on selectedCategory
              const getBadgeConfig = (category: string) => {
                const cat = category.toUpperCase();
                if (cat === "SPORTS") {
                  return {
                    label: "Sports",
                    color: "#10B981", // Emerald-500
                    bg: "rgba(16, 185, 129, 0.22)",
                    border: "#10B981",
                    glow: "rgba(16, 185, 129, 0.25)",
                    icon: <Compass className="w-4 h-4 text-[#10B981]" style={{ filter: 'drop-shadow(0 0 2px rgba(16, 185, 129, 0.4))' }} />
                  };
                }
                if (cat === "MOVIES") {
                  return {
                    label: "Movies",
                    color: "#8B5CF6", // Violet-500 (#8B5CF6 to match text-violet-500 or #A78BFA)
                    bg: "rgba(139, 92, 246, 0.22)",
                    border: "#8B5CF6",
                    glow: "rgba(139, 92, 246, 0.25)",
                    icon: <Film className="w-4 h-4 text-[#8B5CF6]" style={{ filter: 'drop-shadow(0 0 2px rgba(139, 92, 246, 0.4))' }} />
                  };
                }
                if (cat === "DINING") {
                  return {
                    label: "Dining",
                    color: "#F43F5E", // Rose-500 (#F43F5E to match text-rose-500 or #FB7185)
                    bg: "rgba(244, 63, 94, 0.22)",
                    border: "#F43F5E",
                    glow: "rgba(244, 63, 94, 0.25)",
                    icon: <UtensilsCrossed className="w-4 h-4 text-[#F43F5E]" style={{ filter: 'drop-shadow(0 0 2px rgba(244, 63, 94, 0.4))' }} />
                  };
                }
                // Custom
                return {
                  label: "Custom",
                  color: "#A1A1AA", // Zinc-400 (#A1A1AA to match text-zinc-400 or #FFFFFF)
                  bg: "rgba(161, 161, 170, 0.22)",
                  border: "rgba(255, 255, 255, 0.15)",
                  glow: "rgba(161, 161, 170, 0.1)",
                  icon: <CalendarDays className="w-4 h-4 text-[#A1A1AA]" style={{ filter: 'drop-shadow(0 0 2px rgba(161, 161, 170, 0.4))' }} />
                };
              };

              const badgeConfig = getBadgeConfig(selectedCategory);

              return (
                <div className="sports-badge-container">
                  <button
                    type="button"
                    onMouseDown={() => setIsPressedCategoryBadge(true)}
                    onMouseUp={() => setIsPressedCategoryBadge(false)}
                    onMouseLeave={() => setIsPressedCategoryBadge(false)}
                    onTouchStart={() => setIsPressedCategoryBadge(true)}
                    onTouchEnd={() => setIsPressedCategoryBadge(false)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSportsTooltip(!showSportsTooltip);
                    }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: badgeConfig.bg,
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: `1.5px solid ${badgeConfig.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: badgeConfig.color,
                      boxShadow: `0 0 10px ${badgeConfig.glow}`,
                      cursor: 'pointer',
                      transform: isPressedCategoryBadge ? 'scale(0.96)' : 'scale(1)',
                      transition: 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.2s',
                      outline: 'none',
                      padding: 0
                    }}
                  >
                    {badgeConfig.icon}
                  </button>

                  {/* Native-style popover anchored directly below the badge (renders as a premium speech bubble) */}
                  {showSportsTooltip && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '52px',
                        right: '-2px',
                        background: '#111111',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 14,
                        padding: '8px 12px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        whiteSpace: 'nowrap',
                        animation: 'tooltipGrowFade 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                        pointerEvents: 'auto',
                        transformOrigin: 'top right'
                      }}
                    >
                      {/* CSS keyframe injection inside react node */}
                      <style>{`
                        @keyframes tooltipGrowFade {
                          from {
                            opacity: 0;
                            transform: scale(0.95) translateY(-4px);
                          }
                          to {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                          }
                        }
                      `}</style>

                      {/* Small rounded pointer tail pointing up to the category badge */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '18px',
                          width: 10,
                          height: 10,
                          background: '#111111',
                          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                          transform: 'rotate(45deg)',
                          borderRadius: '2px 0 0 0'
                        }}
                      />

                      <span style={{ fontSize: 14, fontWeight: 550, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                        {badgeConfig.label} Plan
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Live Summary Overlay (Centering title on the hero) */}
        <div className="absolute inset-x-5 top-[112px] -translate-y-1/2 z-10 flex flex-col items-center justify-center text-center" style={{ gap: 4, width: 'calc(100% - 40px)', paddingTop: 6 }}>
          {/* Subtle Context Label */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.09em', // Reduced tracking by ~35%
              color: 'rgba(255, 255, 255, 0.82)', // Increased opacity to ~82%
              fontFamily: 'Inter, sans-serif',
              userSelect: 'none'
            }}
          >
            PLAN NAME
          </span>

          {/* Editable MATCHDAY Hero Title (Primary visual focus with 30 char limit & multiline ellipsis) */}
          {(() => {
            const currentTitleValue = form.localTitle || defaultTitleFallback;
            const isExceeded = titleInputValue.length > 30;

            if (isEditingTitle) {
              return (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div
                    ref={titleInputRef as any}
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
                        // Put caret back to end
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
                      fontSize: 32,
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: '#FFFFFF',
                      fontFamily: 'Inter, sans-serif',
                      margin: 0,
                      lineHeight: 1.1,
                      textAlign: 'center',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      width: '100%',
                      padding: 0,
                      minHeight: '35px',
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
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: '#EF4444', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      30 characters max. Keep it short and memorable.
                    </span>
                  )}
                </div>
              );
            }

            return (
              <h1
                onClick={() => setIsEditingTitle(true)}
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  fontFamily: 'Inter, sans-serif',
                  margin: 0,
                  lineHeight: 1.1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  width: '100%',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxHeight: '70px', // Restricts layout from growing vertically beyond 2 lines
                  wordBreak: 'break-word'
                }}
              >
                {currentTitleValue}
              </h1>
            );
          })()}

          {/* Branch Dropdown for Paris Panini */}
          {(form.localTitle || defaultTitleFallback) === "Paris Panini" && (
            <div className="relative z-30 mt-1 flex justify-center">
              <button
                type="button"
                onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="text-white/60 hover:text-white/80 text-[13px] font-semibold flex items-center gap-1 cursor-pointer transition-colors bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 hover:bg-white/10"
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
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-36 bg-zinc-950/95 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1 z-50 backdrop-blur-md">
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
          )}

          {/* Date and Time (Single line, secondary visual focus) */}
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.75)',
              margin: 0,
              marginTop: 2,
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap'
            }}
          >
            {formattedDate} • {formattedTime}
          </h2>
        </div>
      </div>

      {/* ── Content Area (Scrollable space dynamically containing pickers) ── */}
      <div
        className="flex-1 flex flex-col gap-4 overflow-hidden"
        style={{
          padding: '16px 20px 8px'
        }}
      >
        {/* Date / Time Card Block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WheelPicker
            initialDate={initialDate}
            initialHours={initialHours}
            initialMinutes={initialMinutes}
            onChange={handleWheelChange}
            activePicker={activeExpandedSection === 'date' || activeExpandedSection === 'time' ? activeExpandedSection : null}
            onPickerToggle={(picker) => {
              handleSectionToggle(activeExpandedSection === picker ? null : picker);
            }}
          />
        </div>

        <RSVP
          selectedValue={rsvpDeadline}
          onChange={(val) => {
            setRsvpDeadline(val);
            setHasCompletedRSVP(true);
          }}
          isExpanded={activeExpandedSection === 'rsvp'}
          onToggle={() => {
            handleSectionToggle(activeExpandedSection === 'rsvp' ? null : 'rsvp');
          }}
          hasError={!isRsvpValid}
          errorText="Not enough time left for everyone to respond. Choose a later response deadline or a later plan time."
        />

        {/* ── Plan Size Box (Matches date/time & RSVP toggle designs, numeric only input constrained between 2 and 50) ── */}
        <div
          className="when-is-plan-card"
          style={{
            borderRadius: 24,
            background: 'rgba(8, 8, 8, 0.72)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: planSizeErrorText
              ? '1px solid #EF4444'
              : '1px solid rgba(255, 255, 255, 0.06)',
            overflow: 'hidden',
            height: activeExpandedSection === 'plansize'
              ? 236
              : 48,
            transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease-in-out',
            willChange: 'height',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden'
          }}
        >
          {/* Top row Toggle Button */}
          <button
            type="button"
            onClick={() => {
              // Block collapsing card:
              // - Guided flow: always block (must use Done button)
              // - Review mode: block only when value is invalid
              const hasPlanSizeError = form.totalCapacity === undefined || form.totalCapacity < 2 || form.totalCapacity > 50;
              const shouldBlock = activeExpandedSection === 'plansize' && (!setupCompleted || hasPlanSizeError);
              if (shouldBlock) {
                // Only overwrite with "Set a plan size." for the unset sentinel;
                // for 0/1/>50 the onChange message is already showing.
                if (form.totalCapacity === undefined) setPlanSizeErrorText('Set a plan size.');
                return;
              }
              handleSectionToggle(activeExpandedSection === 'plansize' ? null : 'plansize');
            }}
            style={{
              width: '100%',
              height: 48,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              cursor: (form.totalCapacity === undefined || form.totalCapacity < 2 || form.totalCapacity > 50) && activeExpandedSection === 'plansize' ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <Users className="w-5 h-5 text-white/40 shrink-0" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>
                  Plan Size
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)', fontWeight: 400, lineHeight: 1.1 }}>
                  Minimum 2 people (includes you)
                </span>
              </div>
            </div>

            {/* Value display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeExpandedSection !== 'plansize' && (
                <span style={{ fontSize: 14, fontWeight: 600, color: planSizeErrorText ? '#EF4444' : '#FFFFFF' }}>
                  {form.totalCapacity !== undefined && !isNaN(form.totalCapacity) ? (form.totalCapacity === 51 ? "> 50 people" : form.totalCapacity === 1 ? "1 person" : `${form.totalCapacity} people`) : "-"}
                </span>
              )}
            </div>
          </button>

          {/* Bottom row: Expandable Full width slider container */}
          <div
            style={{
              height: activeExpandedSection === 'plansize'
                ? 188 // Keep static height when open to prevent height jitter when error shows/hides
                : 0,
              minHeight: 0,
              opacity: activeExpandedSection === 'plansize' ? 1 : 0,
              visibility: activeExpandedSection === 'plansize' ? 'visible' : 'hidden',
              transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
              background: 'transparent',
              padding: activeExpandedSection === 'plansize' ? '8px 16px 10px' : '0 16px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlanSizeSlider
                value={form.totalCapacity}
                onChange={(val) => {
                  form.setTotalCapacity(val);
                  if (val >= 2 && val <= 50) {
                    setHasCompletedPlanSize(true);
                    setPlanSizeErrorText(null);
                  } else {
                    if (val === 0) {
                      setPlanSizeErrorText("Someone has to show up. Start with at least two people.");
                    } else if (val === 1) {
                      setPlanSizeErrorText("One person? That's more of a personal mission than a plan.");
                    } else {
                      setPlanSizeErrorText("Planning a festival? Planless currently supports up to 50 people.");
                    }
                  }
                }}
                hasError={form.totalCapacity === undefined || form.totalCapacity < 2 || form.totalCapacity > 50}
              />
            </div>
            {/* Dedicated People Count Text indicator beneath the slider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: planSizeErrorText ? '#EF4444' : '#FFFFFF' }}>
                {form.totalCapacity !== undefined && !isNaN(form.totalCapacity)
                  ? (form.totalCapacity === 51 ? '> 50 people' : form.totalCapacity === 1 ? '1 person' : `${form.totalCapacity} people`)
                  : '–'}
              </span>

              {/* Done option button - only shows when size is valid (not 0, 1, or > 50 / 51) */}
              {form.totalCapacity !== undefined && form.totalCapacity >= 2 && form.totalCapacity <= 50 && (
                <button
                  type="button"
                  onClick={() => {
                    // Done button: commit the plan size and close the card.
                    // Set the ref BEFORE calling handleSectionToggle so the guard knows
                    // this navigation was explicitly triggered by Done.
                    planSizeDoneCommittedRef.current = true;
                    setSetupCompleted(true);
                    handleSectionToggle(null);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 4,
                    color: '#FFFFFF',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    marginTop: 2,
                    fontFamily: 'Inter, sans-serif'
                  }}
                >
                  Done
                </button>
              )}
            </div>

            {/* Validation Error Banner (Embedded directly below the people field inside active card wrapper) */}
            <div
              style={{
                height: 24,
                width: 'calc(100% + 32px)', // Negate the parent's padding: 16px left + 16px right
                opacity: planSizeErrorText ? 1 : 0,
                transform: planSizeErrorText ? 'translateY(0)' : 'translateY(4px)',
                transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                pointerEvents: 'none',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                willChange: 'opacity, transform'
              }}
            >
              <p style={{ color: '#EF4444', fontSize: 10, fontWeight: 700, margin: 0, padding: '0 6px', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                {planSizeErrorText}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Fixed Bottom Validation UI ── */}
      {setupCompleted && allStepsCompleted && targetExpandedSection === null && (
        selectedCategory === 'custom' && (!form.localTitle || form.localTitle === "Enter Title" || form.localTitle.trim() === "") ? null : (
          <ContinueButton
            disabled={!form.totalCapacity || form.totalCapacity < 2 || form.totalCapacity > 50}
            onClick={handleConfirm}
            text="Continue"
          />
        )
      )}

      {/* ── Exit dialog ── */}
      <ExitEditingDialog
        visible={showExitDialog}
        onKeepEditing={() => setShowExitDialog(false)}
        onStopEditing={() => { setShowExitDialog(false); onBack(); }}
      />

      <PlanImageEditorModal
        imageSrc={editorImageFile}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorImageFile(null);
        }}
        onSave={({ previewUrl, blob }) => {
          form.setCustomCoverImage(previewUrl, blob);
          setIsEditorOpen(false);
          setEditorImageFile(null);
        }}
      />
    </div>
  );
};
