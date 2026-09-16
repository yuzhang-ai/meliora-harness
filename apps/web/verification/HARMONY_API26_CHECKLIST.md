# HarmonyOS 7 / API 26.0.0 验收清单

> Issue：#28  
> 基线：`5bbc65dcbf0fe85511762a42f466aba6a5d11713`  
> 当前结论：**Pending — 尚无 HarmonyOS API 26 真机或模拟器执行证据**

## 设备记录

| 字段 | 记录 |
|---|---|
| 设备型号 | Pending |
| HarmonyOS 版本 | Pending（要求 HarmonyOS 7） |
| API 版本 | Pending（要求 API 26.0.0） |
| Runtime | Pending（系统浏览器或 ArkWeb） |
| 实际 User-Agent | Pending |
| 被测 commit SHA | Pending（提交后填写 PR 精确 HEAD） |
| 测试日期 | Pending |
| 执行人 | Pending |
| 最终结果 | Pending |
| 截图/录屏链接 | Pending |

## 必测路径

- [ ] 1440/1100 PC 形态或外接大屏窗口行为。
- [ ] 768/390 手机竖屏形态。
- [ ] 手机横屏，Workspace 与 Inspector Drawer 可打开和关闭。
- [ ] 刘海、圆角屏及底部手势区不遮挡标题、审批按钮和 Composer。
- [ ] 聚焦 Composer 后软键盘不遮挡输入、模型和发送按钮；收起键盘后高度恢复。
- [ ] 中文输入法候选、确认、换行以及 Ctrl/Command + Enter 不发生组合期误发送。
- [ ] 触摸新建、会话切换、审批、页签和 Drawer；主要目标尺寸与误触表现可接受。
- [ ] 200% 页面缩放后无页面级横向滚动，焦点环和核心操作仍可见。
- [ ] 长中文、长路径、长命令和长 diff 不撑破页面；代码区独立滚动。
- [ ] 五类 `PublicRunEvent` fixture replay、empty/loading/blocked/reconnecting 保持可用。
- [ ] 切换横竖屏和前后台恢复后不重复提交 Run，不丢失当前输入。
- [ ] 控制台无未处理错误、失败资源请求和敏感字段。

完成真机/模拟器验收后，逐项勾选并填满设备记录；在此之前，本文件只能作为兼容基线与待验收清单。
