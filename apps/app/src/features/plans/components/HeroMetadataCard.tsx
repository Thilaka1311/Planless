import React, { useState } from "react";
import { Clock, Hourglass, MapPin, ChevronRight, Users } from "lucide-react";
import { formatPlanDate } from "../../../../lib/mappers";
import { formatDeadlineFull } from "../../home/components/PlanCard";
import { useRSVPDeadline } from "../utils/rsvpFormatter";
import { CostBreakdownPopover } from "./CostBreakdownPopover";

interface HeroMetadataCardProps {
  datetime?: string;
  createdAt: string;
  hasCost: boolean;
  costText?: string;
  totalCost?: number | null;
  maxParticipants?: number | null;
  isHost?: boolean;
  onEditCost?: () => void;
  onEditCapacity?: () => void;
  urgencyColor: string;
  responseDeadlineAt?: any;
  location: string;
}

export const HeroMetadataCard: React.FC<HeroMetadataCardProps> = ({
  datetime,
  createdAt,
  hasCost,
  costText,
  totalCost,
  maxParticipants,
  isHost,
  onEditCost,
  onEditCapacity,
  urgencyColor,
  responseDeadlineAt,
  location,
}) => {
  const [isCostPopoverOpen, setIsCostPopoverOpen] = useState(false);

  const handleLocationClick = () => {
    if (!location) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    window.open(url, "_blank");
  };

  const rsvp = useRSVPDeadline(responseDeadlineAt);

  return (
    <div className="bg-black/45 backdrop-blur-[6px] rounded-2xl border border-white/10 shadow-xl w-[260px] flex-shrink-0 text-left overflow-visible relative">
      {/* Top caret/pointer aligned to the Info icon on the right side */}
      <div className="absolute -top-1.5 right-[14px] w-3 h-3 bg-black/45 border-t border-l border-white/10 rotate-45" />

      {/* Event Information (Upper Section) */}
      <div className="p-4 space-y-3.5 font-sans relative z-10">
        <div className="flex items-center justify-between gap-2 text-white/95">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-white/50 flex-shrink-0" />
            <span className="text-[11px] font-medium leading-none truncate">
              {datetime ? formatPlanDate(datetime) : "Set a date"}
            </span>
          </div>
          {Boolean(maxParticipants) && (
            <div
              className="flex items-center gap-1.5 text-white/90 text-[11px] font-medium leading-none shrink-0 select-none pointer-events-none"
            >
              <Users className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
              <span>{maxParticipants}</span>
            </div>
          )}
        </div>
        {hasCost && costText ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCostPopoverOpen((prev) => !prev)}
              className="text-[10px] text-emerald-400 font-semibold pl-6 leading-none cursor-pointer hover:underline text-left"
            >
              {costText}
            </button>
            <CostBreakdownPopover
              totalCost={totalCost}
              maxParticipants={maxParticipants}
              isOpen={isCostPopoverOpen}
              onClose={() => setIsCostPopoverOpen(false)}
              isHost={isHost}
              onEditCost={onEditCost}
              position="above"
              align="left"
            />
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => onEditCost?.()}
              className="text-[10px] text-white/50 font-medium pl-6 leading-none cursor-pointer hover:underline text-left"
            >
              Set a cost
            </button>
          </div>
        )}
        <div className="flex flex-col gap-1" style={{ color: rsvp.color }}>
          <div className="flex items-center gap-2 text-[11px] font-semibold leading-none">
            <Hourglass className="w-4 h-4 flex-shrink-0" style={{ color: rsvp.color }} />
            <span>RSVP</span>
          </div>
          <span className="pl-6 text-[10.5px] font-medium leading-tight" style={{ color: rsvp.color }}>
            {rsvp.text}
          </span>
        </div>
      </div>

      {/* Understated Divider */}
      <div className="border-t border-white/[0.06] relative z-10" />

      {/* Location Row (Interactive Bottom Section) */}
      <button
        type="button"
        onClick={handleLocationClick}
        className="w-full flex items-center justify-between gap-4 p-4 hover:bg-white/[0.04] transition active:bg-white/[0.08] text-left cursor-pointer rounded-b-2xl relative z-10"
      >
        <div className="flex items-center gap-2 text-white/90 max-w-[80%]">
          <MapPin className="w-4 h-4 text-white/50 flex-shrink-0" />
          <span className="text-xs font-semibold truncate leading-none">{location || "Add a location"}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />
      </button>
    </div>
  );
};
