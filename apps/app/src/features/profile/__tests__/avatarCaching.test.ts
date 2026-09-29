import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { resolveImage, evictImageCache, ImageType } from "../../../shared/imaging/imageResolver";

// Mock Supabase client
vi.mock("../../../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: "user-123/avatar" },
          error: null,
        }),
        list: vi.fn().mockResolvedValue({
          data: [{ name: "avatar" }],
          error: null,
        }),
        remove: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        getPublicUrl: vi.fn((key: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/avatars/${key}` },
        })),
      }),
    },
  },
}));

// Mock processImage to avoid Canvas dependencies in Node/JSDOM
vi.mock("../../../shared/imaging/imagePipeline", () => ({
  processImage: vi.fn().mockImplementation((file) => Promise.resolve(file)),
  validateImageFile: vi.fn().mockReturnValue(null),
  ImagePresets: { Avatar: {} },
}));

import { useProfileUpload, AVATAR_CACHE_CONTROL } from "../hooks/useProfileUpload";
import { supabase } from "../../../../lib/supabaseClient";

describe("Avatar HTTP Caching & Invalidation Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evictImageCache(); // Clear imageResolver internal maps
  });

  it("exports the verified long-lived HTTP caching policy", () => {
    expect(AVATAR_CACHE_CONTROL).toBe("public, max-age=86400, stale-while-revalidate=604800");
  });

  it("uploads avatar with public, max-age=86400, stale-while-revalidate=604800 cacheControl", async () => {
    let hookResult: ReturnType<typeof useProfileUpload> | null = null;
    const TestConsumer = () => {
      hookResult = useProfileUpload();
      return null;
    };

    const { renderToString } = await import("react-dom/server");
    renderToString(React.createElement(TestConsumer));

    expect(hookResult).not.toBeNull();

    const fakeFile = new Blob(["fake-image-bytes"], { type: "image/webp" });
    let uploadedPath: string | null = null;

    await act(async () => {
      uploadedPath = await hookResult!.uploadImage(fakeFile, "user-123");
    });

    expect(uploadedPath).toBe("avatars/user-123/avatar");

    const storageFromMock = supabase.storage.from as any;
    expect(storageFromMock).toHaveBeenCalledWith("avatars");

    const uploadMock = storageFromMock("avatars").upload;
    expect(uploadMock).toHaveBeenCalledWith(
      "user-123/avatar",
      fakeFile,
      expect.objectContaining({
        contentType: "image/webp",
        cacheControl: "public, max-age=86400, stale-while-revalidate=604800",
        upsert: true,
      })
    );
  });

  it("resolves avatar URLs and memoizes them in imageResolver", () => {
    const avatarPath = "avatars/user-123/avatar";
    const firstUrl = resolveImage(avatarPath, ImageType.Avatar);

    expect(firstUrl).toBe("https://test.supabase.co/storage/v1/object/public/avatars/user-123/avatar");

    // Second resolution should return memoized URL
    const secondUrl = resolveImage(avatarPath, ImageType.Avatar);
    expect(secondUrl).toBe(firstUrl);
  });

  it("appends cache-busting timestamp version to URL when evictImageCache is triggered", () => {
    const avatarPath = "avatars/user-123/avatar";
    const initialUrl = resolveImage(avatarPath, ImageType.Avatar);
    expect(initialUrl).not.toContain("?v=");

    // Simulate avatar change eviction (called by ProfileContext.updateProfileAvatar)
    evictImageCache(avatarPath, ImageType.Avatar);

    // After eviction, resolution produces a new URL with version query parameter
    const updatedUrl = resolveImage(avatarPath, ImageType.Avatar);
    expect(updatedUrl).toContain("?v=");
    expect(updatedUrl).not.toBe(initialUrl);

    // Subsequent resolution keeps the same versioned URL until next eviction
    const stableVersionUrl = resolveImage(avatarPath, ImageType.Avatar);
    expect(stableVersionUrl).toBe(updatedUrl);
  });
});
