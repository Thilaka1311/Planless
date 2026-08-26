import React from "react";
import { Bell, Search, Crown, History, X } from "lucide-react";
import { UserProfile, NotificationItem } from "../core/types";

import { UserAvatar } from "../IMGfromDB/UserAvatar";

interface HomeHeaderProps {
  userProfile: UserProfile;
  setActiveTab: (tab: any) => void;
  pendingMemoryCount: number;
  showSearch?: boolean;
  onToggleSearch?: () => void;
  showHostedIcon?: boolean;
  onToggleHosted?: () => void;
  isHostedActive?: boolean;
  showPastIcon?: boolean;
  onTogglePast?: () => void;
  isPastActive?: boolean;
  title?: string;
  scrollY?: number;
  hideNotificationsIcon?: boolean;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  userProfile,
  setActiveTab,
  pendingMemoryCount,
  showSearch = false,
  onToggleSearch,
  showHostedIcon = false,
  onToggleHosted,
  isHostedActive = false,
  showPastIcon = false,
  onTogglePast,
  isPastActive = false,
  title = "Planless",
  scrollY = 0,
  hideNotificationsIcon = false,
}) => {
  const actionButtonClass = (isActive: boolean) =>
    `w-9 h-9 rounded-full flex items-center justify-center relative cursor-pointer transition-all active:scale-95 ${
      isActive
        ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
        : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
    }`;

  return (
    <header
      id="figma_coordinate_header"
      className="h-16 shrink-0 bg-[#09090b]/99 backdrop-blur-md flex items-center justify-between px-4 z-30 select-none relative"
    >
      {/* Left Column: Avatar */}
      <div className="flex-1 flex items-center justify-start z-10">
        <button
          onClick={() => {
            setActiveTab("profile");
          }}
          className="relative group shrink-0 block focus:outline-none cursor-pointer"
          aria-label="View Profile Settings"
        >
          <UserAvatar
            src={userProfile.avatar}
            alt={userProfile.name}
            size="w-10 h-10"
            className="border-2 border-zinc-800 hover:border-[#ff8b66] transition-colors"
          />
        </button>
      </div>

      {/* Center Column: Title */}
      <div className="flex-shrink-0 flex items-center justify-center z-10">
        <h1 className="text-stone-100 font-sans font-bold text-xl tracking-tight leading-none text-center">
          {title}
        </h1>
      </div>

      {/* Right Column: Compact Action Utility Group */}
      <div className="flex-1 flex items-center justify-end z-10">
        <div className="flex items-center gap-0.5">
          {showPastIcon && onTogglePast && (
            <button
              onClick={onTogglePast}
              aria-label="Past Plans"
              className={actionButtonClass(isPastActive)}
            >
              <History className="w-4.5 h-4.5 stroke-[2]" />
            </button>
          )}
          {showHostedIcon && onToggleHosted && (
            <button
              onClick={onToggleHosted}
              aria-label="Hosted Plans"
              className={actionButtonClass(isHostedActive)}
            >
              <Crown className="w-4.5 h-4.5 stroke-[2]" />
            </button>
          )}
          {showSearch && onToggleSearch && (
            <button
              onClick={onToggleSearch}
              aria-label="Search Plans"
              className={actionButtonClass(false)}
            >
              <Search className="w-4.5 h-4.5 stroke-[2]" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

