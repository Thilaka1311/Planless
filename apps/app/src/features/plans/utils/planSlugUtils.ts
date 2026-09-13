/**
 * planSlugUtils.ts
 *
 * Utilities for generating URL-safe slugs from plan names, disambiguating
 * duplicate plan names safely, and finding plans by either slug or UUID.
 */

import { Plan } from '../../../core/types';

/**
 * Converts a string into a clean, URL-safe slug.
 * Example: "Friday Plans! 🍕" -> "friday-plans"
 */
export function generateBaseSlug(title: string | null | undefined): string {
  if (!title) return 'plan';

  // Normalize unicode (e.g. accents)
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = normalized
    .toLowerCase()
    // Replace non-alphanumeric characters with a dash
    .replace(/[^a-z0-9]+/g, '-')
    // Strip leading/trailing dashes
    .replace(/^-+|-+$/g, '');

  return slug || 'plan';
}

/**
 * Disambiguation key from a plan's unique identifier.
 * Uses the last 6 chars of clean UUID or publicId.
 */
export function getDisambiguationSuffix(planId: string): string {
  const clean = planId.replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length <= 6) return clean.toLowerCase();
  return clean.slice(-6).toLowerCase();
}

/**
 * Returns a unique URL-friendly slug for a plan within a collection of plans.
 * If multiple plans share the identical base slug, a short deterministic suffix is added.
 */
export function getPlanSlug(
  targetPlan: { id: string; dbUuid?: string; title?: string; publicId?: string },
  allPlans: Array<{ id: string; dbUuid?: string; title?: string; publicId?: string }> = []
): string {
  const baseSlug = generateBaseSlug(targetPlan.title);
  const targetId = targetPlan.dbUuid || targetPlan.id;

  // Filter plans with the same base slug
  const matchingPlans = allPlans.filter(p => {
    return generateBaseSlug(p.title) === baseSlug;
  });

  // If only 1 plan or target is the first one registered with this title, use pure base slug
  if (matchingPlans.length <= 1) {
    return baseSlug;
  }

  // If there are duplicate titles, the earliest created/found plan keeps the clean slug,
  // subsequent ones get the disambiguation suffix.
  const firstMatchId = matchingPlans[0].dbUuid || matchingPlans[0].id;
  if (firstMatchId === targetId) {
    return baseSlug;
  }

  const suffix = getDisambiguationSuffix(targetId);
  return `${baseSlug}-${suffix}`;
}

/**
 * Finds a plan in a list of plans given either:
 * 1. An exact UUID / database id match
 * 2. A generated slug match (e.g. "friday-plans" or "friday-plans-a1b2c3")
 * 3. A base slug match (if single match exists)
 */
export function findPlanBySlugOrId(
  plans: Plan[],
  slugOrId: string | null | undefined
): Plan | null {
  if (!slugOrId || !plans || plans.length === 0) return null;

  const decoded = decodeURIComponent(slugOrId).trim();
  const lowerDecoded = decoded.toLowerCase();

  // 1. Exact ID / UUID / publicId matches (O(n) fast path)
  const exactMatch = plans.find(
    p =>
      p.id === decoded ||
      p.dbUuid === decoded ||
      p.publicId === decoded ||
      p.id?.toLowerCase() === lowerDecoded ||
      p.dbUuid?.toLowerCase() === lowerDecoded
  );
  if (exactMatch) return exactMatch;

  // 2. Pre-computed plan.slug match
  const slugMatch = plans.find(
    p => p.slug && p.slug.toLowerCase() === lowerDecoded
  );
  if (slugMatch) return slugMatch;

  // 3. Dynamic getPlanSlug match (handles full disambiguation against the plans list)
  for (const p of plans) {
    const computedSlug = getPlanSlug(p, plans);
    if (computedSlug.toLowerCase() === lowerDecoded) {
      return p;
    }
  }

  // 4. Fallback: Base title slug match (case where URL has base slug and only one plan matches)
  const baseMatches = plans.filter(
    p => generateBaseSlug(p.title) === lowerDecoded
  );
  if (baseMatches.length > 0) {
    return baseMatches[0];
  }

  return null;
}
