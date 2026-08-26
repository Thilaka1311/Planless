import React from "react";
import { ChevronLeft, Edit, MoreVertical, Settings, Users, Activity, CreditCard, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";

interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export interface HostInfo {
  id: string;
  name: string;
  avatar?: string;
  isCreator?: boolean;
}

interface HeroHeaderProps {
  title: string;
  creatorName?: string;
  creatorAvatar?: string;
  hosts?: HostInfo[];
  viewerId?: string;
  onClose: () => void;
  /** @deprecated — no longer used, kept for back-compat */
  isInfoOpen?: boolean;
  /** @deprecated — no longer used, kept for back-compat */
  onToggleInfo?: () => void;
  /** @deprecated — no longer used, kept for back-compat */
  showInfoButton?: boolean;
  isHost?: boolean;
  onEdit?: () => void;
  onEditTitle?: (newTitle: string) => Promise<void> | void;
  onOpenSettings?: () => void;
  /** Items to show in the ⋮ overflow menu */
  overflowMenuItems?: OverflowMenuItem[];
  /** Optional plan cover image for chat header */
  coverImage?: string;
  category?: string;
  /** Hide "Hosted by..." attribution row (e.g. for chat header) */
  hideHostAttribution?: boolean;
  /** Called when the user taps the tappable region of the chat header (avatar + title) */
  onHeaderPress?: () => void;
  /** Called when the user taps the participants icon in the chat header */
  onOpenParticipants?: () => void;
  /** Called when the user taps the activity history icon in the chat header */
  onOpenActivity?: () => void;
  onOpenChat?: () => void;
  /** Called when the user taps Expenses in the chat header menu */
  onOpenExpenses?: () => void;
}

export const HeroHeader: React.FC<HeroHeaderProps> = ({
  title,
  creatorName,
  creatorAvatar,
  hosts,
  viewerId,
  onClose,
  isHost = false,
  onEdit,
  onEditTitle,
  onOpenChat,
  onOpenSettings,
  overflowMenuItems = [],
  coverImage,
  category,
  hideHostAttribution = false,
  onHeaderPress,
  onOpenParticipants,
  onOpenActivity,
  onOpenExpenses,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState(title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isEditingTitle) {
      setTempTitle(title);
    }
  }, [title, isEditingTitle]);

  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = tempTitle.trim();
    if (!trimmed || trimmed === title) {
      setTempTitle(title);
      return;
    }
    if (trimmed.length > 50) return;
    if (onEditTitle) {
      try {
        await onEditTitle(trimmed);
      } catch {
        setTempTitle(title);
      }
    }
  };

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const showOverflow = overflowMenuItems.length > 0;

  // Standardized Host Ordering & Formatting
  const hostList: HostInfo[] = React.useMemo(() => {
    if (hosts && hosts.length > 0) return hosts;
    return [{ id: "", name: creatorName || "Host", avatar: creatorAvatar }];
  }, [hosts, creatorName, creatorAvatar]);

  const hostedByText = React.useMemo(() => {
    const formattedNames = hostList.map(h => (h.id && h.id === viewerId ? "You" : h.name || "Host"));
    return formattedNames.join(", ");
  }, [hostList, viewerId]);

  if (hideHostAttribution) {
    return (
      <div
        id="immersive-plan-chat-hero-container"
        className="relative w-full flex-shrink-0 overflow-hidden rounded-b-2xl border-b border-white/10"
      >
        {/* Cover image — brightness-[0.75], same as Plan Details hero */}
        <DiscoveryImages
          id="immersive-plan-chat-hero-image"
          src={coverImage}
          category={category}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75]"
        />

        {/* Gradient overlay — exact same as Plan Details hero */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none z-10" />

        {/* Glass bar — rounded-b-2xl + bg-black/30 backdrop-blur-xl, pixel-for-pixel match of Plan Details HeroHeader */}
        <div
          id="immersive-plan-glass-header"
          className="relative z-30 bg-black/30 backdrop-blur-xl shadow-lg rounded-b-2xl pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-3 px-4"
        >
          <div className="w-full flex items-center gap-3">
            {/* Back button — isolated: does NOT trigger onHeaderPress */}
            <button
              id="immersive-plan-back-btn"
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 -ml-2 flex items-center justify-center text-white active:scale-95 transition-transform cursor-pointer flex-shrink-0 drop-shadow-md"
              style={{ minWidth: "44px", minHeight: "44px" }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Tappable identity region: avatar + title → opens Plan Details */}
            <button
              type="button"
              onClick={onHeaderPress}
              disabled={!onHeaderPress}
              className="flex items-center gap-3 min-w-0 flex-1 active:opacity-70 transition-opacity duration-100 text-left cursor-pointer disabled:cursor-default"
            >
              {/* Circular Plan Cover Image (38px x 38px) */}
              <div className="w-[38px] h-[38px] rounded-full overflow-hidden border border-white/25 bg-zinc-900 flex-shrink-0 relative shadow-lg">
                <DiscoveryImages
                  src={coverImage}
                  category={category}
                  alt={title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Inline Plan Title */}
              <h1 className="text-[16px] font-semibold text-white truncate min-w-0 drop-shadow-sm">
                {title}
              </h1>
            </button>

            {/* Header action buttons — right side (Single Three-dot Overflow Menu) */}
            <div className="flex items-center gap-0.5 flex-shrink-0 -mr-2">
              <button
                id="immersive-plan-menu-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(true);
                }}
                className="p-2 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                style={{ minWidth: "40px", minHeight: "40px" }}
                title="Menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Clean Native Planless 4-Item Action Sheet */}
        <AnimatePresence>
          {menuOpen && (
            <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-auto">
              {/* Backdrop Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />

              {/* Action Sheet Card */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 350 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-[#0d0d11] border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl z-10 flex flex-col space-y-1 text-left"
              >
                {/* Top Handle Bar */}
                <div className="w-10 h-1 rounded-full bg-zinc-700/80 mx-auto mb-4 shrink-0" />

                {/* 1. Participants */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenParticipants?.();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white tracking-tight">
                    Participants
                  </span>
                </button>

                {/* 2. Activity */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenActivity?.();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white tracking-tight">
                    Activity
                  </span>
                </button>

                {/* 3. Expenses */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenExpenses?.();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white tracking-tight">
                    Expenses
                  </span>
                </button>

                {/* 4. Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings?.();
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white shrink-0">
                    <Settings className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-white tracking-tight">
                    Settings
                  </span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      id="immersive-plan-glass-header"
      className="absolute top-0 left-0 right-0 z-30 bg-black/30 backdrop-blur-xl border-b border-white/10 shadow-lg pb-3 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] rounded-b-2xl"
    >
      <div className="w-full flex flex-col items-center relative px-4">
        {/* Back button — top-left */}
        <button
          id="immersive-plan-back-btn"
          type="button"
          onClick={onClose}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-white active:scale-95 transition-transform cursor-pointer pointer-events-auto"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Right action buttons — Contextual Popup Menu */}
        <div ref={menuRef} className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto">
          {(onOpenChat || onOpenExpenses || onOpenSettings || showOverflow) && (
            <div className="relative">
              <button
                id="immersive-plan-overflow-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                className="w-9 h-9 flex items-center justify-center text-white/90 hover:text-white active:scale-95 transition-all cursor-pointer"
                title="Plan Menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* Compact Contextual Popup Menu */}
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -6 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full right-0 mt-2 min-w-[170px] bg-[#121216]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-[100] flex flex-col space-y-0.5 text-left select-none"
                  >
                    {/* 1. Chat */}
                    {onOpenChat && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenChat();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors text-left group cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
                        <span className="text-xs font-semibold text-white tracking-tight">
                          Chat
                        </span>
                      </button>
                    )}

                    {/* 2. Expenses */}
                    {onOpenExpenses && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenExpenses();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors text-left group cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
                        <span className="text-xs font-semibold text-white tracking-tight">
                          Expenses
                        </span>
                      </button>
                    )}

                    {/* 3. Settings */}
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenSettings();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors text-left group cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
                        <span className="text-xs font-semibold text-white tracking-tight">
                          Settings
                        </span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Circular Plan Avatar & Centered Title */}
        <div
          onClick={onHeaderPress}
          className={`flex flex-col items-center max-w-full ${onHeaderPress ? "cursor-pointer pointer-events-auto" : "pointer-events-none"}`}
        >
          {coverImage && (
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/15 bg-zinc-800 flex-shrink-0 mb-1">
              <img
                src={coverImage}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <h1
            className="text-[17px] font-bold text-white tracking-[0.08em] leading-tight select-text text-center px-14 max-w-full line-clamp-2 break-words"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </h1>
        </div>

        {/* Centered Hosted By with Overlapping Avatars (Plan Details Mode) */}
        {!hideHostAttribution && (
          <div className="flex items-center gap-2 mt-1 select-none">
            <div className="flex items-center -space-x-1.5 flex-shrink-0">
              {hostList.map((h, idx) => (
                <UserAvatar
                  key={h.id || idx}
                  src={h.avatar}
                  alt={h.name || "Host"}
                  size="w-4.5 h-4.5"
                  className="border border-black/80 rounded-full relative"
                  style={{ zIndex: hostList.length - idx }}
                />
              ))}
            </div>
            <span id="immersive-host-attribution" className="text-[12px] text-white/60 font-medium select-none">
              Hosted by <span className="text-white/90 font-semibold">{hostedByText}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};