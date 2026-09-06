import { clearDraftCoverBlob } from './draftCoverStorage';

export interface DraftParticipantState {
  joinedIds: string[];
  waitlistIds: string[];
  joinedFriends?: any[];
  waitlistFriends?: any[];
  updatedAt?: number;
}

export interface CreatePlanDraft {
  draftId: string;
  updatedAt: number;
  userId?: string;

  // Wizard routing state
  createPhase: 'category' | 'who' | 'who-actually' | 'when' | 'review' | 'confirmation';
  selectedCategory: 'sports' | 'movies' | 'dining' | 'custom';
  selectedSubcategory: string | null;
  cameFromReview: boolean;
  returnToWhoActually: boolean;
  returnToPlanSizeSheet: boolean;

  // Form fields
  localTitle: string;
  localLocation: string;
  quickNote: string;
  costAmount: number;
  isCostManuallySet: boolean;

  // Date & Time
  eventDateTime: string; // ISO string
  isDateManuallySet: boolean;
  rsvpDeadline: string | null;
  customDeadline: string; // ISO string

  // Location / Google Maps
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  placeAddress: string | null;
  discoveryItemId: string | null;

  // Cover image (safe string URL only, not raw blob)
  customCoverImage: string | null;

  // Capacity & Mode
  totalCapacity: number | undefined;
  isCapacityManuallySet: boolean;
  waitlistEnabled: boolean;
  waitlistMode: 'automatic' | 'assigned';
  isHostSelected: boolean;

  // Participants & Ordering
  individuallySelectedFriendIds: string[];
  selectedFriends: any[];
  priorityGuestIds: string[];
  joinedIds: string[];
  waitlistIds: string[];
  joinedFriends?: any[];
  waitlistFriends?: any[];
}

export const DRAFT_PARTICIPANTS_STORAGE_KEY = 'planless_create_draft_assigned_participants';
export const CREATE_PLAN_DRAFT_KEY = 'planless_create_plan_draft';

/**
 * Retrieves the full saved Plan Creation draft.
 * Guarantees joinedIds ∩ waitlistIds = ∅.
 */
export function getSavedCreatePlanDraft(): CreatePlanDraft | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(CREATE_PLAN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // Check if dedicated participant storage has more recent participant state
    const savedPart = getSavedDraftParticipants();
    let joinedIds = Array.isArray(parsed.joinedIds) ? parsed.joinedIds : [];
    let waitlistIds = Array.isArray(parsed.waitlistIds) ? parsed.waitlistIds : [];
    let joinedFriends = Array.isArray(parsed.joinedFriends) ? parsed.joinedFriends : undefined;
    let waitlistFriends = Array.isArray(parsed.waitlistFriends) ? parsed.waitlistFriends : undefined;

    if (savedPart && (savedPart.joinedIds.length > 0 || savedPart.waitlistIds.length > 0)) {
      joinedIds = savedPart.joinedIds;
      waitlistIds = savedPart.waitlistIds;
      if (savedPart.joinedFriends) joinedFriends = savedPart.joinedFriends;
      if (savedPart.waitlistFriends) waitlistFriends = savedPart.waitlistFriends;
    }

    const cleanJoinedIds: string[] = Array.from(
      new Set(joinedIds.filter((id: any): id is string => typeof id === 'string' && Boolean(id)))
    );
    const joinedSet = new Set(cleanJoinedIds);

    const cleanWaitlistIds: string[] = Array.from(
      new Set(
        waitlistIds.filter(
          (id: any): id is string => typeof id === 'string' && Boolean(id) && !joinedSet.has(id)
        )
      )
    );

    return {
      draftId: parsed.draftId || `draft_${Date.now()}`,
      updatedAt: parsed.updatedAt || Date.now(),
      userId: parsed.userId,

      createPhase: parsed.createPhase || 'category',
      selectedCategory: parsed.selectedCategory || 'custom',
      selectedSubcategory: parsed.selectedSubcategory || null,
      cameFromReview: Boolean(parsed.cameFromReview),
      returnToWhoActually: Boolean(parsed.returnToWhoActually),
      returnToPlanSizeSheet: Boolean(parsed.returnToPlanSizeSheet),

      localTitle: parsed.localTitle || '',
      localLocation: parsed.localLocation || '',
      quickNote: parsed.quickNote || '',
      costAmount: typeof parsed.costAmount === 'number' ? parsed.costAmount : 0,
      isCostManuallySet: Boolean(parsed.isCostManuallySet),

      eventDateTime: parsed.eventDateTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      isDateManuallySet: Boolean(parsed.isDateManuallySet),
      rsvpDeadline: parsed.rsvpDeadline || null,
      customDeadline: parsed.customDeadline || new Date().toISOString(),

      placeId: parsed.placeId || null,
      latitude: typeof parsed.latitude === 'number' ? parsed.latitude : null,
      longitude: typeof parsed.longitude === 'number' ? parsed.longitude : null,
      placeAddress: parsed.placeAddress || null,
      discoveryItemId: parsed.discoveryItemId || null,

      customCoverImage:
        typeof parsed.customCoverImage === 'string' &&
        !parsed.customCoverImage.startsWith('data:') &&
        !parsed.customCoverImage.startsWith('blob:')
          ? parsed.customCoverImage
          : (parsed.customCoverImage && typeof parsed.customCoverImage === 'string' && (parsed.customCoverImage.startsWith('blob:') || parsed.customCoverImage === 'custom_draft_blob') ? 'custom_draft_blob' : null),

      totalCapacity: typeof parsed.totalCapacity === 'number' ? parsed.totalCapacity : undefined,
      isCapacityManuallySet: Boolean(parsed.isCapacityManuallySet),
      waitlistEnabled: Boolean(parsed.waitlistEnabled),
      waitlistMode: parsed.waitlistMode === 'assigned' ? 'assigned' : 'automatic',
      isHostSelected: parsed.isHostSelected !== undefined ? Boolean(parsed.isHostSelected) : true,

      individuallySelectedFriendIds: Array.isArray(parsed.individuallySelectedFriendIds) ? parsed.individuallySelectedFriendIds : [],
      selectedFriends: Array.isArray(parsed.selectedFriends) ? parsed.selectedFriends : [],
      priorityGuestIds: Array.isArray(parsed.priorityGuestIds) ? parsed.priorityGuestIds : [],
      joinedIds: cleanJoinedIds,
      waitlistIds: cleanWaitlistIds,
      joinedFriends: Array.isArray(joinedFriends) ? joinedFriends.filter((f) => joinedSet.has(f.id)) : undefined,
      waitlistFriends: Array.isArray(waitlistFriends) ? waitlistFriends.filter((f) => !joinedSet.has(f.id)) : undefined,
    };
  } catch (err) {
    console.error('[draftParticipantStorage] Failed to read create plan draft:', err);
    return null;
  }
}

/**
 * Saves or partially updates the active Plan Creation draft.
 */
export function saveCreatePlanDraft(partial: Partial<CreatePlanDraft>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    const current = getSavedCreatePlanDraft() || {
      draftId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      updatedAt: Date.now(),
      createPhase: 'category',
      selectedCategory: 'custom',
      selectedSubcategory: null,
      cameFromReview: false,
      returnToWhoActually: false,
      returnToPlanSizeSheet: false,
      localTitle: '',
      localLocation: '',
      quickNote: '',
      costAmount: 0,
      isCostManuallySet: false,
      eventDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      isDateManuallySet: false,
      rsvpDeadline: null,
      customDeadline: new Date().toISOString(),
      placeId: null,
      latitude: null,
      longitude: null,
      placeAddress: null,
      discoveryItemId: null,
      customCoverImage: null,
      totalCapacity: undefined,
      isCapacityManuallySet: false,
      waitlistEnabled: false,
      waitlistMode: 'automatic',
      isHostSelected: true,
      individuallySelectedFriendIds: [],
      selectedFriends: [],
      priorityGuestIds: [],
      joinedIds: [],
      waitlistIds: [],
    };

    const merged = { ...current, ...partial, updatedAt: Date.now() };

    // Guard against clobbering participant states if partial update didn't include them
    const existingParticipants = getSavedDraftParticipants();
    if (partial.joinedIds === undefined && existingParticipants?.joinedIds) {
      merged.joinedIds = existingParticipants.joinedIds;
    }
    if (partial.waitlistIds === undefined && existingParticipants?.waitlistIds) {
      merged.waitlistIds = existingParticipants.waitlistIds;
    }
    if (partial.joinedFriends === undefined && existingParticipants?.joinedFriends) {
      merged.joinedFriends = existingParticipants.joinedFriends;
    }
    if (partial.waitlistFriends === undefined && existingParticipants?.waitlistFriends) {
      merged.waitlistFriends = existingParticipants.waitlistFriends;
    }

    // Enforce joinedIds ∩ waitlistIds = ∅
    const joinedIds = Array.from(
      new Set((merged.joinedIds || []).filter((id): id is string => typeof id === 'string' && Boolean(id)))
    );
    const joinedSet = new Set(joinedIds);
    const waitlistIds = Array.from(
      new Set(
        (merged.waitlistIds || []).filter(
          (id): id is string => typeof id === 'string' && Boolean(id) && !joinedSet.has(id)
        )
      )
    );

    merged.joinedIds = joinedIds;
    merged.waitlistIds = waitlistIds;

    if (Array.isArray(merged.joinedFriends)) {
      merged.joinedFriends = merged.joinedFriends.filter((f) => joinedSet.has(f.id));
    }
    if (Array.isArray(merged.waitlistFriends)) {
      merged.waitlistFriends = merged.waitlistFriends.filter((f) => !joinedSet.has(f.id));
    }

    // Safety: do not store huge data URLs or ephemeral blob URLs in localStorage
    if (
      merged.customCoverImage &&
      (merged.customCoverImage.startsWith('data:') ||
        merged.customCoverImage.startsWith('blob:') ||
        merged.customCoverImage.length > 5000)
    ) {
      merged.customCoverImage = 'custom_draft_blob';
    }

    window.localStorage.setItem(CREATE_PLAN_DRAFT_KEY, JSON.stringify(merged));

    // Only update dedicated participant storage if partial update explicitly modified participants
    if (
      partial.joinedIds !== undefined ||
      partial.waitlistIds !== undefined ||
      partial.joinedFriends !== undefined ||
      partial.waitlistFriends !== undefined
    ) {
      saveDraftParticipants({
        joinedIds,
        waitlistIds,
        joinedFriends: merged.joinedFriends,
        waitlistFriends: merged.waitlistFriends,
      });
    }
  } catch (err) {
    console.error('[draftParticipantStorage] Failed to save create plan draft:', err);
  }
}

/**
 * Clears the full Plan Creation draft.
 */
export function clearCreatePlanDraft(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(CREATE_PLAN_DRAFT_KEY);
    window.localStorage.removeItem(DRAFT_PARTICIPANTS_STORAGE_KEY);
    clearDraftCoverBlob().catch(() => {});
  } catch (err) {
    console.error('[draftParticipantStorage] Failed to clear create plan draft:', err);
  }
}

// ── Backward-compatible participant helpers ──

export function getSavedDraftParticipants(): DraftParticipantState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;

    let raw = window.localStorage.getItem(DRAFT_PARTICIPANTS_STORAGE_KEY);
    let parsed = raw ? JSON.parse(raw) : null;

    // Fall back to full draft if dedicated key is missing or empty
    if (!parsed || (!Array.isArray(parsed.joinedIds) && !Array.isArray(parsed.waitlistIds))) {
      const fullRaw = window.localStorage.getItem(CREATE_PLAN_DRAFT_KEY);
      if (fullRaw) {
        try {
          parsed = JSON.parse(fullRaw);
        } catch (e) {
          parsed = null;
        }
      }
    }

    if (!parsed || (!Array.isArray(parsed.joinedIds) && !Array.isArray(parsed.waitlistIds))) {
      return null;
    }

    const rawJoined = Array.isArray(parsed.joinedIds) ? parsed.joinedIds : [];
    const rawWaitlist = Array.isArray(parsed.waitlistIds) ? parsed.waitlistIds : [];

    const joinedIds: string[] = Array.from(
      new Set(rawJoined.filter((id: any): id is string => typeof id === 'string' && Boolean(id)))
    );
    const joinedSet = new Set(joinedIds);

    const waitlistIds: string[] = Array.from(
      new Set(
        rawWaitlist.filter(
          (id: any): id is string => typeof id === 'string' && Boolean(id) && !joinedSet.has(id)
        )
      )
    );

    return {
      joinedIds,
      waitlistIds,
      joinedFriends: Array.isArray(parsed.joinedFriends) ? parsed.joinedFriends.filter((f: any) => joinedSet.has(f.id)) : undefined,
      waitlistFriends: Array.isArray(parsed.waitlistFriends) ? parsed.waitlistFriends.filter((f: any) => !joinedSet.has(f.id)) : undefined,
      updatedAt: parsed.updatedAt || Date.now(),
    };
  } catch (err) {
    console.error('[draftParticipantStorage] Failed to read draft participants:', err);
    return null;
  }
}

export function saveDraftParticipants(state: {
  joinedIds: string[];
  waitlistIds: string[];
  joinedFriends?: any[];
  waitlistFriends?: any[];
}): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    const joinedIds: string[] = Array.from(
      new Set(state.joinedIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))
    );
    const joinedSet = new Set(joinedIds);

    const waitlistIds: string[] = Array.from(
      new Set(
        state.waitlistIds.filter(
          (id): id is string => typeof id === 'string' && Boolean(id) && !joinedSet.has(id)
        )
      )
    );

    const payload: DraftParticipantState = {
      joinedIds,
      waitlistIds,
      joinedFriends: state.joinedFriends ? state.joinedFriends.filter((f) => joinedSet.has(f.id)) : undefined,
      waitlistFriends: state.waitlistFriends ? state.waitlistFriends.filter((f) => !joinedSet.has(f.id)) : undefined,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(DRAFT_PARTICIPANTS_STORAGE_KEY, JSON.stringify(payload));

    // Also synchronize into CREATE_PLAN_DRAFT_KEY so both stores are always consistent
    const rawDraft = window.localStorage.getItem(CREATE_PLAN_DRAFT_KEY);
    if (rawDraft) {
      try {
        const parsed = JSON.parse(rawDraft);
        if (parsed && typeof parsed === 'object') {
          parsed.joinedIds = joinedIds;
          parsed.waitlistIds = waitlistIds;
          if (payload.joinedFriends) parsed.joinedFriends = payload.joinedFriends;
          if (payload.waitlistFriends) parsed.waitlistFriends = payload.waitlistFriends;
          parsed.updatedAt = Date.now();
          window.localStorage.setItem(CREATE_PLAN_DRAFT_KEY, JSON.stringify(parsed));
        }
      } catch (e) {
        // ignore JSON parse error
      }
    }
  } catch (err) {
    console.error('[draftParticipantStorage] Failed to save draft participants:', err);
  }
}

export function clearDraftParticipants(): void {
  clearCreatePlanDraft();
}
