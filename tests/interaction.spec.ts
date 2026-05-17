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

  // 451 chars crosses the warn threshold (>= 450) → counter turns orange.
  // Red color is reserved for >= 490, exercised in the dedicated color test.
  const longText = "a".repeat(451);
  await setReactTextareaValue(textarea, longText);
  await expect(counter).toHaveText("451/500");
  await expect(counter).toHaveClass(/text-orange-500/);
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

// === Photo upload ===

function makeFile(name: string, mime: string, sizeBytes: number) {
  return { name, mimeType: mime, buffer: Buffer.alloc(sizeBytes) };
}

// `getByRole("alert")` also matches Next.js's empty route-announcer div, so we
// target our form's alert (a <p>) by tag + role explicitly.
const formAlertSelector = "p[role=alert]";

test("上传超过 5 张图片显示限制提示", async ({ page }) => {
  const fileInput = page.locator("input[type=file]");
  const six = Array.from({ length: 6 }, (_, i) =>
    makeFile(`p${i + 1}.png`, "image/png", 1024)
  );

  await fileInput.setInputFiles(six);

  await expect(page.getByRole("img", { name: /Uploaded photo/ })).toHaveCount(5);
  await expect(page.locator(formAlertSelector)).toHaveText(/Maximum 5 photos/);
  await expect(page.getByText(/Maximum 5 photos reached/)).toBeVisible();
});

test("上传超大文件显示提示", async ({ page }) => {
  const fileInput = page.locator("input[type=file]");
  const big = makeFile("huge.png", "image/png", 6 * 1024 * 1024);

  await fileInput.setInputFiles([big]);

  await expect(page.locator(formAlertSelector)).toHaveText(/File too large/);
  await expect(page.getByRole("img", { name: /Uploaded photo/ })).toHaveCount(0);
});

test("删除已上传图片", async ({ page }) => {
  const fileInput = page.locator("input[type=file]");
  const three = Array.from({ length: 3 }, (_, i) =>
    makeFile(`p${i + 1}.png`, "image/png", 1024)
  );

  await fileInput.setInputFiles(three);
  await expect(page.getByRole("img", { name: /Uploaded photo/ })).toHaveCount(3);

  // Remove the middle photo (index 1 → aria-label "Remove photo 2")
  await page.getByRole("button", { name: "Remove photo 2" }).click();

  await expect(page.getByRole("img", { name: /Uploaded photo/ })).toHaveCount(2);
});

test("描述框输入超长文本不破坏布局", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const textarea = page.getByLabel("Describe the issue");
  await textarea.click();
  await setReactTextareaValue(textarea, "X".repeat(500));

  const heightPx = await textarea.evaluate(
    (el) => (el as HTMLTextAreaElement).getBoundingClientRect().height
  );
  expect(heightPx, "textarea should never exceed max-h-[150px]").toBeLessThanOrEqual(150);

  const overflow = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.innerWidth);

  await expect(page.getByRole("button", { name: "Submit ticket" })).toBeInViewport();
});

test("描述框接近上限时字数计数变色", async ({ page }) => {
  const textarea = page.getByLabel("Describe the issue");
  const counter = page
    .locator("textarea + div, textarea ~ div")
    .filter({ hasText: /^\d+\/500$/ })
    .first();

  await textarea.click();

  await setReactTextareaValue(textarea, "a".repeat(460));
  await expect(counter).toHaveText("460/500");
  await expect(counter).toHaveClass(/text-orange-500/);

  await setReactTextareaValue(textarea, "a".repeat(495));
  await expect(counter).toHaveText("495/500");
  await expect(counter).toHaveClass(/text-red-600/);
});

test("Problem type 卡片连续快速点击不报错", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  const cards = await page.getByRole("radio").all();
  expect(cards).toHaveLength(6);

  for (const card of cards) {
    await card.click();
  }

  const last = cards[cards.length - 1];
  await expect(last).toHaveAttribute("aria-checked", "true");

  expect(
    pageErrors,
    `Page errors after rapid clicks: ${JSON.stringify(pageErrors)}`
  ).toHaveLength(0);
  expect(
    consoleErrors,
    `Console errors after rapid clicks: ${JSON.stringify(consoleErrors)}`
  ).toHaveLength(0);
});
