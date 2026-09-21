# WP-5 浏览器首次提交真实模型执行卡

> 状态：正确 API base 的真实页面只读 Run 已完成；前两次错误路径的未知 Command 保留且不重放
> 日期：2026-09-20
> 事实基线：远端 `main@b9b07b73cfeaf2a1096bfc21235a2d03c881a02b`（PR #39 已合并）
> 施工现场：独立 worktree `C:\codex-worktrees\meliora-wp5-browser-acceptance`，分支 `codex/wp5-browser-acceptance`，开工时 clean；不碰原主工作区既有修改

## 目标与边界

在本机 Web 页面首次提交一次真实 DeepSeek 指定网关只读任务，核对浏览器 POST、公开 SSE、刷新 GET-only、SQLite Receipt 与凭证隔离。已有两次 HTTP 客户端 canary 与浏览器只读恢复不能代替此项。

- 允许：用户既已批准的 DeepSeek HTTPS 网关、一个新建的空 Git 仓库与独立 SQLite；最多一次新 Turn，最多两个 Model Step，输出上限 2048 tokens，等待终态最多 90 秒。
- 上述是调用次数与**每次输出 token** 的执行预算，不是货币账单上限；输入 token 与网关实际收费无法由本脚本精确控制或证明。每个新诊断 Turn 必须另建合成仓库和数据库，不能借一次授权无限重复。
- 禁止：用户真实工作区、公网部署、官方 API 直连、浏览器传入密钥或 endpoint、结果未知时重试、自动继续新任务。
- 停机：出现 Provider/Host 结果未知、疑似密钥泄漏、非只读工具或 90 秒超时，立即停发新请求，只做只读状态检查。
- 人工节点：部署、密钥轮换、真实项目试运行另行确认。

## 验收矩阵

| 层级 | 证据 |
|---|---|
| 浏览器可见 | 页面在真实模式提交并显示终态，刷新只 GET `/resume` |
| Server/Provider | 仅 1 次 POST；真实 Provider 调用数有界；无隐式重试 |
| Store | 终态、Receipt、公开事件与原始 SQLite/WAL/SHM 敏感字节扫描 |
| 静态/回归 | `npm.cmd run check`；不以此代替真实运行 |

## 本次结果

- 使用新建空 Git 仓库与独立 SQLite，页面真实模式发出 **1 次 POST**，`transport.next` 进入 **1 次**；是否被上游计费未知，不得凭调用计数判断账单。
- 页面收到 `run_blocked`，刷新观察到 GET `/resume`，未发出第二次 POST；页面未抛异常。
- durable Command 为 `terminal / blocked / model_step_outcome_unknown`，Model Step 保持 `started`，没有 terminal result，也没有 Receipt。不得把它写作只读任务完成，更不能自动重试。
- SQLite、WAL、SHM 的当前密钥 UTF-8 与 UTF-16LE 原值扫描未命中；浏览器 body 与 localStorage 也未命中。此结论只覆盖**精确原值**。
- 不带凭证的网关 HTTPS HEAD 探针完成 TLS 校验，返回 404；只能证明该 origin 可连通，不能说明模型请求的失败原因。
- 无密钥浏览器完整验收单独通过：一次 POST、SSE 终态、刷新 GET-only、未知提交保护、过期 Run 手动恢复、私有 marker 不回显及四档宽度无溢出。它证明页面/Server 的 fixture 路径可工作，**不能**替代本次真实网关失败的验收。
- 合成仓库与数据库保留在本机临时目录 `meliora-wp5-browser-1789892317` 供只读排查；未放入 Git 或 PR。服务已停止。

## 下一步与停机

无密钥浏览器全路径和 Provider/Server/Runtime 测试均通过，但首次真实网关失败在 transport 返回后被安全归类为结果未知；当前落盘事实不能反推出具体 HTTP 失败类型。用户已明确授权继续受控推进，不必为同范围的小样本逐次请示。下一探针只对**新的空合成仓库和独立 SQLite**发起一次新 Turn，最多两个 Model Step，保留输出上限 2048、90 秒窗口；仅额外记录安全的 HTTP 状态码、内容类型分类与 canonical failure code，不记录 URL、body、header 或凭证。绝不重放原 Command；若仍失败则停下付费调用，进入无密钥修复。原 [指定网关验收记录](WP5_GATEWAY_CANARY_20260920.md) 的两次 HTTP 客户端成功仍是独立事实，不能升级成本次页面首提成功。

## 第二个独立诊断 Turn 与根因

- 新合成仓库、独立 SQLite；页面 `POST=1`、transport 调用 1 次、`GET /resume` 刷新成功且未新增 POST，但 `run_blocked`、Receipt 0；密钥原值扫描与页面异常检查仍为 0。未重放首次 Command。
- 安全诊断信号：上游 HTTP `200`、内容类型 `other`、canonical code `provider_malformed_stream`。无凭证 HEAD 探针进一步显示 `/chat/completions` 是 `text/html` 页面，而 `/v1/chat/completions` 返回 JSON 路由响应。凭证文件里的 `url` 是站点 origin `/`，本次脚本误将它直接用作 API base，导致请求落入 HTML 路由。
- 修复：手动 canary 严格要求 `MELIORA_GATEWAY_BASE_URL` 的 path 为 `/v1`，从根 URL 显式构造此 Server-only 配置。Web 输入及 Provider transport 均不据此擅自变更 endpoint；两个未知 Command 不再重试。
- 下一探针仍只允许一个全新空仓库、一个新 Turn、最多两个 Model Step。若正确 API 路径仍未完成，则停止真实请求，保留证据走无密钥诊断。

## 正确 API base 的第三个独立 Turn

- Server-only API base 显式设置为批准的网关 origin 加 `/v1`，浏览器未传 endpoint 或凭证。新建第三个空 Git 仓库与独立 SQLite；没有重放前两个 Command。
- 页面 `POST /api/turns=1`；Provider transport 2 次、上游 HTTP `200` 且内容类型 SSE；Command `terminal/completed`，两个 Model Step 均为 `terminal`。
- 模型调用了 `git_status` 与 `list_files` 两个只读工具，产生两条 `succeeded` Receipt，对应两条 Invocation 和两组 Receipt-public event durable binding；合成 Git 仓库仍干净、无跟踪文件。公开事件含 `run_completed` 一条，刷新观察到 GET `/resume` 后页面仍显示完成，无新增 POST 或 Provider 调用。
- 浏览器 body/localStorage 与 SQLite/WAL/SHM 的当前密钥 UTF-8、UTF-16LE 精确原值扫描均未命中；页面异常 0。该扫描不保证编码、改写或衍生形式安全。
- 原验收脚本过严地断言“恰好 1 Receipt”，因此尽管真实 Run 完成，脚本进程返回 1。随后已改成按冻结只读 Tool Catalog 检查全部 Receipt 与 Invocation / public binding 对应、要求 `git_status` 在其中、工作区保持干净，并补 Store 公开事件与刷新后 DOM 对照，以及刷新后 API 请求逐条 GET 限制。**修正后的脚本已严格 TypeScript 编译，binding 逻辑已用保留的 SQLite 只读核验，但未再次发付费请求重跑；第三次运行事实只证明刷新未新增 POST 且观察到 `/resume`，不将新断言追认成已跑过。**
- 第三个合成仓库与 SQLite 保留在本机临时目录 `meliora-wp5-browser-correct-base-1789893314`；服务已停止。此结论只覆盖批准的 DeepSeek 网关，本次未重测 Kimi 或官方直连。

下一步：把手动 canary 的路径前置校验与证据写入团队施工记录，完成差异、敏感信息与无密钥回归，再进入审查。两次错误路径遗留的 `outcome_unknown` 是独立历史事实，不因第三次成功而改写。

## 交付门禁

- 本地根 `npm.cmd run check`、无密钥 `verify:live-browser`、手动脚本严格 TypeScript 编译、`git diff --check` 通过；5 个变更文件的两个批准网关 key 精确原值扫描为零。真实第三次 Run 的两组 Receipt-public binding 用原 SQLite 做了只读核验。
- 独立 Terra high 审查最终 PASS：先发现旧记录与新完成事实冲突、刷新断言不足及跨盘目录判断错误，均在后续提交中修复；修正后的付费脚本**未重跑**，不伪称其端到端自动门禁已通过。
- 本地候选提交已生成；最终 CI 与合并仍需在 GitHub 远端分支同步后进行。
