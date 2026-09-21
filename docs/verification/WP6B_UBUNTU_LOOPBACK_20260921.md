# WP-6B Ubuntu 回环部署验收记录

> 状态：PASS（回环门）；公网门未开始
> 日期：2026-09-21
> Issue：[#47](https://github.com/yuzhang-ai/meliora-harness/issues/47)
> 版本：`main@0536104d64913962946bc785818f51c0488df078`
> 目标：阿里云 Ubuntu 单机 `meliora-demo`

## 验收结果

| 检查项 | 真实运行结果 |
|---|---|
| 运行时 | Ubuntu x86_64；Node `v22.23.2`；npm `10.9.8`；Nginx `1.24.0`；Git `2.43.0` |
| 版本目录 | `/srv/meliora/releases/0536104d64913962946bc785818f51c0488df078`，Git HEAD 与合并提交一致 |
| 原生依赖 | 服务器重新执行根目录及 Web `npm ci`；未复制 Windows `node_modules` |
| 全量门禁 | Ubuntu 根 `npm run check` 退出码 0；Store 156/156、Server 89/89、Web 35/35、deploy 2/2、E3 全部通过，Web production build 成功 |
| 无密钥链路 | deploy 测试完成同进程两个独立 POST/SSE terminal Run，以及进程重启后的 GET-only `/resume` |
| systemd 回环探针 | 以 `meliora` 用户和候选 sandbox 属性启动 transient fixture unit；`/api/health` 返回 `{"ok":true}` |
| 监听边界 | 运行时仅 `127.0.0.1:8787`；探针结束后 unit 为 inactive，8787 已关闭；持久 Meliora/Nginx 均未启动 |
| 版本指针 | `/srv/meliora/app/current` 指向上述版本目录；固定演示 workspace 是同一公开仓库的独立 checkout |
| unit 静态检查 | `systemd-analyze verify` 未报告 Meliora unit 错误；输出中的警告来自服务器既有 `cloudmonitor.service` |

## 可复跑的脱敏证据

以下是按实际执行身份和先后顺序整理的规范化命令，不包含凭证。

1. root 在干净发布目录安装依赖并执行全量门禁；`npm run check` 退出码为 `0`，其中 deploy 测试为 `2/2`。

   ```bash
   cd /srv/meliora/releases/0536104d64913962946bc785818f51c0488df078
   npm ci
   npm --prefix apps/web ci
   npm run check
   readlink -f /srv/meliora/app/current
   systemd-analyze verify deploy/systemd/meliora.service
   ```

2. root 以 `meliora` 身份启动无密钥 transient fixture。三项环境变量均为非敏感文件系统配置；命令没有 Provider transport 或 Provider Key。

   ```bash
   systemd-run --unit=meliora-fixture-acceptance \
     --property=User=meliora --property=Group=meliora \
     --property=WorkingDirectory=/srv/meliora/app/current \
     --property=NoNewPrivileges=yes --property=PrivateTmp=yes \
     --property=ProtectSystem=strict --property=ProtectHome=yes \
     --property=ReadOnlyPaths=/srv/meliora/app/current \
     --property=ReadOnlyPaths=/srv/meliora/demo-workspace \
     --property=ReadWritePaths=/var/lib/meliora \
     --property=ReadWritePaths=/var/log/meliora \
     --setenv=MELIORA_WORKSPACE_ID=portfolio-demo \
     --setenv=MELIORA_WORKSPACE_ROOT=/srv/meliora/demo-workspace \
     --setenv=MELIORA_DATABASE_PATH=/var/lib/meliora/fixture-acceptance.sqlite \
     /usr/bin/node --import tsx apps/server/src/demo-fixture-server.ts
   ```

3. fixture 运行期间，健康接口返回 `{"ok":true}`，`ss` 显示应用只监听 `127.0.0.1:8787`。

   ```bash
   curl --fail --silent http://127.0.0.1:8787/api/health
   ss -ltnp
   ```

4. root 停止 transient fixture 后再做最终 read-back。

   ```bash
   systemctl stop meliora-fixture-acceptance.service
   systemctl is-enabled meliora.service
   systemctl is-active meliora.service nginx.service meliora-fixture-acceptance.service
   ss -ltnp
   ```

最终 read-back：`current` 指向上表版本目录；持久 `meliora.service` 为 disabled/inactive；fixture 与 Nginx 为 inactive，`ss` 不再出现 `:8787`、`:80` 或 `:443`。

## 保持未完成的边界

- 没有创建或装载真实 Provider Key，没有付费请求。
- 没有安装最终 `/etc/meliora/server.env`，旧持久 unit 仍为 disabled/inactive。
- 没有启用 Nginx，没有开放 80/443/8787，没有修改 DNS 或签发证书。
- Basic Auth、TLS、Nginx SSE/204/409 透传仍需在边缘门真实验证。
- HarmonyOS 7 / API 26 真机或官方模拟器验收仍为 Pending。

## 下一步

先只读核验 `melioracode.com` 的 DNS/备案接入状态；确认解析目标后，再以独立发布动作完成 TLS、Basic Auth 和 Nginx 边缘验收。真实 Provider 环境与付费 canary 放在边缘安全门之后。
