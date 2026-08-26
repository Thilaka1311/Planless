import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { WalletRelationship, createWalletSettlement } from "../services/walletService";

interface SettleUpScreenProps {
  relationship: WalletRelationship;
  activeUserId: string;
  planId?: string;
  onBack: () => void;
  onSettled: () => void;
  onMount?: () => void;
}

export const SettleUpScreen: React.FC<SettleUpScreenProps> = ({
  relationship,
  activeUserId,
  planId,
  onBack,
  onSettled,
  onMount,
}) => {
  const isOwed = relationship.netBalance >= 0;
  const absNetBalance = Math.abs(relationship.netBalance);

  // Smart format: no .00 for whole numbers
  const smartFormat = (val: number) => {
    const rounded = Math.round(val * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };

  const [amountInput, setAmountInput] = useState<string>(smartFormat(absNetBalance));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hide bottom nav on mount; restored by the caller on back/settled
  useEffect(() => {
    onMount?.();
  }, []);


  const formattedNetBalance = (() => {
    const rounded = Math.round(absNetBalance * 100) / 100;
    if (Number.isInteger(rounded)) {
      return `₹${rounded.toLocaleString("en-IN")}`;
    }
    return `₹${rounded.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  })();

  const handleSettle = async () => {
    if (submitting) return;

    const parsed = parseFloat(amountInput);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Please enter a valid amount greater than ₹0.");
      return;
    }
    if (parsed - absNetBalance > 0.01) {
      setError(
        isOwed
          ? `${relationship.fullName} only owes you ${formattedNetBalance}`
          : `You only owe ${relationship.fullName} ${formattedNetBalance}`
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await createWalletSettlement({
        receiverId: relationship.userId,
        amount: parsed,
        planId: planId || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to record settlement. Please try again.");
        setSubmitting(false);
        return;
      }

      onSettled();
    } catch (err: any) {
      console.error("[SettleUpScreen] Exception creating settlement:", err);
      setError(err.message || "Failed to complete settlement.");
      setSubmitting(false);
    }
  };

  return (
    /*
     * Full-screen layout using the dynamic viewport height (dvh) unit so the
     * visible area shrinks when the software keyboard appears — the profile
     * section stays pinned at top and the Settle Up button stays visible
     * at the bottom without any scrolling.
     */
    <div
      className="w-full flex flex-col bg-[#050505] text-left overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-sans font-semibold text-zinc-300">Settle up</span>
        {/* Balance spacer */}
        <div className="w-8" />
      </div>

      {/* ── Profile + editable amount ────────────────────────────────────── */}
      <div className="flex flex-col items-center px-6 pt-8 pb-4 shrink-0">
        {/* Avatar */}
        <UserAvatar
          src={relationship.profilePhoto}
          alt={relationship.fullName}
          size="w-24 h-24"
          className="ring-2 ring-white/10 shadow-lg mb-4"
        />

        {/* Name */}
        <h2 className="font-sans font-bold text-xl text-white mb-0.5 text-center leading-tight">
          {relationship.fullName}
        </h2>

        {/* Direction */}
        <p className="text-[10px] font-sans font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-4 text-center">
          {isOwed ? "Owes you" : "You owe"}
        </p>

        {/* ── Inline editable amount ── */}
        <div className="relative flex items-center justify-center">
          {/* ₹ prefix — visually part of the "display" */}
          <span className="font-sans font-extrabold text-white select-none"
                style={{ fontSize: "clamp(2rem, 8vw, 3rem)", lineHeight: 1 }}>
            ₹
          </span>
          {/*
           * The input is transparent-background, no border, bold, same size as
           * the ₹ prefix. It looks like plain large text but IS the input.
           * `inputMode="decimal"` brings up the numeric keyboard on mobile.
           */}
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            max={absNetBalance}
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value);
              setError(null);
            }}
            className="bg-transparent border-none outline-none text-white font-sans font-extrabold text-center caret-emerald-400"
            style={{
              fontSize: "clamp(2rem, 8vw, 3rem)",
              lineHeight: 1,
              // dynamically size the box to content so it stays centered
              width: `${Math.max(2, amountInput.length + 1)}ch`,
              minWidth: "2ch",
              maxWidth: "65vw",
              // remove default number-input spinners
              MozAppearance: "textfield",
            } as React.CSSProperties}
          />
        </div>

        {/* Error message (below amount) */}
        {error && (
          <p className="mt-3 text-rose-400 text-xs font-sans text-center px-4">
            {error}
          </p>
        )}
      </div>

      {/* ── Flexible spacer — shrinks when keyboard opens ────────────────── */}
      <div className="flex-1 min-h-0" />

      {/* ── Fixed Settle Up button pinned to bottom of visible viewport ── */}
      <div className="shrink-0 px-6 pb-8 pt-3">
        <button
          type="button"
          disabled={submitting}
          onClick={handleSettle}
          className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-sans font-bold text-sm transition-all cursor-pointer shadow-lg shadow-emerald-600/25 disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? "Settling..." : "Settle Up"}
        </button>
      </div>
    </div>
  );
};
