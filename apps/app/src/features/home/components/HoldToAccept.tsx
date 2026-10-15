import React, { useMemo } from "react";
import { motion } from "motion/react";
import { MapPin } from "lucide-react";
import { Plan } from "../../../core/types";
import { useLivePlan } from "../../plans/hooks/useLivePlan";
import { usePlansStore } from "../../plans/state/PlansContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { getHeroMetadataCostText } from "../../plans/components/HeroMetadataCard";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { getPlanAreaName } from "../../discovery/services/addressUtils";
import { getPlanHosts } from "../../plans/utils/planHostUtils";

interface HoldToAcceptOverlayProps {
  planId: string;
  holdProgress: number;
  isHolding: boolean;
  isFull: boolean;
  formattedDateAndTime: string;
  costText?: string | null;
  plan?: Plan;
  contentScale?: number;
}

export const HoldToAcceptOverlay: React.FC<HoldToAcceptOverlayProps> = ({
  planId,
  holdProgress,
  isHolding,
  isFull,
  formattedDateAndTime,
  costText: propCostText,
  plan: propPlan,
  contentScale,
}) => {
  const livePlan = useLivePlan(planId);
  const plan = propPlan || livePlan;
  const { dbPlans } = usePlansStore();
  const { dbUsers, userProfile } = useProfileStore();

  const costText = useMemo(() => {
    if (propCostText !== undefined) {
      return propCostText;
    }
    const rawDbPlan = dbPlans.find((p) => p.id === plan?.id || (plan?.dbUuid && p.id === plan.dbUuid));
    return getHeroMetadataCostText(rawDbPlan, plan);
  }, [propCostText, plan, dbPlans]);

  const hostList = useMemo(() => {
    return getPlanHosts(plan, {
      viewerUserId: (userProfile as any)?.dbUuid || userProfile?.user_id || (userProfile as any)?.id,
      dbUsers,
      currentUserProfile: userProfile,
    });
  }, [plan, userProfile, dbUsers]);

  const hostedByText = useMemo(() => {
    return hostList.map((h) => h.name || "Host").join(", ");
  }, [hostList]);

  const visibleHosts = useMemo(() => {
    return hostList.slice(0, 4);
  }, [hostList]);

  const remainingHosts = Math.max(0, hostList.length - 4);

  if (!isHolding || !plan) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
      className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center z-30 pointer-events-none"
    >
      {/* Inner container to shift content stack slightly upward (approx 44px) for premium look */}
      <div
        className={`flex flex-col items-center justify-center w-full px-4 ${contentScale ? "-translate-y-5" : "-translate-y-11"}`}
        style={contentScale ? { transform: `scale(${contentScale})`, transformOrigin: "center center" } : undefined}
      >
        
        {/* Holding circular progress indicator ring with Planless orange glow */}
        <div className="relative w-28 h-28 flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(255,107,44,0.15)] bg-black/10">
          
          {/* Circular ring path outline SVG */}
          <svg className="w-full h-full transform -rotate-90">
            {/* Background track outline */}
            <circle
              cx="56"
              cy="56"
              r="44"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="7"
              fill="none"
            />
            {/* Filling progress ring */}
            <circle
              cx="56"
              cy="56"
              r="44"
              stroke="#FF6B2C"
              strokeWidth="7"
              fill="none"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - holdProgress / 100)}
              strokeLinecap="round"
            />
          </svg>

          {/* Percentage output text back centered for robust timing feedback */}
          <div className="absolute font-sans font-black text-white text-lg tracking-tight select-none pointer-events-none">
            {Math.round(holdProgress)}%
          </div>
        </div>

        {/* Plan as the hero details with precise hierarchical priority */}
        <div className="flex flex-col items-center mt-6 text-center select-none pointer-events-none max-w-sm px-4 w-full min-w-0">
          {/* 1. Plan Title (Visually stable across joining, no layout expansion, natural wrapping) */}
          <span
            className="text-[22px] font-sans font-black text-white leading-tight block w-full whitespace-normal break-words"
            title={plan.title || (plan as any)?.plan_name}
          >
            {plan.title || (plan as any)?.plan_name}
          </span>
          
          {/* 2. Venue details (Medium emphasis, immediately scannable location cue: area/locality only) */}
          {(() => {
            const isMovie = (plan.category || "").toLowerCase() === "movies";
            const isYearOnly = (s: string | null | undefined) => /^\d{4}$/.test((s || "").trim());
            const rawLoc = (isMovie && isYearOnly(plan.location))
              ? ""
              : (plan.location || (plan as any).place_address || (plan as any).place_name || "");
            if (!rawLoc) return null;
            const areaLocality = getPlanAreaName(rawLoc);
            const displayLoc = areaLocality || rawLoc;
            if (!displayLoc) return null;
            return (
              <div className="flex items-center justify-center gap-1.5 mt-2.5 max-w-full px-2">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-[14.5px] font-sans font-extrabold text-white tracking-tight truncate whitespace-nowrap">
                  {displayLoc}
                </span>
              </div>
            );
          })()}
          
          {/* 3. Host details (Subtle metadata with host avatar or compact avatar group) */}
          <div className="flex flex-col items-center mt-3 max-w-full px-2">
            {hostList.length <= 1 ? (
              <UserAvatar
                src={visibleHosts[0]?.avatar}
                alt={visibleHosts[0]?.name || "Host"}
                size="w-10 h-10"
                className="border border-white/20 shadow-md mb-1.5"
              />
            ) : (
              <div className="flex items-center -space-x-2 mb-1.5 flex-shrink-0" data-testid="hold-hosts-avatars">
                {visibleHosts.map((h, idx) => (
                  <UserAvatar
                    key={h.id || idx}
                    src={h.avatar}
                    alt={h.name || "Host"}
                    size="w-10 h-10"
                    className="border-2 border-zinc-900 rounded-full shadow-md relative"
                    style={{ zIndex: visibleHosts.length - idx }}
                  />
                ))}
                {remainingHosts > 0 && (
                  <div
                    className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[11px] text-zinc-300 font-bold leading-none shrink-0 relative"
                    style={{ zIndex: 0 }}
                    title={`+${remainingHosts} more`}
                  >
                    +{remainingHosts}
                  </div>
                )}
              </div>
            )}
            <span className="text-[11.5px] font-sans text-zinc-400 block leading-tight">
              Hosted by
            </span>
            <span
              className="text-[13px] font-sans font-bold text-zinc-100 block leading-tight mt-0.5 max-w-full truncate"
              title={hostedByText}
            >
              {hostedByText}
            </span>
          </div>

          {/* 4. Dynamic Cost per person (Supporting metadata from Hero Metadata Card) */}
          {costText && (
            <span className="text-[13.5px] font-sans font-semibold text-white/90 mt-2 block tracking-tight">
              {costText}
            </span>
          )}
        </div>

      </div>
    </motion.div>
  );
};