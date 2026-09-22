# WP-7A 老师首次打开体验施工卡

> 状态：Production effective，公网 read-back 通过
> 日期：2026-09-22
> 基线：`main@2b8b22ea6bd4a1347dd3d8fbf69d0e234440757e`
> 施工现场：`C:\codex-worktrees\meliora-product-shell-v1`
> 分支：`codex/product-shell-v1`

## 目标

把当前“需要理解 fixture、模式切换和 workspace ID 的工程样机”收敛成老师打开即可理解和操作的只读 Coding Agent 产品壳：看得懂产品能力，能输入任务，能理解运行过程、阻塞原因和最终结果。

## 事实源

- `MELIORA_MASTER_PLAN.md`
- `docs/plans/CURRENT_STAGE.md`
- `docs/frontend/VISUAL_SYSTEM.md`
- `apps/web/src/*`
- `apps/web/tests/*`
- 当前公网部署 `https://melioracode.com`

## 本切片范围

- 生产构建可配置为默认真实模式，并固定展示工作区名称，不要求老师填写 workspace ID。
- 首次空态说明“能做什么”和“当前只读边界”，提供只填充、不自动发送的任务建议。
- 减少 fixture、内部 ID、模式切换和未实现入口对老师的干扰。
- 把公开事件整理成易读的任务过程，合并连续 assistant 文本片段。
- 保留 PC 三栏、手机单栏、HarmonyOS API 26 的安全区、软键盘、IME 和 1100/1099px 边界。

## 不在范围

- 不修改 `PublicRunEvent`、Server、Store、Provider 或 Tool 契约。
- 不增加写工具、Shell、审批执行、文件上传或浏览器预览。
- 不调用真实付费模型作为日常验收。
- 不把右栏伪造成实际 diff，不伪造任务历史或运行结果。

## 允许动作

- 修改 `apps/web` 与本施工卡。
- 运行无密钥测试、构建、fixture Server 和浏览器验收。
- 提交并推送独立分支；公网发布必须先通过本地和独立审查。

## 验收矩阵

| 层级 | 验收 |
|---|---|
| 静态 | TypeScript、Web tests、production build、无凭证扫描 |
| 浏览器 | 1440、1100、1099、768、390px；空态、运行态、阻塞态、完成态 |
| 行为 | 首次加载零 POST；建议任务只填充；一次提交仍只 POST 一次；刷新只 GET `/resume` |
| 兼容 | IME 不误提交；软键盘与安全区不遮挡 Composer；reduced motion 可用 |
| 产品 | 老师无需知道 fixture、workspace ID 或模式切换即可开始；未实现能力不占主路径 |

## 停机条件

- 需要新增/修改共享契约。
- 真实模型调用结果未知。
- 浏览器出现重复 POST、刷新 POST、私有事件或凭证进入 DOM/Storage。
- 与当前用户工作区修改重叠。

## 下一步

完成全仓门禁与独立复审；无 P0/P1/P2 后提交推送，再按 product mode 环境变量构建可回滚公网发布。

## 当前证据

- Web tests：38/38。
- Web production build：通过。
- product browser check：通过；覆盖 1440/1100/1099/768/390px、建议任务仅预填、首次加载零 POST、未实现控件隐藏。
- 浏览器截图：`apps/web/verification/product-1440.png`、`apps/web/verification/product-390.png`。
- 根门禁：底层 TypeScript、Contracts、Provider、Runtime、Store、Server、Deploy、E3 全部通过；Web 末段因预览进程占用 `esbuild.exe` 首次未执行，关闭预览后 `npm.cmd run check:web` 完整通过。
- 真实无密钥浏览器链路：通过；一次提交一次 POST、SSE 到终态、刷新 GET-only、私有 marker 不回显、四档无溢出。
- 独立复审：原跨 workspace 保存 Run 的 P1 已关闭；最新结论 PASS，无剩余 P0/P1/P2。
- 提交与合并：PR #51 已合并；`main@d2728a9eed8164f55d7d315fda5f17d5cb8e0605`。
- 公网发布：release `59dc100805f12404a963697bc108c62248280810` 已切换为 `/srv/meliora/app/current`；它与合并后的 `main` tree `743d52d3ebedfc7ba5a344f78165fa2717552241` 完全一致。
- 服务 read-back：`meliora.service` active，回环 `/api/health` 返回 `{"ok":true}`，Nginx 配置检查通过。
- 公网浏览器 read-back：`https://melioracode.com` 无账号密码直接打开；1440/1100/1099/768/390px、运行面板、未实现控件隐藏、跨 workspace 旧 Run 清理与首次零 `/api/*` 请求全部通过。
- 本次公网 read-back 未提交任务、未调用真实 Provider。真实 Provider 与 HarmonyOS API 26 真机仍单列 Pending。
