import type { Metadata } from "next";
import Script from "next/script";
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
 * browsers. Loaded with `strategy="beforeInteractive"` so Next.js inlines
 * the script into the server-rendered `<head>` and it runs BEFORE any
 * Next.js framework chunk executes.
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
      <body className="min-h-full flex flex-col bg-white text-sunterra-dark">
        <Script
          id="es2022-builtin-polyfills"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: ES2022_BUILTIN_POLYFILLS }}
        />
        {children}
      </body>
    </html>
  );
}
