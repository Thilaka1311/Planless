import React, { useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StepWho } from "../components/FriendsSelector";
import { getCategoryImage } from "../utils/constants";
import { ExitEditingDialog } from "../components/ExitEditingDialog";
import { PlanDetailOverviewCard } from "../../participants/components/PlanDetailOverviewCard";
import { ContinueButton } from "../components/ContinueButton";

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
  const [showExitDialog, setShowExitDialog] = useState(false);


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

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isHeaderOpen, setIsHeaderOpen] = useState(false);
  const [showRemoveHostDialog, setShowRemoveHostDialog] = useState(false);

  const totalSelectedCount = isReplacementMode
    ? (selectedReplacementFriend ? 1 : 0)
    : ((form.selectedFriends?.length || 0) + (form.isHostSelected ? 1 : 0));
  const requiredSize = isReplacementMode ? 1 : (isAddParticipantMode ? 1 : (form.totalCapacity || 2));
  const isRequirementMet = isReplacementMode ? Boolean(selectedReplacementFriend) : (totalSelectedCount >= requiredSize);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#000000] text-left relative" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Standardized Header Top Bar ── */}
      <div
        className="w-full shrink-0 px-5 flex items-center bg-[#000000] border-b border-white/[0.08] relative z-40"
        style={{ height: '72px', boxSizing: 'border-box' }}
      >
        {/* BACK BUTTON */}
        <button
          type="button"
          onClick={() => {
            if (isSearchActive) {
              setIsSearchActive(false);
              form.setSearchPeopleQuery("");
            } else {
              if (hideExitDialog) {
                onBack();
              } else {
                setShowExitDialog(true);
              }
            }
          }}
          style={{
            marginRight: 16,
            background: 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: 0,
            width: 24,
            height: 24
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        {/* TITLE & SUBTITLE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          {isSearchActive ? (
            <input
              id="search-people-input"
              name="searchPeopleInput"
              type="text"
              autoFocus
              placeholder="Search friends or circles..."
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
              className="placeholder-zinc-650"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, sans-serif', lineHeight: '1.2' }}>
                {headerTitle}
              </h2>
              <p style={{ fontSize: 11, fontWeight: 650, color: '#A1A1AA', margin: 0, marginTop: 2, fontFamily: 'Inter, sans-serif', lineHeight: '1.2' }}>
                {isAddParticipantMode ? `${totalSelectedCount} selected` : `${totalSelectedCount} of ${requiredSize} selected`}
              </p>
            </div>

          )}
        </div>


        {/* TRAILING CONTROLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Toggle Search Action */}
          <button
            type="button"
            onClick={() => {
              setIsSearchActive(prev => !prev);
              if (isSearchActive) {
                form.setSearchPeopleQuery("");
              }
            }}
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
            {isSearchActive ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
          </button>

          {/* Interactive Top-Right Category Badge */}
          {(() => {
            const getCategoryStyle = (category?: string) => {
              const cat = (category || 'custom').toLowerCase();
              if (cat === 'sports') {
                return {
                  color: '#10B981',
                  bg: 'rgba(16, 185, 129, 0.2)',
                  border: '1.5px solid #10B981',
                  shadow: 'rgba(16, 185, 129, 0.2)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(16, 185, 129, 0.4))' }}>
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                  )
                };
              } else if (cat === 'movies') {
                return {
                  color: '#A78BFA',
                  bg: 'rgba(139, 92, 246, 0.2)',
                  border: '1.5px solid #8B5CF6',
                  shadow: 'rgba(139, 92, 246, 0.2)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(139, 92, 246, 0.4))' }}>
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
                  bg: 'rgba(244, 63, 94, 0.2)',
                  border: '1.5px solid #F43F5E',
                  shadow: 'rgba(244, 63, 94, 0.2)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 1px rgba(244, 63, 94, 0.4))' }}>
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
            if (hideOverviewToggle) return null;
            return (
              <button
                type="button"
                className="plan-details-toggle"
                onClick={() => setIsHeaderOpen(prev => !prev)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: style.bg,
                  border: style.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: style.color,
                  boxShadow: `0 0 10px ${style.shadow}`,
                  cursor: 'pointer',
                  transition: 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
                  transform: isHeaderOpen ? 'scale(0.96)' : 'scale(1)',
                  padding: 0,
                  outline: 'none'
                }}
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


      {/* ── Content Area matching WhenIsPlanScreen padding ── */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{
          paddingTop: '24px',
          paddingBottom: isRequirementMet ? 'calc(88px + env(safe-area-inset-bottom))' : '32px',
          transition: 'padding-bottom 0.25s ease'
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
      </div>

      {/* Floating Continue button */}
      {isRequirementMet && (
        <ContinueButton
          onClick={onContinue}
          text={confirmLabel || (isReplacementMode ? "Confirm Replacement" : "Continue")}
        />
      )}

      {/* Exit dialog */}
      <ExitEditingDialog
        visible={showExitDialog}
        onKeepEditing={() => setShowExitDialog(false)}
        onStopEditing={() => { setShowExitDialog(false); onBack(); }}
      />

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
