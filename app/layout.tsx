import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Support Request | Sunterra",
  description: "Submit a service request for your solar installation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Inline ES2022 built-in-method polyfills for old Android WebView.
 *
 * Background: Growatt's ShinePhone deeplink opens the page inside an Android
 * WebView pinned to Chrome 83 (observed on HONORCMA-AN40, 2026-05). Our
 * package.json `browserslist` targets Chrome >= 80, which lets SWC downlevel
 * ES2021+ SYNTAX (e.g. `??=`, `||=`, `&&=`) — but transpilers cannot
 * polyfill BUILT-IN METHOD calls like `arr.at(-1)` or `Object.hasOwn(o, k)`,
 * because they can't statically prove the receiver is a real Array/Object
 * vs. a shadowed user method. Next.js's runtime DOES use both:
 *   - `Array.prototype.at` in its React-error-digest parser
 *   - `Object.hasOwn` in framework internals
 * Without these polyfills the WebView throws `TypeError: e.entries.at is not
 * a function` and bails before our app renders.
 *
 * Both polyfills are guarded by `if (!…)` so they are no-ops on modern
 * browsers.
 *
 * WHY native <script> instead of <Script strategy="beforeInteractive">:
 * Next 16's App Router implementation of `beforeInteractive` does NOT emit
 * a native <script> with the polyfill body. It emits a tiny <script> that
 * pushes `{id, children}` to `self.__next_s`, and the real <script> element
 * is only appended (via `document.body.appendChild`) by Next's runtime
 * `loadScript()` AFTER the framework runtime chunk has loaded and run.
 * (Verified in node_modules/next/dist/client/script.js lines 274–289 and
 * confirmed in the prod HTML on 2026-05-26.) Because the framework chunks
 * in <head> are marked `async`, they begin executing as soon as their
 * network fetch completes — well before the polyfill queue is drained —
 * and on Chrome 83 they crash on `.at()` / `Object.hasOwn` before we get
 * a chance to install our polyfill.
 *
 * Rendering a raw <script dangerouslySetInnerHTML> JSX element instead
 * makes React 19 + Next 16 emit a real native <script> tag at this exact
 * position in the document.
 *
 * Placed as the FIRST child of an explicit <head> for ironclad
 * pre-execution ordering. We previously tried body-first-child, but that
 * left framework `<script src=… async>` tags positionally earlier (they
 * live in <head>, which the browser parses before <body>). On real mobile
 * networks that worked in practice (HTML parses in ~5 ms vs. async fetch
 * latency of 50+ ms), but a hot WebView cache could close the gap and
 * resurrect the race. Putting the polyfill in <head> as the very first
 * element gives a hard document-order guarantee: the parser hits it
 * BEFORE encountering any other <script> tag, fetch is never even started
 * for a framework chunk while the polyfill body is still executing, and
 * Array.prototype.at / Object.hasOwn are installed before any other JS
 * has a chance to run regardless of cache state or network speed.
 *
 * React 19 supports declaring <head> directly in a layout; Next 16's
 * metadata API (title/description/icon/etc.) still auto-injects ITS own
 * tags into the head, appended after our explicit children — so this
 * placement does not break the metadata API.
 *
 * If a new "X is not a function" surfaces on the WebView for a different
 * ES2022 built-in (e.g. `String.prototype.at`, `structuredClone`,
 * `Object.groupBy`), extend this block — do NOT rely on browserslist alone.
 */
const ES2022_BUILTIN_POLYFILLS = `(function(){
if(!Array.prototype.at){Object.defineProperty(Array.prototype,"at",{value:function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?void 0:this[n];},writable:true,configurable:true});}
if(!Object.hasOwn){Object.defineProperty(Object,"hasOwn",{value:function(o,k){if(o==null)throw new TypeError("Cannot convert undefined or null to object");return Object.prototype.hasOwnProperty.call(Object(o),k);},writable:true,configurable:true});}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          id="es2022-builtin-polyfills"
          dangerouslySetInnerHTML={{ __html: ES2022_BUILTIN_POLYFILLS }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-sunterra-dark">
        {children}
      </body>
    </html>
  );
}
