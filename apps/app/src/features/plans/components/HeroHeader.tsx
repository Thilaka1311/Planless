import React from "react";
import { ChevronLeft, Edit, MoreVertical, Settings, Users, Activity } from "lucide-react";
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
  onOpenSettings,
  overflowMenuItems = [],
  coverImage,
  category,
  hideHostAttribution = false,
  onHeaderPress,
  onOpenParticipants,
  onOpenActivity,
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

            {/* Header action buttons — right side (Participants -> Activity -> Settings) */}
            <div className="flex items-center gap-0.5 flex-shrink-0 -mr-2">
              {onOpenParticipants && (
                <button
                  id="immersive-plan-participants-btn"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenParticipants(); }}
                  className="p-2 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  style={{ minWidth: "40px", minHeight: "40px" }}
                  title="Participants"
                >
                  <Users className="w-5 h-5" />
                </button>
              )}

              {onOpenActivity && (
                <button
                  id="immersive-plan-activity-btn"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenActivity(); }}
                  className="p-2 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  style={{ minWidth: "40px", minHeight: "40px" }}
                  title="Activity Timeline"
                >
                  <Activity className="w-5 h-5" />
                </button>
              )}

              {onOpenSettings && (
                <button
                  id="immersive-plan-settings-btn"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                  className="p-2 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  style={{ minWidth: "40px", minHeight: "40px" }}
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
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

        {/* Right action buttons */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto">
          {onOpenSettings ? (
            <button
              id="immersive-plan-settings-btn"
              type="button"
              onClick={onOpenSettings}
              className="w-9 h-9 flex items-center justify-center text-white active:scale-95 transition duration-200 cursor-pointer"
              title="Plan Settings"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
          ) : showOverflow ? (
            <div ref={menuRef} className="relative">
              <button
                id="immersive-plan-overflow-btn"
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center text-white active:scale-95 transition duration-200 cursor-pointer"
              >
                <MoreVertical className="w-4.5 h-4.5" />
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div
                  className="absolute top-full right-0 mt-2 min-w-[160px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-50"
                  style={{ background: "rgba(28,28,30,0.96)", backdropFilter: "blur(20px)" }}
                >
                  {overflowMenuItems.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        item.onClick();
                      }}
                      className={`w-full flex items-center px-4 py-3.5 text-left text-[14px] font-medium transition-colors active:bg-white/10 ${
                        item.destructive
                          ? "text-red-400 hover:bg-red-500/10"
                          : "text-white/90 hover:bg-white/8"
                      } ${idx > 0 ? "border-t border-white/[0.06]" : ""}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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