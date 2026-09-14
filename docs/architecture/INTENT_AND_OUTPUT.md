# 意图与结果输出架构

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：用户意图、任务契约、计划、公开事件、完成声明和最终回复
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[Harness 链路](HARNESS_CHAIN.md)
> 不负责：视觉样式、Provider 私有流、工具实现
> 更新触发：Intent Contract、Public Event 或 Outcome Contract 变化

## 1. 目标

这一层把自然语言请求转换为可执行、可追踪的 Task Contract，并把 Runtime 事实转换为用户能理解的过程与结果。它不假装能一次性完美分类意图，而是持续维护目标、范围和完成条件。

```text
User message
  -> Intent Snapshot
  -> Task Contract
  -> Plan / Constraints / Acceptance
  -> Harness events
  -> Public projection
  -> Outcome proposal
  -> Host verification
  -> Final response
```

## 2. Intent Snapshot

```ts
interface IntentSnapshot {
  objective: string;
  mode: "answer" | "diagnose" | "change" | "build" | "review" | "monitor";
  scope: string[];
  exclusions: string[];
  constraints: string[];
  deliverables: string[];
  acceptance: string[];
  requiresClarification: boolean;
  clarificationReason?: string;
  confidence: "high" | "medium" | "low";
}
```

意图不是模型自由文本的最终真理。低风险缺省可以继续执行；会改变目标、扩大授权、影响外部系统或造成破坏的歧义必须询问。

## 3. 任务变化

同一 Session 中的新用户消息按以下规则处理：

- 明确替换目标：取消或收束旧 Run，创建新 Turn。
- 补充约束：写入当前 Task Contract，并让后续步骤遵守。
- 询问进度：从 durable state 生成状态，不改变原任务。
- 批准或拒绝：只作用于绑定参数哈希的审批请求。
- 与当前工作无关：创建新 Turn，不混入当前完成判定。

所有重大变化保存 `intent_revision`，说明来源消息和改变字段。

## 4. Plan

Plan 是 Runtime 状态，不是装饰性待办列表。每项包含 `pending / in_progress / completed / blocked / skipped`，完成项必须关联 Receipt 或验证证据。

计划可以被模型更新，但 Host 验证状态转换。细粒度内部思考不公开，用户看到的是目标、正在做什么、阻塞和下一步。

## 5. Public Event Contract

前端只消费公开事件：

```ts
type PublicRunEvent =
  | RunStatusChanged
  | AssistantTextDelta
  | PlanUpdated
  | ToolCallPresented
  | ApprovalRequested
  | ToolResultPresented
  | ContextCompacted
  | VerificationUpdated
  | RunBlocked
  | RunCompleted
  | RunFailed
  | RunCancelled;
```

每个事件包含：

```text
event_id
schema_version
session_id
run_id
sequence
timestamp
kind
payload
visibility=public
```

禁止进入公开事件：API Key、Authorization、完整环境变量、私有 reasoning、未脱敏原始日志、隐藏系统提示、超范围文件内容。

M0 尚未冻结独立的 Server-owned assistant summary。因此任何 Provider assistant 原文（包括首次 Model Step、用户输入的逐字/片段/编码回显）都只能写入 private model events 与 private model-history artifact，绝不可直接成为 `assistant_text_delta` 的公开 payload。Runtime 可以发不含原文的固定安全提示；工具调用展示、Server-owned 工具结果投影和最终 Run outcome 按各自契约继续公开。未来若要公开助手内容，必须先在本层冻结来源独立、可审计的 summary 契约，不能复用 Provider raw text。

WP-3B.2a 的共享 `decodePublicStoredEvent`（从 `packages/agent-runtime` 正式导出）是唯一把持久化 `StoredEvent` 加上 Server 已解析的 `sessionId` 还原为 `PublicRunEvent` 的运行时 decoder。它是纯函数，只产生 `public / suppressed / invalid`：private 记录被 suppressed；public 记录必须逐 kind 满足本节已冻结的 envelope、payload exact keys、必填类型、枚举和嵌套 `PublicArtifactRef { artifactId, visibility: "public" }` 形状，并对最终公开 envelope（含 event/run/session identity 与 payload）再次经过敏感值扫描；未知、畸形、或敏感的 public 记录一律 invalid。它不修复、丢字段投影或补造 payload，也不在本切片新增字符串边界、ID 格式、时间精度、数组去重或数量限制。

## 6. 结果投影

同一底层结果有三个不同视图：

| 视图 | 目的 | 内容 |
|---|---|---|
| Runtime | 恢复与审计 | 完整结构化状态，敏感字段受控 |
| Model | 决策下一步 | 截断、脱敏、可引用 observation |
| Public UI | 用户理解 | 摘要、状态、diff、验证和可操作按钮 |

三者禁止共用一个未经处理的 payload。

公开事件中的 artifact/evidence 引用必须使用带 `visibility=public` 的 `PublicArtifactRef`。B2b.2 中的 `artifactId` 是 Store 生成的 opaque staged alias，绝不是内部物理 Artifact ID；它只能由 matching durable Receipt 的原子 Store-owned event batch 引用，且 public `tool_result_presented` 必须精确匹配 invocation/status/output alias，`verification_updated` 的 evidence alias 必须在该 Receipt 的 verificationArtifactIds。SSE 与 cursor 以 exact StoredEvent binding、Run/Session/local principal scope 为最终 gate；alias 单独存在、旧 generic raw ref、复制 alias 的另一 event 或非空 evidenceRefs 的 `plan_updated` 均不得公开或成为 anchor。该 alias 不返回 bytes/physical ID，也不新增 HTTP/UI artifact read。WP-3 的 private recovery snapshot 不是 public resume snapshot；public snapshot/resume-point 会在单独的 projector/SSE 契约中冻结，不能用 private artifact ref 旁路本层边界。

## 7. Outcome Contract

```ts
interface TurnOutcome {
  status: "completed" | "blocked" | "failed" | "cancelled";
  summary: string;
  deliverables: DeliverableRef[];
  verification: VerificationRef[];
  unresolved: string[];
  userActions: string[];
  evidenceRefs: string[];
}
```

模型提交 outcome proposal，Completion Checker 对照 Task Contract、Plan、Receipt 和验证状态决定是否接受。

最终回复按任务相关性最小化，但必须区分：

- 已完成；
- 已验证；
- 尚未验证；
- 失败或阻塞原因；
- 需要用户处理的动作。

## 8. 输出语言

- 默认跟随用户语言，首期重点支持简体中文。
- 先说结果，再说证据和下一步。
- 不暴露 chain-of-thought；可提供简洁的依据摘要。
- 不把“代码已写”描述为“功能已验证”。
- 路径、命令、提交和部署状态分别报告。
- 流式文字只是临时展示，终态必须从 durable outcome 重建。

## 9. 验收 fixtures

- 直接回答，无工具。
- 模糊但可低风险推进。
- 必须澄清授权范围。
- 中途追加约束。
- 中途替换目标。
- 工具成功但验证失败。
- 审批拒绝。
- Runtime 重启后恢复输出。
- 私有 reasoning 与敏感工具结果不会出现在 Public Event。
