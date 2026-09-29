import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { WalletProvider, useWalletStore } from "../state/WalletContext";
import { ProfileProvider } from "../../profile/state/ProfileContext";

// Mock Supabase client
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

describe("WalletContext Lazy Loading & Deferral", () => {
  const USER_UUID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();

    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
    });

    mockFrom.mockImplementation(() => {
      const queryBuilder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn().mockImplementation((callback: any) => {
          return Promise.resolve(callback({ data: [], error: null }));
        }),
      };
      return queryBuilder;
    });
  });

  let capturedStore: any = null;

  function TestConsumer() {
    capturedStore = useWalletStore();
    return (
      <div>
        <span id="is-loaded">{String(capturedStore.isLoaded)}</span>
        <span id="loading">{String(capturedStore.loading)}</span>
      </div>
    );
  }

  it("initializes in an unloaded state and does not execute queries on mount", () => {
    capturedStore = null;
    const initialProfile = {
      id: "U001",
      user_id: "U001",
      name: "Test User",
      avatar: "",
      dbUuid: USER_UUID,
    };

    const html = renderToString(
      <ProfileProvider initialProfile={initialProfile as any}>
        <WalletProvider userId={USER_UUID}>
          <TestConsumer />
        </WalletProvider>
      </ProfileProvider>
    );

    expect(html).toContain('id="is-loaded">false</span>');
    expect(html).toContain('id="loading">false</span>');
    expect(capturedStore).toBeDefined();
    expect(capturedStore.isLoaded).toBe(false);
    expect(capturedStore.loading).toBe(false);
    expect(typeof capturedStore.ensureLoaded).toBe("function");
    expect(typeof capturedStore.refreshTransactions).toBe("function");

    // Zero queries fired on startup
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("loads wallet transactions when ensureLoaded is invoked", async () => {
    capturedStore = null;
    const initialProfile = {
      id: "U001",
      user_id: "U001",
      name: "Test User",
      avatar: "",
      dbUuid: USER_UUID,
    };

    renderToString(
      <ProfileProvider initialProfile={initialProfile as any}>
        <WalletProvider userId={USER_UUID}>
          <TestConsumer />
        </WalletProvider>
      </ProfileProvider>
    );

    expect(capturedStore.isLoaded).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();

    // Call ensureLoaded
    await capturedStore.ensureLoaded();

    expect(mockFrom).toHaveBeenCalled();
  });

  it("is idempotent: calling ensureLoaded multiple times does not execute duplicate queries", async () => {
    capturedStore = null;
    const initialProfile = {
      id: "U001",
      user_id: "U001",
      name: "Test User",
      avatar: "",
      dbUuid: USER_UUID,
    };

    renderToString(
      <ProfileProvider initialProfile={initialProfile as any}>
        <WalletProvider userId={USER_UUID}>
          <TestConsumer />
        </WalletProvider>
      </ProfileProvider>
    );

    await capturedStore.ensureLoaded();
    const callsAfterFirst = mockFrom.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Call ensureLoaded again
    await capturedStore.ensureLoaded();
    expect(mockFrom.mock.calls.length).toBe(callsAfterFirst);
  });
});
