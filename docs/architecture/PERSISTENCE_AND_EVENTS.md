# 持久化与事件架构

> 状态：Draft for M0
> 版本：v0.2
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

`run_blocked(model_step_outcome_unknown)` 的 Command 收口必须调用 Store 的单一原子操作：它接收 Command scope、`run_id / active attempt_id / lease_token`、expected Command status、expected event sequence、terminal status/code 和**恰好一个** public terminal event。Store 先验证 scope、active Attempt、lease、Command CAS、sequence 与 `terminalStatus <-> run_<terminalStatus>` 事件种类一致性，再在同一临界区插入 event、推进 Attempt 的 `last_event_sequence` 并把 Command 写为 `terminal`。任一验证、插入或更新失败时三项都不得改变；完全相同的 replay 返回既有 Command 和 event，绝不追加第二个终态事件。SQLite adapter 使用 `BEGIN IMMEDIATE`，Memory adapter 在无 `await` 的同步临界段完成同样语义。该路径不得把 `appendEvents` 和 `transitionRunCommand` 拼接；持久化失败或冲突时必须保留 `dispatched + started`，等待安全恢复且不得重调 Provider。

新 Command 的 reservation、通过长度与敏感信息校验的 private user input、Session、Turn、Run 和 Attempt #1 必须由一个 Store 方法在同一事务内写入。private user input 是 Turn 级、`role=user`、`visibility=private` 的 model-visible 事实，创建后续 Attempt 时继续复用。敏感信息检查必须在把原文绑定给任何 SQL 语句之前完成；仅依赖事务 rollback 不能保证原文不会进入 WAL/SHM。

### 3.2 Model Step Checkpoint

每次 Provider 调用前，Runtime 必须先等待 `startModelStep` 返回全新的 `kind=started` 并成功持久化 `run_id / attempt_id / model_step_id / request_fingerprint / started_at / status=started`，然后才允许发出任何网络字节。首次 `startModelStep` 与 Command 的 `accepted -> dispatched` 必须在同一事务中完成，避免已经允许发出网络请求但 Command 仍显示可安全派发。相同且仍未结算的 Model Step 重试返回 `model_step_in_progress`，不得把 replay 误作再次发送许可；相同 ID 与不同 fingerprint 返回 `model_step_conflict`；同一 Run 同时只能存在一个未决 `started` step。Model Step 绑定实际执行它的 Run Attempt，而不是固定绑定 Command reservation 原子创建的 Attempt #1，因此无未决 step 时恢复后的 Attempt 可以继续 checkpoint；只要旧 Attempt 留有未决 `started` step，新 Attempt 就必须返回 `model_step_in_progress`，不得再次调用 Provider。

Provider 响应完成处理后，`finishModelStep` 将同一 checkpoint 以 CAS 更新为 `terminal` 或 `failed`。重复提交完全相同的完成事实是 replay，任何 fingerprint、状态、时间或安全 failure code 漂移均为冲突。原始响应、headers、URL、credential 和底层错误文本不得写入 checkpoint。

恢复读取到 `started` 且没有 `terminal / failed` 的 checkpoint，只能派生 terminal blocked code `model_step_outcome_unknown`。该状态说明 Provider 请求可能已经发出；在未来没有经过验证的 Provider 查询或幂等机制前，不得自动再次付费调用。Store 只保存并返回事实，不自行触发 Provider、不修改 Runtime/Public Event 语义。

### 3.3 Turn Command HTTP Contract

`POST /api/turns` 的浏览器 request 只允许 `schemaVersion / workspaceId / idempotencyKey / message`，未知字段必须拒绝。成功 response 只返回 `created | replay` disposition、稳定的 Session/Turn/Run/Attempt IDs、Command 状态及可选 terminal 状态，不返回用户原文或 canonical hash。新 Command 和非终态 replay 返回 `202`，终态 replay 返回 `200`。

错误响应只使用冻结的安全 code 和 retryable 标志；不得携带用户原文、hash 材料、workspace path、数据库路径、Provider 原始响应或 SQLite 错误。浏览器输入错误、未知 workspace、幂等冲突与服务端故障必须映射到不同且稳定的 code。

创建 Run 时原子创建 Attempt #1；恢复通过 `createRunAttempt` 创建递增 Attempt，不修改旧 Attempt 的终态。`StoredRunCommand.initialAttemptId` 是创建命令时的不可变身份，兼容字段 `attemptId` 恒等于它；二者都不是 lease/CAS authority。唯一未来写 authority 是 `Run.activeAttemptId` 加新 Attempt 的 `expected_latest_attempt_number` CAS。恢复必须同时检查 Attempt 版本和旧 lease 的过期状态：同一 Run 任一未过期 lease 都返回 `lease_held`，不得写入新 Attempt 或第二 lease；仅在旧 lease 已过期时，才能原子创建新 Attempt 与新 lease。所有状态写入、事件追加、Snapshot、Invocation reservation 与 Receipt commit 都绑定 `run_id + attempt_id + lease_token`。`appendEvents` 还必须携带 `expected_sequence`，由 Store 原子分配连续 sequence。Port contract 需定义事务边界、冲突错误、分页、顺序、时钟和一致性，不把 SQLite 特性暴露给调用方。

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

- `RunSnapshot` 是 private-only 结构化恢复快照，不接受裸 JSON state：至少包含 state schema version、phase、catalog hash、intent revision、private model-history artifact ref、可选 terminal model-step-result binding、pending invocation refs、receipt refs 与 verification refs。pending ref 只含 invocation identity/attempt/hash/status（可含 tool identity），完整调用参数和 idempotency 原文只从 recovery bundle 的 durable invocation records 读取。模型原文、凭证和原始工具输出不进入快照；所有 artifact ref 写入与读回都重新经过结构和敏感数据校验。
- terminal model-step result binding 必须同时绑定 `attemptId / modelStepId / requestFingerprint / private artifact ref`；写 Snapshot 的同一 adapter 临界区/SQLite transaction 必须确认 checkpoint 存在且已 `terminal`，读回和 recovery bundle 也再次核对。checkpoint 或 binding 漂移是 `snapshot_integrity_conflict`，不得继续恢复。artifact 的实体存在性/内容 readback 不在 WP-3A 原子多实体写范围内，留给后续 B slice；本切片至少 fail closed 于 ref 结构、visibility、hash 格式和敏感扫描。
- WP-3B.1a 增加 dormant 的 `commitTerminalModelStepResultAndSnapshot`：它以一条原子 Store 操作写入 private normalized-result artifact、将已 `started` checkpoint 结算为 `terminal`、写 immutable terminal-result binding 与 immutable private snapshot-history record，再把 `run_snapshots` 更新为最新指针。每个 terminal Model Step 保留自己的 history；Store 在该临界区为同一 Run 分配严格单调的 `commitOrdinal`，terminal row 与 history 必须持久化相同 ordinal，最新记录只按此 Store-owned 值选择，绝不依赖调用方 `createdAt` 或 snapshot ID。terminal row 还保存基于 canonical 完整 `RunSnapshot` envelope（含 run/attempt/snapshot identity、sequence、完整 state 与 outer `createdAt`）的 hash；它把每条旧 history 的外层字段同样固定住。后续已 started step 可以继续原子提交，旧 step 的 exact replay 复用既有 ordinal，且只依赖其 immutable identity/history，不依赖 current snapshot。SQLite 使用 `BEGIN IMMEDIATE`，Memory 在同步临界段完成。`readSnapshot` 与 recovery bundle 验证所有 terminal rows 都有且只有一份完全匹配的 history/checkpoint/artifact/envelope hash，并要求 current snapshot 与 ordinal 最新 history 逐字段相同（含完整 state 和 outer `createdAt`）；任一 row/history/current snapshot 的漂移、删除、替换或 binding removal 都 fail closed，绝不 repair/backfill。自 B1b Runtime cutover 起，旧 `finishModelStep(terminal)` 与 `writeSnapshot(binding)` 均拒绝写入；仅 non-terminal legacy snapshot helper 保留，terminal 必须走原子路径。
- WP-3B.1a 已随 PR #21 合并到 `main@80bfbf1f`。WP-3B.1b 现在由 Runtime 消费 `beginInvocationExecution`：只有 active attempt、有效 lease 和 v3 `reserved` reservation 可把 invocation 标为 `executing` 并由 Store clock 写 `executionStartedAt`，且只有 `kind=started` 授权 Host；`executing`、`outcome_unknown` 与已有 Receipt 永不重放 Host。新 Receipt 仅可由 active attempt、有效 lease、`executing + executionStartedAt` reservation 写入，exact Receipt 仍可 replay。任何 `renewLease` 的 false 或 adapter exception 都统一为 `run_lease_lost`。Receipt 写入、begin permit 或 Host 已开始/返回后但 Receipt 尚未 durable 时的 lease-loss/异常，均是副作用边界未知：首次失败必须保留 `dispatched + executing + no Receipt`，不得写失败 Receipt、不得重调 Host、也不得伪造 `worker_failed`；后续 worker 只有获得新有效 lease 且从完整 recovery bundle 确认无 Receipt 的 v3 `executing`（非空有效 `executionStartedAt`）或 legacy `outcome_unknown`（空 `executionStartedAt`）invocation 后，才以单一原子 Command/event 结算恰一条 `run_blocked(tool_invocation_outcome_unknown)`。`reserved/awaiting_approval` 必须无 Receipt 且空 `executionStartedAt`；`outcome_unknown/executing/reserved + Receipt`、非法 timestamp 组合、terminal invocation 无 Receipt、reservation/invocation identity 或 status 漂移一律是不确定完整性状态；terminal 的匹配 Receipt 允许 legacy-compatible 时间字段，但只能视作已结算事实，不能伪装成“未执行”并落入 Model Step fallback。bundle read 的 throw、conflict、incomplete 或 `recovery_bundle_too_large` 都不是 invocation 缺失证明，必须保持原状态而非落入普通失败收口。每个后续 atomic terminal snapshot 写入已 durable receipt IDs，并逐个从 Store 重读、校验 hash/bytes/mediaType/visibility 后写入完整 verification artifact refs；因此下一 step 的 private history/snapshot 可重建 receipt 与 verification 事实，artifact 漂移则 fail closed。v2 中无 Receipt 的 `reserved/executing` 已迁为 `outcome_unknown`，因为旧库无法证明执行边界。
- `RecoveryReadPort` 独立于写 Port：`listRecoverableCommands({limit: 1..64, afterCursor?})` 按不可变 `(createdAt, runId)` 的 ASCII/BINARY 同一顺序扫描非终态 command。cursor 是排他的稳定元组；每页返回 `nextCursor` 或 sweep 完成时的 `null`，不得让固定前 N 条 retained Command 饿死后面的不确定 Run。扫描 DTO 只能含 `runId / initialAttemptId / status / createdAt`，不得泄露 principal、workspace、idempotency、request hash、Session 或 Turn。`readRecoveryBundle` 以单一 read view 返回 command、Run 的 active Attempt、private input/snapshot、事件分页、latest model step 与 invocation reconciliation records。SQLite 必须在同一 read transaction 内完成，Memory 必须深拷贝。
- WP-3C.1 的 `recoverAndSettleRunCommandWithTerminalEvent` 是唯一可创建恢复 Attempt 的 C.1 写路径：它在一个 Memory 无 await 临界段或 SQLite `BEGIN IMMEDIATE` 中，先验证旧 active Attempt、旧 lease 已过期、Command `dispatched`、bundle 的 latest Attempt/sequence，再一起创建新 Attempt/lease、追加恰一条 `run_blocked`、并将 Command 写为 `terminal/blocked`。terminal event 的 exact `payload.code` 必须等于 terminalCode，且 recovery 输入只能有 canonical `schemaVersion / eventId / kind / visibility / payload / createdAt`，不得携带 causation/correlation 或任何额外字段；新 Attempt 的 opaque ID、owner ID 与 event ID 均在写前经过敏感数据扫描。任何 lease、CAS、event ID、payload、插入或事务失败都必须全不写，绝不能先切换 `Run.activeAttemptId` 再尝试收口，否则旧 `started` Model Step 会被隐藏。
- C.1 coordinator 只做显式/启动时的 bounded `recoverOnce`，从完整 bundle 分类并收口可证明的 `started` Model Step、`executing/outcome_unknown` invocation，或完整 Receipt/binding 边界；它不调用 Provider、Host 或旧 worker。`reserved / accepted`、不完整 tail、任何已有 terminal event、bundle throw/conflict/incomplete/too_large、任何 identity/Receipt drift 都保持原状。普通安全派发与继续 Run 是后续 C.2；GET/SSE/read 路由不得触发 coordinator。
- WP-3C.2a 只提供 Store-owned 的 `claimInitialPreDispatchRunCommandForRecovery`，不是 scheduler、更不是 Provider/Host restart。它只能接管 Command 初始 Attempt #1 的 `reserved` 或 `accepted` 状态：Command 的 immutable initial identity、Run.activeAttemptId、唯一 Attempt #1/`latestAttemptNumber=1`，以及 initial Attempt 严格仍为 `status="created"`、`runtimeState=null`（SQLite 的原始 `runtime_state_json` 还必须是规范字节 `null`），Session/Turn/private user input 的存在与 workspace/session/turn/intent/hash 绑定都必须在同一 adapter 临界区重新核对；private input 的 content hash 自洽还不够，必须重新计算 `canonicalRunCommandRequestHash({ workspaceId, message })` 并与 Command 的 immutable canonical request hash 完全相等。允许的完整 event 前缀仅为当前 `ReadOnlyRunLoop` 在 `startModelStep` 前实际可写的 `[]`、`run_status_changed(preparing)`、或其后紧接 `run_status_changed(model_streaming)`；`reserved` 只能是空前缀。任何 Model Step、terminal-result/history、Snapshot、Invocation、Receipt、Receipt/public binding、staged artifact，或其他/terminal/unknown event 都是无法证明未出站的事实，必须拒绝接管。
- C.2a 可以接管“reservation 已 durable、worker 尚未来得及 acquire lease 即崩溃”的无 lease 窗口；若同一 Run 存在任一 lease，则每条 lease 的过期时间必须是有效时间且全部已过期。任一未过期 lease 返回 `lease_held`；除上述合法无 lease 窗口外，必要身份/历史记录缺失、lease 时间无效或任一绑定漂移都返回安全冲突且全不写。成功时必须在一个 Memory 无 `await` 临界段或 SQLite `BEGIN IMMEDIATE` transaction 内创建全新的 Attempt #2 和新 lease、切换 `Run.activeAttemptId` 与 `latestAttemptNumber`，并保留原 Command/event log 不变；禁止复用 initial Attempt、追加事件、调用 Provider/Host 或自行把 Command 置为 dispatched。任一故障、CAS 冲突或并发竞争必须保持旧 authority，且最多一个 claimant 成功。
- C.2b 的后续显式 dispatcher 只消费 C.2a 的完整 pre-dispatch proof，并把新 Attempt/lease 当作唯一 `ExecutionAuthority`；Command 的 initial Attempt 字段绝不重新成为写 authority。若 C.2a 已创建的 Attempt #2 在 worker 前崩溃，`reclaimInitialPreDispatchExecutionAuthority` 必须在同一 Store critical section / `BEGIN IMMEDIATE` 内重新核对完整 C.2a proof、#1/#2 均为 `created + null`、无 checkpoint/invocation/receipt/snapshot、精确前缀与所有 lease 时间。仅 #2 lease 已过期时替换该 lease；活 lease、漂移或 CAS 失败全不写，绝不创建 #3。该 primitive 不扫描 command、不调用 Provider/Host，也不追加事件。
- bundle 的 `expectedActiveAttemptId` 不匹配返回 `run_attempt_conflict`；事件分页不完整时只返回 `tailComplete=false`、`nextAfterSequence` 等分页事实。超过 128 个 invocation 的 bundle 返回 `recovery_bundle_too_large`，不得静默截断；M0 不得为此 repair、裁剪或伪造 terminal 收口，只能安全保持非终态，liveness 交给后续恢复协调器切片。
- recovery bundle 缺失 command 绑定的 private user input 是完整性失败（`recovery_bundle_incomplete`），不得返回看似可恢复的 `found + null`。invocation reconciliation 固定按 `(reservedAt, invocationId)` 排序。
- Snapshot 记录应用到哪个 event sequence。
- 恢复先读最近 Snapshot，再重放后续事件。
- Snapshot 写失败不影响已提交事件。
- 恢复后检查 lease、未决 invocation、approval 和 terminal state。新 Attempt 可仅按 `run_id + idempotency_key` 读取旧 Attempt 的 reservation、invocation 和 Receipt，用于 reconcile；该读取不转移 lease，也不允许新 Attempt 提交或重放旧副作用。
- `outcome_unknown` 的工具先 readback，不重新执行。
- 任何 schema 升级都有向前 migration 和旧 fixture replay。

## 6. Artifact

大日志、diff、工具输出和压缩前内容写 Artifact Store。数据库事件只保存引用、大小、媒体类型、内容哈希、可见性和保留策略。

本地开发可使用 workspace 外的受控数据目录。Artifact 路径不能由模型直接决定，下载和 UI 展示仍经过访问控制和脱敏。

WP-3B.2b.1 只增加 Store-owned staged public tool-result provenance：首次 stage 只接受 active Attempt、有效 lease 与 `executing` reservation，并在同一 adapter critical section / SQLite `BEGIN IMMEDIATE` 中生成 opaque staging alias、private physical `text/plain` derivative、Store clock `createdAt` 和 immutable provenance。provenance 固定 `(run, session, origin attempt, origin invocation, reservation, slot=tool_result, hash, media type, byte length)`；同一 origin slot 只能有一个 alias，physical artifact 也只能绑定一个 alias。调用方不能指定 alias、physical ID 或 createdAt；exact replay 即使 lease 已失效也只能在完整 readback 后复用原 manifest，任何 identity/content/hash/media/reservation drift 都 fail closed。

该 staged resolve 的输入仅为 `(runId, sessionId, alias)`，它在 Store 内复核 Run/Session、origin Attempt/Invocation/Reservation、artifact visibility/media/hash/bytes 与 provenance 绑定，并只返回 safe staging manifest，不返回 bytes、physical ID、principal 或 private source ID。同一 Run 的后续 Attempt 可以使用已验证的历史 alias。旧 public ref 不回填；尚无 provenance 的旧 ref 留给后续 Server gate quarantine。

WP-3B.2b.2 将 alias 切换到唯一允许公开的原子边界：`commitReceiptWithPublicEvents` 在一个 adapter critical section / SQLite transaction 内校验 active lease、`executing` reservation、canonical invocation 与 Receipt 的 tool/version/arguments/catalog/run/attempt 全匹配，再由 Store 自己生成 canonical `tool_result_presented` 和可选 `verification_updated`。成功公开验证只能是 `verificationArtifactIds=[]` 或恰为 `[outputArtifactId]`；failed/cancelled 的明确 Host 结果也生成安全 summary alias，但不生成 verification event。Receipt、reservation/invocation terminal status、连续 sequence event batch 和 immutable binding（reservation/receipt/run/attempt、original expected/first/last sequence、canonical events hash）必须全写或全不写。exact replay 只验证并返回既有 binding 的原 StoredEvent，不要求有效 lease/当前 sequence，不追加 sequence；legacy Receipt 缺 binding 或任一 identity/hash/sequence 漂移一律不重放 Host/Provider，也不回填。

WP-3B.2c.1 的 `readEventLogPage` 是只读、Store 内部的固定水位分页原语。首次调用在一个 Memory 同步 read view 或 SQLite read transaction 内先捕获 Run 的 active Attempt `last_event_sequence` 和 `MAX(events.sequence)`，二者不相等或 active Attempt 缺失即 `event_watermark_conflict`；只有二者相等才把该值作为 `throughSequence` 并读取同一视图内 `sequence <= throughSequence` 的页面。后续分页必须携带安全整数水位，且它不能高于当前 head、`afterSequence` 不能高于水位；不认识的 Run 显式 `run_not_found`，伪造/过期水位显式 conflict，绝不伪装为空页。该原语不写 Snapshot、Run、Attempt、Lease、Provider 或 Host，也不新增 migration。

SQLite WAL 记录整页，stage 写入与既有 private artifact 位于同一 B-tree 页时，新增 WAL frame 可以合法带有相邻 private row 的字节。因此 B2b.1 不声称 raw DB/WAL 不含 private artifact；安全断言仅是 provenance row、stage 新建 derivative row 和 schema 不复制 private source identity/content，且整个 stage transaction 原子回滚。

## 7. SQLite 与生产边界

M0/M1 可以复用 E3 的 SQLite 思路，但必须放在 adapter 后。Windows 原生依赖建议在短路径 worktree 验证。

SQLite 适合单机本地 Runtime，不适合多实例 Serverless 的 `/tmp`。未来 Web 服务如果跨实例恢复 Run，必须使用共享数据库和共享 Artifact Store。生产数据库在部署、并发、成本和运维约束明确后再冻结。

## 8. SSE

```text
GET /api/runs/:id/events
Last-Event-ID: <public_event_sequence>
```

要求：

- SSE `id` 使用每个 Run 单调递增的 `sequence`；`event_id` 是稳定实体 ID，不承担排序语义。
- 心跳不进入业务事件日志。
- 客户端重复收到事件时按 ID 去重。
- 终态事件后连接可关闭。
- Server 发射 SSE 与验证 `Last-Event-ID` 都必须调用同一 async `decodePublicStoredEvent + authorizePublicStoredEvent` gate；只有成功 decode、command 的 `(localPrincipalId, sessionId, runId)` scope 匹配且 exact StoredEvent identity 属于 immutable Receipt binding 的 artifact-bearing public event 才能成为 client anchor。`tool_result_presented` 逐项绑定 invocation/status/output alias，`verification_updated` 逐项绑定 Receipt verification alias；任一 ref/binding 不通过即整条 event quarantine，不能删坏 ref 后部分发射。private、unknown、malformed、旧 generic raw ref，及携带 evidenceRefs 的 `plan_updated` 都只是原始扫描中的 gap，绝不能作为 anchor，也不得使后续合法 public terminal 不可达。该 append-only M0 切片不为 retention/同一 read view 新增 Store API，未来若引入保留策略必须另行冻结 cursor 一致性。
- WP-3D 收紧 nonzero `Last-Event-ID` 的终态语义：Server 必须从 `readEventLogPage` 的固定 raw watermark 取得该 exact authorized public event。SSE 发射、cursor validation 与 public resume 共用固定 terminal predicate（仅 `run_blocked / run_completed / run_failed / run_cancelled`），不得提供可配置 override。若它是 terminal 且该固定 view 没有任一 raw tail，返回无 body、`Cache-Control: no-store` 的 `204 No Content`，使原生 EventSource 不再无意义自动重连；若 terminal 后仍有任何 raw record（即使 private、unknown 或 malformed），返回 `409 event_cursor_conflict`，不得静默跳过。其它合法 cursor 继续从后续 raw records 扫描并 quarantine 不可公开 gap；`0` 仍表示 origin。此 GET-only 切片不新增 retry、query cursor、Store schema、retention/reset、Web live 或启动 recovery，且不得调用 Provider、Host、recovery coordinator 或任一 Store 写路径。
- `GET /api/runs/:runId/resume` 的 WP-3B.2c.1 public resume snapshot 是按需、只读的 `PublicRunResumeSnapshot v1`，不是 private `RunSnapshot`，不持久化、没有 retention/reset token、SSE reset、HTTP artifact route 或 Web live 语义。它从 fixed-watermark page 最多扫描 500 条 source events，使用和 SSE 完全相同的 `decodePublicStoredEvent + authorizePublicStoredEvent` gate；private、unknown、malformed、sensitive、带 evidence 的 plan、及无 immutable Receipt binding 的 alias event 都 quarantine 后继续扫描。canonical JSON response 超过 256 KiB 或 source 上限时安全失败、绝不返回 partial。`throughSequence` 是 raw log 水位，绝不是 Last-Event-ID；`resumePoint` 只能是 `origin`（无 authorized event）或数组最后一个 exact authorized PublicRunEvent。由于 SSE 在首个合法 terminal event 后结束，若此后仍有任一 raw event，snapshot 必须 conflict，不能隐式截断或锚到不可通过 SSE 到达的事件。
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
