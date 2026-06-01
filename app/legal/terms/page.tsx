import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Sabay",
};

const CONTACT_EMAIL = "alessandrorafaelcruz@gmail.com";
const LAST_UPDATED = "May 26, 2026";

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-2xl mx-auto space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="text-sm text-slate-600">Last updated: {LAST_UPDATED}</p>

      <p>
        By creating an account or using Sabay (&ldquo;the
        app&rdquo;) you agree to these terms. If you do not agree, please
        stop using the app.
      </p>

      <h2 className="text-lg font-semibold">The service</h2>
      <p>
        The app helps small carpool groups record fuel fill-ups, trips and
        per-rider cost shares. It is provided free of charge, &ldquo;as is&rdquo;,
        with no warranty of availability, fitness for a particular purpose,
        or accuracy of calculations. You are responsible for verifying any
        numbers before settling payments.
      </p>

      <h2 className="text-lg font-semibold">Your account</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>You must be 16 or older, and provide an email you control.</li>
        <li>You are responsible for activity under your account &mdash; keep your sign-in credentials private.</li>
        <li>One account per person. Don&rsquo;t impersonate someone else.</li>
      </ul>

      <h2 className="text-lg font-semibold">Acceptable use</h2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Upload unlawful, infringing or abusive content.</li>
        <li>Attempt to break the app&rsquo;s security, exhaust resources, or scrape data you don&rsquo;t own.</li>
        <li>Use the app to send unsolicited messages to other people.</li>
        <li>Reverse-engineer or rebrand the app without permission.</li>
      </ul>

      <h2 className="text-lg font-semibold">Your data</h2>
      <p>
        You retain ownership of the data you enter. By using the app you
        grant us the limited rights needed to host, back up and display that
        data to members of your group. See our{" "}
        <Link href="/legal/privacy" className="underline">Privacy Policy</Link>{" "}
        for how data is handled, including how to export or delete it.
      </p>

      <h2 className="text-lg font-semibold">Third-party services</h2>
      <p>
        The app uses Supabase (auth &amp; database), Vercel (hosting), Sentry
        (errors), Upstash (rate limits) and, optionally, Google Sheets. Their
        terms apply to data they process on our behalf.
      </p>

      <h2 className="text-lg font-semibold">Suspension and termination</h2>
      <p>
        We may suspend or terminate an account that violates these terms or
        creates risk for other users. You can delete your account at any time
        from the Account page.
      </p>

      <h2 className="text-lg font-semibold">Liability</h2>
      <p>
        To the extent permitted by law, the app and its operators are not
        liable for indirect, incidental or consequential damages, or for any
        loss of data or revenue arising from your use of the app. Nothing in
        these terms limits liability that cannot be limited by law (for
        example, statutory consumer rights in the EU).
      </p>

      <h2 className="text-lg font-semibold">Changes</h2>
      <p>
        We may update these terms; if a change is material, we&rsquo;ll
        notify signed-in users in the app. Continued use after the change
        means you accept the new terms.
      </p>

      <h2 className="text-lg font-semibold">Governing law</h2>
      <p>
        These terms are governed by the laws of the European Union member
        state where the operator resides, without prejudice to mandatory
        consumer-protection rules of your own country of residence.
      </p>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </article>
  );
}
