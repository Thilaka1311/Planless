import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { WalletRelationshipCard } from "../components/WalletRelationshipCard";
import { WalletPlanCard } from "../components/WalletPlanCard";
import { WalletRelationship, PlanRelationship } from "../services/walletService";

interface PeopleSettledUpProps {
  settledRelationships: WalletRelationship[];
  onBack: () => void;
  onSelectPerson: (userId: string) => void;
}

export const PeopleSettledUpScreen: React.FC<PeopleSettledUpProps> = ({
  settledRelationships,
  onBack,
  onSelectPerson,
}) => {
  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-20 text-left bg-[#050505] animate-fade-in select-none">
      {/* Navigation Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
            People Settled Up
          </h2>
          <p className="text-xs font-sans text-zinc-500 font-medium">
            Historical person-to-person settlements
          </p>
        </div>
      </div>

      {/* List or Empty State */}
      <div className="flex-1">
        {settledRelationships.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-zinc-700 mx-auto stroke-[1.5]" />
            <h4 className="font-display font-semibold text-sm text-zinc-400">
              No settled relationships
            </h4>
            <p className="text-xs font-sans text-zinc-600">
              Settled relationships will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {settledRelationships.map((rel) => (
              <WalletRelationshipCard
                key={rel.userId}
                fullName={rel.fullName}
                profilePhoto={rel.profilePhoto}
                netBalance={0}
                isSettled={true}
                onClick={() => onSelectPerson(rel.userId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface PlansSettledUpProps {
  settledPlanRelationships: PlanRelationship[];
  onBack: () => void;
  onSelectPlan: (planId: string) => void;
}

export const PlansSettledUpScreen: React.FC<PlansSettledUpProps> = ({
  settledPlanRelationships,
  onBack,
  onSelectPlan,
}) => {
  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-none px-6 pt-3 pb-20 text-left bg-[#050505] animate-fade-in select-none">
      {/* Navigation Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer border border-zinc-900/60"
          aria-label="Back to Wallet"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
            Plans Settled Up
          </h2>
          <p className="text-xs font-sans text-zinc-500 font-medium">
            Historical plan settlements
          </p>
        </div>
      </div>

      {/* List or Empty State */}
      <div className="flex-1">
        {settledPlanRelationships.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-zinc-700 mx-auto stroke-[1.5]" />
            <h4 className="font-display font-semibold text-sm text-zinc-400">
              No settled plans
            </h4>
            <p className="text-xs font-sans text-zinc-600">
              Settled plans will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {settledPlanRelationships.map((planRel) => (
              <WalletPlanCard
                key={planRel.expenseId}
                plan={planRel}
                onClick={() => onSelectPlan(planRel.planId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
