import { test, expect, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// Set a React-controlled textarea's value via the native setter + an input event.
// `Locator.fill()` is unreliable for controlled textareas under WebKit (iPhone profile).
async function setReactTextareaValue(textarea: Locator, value: string) {
  await textarea.evaluate((el, val) => {
    const proto = HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) throw new Error("HTMLTextAreaElement.value setter not found");
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("点击 problem type 卡片选中变色", async ({ page }) => {
  const card1 = page.getByRole("radio", { name: /System not working/ });
  const card2 = page.getByRole("radio", { name: /Warning or error/ });

  await expect(card1).toHaveAttribute("aria-checked", "false");

  await card1.click();
  await expect(card1).toHaveAttribute("aria-checked", "true");
  await expect(card1).toHaveClass(/bg-sunterra-light/);
  await expect(card1).toHaveClass(/border-sunterra-primary/);

  const icon1 = card1.locator("svg.lucide").first();
  await expect(icon1).toHaveClass(/text-sunterra-primary/);

  await card2.click();
  await expect(card2).toHaveAttribute("aria-checked", "true");
  await expect(card1).toHaveAttribute("aria-checked", "false");
});

test("描述框字数计数实时更新", async ({ page }) => {
  const textarea = page.getByLabel("Describe the issue");
  const counter = page.locator("textarea + div, textarea ~ div").filter({
    hasText: /^\d+\/500$/,
  }).first();

  await expect(counter).toHaveText("0/500");

  // Click first to force Playwright to wait for actionability, which in turn
  // waits for React hydration to attach onChange. Without this, evaluate-based
  // value setting can fire before React listens (flaky under parallel load).
  await textarea.click();

  await setReactTextareaValue(textarea, "Hello");
  await expect(counter).toHaveText("5/500");

  const longText = "a".repeat(451);
  await setReactTextareaValue(textarea, longText);
  await expect(counter).toHaveText("451/500");
  await expect(counter).toHaveClass(/text-red-600/);
});

test("提交按钮点击触发 console.log", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "log") messages.push(msg.text());
  });

  await page.getByRole("button", { name: "Submit ticket" }).click();
  await page.waitForTimeout(200);

  expect(
    messages.some((m) => m.includes("[ticket-form] submit")),
    `Expected a console.log starting with [ticket-form] submit. Got: ${JSON.stringify(messages)}`
  ).toBe(true);
});

test("提交按钮在移动端 sticky 在底部", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const submit = page.getByRole("button", { name: "Submit ticket" });
  await expect(submit).toBeVisible();

  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  // Only meaningful if page is taller than viewport (otherwise sticky won't trigger)
  test.skip(docHeight <= viewport.height, "page shorter than viewport — sticky cannot trigger");

  await page.evaluate((y) => window.scrollTo(0, y), Math.floor(docHeight * 0.35));

  await expect(submit).toBeInViewport();
  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(
      box.y + box.height,
      "button bottom edge should sit near the viewport bottom when scrolled mid-page"
    ).toBeGreaterThan(viewport.height - 100);
  }
});
