import { test, expect, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.bodyWidth, "body.scrollWidth must not exceed window.innerWidth").toBeLessThanOrEqual(
    overflow.innerWidth
  );
}

test("iPhone 14 Pro 视图无横向滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: "tests/screenshots/responsive-iphone-14-pro.png",
    fullPage: true,
  });
});

test("iPhone SE 窄屏无内容溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: "tests/screenshots/responsive-iphone-se.png",
    fullPage: true,
  });
});

test("iPad 视图布局正确", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // At md+ breakpoint, the brand header sits inside a 480px-wide centered card
  const header = page.locator("header").first();
  const box = await header.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.width).toBeLessThanOrEqual(480);
    expect(box.x).toBeGreaterThan(50);
  }

  await page.screenshot({
    path: "tests/screenshots/responsive-ipad.png",
    fullPage: true,
  });
});

test("桌面 1920px 视图卡片居中且有阴影", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const header = page.locator("header").first();
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  if (headerBox) {
    expect(headerBox.width).toBeLessThanOrEqual(480);
    // Centered: header x ≈ (1920 - 480) / 2 = 720
    expect(headerBox.x).toBeGreaterThan(600);
    expect(headerBox.x).toBeLessThan(800);
  }

  // The outer card container (parent of header) carries the md:shadow-xl
  const outerCard = page.locator("main > div > div").first();
  const shadow = await outerCard.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow, "md:shadow-xl should produce a non-empty box-shadow").not.toBe("none");

  await page.screenshot({
    path: "tests/screenshots/responsive-desktop-1920.png",
    fullPage: true,
  });
});
