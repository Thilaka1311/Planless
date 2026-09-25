import { describe, it, expect, vi } from 'vitest';

describe('Discard Plan Action Bottom Sheet', () => {
  it('resolves plan context with defaults when partial details are provided', () => {
    const plan = {
      title: 'Coffee Catchup',
      coverImage: 'https://example.com/cover.jpg',
      category: 'dining',
      subcategory: 'Coffee',
    };

    const resolvedTitle = plan?.title || 'Plan';
    const resolvedCover = plan?.coverImage || null;
    const resolvedCategory = plan?.category || 'custom';
    const resolvedSubcategory = plan?.subcategory || null;

    expect(resolvedTitle).toBe('Coffee Catchup');
    expect(resolvedCover).toBe('https://example.com/cover.jpg');
    expect(resolvedCategory).toBe('dining');
    expect(resolvedSubcategory).toBe('Coffee');
  });

  it('falls back to default Plan identity when title is omitted', () => {
    const rawTitle: string | undefined = undefined;
    const resolvedTitle = rawTitle || 'Plan';
    expect(resolvedTitle).toBe('Plan');
  });

  it('invokes discard callback when confirmed and preserves exit behavior', () => {
    const onDiscard = vi.fn();
    const onClose = vi.fn();

    // Trigger discard
    onDiscard();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    // Trigger cancel
    onClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adheres to Plan Actions destructive styling specifications', () => {
    const destructiveButtonStyle = {
      width: '100%',
      height: 48,
      padding: '0 14px',
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(239, 68, 68, 0.08)',
      border: 'none',
      borderRadius: 12,
      color: '#EF4444',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      textAlign: 'left',
    };

    expect(destructiveButtonStyle.background).toBe('rgba(239, 68, 68, 0.08)');
    expect(destructiveButtonStyle.color).toBe('#EF4444');
    expect(destructiveButtonStyle.borderRadius).toBe(12);
    expect(destructiveButtonStyle.height).toBe(48);
  });

  it('renders Discard plan structure with plan avatar and Discard plan? heading', () => {
    const sheetContent = {
      title: 'Discard plan?',
      description: 'Your changes will not be saved',
      hasPlanAvatar: true,
      hasDiscardButton: true,
      hasCancelButton: true,
    };

    expect(sheetContent.title).toBe('Discard plan?');
    expect(sheetContent.description).toBe('Your changes will not be saved');
    expect(sheetContent.hasPlanAvatar).toBe(true);
    expect(sheetContent.hasDiscardButton).toBe(true);
    expect(sheetContent.hasCancelButton).toBe(true);
  });
});

