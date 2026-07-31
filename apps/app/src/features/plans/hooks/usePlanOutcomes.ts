import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DbPlanOutcome, User } from "../../../core/types";
import { resolveUserUuid } from "../utils/planUtils";
import { supabase } from "../../../../lib/supabaseClient";

// ─── Dependency injection types ───────────────────────────────────────────────

export interface PlanOutcomesDeps {
  dbPlanOutcomes: DbPlanOutcome[];
  setDbPlanOutcomes: Dispatch<SetStateAction<DbPlanOutcome[]>>;
  dbUsers: User[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlanOutcomes(deps: PlanOutcomesDeps) {
  const { dbPlanOutcomes, setDbPlanOutcomes, dbUsers } = deps;

  // ─── submitReview ────────────────────────────────────────────────────────────
  // Payload: { rating, review }

  const submitReview = useCallback(async (
    memoryId: string,
    category: 'movie' | 'dining',
    rating: number,
    review: string | null,
    userUuid: string,
    existingId?: string
  ) => {
    // Plan Outcomes not implemented yet: bypass DB write
  }, []);

  // ─── submitStats ─────────────────────────────────────────────────────────────
  // Football payload: { teamAScore, teamBScore }
  // Badminton payload: { wins, losses }

  const submitStats = useCallback(async (
    memoryId: string,
    category: 'football' | 'badminton',
    stats: { scoreA?: number; scoreB?: number; wins?: number; losses?: number },
    userUuid: string
  ) => {
    // Plan Outcomes not implemented yet: bypass DB write
  }, []);

  // ─── submitMvp ───────────────────────────────────────────────────────────────
  // Payload: { mvp_user_id }

  const submitMvp = useCallback(async (
    memoryId: string,
    voterUuid: string,
    mvpUuid: string
  ) => {
    // Plan Outcomes not implemented yet: bypass DB write
  }, []);

  return {
    dbPlanOutcomes,
    submitReview,
    submitStats,
    submitMvp,
  };
}
