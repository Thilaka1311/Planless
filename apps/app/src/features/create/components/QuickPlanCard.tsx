import React from "react";
import { ArrowRight, Users, MoreVertical } from "lucide-react";
import { QuickPlan } from "../../../core/types";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { DiscoveryImages } from "../../../IMGfromDB/PlanImages";
import { useLongPress } from "../../../shared/hooks/useLongPress";

export interface QuickPlanCardProps {
  plan: QuickPlan;
  onTap: () => void;
  onLongPress?: () => void;
  onMenuPress?: () => void;
  className?: string;
  style?: React.CSSProperties;
  variant?: "rail" | "collection";
}

export const QuickPlanCard: React.FC<QuickPlanCardProps> = ({
  plan,
  onTap,
  onLongPress,
  onMenuPress,
  className = "",
  style,
  variant = "rail",
}) => {
  const longPress = useLongPress(() => {
    onLongPress?.();
  }, { threshold: 450 });

  const participants = plan.participants || [];
  const friendCount = participants.length;

  const subtitle = [
    plan.subcategory && plan.subcategory !== "OTHER" ? plan.subcategory : plan.category,
    plan.place_name || plan.place_address,
  ]
    .filter(Boolean)
    .join(" · ");

  const sortedParticipants = [...participants].sort((a, b) => {
    const hasPhotoA = Boolean(
      a.user_profile?.profile_photo_path && a.user_profile.profile_photo_path.trim().length > 0
    );
    const hasPhotoB = Boolean(
      b.user_profile?.profile_photo_path && b.user_profile.profile_photo_path.trim().length > 0
    );
    if (hasPhotoA === hasPhotoB) return 0;
    return hasPhotoA ? -1 : 1;
  });

  if (variant === "collection") {
    return (
      <div
        {...longPress}
        onClick={onTap}
        style={style}
        className={`flex flex-col cursor-pointer group text-left select-none ${className}`}
      >
        {/* Cover Image Container */}
        <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-[#121216] border border-white/[0.08] group-hover:border-[#FF6B2C]/40 transition-all shadow-md group-active:scale-[0.98]">
          <DiscoveryImages
            src={plan.cover_image}
            category={plan.category}
            subcategory={plan.subcategory}
            alt={plan.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        {/* Title & Friends underneath */}
        <div className="mt-2 min-w-0 px-0.5 space-y-1">
          <h4 className="text-sm font-semibold text-white tracking-tight truncate font-sans group-hover:text-[#FF6B2C] transition-colors">
            {plan.name}
          </h4>

          {friendCount > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="flex items-center -space-x-1.5 shrink-0">
                {sortedParticipants.slice(0, 3).map((p, idx) => (
                  <UserAvatar
                    key={p.id || idx}
                    src={p.user_profile?.profile_photo_path}
                    alt={p.user_profile?.full_name || "Friend"}
                    size="w-4 h-4"
                    className="border border-black rounded-full"
                  />
                ))}
                {friendCount > 3 && (
                  <div className="w-4 h-4 rounded-full bg-zinc-800 border border-black flex items-center justify-center text-[9px] text-zinc-300 font-bold leading-none shrink-0 z-10">
                    +
                  </div>
                )}
              </div>
              <span className="text-[11px] text-zinc-400 font-medium truncate">
                {`${friendCount} ${friendCount === 1 ? "friend" : "friends"}`}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      {...longPress}
      onClick={onTap}
      style={style}
      className={`rounded-2xl bg-[#121216] border border-white/[0.08] hover:border-[#FF6B2C]/40 p-4 flex flex-col justify-between shadow-md cursor-pointer group active:scale-[0.99] transition-all select-none relative overflow-hidden text-left ${className}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-zinc-900">
              <DiscoveryImages
                src={plan.cover_image}
                category={plan.category}
                subcategory={plan.subcategory}
                alt={plan.name}
                className="w-full h-full object-cover"
              />
            </div>
            <h4 className="text-[14px] font-bold text-white tracking-tight truncate leading-tight group-hover:text-[#FF6B2C] transition-colors font-sans">
              {plan.name}
            </h4>
          </div>
          {onMenuPress && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMenuPress();
              }}
              className="w-7 h-7 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer shrink-0"
              aria-label="Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Subtitle: Category · Place */}
        <p className="text-xs text-zinc-400 font-medium truncate mt-1">
          {subtitle || "Custom Plan"}
        </p>

        {/* Pre-selected Friends Row */}
        <div className="flex items-center gap-1.5 mt-2.5">
          {friendCount > 0 ? (
            <>
              <div className="flex items-center -space-x-1.5 shrink-0">
                {participants.slice(0, 3).map((p, idx) => (
                  <UserAvatar
                    key={p.id || idx}
                    src={p.user_profile?.profile_photo_path}
                    alt={p.user_profile?.full_name || "Friend"}
                    size="w-5 h-5"
                    className="border border-black rounded-full"
                  />
                ))}
              </div>
              <span className="text-[11px] text-zinc-400 font-medium truncate">
                {`${friendCount} ${friendCount === 1 ? "friend" : "friends"}`}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              <span>No friends set</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom CTA Row: "Use Quick Plan →" */}
      <div className="pt-3 mt-3 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-bold text-[#FF6B2C] group-hover:text-[#FF854C] flex items-center gap-1.5 transition">
          Use Quick Plan
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </div>
  );
};
