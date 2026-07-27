import React from "react";
import { ChevronLeft, Edit, MoreVertical } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

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
  /** Items to show in the ⋮ overflow menu */
  overflowMenuItems?: OverflowMenuItem[];
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
  overflowMenuItems = [],
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
          className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white active:scale-95 transition-transform cursor-pointer pointer-events-auto"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Right action buttons */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-auto">
          {/* ⋮ overflow menu */}
          {showOverflow && (
            <div ref={menuRef} className="relative">
              <button
                id="immersive-plan-overflow-btn"
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className={`w-9 h-9 rounded-full backdrop-blur-sm border flex items-center justify-center active:scale-95 transition duration-200 cursor-pointer ${
                  menuOpen
                    ? "bg-white/20 border-white/20 text-white"
                    : "bg-white/10 border-white/10 text-white hover:bg-white/20"
                }`}
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
          )}
        </div>

        {/* Centered Title */}
        {isEditingTitle ? (
          <div className="flex flex-col items-center w-full max-w-[calc(100%-6.5rem)] px-2 z-40 pointer-events-auto">
            <input
              ref={titleInputRef}
              type="text"
              maxLength={50}
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value.slice(0, 50))}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  titleInputRef.current?.blur();
                } else if (e.key === "Escape") {
                  setIsEditingTitle(false);
                  setTempTitle(title);
                }
              }}
              className="w-full bg-transparent border-b border-[#FF6B2C] text-[17px] font-bold text-white tracking-[0.08em] leading-tight text-center focus:outline-none py-0.5"
            />
            <span className="text-[10px] text-white/40 font-mono mt-0.5">
              {tempTitle.length} / 50
            </span>
          </div>
        ) : isHost && onEditTitle ? (
          <button
            type="button"
            onClick={() => {
              setTempTitle(title);
              setIsEditingTitle(true);
            }}
            className="group flex items-center justify-center gap-1.5 px-3 py-0.5 rounded-lg hover:bg-white/[0.06] active:bg-white/10 transition cursor-pointer max-w-[calc(100%-6.5rem)] pointer-events-auto"
            title="Tap to edit title"
          >
            <h1
              className="text-[17px] font-bold text-white tracking-[0.08em] leading-tight text-center line-clamp-2 break-words"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </h1>
            <Edit className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0 self-center" />
          </button>
        ) : (
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
        )}

        {/* Centered Hosted By with Overlapping Avatars */}
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
      </div>
    </div>
  );
};