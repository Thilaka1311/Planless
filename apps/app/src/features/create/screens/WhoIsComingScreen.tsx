import React, { useState } from "react";
import { X, ArrowRight, Compass, Film, UtensilsCrossed, CalendarDays, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StepWho } from "../components/FriendsSelector";
import { getCategoryImage } from "../utils/constants";
import { PlanDetailOverviewCard } from "../../participants/components/PlanDetailOverviewCard";

interface WhoIsComingScreenProps {
  form: any;
  onBack: () => void;
  onContinue: () => void;
  selectedCategory: string;
  selectedSubcategory: string | null;
  confirmLabel?: string;
  headerTitle?: string;
  hideExitDialog?: boolean;
  hideOverviewToggle?: boolean;
  isAddParticipantMode?: boolean;
  isReplacementMode?: boolean;
  leavingParticipant?: { name: string; avatar?: string | null } | null;
  selectedReplacementFriend?: any | null;
}

export const WhoIsComingScreen: React.FC<WhoIsComingScreenProps> = ({
  form,
  onBack,
  onContinue,
  selectedCategory,
  selectedSubcategory,
  confirmLabel = "Continue",
  headerTitle = "Select friends",
  hideExitDialog = false,
  hideOverviewToggle = false,
  isAddParticipantMode = false,
  isReplacementMode = false,
  leavingParticipant = null,
  selectedReplacementFriend = null,
}) => {

  // Format date parts to match WhenIsPlanScreen header summary
  const eventDateObj = form.eventDateTime ? new Date(form.eventDateTime) : new Date();
  const formattedDate = eventDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const formattedTime = eventDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const title = form.localTitle || "New Activity";
  const coverImage = form.customCoverImage || getCategoryImage(selectedCategory, selectedSubcategory);

  const [isHeaderOpen, setIsHeaderOpen] = useState(false);
  const [showRemoveHostDialog, setShowRemoveHostDialog] = useState(false);

  const totalSelectedCount = isReplacementMode
    ? (selectedReplacementFriend ? 1 : 0)
    : ((form.selectedFriends?.length || 0) + (form.isHostSelected ? 1 : 0));
  const requiredSize = isReplacementMode ? 1 : (isAddParticipantMode ? 1 : (form.totalCapacity || 2));
  const isRequirementMet = isReplacementMode ? Boolean(selectedReplacementFriend) : (totalSelectedCount >= requiredSize);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#000000] text-left relative" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Standardized Header Top Bar with Unified Pill Search ── */}
      <div
        className="w-full shrink-0 px-2 flex items-center bg-[#000000] relative z-40 pt-2 pb-1"
        style={{ boxSizing: 'border-box' }}
      >
        {/* UNIFIED ELLIPTICAL / PILL-SHAPED SEARCH BOX */}
        <div
          className="w-full flex items-center rounded-full bg-[#18181B] border border-white/[0.08] px-3.5 transition-all focus-within:border-white/20 focus-within:bg-[#202024]"
          style={{ height: '46px' }}
        >
          {/* BACK BUTTON INSIDE PILL */}
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer mr-2.5 shrink-0 p-1"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* SEARCH INPUT */}
          <input
            id="search-people-input"
            name="searchPeopleInput"
            type="text"
            placeholder="Search friends…"
            value={form.searchPeopleQuery}
            onChange={(e) => form.setSearchPeopleQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 500,
              color: '#FFFFFF',
              border: 'none',
              outline: 'none',
              fontFamily: 'Inter, sans-serif'
            }}
            className="placeholder-zinc-500 min-w-0"
          />

          {/* CLEAR SEARCH BUTTON */}
          {form.searchPeopleQuery && (
            <button
              type="button"
              onClick={() => form.setSearchPeopleQuery("")}
              className="p-1 text-zinc-400 hover:text-white transition shrink-0 mr-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* DYNAMIC CATEGORY ICON INSIDE PILL ON FAR RIGHT */}
          {(() => {
            const getCategoryConfig = (category?: string) => {
              const cat = (category || 'custom').toUpperCase();
              if (cat === 'SPORTS' || cat === 'SPORT' || cat === 'FOOTBALL' || cat === 'BADMINTON') {
                return {
                  color: '#10B981',
                  icon: <Compass className="w-4.5 h-4.5 text-[#10B981]" style={{ filter: 'drop-shadow(0 0 1px rgba(16, 185, 129, 0.4))' }} />
                };
              }
              if (cat === 'MOVIES' || cat === 'CINEMA') {
                return {
                  color: '#A78BFA',
                  icon: <Film className="w-4.5 h-4.5 text-[#A78BFA]" style={{ filter: 'drop-shadow(0 0 1px rgba(139, 92, 246, 0.4))' }} />
                };
              }
              if (cat === 'DINING' || cat === 'RESTAURANTS' || cat === 'RESTAURANT' || cat === 'CAFE' || cat === 'FOOD') {
                return {
                  color: '#FB7185',
                  icon: <UtensilsCrossed className="w-4.5 h-4.5 text-[#FB7185]" style={{ filter: 'drop-shadow(0 0 1px rgba(244, 63, 94, 0.4))' }} />
                };
              }
              return {
                color: '#A1A1AA',
                icon: <CalendarDays className="w-4.5 h-4.5 text-[#A1A1AA]" style={{ filter: 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.4))' }} />
              };
            };
            const style = getCategoryConfig(selectedCategory);
            return (
              <button
                type="button"
                className="plan-details-toggle shrink-0 flex items-center justify-center p-1 rounded-full text-white/80 hover:text-white transition cursor-pointer"
                onClick={() => !hideOverviewToggle && setIsHeaderOpen(prev => !prev)}
                title="Plan Details"
              >
                {style.icon}
              </button>
            );
          })()}
        </div>

        {!hideOverviewToggle && (
          <AnimatePresence>
            <PlanDetailOverviewCard
              planName={title}
              date={formattedDate}
              time={formattedTime}
              activityType={selectedCategory}
              visible={isHeaderOpen}
              onClose={() => setIsHeaderOpen(false)}
            />
          </AnimatePresence>
        )}
      </div>

      {/* ── Content Area ── */}
      <div
        className="flex flex-col flex-1 min-h-0 relative"
        style={{
          paddingTop: '6px',
          paddingBottom: '0px',
        }}
      >

        <StepWho
          searchPeopleQuery={form.searchPeopleQuery}
          setSearchPeopleQuery={form.setSearchPeopleQuery}
          selectedFriends={form.selectedFriends}
          toggleFriendSelection={form.toggleFriendSelection}
          waitlistEnabled={form.waitlistEnabled}
          setWaitlistEnabled={form.setWaitlistEnabled}
          waitlistCapacity={form.totalCapacity}
          setWaitlistCapacity={form.setTotalCapacity}
          totalInvitedCount={form.totalInvitedCount}
          handleRemoveSelectedItem={form.handleRemoveSelectedItem}
          friends={form.AVAILABLE_FRIENDS}
          setCustomizerStep={onContinue}
          cameFromReview={false}
          userProfile={form.userProfile}
          activeUserId={form.activeUserId}
          confirmLabel="Continue"
          onConfirmEdit={onContinue}
          category={selectedCategory}
          subcategory={selectedSubcategory}
          localTitle={form.localTitle}
          localLocation={form.localLocation}
          eventDateTime={form.eventDateTime}
          hideConfirmButton={true}
          isHostSelected={form.isHostSelected}
          onToggleHostSelection={() => {
            if (form.isHostSelected) {
              setShowRemoveHostDialog(true);
            } else {
              form.setIsHostSelected(true);
            }
          }}
          isReplacementMode={isReplacementMode}
          leavingParticipant={leavingParticipant}
          selectedReplacementFriend={selectedReplacementFriend}
        />

        {/* Floating ArrowRight action button in bottom-right corner */}
        {isRequirementMet && (
          <button
            type="button"
            onClick={onContinue}
            title={confirmLabel || (isReplacementMode ? "Confirm Replacement" : "Continue")}
            style={{
              bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
              right: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
            }}
            className="fixed z-40 w-12 h-12 rounded-full bg-[#FF6B2C] hover:bg-[#FF854C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-black/50 border border-white/20 transition-all duration-150 cursor-pointer pointer-events-auto select-none"
          >
            <ArrowRight className="w-6 h-6 text-white stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Remove Host Dialog */}
      <RemoveHostDialog
        visible={showRemoveHostDialog}
        onCancel={() => setShowRemoveHostDialog(false)}
        onConfirm={() => {
          setShowRemoveHostDialog(false);
          form.setIsHostSelected(false);
        }}
      />
    </div>
  );
};

interface RemoveHostDialogProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const RemoveHostDialog: React.FC<RemoveHostDialogProps> = ({
  visible,
  onCancel,
  onConfirm,
}) => {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0, 0, 0, 0.82)', transition: 'background-color 0.25s ease' }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#1A1A1A', // color-surface-elevated
          borderTop: '1px solid rgba(255, 255, 255, 0.08)', // color-border
          padding: '24px 24px 48px',
          animation: 'ag-sheet-rise 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            width: 44, height: 44,
            background: 'rgba(239, 68, 68, 0.1)', // Subtle danger tint
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 22, fontWeight: 700, color: '#FFFFFF',
            marginBottom: 8, letterSpacing: '-0.02em',
          }}
        >
          Remove yourself?
        </h2>
        <p
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 14, lineHeight: 1.45,
            color: '#A1A1AA', // color-text-secondary
            marginBottom: 32,
          }}
        >
          Are you sure you want to remove yourself from this plan?
        </p>

        {/* Cancel - keeps you in the plan */}
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: 'block', width: '100%',
            height: 48, marginBottom: 12,
            borderRadius: 8, border: 'none',
            background: '#FFFFFF', // color-action-primary
            color: '#000000',
            fontFamily: 'Inter, sans-serif',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          Cancel
        </button>

        {/* Remove - destructive action */}
        <button
          type="button"
          onClick={onConfirm}
          style={{
            display: 'block', width: '100%',
            height: 48,
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.08)', // color-border
            color: '#EF4444', // color-danger
            fontFamily: 'Inter, sans-serif',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};
