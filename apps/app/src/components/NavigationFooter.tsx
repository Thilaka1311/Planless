import React from "react";
import { Home, Calendar, Plus, MessageSquare } from "lucide-react";
import { UserAvatar } from "../IMGfromDB/UserAvatar";
import { useProfileStore } from "../features/profile/state/ProfileContext";
import { useFriendshipStore } from "../features/friendships/state/FriendshipContext";

interface NavigationFooterProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  homeBadgeCount: number;
  chatsBadgeCount?: number;
}

export const NavigationFooter: React.FC<NavigationFooterProps> = ({
  activeTab,
  setActiveTab,
  homeBadgeCount,
  chatsBadgeCount = 0,
}) => {
  const { userProfile, activeUserUuid, activeUserId, dbUsers } = useProfileStore();
  const { incomingRequests } = useFriendshipStore();
  const hasIncomingRequests = incomingRequests && incomingRequests.length > 0;

  const currentUser = React.useMemo(() => {
    return dbUsers.find(u => u.id === activeUserUuid || u.user_id === activeUserId);
  }, [dbUsers, activeUserUuid, activeUserId]);

  const profilePhotoSrc = userProfile?.avatar || (userProfile as any)?.profile_photo || currentUser?.profile_photo || null;

  // Keyboard awareness: prevent bottom navigation bar from popping up above the virtual keyboard when typing/searching
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);
  const [isNavHiddenByScroll, setIsNavHiddenByScroll] = React.useState(false);
  const initialHeightRef = React.useRef(typeof window !== "undefined" ? window.innerHeight : 0);

  // Dynamic scroll-aware bottom nav visibility listener
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleNavVisibility = (e: Event) => {
      const customEvent = e as CustomEvent<{ visible: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.visible === "boolean") {
        setIsNavHiddenByScroll(!customEvent.detail.visible);
      }
    };
    window.addEventListener("planless_bottom_nav_visibility", handleNavVisibility);
    return () => {
      window.removeEventListener("planless_bottom_nav_visibility", handleNavVisibility);
    };
  }, []);

  // Reset any temporary scroll-hide or keyboard state when activeTab changes
  React.useEffect(() => {
    setIsNavHiddenByScroll(false);
    const activeEl = typeof document !== "undefined" ? document.activeElement : null;
    const isInput =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement;
    if (!isInput) {
      setIsKeyboardOpen(false);
    }
  }, [activeTab]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const checkKeyboard = () => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement;

      if (!isInput) {
        initialHeightRef.current = Math.max(initialHeightRef.current, window.innerHeight);
      }

      const vv = window.visualViewport;
      let open = false;

      if (vv) {
        const fullHeight = initialHeightRef.current;
        const diffFromFull = fullHeight - vv.height;
        const diffFromInner = window.innerHeight - (vv.height + (vv.offsetTop || 0));
        const detectedKb = Math.max(diffFromFull, diffFromInner);

        if (detectedKb > 120 && isInput) {
          open = true;
        }
      } else if (isInput) {
        const diff = initialHeightRef.current - window.innerHeight;
        if (diff > 120) {
          open = true;
        }
      }

      setIsKeyboardOpen(open);
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        const isTouch =
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth <= 768;
        if (isTouch) {
          setIsKeyboardOpen(true);
        }
        checkKeyboard();
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        checkKeyboard();
        const activeEl = document.activeElement;
        const stillInput =
          activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement;
        if (!stillInput) {
          setIsKeyboardOpen(false);
        }
      }, 150);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", checkKeyboard);
      window.visualViewport.addEventListener("scroll", checkKeyboard);
    }
    window.addEventListener("resize", checkKeyboard);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", checkKeyboard);
        window.visualViewport.removeEventListener("scroll", checkKeyboard);
      }
      window.removeEventListener("resize", checkKeyboard);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <footer id="main_app_footer_nav" className={`fixed bottom-0 left-0 right-0 h-20 border-t border-zinc-950/20 bg-[#09090b]/95 backdrop-blur-xl flex justify-around items-center px-4 z-40 pb-[env(safe-area-inset-bottom,8px)] shadow-2xl select-none transition-all duration-300 ease-out ${isKeyboardOpen ? "!hidden pointer-events-none opacity-0" : isNavHiddenByScroll ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}>
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
        <div className={`w-[34px] h-[34px] rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ${(activeTab === "create" || activeTab === "sports" || activeTab === "dining" || activeTab === "movies" || activeTab === "activities") ? "border-[#ff8b66]" : ""}`}>
          <Plus className="w-5 h-5 text-[#ff8b66]" />
        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-0.5 font-medium">Create</span>
      </button>

      <button
        id="nav_item_chats"
        onClick={() => { setActiveTab("chats"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "chats" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <div className="relative">
          <MessageSquare className="w-6 h-6" />
          {chatsBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-[#f43f5e] text-white text-[8.5px] font-sans font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
              {chatsBadgeCount > 99 ? "99+" : chatsBadgeCount}
            </span>
          )}
        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Chats</span>
      </button>

      <button
        id="nav_item_profile"
        onClick={() => { setActiveTab("profile"); }}
        className={`flex flex-col items-center justify-center w-14 h-14 transition-all cursor-pointer ${activeTab === "profile" ? "text-[#ff8b66]" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        <div className="relative">
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

        </div>
        <span className="text-[10.5px] font-sans tracking-wide mt-1 font-medium">Profile</span>
      </button>
    </footer>
  );
};
