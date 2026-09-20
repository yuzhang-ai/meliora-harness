# WP-5 指定网关真实模型验收记录

> 状态：本地实测通过；本记录不代替 GitHub CI 或 PR 复审
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

## 未验收及下一步

- 未测试 DeepSeek/Kimi 官方 API 直连；当前结论只适用于用户批准的两个网关。
- 未从浏览器新建真实模型 Run；首次提交路径已有无密钥真实 SQLite/Server/浏览器验收，仍需在后续人工窗口补一次真实模型页面提交。
- 本地服务均已停止。临时合成仓库与 SQLite 保留用于只读复核；不得把数据库、密钥文件、原始 Provider stream 或完整调试日志纳入 PR。
- 下一步：对本分支做 diff/敏感信息检查与 CI；再按团队流程进行 PR 复审。产品级视觉打磨与 Harmony 分支保持独立。
