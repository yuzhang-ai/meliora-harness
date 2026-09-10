# Harness 链路架构

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：Run/Turn 状态机、Provider 调用、Context、Compaction、循环与完成判定
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)
> 不负责：工具权限细节、UI 布局、数据库实现
> 更新触发：状态机、Canonical Protocol、压缩或完成判定变化

## 1. Harness 的职责

Harness 负责把一次用户请求推进为可恢复、可观察、可验证的 Run。它协调模型、上下文、工具、持久化和输出，但不亲自操作文件、不实现 Provider 私有协议、不把模型文本直接认定为完成事实。

```text
submit turn
  -> persist user intent
  -> build context
  -> call provider codec
  -> normalize stream
  -> append public/private events
  -> assemble tool calls
  -> execute authorized tools
  -> persist observations
  -> decide continue / compact / approve / complete / fail
```

## 2. 核心实体

- **Session**：一个工作区中的长期对话容器。
- **Turn**：一次用户输入及其触发的完整处理。
- **Run**：Turn 的一次可恢复执行实例。
- **Model Step**：一次 Provider 请求和响应。
- **Tool Invocation**：一次规范化工具调用。
- **Receipt**：工具执行及验证的不可混淆证据。
- **Artifact**：大文本、diff、日志或摘要的可寻址内容。

ID 由 Runtime 生成，不使用 Provider 返回 ID 作为内部主键。Provider Tool Call ID 只作为协议映射字段保存。

## 3. Run 状态机

```text
created
  -> preparing
  -> model_streaming
  -> tool_assembling
  -> awaiting_approval | executing_tools | compacting
  -> model_streaming
  -> verifying
  -> completed | failed | cancelled | blocked
```

规则：

- 终态不可回退，恢复操作创建新的 attempt。
- 状态变化先持久化，再向前端投影。
- 同一个 Run 同时只有一个有效 lease owner。
- `awaiting_approval` 不占用 Provider 请求。
- `cancelled` 必须停止流、工具和子进程树，并留下终态事件。
- `blocked` 需要机器可读原因和用户可执行的解除条件。

## 4. Canonical Model Protocol

Agent Runtime 只认识统一输入和统一事件：

```ts
type CanonicalInput =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

type ModelEvent =
  | AssistantTextDelta
  | ReasoningDelta
  | ToolCallStarted
  | ToolArgumentsDelta
  | ToolCallCompleted
  | UsageUpdated
  | ModelStepCompleted
  | ModelStepFailed;
```

Provider Codec 独立负责：

- 请求字段和角色转换；
- thinking/reasoning 的接收与私有边界；
- 流式分片和多 Tool Call 聚合；
- `tool_call_id`、finish reason、usage 和 cache 字段；
- Provider 错误到统一错误类型的映射；
- 超时、限流和明确允许的重试。

Codec 不执行工具、不审批、不写业务状态、不决定任务是否完成。

每个 Codec 必须有无密钥 fixture，覆盖文本成功、单工具、多工具、参数分片、非法 JSON、缺失/重复 ID、限流、断流和 usage 缺失。

## 5. Context Engine

上下文分四层：

| 层 | 内容 | 生命周期 |
|---|---|---|
| Stable | 系统规则、项目规则、工具目录、Skill 摘要 | 多 Turn |
| Working | 当前目标、约束、计划、未完成事项 | 当前 Run 持续 |
| Recent | 近期原始消息与工具观察 | token 允许范围 |
| Historical | 结构化摘要、验证结果、artifact 引用 | 多 Turn |

组装顺序固定，且生成 `context_manifest`，记录来源、版本、哈希、可见性和 token 估算。任何被送入模型的关键任务事实必须已持久化。

## 6. Compaction

触发条件由预算而不是固定消息数决定：

- 预计下一个 Model Step 会超过软预算；
- 工具输出过大；
- 长 Run 到达 checkpoint；
- Provider context limit 改变。

结构化摘要至少保留：

```text
goal
user_constraints
accepted_decisions
completed_work
workspace_changes
verification_state
failed_attempts
open_risks
pending_approvals
next_actions
artifact_refs
source_event_range
```

压缩过程必须记录压缩前后 token 估算、输入事件范围、摘要版本和被移出 prompt 的 artifact。压缩不得丢失用户否定项、审批状态、失败尝试和未验证声明。

## 7. 循环与重试

- Model Step 只在前一步已持久化后启动。
- 只读工具在符合 Policy 时可并行，有副作用工具默认串行。
- Provider 网络错误可重试；工具副作用不能因 Provider 重试而重放。
- 每个 Tool Invocation 使用 idempotency key 和 durable reservation。
- 达到 step、token、费用或时间预算时，进入 `blocked` 或请求用户选择，不伪装完成。
- 恢复时从最后一个 durable checkpoint 重放状态，而不是重放副作用。

## 8. 完成判定

模型可以提出 outcome，Host 才能确认终态。

`completed` 必须同时满足：

1. 没有未决工具调用和审批。
2. 所有承诺写入都有成功 Receipt。
3. 要求的验证命令已执行且结果可寻址。
4. 最终输出中的完成声明能关联证据。
5. 持久化已写入终态事件。

如果修改完成但验证未运行，状态是 `blocked` 或带明确未验证项的非成功结果，不得标记完整完成。

## 9. Characterization Tests

从 E3 抽离前先固定以下行为：

- 一次纯文本完成；
- 单次和连续多次 Tool Call；
- 参数跨多个 delta；
- 上下文压缩后继续；
- 审批等待与恢复；
- Provider 断流和重试；
- 工具完成后 Runtime 崩溃并恢复；
- 取消后无继续执行；
- 完成声明缺少证据时被拒绝。

这些测试是删除 UX/Canvas 依赖的护栏。先让独立 Meliora 闭包通过，再做物理搬迁。
