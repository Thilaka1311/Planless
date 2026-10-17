import React, { useEffect } from "react";
import { ArrowLeft, ShieldCheck, FileText, Mail, ExternalLink } from "lucide-react";
import { navigateToRoute, navigateBack, getInAppNavigationDepth } from "../../navigation/appRouter";

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = "Privacy Policy | Planless";

    let metaDesc = document.querySelector('meta[name="description"]');
    const originalMeta = metaDesc ? metaDesc.getAttribute("content") : null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Privacy Policy for Planless. Learn how Planless handles your account, plans, friend connections, and data."
      );
    }

    return () => {
      document.title = originalTitle;
      if (metaDesc && originalMeta !== null) {
        metaDesc.setAttribute("content", originalMeta);
      }
    };
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (getInAppNavigationDepth() > 0 && typeof window !== "undefined" && window.history.length > 1) {
      navigateBack({ tab: "home" });
    } else {
      navigateToRoute({ tab: "home" });
    }
  };

  const handleNavigateToTerms = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateToRoute({ tab: "home", subScreen: "terms" });
  };

  return (
    <div
      id="privacy_policy_page"
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-text"
    >
      {/* Header matching Planless dark aesthetic */}
      <header className="bg-[#050505]/95 backdrop-blur-md border-b border-white/[0.06] px-5 sm:px-8 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="privacy_back_btn"
            onClick={handleBack}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-white/[0.08] text-white/80 hover:text-white hover:bg-zinc-850 active:scale-95 transition flex items-center justify-center cursor-pointer select-none"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-4.5 h-4.5 text-[#FF6B2C]" />
              <span>Privacy Policy</span>
            </h1>
          </div>
        </div>

        <a
          href="/terms"
          onClick={handleNavigateToTerms}
          className="text-xs sm:text-[13px] font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition select-none cursor-pointer py-1.5 px-3 rounded-lg hover:bg-zinc-900/60"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Terms of Service</span>
          <span className="xs:hidden">Terms</span>
        </a>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-5 sm:px-8 py-8 md:py-12 max-w-3xl w-full mx-auto text-zinc-300">
        {/* Document Header & Last Updated */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-white/[0.08] text-[11px] font-medium text-zinc-400 mb-4 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B2C]"></span>
            <span>Last Updated: October 2026</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
            Planless Privacy Policy
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Welcome to Planless (<span className="text-zinc-200">planless.life</span>). Your privacy is
            important to us. This Privacy Policy describes how Planless collects, uses, stores, and
            protects your personal information when you use our web application and social planning
            services.
          </p>
        </div>

        <div className="space-y-10 text-[14px] sm:text-[15px] leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">1. Scope and Overview</h3>
            <p>
              Planless is designed to help friends and groups create, discover, and organize informal
              outings, dining plans, sports, movies, and activities. This Privacy Policy applies to all
              registered users and visitors accessing the application through{" "}
              <a href="https://planless.life" className="text-[#FF6B2C] hover:underline">
                https://planless.life
              </a>
              .
            </p>
            <p>
              By accessing or using Planless, you acknowledge that you have read and understood the
              practices described in this policy. For the terms governing your general use of Planless,
              please also review our{" "}
              <a
                href="/terms"
                onClick={handleNavigateToTerms}
                className="text-[#FF6B2C] hover:underline cursor-pointer font-medium"
              >
                Terms of Service
              </a>
              .
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">2. Information We Collect</h3>
            <p>
              We collect only the information necessary to provide you with the Planless service and
              facilitate social coordination:
            </p>

            <div className="space-y-4 pl-2">
              <div className="border-l-2 border-[#FF6B2C]/40 pl-4 py-1">
                <h4 className="font-semibold text-white text-[15px]">A. Information You Provide Directly</h4>
                <ul className="list-disc list-inside mt-2 space-y-1.5 text-zinc-300">
                  <li>
                    <strong className="text-white">Account Profile:</strong> Your name, email address,
                    optional profile biography ("bio"), and profile picture.
                  </li>
                  <li>
                    <strong className="text-white">Plans &amp; Events:</strong> Plan titles, descriptions,
                    categories (dining, sports, movies, activities), dates, times, and location details
                    you submit.
                  </li>
                  <li>
                    <strong className="text-white">Plan Chats &amp; Messages:</strong> Chat messages and
                    media shared within group plan conversations.
                  </li>
                  <li>
                    <strong className="text-white">Shared Plan Photos:</strong> Photos uploaded to plan
                    photo galleries or covers.
                  </li>
                  <li>
                    <strong className="text-white">Friend Connections:</strong> Invitations sent, received,
                    and accepted through Planless friendship features.
                  </li>
                </ul>
              </div>

              <div className="border-l-2 border-zinc-700 pl-4 py-1">
                <h4 className="font-semibold text-white text-[15px]">
                  B. Information Collected Through Authentication &amp; Permissions
                </h4>
                <ul className="list-disc list-inside mt-2 space-y-1.5 text-zinc-300">
                  <li>
                    <strong className="text-white">Google Sign-In:</strong> If you choose to sign in with
                    Google, we receive your name, email address, and profile photo URL from Google to
                    initialize your account. We never receive your Google account password.
                  </li>
                  <li>
                    <strong className="text-white">Passkey Authentication:</strong> If you register a
                    WebAuthn passkey, cryptographic public key credentials are created on your device and
                    stored securely to verify future passwordless logins. Your private biometric data never
                    leaves your device.
                  </li>
                  <li>
                    <strong className="text-white">Web Push Subscriptions:</strong> If you grant push
                    notification permissions, we store standard Web Push tokens (endpoint URL and
                    encryption keys) to deliver notifications regarding your plans and chat messages.
                  </li>
                  <li>
                    <strong className="text-white">Location Data:</strong> When explicitly authorized by
                    you in your browser, client-side geolocation is used on-demand to search nearby places,
                    venues, and activities. Planless does not track continuous background location.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              3. Information We Do Not Collect &amp; Dormant Features
            </h3>
            <p>
              To maintain absolute transparency, Planless currently operates as a free social coordination
              tool:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>
                <strong className="text-white">No Payment or Banking Information:</strong> Any wallet or
                settlement features shown in prototypes are completely dormant on application startup. We
                do not collect credit card numbers, debit cards, bank accounts, or financial credentials.
                Planless is not a payment processor or bank.
              </li>
              <li>
                <strong className="text-white">No Third-Party Advertising Trackers:</strong> We do not sell
                your data or embed third-party advertising tracking pixels or cross-site behavioral
                trackers.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">4. How We Use Your Information</h3>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>To provide, operate, and maintain the Planless web application.</li>
              <li>To authenticate your identity and safeguard your account against unauthorized access.</li>
              <li>To enable plan creation, RSVPs, participant tracking, and group chat communication.</li>
              <li>To send push notifications about plan updates, invitations, and chat messages you receive.</li>
              <li>To deliver local venue search results using third-party mapping and place APIs.</li>
              <li>To identify and troubleshoot bugs, monitor application performance, and improve usability.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              5. How Your Information is Shared with Other Users
            </h3>
            <p>
              Planless is fundamentally a social coordination platform. By participating in the platform,
              certain information is shared with other users in accordance with your activity:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>
                <strong className="text-white">Plan Participants:</strong> Content shared within a plan—including
                chat messages, uploaded photos, attendance status (Host, Joined, Waitlisted, Passed), and
                the plan schedule—is visible to other participants in that plan.
              </li>
              <li>
                <strong className="text-white">Friends &amp; Public ID:</strong> Your display name, profile
                picture, and bio are visible to your confirmed friends and to users with whom you share a plan
                invite link.
              </li>
              <li>
                <strong className="text-white">We Do Not Sell Your Data:</strong> We will never sell, rent,
                or monetize your personal information or shared content.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              6. Third-Party Infrastructure and Service Providers
            </h3>
            <p>
              We rely on trusted third-party service providers to power specific application features:
            </p>
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-4 space-y-3">
              <div>
                <strong className="text-white">Supabase:</strong> Provides our backend database, user
                authentication, and media file storage. Data is hosted in secure data centers.
              </div>
              <div>
                <strong className="text-white">Google APIs:</strong> Used for Google OAuth login and the
                Google Places API for venue lookups and suggestions.
              </div>
              <div>
                <strong className="text-white">The Movie Database (TMDB):</strong> Used to fetch public movie
                titles, showtimes, and poster artwork for movie plans.
              </div>
              <div>
                <strong className="text-white">Cloudflare:</strong> Provides network proxying, SSL/TLS
                encryption, and infrastructure security.
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">7. Data Storage and Security</h3>
            <p>
              We implement industry-standard security safeguards to protect your personal data, including
              HTTPS encryption in transit, strict database Row Level Security (RLS) policies, and tokenized
              authentication sessions.
            </p>
            <p className="text-zinc-400 text-xs sm:text-[13px] bg-zinc-900/40 border border-white/[0.05] p-3 rounded-lg">
              <strong className="text-zinc-200">Please Note:</strong> While we take reasonable technical
              measures to secure your information, no digital transmission over the Internet or electronic
              storage system can be guaranteed to be 100% secure. You are encouraged to protect your account
              and devices.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              8. Data Retention and Account Deletion
            </h3>
            <p>
              We retain your profile data and created plans for as long as your account remains active or as
              needed to provide you with the service.
            </p>
            <p>
              <strong className="text-white">Account &amp; Data Deletion:</strong> You have the right to
              request complete deletion of your account and associated personal data at any time. To request
              account deletion, email us at{" "}
              <a href="mailto:support@planless.life" className="text-[#FF6B2C] hover:underline font-medium">
                support@planless.life
              </a>
              . Upon receiving your verified request, we will permanently remove your user profile,
              authentication records, and personal identifiers from our production systems.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              9. User Privacy Rights and Controls
            </h3>
            <p>You have control over your data within Planless:</p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>
                <strong className="text-white">Profile Editing:</strong> You can edit your display name and
                biography at any time directly in your Profile screen.
              </li>
              <li>
                <strong className="text-white">Push Notification Permissions:</strong> You can enable or
                disable push notifications at any time through your browser or device settings.
              </li>
              <li>
                <strong className="text-white">Access and Correction:</strong> You may contact us to review,
                update, or request a copy of your personal data.
              </li>
            </ul>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">10. Children&apos;s Privacy</h3>
            <p>
              Planless is not intended for use by children under the age of 13 (or under the minimum legal
              age in your jurisdiction). We do not knowingly collect personal information from children under
              13. If you believe a child has provided us with personal information, please contact us
              immediately at{" "}
              <a href="mailto:support@planless.life" className="text-[#FF6B2C] hover:underline font-medium">
                support@planless.life
              </a>
              , and we will take prompt steps to delete that information.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              11. Changes to This Privacy Policy
            </h3>
            <p>
              We may revise this Privacy Policy periodically as new features are added to Planless. When
              updates are made, the "Last Updated" date at the top of this policy will be revised. We
              encourage you to review this page periodically to stay informed about our data practices.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Mail className="w-4.5 h-4.5 text-[#FF6B2C]" />
              <span>12. Contact Information</span>
            </h3>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your personal
              information, please contact our support team at:
            </p>
            <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Official Contact</p>
                <a
                  href="mailto:support@planless.life"
                  className="text-white font-medium hover:text-[#FF6B2C] transition-colors text-sm sm:text-base mt-0.5 block"
                >
                  support@planless.life
                </a>
              </div>
              <a
                href="mailto:support@planless.life"
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Email Support</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 select-none pb-8">
          <p>&copy; {new Date().getFullYear()} Planless. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a
              href="/terms"
              onClick={handleNavigateToTerms}
              className="text-zinc-400 hover:text-white underline underline-offset-2 transition"
            >
              Terms of Service
            </a>
            <span>&bull;</span>
            <button
              type="button"
              onClick={handleBack}
              className="text-zinc-400 hover:text-white underline underline-offset-2 transition cursor-pointer"
            >
              Back to App
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
