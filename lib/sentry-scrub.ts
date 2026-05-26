const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g;
const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|token|access[_-]?token|refresh[_-]?token|password|email|secret)$/i;

function scrubString(value: string): string {
  return value
    .replace(BEARER_RE, "Bearer [Filtered]")
    .replace(JWT_RE, "[Filtered JWT]")
    .replace(EMAIL_RE, "[Filtered Email]");
}

function scrubValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEYS.test(key)) return "[Filtered]";
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, k);
    }
    return out;
  }
  return value;
}

export function scrubPII<T>(input: T): T {
  if (!input) return input;
  return scrubValue(input) as T;
}
