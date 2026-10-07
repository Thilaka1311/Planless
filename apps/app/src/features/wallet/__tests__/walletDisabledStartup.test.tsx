import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Wallet Feature Disabled on App Startup", () => {
  const srcDir = path.resolve(__dirname, "../../../");

  it("App.tsx does not import WalletProvider or mount WalletProviderComp", () => {
    const appTsxContent = fs.readFileSync(path.join(srcDir, "App.tsx"), "utf-8");
    expect(appTsxContent).not.toContain("WalletProvider");
    expect(appTsxContent).not.toContain("WalletProviderComp");
  });

  it("MainApp.tsx does not import useWalletStore or WalletScreen", () => {
    const mainAppContent = fs.readFileSync(path.join(srcDir, "MainApp.tsx"), "utf-8");
    expect(mainAppContent).not.toContain("useWalletStore");
    expect(mainAppContent).not.toContain("WalletScreen");
  });

  it("PlanChatScreen.tsx does not import AddCost or PlanDetailsScreen", () => {
    const chatScreenContent = fs.readFileSync(
      path.join(srcDir, "features/chats/screens/PlanChatScreen.tsx"),
      "utf-8"
    );
    expect(chatScreenContent).not.toContain("AddCost");
    expect(chatScreenContent).not.toContain("PlanDetailsScreen");
  });

  it("PlansPreviewScreen.tsx and HomePlansPreviewScreen.tsx do not import PlanDetailsScreen or PlanBalancesScreen", () => {
    const plansPreviewContent = fs.readFileSync(
      path.join(srcDir, "features/plans/screens/PlansScreen/PlansPreview/PlansPreviewScreen.tsx"),
      "utf-8"
    );
    const homePreviewContent = fs.readFileSync(
      path.join(srcDir, "features/home/screens/HomePlansPreview/HomePlansPreviewScreen.tsx"),
      "utf-8"
    );

    expect(plansPreviewContent).not.toContain("PlanDetailsScreen");
    expect(plansPreviewContent).not.toContain("getUserPlanOutstandingDues");
    expect(homePreviewContent).not.toContain("PlanDetailsScreen");
    expect(homePreviewContent).not.toContain("PlanBalancesScreen");
  });
});
