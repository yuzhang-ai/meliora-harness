# Meliora 单机作品集部署手册

> 状态：Ubuntu 回环已验收；边缘 Candidate 待执行
> 版本：v0.2
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
deploy/nginx/meliora-acme-bootstrap.conf 仅 ACME HTTP challenge 的启动候选
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
3. DNS 已生效后，将完整的 `deploy/nginx/meliora-acme-bootstrap.conf` 安装为 `/etc/nginx/sites-available/meliora`，再从 `/etc/nginx/sites-enabled/meliora` 建立软链并删除默认站点。它只允许 HTTP ACME challenge，其余路径固定 `404`；不得在此阶段暴露 Web 或 `/api`。
4. 证书签发成功后，用完整的 `deploy/nginx/meliora.conf` 原子替换 `/etc/nginx/sites-available/meliora`。Ubuntu 的 `/etc/nginx/nginx.conf` 在 `http {}` 内 include `sites-enabled/*`，因此文件顶部的限流 zone 会处于合法的 `http` context；禁止把该文件粘贴进现有 `server {}`。最终配置只在 HTTP 暴露 ACME challenge 和 HTTPS 重定向；HTTPS 全站 Basic Auth，并对 `/api` 设置单 IP 请求/连接上限。未知 Host 由显式 default server 直接拒绝。先执行 `nginx -t`，再验证未认证页面和 `/api` 均为 `401`。
5. 通过认证后验证一次 POST/SSE、终态 `204`、raw-tail `409`、刷新 GET-only 恢复；Nginx 不缓冲 SSE、不拦截错误，也不重试上游请求。
6. 扫描 Web dist、日志、SQLite、WAL、SHM 和浏览器存储，确认没有 Provider Key 精确原值。

### 边缘门顺序

1. read-back 根域名与 `www` 的 A/AAAA；根域名和 `www` 只指向本机 IPv4，不发布未配置的 AAAA。
2. 核验阿里云安全组与 UFW；保持 8787 永不公网开放，只为证书和站点开放 80/443。
3. 安装 `certbot` 与 `apache2-utils`，创建 `/var/www/letsencrypt`，按上述固定路径安装 bootstrap，删除默认站点，`nginx -t` 后才启动 Nginx。
4. 用 webroot 模式签发证书；邮箱、服务条款与证书私钥均由发布者在服务器交互处理，不写入仓库或聊天记录。
5. 用 `htpasswd` 交互创建 `/etc/nginx/.htpasswd-meliora`，设为 `root:www-data`、`0640` 后安装最终 TLS 配置；密码不得出现在命令行参数、聊天、截图或仓库中。
6. 先完成无 Provider 的静态页、认证、TLS、ACME、错误码和回环代理验收；正式 Provider 服务与付费 canary 单独启用。

任何一步失败都保持或恢复为：Nginx inactive、UFW 只允许 SSH、DNS 可回退、Meliora 只允许 loopback。

公网启用、DNS、证书签发和真实 Provider Key 装载是独立发布动作；本手册进入主线不等于这些动作已经完成。

## 5. 回滚

先停止入口流量与 `meliora.service`，再把 `current` 指回上一版本并启动。SQLite/WAL/SHM 不随代码回滚删除或覆盖；恢复前先保留脱敏证据，避免重复提交已执行的 Turn。
