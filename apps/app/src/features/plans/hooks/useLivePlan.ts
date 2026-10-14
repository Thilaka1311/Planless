import { useMemo, useRef } from "react";
import { usePlansStore } from "../state/PlansContext";
import { Plan } from "../../../core/types";
import { findPlanBySlugOrId } from "../utils/planSlugUtils";

export function useLivePlan(planIdOrSlug: string | null | undefined): Plan | null {
  const { plans } = usePlansStore();
  const canonicalIdRef = useRef<string | null>(null);
  const lastLookupParamRef = useRef<string | null>(null);

  return useMemo(() => {
    if (!planIdOrSlug) {
      canonicalIdRef.current = null;
      lastLookupParamRef.current = null;
      return null;
    }

    const matched = findPlanBySlugOrId(plans, planIdOrSlug);
    if (matched) {
      canonicalIdRef.current = matched.id || matched.dbUuid || null;
      lastLookupParamRef.current = planIdOrSlug;
      return matched;
    }

    // Fallback: If findPlanBySlugOrId didn't match, check if we previously resolved a plan
    // with this exact lookup param (e.g. plan was renamed and its slug changed, but the
    // route / parent prop hasn't synchronized yet).
    if (canonicalIdRef.current && lastLookupParamRef.current === planIdOrSlug) {
      const fallback = plans.find(
        p => p.id === canonicalIdRef.current || p.dbUuid === canonicalIdRef.current
      );
      if (fallback) {
        return fallback;
      }
    }

    canonicalIdRef.current = null;
    lastLookupParamRef.current = planIdOrSlug;
    return null;
  }, [plans, planIdOrSlug]);
}


