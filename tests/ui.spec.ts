import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("品牌头部显示完整", async ({ page }) => {
  await expect(page.getByAltText("Sunterra")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sunterra Support" })).toBeVisible();
  await expect(page.getByText("Submit a service request")).toBeVisible();
});

test("安装信息卡显示所有字段", async ({ page }) => {
  const section = page.getByRole("region").filter({ hasText: "Your installation" })
    .or(page.locator("section").filter({ hasText: "Your installation" }));

  await expect(page.getByRole("heading", { name: "Your installation" })).toBeVisible();
  await expect(page.getByText("Verified")).toBeVisible();

  await expect(page.getByText("Name", { exact: true })).toBeVisible();
  await expect(page.getByText("Address", { exact: true })).toBeVisible();
  await expect(page.getByText("Inverter", { exact: true })).toBeVisible();
  await expect(page.getByText("Serial number", { exact: true })).toBeVisible();

  await expect(page.getByText("John Smith")).toBeVisible();
  await expect(page.getByText("12 Pine Street, Adelaide SA 5000")).toBeVisible();
  await expect(page.getByText("Growatt SPH 6000")).toBeVisible();
  await expect(page.getByText("YRP0F7G0CG")).toBeVisible();

  // Quiet the unused locator (kept for readability above)
  await expect(section.first()).toBeVisible();
});

test("Problem type 显示 6 个选项", async ({ page }) => {
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(6);

  const expectedLabels = [
    "System not working",
    "Warning or error",
    "Cannot see data",
    "Low output",
    "Battery issue",
    "Other",
  ];
  for (const label of expectedLabels) {
    const card = page.getByRole("radio", { name: new RegExp(label) });
    await expect(card).toBeVisible();
    // Each card has at least one lucide SVG icon
    await expect(card.locator("svg.lucide")).toHaveCount(1);
  }

  // Descriptions visible (shortened single-line versions)
  await expect(page.getByText("System completely offline")).toBeVisible();
  await expect(page.getByText("Error code or alarm")).toBeVisible();
  await expect(page.getByText("App offline or no data")).toBeVisible();
  await expect(page.getByText("Output below expected")).toBeVisible();
  await expect(page.getByText("Battery not working")).toBeVisible();
  await expect(page.getByText("Other issues")).toBeVisible();
});

test("表单字段都存在", async ({ page }) => {
  await expect(page.getByLabel("Describe the issue")).toBeVisible();
  await expect(page.getByText("0/500")).toBeVisible();
  await expect(page.getByText("Tap to upload")).toBeVisible();
  await expect(page.locator("input[type=file]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Submit ticket" })).toBeVisible();
  await expect(page.getByText("We'll respond within 24 hours")).toBeVisible();
});
