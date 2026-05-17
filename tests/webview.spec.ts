import { test, expect } from "@playwright/test";

test("WebView UA 下页面正常渲染", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your installation" })).toBeVisible();
  await expect(page.getByText("Verified")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(6);
  await expect(page.getByLabel("Describe the issue")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit ticket" })).toBeVisible();
});

test("WebView 下交互正常", async ({ page }) => {
  await page.goto("/");

  const card = page.getByRole("radio", { name: /Battery issue/ });
  await card.click();
  await expect(card).toHaveAttribute("aria-checked", "true");

  const textarea = page.getByLabel("Describe the issue");
  await textarea.fill("Test from WebView");
  const counter = page.locator("textarea + div, textarea ~ div").filter({
    hasText: /^\d+\/500$/,
  }).first();
  await expect(counter).toHaveText("17/500");
});

const UA_FIXTURES = {
  "shinephone-android":
    "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 ShinePhone/Android/5.1.0",
  "shinephone-ios":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1 ShinePhone/iOS/5.1.0",
  "chrome-mobile":
    "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
  wechat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.16(0x18001033) NetType/WIFI Language/zh_CN",
} as const;

test("不同 UA 下截图对比", async ({ browser }) => {
  for (const [name, ua] of Object.entries(UA_FIXTURES)) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: ua,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    try {
      await page.goto("http://localhost:3000");
      await expect(
        page.getByRole("heading", { name: "Sunterra Support" }),
        `Page should render under UA: ${name}`
      ).toBeVisible();
      await page.screenshot({
        path: `tests/screenshots/webview-${name}.png`,
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});
