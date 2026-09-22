const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const failedResponses = [];
  const postRequests = [];
  const apiRequests = [];
  await page.addInitScript(() => {
    localStorage.setItem("meliora-live-run-v1", JSON.stringify({
      kind: "run",
      workspaceId: "stale-other-workspace",
      runId: "run:stale-product-browser",
    }));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    if (request.method() === "POST") postRequests.push(request.url());
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

  await page.goto(process.env.PRODUCT_BROWSER_URL || "http://127.0.0.1:5174", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "想先检查什么？", exact: true }).waitFor();
  assert.equal(await page.getByText("Meliora 演示项目", { exact: true }).count() > 0, true);
  assert.equal(await page.getByRole("button", { name: /界面预览|真实运行/ }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "工作区 ID" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "分享" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "添加附件" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "语音输入" }).count(), 0);
  assert.equal(await page.getByText("Automations", { exact: true }).count(), 0);
  assert.equal(await page.getByText("只读运行", { exact: true }).count() > 0, true);
  assert.equal(await page.getByRole("tab", { name: "运行", exact: true }).isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("meliora-live-run-v1")), null);
  assert.deepEqual(apiRequests, []);
  await page.screenshot({
    path: path.join(process.env.BROWSER_SCREENSHOT_DIR || __dirname, "product-1440.png"),
    fullPage: true,
  });

  const suggestion = page.locator(".suggestion-list button").first();
  assert.equal(await suggestion.textContent(), "检查当前 Git 状态，并告诉我有没有未提交的修改。");
  await suggestion.click();
  const composer = page.getByRole("textbox", { name: "输入指令" });
  assert.equal(await composer.inputValue(), "检查当前 Git 状态，并告诉我有没有未提交的修改。");
  assert.equal(await composer.evaluate((element) => element === document.activeElement), true);
  assert.deepEqual(postRequests, []);

  for (const [width, height] of [[1440, 900], [1100, 900], [1099, 900], [768, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width < 1100) {
      assert.equal(await page.getByRole("button", { name: "打开运行面板", exact: true }).isVisible(), true);
    }
    if (width === 390) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR || __dirname, `product-${width}.png`),
        fullPage: true,
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开运行面板", exact: true }).click();
  assert.equal(await page.getByRole("region", { name: "运行证据", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "关闭运行面板", exact: true }).click();

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(failedResponses, []);
  assert.deepEqual(postRequests, []);
  await browser.close();
  console.log("Product browser check passed: teacher-first entry, no fake controls, zero POST, responsive layouts.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
