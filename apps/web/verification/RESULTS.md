# 第一版浏览器验证
日期：2026-09-12。Base：9a212541。验证环境为本地，未部署。

## 已执行
- npm test：11 项项目状态与回放测试通过；Windows 使用显式测试文件路径，不依赖 shell glob 展开。
- npm run build：TypeScript + Vite 7.3.6 构建通过。
- npm audit：0 漏洞。
- Chrome headless：八个场景，1440/1100/1099/1024/768/390 宽度无横向溢出。
- 新建对话 empty、零事件 loading、无 Diff 空态、过期审批只读态和未过期审批交互态通过。
- 重连从序号4恢复，重复恢复仍仅3个后续事件；刷新保持位置。
- 多行中文输入、HTML文本转义、Ctrl/⌘+Enter、Ctrl/⌘+Shift+K 站内搜索、Shift+F10、方向键标签切换、Escape关闭和手机导航通过；桌面与 768px 搜索断言均等待异步焦点稳定。
- 页面无未处理 JavaScript 异常、console error、失败请求或 4xx/5xx 资源响应。
- 等待布局 transition 后生成并目视检查 web-1440.png、web-1100.png、web-768.png 与 web-390.png。
- 根 `npm run check` 已包含 Web 的 `npm ci`、test 和 build。

## 复跑浏览器
先 npm run dev -- --port 5173 --strictPort。需要本机 Chrome 与 Playwright。
验证脚本：browser-check.cjs；可通过 PLAYWRIGHT_MODULE 指定现有 Playwright 模块路径，然后 node verification/browser-check.cjs。

## 限制
真实中文输入法候选词选择、人工200%缩放、真实HTTP/SSE与审批不在本次自动验证范围。
只读fixture的计划没有后续completed计划事件，因此保留历史“进行中”，不凭最终文字改写计划。
无Diff/文件/终端/浏览器正文时显示空态；正式服务对接仍需后续开发。
截图含固定示例数据，不含真实工作区内容或凭证。



## 三栏界面调整（2026-09-13）
已实际查看 https://www.boardui.com/templates/ai-chat 的可见页面，自主实现浅色优先的三栏面板、树状导航、消息卡片与蓝色操作按钮；未复制模板源码。
新增会话搜索、桌面侧栏收起/展开、empty/loading/no-diff 以及未过期审批演示。共享 fixtures 和演示边界保持。
验证：build、11 项 tests 通过；浏览器检查搜索/清空、侧栏收起/展开、两类审批、平板与手机抽屉；390/768/1024/1099/1100/1440 均无页面横向溢出。目视检查桌面和手机布局。
本目录PNG为第一版截图，最新外观以本地运行页面为准。

最新验证：
- 默认浅色主题；1440px 下三栏为 220px / 860px / 360px，右栏符合 360–560px 规范。
- 折叠左栏后为 56px / 1024px / 360px，中栏平滑扩展。
- 768px 与 390px 下为单栏布局，导航与代码面板可分别通过键盘打开和关闭。
- 浏览器验收从已解析 CSSOM 断言 `width < 1100px` 连续范围，并分别验证 1100px 桌面三栏与 1099px 抽屉，因此旧的 `max-width: 1099px` 空档实现会回归失败。
- 项目树、二级对话、搜索、New Agent、主题、模型、语音开关与右侧标签可操作。
- 最新构建通过；11 项单元/回放测试通过；npm audit 为 0 漏洞；浏览器无页面异常、console error、失败请求或错误资源响应。
- 当前 fixtures 不含 Diff，右栏展示明确空态，不显示示例文件或虚构增删统计。
- 项目入口只创建前端演示项目，不调用 `showDirectoryPicker()`；工作区选择等待 Runtime/Server 提供 capability。

## Issue #28：PC / 手机与 HarmonyOS API 26 兼容基线（2026-09-15）

工作树：`H:\harness-issue28`

分支：`feat/web-harmony-api26-baseline`

指定 Base / 当前未提交 HEAD：`5bbc65dcbf0fe85511762a42f466aba6a5d11713`

### 自动验收结果

- `npm.cmd test`：15/15 通过；新增 VisualViewport 缺失回退、覆盖式软键盘、顶部偏移与缩放误判测试。
- `npm.cmd run build`：TypeScript 与 Vite production build 通过。
- `npm.cmd run check:web`：通过。
- Desktop Chrome fixture acceptance：通过。
- 实际 UA：`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36`。
- 页面仍只读取固定 `PublicRunEvent` fixtures；没有 Server/SSE 请求，也未修改共享 contracts。

覆盖项：

- 1440px PC 三栏；1100px Inspector Drawer；768px、390px单栏双 Drawer。
- 390×844 竖屏与 844×390 矮横屏；横屏快捷键可打开 Workspace Drawer。
- 鸿蒙手机比例浏览器基线新增 360×780、432×960 竖屏与 960×432 横屏；窄屏 Composer、全高双 Drawer 和短横屏内容均无页面级横向溢出。
- 手机信息架构重新组织为单栏 Agent 工作区、固定 Composer、五项 Bottom Navigation、80% Workspace Drawer 与全屏 Code / Changes 面板；键盘状态下 Bottom Navigation 隐藏。
- `viewport-fit=cover`、四向 `safe-area-inset` 0 回退及注入安全区 fixture。
- `VisualViewport` 能力检测、`100dvh/100vh` 回退与 390×520 软键盘缩放；Composer 保持可见、焦点与输入不丢失。
- `compositionstart` / `compositionend` 中文 IME guard；组合期间 Ctrl+Enter 不发送，结束后正常发送。
- 粗指针触摸 context，主要操作目标至少 44×44px，关键消息操作不依赖 hover。
- 长中文、无分隔路径和长 diff fixture 不产生页面级横向滚动。
- CDP 200% page scale 下不把缩放误判为软键盘，页面无横向溢出。
- 五类 fixture replay、empty/loading/no-Diff、过期与未过期审批、键盘 Drawer/Tab 路径和浏览器错误捕获继续通过。

截图证据：

- `web-1440.png`、`web-1100.png`、`web-768.png`、`web-390.png`
- `web-390-safe-area.png`、`web-390-keyboard.png`
- `web-844x390-landscape.png`、`web-200-percent-zoom.png`
- `web-harmony-360x780.png`、`web-harmony-432x960.png`、`web-harmony-960x432-landscape.png`
- `web-harmony-mobile-workspace-drawer.png`、`web-harmony-mobile-code.png`、`web-harmony-mobile-changes.png`

### HarmonyOS 设备状态

**Pending — 尚未在 HarmonyOS 7 / API 26.0.0 系统浏览器或 ArkWeb 真机/模拟器执行。**

桌面 Chrome 自动验收不能证明 HarmonyOS API 26 已兼容。设备型号、系统/API 版本、实际 UA、提交 SHA、结果与截图/录屏链接必须在设备执行后填写到 `HARMONY_API26_CHECKLIST.md`。
