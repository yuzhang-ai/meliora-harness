# Tool 层架构

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：Tool Catalog、调用契约、Action Gate、Workspace Host、Receipt 与安全策略
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[Harness 链路](HARNESS_CHAIN.md)
> 不负责：Skill 内容、Provider 协议、前端视觉
> 更新触发：工具 schema、权限等级、Host Port 或 Receipt 变化

## 1. 分层

```text
Model Tool Call
  -> Tool Call Assembler
  -> Schema Validator
  -> Tool Registry
  -> Action Gate
  -> Executor
  -> Workspace Host Port
  -> Result Projector
  -> Receipt + Observation
```

Registry 描述能力，Gate 决定是否允许，Executor 只执行已授权调用，Host Port 隔离操作系统差异，Projector 决定哪些结果进入模型和 UI。

## 2. Tool Definition

每个工具至少声明：

```ts
interface ToolDefinition {
  name: string;
  version: string;
  description: string;
  inputSchema: JsonSchema;
  risk: "L0" | "L1" | "L2" | "L3";
  timeoutMs: number;
  outputLimit: number;
  capabilities: string[];
  cancellation: "cooperative" | "process-tree" | "none";
  projector: string;
}
```

一个 Run 开始时冻结 Tool Catalog 并计算哈希。运行中增加 Skill 或 Provider 不能改变该 Catalog，除非用户明确发起新的授权边界和 Run attempt。

## 3. 第一阶段工具集

| Tool | 风险 | 默认策略 | 关键验证 |
|---|---:|---|---|
| `list_files` | L0 | allow | 路径仍在 workspace |
| `read_file` | L0 | allow | 大小、编码、敏感投影 |
| `search_text` | L0 | allow | 范围、结果上限 |
| `git_status` | L0 | allow | 仓库根与 porcelain 输出 |
| `git_diff` | L0 | allow | 路径范围与截断 |
| `update_plan` | L0 | allow | 仅内部状态 |
| `run_command` | 动态 | allow/ask/block | 命令、cwd、超时、退出码 |
| `apply_patch` | L2 | ask | patch、目标、readback、diff |
| `write_file` | L2 | ask | 目标、内容哈希、readback |
| `submit_turn_outcome` | L0 | allow | Completion Checker |

风险不是固定 UI 标签。`run_command` 会根据命令、路径、网络、凭证、删除和外部影响动态升级。

## 4. Action Gate

Gate 输入：

```text
principal
workspace
run_id
tool_definition
normalized_arguments
catalog_hash
policy_version
current_grants
prior_receipts
```

Gate 输出只能是 `allow`、`ask` 或 `block`，并包含 reason code。审批请求必须展示工具、规范化参数、影响范围、风险、可撤销性和超时。审批绑定参数哈希，参数变化后旧批准失效。

禁止：

- 用 Skill 名称替代 Tool Grant；
- 让模型生成的文字跳过 Gate；
- 复用 Canvas/UX grant 执行 Workspace 写入；
- 通过别名、软链接、大小写或 `..` 越出工作区；
- 在日志、Receipt、UI 或模型上下文中回显密钥。

## 5. Workspace Host Port

```ts
interface WorkspaceHostPort {
  files: FileSystemPort;
  git: GitPort;
  shell: ShellPort;
  patch: PatchPort;
}
```

Host 规则：

- 所有路径先规范化为绝对路径，再验证位于已选 workspace 根内。
- 文件读取有字节上限、编码说明和截断标记。
- Shell 使用显式 cwd、环境变量 allowlist、超时和进程树取消。
- Git 操作区分只读与写入；提交、推送、强制操作单独授权。
- Patch 应先解析、预览和检查目标版本，再应用并 readback。
- Windows 路径需覆盖空格、中文、盘符、大小写和 junction。

E3 迁移期结构：

```text
E3 Harness -> E3S1UxHostPort       (回归接缝，暂留)
           -> WorkspaceHostPort     (Meliora 新能力)
```

两者不共享隐式权限。

## 6. Receipt

```ts
interface ToolReceipt {
  invocationId: string;
  toolName: string;
  toolVersion: string;
  argumentsHash: string;
  catalogHash: string;
  decision: "allow" | "approved";
  startedAt: string;
  endedAt: string;
  status: "succeeded" | "failed" | "cancelled";
  effectSummary: string;
  outputArtifactId?: string;
  verificationArtifactIds: string[];
  redactions: string[];
}
```

Receipt 是事实证据，不是模型摘要。大输出写 Artifact，Receipt 只存寻址信息和安全摘要。写入类工具还需保存 before/after hash、readback 或 Git diff。

## 7. 幂等与失败

- 执行前创建 invocation reservation。
- 同一 idempotency key 重复请求返回既有状态，不再次执行。
- 超时与未知结果必须标记 `outcome_unknown`，先 readback 再决定恢复。
- Provider 重试不得重新提交已经成功或结果未知的写入。
- 取消命令后验证子进程树已终止。

## 8. 测试矩阵

- Schema 合法、缺字段、额外字段、超大参数和非法 JSON。
- Workspace 内外路径、软链接、junction、大小写和 Unicode。
- allow/ask/block 及批准参数被篡改。
- 幂等重复、崩溃恢复、超时和结果未知。
- Patch 冲突、部分应用、readback 和 diff。
- 输出截断、敏感字段脱敏、模型投影和 UI 投影不同。
- Windows Shell 取消和子进程清理。
