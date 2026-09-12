const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");

  for (const width of [1440, 1100, 1099, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if ([1440, 1100, 768, 390].includes(width)) {
      await page.screenshot({ path: path.join(__dirname, `web-${width}.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(320);
  const centerBefore = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await page.waitForTimeout(320);
  const centerAfter = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(centerAfter > centerBefore + 190);
  await page.getByRole("button", { name: "新建对话", exact: true }).waitFor();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();

  await page.getByRole("button", { name: /工作区检查/ }).click();
  await page.locator('[data-event="tool_call_presented"]').waitFor();
  for (const [title, eventKind] of [["修改文件审批", "approval_requested"], ["Git 检查失败", "run_failed"], ["已取消的任务", "run_cancelled"], ["恢复断开的会话", "tool_result_presented"], ["等待补充信息", "run_blocked"], ["整理任务上下文", "context_compacted"]]) {
    await page.getByRole("button", { name: new RegExp(title) }).click();
    if (title === "恢复断开的会话") await page.getByRole("button", { name: "重新回放", exact: true }).click();
    await page.locator(`[data-event="${eventKind}"]`).waitFor();
  }
  await page.getByRole("button", { name: /修改文件审批/ }).click();
  await page.getByText("此历史审批已过期，当前仅供查看。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "允许本次", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: /待处理审批演示/ }).click();
  await page.locator('[data-event="approval_requested"]').waitFor();
  assert.equal(await page.getByRole("button", { name: "允许本次", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "允许本次", exact: true }).click();
  await page.getByText("已允许本次（演示，不会执行修改）。", { exact: true }).waitFor();

  assert.equal(await page.getByText("暂无文件变更", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("+156", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "新建对话", exact: true }).click();
  await page.getByRole("heading", { name: "开始一个新任务", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "任务执行概览", exact: true }).count(), 0);
  await page.getByRole("button", { name: "重新回放", exact: true }).click();
  await page.locator(".timeline-loading").waitFor();

  await page.keyboard.press("Control+KeyL");
  assert.equal(await page.getByRole("textbox", { name: "搜索项目和对话" }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.type("Git");
  assert.equal(await page.getByRole("button", { name: /Git 检查失败/ }).isVisible(), true);
  await page.getByRole("textbox", { name: "搜索项目和对话" }).fill("");
  await page.getByRole("region", { name: "存储库", exact: true }).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("dialog", { name: "存储库操作" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /工作区检查/ }).click();
  await page.getByRole("textbox", { name: "输入指令" }).fill("检查中文输入\n<img src=x onerror=alert(1)>");
  await page.keyboard.press("Control+Enter");
  await page.getByText("<img src=x onerror=alert(1)>", { exact: false }).waitFor();
  assert.equal(await page.locator("img").count(), 0);

  await page.setViewportSize({ width: 1099, height: 900 });
  await page.getByRole("button", { name: "打开代码面板", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "变更", exact: true }).isVisible(), true);
  await page.getByRole("tab", { name: "变更", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "预览", exact: true }).getAttribute("aria-selected"), "true");
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "关闭代码面板", exact: true }).click();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.keyboard.press("Control+KeyL");
  assert.equal(await page.getByRole("textbox", { name: "搜索项目和对话" }).evaluate((element) => element === document.activeElement), true);
  assert.equal(await page.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "打开代码面板", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("tab", { name: "预览", exact: true }).isVisible(), true);
  await page.keyboard.press("Escape");

  assert.deepEqual(pageErrors, []);
  console.log("PASS: five required PublicRunEvent replays, empty/loading/no-diff states, expired/live approvals, six responsive widths, transition-settled screenshots, keyboard shortcuts/drawers/tabs, escaped input; no page errors.");
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
