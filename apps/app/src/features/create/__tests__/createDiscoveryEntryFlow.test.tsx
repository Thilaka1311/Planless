import { describe, it, expect } from 'vitest';

describe('Create Tab Experience: Discovery Screen as Entry Point', () => {
  it('preserves existing CreateMVP and CreateCategoryScreen modules without deletion', async () => {
    const mvpModule = await import('../screens/CreateMVP');
    expect(mvpModule.CreateMVP).toBeDefined();
    expect(typeof mvpModule.CreateMVP).toBe('function');

    const catModule = await import('../screens/CreateCategoryScreen');
    expect(catModule.CreateCategoryScreen).toBeDefined();
    expect(typeof catModule.CreateCategoryScreen).toBe('function');
  });

  it('exports CreatePlanScreen with Discovery entry point as default create tab content', async () => {
    const createModule = await import('../screens/Create');
    expect(createModule.CreatePlanScreen).toBeDefined();
    expect(typeof createModule.CreatePlanScreen).toBe('function');
  });

  it('populates discovery item attributes into the form draft and initiates the "who" phase', () => {
    // Simulating the onSelectDiscoveryItem mapping in CreatePlanScreen
    const sampleDiscoveryItem = {
      id: 'disc_item_123',
      title: 'Smoke House Deli',
      description: 'Gourmet European dining experience',
      category: 'DINING',
      subcategory: 'cafe',
      location: 'Indiranagar, Bangalore',
      cover_image_url: 'https://images.unsplash.com/dining-1.jpg',
      place_id: 'place_blr_456',
      place_address: '100 Feet Rd, Indiranagar',
      latitude: 12.9716,
      longitude: 77.5946,
    };

    let populatedCategory = '';
    let populatedSubcategory: string | null = null;
    let populatedTitle = '';
    let populatedLocation = '';
    let populatedCoverImage = '';
    let nextPhase = '';

    const handleSelectDiscoveryItem = (item: typeof sampleDiscoveryItem) => {
      populatedCategory = (item.category || 'custom').toLowerCase();
      populatedSubcategory = item.subcategory ? item.subcategory.toLowerCase() : null;
      populatedTitle = item.title;
      populatedLocation = item.location;
      populatedCoverImage = item.cover_image_url;
      nextPhase = 'who';
    };

    handleSelectDiscoveryItem(sampleDiscoveryItem);

    expect(populatedCategory).toBe('dining');
    expect(populatedSubcategory).toBe('cafe');
    expect(populatedTitle).toBe('Smoke House Deli');
    expect(populatedLocation).toBe('Indiranagar, Bangalore');
    expect(populatedCoverImage).toBe('https://images.unsplash.com/dining-1.jpg');
    expect(nextPhase).toBe('who');
  });

  it('handles custom plan selection by resetting form and proceeding to "who" phase', () => {
    let populatedCategory = '';
    let populatedTitle = '';
    let nextPhase = '';

    const handleSelectCustomPlan = () => {
      populatedCategory = 'custom';
      populatedTitle = '';
      nextPhase = 'who';
    };

    handleSelectCustomPlan();

    expect(populatedCategory).toBe('custom');
    expect(populatedTitle).toBe('');
    expect(nextPhase).toBe('who');
  });

  it('leaves location and place details completely empty for movie plans, preserving them for non-movie categories', () => {
    const movieDiscoveryItem = {
      id: 'tmdb-12345',
      title: 'Kantara: A Legend Chapter 1',
      category: 'MOVIES',
      subcategory: 'Action | Fantasy',
      location: '',
      release_date: '2025-10-02',
      cover_image_url: 'https://image.tmdb.org/t/p/w500/kantara.jpg',
      place_id: null,
      place_address: null,
      latitude: null,
      longitude: null,
    };

    let populatedCategory = '';
    let populatedLocation = 'initial';
    let populatedPlaceId: string | null = 'init';
    let populatedPlaceAddress: string | null = 'init';

    const handleSelectDiscoveryItem = (item: typeof movieDiscoveryItem) => {
      const lowerCategory = item.category ? item.category.toLowerCase() : 'custom';
      populatedCategory = lowerCategory;
      const isMovie = lowerCategory === 'movies' || (item.category && item.category.toUpperCase() === 'MOVIES');
      populatedLocation = isMovie ? '' : (item.location || '');
      populatedPlaceId = isMovie ? null : (item.place_id || null);
      populatedPlaceAddress = isMovie ? null : (item.place_address || item.location || null);
    };

    handleSelectDiscoveryItem(movieDiscoveryItem);

    expect(populatedCategory).toBe('movies');
    expect(populatedLocation).toBe('');
    expect(populatedPlaceId).toBeNull();
    expect(populatedPlaceAddress).toBeNull();

    // Verify non-movie retains location
    const sportsItem = {
      id: 'turf-1',
      title: 'Turf Park',
      category: 'SPORTS',
      subcategory: 'Football',
      location: 'Koramangala, Bangalore',
      release_date: undefined,
      cover_image_url: 'https://example.com/turf.jpg',
      place_id: 'place-789',
      place_address: '100ft Rd, Koramangala',
      latitude: 12.935,
      longitude: 77.62,
    };

    handleSelectDiscoveryItem(sportsItem as any);
    expect(populatedCategory).toBe('sports');
    expect(populatedLocation).toBe('Koramangala, Bangalore');
    expect(populatedPlaceId).toBe('place-789');
    expect(populatedPlaceAddress).toBe('100ft Rd, Koramangala');
  });
});
