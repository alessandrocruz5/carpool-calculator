/**
 * CRUD timing perf probe.
 *
 * Runs a small set of read/write queries against a Supabase project 10x each
 * and writes median + p95 timings to docs/audit/perf-baseline.json. Intended
 * as a baseline so we can measure the impact of upcoming RLS/index changes.
 *
 * Usage:
 *   npx tsx scripts/perf-probe.ts <group_id> <user_id>
 *
 * Required env (loaded from .env.local then .env automatically):
 *   NEXT_PUBLIC_SUPABASE_URL  - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - service-role key (or SUPABASE_SECRET_KEY)
 *
 * Do NOT run against production. Point it at a dev / preview branch.
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path: string): boolean {
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const scriptDir = resolve(__dirname);
const repoRoot = resolve(scriptDir, "..");
loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));

const ITERATIONS = 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1);
  return s[idx];
}

async function time<T>(fn: () => Promise<T>): Promise<number> {
  const t0 = performance.now();
  const result = await fn();
  const elapsed = performance.now() - t0;
  // Surface query errors so the timing isn't silently meaningless.
  const maybeErr = (result as unknown as { error?: { message?: string } })
    ?.error;
  if (maybeErr) {
    throw new Error(maybeErr.message ?? "query error");
  }
  return elapsed;
}

interface ProbeResult {
  query: string;
  samples_ms: number[];
  median_ms: number;
  p95_ms: number;
}

async function main(): Promise<void> {
  const [groupId, userId] = process.argv.slice(2);
  if (!groupId || !userId) {
    console.error(
      "Usage: npx tsx scripts/perf-probe.ts <group_id> <user_id>",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probes: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: "select trips by group_id limit 50",
      run: () =>
        supabase.from("trips").select("*").eq("group_id", groupId).limit(50),
    },
    {
      name: "select fillups by group_id limit 50",
      run: () =>
        supabase.from("fillups").select("*").eq("group_id", groupId).limit(50),
    },
    {
      name: "select push_subscriptions by user_id",
      run: () =>
        supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", userId),
    },
    {
      name: "insert+delete trips round-trip",
      run: async () => {
        const inserted = await supabase
          .from("trips")
          .insert({
            group_id: groupId,
            date: new Date().toISOString().slice(0, 10),
            distance_km: 0,
          })
          .select("id")
          .single();
        if (inserted.error) return inserted;
        return supabase.from("trips").delete().eq("id", inserted.data.id);
      },
    },
  ];

  const results: ProbeResult[] = [];
  for (const probe of probes) {
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      samples.push(await time(probe.run));
    }
    results.push({
      query: probe.name,
      samples_ms: samples.map((s) => Number(s.toFixed(2))),
      median_ms: Number(median(samples).toFixed(2)),
      p95_ms: Number(p95(samples).toFixed(2)),
    });
  }

  const out = {
    captured_at: new Date().toISOString(),
    iterations: ITERATIONS,
    supabase_url: url,
    results,
  };

  const outPath = resolve(repoRoot, "docs/audit/perf-baseline.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
  for (const r of results) {
    console.log(
      `  ${r.query.padEnd(45)} median=${r.median_ms}ms p95=${r.p95_ms}ms`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
