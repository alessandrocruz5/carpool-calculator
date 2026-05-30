import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact — Carpool Calculator",
};

const CONTACT_EMAIL = "alessandrorafaelcruz@gmail.com";

export default function ContactPage() {
  return (
    <article className="prose prose-slate max-w-2xl mx-auto space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Contact</h1>
      <p>
        For privacy questions, data-rights requests (access, export, deletion,
        rectification), security reports or general feedback, please email:
      </p>
      <p>
        <a className="underline text-brand-600" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
      <p className="text-sm text-slate-600">
        We aim to respond within 30 days, as required by GDPR Art. 12(3).
      </p>
      <p>
        See also our{" "}
        <Link href="/legal/privacy" className="underline">Privacy Policy</Link>{" "}
        and{" "}
        <Link href="/legal/terms" className="underline">Terms of Service</Link>.
      </p>
    </article>
  );
}
