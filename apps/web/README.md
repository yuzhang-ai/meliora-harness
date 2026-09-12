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
- 两组前端补充示例：blocked、context_compacted，沿用既有类型，待共享契约 Owner 审查。
- 左侧用户、搜索、快捷操作、项目/二级对话树、主题与团队信息。
- 中间面包屑、用户/AI 消息、计划、工具、验证、Outcome 与多控件输入区。
- 右侧变更统计、路径、只读语法高亮代码、预览标签和通知卡。
- 逐事件/自动回放、侧栏折叠、项目与对话创建、主题切换、中文多行输入。
- 刷新恢复本地演示项目、对话与进度；不发送 Run 或 Provider 请求。
- 审批按钮明确为演示：缺少真实 Diff/参数且历史请求已过期，点击不会产生授权。
- 示例变更和代码只用于视觉验收，明确不代表真实文件写入。
- 选择文件夹只保存文件夹名称，不保留句柄、不读取内容、不上传文件。
- BoardUI 仅依照可见信息架构参考；未复制商业模板源码。

尚未接真实 HTTP/SSE、完整 RunSnapshot、ApprovalRequest 和 Artifact API；这里的重连是固定事件恢复演示。不要将演示通过表述为后端端到端验收。
