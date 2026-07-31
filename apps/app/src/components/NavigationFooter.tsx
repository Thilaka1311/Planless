import React from "react";
import { Home, Calendar, Plus, MessageSquare, Wallet } from "lucide-react";

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
  return (
    <footer id="main_app_footer_nav" className="fixed bottom-0 left-0 right-0 h-18 border-t border-zinc-950/20 bg-[#09090b]/95 backdrop-blur-xl flex justify-around items-center px-4 z-40 pb-[env(safe-area-inset-bottom,8px)] shadow-2xl select-none">
      <button
        id="nav_item_home"
        onClick={() => { setActiveTab("home"); }}
        className={`flex flex-col items-center justify-center w-12 h-12 transition-all cursor-pointer ${activeTab === "home" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <div className="relative">
          <Home className="w-4.5 h-4.5" />
          {homeBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-[#f43f5e] text-white text-[8px] font-sans font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow">
              {homeBadgeCount}
            </span>
          )}
        </div>
        <span className="text-[9px] font-sans tracking-wide mt-1 font-medium">Home</span>
      </button>

      <button
        id="nav_item_plans"
        onClick={() => { setActiveTab("plans"); }}
        className={`flex flex-col items-center justify-center w-12 h-12 transition-all cursor-pointer ${activeTab === "plans" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <Calendar className="w-4.5 h-4.5" />
        <span className="text-[9px] font-sans tracking-wide mt-1 font-medium">Plans</span>
      </button>

      <button
        id="nav_item_create"
        onClick={() => {
          setActiveTab("create");
        }}
        className="flex flex-col items-center justify-center w-12 h-12 transition-all cursor-pointer"
      >
        <div className={`w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ${activeTab === "create" ? "border-[#ff8b66]" : ""}`}>
          <Plus className="w-4 h-4 text-[#ff8b66]" />
        </div>
        <span className="text-[9px] font-sans tracking-wide mt-0.5 font-medium">Create</span>
      </button>

      <button
        id="nav_item_chats"
        onClick={() => { setActiveTab("chats"); }}
        className={`flex flex-col items-center justify-center w-12 h-12 transition-all cursor-pointer ${activeTab === "chats" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <MessageSquare className="w-4.5 h-4.5" />
        <span className="text-[9px] font-sans tracking-wide mt-1 font-medium">Chats</span>
      </button>

      <button
        id="nav_item_wallet"
        onClick={() => { setActiveTab("wallet"); }}
        className={`flex flex-col items-center justify-center w-12 h-12 transition-all cursor-pointer ${activeTab === "wallet" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <Wallet className="w-4.5 h-4.5" />
        <span className="text-[9px] font-sans tracking-wide mt-1 font-medium">Wallet</span>
      </button>
    </footer>
  );
};
