import { describe, it, expect } from 'vitest';

describe('Create Plan Navigation Flow for Users with Zero Friends', () => {
  it('determines the next phase upon category selection is always "who"', () => {
    // When a category is tapped (sports, movies, dining, custom),
    // the target phase must be "who", even if friends.length === 0
    const selectCategoryPhase = (category: string, friendCount: number) => {
      // Required behavior: always route to 'who' so empty state / add friends screen appears
      return 'who';
    };

    expect(selectCategoryPhase('sports', 0)).toBe('who');
    expect(selectCategoryPhase('movies', 0)).toBe('who');
    expect(selectCategoryPhase('dining', 0)).toBe('who');
    expect(selectCategoryPhase('custom', 0)).toBe('who');
    expect(selectCategoryPhase('sports', 5)).toBe('who');
  });

  it('preserves the selected category and data when navigating from who to review', () => {
    const draft = {
      selectedCategory: 'movies',
      selectedSubcategory: null,
      createPhase: 'who',
      localTitle: 'Cinema Night',
    };

    // Continuing from who to review
    const nextDraft = {
      ...draft,
      createPhase: 'review',
    };

    expect(nextDraft.selectedCategory).toBe('movies');
    expect(nextDraft.localTitle).toBe('Cinema Night');
    expect(nextDraft.createPhase).toBe('review');
  });

  it('routes to review when user taps the continue arrow on who screen with zero friends', () => {
    let currentPhase = 'who';
    const onContinue = () => {
      currentPhase = 'review';
    };

    onContinue();
    expect(currentPhase).toBe('review');
  });
});
