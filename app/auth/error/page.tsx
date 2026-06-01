import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in problem — Sabay",
  robots: { index: false, follow: false },
};

type ErrorCode = "expired" | "invalid" | "used";

const ERRORS: Record<ErrorCode, { title: string; body: string }> = {
  expired: {
    title: "That link has expired",
    body:
      "Sign-in links are valid for a short time. Send a fresh one and use it within a few minutes.",
  },
  invalid: {
    title: "That link isn't valid",
    body:
      "We couldn't recognise that link. It may have been mistyped, or it was issued for a different account.",
  },
  used: {
    title: "That link was already used",
    body:
      "Each sign-in link works only once. Send a new one to sign in again.",
  },
};

function pickError(value: string | string[] | undefined): ErrorCode {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "expired" || v === "invalid" || v === "used") return v;
  return "invalid";
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const code = pickError(params.error);
  const { title, body } = ERRORS[code];

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-slate-600">{body}</p>
      <Link
        href="/auth/login"
        className="block text-center w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2"
      >
        Send a new link
      </Link>
      <p className="text-xs text-slate-500">
        Still stuck?{" "}
        <Link href="/legal/contact" className="underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  );
}
