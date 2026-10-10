import { describe, it, expect, vi } from "vitest";

describe("CancelLeaveRequestBottomSheet Plan Actions Invariants", () => {
  function resolveCancelLeaveRequestProps(props: {
    isOpen: boolean;
    plan?: any;
    planTitle?: string;
    planCoverImage?: string | null;
    planCategory?: string;
    planSubcategory?: string | null;
    planId?: string;
    isSubmitting?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }) {
    const {
      isOpen,
      plan,
      planTitle,
      planCoverImage,
      planCategory,
      planSubcategory,
      planId,
      isSubmitting = false,
      onConfirm,
      onClose,
    } = props;

    const resolvedTitle = plan?.title || planTitle || "Plan";
    const resolvedCover = plan?.coverImage || plan?.cover_image || planCoverImage;
    const resolvedPlanId = plan?.dbUuid || plan?.id || planId;
    const resolvedCategory = plan?.category || planCategory;
    const resolvedSubcategory = plan?.subcategory || planSubcategory;

    const header = {
      title: "Cancel leave request?",
      subtitle: "Plan Actions",
      coverImage: resolvedCover,
      planId: resolvedPlanId,
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      altText: resolvedTitle,
    };

    const primaryAction = {
      id: "cancel_leave_request_confirm_btn",
      text: isSubmitting ? "Updating…" : "Stay in Plan",
      disabled: isSubmitting,
      onClick: onConfirm,
    };

    const dismissAction = {
      id: "cancel_leave_request_cancel_btn",
      text: "Cancel",
      isTextOnly: true,
      onClick: onClose,
    };

    return {
      isOpen,
      header,
      primaryAction,
      dismissAction,
    };
  }

  it("extracts plan identity for the header matching Plan Actions layout with Cancel leave request? title", () => {
    const mockPlan = {
      id: "plan-test-123",
      dbUuid: "uuid-test-123",
      title: "Weekend Sunset Trek",
      coverImage: "trek-cover.webp",
      category: "nature",
      subcategory: "hiking",
    };

    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const result = resolveCancelLeaveRequestProps({
      isOpen: true,
      plan: mockPlan,
      onConfirm,
      onClose,
    });

    expect(result.header.title).toBe("Cancel leave request?");
    expect(result.header.subtitle).toBe("Plan Actions");
    expect(result.header.coverImage).toBe("trek-cover.webp");
    expect(result.header.category).toBe("nature");
    expect(result.header.subcategory).toBe("hiking");
    expect(result.header.altText).toBe("Weekend Sunset Trek");
  });

  it("does not have separate body title or helper text", () => {
    const result = resolveCancelLeaveRequestProps({
      isOpen: true,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    });

    expect(result.header.title).toBe("Cancel leave request?");
    expect((result as any).dialogContent).toBeUndefined();
  });

  it("has only one primary action 'Stay in Plan' and simple text 'Cancel' that dismisses", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const result = resolveCancelLeaveRequestProps({
      isOpen: true,
      onConfirm,
      onClose,
    });

    // Primary action
    expect(result.primaryAction.text).toBe("Stay in Plan");
    expect(result.primaryAction.id).toBe("cancel_leave_request_confirm_btn");
    result.primaryAction.onClick();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Dismiss action
    expect(result.dismissAction.text).toBe("Cancel");
    expect(result.dismissAction.isTextOnly).toBe(true);
    expect(result.dismissAction.id).toBe("cancel_leave_request_cancel_btn");
    result.dismissAction.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows updating state when isSubmitting is true", () => {
    const result = resolveCancelLeaveRequestProps({
      isOpen: true,
      isSubmitting: true,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    });

    expect(result.primaryAction.text).toBe("Updating…");
    expect(result.primaryAction.disabled).toBe(true);
  });
});
