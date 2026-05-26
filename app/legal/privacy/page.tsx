import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Carpool Calculator",
};

const CONTACT_EMAIL = "alessandrorafaelcruz@gmail.com";
const LAST_UPDATED = "May 26, 2026";

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-2xl mx-auto space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-sm text-slate-600">Last updated: {LAST_UPDATED}</p>

      <p>
        Carpool Calculator (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) is a small
        tool for splitting fuel and parking costs between members of a carpool.
        This page explains what personal data we collect, why we collect it,
        how long we keep it, and the rights you have under the EU General
        Data Protection Regulation (GDPR).
      </p>

      <h2 className="text-lg font-semibold">Who is the controller</h2>
      <p>
        The data controller is the operator of this app, reachable at{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . See also our <Link href="/legal/contact" className="underline">contact page</Link>.
      </p>

      <h2 className="text-lg font-semibold">What we collect</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Account data (Supabase Auth):</strong> your email address,
          a hashed password if you set one, and the timestamps of your sign-ins.
          Stored by our authentication provider, Supabase, in the EU region.
        </li>
        <li>
          <strong>Carpool data you enter:</strong> group names, member display
          names, vehicle details, fuel fill-ups, trips you drove or rode in,
          and payment status. Stored alongside your account in Supabase.
        </li>
        <li>
          <strong>Server &amp; IP logs (Vercel):</strong> request logs that
          include your IP address, user agent and the URL you requested.
          Used for debugging, abuse protection and aggregate analytics.
          Retained by Vercel for a short period (typically up to 30 days).
        </li>
        <li>
          <strong>Push notification subscriptions:</strong> if you enable push
          notifications, your browser&rsquo;s push endpoint and public keys are
          stored so we can send you reminders. You can revoke this at any time
          from the Account page or your browser settings.
        </li>
        <li>
          <strong>Optional Google Sheets export:</strong> if you connect a
          Google account to export data to a spreadsheet, we use the Google
          OAuth token only to write the sheet you choose. We do not read your
          other sheets or store the spreadsheet contents on our servers.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Why we process this data (legal basis)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Contract (Art. 6(1)(b) GDPR):</strong> to provide the carpool
          features you signed up for.
        </li>
        <li>
          <strong>Legitimate interest (Art. 6(1)(f) GDPR):</strong> server logs
          for security, abuse prevention and debugging.
        </li>
        <li>
          <strong>Consent (Art. 6(1)(a) GDPR):</strong> push notifications and
          the optional Google Sheets export. Withdraw anytime.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Who can see your data</h2>
      <p>
        Carpool data is only visible to members of the groups you belong to.
        We do not sell personal data, and we do not share it with advertisers.
        The infrastructure providers that process data on our behalf are:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Supabase (database &amp; authentication)</li>
        <li>Vercel (hosting &amp; request logs)</li>
        <li>Sentry (error reporting; IP addresses are scrubbed)</li>
        <li>Upstash (rate-limiting counters keyed by email or IP)</li>
        <li>Google (only if you opt in to the Sheets export)</li>
      </ul>

      <h2 className="text-lg font-semibold">How long we keep it</h2>
      <p>
        Account and carpool data are kept until you delete your account.
        Server logs are kept for up to 30 days. Backups are rotated within
        90 days.
      </p>

      <h2 className="text-lg font-semibold">Your rights</h2>
      <p>
        Under the GDPR you can access, correct, export, restrict or delete
        your personal data, and object to processing based on legitimate
        interest. The app provides self-service tools for the most common
        requests:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Export</strong> &mdash; download a JSON copy of your data
          from the <Link href="/account" className="underline">Account page</Link>.
        </li>
        <li>
          <strong>Delete</strong> &mdash; delete your account and associated
          rows from the Account page.
        </li>
        <li>
          <strong>Change email</strong> &mdash; from the Account page.
        </li>
      </ul>
      <p>
        For anything else, email{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . You also have the right to lodge a complaint with your local data
        protection authority.
      </p>

      <h2 className="text-lg font-semibold">Cookies</h2>
      <p>
        We use only the cookies that are strictly necessary to keep you signed
        in (set by Supabase). No tracking or advertising cookies are used.
      </p>

      <h2 className="text-lg font-semibold">Changes</h2>
      <p>
        If we change this policy in a material way, we&rsquo;ll notify signed-in
        users in the app before the change takes effect.
      </p>
    </article>
  );
}
