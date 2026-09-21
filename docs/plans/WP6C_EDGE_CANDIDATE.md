# WP-6C 边缘接入执行卡

> 状态：Candidate
> Issue：[#49](https://github.com/yuzhang-ai/meliora-harness/issues/49)
> 基线：`main@c873a83f106c8ca1d0817dc4de82082f54207080`
> 施工现场：`codex/wp6c-edge-candidate`

## 目标与验收

为 `melioracode.com` 准备可回滚的 DNS/TLS/Nginx 边缘候选，但不在本切片修改 DNS、签发证书、安装密码、开放端口或启动正式 Provider。

- HTTP bootstrap 只提供 ACME challenge，任何其他路径返回 `404`。
- 最终 HTTP 只为正确域名保留 ACME challenge 和 HTTPS 重定向；未知 Host 直接拒绝。
- HTTPS 对页面和 `/api` 统一启用 Basic Auth。
- 未知 Host 由显式 HTTP/HTTPS default server 拒绝，不落入 Meliora 站点。
- `/api` 保留固定回环 upstream Host、SSE 非缓冲、204/409 透传与禁止 upstream retry。
- 对单 IP 的 API 请求和并发连接设置有界限制。
- Nginx 候选必须整文件安装到 `sites-available/meliora` 并由 `sites-enabled/meliora` 引用；不得嵌入现有 `server {}`。
- Ubuntu 使用临时、非生产证书和认证文件执行 `nginx -t`；验证后不启用 Nginx。

## 当前事实源

- 2026-09-21 DNS read-back：权威 NS 为 `dns11.hichina.com`、`dns12.hichina.com`；根域名与 `www` 没有 A/AAAA。
- 服务器：Ubuntu 24.04.5；Nginx 1.24.0 已安装，`certbot` 与 `htpasswd` 未安装。
- UFW active，默认 deny incoming，只允许 SSH 22；本机只有 SSH 和 loopback DNS 监听。
- `meliora.service` 与 Nginx 均 disabled/inactive；WP-6B transient fixture 已停止。

## 允许动作

- 修改并测试仓库中的 Nginx 候选、文档与静态契约测试。
- 在服务器临时目录用非生产自签证书和临时认证文件执行 `nginx -t`，完成后删除临时文件。
- 只读核验 DNS、UFW、监听端口、包状态与服务状态。

## 需人工确认的动作

- 阿里云 DNS、安全组和 UFW mutation。
- 证书签发及证书私钥落盘。
- Basic Auth 用户名/密码创建与交付。
- 持久 Nginx/systemd 安装、启用和公网切流。
- Provider Key 装载、真实模型请求与付费 canary。

## 停机条件与回滚

- `nginx -t`、认证、TLS、SSE、204/409 或无重试断言任一失败即不启用公网。
- 发现凭证、私有 workspace、Provider 原文或 Artifact ID 泄露立即停止并回退。
- 回滚顺序：停止入口流量 → 停止 Nginx/Meliora → 恢复旧配置/版本指针 → 保留 SQLite/WAL/SHM → read-back 服务与端口。

## 下一步

候选通过本地、Ubuntu `nginx -t`、全仓 CI 与独立审查后合并。随后由发布者执行 DNS A 记录，再进入证书、Basic Auth 和受控公网验收。

## 验证记录

- 本地 `npm run test:deploy`：2/2；`git diff --check` 通过。
- Ubuntu Nginx 1.24.0：bootstrap 与 final 候选均使用临时测试 wrapper、自签证书和空认证文件通过 `nginx -t`。
- Ubuntu `systemd-analyze verify` 未报告 Meliora unit 错误；仅输出服务器既有 `cloudmonitor.service` 警告。
- 临时证书、认证文件、wrapper 与复制的候选均已清除；Nginx/Meliora 保持 inactive，本机无 80/443/8787 监听。
- 2026-09-21 再次向 AliDNS 权威服务器 read-back：根域名与 `www` 的 A/AAAA 均为空。
- Terra 高思考独立复审通过：P0/P1/P2 均为 0。
