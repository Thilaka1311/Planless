import React from "react";
import { useDismissibleOverlay } from "../../features/navigation/appRouter";

interface DepositCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  depositAmount: string;
  setDepositAmount: (val: string) => void;
  handleDepositMoney: (e: React.FormEvent) => void;
}

export default function DepositCashModal({
  isOpen,
  onClose,
  depositAmount,
  setDepositAmount,
  handleDepositMoney
}: DepositCashModalProps) {
  useDismissibleOverlay(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div id="add_money_modal_backdrop" className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in">
      <form
        onSubmit={handleDepositMoney}
        className="w-full bg-[#121214] border-t border-zinc-850 rounded-t-[2.5rem] p-6 pb-8 space-y-4 animate-slide-up"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-zinc-450 uppercase">ADD FUNDS (UPI SIMULATOR)</span>
          <button type="button" onClick={onClose} className="text-xs text-zinc-550 focus:outline-none">Cancel</button>
        </div>
        
        <div className="text-center py-2 space-y-1">
          <span className="text-[10px] text-zinc-550 font-mono uppercase block">DEPOSIT INR</span>
          <input
            type="number"
            placeholder="500"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="bg-transparent text-white border-b border-zinc-800 text-2xl font-mono w-40 text-center focus:outline-none focus:border-brand-peach"
            required
            autoFocus
          />
        </div>

        <button type="submit" className="w-full py-3.5 rounded-xl bg-brand-orange text-white font-black text-xs uppercase tracking-widest focus:outline-none hover:bg-opacity-90 transition-colors">
          Confirm Deposit
        </button>
      </form>
    </div>
  );
}
