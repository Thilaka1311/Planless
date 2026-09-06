import React from "react";
import { Home, Calendar, Plus, MessageSquare } from "lucide-react";
import { UserAvatar } from "../IMGfromDB/UserAvatar";
import { useProfileStore } from "../features/profile/state/ProfileContext";

interface NavigationFooterProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  homeBadgeCount: number;
}

export const NavigationFooter: React.FC<NavigationFooterProps> = ({
  activeTab,
  setActiveTab,
  homeBadgeCount,
}) => {
  const { userProfile, activeUserUuid, activeUserId, dbUsers } = useProfileStore();

  const currentUser = React.useMemo(() => {
    return dbUsers.find(u => u.id === activeUserUuid || u.user_id === activeUserId);
  }, [dbUsers, activeUserUuid, activeUserId]);

  const profilePhotoSrc = userProfile?.avatar || (userProfile as any)?.profile_photo || currentUser?.profile_photo || null;

  return (
    <footer id="main_app_footer_nav" className="fixed bottom-0 left-0 right-0 h-20 border-t border-zinc-950/20 bg-[#09090b]/95 backdrop-blur-xl flex justify-around items-center px-4 z-40 pb-[env(safe-area-inset-bottom,8px)] shadow-2xl select-none">
      <button
        id="nav_item_home"
        onClick={() => { setActiveTab("home"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "home" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <div className="relative">
          <Home className="w-6 h-6" />
          {homeBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-[#f43f5e] text-white text-[8.5px] font-sans font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
              {homeBadgeCount}
            </span>
          )}
        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Home</span>
      </button>

      <button
        id="nav_item_plans"
        onClick={() => { setActiveTab("plans"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "plans" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <Calendar className="w-6 h-6" />
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Plans</span>
      </button>

      <button
        id="nav_item_create"
        onClick={() => {
          setActiveTab("create");
        }}
        className="flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer"
      >
        <div className={`w-[34px] h-[34px] rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ${activeTab === "create" ? "border-[#ff8b66]" : ""}`}>
          <Plus className="w-5 h-5 text-[#ff8b66]" />
        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-0.5 font-medium">Create</span>
      </button>

      <button
        id="nav_item_chats"
        onClick={() => { setActiveTab("chats"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "chats" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <MessageSquare className="w-6 h-6" />
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Chats</span>
      </button>

      <button
        id="nav_item_profile"
        onClick={() => { setActiveTab("profile"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "profile" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
          activeTab === "profile"
            ? "ring-2 ring-[#ff8b66] ring-offset-1 ring-offset-[#09090b]"
            : "opacity-75 hover:opacity-100"
        }`}>
          <UserAvatar
            src={profilePhotoSrc}
            alt={userProfile?.name || "Profile"}
            size="w-6 h-6"
            className="rounded-full object-cover"
          />
        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Profile</span>
      </button>
    </footer>
  );
};
