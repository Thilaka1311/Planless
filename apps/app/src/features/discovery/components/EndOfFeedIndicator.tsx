import React from "react";

export interface EndOfFeedIndicatorProps {
  className?: string;
  testId?: string;
}

/**
 * EndOfFeedIndicator
 *
 * Consistent completion message displayed at the bottom of Discovery feeds
 * once all available content in the current category has been exhausted.
 */
export const EndOfFeedIndicator: React.FC<EndOfFeedIndicatorProps> = ({
  className = "",
  testId = "end-of-feed-indicator",
}) => {
  return (
    <div
      role="status"
      data-testid={testId}
      aria-label="You're all caught up"
      className={`py-6 text-center text-xs text-zinc-500 select-none ${className}`}
    >
      You&apos;re all caught up
    </div>
  );
};
