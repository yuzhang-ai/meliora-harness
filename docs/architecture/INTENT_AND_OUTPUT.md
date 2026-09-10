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
timestamp
kind
payload
visibility=public
```

禁止进入公开事件：API Key、Authorization、完整环境变量、私有 reasoning、未脱敏原始日志、隐藏系统提示、超范围文件内容。

## 6. 结果投影

同一底层结果有三个不同视图：

| 视图 | 目的 | 内容 |
|---|---|---|
| Runtime | 恢复与审计 | 完整结构化状态，敏感字段受控 |
| Model | 决策下一步 | 截断、脱敏、可引用 observation |
| Public UI | 用户理解 | 摘要、状态、diff、验证和可操作按钮 |

三者禁止共用一个未经处理的 payload。

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
