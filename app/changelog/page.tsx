import type { Metadata } from "next";
import { getChangelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog — Carpool Calculator",
};

interface Block {
  type: "ul" | "p";
  items: string[];
}

function toBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split(/\r?\n/);
  let listItems: string[] = [];
  let paraLines: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: "ul", items: listItems });
      listItems = [];
    }
  };
  const flushPara = () => {
    if (paraLines.length) {
      blocks.push({ type: "p", items: [paraLines.join(" ")] });
      paraLines = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushPara();
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      listItems.push(li[1]);
    } else {
      flushList();
      paraLines.push(line);
    }
  }
  flushList();
  flushPara();
  return blocks;
}

export default function ChangelogPage() {
  const entries = getChangelog();
  return (
    <article className="max-w-2xl mx-auto py-4 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Changelog</h1>
        <p className="text-sm text-slate-600">
          A running list of notable changes to Carpool Calculator.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No entries yet.</p>
      ) : (
        entries.map((e) => (
          <section key={e.version} className="space-y-2">
            <h2 className="text-lg font-semibold">
              <span>{e.version}</span>
              <span className="text-slate-500 font-normal"> — {e.date}</span>
            </h2>
            {toBlocks(e.bodyMarkdown).map((b, i) =>
              b.type === "ul" ? (
                <ul key={i} className="list-disc pl-6 space-y-1 text-sm">
                  {b.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="text-sm">
                  {b.items[0]}
                </p>
              )
            )}
          </section>
        ))
      )}
    </article>
  );
}
