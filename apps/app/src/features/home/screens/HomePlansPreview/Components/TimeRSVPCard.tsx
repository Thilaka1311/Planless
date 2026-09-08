import React from "react";
import { Clock, Hourglass } from "lucide-react";
import { formatPlanDate } from "../../../../../../lib/mappers";
import { formatDeadlineFull } from "../../../components/PlanCard";
import { useRSVPDeadline } from "../../../../plans/utils/rsvpFormatter";

interface TimeRSVPCardProps {
  datetime?: string;
  createdAt: string;
  hasCost: boolean;
  costText?: string;
  urgencyColor: string;
  responseDeadlineAt?: any;
}

export const TimeRSVPCard: React.FC<TimeRSVPCardProps> = ({
  datetime,
  createdAt,
  hasCost,
  costText,
  urgencyColor,
  responseDeadlineAt,
}) => {
  const rsvp = useRSVPDeadline(responseDeadlineAt);

  return (
    <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl p-2.5 border border-white/10 shadow-lg w-fit max-w-[85%] flex-shrink-0 text-left">
      <div className="space-y-1.5 font-sans">
        <div className="flex items-center gap-1.5 text-white/90">
          <Clock className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
          <span className="text-[11px] font-medium leading-none">
            {formatPlanDate(datetime || createdAt)}
          </span>
        </div>
        {hasCost && costText && (
          <div className="text-[10px] text-emerald-400 font-semibold pl-5 leading-none">
            {costText}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] font-medium leading-none">
          <Hourglass className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rsvp.color }} />
          <span className="truncate" style={{ color: rsvp.color }}>
            {rsvp.text}
          </span>
        </div>
      </div>
    </div>
  );
};
