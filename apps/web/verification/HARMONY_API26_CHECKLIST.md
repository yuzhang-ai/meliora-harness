# HarmonyOS 7 / API 26.0.0 验收清单

> 工作区基线：当前远端 main 集成基线
> 候选分支：`codex/web-harmony-api26-overlay`；精确被测 HEAD 以 Draft PR 记录为准
> 当前结论：**Pending — Chrome 兼容回归已执行，尚无 HarmonyOS API 26 真机或官方模拟器证据**

## 设备记录

| 字段 | 记录 |
|---|---|
| 设备型号 | Pending |
| HarmonyOS 版本 | Pending（要求 HarmonyOS 7） |
| API 版本 | Pending（要求 API 26.0.0） |
| Runtime | Pending（系统浏览器或 ArkWeb，记录版本） |
| 实际 User-Agent | Pending |
| 被测 commit SHA | Pending（提交后填写精确 HEAD） |
| 测试日期 | Pending |
| 执行人 | Pending |
| 最终结果 | Pending |
| 截图/录屏链接 | Pending |

## 已完成的本地浏览器回归

- [x] Chrome headless：viewport meta 同时含 `viewport-fit=cover` 与 `interactive-widget=resizes-content`。
- [x] VisualViewport 可用/回退标记、纯函数键盘高度与 200% page scale 不误判为软键盘。
- [x] 模拟安全区与工作区间距组合；390/360/432 纵向、844×390 横屏无页面级横向溢出。
- [x] composition 中 Ctrl+Enter 不提交，compositionend 后恢复提交；coarse-touch 主按钮不小于 44×44px。
- [x] 保留 PR #35 Live Adapter、PR #36 左右栏折叠、左栏项目内独立滚动与 1100px 三栏 / 1099px Drawer。

以上不是设备验收，也不替代下面的未勾选路径。

## 待目标设备逐项留证

- [ ] 1440/1280/1100 外接大屏窗口三栏，以及 1099 Drawer 边界。
- [ ] 768/390 手机竖屏形态。
- [ ] 矮横屏，Workspace 与 Inspector Drawer 可打开和关闭。
- [ ] 刘海、圆角屏及底部手势区不遮挡标题、审批按钮和 Composer。
- [ ] 聚焦 Composer 后软键盘不遮挡输入、模型和发送按钮；收起键盘后高度恢复。
- [ ] 中文输入法候选、确认、换行以及 Ctrl/Command + Enter 不发生组合期误发送。
- [ ] 触摸新建、会话切换、审批、页签和 Drawer；主要目标尺寸与误触表现可接受。
- [ ] 人工 200% 页面缩放后无页面级横向滚动，焦点环和核心操作仍可见。
- [ ] 长中文、长路径、长命令和长 diff 不撑破页面；代码区独立滚动。
- [ ] 五类 `PublicRunEvent` fixture replay、empty/loading/blocked/reconnecting 保持可用。
- [ ] 切换横竖屏和前后台恢复后不重复提交 Run，不丢失当前输入。
- [ ] 控制台无未处理错误、失败资源请求和敏感字段。

完成目标设备验收后，逐项勾选并填满设备记录；在此之前，不得将本文件或本地 Chrome 截图表述为 HarmonyOS 通过。
