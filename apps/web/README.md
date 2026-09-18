# Meliora Web Shell 三栏版

React 三栏工作台。默认是公开事件 fixture 预览；手动切换「真实运行」后，页面会向本地 Server 发起只读 Turn、订阅 SSE，并在刷新时从 public resume snapshot 恢复。右栏 Diff、审批、附件和语音仍未接入，不可当作已执行能力。

## 启动
在仓库根目录 PowerShell 执行：
```powershell
cd apps/web
npm.cmd ci
npm.cmd run dev
```
打开终端输出的本地地址。构建：npm.cmd run build；测试：npm.cmd test。

## 本版
- 五组共享 fixtures：正常、审批、失败、取消、重连。
- 三组前端补充示例：未过期 approval、blocked、context_compacted，只复用既有公共事件类型，不修改共享契约。
- 左侧用户、搜索、快捷操作、项目/二级对话树、主题与团队信息。
- 中间面包屑、用户/AI 消息、计划、工具、验证、Outcome 与多控件输入区。
- 右侧 Changes/Preview 标签、无 Diff 空态和通知卡；没有真实 Diff 时不显示示例文件或虚构统计。
- 逐事件/自动回放、侧栏折叠、项目与对话创建、主题切换、中文多行输入。
- 预览模式刷新恢复本地演示项目、对话与进度；真实模式刷新只读取 `/resume`，不重新 POST。
- 新建对话和零事件状态分别展示真实 empty/loading 反馈，不沿用固定完成内容。
- 同时保留过期审批只读态与未过期审批交互态；所有按钮都明确为前端演示，不会产生真实授权。
- 首期默认使用浅色主题，也可在界面中切换深色主题。
- 纯浏览器界面不申请工作区目录 capability；真实模式只发送服务端预先配置的 workspace ID，不发送本地路径。
- BoardUI 仅依照可见信息架构参考；未复制商业模板源码。

预览模式的「重连」是固定事件演示；真实模式从服务端公开事件恢复。尚未接有效 ApprovalRequest/Artifact API，不得将预览通过表述为后端端到端验收。

## WP-4B 本地真实链路

先在可信本地 PowerShell 会话中设置 `MELIORA_WORKSPACE_ID`、`MELIORA_WORKSPACE_ROOT`（已存在的工作区目录）、`MELIORA_DATABASE_PATH`（工作区外的绝对路径）、`MELIORA_PROVIDER`（`deepseek` 或 `kimi`）、`MELIORA_MODEL` 和 `MELIORA_API_KEY`，然后从仓库根目录运行 `npm.cmd --prefix apps/server run dev`。密钥只进入本机 Server 进程环境；不要提交到仓库、输入网页或复制进截图。Server 固定监听 `127.0.0.1:8787`；Vite 开发服务器将同源 `/api` 代理过去。网页「工作区 ID」填写服务端配置的同一 ID，再切换真实运行并发送。

若使用经操作者确认的 OpenAI-compatible HTTPS 网关，在同一 Server 进程环境里**同时**设置 `MELIORA_GATEWAY_BASE_URL`（如 `https://gateway.example/v1`）和 `MELIORA_TRUSTED_PROVIDER_ORIGIN`（如 `https://gateway.example`）。两者 origin 必须完全相同；只接受无凭证、查询串、fragment 的 HTTPS base URL，并由 Server 拼接 `/chat/completions`。只设置其中一项会启动失败。网关配置不得来自浏览器、用户消息或模型输出；网关验收不能写成官方直连验收。
可选 `MELIORA_MAX_OUTPUT_TOKENS` 为每次 Provider 请求设置正整数输出上限，供小样本付费验收控制成本；它是 Server-only 配置，不接受浏览器覆盖。

新 Turn 才调用 `POST /api/turns`；刷新先 GET `/resume`，普通断线从公开 cursor 续 SSE，只有 `event_cursor_conflict` 才退到 public resume snapshot。浏览器仅保存 workspace/run ID 或待确认的幂等键，不保存密钥、输入原文或私有 Provider 内容。提交响应丢失且没有 run ID 时，页面保留提交锁，刷新也不会自动重发；须先人工核查服务端状态，才能明确解除锁。已知 Run 恢复失败时可手动「忘记此 Run」再开始新任务，不会自动删掉恢复记录。生产部署尚无反向代理/认证装配，不能将本地 API 监听到公网。

真实模式模型由 Server 环境配置，网页的预览模型选择器不构成 Provider 切换。真实审批事件只读展示，不生成授权。无密钥的 `tests/live-server.test.ts` 使用真实 SQLite + Server + fake model 验证 POST/SSE/刷新 GET；它不能代替 WP-5 的真实 DeepSeek/Kimi canary。

`apps/web` 的锁文件固定了 Playwright；安装 Chromium 后可运行 `npm.cmd --prefix apps/web run verify:live-browser`。独立 GitHub CI job 会安装 Chromium 并执行同一脚本。脚本在临时 Git 工作区启动真实 SQLite/Server 和无密钥 model fixture，通过浏览器验收 1440/1100/768/390px、一次 POST、SSE 终态、刷新 GET-only、未知提交保护、过期 Run 手动恢复和私有内容不回显。`PLAYWRIGHT_MODULE` 可指定本机已安装模块路径，`BROWSER_CHANNEL=msedge` 可改用 Edge。临时数据库位于系统临时目录，验证结束后删除。

## HarmonyOS API 26 Web compatibility overlay（本地浏览器验证）

- viewport meta 声明 `viewport-fit=cover` 与 `interactive-widget=resizes-content`；页面通过 `VisualViewport`（不可用时回退 layout viewport）设置应用高度和键盘 inset，避免把 200% 页面缩放当作软键盘。
- 安全区 inset 与桌面工作区间距叠加；1100px 三栏/1099px Inspector Drawer 的边界不变。触控单栏保障主要控件至少 44px；矮横屏（最大高度 500px）使用单栏导航 Drawer。
- 自动验收覆盖 viewport meta、fallback 标志、模拟安全区、composition 期间不提交、390/360/432 纵向、844×390 横屏、CDP 200% page scale 及 coarse-touch 抽屉。它不是 HarmonyOS 真机或模拟器结论。

HarmonyOS 7 / API 26 真机或官方模拟器仍为 **待验收**；设备型号、Web runtime 版本、真实 IME 候选词、刘海安全区和旋转后的恢复行为需要在目标环境单独留证。
