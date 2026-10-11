import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLivePlan } from "../../features/plans/hooks/useLivePlan";
import { useDismissibleOverlay } from "../../features/navigation/appRouter";

interface PaymentConfirmationModalProps {
  paymentConfirmationPlanId: string | null;
  onClose: () => void;
  walletBalance: number;
  handleToggleJoin: (planId: string) => void;
  setSelectedPlanId: (planId: string | null) => void;
  setShowPaymentSuccessId: (planId: string | null) => void;
}

export default function PaymentConfirmationModal({
  paymentConfirmationPlanId,
  onClose,
  walletBalance,
  handleToggleJoin,
  setSelectedPlanId,
  setShowPaymentSuccessId
}: PaymentConfirmationModalProps) {
  useDismissibleOverlay(Boolean(paymentConfirmationPlanId), onClose);
  const livePlan = useLivePlan(paymentConfirmationPlanId);

  React.useEffect(() => {
    
  }, [paymentConfirmationPlanId, livePlan]);

  return (
    <AnimatePresence>
      {paymentConfirmationPlanId && livePlan && (
        <motion.div
          id="payment_slide_sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/92 backdrop-blur-md z-50 flex flex-col justify-end"
        >
          <motion.div
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            exit={{ y: 200 }}
            className="bg-[#0e0e11] border-t border-zinc-850 w-full max-w-md mx-auto rounded-t-[2.5rem] p-6 space-y-5 shadow-2xl pb-8"
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <span className="text-[9px] font-mono text-[#ff8b66] uppercase font-bold tracking-widest">Spontaneous Split Checkout</span>
              <button onClick={onClose} className="text-xs text-zinc-500 focus:outline-none">Cancel</button>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-3xl font-black text-white leading-none">₹{Number(livePlan.cost).toFixed(2)}</h3>
              <p className="text-xs text-zinc-500 font-sans mt-0.5">Split fee for {livePlan.title}</p>
            </div>

            <button
              onClick={() => {
                const planIdToSucceed = livePlan.id;
                handleToggleJoin(planIdToSucceed);
                onClose();
                setSelectedPlanId(null);
                setShowPaymentSuccessId(planIdToSucceed);
              }}
              className="w-full py-4 rounded-2xl bg-brand-orange text-white font-extrabold text-xs uppercase tracking-widest focus:outline-none hover:bg-opacity-90 transition-colors"
            >
              Confirm split checkout
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
