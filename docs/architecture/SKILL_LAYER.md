# Skill 层架构

> 状态：Draft for M0
> 版本：v0.1
> 权威范围：Skill 包格式、发现、加载、组合、版本和授权边界
> 维护者：产品 / 后端 / 架构负责人
> 上游依赖：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[Tool 层](TOOL_LAYER.md)
> 不负责：具体 Skill 文案、工具执行、Provider 协议
> 更新触发：Skill manifest、加载顺序、组合或安全边界变化

## 1. 定位

Skill 是可版本化的任务知识与执行说明包，用于告诉 Agent 何时使用哪些已有能力、读取哪些参考资料、遵循哪些验收步骤。Skill 不是插件进程，不是工具执行器，也不是权限凭证。

```text
Skill = metadata + instructions + optional references/templates/scripts
Skill != Tool
Skill != Grant
Skill != untrusted remote prompt
```

## 2. 包结构

```text
skills/<skill-id>/
  SKILL.md
  references/      optional
  templates/       optional
  scripts/         optional
  fixtures/        optional
```

`SKILL.md` frontmatter：

```yaml
id: coding-review
name: Coding Review
version: 1.0.0
description: Review a workspace change with evidence
triggers:
  - code review
required_tools:
  - read_file@1
  - search_text@1
optional_tools:
  - run_command@1
entrypoint: SKILL.md
```

Skill ID 在安装范围内唯一。版本变化遵循语义化版本。脚本与模板必须在 manifest hash 中。

## 3. 来源与信任

首期来源：

1. 产品内置 Skill；
2. 用户本地工作区 Skill；
3. 用户明确安装的外部 Skill。

同名优先级和禁用状态必须可见，不允许静默覆盖。所有 Skill 保留来源、版本、内容哈希和最后装载结果。远程内容不能在 Run 中自动变成 Skill。

## 4. 发现与加载

```text
scan allowed roots
  -> parse metadata
  -> validate package
  -> resolve exact version
  -> build concise catalog
  -> intent selects candidates
  -> load selected SKILL.md fully
  -> load only referenced resources
  -> freeze selection in Run manifest
```

Catalog 只向模型提供足以选择的 `id/name/description/triggers`。选中后才加载完整说明，防止所有 Skill 同时占满上下文。

加载失败必须产出结构化错误：缺失文件、非法 frontmatter、版本冲突、未授权工具、越界引用、编码问题或内容过大。

## 5. 与意图层的关系

- 用户显式点名 Skill 时，意图层优先选择精确 ID。
- 未显式点名时，可根据 trigger 和任务类型选取最小集合。
- 多个 Skill 同时命中时，先做兼容性检查并确定顺序。
- Skill 只能细化执行方法，不得改写用户目标、扩大目录或外部影响范围。
- Skill 指令与用户当前指令、项目规则冲突时，按上级规则处理并记录冲突。

## 6. 权限边界

Skill 声明 `required_tools` 只是依赖校验，不会获得工具。

有效工具集合：

```text
Run Tool Catalog
  intersection Skill requested tools
  intersection User/Project policy
  intersection Host capabilities
```

脚本也必须经 `run_command` 和 Action Gate 执行。Skill 中出现的删除、上传、发送、发布、密钥或生产写入指令不构成授权。

## 7. 上下文与压缩

Run manifest 保存 Skill ID、版本、哈希和加载资源。Compaction 必须保留当前仍生效的 Skill 约束和验收要求，但不必重复整份 Skill。恢复时按哈希查找同一版本；内容变化时必须创建新 attempt 或显式报告不可重现。

## 8. 输出与可观察性

前端可以显示：

- 已启用 Skill 名称和版本；
- 为什么命中；
- 加载成功、冲突或缺失；
- 它要求的验收项。

前端不默认展示完整内部提示、私有路径、敏感参考内容或脚本原文。

## 9. 首期非目标

- 不做在线 Skill 市场。
- 不允许运行中自动下载安装包。
- 不做任意远程代码执行。
- 不用 Skill 替代普通项目文档。
- 不让 Skill 动态修改 Provider、Policy 或 Tool Catalog。

## 10. 验收

- 显式与隐式命中均可用 fixture 回放。
- 同名冲突有稳定优先级和用户可见说明。
- 缺失工具时拒绝启动而非执行到一半。
- Skill 不能越权调用工具或读取范围外资源。
- 压缩与 Runtime 重启后仍能恢复同一 Skill 版本。
- 变更 Skill 内容后旧 Run 不会静默使用新内容。
