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
  currentPage?: number;
  onSelectPage?: (pageIndex: number) => void;
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
  currentPage,
  onSelectPage,
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
    if (!trimmed || trimmed === "Set a title" || trimmed === "Enter Title") {
      if (onEditTitle) {
        try {
          await onEditTitle("");
        } catch {}
      }
      setTempTitle("");
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

        {/* Glass bar — rounded-b-2xl + bg-black/30 backdrop-blur-xl */}
        <div
          id="immersive-plan-glass-header"
          className="relative z-30 bg-black/30 backdrop-blur-xl shadow-lg rounded-b-2xl pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-2 px-4"
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

          {/* 3-Way Navigation Tab Bar (Participants | Chat | Activity) */}
          {onSelectPage !== undefined && (
            <div className="relative w-full flex items-center border-t border-white/10 mt-2.5 pt-0.5 pb-0.5">
              <button
                type="button"
                onClick={() => onSelectPage(0)}
                className={`flex-1 py-1.5 text-center text-xs sm:text-sm transition-colors cursor-pointer select-none ${
                  currentPage === 0 ? "font-bold text-white" : "font-medium text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Participants
              </button>
              <button
                type="button"
                onClick={() => onSelectPage(1)}
                className={`flex-1 py-1.5 text-center text-xs sm:text-sm transition-colors cursor-pointer select-none ${
                  currentPage === 1 ? "font-bold text-white" : "font-medium text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => onSelectPage(2)}
                className={`flex-1 py-1.5 text-center text-xs sm:text-sm transition-colors cursor-pointer select-none ${
                  currentPage === 2 ? "font-bold text-white" : "font-medium text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Activity
              </button>

              {/* Animated Active Orange Indicator Line */}
              <motion.div
                className="absolute bottom-0 h-[2.5px] bg-[#FF6B2C] rounded-full"
                initial={false}
                animate={{
                  left: `${((currentPage ?? 1) * 100) / 3}%`,
                  width: `${100 / 3}%`,
                }}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            </div>
          )}
        </div>

        {/* Inline Popover / Dropdown Menu for Plan Chat Header */}
        <AnimatePresence>
          {menuOpen && (
            <div className="fixed inset-0 z-[100] pointer-events-auto">
              {/* Invisible Backdrop for outside click dismiss */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                className="absolute inset-0 bg-transparent"
              />

              {/* Compact Inline Popover Card anchored near top-right menu button */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -6 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-[calc(3.25rem+env(safe-area-inset-top,0px))] right-4 min-w-[170px] bg-[#121216]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-10 flex flex-col space-y-0.5 text-left select-none"
              >
                {/* 1. Expenses */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenExpenses?.();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors text-left group cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
                  <span className="text-xs font-semibold text-white tracking-tight">
                    Expenses
                  </span>
                </button>

                {/* 2. Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings?.();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors text-left group cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
                  <span className="text-xs font-semibold text-white tracking-tight">
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
          onClick={!isEditingTitle && onHeaderPress ? onHeaderPress : undefined}
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

          {isEditingTitle ? (
            <div className="pointer-events-auto px-4 w-full max-w-[320px]">
              <input
                ref={titleInputRef}
                type="text"
                value={tempTitle === "Set a title" || tempTitle === "Enter Title" ? "" : tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") {
                    setIsEditingTitle(false);
                    setTempTitle(title);
                  }
                }}
                placeholder="Set a title"
                className="w-full bg-transparent border-none outline-none text-center text-[17px] font-bold text-white tracking-[0.08em] leading-tight placeholder:text-white/60 placeholder:font-semibold focus:outline-none focus:ring-0 p-0 m-0 shadow-none"
                maxLength={50}
              />
            </div>
          ) : (
            <h1
              onClick={(e) => {
                if (isHost && onEditTitle) {
                  e.stopPropagation();
                  setTempTitle(title === "Set a title" || title === "Enter Title" ? "" : title);
                  setIsEditingTitle(true);
                }
              }}
              className={`text-[17px] font-bold tracking-[0.08em] leading-tight select-text text-center px-14 max-w-full line-clamp-2 break-words ${
                isHost && onEditTitle ? "cursor-pointer pointer-events-auto hover:opacity-90 active:opacity-75" : ""
              } ${!title || title === "Set a title" || title === "Enter Title" ? "text-white/60 font-semibold" : "text-white"}`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title && title !== "Enter Title" ? title : "Set a title"}
            </h1>
          )}
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