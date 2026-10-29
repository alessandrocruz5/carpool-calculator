import { log } from "@/lib/log";

/**
 * The origin that emailed sign-in links must come back to.
 *
 * This is not cosmetic. `signInWithOtp` stores the PKCE code verifier in a
 * cookie, and cookies belong to one origin. If the link returns the user to a
 * different host than the one they signed in from, the browser does not send
 * that cookie, `/auth/confirm` has nothing to exchange the code with, and
 * every single sign-in fails — with an error that reads like a bad link
 * rather than a bad hostname.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set, deliberately: it is static and
 * operator-controlled, whereas the request origin is derived from the `Host`
 * header the client sent. Supabase's Redirect URL allowlist is the real guard
 * against a spoofed host, but a trusted constant is the better default and
 * keeps this route from being the thing standing between an attacker and a
 * link emailed to a domain they chose.
 *
 * The cost of that choice is that a stale value breaks sign-in completely and
 * silently — which is exactly what happened when the app moved off its
 * original *.vercel.app hostname and this variable stayed behind. So a
 * mismatch is reported loudly here rather than left to be rediscovered from a
 * user's screenshot of the link.
 */
export function resolveSiteUrl(req: Request): string {
  const requestOrigin = new URL(req.url).origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configured) return requestOrigin;

  let configuredOrigin: string;
  try {
    // Normalising to `origin` also drops a stray trailing slash or path, which
    // callers would otherwise concatenate into `https://host//auth/confirm`.
    configuredOrigin = new URL(configured).origin;
  } catch {
    log.error("NEXT_PUBLIC_SITE_URL is not a valid absolute URL", {
      configured,
      requestOrigin,
    });
    return requestOrigin;
  }

  if (configuredOrigin !== requestOrigin) {
    // error, not warn: this does not degrade sign-in, it ends it. Every link
    // sent from this deployment lands on an origin with no verifier cookie.
    // Worth a page even at the cost of noise from anyone reaching the app on
    // a secondary hostname, because they are just as unable to sign in.
    log.error("emailed links point at a different origin than the request", {
      configuredOrigin,
      requestOrigin,
      hint: "NEXT_PUBLIC_SITE_URL is stale, or Supabase replaced an un-allowlisted redirect_to with its Site URL",
    });
  }

  return configuredOrigin;
}
