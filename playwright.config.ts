import { defineConfig, devices } from "@playwright/test";

const NON_WEBVIEW_TESTS = [
  "**/ui.spec.ts",
  "**/responsive.spec.ts",
  "**/interaction.spec.ts",
];
const WEBVIEW_TESTS = ["**/webview.spec.ts"];
const UNIT_TESTS = [
  "**/hmac.spec.ts",
  "**/token.spec.ts",
  "**/validation.spec.ts",
];

const SHINEPHONE_UA =
  "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 ShinePhone/Android/5.1.0";

const HUAWEI_P30_UA =
  "Mozilla/5.0 (Linux; Android 10; ELE-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.105 Mobile Safari/537.36";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Pure unit tests (e.g. hmac.spec.ts) need no dev server. Skip it with
  // PW_SKIP_WEBSERVER=1 npx playwright test --project=unit
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },

  projects: [
    {
      name: "unit",
      testMatch: UNIT_TESTS,
    },
    {
      name: "mobile-iphone-14-pro",
      use: { ...devices["iPhone 14 Pro"] },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "mobile-iphone-se",
      use: { ...devices["iPhone SE"] },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "mobile-galaxy-s20",
      use: { ...devices["Galaxy S9+"] },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "mobile-huawei-p30",
      use: {
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: HUAWEI_P30_UA,
        locale: "zh-CN",
        defaultBrowserType: "chromium",
      },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "tablet-ipad-mini",
      use: { ...devices["iPad Mini"] },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "desktop-1920",
      use: {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        defaultBrowserType: "chromium",
      },
      testMatch: NON_WEBVIEW_TESTS,
    },
    {
      name: "webview-shinephone",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: SHINEPHONE_UA,
        locale: "zh-CN",
        defaultBrowserType: "chromium",
      },
      testMatch: WEBVIEW_TESTS,
    },
  ],
});
