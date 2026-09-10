# Meliora 项目协作入口

本仓库的稳定开发标准由 [Meliora 开发总纲](MELIORA_MASTER_PLAN.md) 及其链接的专项文档共同组成。不得把聊天记录、Issue 描述或旧 E3 文档当作高于当前 `main` 权威文档的规范。

开始任何开发任务前：

1. 阅读 [开发总纲](MELIORA_MASTER_PLAN.md)。
2. 阅读 [当前阶段施工单](docs/plans/CURRENT_STAGE.md)。
3. 按修改范围完整阅读对应专项文档：
   - Harness、Provider、Context、Compaction：[Harness 链路](docs/architecture/HARNESS_CHAIN.md)
   - Tool、权限、Workspace Host：[Tool 层](docs/architecture/TOOL_LAYER.md)
   - Skill：[Skill 层](docs/architecture/SKILL_LAYER.md)
   - 用户意图、公开事件、最终输出：[意图与输出层](docs/architecture/INTENT_AND_OUTPUT.md)
   - 数据库、恢复、SSE：[持久化与事件](docs/architecture/PERSISTENCE_AND_EVENTS.md)
   - Web UI：[前端视觉与交互规范](docs/frontend/VISUAL_SYSTEM.md)
   - 分工、GitHub、交接：[团队施工规范](docs/TEAM_WORKFLOW.md)

执行规则：

- 一条稳定事实只在拥有它的权威文档中定义，其他位置只链接。
- 修改契约时同步更新对应文档、fixtures 和 contract tests。
- 先检查当前 Git 状态和用户已有修改，不覆盖、不回滚、不顺手清理。
- 先复用 E3 已验证 Harness 能力，再新增抽象；不把完整 UX Editor 搬入 Meliora。
- 未经明确授权，不提交、推送、发布或部署。
- 汇报时区分本地修改、测试通过、远端同步和生产生效。
