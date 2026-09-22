# WP-7B 产品体验与真实对话闭环施工卡

> 状态：Candidate（本地全量门禁与独立复审通过，待 PR、部署与生产验收）
> 日期：2026-09-22
> 基线：`origin/main@d2728a9eed8164f55d7d315fda5f17d5cb8e0605`
> 当前 HEAD：`0ba91a94`（仅迁移 WP-7A 公网部署记录）
> 施工现场：`C:\codex-worktrees\meliora-product-experience-v2`
> 分支：`codex/product-experience-v2`

## 目标

先重建公网与本地真实现状，沿 `页面 POST -> Nginx -> Server -> Command -> Provider -> Tool -> SSE -> UI` 找到“无法真实对话”的准确根因；在不改变只读 Harness、安全投影、恢复和幂等契约的前提下，把 Web 工作台提升到作品集展示水平，完成浏览器验收、独立复审、PR 合并与可回滚部署。

## 事实源

- `MELIORA_MASTER_PLAN.md`
- `docs/plans/CURRENT_STAGE.md`
- `docs/frontend/VISUAL_SYSTEM.md`
- `docs/architecture/INTENT_AND_OUTPUT.md`
- `docs/architecture/PERSISTENCE_AND_EVENTS.md`
- `docs/TEAM_WORKFLOW.md`
- `docs/plans/WP7A_TEACHER_FIRST_PRODUCT_SHELL.md`
- `apps/web/src/*`、`apps/web/tests/*`、`apps/web/verification/*`
- 当前公网 `https://melioracode.com` 与目标服务器 read-back

## 施工现场与边界

- 根工作区 `E:\Portfolio\meliora` 的 `M MELIORA_MASTER_PLAN.md` 与 `?? docs/deployment/` 属于用户修改，不读取为本分支增量、不覆盖、不清理、不提交。
- 新 worktree 从已核验的远端 `main@d2728a9e` 创建；旧 `codex/product-shell-v1` 不作为代码基线。
- 旧提交 `ea52b0cd` 仅记录已发生的 WP-7A 公网发布，已等价迁移为当前分支首提交 `0ba91a94`。
- 默认允许修改 `apps/web`、本施工卡、受影响的前端规范与验证记录。只有准确根因要求时才修改 Server/Provider/Runtime，并同步契约、fixture 与测试。
- 不新增写文件、任意 Shell、Patch、真实 Diff、目录扫描、多用户项目或浏览器密钥输入等未实现能力。
- 真实付费模型只在无密钥链路与代码门禁通过后做一次有界最终 canary；执行前向用户简报。

## 设计方向

```text
Design read: 面向评审老师与开发者的成熟 Web Coding Agent 工作台，克制、可信、工具感强。
DESIGN_VARIANCE: 5
MOTION_INTENSITY: 3
VISUAL_DENSITY: 7
```

- 采用一套冷中性语义 token 与单一 accent；状态色只表达真实状态。
- 以任务、模型输出、工具过程、验证和最终结果为中心，减少边框堆叠与无意义留白。
- 保留桌面三栏与移动单栏，但右侧证据必须在无 Run 时也提供真实能力说明，而非空壳。
- 公网文案不得出现 Demo、fixture、草稿、演示项目或虚构能力。

## 验收矩阵

| 链路/层级 | 需要证明的事实 | 证据方式 |
|---|---|---|
| 公网首屏 | 无内部/演示残留；老师能理解能力和只读边界 | 真实浏览器 1440/390 截图、DOM/网络记录 |
| 输入与 POST | 建议仅预填；每次发送恰好一个 `POST /api/turns` | Playwright 网络计数 + Server 日志 |
| Nginx | `/api` 正确代理回环 8787；TLS、限流与静态资源正常 | 配置只读检查、access/error log 脱敏摘要 |
| Command/Store | Command 被接受、幂等 scope 正确、终态可读 | 安全 API response、SQLite 只读查询/既有 contract test |
| Provider | 配置解析与上游状态准确；未知结果不重放 | 环境键名/来源检查、无密钥 fake gateway、最终有界 canary |
| Tool | 只调用批准的只读工具，Receipt 与公开事件绑定 | fixture/集成测试、公开事件与 Store read-back |
| SSE/Resume | 事件顺序、终态、断线恢复、刷新 GET-only | 浏览器网络记录、`/resume`、重载后无新增 POST |
| UI 状态 | empty/loading/running/blocked/failed/completed/reconnecting 完整 | 组件测试 + 浏览器可见验收 |
| 视觉系统 | 字体、间距、颜色、圆角、图标、状态与动效一致 | token 审计、桌面/移动截图、人工审美复核 |
| 响应式 | 1440/1100/1099/768/390 无溢出；Drawer 与 Composer 正常 | 五档 Playwright + 真实浏览器 |
| Harmony | API 26 兼容代码门不回退；真机结论不伪造 | 既有 overlay 回归；真机仍单列人工验收 |
| 安全 | private reasoning、凭证、内部路径不进入 DOM/Storage/公开事件 | 精确值扫描、公开投影测试、浏览器存储检查 |
| 交付 | CI 通过、独立复审无未关闭 P0/P1/P2、可回滚部署 read-back | PR checks、Terra high 复审、release/tree/health/browser read-back |

## 受控循环

- 公网与本地诊断最多各 2 次无付费完整提交；同一失败家族第二次仍无新增证据时停止并写根因链。
- 最终真实 Provider canary：最多 1 个新 Run、最多 3 个 Model Step、90 秒观察窗；出现 outcome unknown、敏感信息迹象、非只读工具或重复 POST 立即停止。
- 所有轮询以新增状态、日志或事件为观察信号；无新增事实不重复请求。

## 停机条件

- 施工现场 HEAD、分支、dirty 状态或运行入口与本卡不一致。
- 需要扩大到未授权的生产数据/权限/公开能力。
- Provider 请求结果未知、疑似凭证泄漏、公开事件越界或工作区发生写入。
- 关键契约必须变化但缺少 fixture、contract test 或回滚方案。

## 当前进度

- [x] 核验远端 `main`、tree、根工作区 dirty 状态与旧 worktree。
- [x] 安全迁移 WP-7A 部署记录。
- [x] 重建公网首屏与首次发送路径：公网首屏 200、零 API 请求；1440/390 基线显示旧文案、中央留白和稀疏证据区。
- [x] 重建本地真实 SQLite/Server/fake-model 链路：一次 POST、SSE 终态、最终回答可见、刷新 GET-only、pending lock、stale Run 恢复均通过。
- [x] 写出真实对话根因链并确定修复范围：部署链路健康；Runtime 固定隐藏 Provider 回答是主因，Web 已具备公开 assistant event 渲染能力。
- [x] 完成视觉与交互 Candidate：正式工作区文案、任务起点、证据检查器、只读能力说明、移动 Drawer 焦点循环和 reduced-motion 处理。
- [x] 完成全量门禁与独立复审：`npm run check` 通过；视觉、响应式/Harmony 代码面与公开输出契约复审均无剩余 P0/P1/P2。
- [ ] 提交、推送、PR、合并、可回滚部署与生产 read-back。

## 根因链与 Candidate 证据

```text
症状：任务能结束，但用户看不到模型对代码问题的实际回答。
入口/Nginx/Server：公网健康、TLS 与回环代理正常，未发现合法 /api/turns 失败日志。
Command/Provider/Tool：既有真实 Server + fake model 纵向测试可完成两步只读工具链。
公开投影：Runtime 将 Provider assistant text 固定替换为“内容已隐藏”，UI 虽能渲染 assistant_text_delta 但没有可用内容。
修复：只在 stop 终止、已有私有工具观察且验证 ID 落盘后，调用服务端投影器发布一次最终回答；中间推理仍不公开。
防线：长度、控制字符、persistable text、私有观察原文/行/token/压缩形式/URL 编码/base64 回显检查；失败时发布固定安全摘要。
```

本地指定验证（2026-09-22）：

- 根 `npm run check` 全量通过；Web tests `38/38`、Web production build、packages/server typecheck 通过。
- Runtime focused test 与真实 Server 纵向测试 `15/15` 通过。
- `verify:live-browser` 通过：一次 POST、最终回答可见、SSE 终态、刷新 GET-only、私有标记未进入 DOM、四档无溢出。
- `verify:product-browser` 通过：1440/1100/1099/768/390、建议仅预填、零 POST、移动运行面板可达。
- 最终回答 projector 对任意非空 private observation 的原文、紧凑形式、percent、Base64 与 Base64url 回显 fail closed；短值嵌入用例已覆盖。
- Terra high 三路复审均通过：视觉/交互、响应式/Harmony 兼容代码面、Public output contract 无剩余 P0/P1/P2。
- HarmonyOS API 26 仍只具备兼容代码与浏览器模拟证据，真机验收保持 Pending。
