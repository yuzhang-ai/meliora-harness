const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

const baseUrl = process.env.MELIORA_WEB_URL || "http://127.0.0.1:5173";
const screenshot = (page, name) => page.screenshot({ path: path.join(__dirname, name), fullPage: true });
const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

function collectBrowserErrors(page, errors) {
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("requestfailed", (request) => errors.request.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "unknown error"}`));
  page.on("response", (response) => { if (response.status() >= 400) errors.response.push(`${response.status()} ${response.url()}`); });
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = { page: [], console: [], request: [], response: [] };
  collectBrowserErrors(page, errors);
  await page.goto(baseUrl);
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content.includes("viewport-fit=cover")), true);
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content.includes("interactive-widget=resizes-content")), true);
  assert.ok(["available", "fallback"].includes(await page.evaluate(() => document.documentElement.dataset.visualViewport)));
  assert.ok(["available", "fallback"].includes(await page.evaluate(() => document.documentElement.dataset.dynamicViewport)));

  const responsiveConditions = await page.evaluate(() => Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => "conditionText" in rule)
    .map((rule) => rule.conditionText));
  assert.ok(responsiveConditions.includes("(max-width: 1100px)"), `missing 1100px drawer breakpoint: ${responsiveConditions.join(", ")}`);
  assert.ok(responsiveConditions.some((condition) => condition.includes("orientation: landscape") && condition.includes("max-height: 500px")), "missing compact landscape layout");

  for (const [width, height] of [[1440, 900], [1100, 900], [768, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert.equal(await noHorizontalOverflow(page), true, `${width}x${height} overflowed horizontally`);
    assert.equal(await page.getByRole("button", { name: "打开代码面板", exact: true }).isVisible(), width > 768 && width <= 1100, `${width}px inspector trigger adaptation was incorrect`);
    assert.equal(await page.getByRole("navigation", { name: "手机主导航", exact: true }).isVisible(), width <= 768, `${width}px mobile navigation adaptation was incorrect`);
    await screenshot(page, `web-${width}.png`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(320);
  const leftWidth = await page.locator(".left-panel").evaluate((element) => element.getBoundingClientRect().width);
  const rightWidth = await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.equal(leftWidth, 220);
  assert.equal(rightWidth, 360);
  const centerBefore = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await page.waitForTimeout(320);
  const centerAfter = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(centerAfter > centerBefore + 150);
  await page.getByRole("button", { name: "新建对话", exact: true }).waitFor();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await page.getByRole("button", { name: "右键或点击添加项目", exact: true }).click();
  await page.getByRole("heading", { name: "添加项目", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /选择文件夹/ }).count(), 0);
  await page.getByRole("button", { name: "×", exact: true }).click();

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

  const applicationUrl = page.url();
  const searchInput = page.getByRole("textbox", { name: "搜索项目和对话" });
  await page.keyboard.press("Control+Shift+KeyK");
  assert.equal(page.url(), applicationUrl);
  await page.waitForFunction((element) => element === document.activeElement, await searchInput.elementHandle());
  await page.keyboard.type("Git");
  assert.equal(await page.getByRole("button", { name: /Git 检查失败/ }).isVisible(), true);
  await searchInput.fill("");
  await page.getByRole("region", { name: "存储库", exact: true }).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("dialog", { name: "存储库操作" }).waitFor();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /工作区检查/ }).click();
  const composer = page.getByRole("textbox", { name: "输入指令" });
  const imeText = `中文输入候选不会在组合期间误发送 ${"很长的中文内容".repeat(45)} C:/workspace/${"nested-directory/".repeat(30)}component.tsx`;
  await composer.fill(imeText);
  await composer.dispatchEvent("compositionstart", { data: "中文" });
  await page.keyboard.press("Control+Enter");
  assert.equal(await composer.inputValue(), imeText);
  assert.equal(await page.locator(".message.user .message-body", { hasText: "中文输入候选不会在组合期间误发送" }).count(), 0);
  await composer.dispatchEvent("compositionend", { data: imeText });
  await page.keyboard.press("Control+Enter");
  await page.getByText("中文输入候选不会在组合期间误发送", { exact: false }).waitFor();
  assert.equal(await noHorizontalOverflow(page), true, "long Chinese/path content overflowed");
  await page.evaluate(() => {
    const target = document.querySelector(".changes-empty p");
    if (target) target.textContent = `+ ${"const veryLongDiffLine = '兼容性验证'; ".repeat(40)}`;
  });
  assert.equal(await noHorizontalOverflow(page), true, "long diff fixture overflowed");

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.getByRole("button", { name: "打开代码面板", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "变更", exact: true }).isVisible(), true);
  await page.getByRole("tab", { name: "变更", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "预览", exact: true }).getAttribute("aria-selected"), "true");
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "关闭代码面板", exact: true }).click();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.keyboard.press("Control+Shift+KeyK");
  await page.waitForFunction((element) => element === document.activeElement, await searchInput.elementHandle());
  assert.equal(await page.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--safe-top", "12px");
    root.style.setProperty("--safe-right", "10px");
    root.style.setProperty("--safe-bottom", "16px");
    root.style.setProperty("--safe-left", "8px");
  });
  await page.waitForTimeout(100);
  assert.equal(await noHorizontalOverflow(page), true, "safe-area fixture overflowed");
  assert.ok(await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().top >= 12));
  await screenshot(page, "web-390-safe-area.png");
  await page.evaluate(() => ["--safe-top", "--safe-right", "--safe-bottom", "--safe-left"].forEach((name) => document.documentElement.style.removeProperty(name)));

  for (const [width, height, screenshotName] of [[360, 780, "web-harmony-360x780.png"], [432, 960, "web-harmony-432x960.png"]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(220);
    assert.equal(await noHorizontalOverflow(page), true, `${width}x${height} Harmony portrait baseline overflowed`);
    const composerLayout = await page.locator(".composer-area form").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const textarea = element.querySelector("textarea").getBoundingClientRect();
      return { left: rect.left, right: rect.right, inputWidth: textarea.width };
    });
    assert.ok(composerLayout.left >= 0 && composerLayout.right <= width + 1, `${width}px composer escaped the viewport`);
    assert.ok(composerLayout.inputWidth >= 100, `${width}px composer left only ${composerLayout.inputWidth}px for text`);
    await screenshot(page, screenshotName);
  }

  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole("button", { name: "变更", exact: true }).click();
  await page.waitForTimeout(220);
  const mobileDrawer = await page.locator(".right-panel").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  });
  assert.ok(mobileDrawer.left >= 0 && mobileDrawer.right <= 360.5 && mobileDrawer.width >= 320, `360px drawer geometry was ${JSON.stringify(mobileDrawer)}`);
  const closeNotice = page.getByRole("button", { name: "关闭通知", exact: true });
  if (await closeNotice.isVisible()) await closeNotice.click();
  await screenshot(page, "web-harmony-mobile-changes.png");
  await page.getByRole("button", { name: "关闭代码面板", exact: true }).click();
  await page.getByRole("button", { name: "代码", exact: true }).click();
  await page.waitForTimeout(220);
  assert.equal(await page.getByRole("tab", { name: "预览", exact: true }).getAttribute("aria-selected"), "true");
  await screenshot(page, "web-harmony-mobile-code.png");
  await page.getByRole("button", { name: "关闭代码面板", exact: true }).click();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.waitForTimeout(220);
  const workspaceDrawerWidth = await page.locator(".left-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(workspaceDrawerWidth <= 320 && workspaceDrawerWidth >= 280, `workspace drawer width was ${workspaceDrawerWidth}`);
  await screenshot(page, "web-harmony-mobile-workspace-drawer.png");
  await page.keyboard.press("Escape");

  await composer.focus();
  await composer.fill("软键盘缩放后输入仍然可见");
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.documentElement.classList.add("virtual-keyboard-open"));
  assert.equal(await composer.evaluate((element) => element === document.activeElement), true);
  assert.equal(await composer.inputValue(), "软键盘缩放后输入仍然可见");
  assert.ok(await page.locator(".composer-area").evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight + 1));
  assert.equal(await page.getByRole("navigation", { name: "手机主导航", exact: true }).isVisible(), false);
  await screenshot(page, "web-390-keyboard.png");
  await page.evaluate(() => document.documentElement.classList.remove("virtual-keyboard-open"));

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => matchMedia("(orientation: landscape) and (max-height: 500px)").matches), true);
  assert.equal(await page.getByRole("button", { name: "打开导航", exact: true }).isVisible(), true);
  await page.keyboard.press("Control+Shift+KeyK");
  await page.waitForFunction((element) => element === document.activeElement, await searchInput.elementHandle());
  await page.keyboard.press("Escape");
  assert.equal(await noHorizontalOverflow(page), true, "landscape layout overflowed");
  await screenshot(page, "web-844x390-landscape.png");

  for (const [width, height] of [[780, 360], [960, 432]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => matchMedia("(orientation: landscape) and (max-height: 500px)").matches), true);
    assert.equal(await page.getByRole("button", { name: "打开导航", exact: true }).isVisible(), true);
    assert.equal(await noHorizontalOverflow(page), true, `${width}x${height} Harmony landscape baseline overflowed`);
  }
  await screenshot(page, "web-harmony-960x432-landscape.png");

  await page.setViewportSize({ width: 720, height: 450 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("virtual-keyboard-open")), false, "200% zoom was mistaken for a keyboard");
  assert.equal(await noHorizontalOverflow(page), true, "200% zoom overflowed");
  await screenshot(page, "web-200-percent-zoom.png");
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await touchContext.newPage();
  const touchErrors = { page: [], console: [], request: [], response: [] };
  collectBrowserErrors(touchPage, touchErrors);
  await touchPage.goto(baseUrl);
  await touchPage.getByRole("button", { name: "打开导航", exact: true }).tap();
  assert.equal(await touchPage.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
  const touchSize = await touchPage.getByRole("button", { name: "新建对话", exact: true }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(touchSize.width >= 44 && touchSize.height >= 44, `touch target was ${touchSize.width}x${touchSize.height}`);
  await touchPage.keyboard.press("Escape");
  await touchPage.getByRole("button", { name: "变更", exact: true }).tap();
  assert.equal(await touchPage.getByRole("tab", { name: "变更", exact: true }).isVisible(), true);
  await touchPage.getByRole("button", { name: "关闭代码面板", exact: true }).tap();
  assert.deepEqual(touchErrors.page, []);
  assert.deepEqual(touchErrors.console, []);
  assert.deepEqual(touchErrors.request, []);
  assert.deepEqual(touchErrors.response, []);
  await touchContext.close();

  assert.deepEqual(errors.page, []);
  assert.deepEqual(errors.console, []);
  assert.deepEqual(errors.request, []);
  assert.deepEqual(errors.response, []);
  console.log(`PASS: fixture replay; PC/mobile at 1440/1100/768/390; Harmony phone ratio baseline at 360x780, 432x960, 780x360, 844x390 and 960x432; safe-area fallback; virtual-keyboard resizing; touch targets; IME composition guard; long Chinese/path/diff overflow; 200% zoom; no browser errors. UA: ${await page.evaluate(() => navigator.userAgent)}`);
  await context.close();
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
