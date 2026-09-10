# Meliora Harness

面向国内模型的轻量 Coding Agent Harness。当前处于 M0：从 Formal R3 E3 基线提取可验证 Runtime，并冻结三人并行开发所需的公共契约。

## 开始阅读

1. [开发总纲](MELIORA_MASTER_PLAN.md)
2. [当前阶段施工单](docs/plans/CURRENT_STAGE.md)
3. [团队施工规范](docs/TEAM_WORKFLOW.md)
4. 根据任务阅读 docs/architecture 或 docs/frontend 下的专项规范

## 本地验证

~~~powershell
npm.cmd install
npm.cmd run check
~~~

当前零密钥检查包括 E3 独立 TypeScript 闭包，以及 Skill、持久化生命周期、假 Provider、固定 Host Profile 和 durable command 五组 characterization tests。

## 源码来源

E3 迁移区位于 vendor/e3-runtime，来源、commit 和迁移边界见该目录的 README。素材目录默认不进入 Git，由 Owner 按需审计和迁移。
