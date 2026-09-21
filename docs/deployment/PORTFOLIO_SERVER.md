# Meliora 单机作品集部署手册

> 状态：Candidate；尚未在服务器执行
> 版本：v0.1
> 适用范围：阿里云 Ubuntu 单机、单老师受控演示
> 不负责：多用户授权、匿名公开试用、云数据库与自动发布

## 1. 固定边界

- Web 静态文件由 Nginx 提供，浏览器只访问同源 `/api`。
- Node Server 只监听 `127.0.0.1:8787`，云防火墙与 UFW 不开放 8787。
- 页面和 `/api` 共用 HTTPS 与 Basic Auth；禁止在 HTTP 明文下使用 Basic Auth。
- 演示仓库只含可公开的固定素材；SQLite 位于 `/var/lib/meliora`，不在 Git 工作区内。
- fixture 入口只用于无密钥回环验收，界面结果不能作为真实模型证据。

## 2. 候选产物

```text
apps/web/dist                         Web 静态产物
apps/server/src/deploy-server.ts      真实 Provider 入口，缺配置即拒绝启动
apps/server/src/demo-fixture-server.ts 无密钥 fixture 入口，不含 Provider transport
deploy/systemd/meliora.service        正式 systemd 候选
deploy/nginx/meliora.conf             TLS + 全站认证 + 同源 API 候选
deploy/env/meliora.env.example        仅占位符的环境模板
```

服务器安装使用干净版本目录，例如 `/srv/meliora/releases/<git-sha>`，验证后再原子切换 `/srv/meliora/app/current`。不得复制 Windows `node_modules`；Ubuntu 上用锁文件重新执行 `npm ci` 与 `npm --prefix apps/web ci`。

## 3. 无密钥回环门

在尚未装载 Provider Key 前，仅复制非敏感工作区和数据库路径配置，前台运行：

```bash
node --import tsx apps/server/src/demo-fixture-server.ts
```

验收 `/api/health`、一次 POST、SSE `run_completed`、进程重启后 GET `/resume`，并确认没有新增 POST。随后停止 fixture；它不能与正式服务并行占用 8787，也不能成为公网演示的模型能力证明。

## 4. 正式服务门

1. 将 `deploy/env/meliora.env.example` 复制为 `/etc/meliora/server.env`，由 root 填值并设为 `0600`；真实值不得进入仓库、Shell 历史或截图。
2. 安装 `deploy/systemd/meliora.service` 后先 `systemd-analyze verify`，再启动并 read-back `systemctl show`、`ss -lntp` 与 `/api/health`；必须只看到回环 8787。
3. TLS 证书文件存在后再安装 `deploy/nginx/meliora.conf`。先执行 `nginx -t`，并验证未认证页面和 `/api` 均为 `401`。
4. 通过认证后验证一次 POST/SSE、终态 `204`、raw-tail `409`、刷新 GET-only 恢复；Nginx 不缓冲 SSE、不拦截错误，也不重试上游请求。
5. 扫描 Web dist、日志、SQLite、WAL、SHM 和浏览器存储，确认没有 Provider Key 精确原值。

公网启用、DNS、证书签发和真实 Provider Key 装载是独立发布动作；本手册进入主线不等于这些动作已经完成。

## 5. 回滚

先停止入口流量与 `meliora.service`，再把 `current` 指回上一版本并启动。SQLite/WAL/SHM 不随代码回滚删除或覆盖；恢复前先保留脱敏证据，避免重复提交已执行的 Turn。
