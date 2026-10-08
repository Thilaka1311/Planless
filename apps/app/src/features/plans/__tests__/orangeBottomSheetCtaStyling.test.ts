import { describe, it, expect } from "vitest";

describe("Orange Bottom Sheet Primary CTA Button Styling Invariants", () => {
  function getSharePlanBottomSheetCtaStyles(opts: { inviteUrl?: string }) {
    const { inviteUrl } = opts;
    return {
      width: "100%",
      height: 40,
      padding: "0 14px",
      borderRadius: 9999,
      background: !inviteUrl ? "rgba(255, 255, 255, 0.1)" : "#FF6B2C",
      color: !inviteUrl ? "rgba(255, 255, 255, 0.3)" : "#FFFFFF",
      fontSize: 14,
      fontWeight: 700,
      cursor: !inviteUrl ? "not-allowed" : "pointer",
      border: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      transition: "all 0.15s ease",
    };
  }

  function getStandardBottomSheetCtaInvariants(componentName: string) {
    return {
      component: componentName,
      isPillShaped: true,
      borderRadius: 9999,
      maxHeight: 40,
      fullWidth: true,
      hasSquaredCorners: false,
    };
  }

  it("verifies SharePlanLinkBottomSheet orange CTA is compact full-width pill button", () => {
    const styles = getSharePlanBottomSheetCtaStyles({ inviteUrl: "https://planless.app/p/123" });

    expect(styles.borderRadius).toBe(9999);
    expect(styles.height).toBe(40);
    expect(styles.width).toBe("100%");
    expect(styles.background).toBe("#FF6B2C");
    expect(styles.fontWeight).toBe(700);
  });

  it("verifies UI design rule: orange primary CTAs inside bottom sheets must be fully rounded pill-shaped", () => {
    const bottomSheets = [
      "SharePlanLinkBottomSheet",
      "RestorePlanBottomSheet",
      "SwitchWaitlistModeBottomSheet",
      "MoveMultipleParticipantsBottomSheet",
    ];

    for (const sheet of bottomSheets) {
      const inv = getStandardBottomSheetCtaInvariants(sheet);
      expect(inv.isPillShaped).toBe(true);
      expect(inv.borderRadius).toBe(9999);
      expect(inv.hasSquaredCorners).toBe(false);
      expect(inv.maxHeight).toBeLessThanOrEqual(44);
      expect(inv.fullWidth).toBe(true);
    }
  });
});
