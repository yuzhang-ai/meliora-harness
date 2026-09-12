# M0 真实纵向集成施工单

> 状态：WP-1/WP-2 local implementation under review
> 版本：v0.3
> 最后更新：2026-09-12
> Base：`main@9a212541`
> 权威范围：M0 首条真实只读 Run 的集成顺序、工作包、验收和交接边界
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[当前阶段施工单](CURRENT_STAGE.md)、[Harness 链路](../architecture/HARNESS_CHAIN.md)、[持久化与事件](../architecture/PERSISTENCE_AND_EVENTS.md)、[意图与输出层](../architecture/INTENT_AND_OUTPUT.md)、[前端规范](../frontend/VISUAL_SYSTEM.md)
> 不负责：重新定义 Provider、Store、Public Event 或前端视觉契约
> 更新触发：集成 API、幂等命令、纵向验收路径或工作包状态变化

## 1. 目标

把已经合并的 `ReadOnlyRunLoop`、Provider Transport、SQLite Session Store、Server SSE 和 Web Shell 接成第一条可由浏览器发起、可恢复、不会重复副作用的真实只读链路。

```text
POST turn command
  -> durable command + user input
  -> ReadOnlyRunLoop
  -> DeepSeek/Kimi transport
  -> L0 Workspace Tool
  -> private artifact + public projection
  -> SQLite event/receipt
  -> SSE by sequence
  -> Web replay
```

首条链路只证明 M0 组件可以安全接线，不扩展写入、审批、Skill 或上下文压缩能力。

## 2. 当前可复用接缝

- `ReadOnlyRunLoop` 已通过 `SessionStorePort`、Model Port、Tool Port 和投影函数隔离具体实现。
- DeepSeek/Kimi transport 已统一输出 `CanonicalModelEvent[]`，并冻结凭证、origin、redirect、超时和 Tool Call ID 边界。
- `SqliteSessionStore` 已覆盖 migration、lease、sequence CAS、invocation reservation、receipt、artifact 和崩溃窗口。
- Server 已提供 `GET /api/runs/:runId/events`，支持 `Last-Event-ID`、private 过滤、unknown event 隔离和终态关闭。
- `PublicRunEvent` 与五类前端 replay fixtures 已冻结；Web 不需要读取 Provider 私有响应。

当前缺口是装配层与可幂等的 Run 启动入口，不是重新实现上述模块。

## 3. 不可妥协边界

1. 浏览器只能提交受控 `workspaceId`、用户消息和有界 idempotency key；不能提交 workspace path、Provider endpoint、API Key、principal 或 trusted origin。
2. Command scope 固定为 `localPrincipalId + workspaceId + idempotencyKey`；同一 scope 的重复请求必须返回同一个 Run，不同 request hash 必须稳定冲突。
3. Command reservation、经安全校验的用户输入、Session/Turn/Run/Attempt 初始记录必须在同一事务中持久化。用户输入是 private model-visible 事实，不能只留在进程内存。
4. Command 状态至少包含 `reserved / accepted / dispatched / terminal`。进程重启后不能停留在无人接管的 `202`：要么按 recovery contract 创建新 Attempt 继续，要么持久化为 `blocked` 并返回可执行 user action。
5. 每次 Provider 调用前必须持久化 Model Step `started` checkpoint，包含 `runId / attemptId / modelStepId / requestFingerprint / startedAt`；调用结束后再写 terminal 或 failed。只有 command 状态不能证明 Provider 是否已经被调用。
6. 原始 Tool 输出和原始 Artifact 默认 private。Public projector 必须创建新的脱敏 public artifact，不能提升原 artifact visibility。
7. SSE 只读取已持久化 public event；刷新和重连不能启动 Run。
8. Provider adapter 使用 Runtime 生成的 `modelStepId`、`invocationId` 和冻结 Tool Catalog，不使用 Provider ID 作为内部主键。
9. 首期仅绑定 loopback Server，由服务端注入固定 local principal；开放非 loopback 前必须另行冻结 principal/session 授权。

## 4. 工作包与顺序

### WP-0：Command contract first

Owner：你 + Codex；秦峻溥审查持久化语义。

- 冻结 `POST /api/turns` request/response/error contract。
- 冻结 durable command reservation：`localPrincipalId + workspaceId + idempotencyKey + canonicalRequestHash -> sessionId + turnId + runId + attemptId + commandStatus`。
- 重复同 key 同 hash 返回 replay；同 key 不同 hash 返回稳定冲突，二者都不能启动第二个 Runtime。
- Reservation、经凭证/敏感字段校验的 private 用户输入、Session/Turn/Run/Attempt 必须由 Store adapter 在单事务内落库；不得用多个 `create*` 调用拼接假原子性。
- 用户输入命中凭证规则时默认拒绝并返回安全错误；不得静默把原文写入 SQLite。
- 冻结 durable Model Step state 与 request fingerprint；`started` 必须先于网络请求落库，terminal/failed 必须在响应处理后落库。
- 先以独立小 PR 合并 Port、SQLite migration、fixtures 和 adapter tests，再开始 Server composition。

验收：并发重复、重启后重复、hash 冲突、跨 workspace scope、reservation 后崩溃、Provider 请求发出后且任何响应 event 落库前崩溃、非法 workspace、超长输入和敏感字段拒绝。

### WP-1：Server composition

Owner：你 + Codex。

- 在 `apps/server` 装配 server-owned Provider 配置、workspace registry、ID factory 和固定 local principal resolver。
- 新增 `ProviderTransport -> ReadOnlyRunModelPort` adapter，注入 `ProviderCodecContext` 与冻结 L0 tools。
- 装配 `NodeWorkspaceHost -> ReadOnlyWorkspaceTools`、private artifact writer 和 private-to-public projector。
- `POST /api/turns` 只负责 reservation 与 worker dispatch；成功立即返回稳定 Run IDs，运行进度只从 SSE 读取。新 command 可返回 `202`，durable replay 按已存 command 状态返回同一 IDs 和明确状态。

验收：请求返回稳定 IDs；模型第二步收到正确 Tool Result；HTTP handler 不等待完整 Run。

本地实现证据（待独立审查与 PR CI 确认）：`apps/server/src/turn-command-composition.ts` 装配 workspace registry、固定 local principal、冻结 L0 catalog、Provider-to-model adapter、NodeWorkspaceHost、private artifact writer、model-visible 安全 Tool Result 与独立 public projector、后台 worker；`apps/server/src/server.ts` 新增 `POST /api/turns` 严格解析。`ReadOnlyRunLoop` 的 Model Step checkpoint gate 为必需依赖，未得到全新 `started` 不允许调用 Provider。`apps/server/tests/turn-command.test.ts` 覆盖 HTTP command 创建、durable replay/hash conflict、非法 authority 字段、未知 workspace、SQLite + SSE 完整只读路径、Model Step checkpoint 冲突时不调用 Provider、非终态 replay 不重复 Provider、dispatched unknown outcome fail-closed、敏感输入拒绝。

### WP-2：Server-level vertical fixture

Owner：你 + Codex；独立 gpt-5.5 xhigh Agent 审查安全与恢复边界。

新增 `server-real-readonly-vertical.test.ts`，使用临时 Git workspace、临时 SQLite 和本地 fake OpenAI SSE Provider，证明：

- `POST -> Provider -> L0 Tool -> receipt/verification -> completed -> SSE` 全链路通过；
- 第二次 Provider 请求收到使用 Runtime `invocationId` 关联的 Tool Result；
- 关闭并重开 SQLite/Server 后，仅重连 SSE 即可读到终态，Provider call count 不增加；
- API Key、未投影 workspace 原文、private Artifact ID、reasoning 和原始错误不会进入 HTTP response、`PublicRunEvent`、public artifact 或未来的 public receipt projection；
- 真实成功流与 `publicRunEventReplays["read-only-success"]` 的 schema 和公开字段兼容。

本地实现证据（待独立审查与 PR CI 确认）：`apps/server/tests/server-real-readonly-vertical.test.ts` 使用临时 Git workspace、临时 SQLite 和本地 fake DeepSeek/OpenAI SSE Provider，覆盖 `POST -> Provider -> L0 Tool -> receipt/verification -> completed -> SSE`；验证第二次 Provider 请求使用 Runtime `invocationId` 关联 Tool Result；重启 SQLite/Server 后只重连 SSE 可读终态；同一 idempotency key 终态 replay 不增加 Provider call count；HTTP/SSE 不含 fake API key、私有 workspace marker 或 private artifact ID。

### WP-3：Recovery、snapshot 与 resume-point

Owner：你 + Codex；秦峻溥负责 Store/Server adapter；独立 Agent 验证崩溃窗口。

- Recovery coordinator 从 durable command、snapshot 和 event log 重建 model-visible 状态；旧 Attempt 不回退，旧 lease 过期后以 CAS 创建新 Attempt。
- `reserved / accepted` 且未 dispatch 的 command 可安全派发；`dispatched` 且非终态的 command 必须先对照 Model Step、Invocation reservation 和 Receipt 恢复，不能盲目重放工具。
- Model Step 为 `started` 且无 terminal/failed 时，默认持久化 `run_blocked(model_step_outcome_unknown)`；除非对应 Provider 另有经过 fixture 验证的查询或幂等机制，否则禁止自动再次调用。
- 写入可供 Runtime 重建的 `RunSnapshot`；retained event 不足时，Server 返回 public snapshot + resume-point，而不是永久 `409`。
- 明确无法安全继续时持久化 `run_blocked` 与具体 user action，不能留下无人接管的运行态。

验收：Provider 前崩溃、Provider 后/Tool 前崩溃、Receipt 前后崩溃、旧 lease 未过期、旧 lease 过期、cursor 不足和终态重启。

### WP-4：Web live adapter

Owner：张子恒；后端提供已冻结 API 和本地 fixture server。

- 保留 fixture replay 作为组件门禁，新增 EventSource/live source adapter。
- 发送成功后订阅返回的 `runId`；刷新先按 durable cursor 重放，retained event 不足时使用 WP-3 的 public snapshot + resume-point，不能重新 POST。
- 真实 live E2E 首先覆盖 read-only success、retained-event reconnect、snapshot resume 和 recovery blocked。
- cancelled、approval、tool failure 等未接入后端的状态先保持 fixture browser gate；相应 command/state slice 合入后再升级为 live E2E。
- 完成 1440、1100、768、390px 浏览器验收。

依赖：Issue #1 的 Web Shell 先独立验收；WP-0 至 WP-3 合并。

### WP-5：真实 Provider canary

Owner：你 + Codex；用户提供本机临时密钥并人工触发。

- DeepSeek 与 Kimi 各跑一个只读 Coding Run。
- 密钥不落库、不进日志、不进前端、不进测试 fixture。
- 分别记录 Provider 调用、Tool Receipt、验证、刷新恢复和最终 outcome 证据。

真实密钥联调不能替代无密钥 fixture，也不能在 CI 中自动运行。

## 5. 明确不做

- 写入工具、Patch 审批、任意 Shell、Skill、Context Compaction。
- Provider delta 的逐条 durable append；本阶段允许单个 Model Step 完成后再投影其事件。
- 生产共享数据库、非 loopback 暴露、WebSocket、自动部署、取消 HTTP command 和旧 UX/Canvas 迁入。

## 6. 合并门禁

- 每个工作包使用独立 PR；共享 contract 同一时间只能有一个 Ready PR。
- 必须通过 typecheck、contracts、Provider、Runtime、Store、Server、E3 和新增纵向测试。
- 实现者与最终独立审查者不得是同一个 Agent。
- PR 必须列出本地验证、GitHub CI、浏览器/真实路径验证和仍未覆盖边界。
- 只有 WP-0 至 WP-4 合并且浏览器真实路径通过，才能把“Web 只读闭环”标记为完成；只有 WP-5 人工 canary 通过，才能声明 DeepSeek/Kimi 真实链路已验证。

## 7. 团队同步

- 张子恒：继续 Issue #1，不等待后端接线，不修改共享事件字段；遇到 fixture 缺口先在 Issue 留证据。
- 秦峻溥：当前暂停新增 Store/SSE 功能；WP-0 contract draft 出来后审查/实现 command reservation 与 migration，WP-3 再处理 snapshot/resume adapter，不回开 PR #8。
- 你 + Codex：负责 WP-0 至 WP-3 的总体编排与后端实现、契约冻结、独立审查和总体验收。
