import React from "react";

export interface OnboardingHeaderProps {
  className?: string;
  onBack?: () => void;
  showBack?: boolean;
}

export function OnboardingHeader({
  className = "",
}: OnboardingHeaderProps) {
  return (
    <header
      id="onboarding_shared_header"
      className={`w-full shrink-0 flex items-center justify-center pt-[max(1.75rem,env(safe-area-inset-top))] pb-2.5 px-4 z-30 select-none relative ${className}`}
    >
      {/* Centered Planless Wordmark Header - exact same size and style as starting screen */}
      <h1
        style={{ fontFamily: "'Grand Hotel', cursive" }}
        className="text-[40px] xs:text-[46px] sm:text-[50px] leading-tight text-white text-center select-none font-normal tracking-normal"
      >
        Planless
      </h1>
    </header>
  );
}

export default OnboardingHeader;
