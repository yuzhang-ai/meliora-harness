# Meliora 开发总纲

> 状态：Active
> 版本：v0.2
> 最后更新：2026-09-10
> 权威范围：产品定位、不可漂移原则、源码基线、目标模块边界、文档治理与里程碑
> 维护者：产品 / 后端 / 架构负责人
> 不负责：各子系统的详细接口和当前任务进度

## 1. 产品定位

Meliora 是面向国内模型的轻量 Coding Agent Harness。它不是完整 IDE，也不是页面编辑器。第一阶段先把类似 Codex 的核心闭环跑通，并重点解决 DeepSeek、Kimi、MiniMax 等模型在工具协议、流式输出、上下文压缩和长任务恢复上的差异。

第一阶段产品形态是本地 Web 应用：浏览器负责交互，本机 Node.js Runtime 负责模型、文件、Git、Shell、Session 和工具执行。纯浏览器不得直接访问工作区。

目标链路：

```text
用户输入
  -> 意图与任务状态
  -> Context Engine
  -> Provider Codec
  -> 模型流式输出
  -> Tool Call Assembler
  -> Schema Validation
  -> Action Gate
  -> Workspace Host
  -> Receipt / Evidence
  -> Completion Checker
  -> 继续、等待审批、完成或明确阻塞
```

## 2. 文档体系

Meliora 以一组相互链接的权威文档作为统一开发标准，不以某一份超长文档包办所有事实。

| 文档 | 唯一权威内容 | 主要读者 |
|---|---|---|
| 本文 | 产品定位、稳定原则、源码基线、模块边界、文档治理 | 全员 |
| [Harness 链路](docs/architecture/HARNESS_CHAIN.md) | Run/Turn 状态机、Provider、Context、压缩、完成判定 | 后端、集成 |
| [Tool 层](docs/architecture/TOOL_LAYER.md) | Tool Catalog、权限、Host Port、Receipt、安全规则 | 后端、集成 |
| [Skill 层](docs/architecture/SKILL_LAYER.md) | Skill 发现、装载、组合、授权边界与版本 | 后端、产品 |
| [意图与输出层](docs/architecture/INTENT_AND_OUTPUT.md) | 用户意图、计划、公开事件、最终输出契约 | 全员 |
| [持久化与事件](docs/architecture/PERSISTENCE_AND_EVENTS.md) | Session 数据模型、事件日志、幂等、恢复、SSE | 后端、数据、前端 |
| [前端视觉与交互规范](docs/frontend/VISUAL_SYSTEM.md) | BoardUI 参考、布局、组件、状态、可访问性 | 前端、产品 |
| [团队施工规范](docs/TEAM_WORKFLOW.md) | 三人分工、GitHub、PR、上下文包、集成顺序 | 全员 |
| [当前阶段施工单](docs/plans/CURRENT_STAGE.md) | 当前里程碑、工作包、依赖、验收与状态 | 全员 |

文档依赖方向：

```text
开发总纲
  |- Harness 链路
  |    |- Tool 层
  |    |- Skill 层
  |    |- 意图与输出层
  |    `- 持久化与事件
  |- 前端视觉与交互规范
  |- 团队施工规范
  `- 当前阶段施工单（引用以上全部，不重新定义契约）
```

### 2.1 一条事实只有一个家

- 专项文档拥有其接口和规则，其他文档只链接，不复制完整定义。
- `CURRENT_STAGE.md` 可以频繁更新，但不得悄悄改变稳定架构。
- Issue 维护任务状态，PR 维护 diff 和验证证据，不能替代架构文档。
- 代码、自动测试和真实运行结果与文档冲突时，以当前事实为准，并在同一修复中更新文档。
- 历史 E3 文档、旧项目说明和聊天记录只作为来源，不是 Meliora 的当前规范。

### 2.2 每份权威文档必须声明

```text
状态
版本
权威范围
维护者
上游依赖
不负责
更新触发条件
```

架构契约变化必须通过 PR，同时更新拥有该事实的文档、相关 fixture 和测试。仅实现细节变化时，不扩写主文档。

## 3. 源码基线

Meliora Runtime 以 Formal R3 E3 Harness 的 annotated tag 为主基线：

```text
Source repository: https://github.com/ImlittleA/zhiqu.git
Annotated tag: ai-landing-page-harness-e3-minimum-integration-go-20260906
Tag object: a0d962431278f09c0a0bc6528f420a9b827c2229
Baseline commit: 455c7aebe0ba644f9096e872ce7c8275cfa45281
E3 compile entry: apps/demo/tsconfig.landing-page-harness-e3.json
Target repository: https://github.com/yuzhang-ai/meliora-harness
```

截至 2026-09-10 的核验结论：

- annotated tag 的 peeled commit 为 `455c7aeb`。
- E3 编译闭包包含 100 个本地文件、约 51,460 行，`tsc --noEmit` 通过。
- Canvas 不是 5 万行闭包的主体。完整 Canvas Runtime 约 5,071 行，E3 实际传递依赖的 Canvas Port 子集约 1,819 行。
- 旧远端分支 `codex/ai-landing-page-r2-integration-next` 当前不可作为可靠基线。
- 旧 Windows worktree 有状态噪声，新开发必须从 tag 建立干净 worktree。

继承策略：

1. 继承 E3 Harness Runtime，不继承完整 UX 页面编辑器产品。
2. 暂时保留 `E3S1UxHostPort` 作为回归接缝。
3. 新建 `WorkspaceHostPort`，承接文件、Git、Shell 和 Patch。
4. 先建立 Meliora 独立编译闭包和 characterization tests，再删除 UX 依赖。
5. 迁移过程保留来源、许可证和验证证据，不整仓复制历史素材与依赖产物。

WhaleCode 只作为 Coding 工具、CLI、路径安全和局部 UI 的次级来源。旧素材包只作为交互和视觉资产来源。官方 DeepSeek Harness 可作为 Provider、Compaction、MCP/ACP 与测试策略参考。

## 4. 不可漂移原则

1. **Truth One**：工作区文件、Git、命令和验证结果是项目事实，模型文本不是事实。
2. **Tool One**：一个 Run 使用一个冻结且可哈希的 Tool Catalog，执行中不能隐式扩权。
3. **Authority One**：外部影响动作经过 principal、policy、approval、executor 和 receipt。
4. **Public One**：私有输入、reasoning、凭证和原始敏感结果不得直接成为前端事件。
5. **Evidence One**：只有 Receipt、readback 和 verification 闭合后才能声明完成。

补充原则：

- Skill 不是 Grant，只能组合当前 Run 已授权的工具。
- Model-visible 等于 durable。发给模型的任务事实必须可从事件或 artifact 重建。
- Provider 差异只停留在 Codec 内。
- Host 差异只停留在 Host Port 内，Agent 不直接调用 fs、Git 或 Shell。
- Provider 响应丢失不能导致有副作用工具被盲目重放。
- 页面显示成功不等于 Runtime、持久化和验收成功。
- 对外发布、生产写入、密钥和删除始终保留明确人工确认点。

## 5. 目标模块

```text
apps/web                 React Web UI
apps/server              HTTP commands + SSE public events
packages/agent-runtime   Run / Turn / State Machine / Completion
packages/model-protocol  Canonical messages and stream events
packages/providers       DeepSeek / Kimi / MiniMax codecs
packages/context-engine  Context assembly and compaction
packages/tool-runtime    Catalog / validation / gate / receipt
packages/workspace-host  FileSystem / Git / Shell / Patch ports
packages/skill-runtime   Skill discovery / loading / composition
packages/session-store   Event log / artifact / persistence adapters
fixtures                  Provider and session replay evidence
```

公共依赖方向：

```text
Web -> Server contracts
Server -> Agent Runtime
Agent Runtime -> Model Protocol + Context + Tool Runtime + Session Store ports
Provider codecs -> Model Protocol
Tool Runtime -> Workspace Host ports
Skill Runtime -> Tool declarations, never executors
Adapters -> Ports, never the reverse
```

禁止业务层直接依赖具体 Provider SDK、`better-sqlite3`、浏览器组件或 UX Editor 类型。

## 6. 第一阶段范围

MVP 必须具备：

- DeepSeek 和 Kimi 至少各一个真实只读 Coding Run。
- 无 API Key 的 Provider fixture replay。
- 多轮、多工具调用和工具结果正确回填。
- 可恢复的上下文压缩，保留目标、约束、进度、失败与下一步。
- Session 在 Runtime 重启后恢复。
- SSE 断线重连和页面刷新不重复 Provider 调用或副作用。
- Patch 展示 diff 后审批，Shell 支持超时、取消和子进程清理。
- 最终完成声明由 Receipt、readback 和 verification 支撑。
- 前端只接收 public projection，不泄露 API Key、Authorization 和私有 reasoning。

第一阶段明确不做：完整 IDE、UX 页面编辑器、Canvas 产品、多人实时协作、云端计费、面向最终用户的 Runtime Subagent / 自动委派产品能力、完整 MCP 市场、自动发布和无审批写入。生产共享数据库和桌面安装包暂不冻结。开发期间由 Codex 使用子 Agent 做并行实现与独立审查，属于团队施工方式，不代表该产品能力进入 M0/M1 范围。

## 7. 决策与变更

当前已决事项：

- E3 `455c7aeb` 是 Runtime 主基线。
- 首个形态是本地 Web。
- `WorkspaceHostPort` 替换 UX Host 的 Coding 能力，旧 Host 暂留作回归接缝。
- 所有人在 `yuzhang-ai/meliora-harness` 单仓库协作。
- 使用多文档权威体系，主文档是总纲与索引，不是所有细节的唯一容器。
- BoardUI AI Chat 是前端布局和交互参考，不是架构依赖。

变更稳定决策时，PR 必须写明：旧决策、替代决策、原因、迁移影响、回滚方式、受影响文档和 fixture。

## 8. 当前入口

现在唯一应执行的阶段任务见 [当前阶段施工单](docs/plans/CURRENT_STAGE.md)。开始任何任务前，成员只需阅读本文、自己负责的专项文档，以及该施工单中分配给自己的工作包。
