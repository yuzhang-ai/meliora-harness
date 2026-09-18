const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("meliora-browser-check-reset") === "pending") {
      sessionStorage.removeItem("meliora-project-library-v2");
      sessionStorage.removeItem("meliora-browser-check-reset");
    }
  });
  async function resetPreviewLibrary() {
    await page.evaluate(() => {
      sessionStorage.setItem("meliora-browser-check-reset", "pending");
      location.reload();
    });
    await page.waitForLoadState("domcontentloaded");
  }
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const failedResponses = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "unknown error"}`));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.match(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
    /viewport-fit=cover,interactive-widget=resizes-content/
  );
  assert.ok(["available", "fallback"].includes(await page.evaluate(() => document.documentElement.dataset.visualViewport)));
  assert.ok(["available", "fallback"].includes(await page.evaluate(() => document.documentElement.dataset.dynamicViewport)));
  const responsiveConditions = await page.evaluate(() => Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => "conditionText" in rule)
    .map((rule) => rule.conditionText));
  assert.ok(responsiveConditions.includes("(width < 1100px)"), `missing gap-free desktop breakpoint: ${responsiveConditions.join(", ")}`);

  for (const width of [1440, 1280, 1100, 1099, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => matchMedia("(width < 1100px)").matches), width < 1100);
    if (width === 1100) {
      assert.equal(await page.getByRole("button", { name: "打开代码面板", exact: true }).isVisible(), false);
      assert.equal(await page.locator(".left-panel").evaluate((element) => element.getBoundingClientRect().width), 220);
      assert.equal(await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().width), 360);
    }
    if (width === 1099) {
      assert.equal(await page.getByRole("button", { name: "打开代码面板", exact: true }).isVisible(), true);
      assert.ok(await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().left >= innerWidth));
    }
    if ([1440, 1100, 768, 390].includes(width)) {
      await page.screenshot({ path: path.join(__dirname, `web-${width}.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(320);
  const leftWidth = await page.locator(".left-panel").evaluate((element) => element.getBoundingClientRect().width);
  const rightWidth = await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.equal(leftWidth, 248);
  assert.equal(rightWidth, 384);
  const centerBefore = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await page.waitForTimeout(320);
  const centerAfter = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(centerAfter > centerBefore + 150);
  await page.getByRole("button", { name: "新建对话", exact: true }).waitFor();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await page.waitForTimeout(320);
  const centerBeforeRightCollapse = await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "收起右栏", exact: true }).click();
  await page.waitForTimeout(320);
  assert.equal(await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().width), 56);
  assert.ok(await page.locator(".center-panel").evaluate((element) => element.getBoundingClientRect().width) > centerBeforeRightCollapse + 250);
  await page.getByRole("button", { name: "展开右栏", exact: true }).click();
  await page.waitForTimeout(320);
  assert.equal(await page.locator(".right-panel").evaluate((element) => element.getBoundingClientRect().width), 384);
  await page.getByRole("button", { name: "右键或点击添加项目", exact: true }).click();
  await page.getByRole("heading", { name: "添加项目", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /选择文件夹/ }).count(), 0);
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();

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
  await page.getByRole("button", { name: "新建对话", exact: true }).click();
  await page.getByRole("heading", { name: "开始一个新任务", exact: true }).waitFor();
  await resetPreviewLibrary();
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
  await page.getByRole("button", { name: /待处理审批演示/ }).click();
  await page.locator('[data-event="approval_requested"]').waitFor();
  assert.equal(await page.getByRole("button", { name: "允许本次", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "允许本次", exact: true }).click();
  await page.getByText("已记录允许选择，当前预览不会执行修改。", { exact: true }).waitFor();

  await resetPreviewLibrary();
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
  await page.getByRole("button", { name: /待处理审批演示/ }).click();
  await page.locator('[data-event="approval_requested"]').waitFor();
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await page.getByText("已记录拒绝选择，当前预览不会执行修改。", { exact: true }).waitFor();

  assert.equal(await page.getByText("暂无文件变更", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("+156", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "新建对话", exact: true }).click();
  await page.getByRole("heading", { name: "开始一个新任务", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "任务执行概览", exact: true }).count(), 0);
  await page.getByRole("button", { name: "重新回放", exact: true }).click();
  await page.getByText("正在回放本地预览状态。", { exact: true }).waitFor();
  await page.locator(".timeline-loading").waitFor();

  const applicationUrl = page.url();
  const searchInput = page.getByRole("textbox", { name: "搜索项目和对话" });
  await page.keyboard.press("Control+Shift+KeyK");
  assert.equal(page.url(), applicationUrl);
  await page.waitForFunction((element) => element === document.activeElement, await searchInput.elementHandle());
  assert.equal(await searchInput.evaluate((element) => element === document.activeElement), true);
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
  await page.keyboard.press("Control+Shift+KeyK");
  await page.waitForFunction((element) => element === document.activeElement, await searchInput.elementHandle());
  assert.equal(await searchInput.evaluate((element) => element === document.activeElement), true);
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

  await resetPreviewLibrary();
  await page.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--safe-top", "12px");
    root.style.setProperty("--safe-right", "8px");
    root.style.setProperty("--safe-bottom", "16px");
    root.style.setProperty("--safe-left", "8px");
  });
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.ok(await page.locator(".center-panel").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 19 && rect.top <= 21 && rect.right <= innerWidth - 15 && rect.bottom <= innerHeight - 23;
  }));
  await page.screenshot({ path: path.join(__dirname, "web-harmony-safe-area.png"), fullPage: true });
  await page.evaluate(() => {
    const root = document.documentElement;
    for (const name of ["--safe-top", "--safe-right", "--safe-bottom", "--safe-left"]) root.style.removeProperty(name);
  });

  const composer = page.getByRole("textbox", { name: "输入指令" });
  await composer.focus();
  await composer.fill("输入法候选词");
  await composer.dispatchEvent("compositionstart", { data: "中" });
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(40);
  assert.equal(await page.locator(".message.user").filter({ hasText: "输入法候选词" }).count(), 0);
  await composer.dispatchEvent("compositionend", { data: "中" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  assert.equal(await composer.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Control+Enter");
  await page.locator(".message.user").filter({ hasText: "输入法候选词" }).waitFor();
  await composer.focus();
  await composer.fill("保留键盘可见输入");
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(120);
  assert.equal(await composer.evaluate((element) => element === document.activeElement), true);
  assert.equal(await composer.inputValue(), "保留键盘可见输入");
  assert.ok(await page.locator(".composer-area").evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight));
  await page.screenshot({ path: path.join(__dirname, "web-harmony-virtual-keyboard.png"), fullPage: true });

  for (const [width, height] of [[360, 780], [432, 960]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const composerWidth = await composer.evaluate((element) => element.getBoundingClientRect().width);
    assert.ok(composerWidth >= 100, `composer width at ${width}x${height}: ${composerWidth}`);
  }

  for (const [width, height] of [[844, 390], [780, 360], [960, 432]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => matchMedia("(orientation: landscape) and (max-height: 500px)").matches), true);
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
    await page.keyboard.press("Escape");
  }
  await page.screenshot({ path: path.join(__dirname, "web-harmony-landscape.png"), fullPage: true });

  await page.setViewportSize({ width: 720, height: 450 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await page.waitForTimeout(180);
  assert.equal(await page.locator("html").evaluate((element) => element.classList.contains("virtual-keyboard-open")), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(__dirname, "web-harmony-200-percent-zoom.png"), fullPage: true });
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await cdp.detach();

  for (const [width, height] of [[390, 844], [844, 390]]) {
    const touchContext = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const touchPage = await touchContext.newPage();
    const touchErrors = [];
    const touchConsoleErrors = [];
    const touchFailedRequests = [];
    const touchFailedResponses = [];
    touchPage.on("pageerror", (error) => touchErrors.push(error.message));
    touchPage.on("console", (message) => { if (message.type() === "error") touchConsoleErrors.push(message.text()); });
    touchPage.on("requestfailed", (request) => touchFailedRequests.push(`${request.method()} ${request.url()}`));
    touchPage.on("response", (response) => { if (response.status() >= 400) touchFailedResponses.push(`${response.status()} ${response.url()}`); });
    await touchPage.goto("http://127.0.0.1:5173");
    await touchPage.getByRole("heading", { name: "任务执行概览", exact: true }).waitFor();
    for (const label of ["打开导航", "打开代码面板"]) {
      assert.ok(await touchPage.getByRole("button", { name: label, exact: true }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }), `${label} must be at least 44×44 at ${width}x${height}`);
    }
    await touchPage.getByRole("button", { name: "打开导航", exact: true }).tap();
    assert.equal(await touchPage.getByRole("region", { name: "存储库", exact: true }).isVisible(), true);
    await touchPage.keyboard.press("Escape");
    await touchPage.getByRole("button", { name: "打开代码面板", exact: true }).tap();
    assert.equal(await touchPage.getByRole("tab", { name: "预览", exact: true }).isVisible(), true);
    assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(touchErrors, []);
    assert.deepEqual(touchConsoleErrors, []);
    assert.deepEqual(touchFailedRequests, []);
    assert.deepEqual(touchFailedResponses, []);
    await touchContext.close();
  }

  await page.getByRole("button", { name: "打开代码面板", exact: true }).click();
  await page.getByRole("tab", { name: "变更", exact: true }).click();
  const probesInserted = await page.evaluate(() => {
    const stream = document.querySelector(".message-stream");
    const diffHost = document.querySelector(".changes-empty");
    if (!stream || !diffHost) return false;
    const probe = document.createElement("div");
    probe.id = "browser-check-long-content";
    probe.textContent = `长中文${"说明".repeat(500)} /workspace/${"without-separators".repeat(80)}.ts`;
    probe.style.cssText = "overflow-wrap:anywhere;word-break:break-word;padding:12px";
    stream.append(probe);
    const diff = document.createElement("pre");
    diff.id = "browser-check-long-diff";
    diff.textContent = `+ ${"very-long-unbroken-diff-token".repeat(160)}`;
    diff.style.cssText = "max-width:100%;overflow:auto;white-space:pre";
    diffHost.append(diff);
    return Boolean(document.querySelector("#browser-check-long-content") && document.querySelector("#browser-check-long-diff"));
  });
  assert.equal(probesInserted, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => document.querySelectorAll("#browser-check-long-content,#browser-check-long-diff").forEach((element) => element.remove()));

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(failedResponses, []);
  console.log("PASS: five required PublicRunEvent replays, empty/loading/no-diff states, expired/live approvals, six responsive widths, independent desktop left/right collapse, parsed gap-free width < 1100px breakpoint with 1440/1280 248/384px and 1100 220/360px inline assertions plus 1099 drawer assertion, atomic browser reset, rAF-settled Chrome-safe Ctrl/Command+Shift+K search focus, light default, no browser directory picker, transition-settled screenshots, keyboard drawers/tabs, escaped input, viewport-fit/interactive-widget, VisualViewport fallback, IME composition, safe-area, coarse touch, compact landscape, and 200% page-scale checks; no page, console, request, or HTTP resource errors.");
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
