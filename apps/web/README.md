# Meliora Web Shell 三栏版

只使用公开事件 fixture 的 React 三栏工作台。修改范围限于 apps/web；不包含真实模型调用、数据库接入、文件写入或有效审批。

## 启动
在仓库根目录 PowerShell 执行：
```powershell
$env:Path = "H:\harness\.local-tools\node-v22.14.0-win-x64;" + $env:Path
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
- 刷新恢复本地演示项目、对话与进度；不发送 Run 或 Provider 请求。
- 新建对话和零事件状态分别展示真实 empty/loading 反馈，不沿用固定完成内容。
- 同时保留过期审批只读态与未过期审批交互态；所有按钮都明确为前端演示，不会产生真实授权。
- 首期默认使用浅色主题，也可在界面中切换深色主题。
- 纯浏览器界面不申请工作区目录 capability；工作区选择等待 Runtime/Server 能力接入。
- BoardUI 仅依照可见信息架构参考；未复制商业模板源码。

尚未接真实 HTTP/SSE、完整 RunSnapshot、ApprovalRequest 和 Artifact API；这里的重连是固定事件恢复演示。不要将演示通过表述为后端端到端验收。

## WP-4A Live Adapter（尚未接入页面）

`src/live-adapter.ts` 与 `src/live-state.ts` 提供独立的 POST、SSE、public resume snapshot adapter 和纯状态机。新 Turn 才调用 `POST /api/turns`；刷新先读取 `/resume`，普通断线从当前公开 cursor 续 SSE，只有 `event_cursor_conflict` 才回退到 public resume snapshot。刷新和重连路径没有 POST。现有 fixture replay 继续作为页面默认数据源，本切片不改变视觉页面。

## HarmonyOS API 26 Web compatibility overlay（本地浏览器验证）

- viewport meta 声明 `viewport-fit=cover` 与 `interactive-widget=resizes-content`；页面通过 `VisualViewport`（不可用时回退 layout viewport）设置应用高度和键盘 inset，避免把 200% 页面缩放当作软键盘。
- 安全区 inset 与桌面工作区间距叠加；1100px 三栏/1099px Inspector Drawer 的边界不变。触控单栏保障主要控件至少 44px；矮横屏（最大高度 500px）使用单栏导航 Drawer。
- 自动验收覆盖 viewport meta、fallback 标志、模拟安全区、composition 期间不提交、390/360/432 纵向、844×390 横屏、CDP 200% page scale 及 coarse-touch 抽屉。它不是 HarmonyOS 真机或模拟器结论。

HarmonyOS 7 / API 26 真机或官方模拟器仍为 Pending；设备型号、Web runtime 版本、真实 IME 候选词、刘海安全区和旋转后的恢复行为需要在目标环境单独留证。
