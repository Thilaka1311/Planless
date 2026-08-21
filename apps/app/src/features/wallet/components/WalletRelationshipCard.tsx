import React from "react";
import { Check } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";

interface WalletRelationshipCardProps {
  fullName: string;
  profilePhoto: string;
  netBalance: number;
  type?: "owe" | "owed";
  planTitle?: string;
  isSettled?: boolean;
  onClick: () => void;
}

export const WalletRelationshipCard: React.FC<WalletRelationshipCardProps> = ({
  fullName,
  profilePhoto,
  netBalance,
  isSettled = false,
  onClick,
}) => {
  const settled = isSettled || Math.abs(netBalance) < 0.01;
  const isOwed = netBalance > 0;
  const formattedBalance = Math.abs(netBalance).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between py-3 px-1 hover:bg-white/[0.02] transition-colors text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <UserAvatar
          src={profilePhoto}
          alt={fullName}
          size="w-10 h-10"
          className="ring-1 ring-white/10 shrink-0 opacity-90"
        />
        <div className="min-w-0">
          <h4 className="font-sans font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
            {fullName}
          </h4>
          {!settled && (
            <p className="text-[11px] font-sans text-white mt-0.5 truncate">
              {isOwed ? "Owes you" : "You owe"}
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-3 flex items-center justify-end">
        {settled ? (
          <span className="font-sans text-sm font-semibold text-white tracking-tight">
            Settled
          </span>
        ) : (
          <span className="font-sans text-sm font-bold tracking-tight text-white">
            {formattedBalance}
          </span>
        )}
      </div>
    </button>
  );
};
