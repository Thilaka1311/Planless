import React, { Suspense } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

// Mock supabase client
vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
        or: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => {},
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

describe("App Flow Code Splitting (Phase 1)", () => {
  it("dynamic import of OnboardingFlow resolves as a named-to-default export", async () => {
    const module = await import("../screens/OnboardingFlow");
    expect(module.OnboardingFlow).toBeDefined();
    expect(typeof module.OnboardingFlow).toBe("function");

    const resolved = await import("../screens/OnboardingFlow").then((m) => ({ default: m.OnboardingFlow }));
    expect(resolved.default).toBe(module.OnboardingFlow);
  });

  it("dynamic import of MainApp resolves as default export", async () => {
    const module = await import("../../../../MainApp");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  it("renders Suspense fallback without crashing", () => {
    const FlowLoadingFallback = (
      <div className="h-[100dvh] w-screen bg-[#050505] flex items-center justify-center font-sans relative overflow-hidden">
        <div className="flex flex-col items-center space-y-6 z-10">
          <h1 className="text-white text-4xl font-black">Planless</h1>
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );

    const html = renderToString(
      <Suspense fallback={FlowLoadingFallback}>
        <div>Loaded Content</div>
      </Suspense>
    );

    expect(html).toContain("Loaded Content");
  });
});
