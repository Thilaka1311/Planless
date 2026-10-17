import React, { useEffect } from "react";
import { ArrowLeft, FileText, ShieldCheck, Mail, ExternalLink } from "lucide-react";
import { navigateToRoute, navigateBack, getInAppNavigationDepth } from "../../navigation/appRouter";

interface TermsOfServiceProps {
  onBack?: () => void;
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = "Terms of Service | Planless";

    let metaDesc = document.querySelector('meta[name="description"]');
    const originalMeta = metaDesc ? metaDesc.getAttribute("content") : null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Terms of Service for Planless. Read the terms governing the use of the Planless social coordination web application."
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

  const handleNavigateToPrivacy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateToRoute({ tab: "home", subScreen: "privacy" });
  };

  return (
    <div
      id="terms_of_service_page"
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col h-full overflow-hidden text-left font-sans select-text"
    >
      {/* Header matching Planless dark aesthetic */}
      <header className="bg-[#050505]/95 backdrop-blur-md border-b border-white/[0.06] px-5 sm:px-8 py-3.5 flex items-center justify-between flex-shrink-0 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="terms_back_btn"
            onClick={handleBack}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-white/[0.08] text-white/80 hover:text-white hover:bg-zinc-850 active:scale-95 transition flex items-center justify-center cursor-pointer select-none"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-4.5 h-4.5 text-[#FF6B2C]" />
              <span>Terms of Service</span>
            </h1>
          </div>
        </div>

        <a
          href="/privacy"
          onClick={handleNavigateToPrivacy}
          className="text-xs sm:text-[13px] font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition select-none cursor-pointer py-1.5 px-3 rounded-lg hover:bg-zinc-900/60"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Privacy Policy</span>
          <span className="xs:hidden">Privacy</span>
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
            Planless Terms of Service
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using the Planless
            application available at <span className="text-zinc-200">https://planless.life</span>. These
            Terms establish a legally binding agreement between you and Planless.
          </p>
        </div>

        <div className="space-y-10 text-[14px] sm:text-[15px] leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">1. Acceptance of the Terms</h3>
            <p>
              By accessing, browsing, registering for, or using Planless, you agree to be bound by these
              Terms and all applicable laws and regulations. If you do not agree with any part of these Terms,
              you must immediately discontinue using Planless.
            </p>
            <p>
              Your privacy is also important to us. Our data handling practices are described in detail in our{" "}
              <a
                href="/privacy"
                onClick={handleNavigateToPrivacy}
                className="text-[#FF6B2C] hover:underline cursor-pointer font-medium"
              >
                Privacy Policy
              </a>
              , which is incorporated by reference into these Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">2. Description of Planless</h3>
            <p>
              Planless is a social planning and event coordination web application designed to help friends
              and groups create, discover, and organize informal outings, social activities, sports, dining,
              and movies.
            </p>
            <p>
              Planless functions solely as a technology platform to facilitate peer-to-peer communication and
              scheduling. Planless is not an event producer, promoter, commercial host, venue operator, or
              ticketing service.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              3. Account Creation and Account Security
            </h3>
            <p>To access core features of Planless, you may create an account using:</p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>Google Sign-In authentication.</li>
              <li>Email verification via One-Time Passcode (OTP).</li>
              <li>WebAuthn Passkeys registered on your compatible device.</li>
            </ul>
            <p className="mt-2">
              You agree to provide accurate and complete information during registration and to keep your
              profile details up to date. You are solely responsible for maintaining the confidentiality and
              security of your login credentials and connected devices, as well as for all activities that
              occur under your account.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">4. Eligibility and Acceptable Use</h3>
            <p>
              You must be at least 13 years old (or the minimum legal age of digital consent in your
              jurisdiction) to create an account or use Planless. By using the service, you represent and
              warrant that you meet this age requirement.
            </p>
            <p>You agree to use Planless only for lawful purposes. You agree NOT to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>Use the service to engage in harassment, bullying, stalking, hate speech, or abuse.</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation with anyone.</li>
              <li>Post false, misleading, defamatory, or unlawful material.</li>
              <li>
                Transmit unsolicited commercial messages, chain letters, spam, or promotional material.
              </li>
              <li>
                Use automated scripts, bots, spiders, or scrapers to access or extract data from Planless
                without prior written consent.
              </li>
              <li>
                Attempt to bypass, disable, reverse-engineer, or compromise the security, integrity, or
                architecture of Planless or its underlying services.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              5. User-Generated Content &amp; Media
            </h3>
            <p>
              Users may create, submit, or upload content to Planless, including plan titles, descriptions,
              chat messages, comments, and photos (&ldquo;User Content&rdquo;).
            </p>
            <div className="space-y-3 pl-2">
              <div>
                <strong className="text-white">Ownership:</strong> You retain full ownership and intellectual
                property rights in the User Content you create or share.
              </div>
              <div>
                <strong className="text-white">License to Planless:</strong> By posting User Content, you grant
                Planless a non-exclusive, worldwide, royalty-free license to host, display, store, reproduce,
                and deliver your content solely as necessary to operate, improve, and provide the service to
                you and other participants in your plans.
              </div>
              <div>
                <strong className="text-white">Participant Visibility:</strong> You acknowledge that any
                content, messages, or photos you share within a plan will be visible to other participants who
                join or are invited to that plan.
              </div>
              <div>
                <strong className="text-white">Responsibility:</strong> You represent and warrant that you own
                or possess all necessary rights and permissions to post your User Content and that it does not
                infringe or violate any third-party intellectual property or privacy rights.
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              6. Plans, Friend Invitations &amp; Real-World Participation
            </h3>
            <p>
              Plans created on Planless represent informal, voluntary gatherings between individuals. You
              acknowledge and agree that:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 pl-2">
              <li>
                <strong className="text-white">Voluntary Participation:</strong> Attendance at any real-world
                activity, venue, dinner, movie, or sporting event is entirely voluntary and undertaken at your
                own risk.
              </li>
              <li>
                <strong className="text-white">No Verification of Hosts or Venues:</strong> Planless does not
                screen, vet, certify, or supervise hosts, participants, venues, or real-world meeting
                locations.
              </li>
              <li>
                <strong className="text-white">Personal Safety:</strong> You are solely responsible for your
                personal safety, health, travel, and conduct during any gathering organized through the app.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              7. Expenses, Balances &amp; Financial Disclaimers
            </h3>
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-4 space-y-3 text-zinc-300">
              <p>
                <strong className="text-white">No Payment Processing:</strong> Planless is currently a free
                social coordination platform. Planless is NOT a bank, payment processor, money transmitter, or
                financial institution.
              </p>
              <p>
                <strong className="text-white">No Guarantee of Repayment:</strong> Any informal bill-splitting,
                shared expense estimates, or contributions discussed among participants are strictly private
                arrangements between individuals. Planless does not hold customer funds, process monetary
                settlements, or guarantee reimbursement between users.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              8. Accuracy of Third-Party Information
            </h3>
            <p>
              Planless integrates third-party public data providers—including Google Places for venue
              information and The Movie Database (TMDB) for movie titles and showtimes. While we strive to
              display up-to-date details, Planless does not guarantee the accuracy, completeness,
              availability, or operating hours of any venue, restaurant, theater, or external location.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              9. Service Availability, Modifications &amp; Downtime
            </h3>
            <p>
              We continuously improve Planless and may add, modify, suspend, or discontinue features or parts
              of the service at any time without prior notice. Planless is provided on an &ldquo;as is&rdquo;
              and &ldquo;as available&rdquo; basis. We do not warrant that the application will be
              uninterrupted, timely, error-free, or free of bugs.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              10. Account Suspension, Termination &amp; Deletion
            </h3>
            <p>
              <strong className="text-white">Termination by Us:</strong> We reserve the right to suspend or
              terminate your account or restrict your access to Planless at our sole discretion, without
              prior notice, if we determine that you have violated these Terms, engaged in prohibited
              activities, or created potential legal liability for Planless or other users.
            </p>
            <p>
              <strong className="text-white">Account Deletion by You:</strong> You may stop using Planless at
              any time. You may also request the complete deletion of your account and associated personal
              records by emailing{" "}
              <a href="mailto:support@planless.life" className="text-[#FF6B2C] hover:underline font-medium">
                support@planless.life
              </a>
              .
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              11. Disclaimers and Limitations of Liability
            </h3>
            <p className="text-zinc-400 text-xs sm:text-[13px] bg-zinc-900/40 border border-white/[0.05] p-3 rounded-lg leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, PLANLESS AND ITS CREATORS, AFFILIATES, AND
              CONTRIBUTORS EXPRESSLY DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL
              PLANLESS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
              OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR
              ACCESS TO OR USE OF THE SERVICE, OR ANY CONDUCT OR CONTENT OF ANY PARTICIPANT OR THIRD PARTY ON
              OR OFF THE SERVICE.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">
              12. Governing Law and Dispute Resolution
            </h3>
            <p>
              These Terms shall be interpreted and governed in accordance with applicable general law,
              without regard to conflict of law principles. Any legal disputes or claims shall be resolved
              through good-faith informal consultation prior to pursuing formal legal remedies.
            </p>
            <p className="text-xs text-zinc-500 italic">
              Note: Specific municipal or national jurisdiction is subject to final administrative and
              corporate confirmation by the project operators.
            </p>
          </section>

          {/* Section 13 */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-white tracking-tight">13. Changes to the Terms</h3>
            <p>
              We reserve the right to revise or update these Terms at any time. When modifications occur, the
              &ldquo;Last Updated&rdquo; date at the top of this document will reflect the change. Your
              continued use of Planless after any such changes constitutes your acceptance of the updated
              Terms.
            </p>
          </section>

          {/* Section 14 */}
          <section className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Mail className="w-4.5 h-4.5 text-[#FF6B2C]" />
              <span>14. Contact Information</span>
            </h3>
            <p>
              If you have any questions, comments, or legal inquiries concerning these Terms of Service,
              please reach out to us at:
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
              href="/privacy"
              onClick={handleNavigateToPrivacy}
              className="text-zinc-400 hover:text-white underline underline-offset-2 transition"
            >
              Privacy Policy
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

export default TermsOfService;
