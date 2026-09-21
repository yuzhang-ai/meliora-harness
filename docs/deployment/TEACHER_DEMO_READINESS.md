# Meliora 老师演示部署准备卡

> 状态：Ubuntu 回环门已通过；**未开放公网**
> 日期：2026-09-21
> 基线：`origin/main@0536104d64913962946bc785818f51c0488df078`
> 施工现场：独立工作树 `codex/wp6b-loopback-evidence`；不修改主工作区的未提交文件
> 权威范围：演示环境的准备事实、验收门禁、发布/回滚顺序；不改变 M0 产品或 Server/Store 契约
> 上游：[开发总纲](../../MELIORA_MASTER_PLAN.md)、[当前阶段](../plans/CURRENT_STAGE.md)、[持久化与事件](../architecture/PERSISTENCE_AND_EVENTS.md)、[前端规范](../frontend/VISUAL_SYSTEM.md)
> 更新触发：部署入口、域名、认证、PR 门禁或外部验收状态变化

## 目标与停机条件

目标是提供老师可用的 PC/手机网页，能演示固定仓库的只读 Coding Run、SSE 输出和刷新恢复。只使用现有阿里云单机 + SQLite，不购买云数据库，不暴露真实用户仓库。验收时必须区分 fixture 页面、无密钥 fake-model 链路、指定网关真实模型链路与 HarmonyOS API 26 目标设备证据。

本卡只授权只读核验、本地构建和候选配置准备；**DNS 写入、证书签发、服务器文件发布、systemd/Nginx 启用、防火墙开放、真实 Provider Key 装载及付费请求都留给独立发布步骤**。任一安全门未过即停在 Candidate，不用临时公网端口或 IP 直连绕过。

## 当前事实与证据层级

| 项目 | 2026-09-21 核验 | 对发布的含义 |
|---|---|---|
| 域名 | 用户告知 `melioracode.com` ICP 备案已通过；2026-09-21 向 AliDNS 权威服务器 read-back，根域名及 `www` 的 A/AAAA 均为空 | 当前没有可访问网址；下一门由发布者配置 DNS 后再次 read-back |
| 云服务器 | 2026-09-21 已 read-back：`meliora-demo`、Node 22.23.2、npm 10.9.8、Nginx 1.24.0；UFW active/default deny incoming 且只允许 SSH；持久 Meliora/Nginx 均 inactive，本机无 80/443/8787 监听 | Ubuntu 原生依赖、UFW 与进程监听边界已验证；阿里云安全组与外部可达性仍须在边缘门核验 |
| 预置 unit | 2026-09-21 再次 read-back：旧持久 unit 的 ExecStart 仍指向发布产物中不存在的 `/srv/meliora/app/current/server.mjs`，且保持 disabled/inactive | **不得**通过创建占位文件让服务“变绿”；启用前须由 WP-6A 候选 unit 替换并再次验证 |
| Web | `apps/web` 的 Vite build 输出静态 `dist`；Live Adapter 默认使用页面同源 `/api` | 可准备静态产物；生产站点必须把 `/api` 代理到回环 Server，不能写浏览器可见 Provider Key |
| Server | WP-6A 新增 fail-closed 的 `deploy-server.ts` 与独立无密钥 `demo-fixture-server.ts`，二者固定监听 `127.0.0.1:8787` | Windows 与 Ubuntu 均已覆盖 fixture POST/SSE 与重启 GET-only 恢复；不得改为公网监听 |
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

1. **源码门（已通过）**：PR #37、#41、#43、#44、#46 已合入 `main@0536104d64913962946bc785818f51c0488df078`；PR #46 的 GitHub CI 与独立复审通过。该 SHA 是当前部署入口施工基线；后续若 main 变化必须重新冻结，不从分支临时拼包。
2. **产物门**：干净发布目录执行 `npm ci`、`npm --prefix apps/web ci`、`npm --prefix apps/web run build` 与根 `npm run check`；记录产物 SHA、Node/SQLite ABI、`node --import tsx` 启动入口。WP-6A 不引入 bundle；Ubuntu 必须按锁文件安装，不能复制 Windows 依赖。
3. **回环门（已通过）**：版本 `0536104d` 已在 Ubuntu 重新 `npm ci` 并通过根检查；无密钥 fixture 完成多 Run、SSE 终态、重启 GET-only 恢复。transient systemd 探针只监听 `127.0.0.1:8787`，健康检查后已停止。证据见 [WP-6B Ubuntu 回环记录](../verification/WP6B_UBUNTU_LOOPBACK_20260921.md)。
4. **边缘门**：核实ICP备案的域名与接入状态；配置 A 记录、TLS、Nginx 静态资源和同源 `/api`，先只在回环/受限方式验收，再检查认证、速率限制、SSE 非缓冲和错误状态透传。证书与密码不进仓库。
5. **公网门**：发布者确认后才启用站点与 80/443，外部 PC 和手机实际访问；至少演示一次只读 Run、刷新恢复和错误态。HarmonyOS API 26 只在目标设备实测并留证后标记通过。

## 验收矩阵

| 断言 | 机器证据 | 外部可见证据 | 当前状态 |
|---|---|---|---|
| Web 静态产物可重复构建 | `apps/web` 35/35、build、fake-model browser-check | 页面打开、资源无 4xx/5xx | Windows 本地与 GitHub CI 通过；Ubuntu/公网待验 |
| Server 可由正式入口启动 | systemd ExecStart 对应真实文件；`/api/health` | 页面真实模式可连接 | 候选入口与新 unit 已实现；服务器旧 unit 尚未替换，正式 Provider 环境未配置、未启动、未验收 |
| SSE 与刷新安全 | POST 计数、事件序列、GET-only `/resume` | 流式输出与刷新后同一 Run | 本地已有无密钥基线；公网待验 |
| 凭证不出 Server | 子进程环境、dist、日志、DB/WAL/SHM 扫描 | 浏览器 body/localStorage/sessionStorage 均无原值 | 源码门通过；Ubuntu 发布目录、环境权限和运行产物待验 |
| 访问隔离 | Basic Auth 候选、固定 workspace、未授权拒绝 | 非授权请求被拒绝 | Nginx Basic Auth 与固定 workspace 候选已实现；尚未安装、启用或验收 |
| 成本控制 | 限流、调用预算、停机开关 | 超限请求被拒绝且可立即停机 | 尚未实现 |
| PC/手机/鸿蒙 | 1440/1100/1099/768/390 与目标设备记录 | 老师实际设备操作 | PC/手机 Chromium 基线已合并；API 26 目标设备待验 |

## 回滚与发布后观察

发布使用版本目录与 `current` 指针；切换前记录上一个 SHA。故障时先停止入口流量/应用，再切回旧代码；**不删除或回滚 SQLite 文件，不自动重投已提交的 Turn**。检查 `/api/health`、终态 SSE、Nginx 错误率、进程内存/磁盘、付费请求计数；异常时关闭站点或 Provider 入口，保留脱敏证据供复盘。

## 下一步

WP-6A 已合并，WP-6B Ubuntu 回环门已通过。WP-6C 已形成 ACME bootstrap、最终 TLS/Basic Auth/Nginx 和限流候选，并在 Ubuntu 用临时材料通过 `nginx -t`；当前等待全量门禁与独立复审。DNS mutation、公网启用和真实 Provider Key 装载仍是独立发布步骤，不由本文或 PR 合并自动触发。

## 官方参考

- [阿里云：轻量应用服务器域名解析](https://help.aliyun.com/zh/simple-application-server/user-guide/register-and-resolve-domain-names)
- [阿里云：轻量应用服务器防火墙](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server)
- [Nginx：反向代理缓冲与上游重试语义](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
