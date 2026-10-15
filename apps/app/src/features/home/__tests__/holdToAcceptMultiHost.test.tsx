import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HoldToAcceptOverlay } from "../components/HoldToAccept";
import { ParticipantToggleBar } from "../components/PlanDetailsCard";
import { Plan } from "../../../core/types";

vi.mock("../../plans/hooks/useLivePlan", () => ({
  useLivePlan: vi.fn().mockReturnValue(null),
}));

vi.mock("../../plans/state/PlansContext", () => ({
  usePlansStore: vi.fn().mockReturnValue({ dbPlans: [] }),
}));

vi.mock("../../profile/state/ProfileContext", () => ({
  useProfileStore: vi.fn().mockReturnValue({
    dbUsers: [],
    userProfile: { id: "user-thilak", dbUuid: "user-thilak", name: "Thilaka Sundar" },
  }),
}));

describe("HoldToAcceptOverlay Multi-Host and Title Stability Regression Suite", () => {
  const basePlan: Plan = {
    id: "plan-test-1",
    title: "Timezone Phoenix Mall of Asia",
    location: "Yelahanka, Bengaluru",
    category: "activities" as any,
    date: "TODAY",
    time: "15:30",
    paymentAmount: 2000,
    cost: 2000,
    status: "LIVE",
    hostId: "host-renjith",
    creatorId: "host-renjith",
    creatorName: "Renjith",
    creatorAvatar: "https://example.com/renjith.jpg",
    members: [
      {
        userId: "host-renjith",
        name: "Renjith",
        avatar: "https://example.com/renjith.jpg",
        isHost: true,
        role: "HOST",
        joinState: "JOINED",
        reminderState: "none",
        joinedAt: "2026-10-15T10:00:00Z",
      },
    ],
    joinedUsers: [],
    confirmedCount: 1,
    coverImage: "",
    timeline: "today",
    createdAt: new Date().toISOString(),
    groupId: null,
  };

  it("renders plan title stably without scale animation across hold progress", () => {
    const html0 = renderToString(
      <HoldToAcceptOverlay
        planId={basePlan.id}
        holdProgress={0}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={basePlan}
      />
    );

    const html50 = renderToString(
      <HoldToAcceptOverlay
        planId={basePlan.id}
        holdProgress={50}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={basePlan}
      />
    );

    const html100 = renderToString(
      <HoldToAcceptOverlay
        planId={basePlan.id}
        holdProgress={100}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={basePlan}
      />
    );

    // Title renders verbatim
    expect(html0).toContain("Timezone Phoenix Mall of Asia");
    expect(html50).toContain("Timezone Phoenix Mall of Asia");
    expect(html100).toContain("Timezone Phoenix Mall of Asia");

    // Title has natural wrapping without truncate or ellipsis
    expect(html0).toContain("text-[22px] font-sans font-black text-white leading-tight block w-full whitespace-normal break-words");
    expect(html0).not.toContain("leading-tight block w-full truncate");

    // Title does NOT scale with holdProgress
    expect(html50).not.toContain("scale: 1.00");
    expect(html100).not.toContain("scale: 1.04");
  });

  it("renders single host correctly with single avatar and name", () => {
    const html = renderToString(
      <HoldToAcceptOverlay
        planId={basePlan.id}
        holdProgress={36}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={basePlan}
      />
    );

    expect(html).toContain("Hosted by");
    expect(html).toContain("Renjith");
    expect(html).toContain("https://example.com/renjith.jpg");
    // Not a multi-host avatar cluster
    expect(html).not.toContain("data-testid=\"hold-hosts-avatars\"");
  });

  it("renders multiple hosts with compact avatar group and comma-separated names", () => {
    const multiHostPlan: Plan = {
      ...basePlan,
      members: [
        {
          userId: "host-renjith",
          name: "Renjith",
          avatar: "https://example.com/renjith.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
        {
          userId: "user-thilak",
          name: "Thilaka Sundar",
          avatar: "https://example.com/thilak.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const html = renderToString(
      <HoldToAcceptOverlay
        planId={multiHostPlan.id}
        holdProgress={50}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={multiHostPlan}
      />
    );

    // Displays both avatars in compact overlapping group
    expect(html).toContain("data-testid=\"hold-hosts-avatars\"");
    expect(html).toContain("https://example.com/renjith.jpg");
    expect(html).toContain("https://example.com/thilak.jpg");
    // Displays "You, Renjith"
    expect(html).toContain("You, Renjith");
  });

  it("renders complete long titles with natural multi-line wrapping and preserves host name truncation", () => {
    const longTitlePlan: Plan = {
      ...basePlan,
      title: "Extremely Long Plan Name Bowling Gaming Karaoke Indiranagar Bangalore Central Mall",
      members: [
        {
          userId: "h1",
          name: "Dr. Alexander Bartholomew Montgomery III",
          avatar: "https://example.com/h1.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
        {
          userId: "h2",
          name: "Prof. Maximilian Christian von Hohenzollern",
          avatar: "https://example.com/h2.jpg",
          isHost: true,
          role: "HOST",
          joinState: "JOINED",
          reminderState: "none",
          joinedAt: "2026-10-15T10:00:00Z",
        },
      ],
    };

    const html = renderToString(
      <HoldToAcceptOverlay
        planId={longTitlePlan.id}
        holdProgress={40}
        isHolding={true}
        isFull={false}
        formattedDateAndTime="Today • 15:30"
        costText="₹2,000"
        plan={longTitlePlan}
      />
    );

    // Full title rendered without being truncated
    expect(html).toContain("Extremely Long Plan Name Bowling Gaming Karaoke Indiranagar Bangalore Central Mall");
    // Title has natural wrapping and break-words, never truncate
    expect(html).toContain("whitespace-normal break-words");
    expect(html).not.toContain("text-[22px] font-sans font-black text-white leading-tight block w-full truncate");

    // Host names are still present and have truncate class for secondary line
    expect(html).toContain("Dr. Alexander Bartholomew Montgomery III, Prof. Maximilian Christian von Hohenzollern");
    expect(html).toContain("max-w-full truncate");
  });

  it("keeps full plan name visible across all stages of hold animation without truncation", () => {
    const progressStages = [0, 25, 38, 50, 75, 99, 100];

    for (const progress of progressStages) {
      const html = renderToString(
        <HoldToAcceptOverlay
          planId={basePlan.id}
          holdProgress={progress}
          isHolding={true}
          isFull={false}
          formattedDateAndTime="Today • 15:30"
          costText="₹2,000"
          plan={basePlan}
        />
      );

      // Verbatim full title present at every percentage
      expect(html).toContain("Timezone Phoenix Mall of Asia");
      // Must not be truncated
      expect(html).not.toContain("Timezone Phoenix Mall...");
      expect(html).toContain("whitespace-normal break-words");
      expect(html).not.toContain("text-[22px] font-sans font-black text-white leading-tight block w-full truncate");
    }
  });

  it("renders complete plan title in ParticipantToggleBar before holding with natural wrapping", () => {
    const collapsedHtml = renderToString(
      <ParticipantToggleBar
        plan={basePlan}
        userProfile={{ id: "user-thilak" } as any}
        isHolding={false}
        planTitle="Timezone Phoenix Mall of Asia"
        formattedDateAndTime="Today • 15:30"
        isExpanded={false}
        setIsExpanded={() => {}}
      />
    );

    expect(collapsedHtml).toContain("Timezone Phoenix Mall of Asia");
    expect(collapsedHtml).toContain("whitespace-normal break-words");
    expect(collapsedHtml).not.toContain("drop-shadow-sm truncate");

    const expandedHtml = renderToString(
      <ParticipantToggleBar
        plan={basePlan}
        userProfile={{ id: "user-thilak" } as any}
        isHolding={false}
        planTitle="Timezone Phoenix Mall of Asia"
        formattedDateAndTime="Today • 15:30"
        isExpanded={true}
        setIsExpanded={() => {}}
      />
    );

    expect(expandedHtml).toContain("Timezone Phoenix Mall of Asia");
    expect(expandedHtml).toContain("whitespace-normal break-words");
  });
});
