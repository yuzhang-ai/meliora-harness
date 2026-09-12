# Meliora Web Shell 深色三栏版

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
- 选择文件夹只保存文件夹名称，不保留句柄、不读取内容、不上传文件。
- BoardUI 仅依照可见信息架构参考；未复制商业模板源码。

尚未接真实 HTTP/SSE、完整 RunSnapshot、ApprovalRequest 和 Artifact API；这里的重连是固定事件恢复演示。不要将演示通过表述为后端端到端验收。
