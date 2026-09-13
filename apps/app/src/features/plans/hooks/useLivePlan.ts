import { useMemo } from "react";
import { usePlansStore } from "../state/PlansContext";
import { Plan } from "../../../core/types";
import { findPlanBySlugOrId } from "../utils/planSlugUtils";

export function useLivePlan(planIdOrSlug: string | null | undefined): Plan | null {
  const { plans } = usePlansStore();
  return useMemo(() => {
    if (!planIdOrSlug) return null;
    return findPlanBySlugOrId(plans, planIdOrSlug);
  }, [plans, planIdOrSlug]);
}

