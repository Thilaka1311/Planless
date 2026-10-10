import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroHeader, HostInfo } from "../components/HeroHeader";

describe("HeroHeader Host Layout Regression Suite", () => {
  it("renders 1 host with centered avatar directly below title and cleanly truncated text", () => {
    const singleHost: HostInfo[] = [
      { id: "h1", name: "Thilak", avatar: "https://example.com/thilak.jpg" },
    ];

    const html = renderToString(
      <HeroHeader
        title="Dinner at Indiranagar"
        hosts={singleHost}
        onClose={vi.fn()}
      />
    );

    // Title renders
    expect(html).toContain("Dinner at Indiranagar");
    // Avatar rendered with host's avatar
    expect(html).toContain("https://example.com/thilak.jpg");
    // Attribution text
    expect(html).toContain("Hosted by <span");
    expect(html).toContain("Thilak");
    // Attribution has truncate and max-w-full px-14 to guarantee single line
    expect(html).toContain("id=\"immersive-host-attribution\"");
    expect(html).toContain("truncate");
    expect(html).toContain("px-14");
    // Avatars have -space-x-1.5 and are in their own centered container
    expect(html).toContain("-space-x-1.5");
  });

  it("renders 2-3 hosts with overlapping avatar group centered below title", () => {
    const multiHosts: HostInfo[] = [
      { id: "h1", name: "You", avatar: "https://example.com/you.jpg" },
      { id: "h2", name: "Maanastej", avatar: "https://example.com/maanastej.jpg" },
      { id: "h3", name: "Thilaka", avatar: "https://example.com/thilaka.jpg" },
    ];

    const html = renderToString(
      <HeroHeader
        title="Gaming Night"
        hosts={multiHosts}
        viewerId="h1"
        onClose={vi.fn()}
      />
    );

    // All 3 avatars rendered
    expect(html).toContain("https://example.com/you.jpg");
    expect(html).toContain("https://example.com/maanastej.jpg");
    expect(html).toContain("https://example.com/thilaka.jpg");
    // Attribution string joined with commas
    expect(html).toContain("You, Maanastej, Thilaka");
    // No +N badge for <= 4 hosts
    expect(html).not.toContain("bg-zinc-800");
  });

  it("renders many hosts (> 4 hosts) with compact capped avatars and +N badge, never expanding header vertically", () => {
    const manyHosts: HostInfo[] = [
      { id: "h1", name: "You", avatar: "https://example.com/h1.jpg" },
      { id: "h2", name: "Maanastej", avatar: "https://example.com/h2.jpg" },
      { id: "h3", name: "Thilaka", avatar: "https://example.com/h3.jpg" },
      { id: "h4", name: "Renjith", avatar: "https://example.com/h4.jpg" },
      { id: "h5", name: "Vaishakh", avatar: "https://example.com/h5.jpg" },
      { id: "h6", name: "Aznan", avatar: "https://example.com/h6.jpg" },
    ];

    const html = renderToString(
      <HeroHeader
        title="Timezone Bowling"
        hosts={manyHosts}
        viewerId="h1"
        onClose={vi.fn()}
      />
    );

    // Capped at 4 visible avatars + overflow badge
    expect(html).toContain("+<!-- -->2");
    // Host attribution contains all names for tooltip/accessibility, truncated via CSS
    expect(html).toContain("You, Maanastej, Thilaka, Renjith, Vaishakh, Aznan");
    expect(html).toContain("title=\"Hosted by You, Maanastej, Thilaka, Renjith, Vaishakh, Aznan\"");
    expect(html).toContain("truncate");
  });

  it("handles long host names and long Plan titles without breaking layout", () => {
    const longNamedHosts: HostInfo[] = [
      { id: "h1", name: "Dr. Alexander Bartholomew Montgomery III", avatar: "https://example.com/alex.jpg" },
      { id: "h2", name: "Prof. Maximilian Christian von Hohenzollern", avatar: "https://example.com/max.jpg" },
    ];

    const longTitle = "Super Extra Long Plan Title That Exceeds Normal Mobile Screen Widths Easily";

    const html = renderToString(
      <HeroHeader
        title={longTitle}
        hosts={longNamedHosts}
        onClose={vi.fn()}
      />
    );

    // Long title has truncate and min-w-0
    expect(html).toContain(longTitle);
    expect(html).toContain("truncate max-w-full min-w-0");
    // Host names row has truncate and px-14 padding
    expect(html).toContain("truncate");
    expect(html).toContain("px-14");
    // Back button and overflow menu buttons remain present
    expect(html).toContain("immersive-plan-back-btn");
  });

  it("keeps back button and overflow menu positions unchanged", () => {
    const html = renderToString(
      <HeroHeader
        title="Weekend Brunch"
        hosts={[{ id: "h1", name: "Host", avatar: "" }]}
        onClose={vi.fn()}
        onOpenChat={vi.fn()}
      />
    );

    expect(html).toContain("immersive-plan-back-btn");
    expect(html).toContain("absolute left-4 top-1/2 -translate-y-1/2");
    expect(html).toContain("immersive-plan-overflow-btn");
    expect(html).toContain("absolute right-4 top-1/2 -translate-y-1/2");
  });
});
