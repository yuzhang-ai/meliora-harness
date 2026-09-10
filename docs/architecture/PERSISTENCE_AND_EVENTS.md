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
Run
RunAttempt
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
