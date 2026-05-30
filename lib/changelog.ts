import fs from "node:fs";
import path from "node:path";

export interface ChangelogEntry {
  version: string;
  date: string;
  bodyMarkdown: string;
}

const HEADING_RE = /^##\s+(\S+)\s+[—–-]\s+(.+?)\s*$/;

function parseChangelog(source: string): ChangelogEntry[] {
  const lines = source.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current) {
      current.bodyMarkdown = buf.join("\n").trim();
      entries.push(current);
    }
  };

  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      current = { version: m[1], date: m[2], bodyMarkdown: "" };
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return entries;
}

let cached: ChangelogEntry[] | null = null;

export function getChangelog(): ChangelogEntry[] {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "docs", "changelog.md");
  const source = fs.readFileSync(filePath, "utf8");
  cached = parseChangelog(source);
  return cached;
}

export function getLatestVersion(): string | null {
  const entries = getChangelog();
  return entries[0]?.version ?? null;
}
