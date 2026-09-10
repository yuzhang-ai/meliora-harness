# 团队施工与 GitHub 规范

> 状态：Active
> 版本：v0.1
> 权威范围：三人分工、上下文交接、分支、PR、Issue 和集成顺序
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../MELIORA_MASTER_PLAN.md)
> 不负责：各模块技术契约和当前任务状态
> 更新触发：成员所有权、GitHub 流程或长期协作规则变化

## 1. 一个仓库

所有当前代码、文档、fixtures、Issue 和 PR 统一维护在：

```text
https://github.com/yuzhang-ai/meliora-harness
```

不使用 ZIP、网盘副本、聊天附件或个人仓库交换“最新代码”。GitHub 用户名未确定不阻塞当前文档和模块边界；确定后再补 CODEOWNERS。

## 2. 建议初始分工

| 成员 | Owner 角色 | 长期边界 | M0/M1 重点 |
|---|---|---|---|
| 你 + Codex | 产品 / 后端 / 架构 | Agent Runtime、Provider、Context、Tool、Skill、共享契约 | E3 抽离、独立闭包、Workspace Host、Codec fixtures |
| 张子恒 | Web Product Owner | `apps/web`、设计系统、交互状态、浏览器验收 | BoardUI 视觉审计、Web Shell、SSE fixture replay |
| 秦峻溥 | Persistence / Integration Owner | Session Store、schema/migration、Server 集成、CI | Store Port、SQLite adapter、恢复与幂等测试 |

这是推荐的初始映射。两位成员可以互换岗位，但模块所有权边界不随人临时漂移。正式调整只改本表和 CODEOWNERS。

共享契约目录由产品 / 后端 / 架构 Owner 审查：

```text
packages/model-protocol
packages/agent-runtime/contracts
packages/tool-runtime/contracts
packages/session-store/contracts
apps/server/api-contracts
fixtures/contracts
MELIORA_MASTER_PLAN.md
docs/architecture
```

## 3. Context Packet

成员不需要阅读全部聊天和全部 E3 仓库。每个任务必须提供：

```text
Task title
Owner
Base SHA
Required docs
Problem
In scope
Out of scope
Allowed directories
Contracts consumed
Contracts produced
Fixtures
Acceptance checks
Commands
Security constraints
Dependencies
Expected PR
```

### 张子恒首包

```text
Task: Web conversation shell with replayable events
Required docs: VISUAL_SYSTEM, INTENT_AND_OUTPUT, PERSISTENCE_AND_EVENTS, CURRENT_STAGE
In scope: apps/web, frontend-only fixture adapters
Out of scope: Provider, tool execution, DB implementation
Contracts consumed: PublicRunEvent, RunSnapshot, ApprovalRequest
Fixtures: read-only-success, approval-required, tool-failure, cancelled, reconnecting
Acceptance: typecheck, component tests, browser fixture replay, responsive review
Expected PR: 可独立浏览器验收的 Draft PR
```

### 秦峻溥首包

```text
Task: Durable Session Store adapter and server skeleton
Required docs: PERSISTENCE_AND_EVENTS, HARNESS_CHAIN, TOOL_LAYER, CURRENT_STAGE
In scope: packages/session-store, apps/server persistence composition, migrations
Out of scope: Agent decisions, Provider, Web UI
Contracts consumed: SessionStorePort and canonical events
Contracts produced: SqliteSessionStore adapter
Fixtures: normal replay, duplicate invocation, crash recovery, sequence conflict
Acceptance: contract tests, migration tests, recovery tests, sensitive field scan
Expected PR: adapter + migration + tests + verification evidence
```

## 4. 分支与 PR

```text
main
feat/runtime-<topic>
feat/web-<topic>
feat/store-<topic>
fix/<topic>
chore/<topic>
```

- 禁止直接向 `main` 推送。
- 每个分支只服务一个可验收目标，从最新 `main` 创建。
- 默认 squash merge，PR 标题成为主线提交标题。
- 大于约 600 行人工 diff 时优先拆分；生成文件和 fixture 单独解释。
- 不在功能 PR 中顺手重构其他 Owner 的目录。
- 发布、部署和生产迁移不因 PR 合并自动获得授权。

PR 模板必须包含：问题、范围/非范围、契约影响、自动验证、人工验证、风险、回滚、文档更新。

## 5. Contract-first

共享契约先通过小 PR 冻结类型、示例事件和 fixtures，再并行实现。契约未合并前，调用方只使用 Draft PR 或约定 fixture，不得各自复制和改名。

同一时间只允许一个修改同一共享契约的 PR 进入 Ready。契约合并后，受影响分支立即同步 `main`。

## 6. GitHub 保护

`main` 建议启用：

- 必须通过 PR；
- 至少 1 人批准；
- typecheck、unit、fixture replay 必须通过；
- review conversation 必须解决；
- 禁止 force push；
- 禁止删除 `main`。

GitHub 用户名齐全后添加 CODEOWNERS。共享契约由架构 Owner，Web 由张子恒，Store/Server integration 由秦峻溥。

## 7. Issue 状态

只使用 Architecture/Contract、Feature Slice、Defect 三类 Issue。

```text
Backlog -> Ready -> In Progress -> In Review -> Verified -> Done
```

Ready：Owner、Context Packet、输入契约/fixture、验收命令和目录范围全部明确。

Done：PR 已合并、required checks 通过、真实路径验证完成、必要 UI 人工验收有记录、稳定事实变化已更新权威文档。

## 8. 集成顺序

1. 共享 contracts 与 fixtures。
2. 秦峻溥的 Store Port 和 Server skeleton。
3. 你的只读 Runtime 和 Workspace Host。
4. 张子恒的 Web UI 接真实 SSE。
5. DeepSeek/Kimi canary。
6. 浏览器端到端验收。

并行的关键不是三个人同时改同一文件，而是用稳定契约和 fixtures 让每条线可以独立通过验收。
