# Meliora 老师演示部署准备卡

> 状态：Candidate，准备中；**未部署、未开放公网**
> 日期：2026-09-21
> 基线：`origin/main@69a24d8375e0e1a13a5c526f46852dbee8759566`
> 施工现场：独立工作树 `codex/demo-deploy-prep`；不修改主工作区的未提交文件
> 权威范围：演示环境的准备事实、验收门禁、发布/回滚顺序；不改变 M0 产品或 Server/Store 契约
> 上游：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[当前阶段](../plans/CURRENT_STAGE.md)、[持久化与事件](../architecture/PERSISTENCE_AND_EVENTS.md)、[前端规范](../frontend/VISUAL_SYSTEM.md)
> 更新触发：部署入口、域名、认证、PR 门禁或外部验收状态变化

## 目标与停机条件

目标是提供老师可用的 PC/手机网页，能演示固定仓库的只读 Coding Run、SSE 输出和刷新恢复。只使用现有阿里云单机 + SQLite，不购买云数据库，不暴露真实用户仓库。验收时必须区分 fixture 页面、无密钥 fake-model 链路、指定网关真实模型链路与 HarmonyOS API 26 目标设备证据。

本卡只授权只读核验、本地构建和候选配置准备；**DNS 写入、证书签发、服务器文件发布、systemd/Nginx 启用、防火墙开放、真实 Provider Key 装载及付费请求都留给独立发布步骤**。任一安全门未过即停在 Candidate，不用临时公网端口或 IP 直连绕过。

## 当前事实与证据层级

| 项目 | 2026-09-21 核验 | 对发布的含义 |
|---|---|---|
| 域名 | 用户告知 `melioracode.com` ICP 备案已通过；前次观察为根域名及 `www` 尚未解析，本部署切片尚未重新 read-back | DNS、备案接入状态及解析目标都必须在边缘门重新核验，当前不宣称已有可访问网址 |
| 云服务器 | 前次交互式只读观察为 `meliora-demo`、Node 22.23.2、Nginx 1.24.0，应用/Nginx 未启用且仅 SSH 监听；本卡未附服务器证据快照 | 这些值只作为待复核输入；产物门开始前必须重新采集脱敏的版本、服务状态和监听端口证据 |
| 预置 unit | 前次只读观察显示 ExecStart 指向尚不存在的 `/srv/meliora/app/current/server.mjs`；本部署切片尚未重新核验 | **不得**通过创建占位文件让服务“变绿”；先冻结真实发布入口，并在服务器 read-back 后更新本卡 |
| Web | `apps/web` 的 Vite build 输出静态 `dist`；Live Adapter 默认使用页面同源 `/api` | 可准备静态产物；生产站点必须把 `/api` 代理到回环 Server，不能写浏览器可见 Provider Key |
| Server | 目前只有 `apps/server/src/local-dev.ts` 启动脚本，固定监听 `127.0.0.1:8787`、本地主体和 Host allowlist | 尚无经过验收的生产装配；不能直接改为公网监听或把开发入口当作正式入口 |
| 持久化 | SQLite 文件由 `MELIORA_DATABASE_PATH` 指定，必须在工作区外 | 单机演示足够；部署与回滚都必须保留 DB，不能因代码回滚重放付费调用 |
| 安全审查 | PR #41 已在精确 HEAD 完成双人复审并合并；Issue #42 / PR #44 的 Server Git 子进程最小环境已完成安全差异审查并合并 | 源码侧凭证门已关闭；发布侧仍必须验证环境文件权限及 dist、日志、DB/WAL/SHM 无原值 |
| 双端适配 | PR #37 已合并；PC/手机 Web、SSE、刷新恢复、IME、软键盘与响应式回归通过 | HarmonyOS 7 / API 26 真机或官方模拟器仍是独立待验项，不能由 Chromium 结果代替 |

### 本地无密钥构建记录

在最新主线候选上执行：Windows Node `v20.20.2`、根 `npm run check`、Web tests `35/35`、Web production build、`verify:live-browser` 与 GitHub 两项 CI 均通过。浏览器验收覆盖真实 SQLite + Server + fake model、一次 POST、SSE 终态、刷新 GET-only、凭证精确值扫描和 PC/手机响应式；**冲突收口与复审没有重跑真实 Provider 请求，也没有证明 Ubuntu Node 22 的原生依赖构建/运行或公网访问**。正式发布必须在目标 Ubuntu 环境重新 `npm ci` 并验证 `better-sqlite3` 的 Node ABI，不能复制 Windows `node_modules`。

## 最小演示方案（待实现与复审）

```text
老师浏览器（PC / 手机）
  -> HTTPS + 单人访问控制（Nginx）
  -> 静态 Web dist
  -> 同源 /api（仅 Nginx 代理）
  -> 127.0.0.1:8787 Server
  -> 工作区外 SQLite + 固定无敏感演示 Git 仓库
  -> Server-only 指定 Provider 网关
```

- 公网 Web 入口只允许 443 和证书签发/跳转所需的 80；现有 SSH 22 仍用于受控运维，8787 永不对公网监听。云防火墙和 UFW 两层都要核对。
- 站点及 `/api` 必须一起经过访问控制；仅凭隐藏 URL、Host allowlist 或前端按钮不是授权。M0 当前使用本地主体，不支持多用户隔离，因此只允许受控、短期、单老师演示；如需公开匿名试用，另立多用户授权工作包。
- Nginx `/api` 代理必须保留 POST/SSE/GET 语义；SSE 路由不得被代理缓冲，终态 `204`、原始尾部冲突 `409` 不得被自定义错误页改写。不得配置对 POST 的上游自动重试。候选配置需通过 `nginx -t` 和真实浏览器复验。
- Server 运行用户只可读固定演示仓库、写独立 SQLite/日志目录；Provider Key 只进入受限的 Server 环境文件，不能进 Git、Web bundle、Nginx 日志或验收截图。
- 首次公开前设置简单的调用上限与观察/停机手段，避免共享密码泄露后产生无限付费请求。演示仓库不能含私有代码、真实凭证或可疑 Git hooks/config/helper。

## 分阶段门禁

1. **源码门（已通过）**：PR #37、#41、#44 已合入 `main@69a24d8375e0e1a13a5c526f46852dbee8759566`；PR #41 在冲突收口后的精确 HEAD 有正式批准记录。该 SHA 是部署入口施工基线；后续若 main 变化必须重新冻结，不从分支临时拼包。
2. **产物门**：干净发布目录执行 `npm ci`、`npm --prefix apps/web ci`、`npm --prefix apps/web run build` 与根 `npm run check`；记录产物 SHA、Node/SQLite ABI、启动入口。当前 `server.mjs` 缺失属于阻断，不允许跳过。
3. **回环门**：仅在服务器回环启动候选。固定演示仓库，DB 在 `/var/lib/meliora`；验证 health、POST 一次、SSE 终态、刷新 GET `/resume` 且 POST 不增加、重启后读取恢复；扫描 Web dist、日志、SQLite/WAL/SHM 的凭证精确原值。
4. **边缘门**：核实ICP备案的域名与接入状态；配置 A 记录、TLS、Nginx 静态资源和同源 `/api`，先只在回环/受限方式验收，再检查认证、速率限制、SSE 非缓冲和错误状态透传。证书与密码不进仓库。
5. **公网门**：发布者确认后才启用站点与 80/443，外部 PC 和手机实际访问；至少演示一次只读 Run、刷新恢复和错误态。HarmonyOS API 26 只在目标设备实测并留证后标记通过。

## 验收矩阵

| 断言 | 机器证据 | 外部可见证据 | 当前状态 |
|---|---|---|---|
| Web 静态产物可重复构建 | `apps/web` 35/35、build、fake-model browser-check | 页面打开、资源无 4xx/5xx | Windows 本地与 GitHub CI 通过；Ubuntu/公网待验 |
| Server 可由正式入口启动 | systemd ExecStart 对应真实文件；`/api/health` | 页面真实模式可连接 | 阻断：入口未实现 |
| SSE 与刷新安全 | POST 计数、事件序列、GET-only `/resume` | 流式输出与刷新后同一 Run | 本地已有无密钥基线；公网待验 |
| 凭证不出 Server | 子进程环境、dist、日志、DB/WAL/SHM 扫描 | 浏览器 body/localStorage/sessionStorage 均无原值 | 源码门通过；Ubuntu 发布目录、环境权限和运行产物待验 |
| 访问隔离与成本 | 认证、固定 workspace、限流、调用预算、停机开关 | 非授权请求被拒绝 | 尚未实现 |
| PC/手机/鸿蒙 | 1440/1100/1099/768/390 与目标设备记录 | 老师实际设备操作 | PC/手机 Chromium 基线已合并；API 26 目标设备待验 |

## 回滚与发布后观察

发布使用版本目录与 `current` 指针；切换前记录上一个 SHA。故障时先停止入口流量/应用，再切回旧代码；**不删除或回滚 SQLite 文件，不自动重投已提交的 Turn**。检查 `/api/health`、终态 SSE、Nginx 错误率、进程内存/磁盘、付费请求计数；异常时关闭站点或 Provider 入口，保留脱敏证据供复盘。

## 下一步

源码门已关闭。下一切片从上述冻结 SHA 实现经过测试的发布入口、systemd 与 Nginx/单人访问控制候选；先在服务器回环完成无密钥构建、原生依赖和 fake-model 验收，再进入 DNS/TLS。公网启用和真实 Provider Key 装载仍是独立发布步骤，不由本文或 PR 合并自动触发。

## 官方参考

- [阿里云：轻量应用服务器域名解析](https://help.aliyun.com/zh/simple-application-server/user-guide/register-and-resolve-domain-names)
- [阿里云：轻量应用服务器防火墙](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server)
- [Nginx：反向代理缓冲与上游重试语义](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
