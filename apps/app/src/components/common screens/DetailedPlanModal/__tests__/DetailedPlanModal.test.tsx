import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ModalErrorBoundary } from '../index';

describe('ModalErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const html = renderToString(
      <ModalErrorBoundary planId="plan-123" onClose={() => {}}>
        <div id="plan-content">Plan Details Loaded</div>
      </ModalErrorBoundary>
    );
    expect(html).toContain('Plan Details Loaded');
    expect(html).not.toContain('Unable to load plan');
  });

  it('renders fallback UI when an error is caught in plan modal', () => {
    const boundary = new ModalErrorBoundary({
      planId: 'corrupted-plan',
      onClose: vi.fn(),
      children: <div>Child</div>,
    });

    boundary.state = {
      hasError: true,
      error: new TypeError("Cannot read properties of undefined (reading 'filter')"),
    };

    const rendered = boundary.render() as React.ReactElement;
    const html = renderToString(rendered);

    expect(html).toContain('Unable to load plan');
    expect(html).toContain('This plan could not be displayed or is no longer available.');
    expect(html).toContain('Close');
  });

  it('resets error state when planId changes', () => {
    const boundary = new ModalErrorBoundary({
      planId: 'plan-1',
      onClose: vi.fn(),
      children: <div>Child</div>,
    });

    boundary.state = {
      hasError: true,
      error: new Error('Crash on plan 1'),
    };

    const setStateSpy = vi.spyOn(boundary, 'setState');

    // Simulate prop change to a new planId
    boundary.componentDidUpdate({
      planId: 'plan-2',
      onClose: vi.fn(),
      children: <div>Child</div>,
    });

    expect(setStateSpy).toHaveBeenCalledWith({ hasError: false, error: null });
  });
});
