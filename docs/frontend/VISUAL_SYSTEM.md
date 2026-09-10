# 前端视觉与交互规范

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：Meliora Web 的视觉语言、布局、组件状态、交互和浏览器验收
> 维护者：张子恒（建议初始 Owner）
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[意图与输出层](../architecture/INTENT_AND_OUTPUT.md)、[持久化与事件](../architecture/PERSISTENCE_AND_EVENTS.md)
> 视觉参考：[BoardUI AI Chat](https://www.boardui.com/templates/ai-chat)
> 不负责：Agent 状态机、Provider、工具执行和数据库
> 更新触发：页面结构、设计 token、核心组件或交互状态变化

## 1. Design Read

Reading this as: 面向国内开发者的本地 Coding Agent 产品界面，采用冷静、轻量、高信息密度的专业语言，以 BoardUI 三栏工作台为结构参考，以可观察的 Agent 状态和安全操作为核心。

```text
DESIGN_VARIANCE: 4
MOTION_INTENSITY: 3
VISUAL_DENSITY: 7
```

这是产品工作台，不是营销落地页。前端设计 Skill 中适合 Landing Page 的 Hero、滚动叙事和摄影规则不应用到工作台；保留其单一设计系统、克制动效、状态完整、对比度、形状一致和 reduced motion 等通用约束。

## 2. BoardUI 的采用边界

参考页面已确认具备：左侧工作区与任务导航、中间 Agent 对话、右侧 Changes/Browser 面板、底部输入与分支/项目/模式状态、可调整面板、浅色高密度布局。

直接借鉴：

- 三栏信息架构和可折叠侧栏；
- 对话居中，工具过程嵌入时间线；
- Changes 与 Browser 作为右侧上下文面板；
- Composer 与 workspace/model/mode 同屏；
- 浅层边框、弱阴影、紧凑层级。

必须重做：

- 中文排版与中英文混排；
- Provider、Context、Skill 和权限状态；
- Tool Call、Approval、Receipt、Verification 的真实生命周期；
- 断流、恢复、取消、阻塞和失败状态；
- 路径、命令、diff 和敏感内容的安全展示；
- 窄屏降级和键盘操作。

在复制任何 BoardUI 源码前，必须确认模板授权、Pro 购买范围和依赖许可证。视觉参考不等于获得源码复制权。

## 3. 页面结构

```text
┌──────────────┬────────────────────────────┬────────────────────┐
│ Workspace    │ Conversation / Run         │ Inspector          │
│ Sessions     │ Messages                   │ Changes            │
│ Skills       │ Plan / Tool / Approval     │ Files / Browser    │
│ Settings     │ Composer + Run controls    │ Terminal / Receipt │
└──────────────┴────────────────────────────┴────────────────────┘
```

- 左栏 220-280px，可折叠为 56px 图标栏。
- 中栏最小 520px，占用剩余主空间。
- 右栏 360-560px，可拖动、折叠，默认显示 Changes。
- 总宽不足 1100px 时，右栏改为覆盖式 Drawer。
- 小于 768px 时单栏，导航和 Inspector 分别进入 Drawer，Composer 固定底部但不得遮挡内容。
- 不把所有内容包成 Card。三栏、消息和文件列表优先使用留白、分隔线和背景层级。

## 4. 设计 Token

首期实现 Light Theme，Dark Theme 在核心流程稳定后实现，但 token 从第一天采用语义命名。

```text
color.bg.canvas
color.bg.subtle
color.bg.elevated
color.text.primary
color.text.secondary
color.text.muted
color.border.default
color.border.strong
color.accent.primary
color.status.success/warning/danger/info

radius.control = 8px
radius.panel = 12px
radius.overlay = 14px
```

- 中性基底只选一套冷灰或自然灰。
- 全产品一个主要 accent。状态色只表达真实语义，不作装饰。
- 禁止默认 AI 紫色光晕、玻璃化滥用、霓虹边框和假终端装饰。
- 正文和交互文字至少满足 WCAG AA，焦点环必须可见。
- 中文正文优先系统无衬线字体栈；数字、路径和代码使用等宽字体。
- 图标只选一个家族，读取 `package.json` 后冻结，不手绘 SVG path。

## 5. 核心组件

### Conversation Timeline

- User、Assistant、Progress、Tool、Approval、Verification、Error 和 Final Outcome 使用不同语义，不只靠颜色区分。
- Assistant 流式文本可临时更新；Run 终态从 durable event 重建。
- reasoning 不原样展示，只显示“正在分析”及必要的简洁依据摘要。
- 长工具输出折叠并链接 Artifact，首屏只显示结果摘要。

### Composer

必须展示当前 workspace、branch、model/provider、mode 和附件范围。发送、停止和继续按钮使用稳定位置。输入框支持多行、中文输入法、快捷键说明和发送中禁用策略。

### Tool Card

```text
tool name + semantic status
normalized target / command
why it runs
risk and approval state
short output
duration / exit code
receipt / artifact link
```

状态：queued、awaiting approval、running、succeeded、failed、cancelled、outcome unknown。不能把“命令返回 0”自动显示为任务已完成。

### Approval

审批面板必须显示动作、目标、影响范围、风险、可恢复性和精确参数。按钮为“允许本次”和“拒绝”，首期不提供模糊的永久允许。参数变化后明确提示旧审批失效。

### Inspector

首期页签：Changes、Files、Browser、Terminal、Evidence。没有内容时提供有意义的 Empty State。Diff 支持文件树、行级增删、折叠、复制路径和只读查看；应用 Patch 的批准不在 Diff 视觉层偷偷发生。

## 6. 完整状态矩阵

每个数据驱动区域至少实现：

- loading：与最终布局同形的 skeleton；
- empty：解释为什么为空和下一步；
- streaming/running：局部更新，不让整页跳动；
- success：显示结果和证据；
- error：上下文内错误、可重试条件与错误 ID；
- offline/reconnecting：保留现有内容并显示恢复状态；
- stale：提示数据可能过期，提供重新读取；
- cancelled/blocked：解释终止原因和可执行动作。

Toast 只用于短暂反馈。需要用户决策或影响恢复的错误必须留在对应上下文中。

## 7. Motion 与可访问性

- 动效只服务反馈和状态转换，默认 120-200ms。
- 只动画 `transform` 和 `opacity`，不做滚动劫持、磁吸或无意义循环。
- 遵守 `prefers-reduced-motion`，减少模式下使用即时状态切换。
- 所有面板、页签、菜单、审批和 Composer 可键盘完成。
- 拖动分栏同时提供非拖动的展开、收起和预设宽度操作。
- 颜色之外必须有文字或图标表达状态。
- 窗口缩放、200% zoom、长中文、长路径和错误堆栈不溢出。

## 8. 前端契约边界

前端只消费 `PublicRunEvent`、`RunSnapshot` 和明确的 API response。禁止：

- 读取 Provider SDK response；
- 根据文本猜 Tool 状态；
- 展示未标记 public 的 event；
- 刷新时自动重新提交 Turn；
- 在浏览器保存 Provider API Key；
- 为等待后端而自创同名字段。

前端可用固定 fixture 并行开发，fixture 由共享契约 Owner 审查。

## 9. 浏览器验收

- 1440px 三栏、1100px Drawer、768px 和 390px 单栏；
- 中文输入法、多行粘贴、快捷键和停止；
- read-only success、approval required、tool failure、cancelled、reconnecting 五类 fixture；
- 侧栏与 Inspector 的键盘访问；
- 长路径、长命令、长 diff、空状态和错误状态；
- 刷新后从 snapshot 恢复且不增加 Provider 调用；
- 控制台无未处理错误，关键区域无明显布局偏移。

实际页面实现后再做截图 A/B 与人工审美验收，仅代码通过不等于视觉完成。
