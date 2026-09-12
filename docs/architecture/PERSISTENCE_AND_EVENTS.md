# 持久化与事件架构

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：Session Store Port、事件日志、数据实体、幂等、恢复、Artifact 和 SSE 语义
> 维护者：秦峻溥（建议初始 Owner）
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[Harness 链路](HARNESS_CHAIN.md)、[意图与输出层](INTENT_AND_OUTPUT.md)
> 不负责：Agent 决策、Provider Codec、前端渲染
> 更新触发：Store Port、schema、migration、recovery 或 SSE 语义变化

## 1. 原则

- Agent Runtime 依赖 `SessionStorePort`，不依赖具体数据库。
- 事件日志是恢复依据，快照是性能优化。
- Model-visible 事实必须 durable。
- 每个副作用先 reservation，后执行，再 receipt。
- UI 刷新和 SSE 重连不得触发新 Provider 调用。
- 密钥和 Authorization 不进入 Session Store。

## 2. 数据实体

首期最小实体：

```text
Workspace
Session
Turn
RunCommand
PrivateUserInput
Run
RunAttempt
ModelStepCheckpoint
Event
Message
ToolInvocation
Approval
Receipt
Artifact
ContextCheckpoint
Lease
SchemaMigration
```

实体使用 Runtime 生成的稳定 ID、`created_at`、`updated_at` 和 schema version。Provider ID 只能是辅助字段。

## 3. SessionStorePort

```ts
interface SessionStorePort {
  reserveRunCommand(input: ReserveRunCommand): Promise<RunCommandReservation>;
  readRunCommand(scope: RunCommandScope): Promise<StoredRunCommand | null>;
  transitionRunCommand(input: TransitionRunCommand): Promise<RunCommandTransition>;
  readPrivateUserInput(input: ReadPrivateUserInput): Promise<PrivateUserInput | null>;
  startModelStep(input: StartModelStep): Promise<ModelStepStartResult>;
  finishModelStep(input: FinishModelStep): Promise<ModelStepFinishResult>;
  readModelStep(input: ReadModelStep): Promise<ModelStepCheckpoint | null>;
  readLatestModelStep(input: ReadLatestModelStep): Promise<ModelStepCheckpoint | null>;
  createSession(input: CreateSession): Promise<Session>;
  createTurn(input: CreateTurn): Promise<Turn>;
  createRun(input: CreateRun): Promise<Run>;
  createRunAttempt(input: CreateRunAttempt): Promise<RunAttempt>;
  appendEvents(input: AppendEvents): Promise<AppendResult>;
  readEvents(input: ReadEvents): Promise<EventPage>;
  writeSnapshot(input: WriteSnapshot): Promise<void>;
  readSnapshot(runId: string): Promise<RunSnapshot | null>;
  reserveInvocation(input: InvocationReservation): Promise<ReservationResult>;
  commitReceipt(receipt: ToolReceipt): Promise<void>;
  putArtifact(input: PutArtifact): Promise<ArtifactRef>;
  getArtifact(id: string): Promise<Artifact | null>;
  acquireLease(input: LeaseRequest): Promise<LeaseResult>;
  renewLease(input: LeaseRenewal): Promise<boolean>;
}
```

### 3.1 Durable Run Command

启动 Run 的幂等 scope 固定为 `local_principal_id + workspace_id + idempotency_key`。浏览器不得提交 principal、workspace path、Provider endpoint、API Key、trusted origin 或任何 Runtime 生成 ID；`local_principal_id` 由 loopback Server 注入，`workspace_id` 必须先由受控 registry 解析。

canonical request 只包含版本化的 `workspace_id + user_message`，不包含 principal、idempotency key、时间戳或生成 ID。相同 scope 与相同 canonical request hash 返回已存 Command 及同一组 `session_id / turn_id / run_id / attempt_id`；调用方在重试时提供的新候选 ID 必须被忽略。相同 scope 与不同 hash 稳定返回 `idempotency_key_conflict`，且不得新增任何记录。workspace 不同即 scope 不同，不得串用 Run。

Command 状态为 `reserved -> accepted -> dispatched -> terminal`。`terminal` 另带 `completed / blocked / failed / cancelled` 之一及可选安全 code。通用状态更新必须同时携带 Command scope、`run_id + active attempt_id + lease_token` 并使用 expected-status CAS；Store 在同一原子操作内验证 active Attempt 与未过期 lease，旧 worker 即使知道 Command scope 也不得推进状态。`accepted -> dispatched` 不属于通用状态更新，只能由 `startModelStep` 在写入新 checkpoint 的同一事务中完成。恢复协调器可以用当前 Attempt 与有效 lease 把未能继续接管的 `reserved / accepted / dispatched` Command 收口为 terminal blocked，不能留下无人接管的永久 `202`。

新 Command 的 reservation、通过长度与敏感信息校验的 private user input、Session、Turn、Run 和 Attempt #1 必须由一个 Store 方法在同一事务内写入。private user input 是 Turn 级、`role=user`、`visibility=private` 的 model-visible 事实，创建后续 Attempt 时继续复用。敏感信息检查必须在把原文绑定给任何 SQL 语句之前完成；仅依赖事务 rollback 不能保证原文不会进入 WAL/SHM。

### 3.2 Model Step Checkpoint

每次 Provider 调用前，Runtime 必须先等待 `startModelStep` 返回全新的 `kind=started` 并成功持久化 `run_id / attempt_id / model_step_id / request_fingerprint / started_at / status=started`，然后才允许发出任何网络字节。首次 `startModelStep` 与 Command 的 `accepted -> dispatched` 必须在同一事务中完成，避免已经允许发出网络请求但 Command 仍显示可安全派发。相同且仍未结算的 Model Step 重试返回 `model_step_in_progress`，不得把 replay 误作再次发送许可；相同 ID 与不同 fingerprint 返回 `model_step_conflict`；同一 Run 同时只能存在一个未决 `started` step。Model Step 绑定实际执行它的 Run Attempt，而不是固定绑定 Command reservation 原子创建的 Attempt #1，因此无未决 step 时恢复后的 Attempt 可以继续 checkpoint；只要旧 Attempt 留有未决 `started` step，新 Attempt 就必须返回 `model_step_in_progress`，不得再次调用 Provider。

Provider 响应完成处理后，`finishModelStep` 将同一 checkpoint 以 CAS 更新为 `terminal` 或 `failed`。重复提交完全相同的完成事实是 replay，任何 fingerprint、状态、时间或安全 failure code 漂移均为冲突。原始响应、headers、URL、credential 和底层错误文本不得写入 checkpoint。

恢复读取到 `started` 且没有 `terminal / failed` 的 checkpoint，只能派生 terminal blocked code `model_step_outcome_unknown`。该状态说明 Provider 请求可能已经发出；在未来没有经过验证的 Provider 查询或幂等机制前，不得自动再次付费调用。Store 只保存并返回事实，不自行触发 Provider、不修改 Runtime/Public Event 语义。

### 3.3 Turn Command HTTP Contract

`POST /api/turns` 的浏览器 request 只允许 `schemaVersion / workspaceId / idempotencyKey / message`，未知字段必须拒绝。成功 response 只返回 `created | replay` disposition、稳定的 Session/Turn/Run/Attempt IDs、Command 状态及可选 terminal 状态，不返回用户原文或 canonical hash。新 Command 和非终态 replay 返回 `202`，终态 replay 返回 `200`。

错误响应只使用冻结的安全 code 和 retryable 标志；不得携带用户原文、hash 材料、workspace path、数据库路径、Provider 原始响应或 SQLite 错误。浏览器输入错误、未知 workspace、幂等冲突与服务端故障必须映射到不同且稳定的 code。

创建 Run 时原子创建 Attempt #1；恢复通过 `createRunAttempt` 创建递增 Attempt，不修改旧 Attempt 的终态。恢复必须同时以 `expected_latest_attempt_number` CAS 检查 Attempt 版本和旧 lease 的过期状态：同一 Run 任一未过期 lease 都返回 `lease_held`，不得写入新 Attempt 或第二 lease；仅在旧 lease 已过期时，才能原子创建新 Attempt 与新 lease。所有状态写入、事件追加、Snapshot、Invocation reservation 与 Receipt commit 都绑定 `run_id + attempt_id + lease_token`。`appendEvents` 还必须携带 `expected_sequence`，由 Store 原子分配连续 sequence。Port contract 需定义事务边界、冲突错误、分页、顺序、时钟和一致性，不把 SQLite 特性暴露给调用方。

## 4. Event Log

每个 Run 的事件序号严格单调。`appendEvents` 通过 expected sequence 做乐观并发控制。事件不可原地修改；修正通过新事件表达。

```text
event_id
run_id
sequence
schema_version
kind
visibility
payload
created_at
causation_id
correlation_id
```

Public SSE 只读取 `visibility=public` 的投影事件。Private 事件可用于恢复，但也要最小化敏感数据。

## 5. Snapshot 与恢复

- Snapshot 记录应用到哪个 event sequence。
- 恢复先读最近 Snapshot，再重放后续事件。
- Snapshot 写失败不影响已提交事件。
- 恢复后检查 lease、未决 invocation、approval 和 terminal state。新 Attempt 可仅按 `run_id + idempotency_key` 读取旧 Attempt 的 reservation、invocation 和 Receipt，用于 reconcile；该读取不转移 lease，也不允许新 Attempt 提交或重放旧副作用。
- `outcome_unknown` 的工具先 readback，不重新执行。
- 任何 schema 升级都有向前 migration 和旧 fixture replay。

## 6. Artifact

大日志、diff、工具输出和压缩前内容写 Artifact Store。数据库事件只保存引用、大小、媒体类型、内容哈希、可见性和保留策略。

本地开发可使用 workspace 外的受控数据目录。Artifact 路径不能由模型直接决定，下载和 UI 展示仍经过访问控制和脱敏。

## 7. SQLite 与生产边界

M0/M1 可以复用 E3 的 SQLite 思路，但必须放在 adapter 后。Windows 原生依赖建议在短路径 worktree 验证。

SQLite 适合单机本地 Runtime，不适合多实例 Serverless 的 `/tmp`。未来 Web 服务如果跨实例恢复 Run，必须使用共享数据库和共享 Artifact Store。生产数据库在部署、并发、成本和运维约束明确后再冻结。

## 8. SSE

```text
GET /api/runs/:id/events
Last-Event-ID: <event_id>
```

要求：

- SSE `id` 使用每个 Run 单调递增的 `sequence`；`event_id` 是稳定实体 ID，不承担排序语义。
- 心跳不进入业务事件日志。
- 客户端重复收到事件时按 ID 去重。
- 终态事件后连接可关闭。
- 事件保留不足时返回 snapshot + resume point，而不是静默丢段。
- 页面刷新只做 read，不创建新 Run。

## 9. 数据安全

- Provider credentials 存配置层或系统凭证存储，不存 Session DB。
- 环境变量、原始命令输出和文件内容先分类再持久化。
- 日志使用 allowlist 字段，不直接序列化整个异常或 SDK response。
- 删除与保留策略后续单独决策；首期不做隐式自动清理。

## 10. 验收

- create/read/append 的契约测试。
- expected sequence 冲突。
- 重复 idempotency key 不重放副作用。
- 执行前、执行中、Receipt 后崩溃的恢复。
- lease 过期与抢占。
- migration 后旧 fixture 可回放。
- SSE 断线、重复、乱序防护和终态。
- Runtime 重启后 Session、Plan、审批和 outcome 一致。
- 敏感字段扫描为零泄露。
