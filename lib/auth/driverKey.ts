import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const HEADER = "x-driver-key";

function getExpectedKey(): string | null {
  const k = process.env.DRIVER_KEY;
  return k && k.length > 0 ? k : null;
}

export function isDriverKeyConfigured(): boolean {
  return getExpectedKey() !== null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function assertDriver(req: Request): NextResponse | null {
  const expected = getExpectedKey();
  if (!expected) {
    return NextResponse.json(
      { error: "DRIVER_KEY not configured on server" },
      { status: 503 }
    );
  }
  const provided = req.headers.get(HEADER) ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
