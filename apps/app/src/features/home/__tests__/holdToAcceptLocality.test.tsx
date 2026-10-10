import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HoldToAcceptOverlay } from "../components/HoldToAccept";
import { Plan } from "../../../core/types";

// Mock hooks used by HoldToAcceptOverlay
vi.mock("../../plans/hooks/useLivePlan", () => ({
  useLivePlan: vi.fn().mockReturnValue(null),
}));

vi.mock("../../plans/state/PlansContext", () => ({
  usePlansStore: vi.fn().mockReturnValue({ dbPlans: [] }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: vi.fn().mockReturnValue({ dbUsers: [] }),
}));

describe("HoldToAcceptOverlay - 'To Join' Plan Loading Screen Location Display", () => {
  const basePlan: Plan = {
    id: "plan-test-1",
    title: "Timezone Phoenix Mall of Asia - Bangalore",
    location: "Bellary Road, Byatarayanapura Village, Hobli, Yelahanka, Bengaluru",
    category: "activities" as any,
    date: "TODAY",
    time: "15:30",
    paymentAmount: 2000,
    cost: 2000,
    status: "LIVE",
    hostId: "host-1",
    creatorId: "host-1",
    creatorName: "Maanastej",
    creatorAvatar: "",
    members: [],
    joinedUsers: [],
    confirmedCount: 1,
    coverImage: "",
    timeline: "today",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  it("displays only the area 'Yelahanka' immediately before Bengaluru instead of the full address", () => {
    const html = renderToString(
      <HoldToAcceptOverlay
        planId={basePlan.id}
        holdProgress={55}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={basePlan}
      />
    );

    // Must contain the area name immediately before Bengaluru
    expect(html).toContain("Yelahanka");
    expect(html).not.toContain("Byatarayanapura Village");

    // Must NOT contain the full multi-part address or plus codes
    expect(html).not.toContain("Bellary Road, Byatarayanapura Village, Hobli, Yelahanka, Bengaluru");

    // Must include whitespace-nowrap and truncate to enforce single-line layout
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("truncate");
  });

  it("displays 'Vidyaranyapura' for Bengaluru Turf Inc. address with plus code and sub-localities", () => {
    const planWithVidyaranyapura: Plan = {
      ...basePlan,
      title: "Bengaluru Turf Inc.",
      location: "3GQW+G4W, Subbana Layout, Vinayak Nagar, Vidyaranyapura, Bengaluru",
    };

    const html = renderToString(
      <HoldToAcceptOverlay
        planId={planWithVidyaranyapura.id}
        holdProgress={55}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        plan={planWithVidyaranyapura}
      />
    );

    expect(html).toContain("Vidyaranyapura");
    expect(html).not.toContain("3GQW+G4W");
    expect(html).not.toContain("Subbana Layout");
    expect(html).not.toContain("Vinayak Nagar");
    expect(html).not.toContain("Vidyaranyapura, Bengaluru");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("truncate");
  });

  it("displays existing resolved area 'HSR Layout' when plan has standard Bengaluru address", () => {
    const planWithHsr: Plan = {
      ...basePlan,
      title: "Bengaluru Turf Inc.",
      location: "123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102, India",
    };

    const html = renderToString(
      <HoldToAcceptOverlay
        planId={planWithHsr.id}
        holdProgress={55}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        plan={planWithHsr}
      />
    );

    expect(html).toContain("HSR Layout");
    expect(html).not.toContain("123, 27th Main Rd, Sector 1, HSR Layout, Bengaluru");
    expect(html).toContain("whitespace-nowrap");
  });
});
