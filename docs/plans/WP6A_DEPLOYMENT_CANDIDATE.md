# WP-6A 老师演示可部署候选施工卡

> 状态：Candidate；Windows 本地门禁通过，Ubuntu 回环待验
> Issue：[#45](https://github.com/yuzhang-ai/meliora-harness/issues/45)
> 基线：`origin/main@f8d85bc264c92a2693ebce2cf73844bbf5177c6d`
> 施工现场：`C:\codex-worktrees\meliora-wp6a-deploy-candidate` / `codex/wp6a-deploy-candidate`
> 权威范围：正式启动入口、无密钥回环验收、部署模板与验证门禁
> 不负责：DNS、TLS 签发、服务器写入、服务启用、端口开放、真实 Provider 凭证或付费调用

## 目标与验收

把当前只能用 `tsx src/local-dev.ts` 启动的开发装配，收敛为可在 Ubuntu 单机重复安装和验收的候选：

1. 正式入口只能监听 `127.0.0.1`，生产模式缺少 Provider 配置时 fail closed。
2. 独立的 fixture 入口可无密钥完成一次只读 POST、SSE 终态和重启后 GET-only 恢复；fixture 不能调用外部 Provider，也不能被误称为真实模型。
3. Nginx 候选同时保护页面与 `/api`，关闭 SSE 缓冲，禁止 POST 上游重试，只把 API 转发到回环端口。
4. systemd 候选使用非特权用户、受限环境文件、显式读写目录和基础 sandbox；仓库只保存占位符。
5. 根检查、Server 聚焦测试、部署策略测试和独立安全复审通过。

## 事实源与证据计划

- 源码与契约：`apps/server`、`apps/web`、`packages/session-store`。
- 发布边界：`docs/deployment/TEACHER_DEMO_READINESS.md`。
- 静态证据：TypeScript、配置策略测试、敏感字段扫描。
- 真实运行证据：本机/CI 无密钥 fixture 回环；Ubuntu 原生依赖与 Nginx/systemd 仍留到服务器只读/回环阶段。
- 外部可见证据：本切片不产生；公网与 HarmonyOS API 26 验收继续保持 Pending。

## 允许动作与停机条件

允许修改启动装配、部署模板、文档和测试；允许提交、推送 Draft PR。禁止写服务器、改 DNS、防火墙或真实凭证。若入口需要扩大 Server/Store 公共契约、监听非 loopback、或 fixture 与生产模式无法可靠隔离，则停止实施并重新审查架构。

## 当前证据与下一步

`npm run check`、Server 89/89、Web 35/35、部署聚焦测试 2/2 已通过。部署测试从 fixture Server 自身审计到同一进程两个独立 POST/SSE Run，并在重启后只观察到 GET `/resume`，没有隐藏 POST。第一轮独立复审的请求观测 P2 已补回归，等待短复验；P0/P1 为 0。通过后才进入 Ubuntu 回环部署切片。
