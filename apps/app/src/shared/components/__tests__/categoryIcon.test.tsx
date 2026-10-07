import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { CategoryIcon, getCategoryTheme } from "../CategoryIcon";
import { Trophy, Utensils, Film, CalendarDays } from "lucide-react";

describe("CategoryIcon and getCategoryTheme", () => {
  it("resolves Sports to Trophy with emerald green #10B981", () => {
    const sportsTheme = getCategoryTheme("sports");
    expect(sportsTheme.icon).toBe(Trophy);
    expect(sportsTheme.color).toBe("#10B981");
    expect(sportsTheme.textColorClass).toBe("text-[#10B981]");

    // Synonyms
    expect(getCategoryTheme("football").icon).toBe(Trophy);
    expect(getCategoryTheme("badminton").icon).toBe(Trophy);
    expect(getCategoryTheme("SPORTS").icon).toBe(Trophy);
  });

  it("resolves Dining to Utensils with red #EF4444", () => {
    const diningTheme = getCategoryTheme("dining");
    expect(diningTheme.icon).toBe(Utensils);
    expect(diningTheme.color).toBe("#EF4444");
    expect(diningTheme.textColorClass).toBe("text-[#EF4444]");

    // Synonyms
    expect(getCategoryTheme("restaurants").icon).toBe(Utensils);
    expect(getCategoryTheme("cafe").icon).toBe(Utensils);
    expect(getCategoryTheme("DINING").icon).toBe(Utensils);
  });

  it("resolves Movies to Film and Custom fallback to CalendarDays", () => {
    expect(getCategoryTheme("movies").icon).toBe(Film);
    expect(getCategoryTheme("cinema").icon).toBe(Film);
    expect(getCategoryTheme(null).icon).toBe(CalendarDays);
    expect(getCategoryTheme(undefined).icon).toBe(CalendarDays);
  });

  it("renders CategoryIcon with correct classes", () => {
    const sportsHtml = renderToString(<CategoryIcon category="sports" className="w-5 h-5 custom-test" />);
    expect(sportsHtml).toContain("text-[#10B981]");
    expect(sportsHtml).toContain("custom-test");
    expect(sportsHtml).toContain("<svg");

    const diningHtml = renderToString(<CategoryIcon category="dining" className="w-5 h-5 dining-test" />);
    expect(diningHtml).toContain("text-[#EF4444]");
    expect(diningHtml).toContain("dining-test");
    expect(diningHtml).toContain("<svg");
  });
});
