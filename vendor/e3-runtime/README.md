# E3 Runtime 迁移区

这里保存 Meliora 从 Formal R3 E3 Harness 提取的最小 TypeScript 闭包和 characterization scripts。

```text
Source repository: https://github.com/ImlittleA/zhiqu.git
Annotated tag: ai-landing-page-harness-e3-minimum-integration-go-20260906
Tag object: a0d962431278f09c0a0bc6528f420a9b827c2229
Source commit: 455c7aebe0ba644f9096e872ce7c8275cfa45281
Extraction date: 2026-09-10
```

规则：

- 本目录只用于迁移与行为回归，不作为最终包布局。
- 导入文件来自上述 commit，不读取旧 worktree 的未提交内容。
- `config/fixtures/e3-minimum-integration.ts` 是 Meliora 的等价空 Host fixture，替代原 fixture 对完整 Demo 页面和模板目录的依赖。
- `private-local-sqlite.ts` 在 Windows 只保留路径和链接结构检查；正式 Workspace Host 必须补充 Windows ACL 所有权验证，不能把 POSIX mode bits 当作 Windows 安全证据。
- 首先保持行为，通过独立 typecheck 和 characterization tests。
- 新的 Coding Agent 能力写入正式 `packages/*`，不要继续把产品逻辑堆进迁移区。
- 删除 UX/Canvas 依赖前，必须由正式 Host Port 和对应测试替代。
- 真实 Provider 脚本保留作人工 canary，不进入零密钥 CI。

运行：

```powershell
npm.cmd install
npm.cmd run check
```
