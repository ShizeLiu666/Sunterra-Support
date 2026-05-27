/**
 * PostCSS pipeline.
 *
 * Plugins run in declaration order:
 *
 *   1. `@tailwindcss/postcss` expands `@import "tailwindcss"` and emits the
 *      generated utility CSS. Tailwind v4's default palette uses `oklch()`
 *      and its opacity modifiers (`/60`, `/40`, …) use `color-mix(in
 *      oklab, …)`. Neither is supported on Chrome < 111. Tailwind has
 *      officially stated v4 cannot be used on older browsers.
 *
 *   2. `@csstools/postcss-color-mix-function` walks every declaration and
 *      prepends a static `rgb(...)` (or computed) fallback in front of
 *      each `color-mix(...)` value. This handles opacity modifiers — the
 *      most common Tailwind v4 pattern on this app (disabled buttons,
 *      focus rings, gradient stops, hover dimming, placeholders).
 *
 *      `preserve: true` keeps the original `color-mix(...)` line so modern
 *      browsers still get the correct interpolated value.
 *
 *   3. `@csstools/postcss-oklab-function` walks every declaration and
 *      prepends an `rgb(...)` fallback in front of each `oklch(...)` /
 *      `oklab(...)` value. Handles Tailwind's default palette tokens
 *      (gray-100, red-500, etc.).
 *
 *      `preserve: true` is CRITICAL — without it the plugin REPLACES the
 *      modern value, downgrading colour fidelity on modern browsers.
 *
 *      Resulting output looks like:
 *
 *          .bg-primary {
 *            background-color: rgb(0, 176, 86);     <- fallback for Chrome 83
 *            background-color: oklch(.66 .24 151);  <- preserved for modern
 *          }
 *
 *      Old WebView reads the rgb line and ignores the oklch one it can't
 *      parse; modern browsers read both and use the last winning value.
 *
 * Why color-mix MUST run BEFORE oklab-function
 * --------------------------------------------
 * `color-mix(in oklab, var(--c) 60%, transparent)` expands during the
 * color-mix pass into intermediate `oklch(...)` (or `oklab(...)`)
 * computations on the fallback line. If we ran oklab-function first, it
 * would have no oklch values to fall back from (those don't exist yet —
 * they emerge from color-mix expansion). Running oklab-function AFTER
 * lets it catch the freshly-emitted oklch values from step 2 and add
 * their rgb() fallbacks too.
 *
 * Why Tailwind MUST run first
 * ---------------------------
 * The oklch / color-mix values do not exist in our source CSS — they are
 * synthesised by Tailwind's utility generator. So the postcss-color
 * plugins have nothing to operate on until Tailwind has produced the
 * utility output.
 *
 * Note: package.json scripts use `next build --webpack`. Turbopack does
 * not consume `postcss.config.mjs` (it has its own CSS pipeline), so
 * keep the build flag if you ever revisit the script.
 */

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "@csstools/postcss-color-mix-function": { preserve: true },
    "@csstools/postcss-oklab-function": { preserve: true },
  },
};

export default config;
