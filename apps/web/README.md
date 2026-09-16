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
- PC/手机使用同一 fixture 数据但采用不同布局：1440px 三栏，1100px Inspector Drawer，768/390px 与矮横屏为单栏双 Drawer。
- viewport 支持安全区回退、VisualViewport 软键盘高度、横竖屏、粗指针触摸目标、200% zoom 与长中文/路径溢出。
- 手机端使用单栏工作区、固定 Composer 与五项 Bottom Navigation；Workspace 使用左侧 Drawer，Code / Changes 使用全屏移动面板。键盘打开时底部导航自动让位。
- 中文输入法 composition 期间不会由 Ctrl/Command + Enter 误发送。

尚未接真实 HTTP/SSE、完整 RunSnapshot、ApprovalRequest 和 Artifact API；这里的重连是固定事件恢复演示。不要将演示通过表述为后端端到端验收。

HarmonyOS 7 / API 26.0.0 真机或模拟器尚未执行，当前状态为 **Pending**；桌面 Chrome 通过不能表述为“已兼容”。设备验收字段和必测路径见 `verification/HARMONY_API26_CHECKLIST.md`。
