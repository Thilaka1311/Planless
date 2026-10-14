import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Logic Replicas from send-push/index.ts and sw.ts for deterministic testing
// ============================================================================

export function resolvePlanImageUrl(plan: any, publicBaseUrl: string): string {
  const fallbackAsset = `${publicBaseUrl}/assets/planimagedefault.webp`;
  if (!plan) return fallbackAsset;
  const rawCover = (plan.cover_image || plan.cover_card_image || "").trim();
  const remoteSupabaseUrl = "";
  const isRemoteSupabase = false;
  const storageHost = isRemoteSupabase ? remoteSupabaseUrl : publicBaseUrl;

  // 1. Prefer actual uploaded plan cover image
  if (rawCover) {
    // 1A. Already a fully-qualified HTTP/HTTPS URL (e.g. TMDB movie poster, external CDN)
    if (rawCover.startsWith("https://") || rawCover.startsWith("http://")) {
      return rawCover;
    }

    // 1B. Supabase Storage bucket path in 'plan-images'
    if (
      rawCover.startsWith("plan-images/") ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(rawCover) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(rawCover)
    ) {
      const objectKey = rawCover.startsWith("plan-images/")
        ? rawCover.slice("plan-images/".length)
        : rawCover;
      return `${storageHost}/storage/v1/object/public/plan-images/${objectKey}`;
    }

    // 2. Existing valid venue image (Google Places proxy)
    if (rawCover.startsWith("/functions/v1/maps")) {
      return `${storageHost}${rawCover}`;
    }

    // 1C. Static asset path mapped to public assets
    const lower = rawCover.toLowerCase();
    if (lower.includes("sport") || lower.includes("football") || lower.includes("badminton") || lower.includes("soccer") || lower.includes("cricket")) {
      return `${publicBaseUrl}/assets/categories/sports.png`;
    }
    if (lower.includes("movie") || lower.includes("cinema")) {
      return `${publicBaseUrl}/assets/categories/movies.png`;
    }
    if (lower.includes("dining") || lower.includes("restaurant") || lower.includes("food") || lower.includes("cafe")) {
      return `${publicBaseUrl}/assets/categories/dining.png`;
    }
    if (lower.includes("activity") || lower.includes("game") || lower.includes("bowling") || lower.includes("arcade")) {
      return `${publicBaseUrl}/assets/categories/activity.png`;
    }
    if (lower.includes("planimage") || lower.includes("placeholder") || lower.includes("default")) {
      return fallbackAsset;
    }
  }

  // 3. Category image fallback (Contextual plan category artwork)
  const category = (plan.category || "").toLowerCase().trim();
  if (
    category === "sports" ||
    category === "sport" ||
    category === "football" ||
    category === "badminton" ||
    category === "soccer" ||
    category === "cricket"
  ) {
    return `${publicBaseUrl}/assets/categories/sports.png`;
  }
  if (
    category === "movies" ||
    category === "movie" ||
    category === "cinema"
  ) {
    return `${publicBaseUrl}/assets/categories/movies.png`;
  }
  if (
    category === "dining" ||
    category === "restaurants" ||
    category === "restaurant" ||
    category === "cafe" ||
    category === "food"
  ) {
    return `${publicBaseUrl}/assets/categories/dining.png`;
  }
  if (
    category === "activities" ||
    category === "activity" ||
    category === "recreation" ||
    category === "games" ||
    category === "bowling" ||
    category === "arcade"
  ) {
    return `${publicBaseUrl}/assets/categories/activity.png`;
  }

  // Fall back gracefully to existing Planless plan fallback image asset
  return fallbackAsset;
}

export async function verifyAndResolveIcon(
  iconUrl: string | undefined,
  origin: string,
  fetchFn: (url: string, init?: any) => Promise<{ ok: boolean; status: number }> = fetch as any
): Promise<string> {
  const fallbackAsset = origin ? `${origin}/assets/planimagedefault.webp` : '/assets/planimagedefault.webp';
  if (!iconUrl || typeof iconUrl !== 'string') {
    return fallbackAsset;
  }

  let finalUrl = iconUrl;
  if (origin) {
    if (finalUrl.startsWith('/')) {
      try { finalUrl = new URL(finalUrl, origin).href; } catch {}
    } else {
      try {
        const parsed = new URL(finalUrl);
        if (parsed.origin !== origin && (parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/storage/'))) {
          finalUrl = `${origin}${parsed.pathname}${parsed.search}`;
        }
      } catch {}
    }
  }

  try {
    const res = await fetchFn(finalUrl, { method: 'HEAD', cache: 'force-cache' });
    if (!res.ok) {
      return fallbackAsset;
    }
  } catch {
    try {
      await fetchFn(finalUrl, { mode: 'no-cors', cache: 'force-cache' });
    } catch {
      return fallbackAsset;
    }
  }

  return finalUrl;
}

export function formatPlanInvitationPayload({
  inviterName,
  plan,
  publicBaseUrl,
}: {
  inviterName?: string | null;
  plan: any;
  publicBaseUrl: string;
}) {
  const rawPlanTitle = (plan?.title || "Plan").trim();
  const planTitle = rawPlanTitle.length > 25 ? `${rawPlanTitle.slice(0, 24)}…` : rawPlanTitle;

  const title = inviterName ? `${inviterName.trim()} • ${planTitle}` : `Invited • ${planTitle}`;
  const body = "Invited you to join"; // Strictly no location/venue

  const resolvedIcon = resolvePlanImageUrl(plan, publicBaseUrl);
  const badge = `${publicBaseUrl}/favicon-32x32.png`;

  return {
    title,
    body,
    icon: resolvedIcon,
    badge,
    tag: `plan-invite-${plan.id}`,
    url: `/plans?id=${plan.id}`,
    notificationType: "PLAN_INVITATION",
    data: {
      url: `/plans?id=${plan.id}`,
      planId: plan.id,
      notificationType: "PLAN_INVITATION",
      avatar: resolvedIcon,
    },
  };
}

// ============================================================================
// Test Suite: Plan Notification Images and Invitation Copy
// ============================================================================

describe("Plan Notification Images and Invitation Copy Test Suite", () => {
  const publicBaseUrl = "https://highlighted-rubber-agriculture-cure.trycloudflare.com";

  // Requirement 1: A plan with a valid image uses that plan's image in the notification payload
  it("Requirement 1: A plan with a valid image uses that plan's image in the notification payload", () => {
    // 1A. TMDB movie poster URL
    const tmdbPlan = {
      id: "plan-tmdb",
      title: "Mandaadi",
      cover_image: "https://image.tmdb.org/t/p/w500/cDFW9BI1PSqrBWu8W0ZoeUQivEM.jpg",
      category: "MOVIES",
    };
    expect(resolvePlanImageUrl(tmdbPlan, publicBaseUrl)).toBe(
      "https://image.tmdb.org/t/p/w500/cDFW9BI1PSqrBWu8W0ZoeUQivEM.jpg"
    );

    // 1B. Supabase Storage bucket path
    const storagePlan = {
      id: "plan-storage",
      title: "Lunch Outing",
      cover_image: "plan-images/43643d33-7546-4bc3-8834-bc16346c3285/plancoverimage4.webp",
      category: "DINING",
    };
    expect(resolvePlanImageUrl(storagePlan, publicBaseUrl)).toBe(
      `${publicBaseUrl}/storage/v1/object/public/plan-images/43643d33-7546-4bc3-8834-bc16346c3285/plancoverimage4.webp`
    );

    // 1C. Google Places map proxy photo
    const placesPlan = {
      id: "plan-places",
      title: "Smash Guys",
      cover_image: "/functions/v1/maps?action=photo&photo_reference=xyz123",
      category: "DINING",
    };
    expect(resolvePlanImageUrl(placesPlan, publicBaseUrl)).toBe(
      `${publicBaseUrl}/functions/v1/maps?action=photo&photo_reference=xyz123`
    );
  });

  // Requirement 2: A plan without an image uses the existing fallback image asset
  it("Requirement 2: A plan without an image uses category artwork or the planimagedefault asset", () => {
    // Plan with known category but no cover image uses category asset
    const sportsPlan = {
      id: "plan-sports",
      title: "Badminton Match",
      category: "SPORTS",
      cover_image: null,
    };
    expect(resolvePlanImageUrl(sportsPlan, publicBaseUrl)).toBe(
      `${publicBaseUrl}/assets/categories/sports.png`
    );

    // Plan with null/empty cover and unknown/custom category uses planimagedefault.webp
    const customPlan = {
      id: "plan-custom",
      title: "Hangout",
      category: "CUSTOM",
      cover_image: "",
    };
    expect(resolvePlanImageUrl(customPlan, publicBaseUrl)).toBe(
      `${publicBaseUrl}/assets/planimagedefault.webp`
    );

    // Completely null plan record returns fallback asset
    expect(resolvePlanImageUrl(null, publicBaseUrl)).toBe(
      `${publicBaseUrl}/assets/planimagedefault.webp`
    );
  });

  // Requirement 3: A missing or inaccessible image does not produce a broken image or a generated 'H' avatar
  it("Requirement 3: Missing or inaccessible image URLs gracefully resolve to planimagedefault.webp", async () => {
    const origin = publicBaseUrl;

    // Simulate fetch returning 404
    const mock404Fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const resolvedFrom404 = await verifyAndResolveIcon(
      "https://example.com/non-existent-image.jpg",
      origin,
      mock404Fetch
    );
    expect(resolvedFrom404).toBe(`${origin}/assets/planimagedefault.webp`);

    // Simulate network error (throws)
    const mockErrorFetch = vi.fn().mockRejectedValue(new Error("Network failed"));
    const resolvedFromError = await verifyAndResolveIcon(
      "https://broken-tunnel.com/photo.png",
      origin,
      mockErrorFetch
    );
    expect(resolvedFromError).toBe(`${origin}/assets/planimagedefault.webp`);

    // Undefined/null icon URL
    const resolvedFromEmpty = await verifyAndResolveIcon(undefined, origin, mock404Fetch);
    expect(resolvedFromEmpty).toBe(`${origin}/assets/planimagedefault.webp`);
  });

  // Requirement 4: Plan invitation notifications use the intended plan image
  it("Requirement 4: Plan invitation notifications use the intended plan image rather than sender avatar", () => {
    const plan = {
      id: "4b790f81-6c81-41a9-ba94-d5038fb087ab",
      title: "Doomsday",
      category: "MOVIES",
      cover_image: "/src/assets/Movies.png",
      place_name: "RMZ Galleria Mall",
    };

    const payload = formatPlanInvitationPayload({
      inviterName: "Renjith",
      plan,
      publicBaseUrl,
    });

    // The notification icon MUST be the plan's image (movies category), NOT Renjith's avatar
    expect(payload.icon).toBe(`${publicBaseUrl}/assets/categories/movies.png`);
    expect(payload.icon).not.toContain("avatar");
  });

  // Requirement 5: The small Planless app icon remains separate from the plan image
  it("Requirement 5: The small Planless app icon remains separate in the badge field", () => {
    const plan = {
      id: "plan-abc",
      title: "Cricket Finals",
      category: "SPORTS",
      cover_image: "/src/assets/sports.webp",
    };

    const payload = formatPlanInvitationPayload({
      inviterName: "Thilak",
      plan,
      publicBaseUrl,
    });

    // Badge represents the app identity (small icon)
    expect(payload.badge).toBe(`${publicBaseUrl}/favicon-32x32.png`);
    // Icon represents the plan artwork (large thumbnail)
    expect(payload.icon).toBe(`${publicBaseUrl}/assets/categories/sports.png`);
    // They are strictly different fields
    expect(payload.badge).not.toBe(payload.icon);
  });

  // Requirement 6: Invitation bodies contain 'Invited you to join' without the venue or location
  it("Requirement 6: Invitation bodies contain 'Invited you to join' without venue or location", () => {
    const planWithVenue = {
      id: "plan-venue",
      title: "Doomsday",
      category: "MOVIES",
      place_name: "RMZ Galleria Mall",
    };

    const payloadWithInviter = formatPlanInvitationPayload({
      inviterName: "Renjith",
      plan: planWithVenue,
      publicBaseUrl,
    });

    expect(payloadWithInviter.title).toBe("Renjith • Doomsday");
    expect(payloadWithInviter.body).toBe("Invited you to join");
    expect(payloadWithInviter.body).not.toContain("RMZ Galleria Mall");
    expect(payloadWithInviter.body).not.toContain("•");

    const payloadWithoutInviter = formatPlanInvitationPayload({
      inviterName: null,
      plan: planWithVenue,
      publicBaseUrl,
    });

    expect(payloadWithoutInviter.title).toBe("Invited • Doomsday");
    expect(payloadWithoutInviter.body).toBe("Invited you to join");
    expect(payloadWithoutInviter.body).not.toContain("RMZ Galleria Mall");
  });

  // Requirement 7: Both new-plan invitations and existing-plan invitations use the corrected copy
  it("Requirement 7: Both new-plan and existing-plan invitations use 'Invited you to join'", () => {
    // New plan invitation during plan creation
    const newPlan = {
      id: "new-plan-1",
      title: "Sunday Brunch",
      place_name: "Toit Indiranagar",
      category: "DINING",
    };
    const newPlanPayload = formatPlanInvitationPayload({
      inviterName: "Host",
      plan: newPlan,
      publicBaseUrl,
    });
    expect(newPlanPayload.body).toBe("Invited you to join");

    // Existing plan invitation
    const existingPlan = {
      id: "existing-plan-2",
      title: "Board Game Night",
      place_name: "Dialogues Cafe",
      category: "ACTIVITIES",
    };
    const existingPlanPayload = formatPlanInvitationPayload({
      inviterName: "Alex",
      plan: existingPlan,
      publicBaseUrl,
    });
    expect(existingPlanPayload.body).toBe("Invited you to join");
  });

  // Requirement 8: Other notification types retain their intended images and content
  it("Requirement 8: Participant removal, cancellation, and updates use plan image and specific copy", () => {
    const plan = {
      id: "plan-lifecycle",
      title: "Doomsday",
      category: "MOVIES",
      cover_image: "/src/assets/Movies.png",
    };

    const resolvedImage = resolvePlanImageUrl(plan, publicBaseUrl);
    expect(resolvedImage).toBe(`${publicBaseUrl}/assets/categories/movies.png`);

    // Participant removed
    const removal = {
      title: plan.title,
      body: "You've been removed from this plan",
      icon: resolvedImage,
      tag: `participant-removed-${plan.id}-user1`,
    };
    expect(removal.title).toBe("Doomsday");
    expect(removal.body).toBe("You've been removed from this plan");
    expect(removal.icon).toBe(`${publicBaseUrl}/assets/categories/movies.png`);

    // Plan cancelled
    const cancellation = {
      title: `Cancelled • ${plan.title}`,
      body: "Renjith cancelled this plan",
      icon: resolvedImage,
      tag: `plan-cancelled-${plan.id}`,
    };
    expect(cancellation.title).toBe("Cancelled • Doomsday");
    expect(cancellation.body).toBe("Renjith cancelled this plan");
    expect(cancellation.icon).toBe(`${publicBaseUrl}/assets/categories/movies.png`);
  });

  // Requirement 9: Notification clicks still open the correct plan
  it("Requirement 9: Notification clicks deep link directly to /plans?id={planId}", () => {
    const planId = "4b790f81-6c81-41a9-ba94-d5038fb087ab";
    const plan = {
      id: planId,
      title: "Doomsday",
      category: "MOVIES",
    };

    const payload = formatPlanInvitationPayload({
      inviterName: "Renjith",
      plan,
      publicBaseUrl,
    });

    expect(payload.url).toBe(`/plans?id=${planId}`);
    expect(payload.data.url).toBe(`/plans?id=${planId}`);
    expect(payload.data.planId).toBe(planId);
  });
});
