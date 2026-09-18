# 第一版浏览器验证
日期：2026-09-12。验证环境为本地，未部署。

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

## 桌面视觉集成（2026-09-16）

PR #35 Live Adapter 已在集成基线中；未改动 `live-*`、共享契约、后端或 Harmony 范围。

- 手工迁移三栏工作台的视觉价值，未 cherry-pick 旧视觉分支；图标统一为 `lucide-react@1.46.0`，不保留手写 SVG 图标组件。
- 删除普通界面的 Cookie 展示提示、升级与 `Web Product Owner` 模板残留，并移除面向用户的 Fixture 工程文案；fixture 仍仅用于受测的回放数据层。
- 收敛中心区：助手消息采用留白层级，工具与结果默认使用分隔线，仅审批保留有边界的决策面板。
- Chrome headless 浏览器检查通过：1440/1280 为 248px 左栏 + 384px 右栏；1100 为 220px + 360px 三栏；1099 起右栏为 Drawer；768/390 无横向溢出。检查同时覆盖键盘 Drawer/Tab、五类 PublicRunEvent 回放、HTML 文本转义与无页面/控制台/资源错误。
- 桌面左右栏可独立折叠到 56px；折叠右栏时中间工作区同步扩宽，重新展开后恢复原宽度。左栏项目内对话保持独立滚动。
- 中间 AI 输出、事件列表与左栏项目列表采用更紧凑的行距和垂直间距。
- `npm test` 27/27、`npm run build`、`npm audit`（0 vulnerabilities）通过。构建中 Vite 对 `lucide-react` 的 `use client` 指令给出已忽略提示，不影响产物或浏览器检查。

## HarmonyOS API 26 overlay（本地浏览器验证，2026-09-17）

- 在当前桌面视觉基线上验证 `viewport-fit=cover`、`interactive-widget=resizes-content`、VisualViewport/fallback 标记、模拟安全区与键盘高度处理；安全区与 `--workspace-gap` 组合，不改变 1100px 三栏 / 1099px Drawer 分界或左栏独立滚动。
- Chrome headless 覆盖 390/360/432 纵向、844×390 矮横屏 Drawer、模拟安全区、composition 中 Ctrl+Enter 不提交、compositionend 后提交、coarse-touch 44px 控件、CDP 200% page scale（不误判为软键盘）和全程无横向溢出。
- `npm test` 31/31（含 `viewport.ts` 四项纯函数测试）及 `npm run build` 通过；浏览器检查同时保留 PublicRunEvent 回放、审批、键盘与桌面断点验收。
- 新生成截图：`web-harmony-safe-area.png`、`web-harmony-virtual-keyboard.png`、`web-harmony-landscape.png`、`web-harmony-200-percent-zoom.png`。这些仅为本地 Chrome 证据，不是 HarmonyOS 真机或模拟器截图。

## 未完成的目标设备验收

HarmonyOS 7 / API 26 真实设备或官方模拟器尚无本次证据，状态为 Pending。待目标环境核验真实 IME 候选词、原生安全区、旋转恢复、触控滚动和人工 200% 缩放后，才可更新为设备验收通过。

## 最新 main 集成复验（2026-09-21）

- PR #37 已基于当时最新 `main`（`b9b07b7`）解决冲突，保留 PR #38 的 Web→Server 同源 `/api` 真实模式、fixture replay、提交锁与恢复状态机。
- Web tests：34/34；production build 与根 `npm run check` 通过。
- Edge headless fixture 验收通过：1440/1100/1099/768/390、桌面三栏与窄屏 Drawer、左右栏折叠、键盘路径、IME composition、安全区、触摸目标、矮横屏和 200% page scale 均无页面级横向溢出或浏览器错误。
- 无密钥 fake model 的真实 SQLite + Server + Edge 验收通过：用户提交仅产生一次 `POST /api/turns`，SSE 到达 terminal；刷新通过 `GET /resume` 恢复且不新增 POST；未知提交锁、过期 Run 恢复及 private marker 不回显均通过。
- 当前目录的四档桌面/手机截图与 Harmony 模拟场景截图均由本次集成代码重新生成；截图不包含真实凭证。
- 未使用真实 API Key，未调用付费模型。
- HarmonyOS 7 / API 26 真机或官方模拟器仍为 **待验收**；桌面 Edge 的设备模拟与响应式结果不能写成 HarmonyOS 已通过。
