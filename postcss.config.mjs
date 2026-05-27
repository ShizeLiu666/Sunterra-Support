/**
 * PostCSS pipeline.
 *
 * Plugins run in declaration order:
 *
 *   1. `@tailwindcss/postcss` expands `@import "tailwindcss"` and emits the
 *      generated utility CSS. Tailwind v4's output uses three modern CSS
 *      features that are NOT supported on the Android WebView Chrome
 *      versions we care about (80–91, observed on Huawei WebView 11 and
 *      Honor / ShinePhone deeplinks):
 *
 *        - Native CSS nesting (`&:hover { … }`) — Chrome 112+
 *        - `color-mix(in oklab, …)`              — Chrome 111+
 *        - `oklch(…)` / `oklab(…)` color tokens  — Chrome 111+
 *
 *      Tailwind has officially stated v4 cannot be used on older
 *      browsers. We rebuild the missing fallbacks via three post-pass
 *      plugins; together they restore Tailwind-v3-equivalent output for
 *      the affected declarations while preserving the modern syntax for
 *      browsers that DO support it.
 *
 *   2. `postcss-nesting` flattens native CSS nesting into traditional
 *      selectors. Tailwind v4 emits hover/focus/disabled/first/last/
 *      placeholder variants as nested rules:
 *
 *          .hover\:bg-gray-100 { &:hover { @media (hover:hover) {
 *            background-color: var(--color-gray-100)
 *          } } }
 *
 *      Chrome < 112 silently ignores the entire nested block (the parser
 *      doesn't know what to do with `&`), so EVERY interactive state on
 *      our app (button hover/disabled, input focus, group-hover icons,
 *      placeholder dimming, first/last child padding) renders as if the
 *      modifier weren't there. After this plugin runs, the same rule
 *      becomes:
 *
 *          @media (hover:hover) {
 *            .hover\:bg-gray-100:hover {
 *              background-color: var(--color-gray-100)
 *            }
 *          }
 *
 *      …which Chrome 80+ has supported for years (caniuse #css-sel2).
 *
 *      No options — the default (flatten everything) is what we want.
 *      Modern browsers don't notice the difference; nothing functional is
 *      lost by dropping the `&` syntax.
 *
 *   3. `@csstools/postcss-color-mix-function` walks every declaration and
 *      prepends a static `rgba(...)` fallback in front of each
 *      `color-mix(...)` value. Handles opacity modifiers — the most
 *      common Tailwind v4 pattern on this app (disabled buttons, focus
 *      rings, gradient stops, hover dimming, placeholders).
 *
 *      `preserve: true` keeps the original `color-mix(...)` line so modern
 *      browsers still get the correct interpolated value.
 *
 *   4. `@csstools/postcss-oklab-function` walks every declaration and
 *      prepends an `rgb(...)` fallback in front of each `oklch(...)` /
 *      `oklab(...)` value. Handles Tailwind's default palette tokens
 *      (gray-100, red-500, etc.).
 *
 *      `preserve: true` is CRITICAL — without it the plugin REPLACES the
 *      modern value, downgrading colour fidelity on modern browsers.
 *
 *      Resulting output for a palette token looks like:
 *
 *          .bg-primary {
 *            background-color: rgb(0, 176, 86);     <- fallback for Chrome 83
 *            background-color: oklch(.66 .24 151);  <- preserved for modern
 *          }
 *
 *      Old WebView reads the rgb line and ignores the oklch one it can't
 *      parse; modern browsers read both and use the last winning value.
 *
 * Ordering rationale
 * ------------------
 * - Tailwind must run FIRST. The nested/color-mix/oklch values do not
 *   exist in our source CSS — they are synthesised by Tailwind's utility
 *   generator. The fallback plugins have nothing to operate on until
 *   Tailwind has produced its output.
 *
 * - postcss-nesting must run AFTER Tailwind (it operates on Tailwind's
 *   output) but BEFORE the color plugins is safest — the color plugins
 *   need to walk declarations, and flat selectors are easier to reason
 *   about than nested ones.
 *
 * - color-mix-function runs BEFORE oklab-function. `color-mix(in oklab,
 *   var(--c) 60%, transparent)` can expand into intermediate oklch values
 *   on its fallback line. Running oklab-function AFTER lets it catch any
 *   freshly-emitted oklch values and add their rgb() fallbacks too.
 *
 * Note: package.json scripts use `next build --webpack`. Turbopack does
 * not consume `postcss.config.mjs` (it has its own CSS pipeline), so
 * keep the `--webpack` flag if you ever revisit the script.
 */

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-nesting": {},
    "@csstools/postcss-color-mix-function": { preserve: true },
    "@csstools/postcss-oklab-function": { preserve: true },
  },
};

export default config;
