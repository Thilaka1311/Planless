import React from 'react';
import { ArrowLeft, Split, Merge } from 'lucide-react';
import { DiscoveryImages } from '../../../IMGfromDB/PlanImages';

export interface UpdatePlanFeeBottomSheetProps {
  isOpen: boolean;
  plan: any;
  matchedDbPlan?: any;
  targetPlanUuid?: string;
  targetCapacity: number | null;
  currentCapacity: number;
  currentTotalCost: number;
  isSubmitting?: boolean;
  selectedOption?: 'split_current_cost' | 'keep_cost_per_person' | null;
  onSelectOption: (option: 'split_current_cost' | 'keep_cost_per_person') => void | Promise<void>;
  onBack?: () => void;
  onClose: () => void;
}

export const UpdatePlanFeeBottomSheet: React.FC<UpdatePlanFeeBottomSheetProps> = ({
  isOpen,
  plan,
  matchedDbPlan,
  targetPlanUuid,
  targetCapacity,
  currentCapacity,
  currentTotalCost,
  isSubmitting = false,
  selectedOption = null,
  onSelectOption,
  onBack,
  onClose,
}) => {
  if (!isOpen || targetCapacity === null) return null;

  const planFeeCurrentTotal = currentTotalCost;
  const capacity = Math.max(2, currentCapacity);
  const planFeeCurrentPerPerson =
    capacity > 0 ? Math.round((planFeeCurrentTotal / capacity) * 100) / 100 : 0;
  const planFeeOptionANewTotal = targetCapacity
    ? Math.round(targetCapacity * planFeeCurrentPerPerson * 100) / 100
    : planFeeCurrentTotal;
  const planFeeOptionBPerPerson =
    targetCapacity && targetCapacity > 0
      ? Math.round((planFeeCurrentTotal / targetCapacity) * 100) / 100
      : 0;

  return (
    <div
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1C1C1E',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="select-none text-left"
      >
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-1 text-left flex items-center gap-3.5">
          {onBack && (
            <button
              id="update-cost-back-btn"
              type="button"
              disabled={isSubmitting}
              onClick={onBack}
              className="p-1 -ml-1 text-white hover:text-white/80 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          )}
          <div className="w-[44px] h-[44px] rounded-full overflow-hidden border border-white/[0.08] shadow-sm flex-shrink-0 relative bg-zinc-900">
            <DiscoveryImages
              src={plan?.coverImage || plan?.cover_image || matchedDbPlan?.cover_image}
              planId={targetPlanUuid || plan?.id}
              category={plan?.category || matchedDbPlan?.category}
              subcategory={plan?.subcategory || matchedDbPlan?.subcategory}
              screen="Plan Actions Avatar"
              alt={plan?.title || 'Plan'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center space-y-0.5">
            <h3 className="font-sans font-semibold text-[15px] text-white tracking-wide truncate leading-snug">
              {plan?.title || 'Plan'}
            </h3>
            <p className="font-sans text-[12px] text-zinc-400 truncate leading-tight">
              Update the cost
            </p>
          </div>
        </div>

        <div className="px-4 pt-4 flex flex-col gap-2.5">
          <button
            id="fee-option-split-cost"
            type="button"
            disabled={isSubmitting}
            onClick={() => onSelectOption('split_current_cost')}
            style={{
              width: '100%',
              height: 48,
              padding: '0 14px',
              background:
                selectedOption === 'split_current_cost'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 12,
              color: '#FFFFFF',
              textAlign: 'left',
              cursor: isSubmitting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'all 0.15s ease',
              opacity: isSubmitting && selectedOption !== 'split_current_cost' ? 0.5 : 1,
            }}
          >
            <Split className="w-5 h-5 text-[#10B981] flex-shrink-0" />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                Split the total
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.5)',
                  lineHeight: 1.2,
                  marginTop: 1,
                }}
              >
                {planFeeCurrentTotal > 0 && targetCapacity ? (
                  `₹${Math.round(planFeeCurrentTotal).toLocaleString('en-IN')} ÷ ${targetCapacity} = ₹${Math.round(
                    planFeeOptionBPerPerson
                  ).toLocaleString('en-IN')}/person`
                ) : (
                  'Keep the total cost and split it among participants'
                )}
              </span>
            </div>
          </button>

          <button
            id="fee-option-keep-cost-per-person"
            type="button"
            disabled={isSubmitting}
            onClick={() => onSelectOption('keep_cost_per_person')}
            style={{
              width: '100%',
              height: 48,
              padding: '0 14px',
              background:
                selectedOption === 'keep_cost_per_person'
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 12,
              color: '#FFFFFF',
              textAlign: 'left',
              cursor: isSubmitting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'all 0.15s ease',
              opacity: isSubmitting && selectedOption !== 'keep_cost_per_person' ? 0.5 : 1,
            }}
          >
            <Merge className="w-5 h-5 text-[#10B981] flex-shrink-0" />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>
                {planFeeCurrentTotal > 0
                  ? `Keep ₹${Math.round(planFeeCurrentPerPerson).toLocaleString('en-IN')}/person`
                  : 'Keep cost per person'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.5)',
                  lineHeight: 1.2,
                  marginTop: 1,
                }}
              >
                {planFeeCurrentTotal > 0
                  ? `New total: ₹${Math.round(planFeeOptionANewTotal).toLocaleString('en-IN')}`
                  : 'Calculate new total based on participant count'}
              </span>
            </div>
          </button>

          <button
            id="fee-option-cancel-btn"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              background: 'none',
              border: 'none',
              borderRadius: 12,
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 14,
              fontWeight: 500,
              cursor: isSubmitting ? 'default' : 'pointer',
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
