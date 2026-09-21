# WP-5 指定网关真实模型验收记录

> 状态：原两个 HTTP 客户端 canary 通过；PR #39 已复审批准并合并；浏览器首提另见独立记录
> 日期：2026-09-20
> 事实基线：`main@8df42a7264dee91be56821962a04b12f4f9f7c1f`
> 施工现场：独立 worktree `codex/wp5-gateway-canary`；原主工作区既有修改未改动
> 权威契约：[Harness 链路](../architecture/HARNESS_CHAIN.md)、[持久化与事件](../architecture/PERSISTENCE_AND_EVENTS.md)

## 执行卡与边界

- 目标：仅用用户批准的两个 OpenAI-compatible 网关，对 DeepSeek、Kimi 各执行一次真实、付费、只读 Coding Run，并核对工具 Receipt、公开 SSE、重启恢复和凭证隔离。
- 输入：本机进程环境中的凭证与 Server-only gateway 配置；两个无敏感内容的临时 Git 仓库。网页、Run 消息和模型输出均不得指定 endpoint 或密钥。
- 允许动作：合成工作区上的只读工具、一次性模型请求、脱敏的本地验收记录与针对性代码修复。不得触碰用户真实项目文件、重新发起结果未知的付费 Command、对公网部署或自动合并。
- 人工确认：对外公开 PR、部署、密钥轮换及真实工作区试运行均独立确认。官方 API 直连不是本次验收范围。
- 停机条件：出现凭证泄露、非只读工具调用、结果未知或异常重复计费时立即停止真实请求，保留现场只做读回。
- 证据层级：Provider/Store/SSE 属真实运行；网页刷新恢复属浏览器可见；无密钥测试与独立审查属静态/模拟验证。各层不相互冒充。

## 真实运行证据

| 检查 | DeepSeek 指定网关 | Kimi 指定网关 |
|---|---|---|
| 工作区 | 独立空 Git 仓库 | 独立空 Git 仓库 |
| 真实 Run | `run_completed` | `run_completed` |
| 工具与 Receipt | `git_status` 只读调用，1 Receipt | `git_status` 只读调用，1 Receipt |
| 公开输出 | SSE 12 条，未见凭证 | SSE 12 条，未见凭证 |
| 重启恢复 | 原 SQLite + dummy key，`GET /resume` 200，终态 cursor 204 | 原 SQLite + dummy key，`GET /resume` 200，终态 cursor 204 |
| 重启后调用 | 未再次请求 Provider；Receipt 仍为 1 | 未再次请求 Provider；Receipt 仍为 1 |
| 凭证落盘扫描 | SQLite、WAL、SHM 未检出当前凭证字节 | SQLite、WAL、SHM 未检出当前凭证字节 |

DeepSeek 首次测试请求因客户端 schema 不合规返回 `400 invalid_request`，随后仅提交一次有效 Run；不能将前述 400 计作模型调用成功。Kimi 一次有效 Run 产生 1,331 条 raw event（其中大量 private reasoning）与 2 个 Model Step。原 public resume 的 500 条扫描上限令该 Run 刷新返回 413；修复后上限为 5,000 条，保留 256 KiB 公开响应上限和 fail-closed 行为。使用同一原始 SQLite、dummy key 复验后 `/resume` 返回 12 条公开事件，`throughSequence=1331`，与 SSE 精确一致，未新增模型调用或 Receipt。

## 浏览器可见验收

使用上述已完成的 Kimi Run、dummy key 的本地 Server 与 Vite：浏览器加载及刷新后均显示「任务已完成」；390px 手机宽度无横向溢出；观察到 `POST=0`、`GET /resume=2`、页面异常 `0`。这是**真实模型结果的浏览器只读恢复**，不是浏览器首次提交真实模型新 Run 的验收。

## 机器门禁与独立审查

- `npm.cmd run check` 通过：TypeScript、Contracts、Provider、Runtime、Store、Server、E3、Web 30/30 与 production build。
- Provider 26/26；Server/SSE 86/86；针对网关配置与大私有事件前缀的回归已纳入根 check。
- 独立审查：`gpt-5.6-terra` high，只读复核，PASS，未发现 P0/P1/P2。审查未接触凭证，也未发起真实模型调用。

## PR #39 复审与合并

秦峻溥对精确 HEAD `2f950b9d` 的短复验 Approve；原 API Key 原值回显 P1 关闭，Provider 聚焦测试 29/29、Store/公开 SSE/模型历史和 SQLite/WAL/SHM 检查通过，GitHub CI 通过。PR #39 已于 2026-09-20 合并为 `main@b9b07b73cfeaf2a1096bfc21235a2d03c881a02b`。防线只保证实际 key **精确原值**，不保证改写、编码或加密后的派生形式。

## 验收边界与下一步

- 未测试 DeepSeek/Kimi 官方 API 直连；当前结论只适用于用户批准的两个网关。
- 浏览器最初两个独立诊断 Turn 因站点根 URL 被误作 API base，安全停在 `model_step_outcome_unknown`，没有 Receipt，且不重放。第三个使用正确 `/v1` API base 的全新 DeepSeek 网页 Turn 已 `run_completed`，两个只读工具均有成功 Receipt；详见[独立浏览器验收记录](WP5_BROWSER_FIRST_SUBMIT_20260920.md)。不能把前两次失败改写成成功，也不能将此次网关通过写成官方直连通过。
- 本地服务均已停止。临时合成仓库与 SQLite 保留用于只读复核；不得把数据库、密钥文件、原始 Provider stream 或完整调试日志纳入 PR。
- 下一步：对浏览器验收记录和手动脚本进行独立复审，再按阶段施工单推进。产品级视觉打磨与 Harmony 分支保持独立。

## P1 凭证回显整改执行卡

- 事实源：PR #39 对 `ce2516c288f84283a75d8ff8abe6ec3df9007719` 的 Request changes；原两次 canary 的 SQLite 凭证扫描只证明**那两次响应**没有回显，不证明恶意或故障网关不能回显。
- 安全不变量：Server 持有的实际 Provider API Key，无论自身格式如何，不能由模型输出进入 private event、model history Artifact、公开事件或 SQLite/WAL/SHM；命中后不得自动重新调用已发出的 Provider 请求。
- 施工现场：独立 worktree `codex/wp5-gateway-canary`，原主工作区已有改动不碰；仅修改共享 OpenAI-compatible transport、聚焦测试和本报告。
- 允许动作：使用合成密钥和本地 fake gateway 做回显、跨 delta、工具参数、推理字段、DB 原始字节验证；完成本地门禁与独立只读复审。禁止真实付费网关重调、读取或输出真实 key、部署及自动合并。
- 验收矩阵：静态检查源到 sink；transport focused tests；真实 Runtime/SQLite Server 假网关验证；SQLite/WAL/SHM 字节扫描；正常 Provider fixture 与全仓 check；PR CI 与秦峻溥短复验分别单列。
- 停机条件：任何合成凭证仍进入 durable state，或 fail-closed 破坏了正常 fixture/安全恢复语义；先定位根因，不用重试真实模型。

### 本地候选验证与后续复审结果

- 原回显攻击测试在修复前稳定失败（返回可持久化正文事件），修复后只返回无原文的 `provider_malformed_stream`；Runtime 将其作为已出站且结果不确定的步骤，保留 started checkpoint 并阻塞自动重试。
- DeepSeek/Kimi 的正文跨 delta、reasoning alias 跨 delta、工具参数跨 delta、Provider tool-call ID 与 response ID 均在 transport 返回前整批拒绝；非匹配前缀保持普通模型输出。
- 本地 fake gateway → 真实 Server/Runtime/SQLite：公开 SSE 和 `/resume`、private event、snapshot 与 terminal model-history Artifact 均无合成凭证；SQLite/WAL/SHM 可见文件的 UTF-8/UTF-16LE 字节扫描为零；同一 Command replay 未重调 Provider。
- `npm.cmd run check` 全量通过（Provider 29/29、Server 87/87、Web 30/30、Contracts、Runtime、Store、E3、TypeScript 与 Web build）；`git diff --check` 通过。独立 Terra high 候选审查 PASS；后续秦峻溥短复验 Approve、精确 HEAD GitHub CI 通过，PR #39 已合并。
- 防线是**实际 key 的精确值**，不声称检测模型将 key 改写、编码、加密或散列后的派生形式；异常模型结果不被当作可自动重试的确定拒绝。
