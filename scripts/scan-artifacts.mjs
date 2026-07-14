#!/usr/bin/env node
/**
 * WebView compatibility artifact scanner (baseline-snapshot gate).
 *
 * WHY THIS EXISTS
 *   This project ships inside old Android / ShinePhone WebViews. Twice in its
 *   history a dependency-GENERATED artifact (not our source) shipped syntax the
 *   WebView engine could not parse and the page broke: an un-flattened CSS
 *   `@layer` rule, and `Array.prototype.at` in a JS chunk. Neither was visible
 *   in source review — only in the BUILT output. This gate scans the production
 *   build for risky syntax so a dependency bump (e.g. a future Tailwind that
 *   starts emitting real `:has()` / `@container` at-rules) can never silently
 *   reach production again.
 *
 * WHY A BASELINE SNAPSHOT (not a plain denylist)
 *   The build ALREADY contains, at an accepted/unavoidable level:
 *     • Next 16's framework runtime uses `.at()` (Chrome 92) and
 *       `structuredClone` (Chrome 98) — un-removable, identical on every
 *       branch (same Next + same lockfile).
 *     • Tailwind emits utility CLASS names that look like at-rules to a grep,
 *       e.g. `.\@container` (a container-query marker class, NOT the dangerous
 *       `@container (...)` at-rule) and `.text-wrap{text-wrap:wrap}` (`wrap` is
 *       the default; old browsers ignore it — harmless, unlike `balance`).
 *   A plain denylist fails forever on all of the above. Instead we snapshot the
 *   accepted counts into `webview-baseline.json` and FAIL ONLY when a gated
 *   pattern's count RISES above baseline (= something new was introduced) or a
 *   brand-new gated pattern appears. Regenerate after a reviewed change with:
 *       node scripts/scan-artifacts.mjs --update
 *
 * WHY PLAYWRIGHT (tests/webview.spec.ts) DOES NOT COVER THIS
 *   webview.spec.ts only swaps the User-Agent STRING; the engine is still a
 *   modern Chromium that happily parses `:has()`, `.at()`, etc. Only scanning
 *   the actual built bytes catches engine-level syntax problems.
 *
 * BASELINE (2026-07-14, both `main` and `milestone-2`, identical):
 *   • CSS floor  Chrome 88 — Tailwind v4 preflight `:where()` / `:is()` (un-guarded).
 *   • JS  floor  Chrome 98 — Next 16 runtime `structuredClone` (also `.at()` @92).
 *   The earlier "Chrome 83 / JS all-zero" note was WRONG (a broken grep); the
 *   real floor is Chrome 98 and is the SAME on the production `main` branch.
 *   color-mix / oklch / oklab are NOT gated: the PostCSS chain wraps them in
 *   `@supports` with an rgb() fallback, so old WebViews are safe.
 *
 * EXIT CODES
 *   0  within baseline (may print informational + shrink notes)
 *   1  a gated pattern rose above baseline / a new gated pattern appeared
 *   2  no build artifacts found, or baseline missing (run --update first)
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_DIR = ".next/static/css";
const CHUNKS_DIR = ".next/static/chunks";
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), "webview-baseline.json");
const UPDATE = process.argv.includes("--update");

// ── GATED: rising above baseline fails the build. Patterns are written to
//    avoid the known false positives (Tailwind class names, regex char classes). ──
const GATED = [
  // CSS — genuinely engine-breaking, above the accepted floor.
  { name: ":has(", kind: "css", re: /:has\(/g, min: 105 },
  // Real at-rule only: followed by whitespace/`(`, and NOT the escaped
  // `.\@container` marker class (that is followed by `:`/`\`).
  { name: "@container (at-rule)", kind: "css", re: /(?<!\\)@container[\s(]/g, min: 105 },
  // Only the values that actually change layout; `text-wrap:wrap` is a no-op default.
  { name: "text-wrap:balance|pretty", kind: "css", re: /text-wrap:\s*(balance|pretty)/g, min: 114 },
  { name: "@layer (at-rule, should be flattened)", kind: "css", re: /(?<!\\)@layer[\s{]/g, min: 99 },
  { name: "CSS nesting &{ (should be flattened)", kind: "css", re: /&\{/g, min: 112 },
  { name: "lab(", kind: "css", re: /(?<![a-z])lab\(/g, min: 111 },
  { name: "lch(", kind: "css", re: /(?<![a-z])lch\(/g, min: 111 },
  // JS — runtime methods (NOT polyfilled by Next). Baseline captures Next's
  // framework use; a rise means OUR code / a new dep added more.
  { name: ".at(", kind: "js", re: /\.at\(/g, min: 92 },
  { name: "structuredClone", kind: "js", re: /structuredClone/g, min: 98 },
  { name: "Object.hasOwn", kind: "js", re: /hasOwn\(/g, min: 93 },
  { name: ".replaceAll(", kind: "js", re: /\.replaceAll\(/g, min: 85 },
  { name: ".findLast(", kind: "js", re: /\.findLast\(/g, min: 97 },
  { name: ".findLastIndex(", kind: "js", re: /\.findLastIndex\(/g, min: 97 },
];

// ── INFORMATIONAL: reported for awareness, never gated. Either below the floor
//    (safe) or accepted-baseline features. ──
const INFO = [
  { name: ":is( / :where(", kind: "css", re: /:where\(|:is\(/g, note: "Tailwind v4 preflight — CSS floor 88" },
  { name: "aspect-ratio", kind: "css", re: /aspect-ratio/g, note: "aspect-square thumbnails (accepted, Chrome 88)" },
  { name: "color-mix/oklch/oklab", kind: "css", re: /color-mix\(|oklch\(|oklab\(/g, note: "@supports-guarded with rgb() fallback — safe" },
  { name: "?. ?? ||= &&= ??=", kind: "js", re: /\?\?=|\|\|=|&&=|\?\?|\?\.(?![0-9])/g, note: "Chrome ≤85, below the 98 floor — safe (may include regex-charclass noise)" },
];

function listFiles(dir, ext) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const lineOf = (t, i) => { let l = 1; for (let k = 0; k < i; k++) if (t[k] === "\n") l++; return l; };
const snip = (t, i, n) => t.slice(Math.max(0, i - 30), Math.min(t.length, i + n + 30)).replace(/\n/g, "⏎");

function scan(files, re) {
  let total = 0; const examples = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    re.lastIndex = 0; let m;
    while ((m = re.exec(text)) !== null) {
      total++;
      if (examples.length < 4) examples.push({ file: f.replace(/^\.next\//, ""), line: lineOf(text, m.index), snip: snip(text, m.index, m[0].length) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return { total, examples };
}

const css = listFiles(CSS_DIR, ".css");
const js = listFiles(CHUNKS_DIR, ".js");
if (css.length === 0 && js.length === 0) {
  console.error("\x1b[31m[scan] No build output under .next/static. Run `next build` first.\x1b[0m");
  process.exit(2);
}

const filesFor = (kind) => (kind === "css" ? css : js);
const current = {};
const examplesByName = {};
for (const p of GATED) {
  const r = scan(filesFor(p.kind), p.re);
  current[p.name] = r.total;
  examplesByName[p.name] = r.examples;
}

// ── --update: snapshot current gated counts as the accepted baseline. ──
if (UPDATE) {
  const payload = {
    _comment: "Accepted WebView-syntax baseline. CI (scripts/scan-artifacts.mjs) fails if any gated pattern's count exceeds these. Regenerate after a reviewed change: node scripts/scan-artifacts.mjs --update",
    updated: "run `node scripts/scan-artifacts.mjs --update` to refresh",
    gated: current,
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n");
  console.log(`[scan] baseline written to ${BASELINE.replace(process.cwd() + "/", "")}:`);
  for (const p of GATED) console.log(`    ${p.name.padEnd(34)} ${current[p.name]}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error("\x1b[31m[scan] No webview-baseline.json. Generate it once with: node scripts/scan-artifacts.mjs --update\x1b[0m");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).gated || {};

console.log(`[scan] ${css.length} CSS + ${js.length} JS artifact(s) — WebView floor: CSS 88 / JS 98\n`);

// Informational (never gates).
console.log("Informational (not gated):");
for (const p of INFO) {
  const r = scan(filesFor(p.kind), p.re);
  console.log(`  • ${p.name.padEnd(24)} ×${String(r.total).padStart(3)}  — ${p.note}`);
}
console.log("");

// Gate: fail if current > baseline for any gated pattern.
const violations = [];
const shrinks = [];
for (const p of GATED) {
  const base = baseline[p.name] ?? 0;
  const cur = current[p.name];
  if (cur > base) violations.push({ p, base, cur });
  else if (cur < base) shrinks.push({ p, base, cur });
}

console.log("Gated patterns (fail if above baseline):");
for (const p of GATED) {
  const base = baseline[p.name] ?? 0;
  const cur = current[p.name];
  const mark = cur > base ? "\x1b[31m▲\x1b[0m" : cur < base ? "\x1b[33m▼\x1b[0m" : "✓";
  console.log(`  ${mark} ${p.name.padEnd(36)} ${cur}/${base}  (Chrome ${p.min})`);
}
console.log("");

if (shrinks.length) {
  console.log("\x1b[33mNote: some patterns dropped below baseline — safe to tighten with --update:\x1b[0m");
  for (const s of shrinks) console.log(`    ${s.p.name}: ${s.cur} < ${s.base}`);
  console.log("");
}

if (violations.length === 0) {
  console.log("\x1b[32m✓ PASS — no gated WebView syntax above the accepted baseline.\x1b[0m");
  process.exit(0);
}

console.error("\x1b[31m✗ FAIL — gated WebView-risky syntax rose above baseline:\x1b[0m\n");
for (const v of violations) {
  console.error(`\x1b[31m  [${v.p.kind.toUpperCase()}] ${v.p.name}: ${v.cur} (baseline ${v.base}, needs Chrome ${v.p.min})\x1b[0m`);
  for (const ex of examplesByName[v.p.name]) console.error(`      ${ex.file}:${ex.line}  …${ex.snip}…`);
}
console.error(
  "\n\x1b[31mNew occurrences of this syntax can break old WebViews. It usually comes from a\n" +
    "dependency bump or a new Tailwind utility. Investigate the source; if the change is\n" +
    "reviewed and intentionally accepted, refresh the baseline:\n" +
    "    node scripts/scan-artifacts.mjs --update\x1b[0m"
);
process.exit(1);
