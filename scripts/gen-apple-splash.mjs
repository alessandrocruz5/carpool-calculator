#!/usr/bin/env node
// Generates iOS PWA splash screen images for common iPhone resolutions
// from the existing app icon. Requires `sharp`:
//   npm i -D sharp
//   node scripts/gen-apple-splash.mjs
//
// Outputs to public/apple-splash-*.png. The matching <link> tags are emitted
// to stdout for pasting into app/layout.tsx if you ever want manual control
// (Next's metadata.icons currently doesn't model media-query splash links).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Install sharp first: npm i -D sharp");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = path.join(root, "public", "icon-512.png");

// width x height (portrait), device label, devicePixelRatio
const sizes = [
  { w: 1290, h: 2796, label: "iphone-15-pro-max", dpr: 3, cssW: 430, cssH: 932 },
  { w: 1179, h: 2556, label: "iphone-15-pro", dpr: 3, cssW: 393, cssH: 852 },
  { w: 1170, h: 2532, label: "iphone-13-pro", dpr: 3, cssW: 390, cssH: 844 },
  { w: 1125, h: 2436, label: "iphone-x", dpr: 3, cssW: 375, cssH: 812 },
  { w: 828, h: 1792, label: "iphone-xr", dpr: 2, cssW: 414, cssH: 896 },
  { w: 750, h: 1334, label: "iphone-8", dpr: 2, cssW: 375, cssH: 667 },
  { w: 1640, h: 2360, label: "ipad-air", dpr: 2, cssW: 820, cssH: 1180 },
];

const icon = await readFile(source);
const links = [];

for (const s of sizes) {
  const out = path.join(root, "public", `apple-splash-${s.w}x${s.h}.png`);
  const iconSize = Math.round(Math.min(s.w, s.h) * 0.4);
  const resized = await sharp(icon).resize(iconSize, iconSize).toBuffer();
  await sharp({
    create: {
      width: s.w,
      height: s.h,
      channels: 4,
      background: { r: 248, g: 250, b: 252, alpha: 1 },
    },
  })
    .composite([
      {
        input: resized,
        top: Math.round((s.h - iconSize) / 2),
        left: Math.round((s.w - iconSize) / 2),
      },
    ])
    .png()
    .toFile(out);
  const link = `<link rel="apple-touch-startup-image" href="/apple-splash-${s.w}x${s.h}.png" media="(device-width: ${s.cssW}px) and (device-height: ${s.cssH}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)" />`;
  links.push(link);
  console.log(`wrote ${out}`);
}

const linksFile = path.join(root, "public", "apple-splash-links.html");
await writeFile(linksFile, links.join("\n") + "\n");
console.log(`\nLink tags written to ${linksFile}`);
