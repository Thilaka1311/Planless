import { describe, it, expect } from 'vitest';
import { generateBaseSlug, getDisambiguationSuffix, getPlanSlug, findPlanBySlugOrId } from './planSlugUtils';
import { Plan } from '../../../core/types';

describe('planSlugUtils', () => {
  it('generates URL-safe base slug from titles', () => {
    expect(generateBaseSlug('Friday Plans')).toBe('friday-plans');
    expect(generateBaseSlug('Friday Plans!')).toBe('friday-plans');
    expect(generateBaseSlug('  Weekend Brunch & Mimosas!! 🥂  ')).toBe('weekend-brunch-mimosas');
    expect(generateBaseSlug('Football 5v5 @ Turfpark')).toBe('football-5v5-turfpark');
    expect(generateBaseSlug('')).toBe('plan');
    expect(generateBaseSlug(null)).toBe('plan');
  });

  it('disambiguates duplicate titles cleanly', () => {
    const plan1 = { id: 'a670cd1b-c65e-4777-b888-4b0a5ae1aa19', title: 'Friday Plans' };
    const plan2 = { id: 'b780de2c-d76f-4888-c999-5c1b6bf2bb20', title: 'Friday Plans' };

    const plans = [plan1, plan2];

    // First plan gets clean slug
    expect(getPlanSlug(plan1, plans)).toBe('friday-plans');
    // Second plan gets deterministic disambiguation suffix
    expect(getPlanSlug(plan2, plans)).toBe('friday-plans-f2bb20');
  });

  it('findPlanBySlugOrId finds plan by slug, id, or dbUuid', () => {
    const mockPlans: Plan[] = [
      {
        id: 'a670cd1b-c65e-4777-b888-4b0a5ae1aa19',
        dbUuid: 'a670cd1b-c65e-4777-b888-4b0a5ae1aa19',
        title: 'Friday Plans',
        slug: 'friday-plans',
        date: 'TODAY',
        time: '19:00',
        location: 'Downtown',
        paymentAmount: 0,
        status: 'LIVE',
        createdAt: new Date().toISOString(),
        category: 'custom',
        cost: 0,
        hostId: 'u1',
        members: [],
      } as any,
      {
        id: 'b780de2c-d76f-4888-c999-5c1b6bf2bb20',
        dbUuid: 'b780de2c-d76f-4888-c999-5c1b6bf2bb20',
        title: 'Saturday Badminton',
        slug: 'saturday-badminton',
        date: 'TOMORROW',
        time: '10:00',
        location: 'Badminton Club',
        paymentAmount: 0,
        status: 'LIVE',
        createdAt: new Date().toISOString(),
        category: 'sports',
        cost: 0,
        hostId: 'u2',
        members: [],
      } as any,
    ];

    // Find by slug
    expect(findPlanBySlugOrId(mockPlans, 'friday-plans')?.id).toBe('a670cd1b-c65e-4777-b888-4b0a5ae1aa19');
    expect(findPlanBySlugOrId(mockPlans, 'saturday-badminton')?.id).toBe('b780de2c-d76f-4888-c999-5c1b6bf2bb20');

    // Find by UUID
    expect(findPlanBySlugOrId(mockPlans, 'a670cd1b-c65e-4777-b888-4b0a5ae1aa19')?.title).toBe('Friday Plans');
    expect(findPlanBySlugOrId(mockPlans, 'b780de2c-d76f-4888-c999-5c1b6bf2bb20')?.title).toBe('Saturday Badminton');

    // Unknown returns null
    expect(findPlanBySlugOrId(mockPlans, 'non-existent')).toBeNull();
  });
});
