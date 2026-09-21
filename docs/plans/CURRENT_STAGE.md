# 当前阶段施工单

> 状态：Active
> 里程碑：M0 - Web 真实只读闭环
> 版本：v0.6
> 最后更新：2026-09-20
> 权威范围：当前阶段目标、工作包、依赖、验收和进度
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md) 及全部专项规范
> 不负责：重新定义长期架构
> 更新触发：工作包状态、阻塞、验收结果或阶段切换

## 1. 本阶段目标

当前重点是让用户从 Web 页面输入任务，经本地 Server 的 durable command、Runtime、SQLite 和 SSE 得到可恢复的真实只读结果。已完成的基线/契约工作保留为回归门禁；前端产品级视觉打磨等链路验收后再做。真实 DeepSeek/Kimi 人工 canary 属 WP-5，不以无密钥 fixture 冒充。

## 2. 当前事实

```text
Target repo: https://github.com/yuzhang-ai/meliora-harness
Target repo state: remote main@8df42a72；PR #35/#36/#38 已合并；Harmony PR #37 独立 Draft
Source tag: ai-landing-page-harness-e3-minimum-integration-go-20260906
Baseline commit: 455c7aebe0ba644f9096e872ce7c8275cfa45281
E3 noEmit: passed
Meliora extraction: 109 TypeScript files in an isolated migration closure
Current slice: WP-5 两个指定网关的真实只读 canary；不冒充官方直连
Validation: WP-4B 全量 check、真实浏览器与 GitHub CI 已通过；WP-5 原两次 canary 完成，但 PR #39 凭证回显 P1 已复现，当前仅本地修复候选的定向门禁通过
Blocked: PR #39 Request changes；本地全量 check/独立候选审查已过，仍需精确新 HEAD GitHub CI 与秦峻溥短复验，禁止以原 canary 扫描结果代替攻击验收
```

## 3. 决策冻结

- Runtime 基线选 E3，不选 WhaleCode。
- 采用 Strangler 迁移，旧 `E3S1UxHostPort` 暂留作回归接缝。
- 新增 `WorkspaceHostPort`，不复用 Canvas Grant。
- Web 使用 HTTP commands + SSE，不先上 WebSocket。
- SQLite 只作为本地 adapter，不成为 Agent Runtime 依赖。
- BoardUI 是视觉与结构参考，不是 Runtime 架构来源。
- M0 不使用真实付费模型调用作为日常测试门槛。

## 4. 工作包

### WP-A：基线与后端契约

Owner：你 + Codex

- 从 annotated tag 建立干净 worktree/分支。
- 固定 E3 characterization tests 和依赖边界清单。
- 创建目标 monorepo 目录与 Meliora 独立 tsconfig。
- 定义 canonical model events、Run state、Tool Definition、WorkspaceHostPort 和 Outcome Contract。
- 提供 DeepSeek/Kimi keyless fixtures。
- 建立只读工具 skeleton，不接真实写入。

验收：独立闭包 typecheck；E3 回归 fixture 通过；不再新增 UX/Canvas 依赖；契约 PR 可供另外两线消费。

### WP-B：Web Shell

Owner：张子恒

- 审计 BoardUI 模板的结构、token、组件和授权范围。
- 建立三栏 Web Shell 与响应式降级。
- 使用固定 `PublicRunEvent` fixtures 实现 Conversation、Plan、Tool Card、Approval、Final Outcome。
- 实现 loading、empty、running、error、cancelled、blocked、reconnecting。
- 完成首轮浏览器验收记录。

允许目录：`apps/web`、约定的前端 fixture adapter。禁止自行修改 Runtime 和 Provider contracts。

验收：五类 fixture 可完整 replay；1440/1100/768/390px 关键布局通过；键盘可完成主要操作；不展示 private fields。

### WP-C：持久化与 Server Skeleton

Owner：秦峻溥

- 定义并实现 `SessionStorePort` contract tests。
- 将 E3 SQLite 能力放入 adapter，建立 migration。
- 建立 Session/Turn/Run/Event/Invocation/Receipt/Artifact 最小 schema。
- 实现 expected sequence、idempotency reservation、lease 和恢复 fixture。
- 提供 HTTP/SSE server skeleton，先对 fixture 工作。

允许目录：`packages/session-store`、`apps/server` 的持久化装配和 tests。禁止修改 Agent 完成判定和 Provider 语义。

验收：正常回放、重复调用、sequence conflict、三种崩溃点恢复、migration 和敏感字段扫描通过。

## 5. 依赖与并行方式

```text
WP-A contracts + fixtures
  |- WP-B fixture UI
  `- WP-C Store contract

WP-C server fixture SSE
  -> WP-B first integration

WP-A read-only runtime + WP-C store
  -> real end-to-end integration
```

前两天优先冻结共享 contract names 和 fixtures。张子恒、秦峻溥不需要等待全部 E3 抽离完成，可以分别对 fixtures 和 ports 开工。

## 6. M0 退出标准

- 目标仓库存在可追溯的 E3 来源说明和干净主线。
- 本文档体系进入仓库，链接和权威范围无冲突。
- 独立 Meliora TypeScript 编译闭包通过。
- E3 characterization tests 和 Provider/session fixtures 可无密钥回放。
- 公共 Run Event、Tool、Workspace Host、Store 和 Outcome contracts 已合并。
- CI 运行 typecheck、unit、contract 和 fixture replay。
- 三位成员都能从 Context Packet 独立启动各自工作。
- 每个进入集成的共享契约或跨模块工作包都有主 Agent 集成记录，以及独立 Agent 的偏航审查结论。
- 没有先删除 UX/Canvas，也没有把完整页面编辑器迁入产品目录。

## 7. 明确不做

- 不在 M0 接入生产数据库。
- 不部署公网版本。
- 不实现任意 Shell 写入和自动审批。
- 不做 Skill 市场和插件生态。
- 不优化营销落地页。
- 不以页面可打开代替 Harness 闭环验收。

## 8. 状态板

| 工作项 | Owner | 状态 | 证据 |
|---|---|---|---|
| 文档体系 v0.1 | 你 + Codex | Completed locally | 9 份权威文档已进入本地 main |
| BoardUI 参考核验 | 你 + Codex | Completed | 页面结构与可见状态已核对 |
| 干净 E3 来源基线 | 你 + Codex | Completed locally | orphan main + source commit provenance |
| E3 独立闭包与回归 | 你 + Codex | Verified locally | typecheck + 5 组 characterization tests |
| Contract-first PR | 你 + Codex | Merged | PR #3 已合并至 main `3f2e24f0`；CI、全量 check 与独立审查通过 |
| Read-only Runtime | 你 + Codex | Merged | PR #5 已合并至 main `e3b8a1a1`；真实 Host/Store/Run loop、CI 与独立安全复审通过 |
| Web Shell | 张子恒 | Merged | Issue #1 / PR #18 已合并至 main `02b1e297`；Web 11/11、四档响应式与真实 Chrome 验收、全量 check、CI 和独立复审通过；尚未接入真实 Server/SSE |
| Store/Server skeleton | 秦峻溥 | Merged | PR #8 已合并至 main `e56ed392`；Store 8/8、Server/SSE 13/13、Windows 全量 check、CI 与独立安全复审通过 |
| Provider HTTP/SSE transport | 你 + Codex | Merged | PR #10 已合并至 main `45663fa0`；25 项无密钥 fixture、Windows 全量 check、CI、独立安全与契约复审通过 |
| M0 真实纵向集成 | 你 + Codex | Backend merged | WP-1/2/3 已合入 main；PR #34 完成 SSE restart、terminal `204`、raw-tail `409` 与 SQLite 重开只读恢复。Web 页面尚未完成真实链路验收。 |
| WP-4A Web Live Adapter | 张子恒 | Merged | PR #35 合入 main；POST、SSE、public resume snapshot 与状态机已具备，页面默认仍是 fixture。 |
| WP-4B 页面真实链路 | 你 + Codex | Merged | PR #38 已合并至 main `8df42a72`；Web 30/30、Server 20/20、浏览器真实 SQLite/Server 路径和 GitHub CI 通过。 |
| WP-5 指定网关 canary | 你 + Codex | P1 fix candidate; human review pending | [脱敏验收记录](../verification/WP5_GATEWAY_CANARY_20260920.md)：两个指定网关的原只读 Run 完成，但 PR #39 人工攻击性复审发现任意格式 key 经模型回显落入 private Store。当前 transport 精确值拦截候选本地全量 check 与独立 Terra high 审查通过；未合并、未重调付费网关；秦峻溥短复验及新 HEAD CI 待完成。 |
| 桌面视觉 / Harmony | 张子恒 | Visual merged / Harmony Draft | PR #36 桌面视觉与 PR #38 Web→Server `/api` 链路已合入 main；PR #37 正在最新 main 上复验 PC/手机 Web、SSE 与刷新恢复。HarmonyOS 7 / API 26 真机或官方模拟器仍为待验收。 |
| Durable command + Model Step checkpoint | 你 + Codex；秦峻溥 | Merged | Issue #13 / PR #14 已合并至 main `ab8485f1`；Store 24/24、全量 CI 与独立复审通过 |
| Store/SSE security follow-up | 秦峻溥 | Backlog | Windows ACL；Server 对非 loopback 暴露前补 principal/session 授权。snapshot + resume-point 已并入 M0 纵向集成 WP-3 |
| GitHub access / CODEOWNERS | 全员 | Backlog | 用户名齐全后处理 |

## 9. 下一动作

WP-4B 已合并。PR #39 的凭证回显 P1 本地候选、合成凭证跨 delta 与 SQLite/WAL/SHM 短复验、全量 check 和独立审查已通过；等待秦峻溥复审与精确 HEAD CI，通过后再合并。随后在独立人工窗口补浏览器首次提交真实模型 Run。网关兼容与官方直连分别表述。Harmony PR #37 基于最新 main 复验 PC/手机 Web 与无密钥 fake-model 链路；目标真机或官方模拟器仍为待验收。
