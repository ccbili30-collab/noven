---
title: Composer Skill 五项严格串行主线交接
doc_type: handoff
status: active
date: 2026-08-08
primary_capability: creative-skills
adjacent_capabilities:
  - image-runtime
  - desktop-shell
---

# 给主线 Agent 的结论

Composer Skill 五项挂篮的底层串行、图片等待、可信回执、正式 Live 和 Windows 0.1.11 已形成可继续开发的稳定批次。权威代码根是 `D:\CodexW\Creatx\creat1`，当前活动分支是 `topic-genre-style`。仓库没有本地或远端 `main` / `master` 分支；项目约定中的“主线”指该权威根上的最新整合历史，不要为形式新建或重命名分支。

当前权威实现提交：

```text
07b203909aaf2a60ccea5cc74c4516e5d2ff01b2
fix(skills): complete strict skill sequences
```

# 已完成能力

1. 当前 Skill 只有取得可信 `completed` 回执后才进入下一项。
2. `partial`、`blocked`、失败、取消、缺回执或四个执行片段耗尽都会停止后续项。
3. 地图至少验证 1 张当前步骤图片，六人群像至少 6 张，漫画至少 1 张；旧任务 ID 不得冒充本轮图片证据。
4. 同步 `generate_image` 可以成为当前步骤可信图片证据。
5. `wait_for_skill_sequence_images` 只对 `skill-sequence` Tool Audience（工具受众）开放，由 Runtime 一次等待当前步骤提交的持久图片；禁止 Agent 使用 Shell 睡眠、目录扫描或重复任务列表轮询。
6. 相同完成回执作为 Exact Retry（精确重试）幂等返回；内容不同的第二份回执继续冲突失败。
7. 普通对话看不到内部序列工具；同一序列仍只有一条正式用户消息，最终 Assistant 汇报留在原会话。
8. Electron 构建白名单显式包含 `@creatx/live-archive-runtime`，干净工作区不再依赖偶然解析。

# 正式 Live 证据

- 项目：`D:\CodexW\Creatx\skill-sequence-live`
- 会话：`1786178002600_eskup`
- 序列：`skill_sequence_1786178009558`
- 顺序：地图 → 六人角色群像 → 小说大纲与前两章 → 两页漫画 → 项目研究总结。
- 最终图片：22 succeeded、0 failed、0 interrupted、0 cancelled。
- 项目、会话、图片、交付记录禁止删除，也不要为了验证截图重新运行五项任务。
- 权威证据：`docs/baseline/creatx-skill-sequence-formal-live-2026-08-08.md`。

真实根因是人物步骤用 `Start-Sleep` 和工具列表反复轮询六张图片，触发 Cline SDK 0.0.65 Mistake Tracker（重复工具循环检测）主动 Abort；图片 Provider 本身没有失败。内部一次性等待工具是底层修复，不是 Prompt 表面补丁。

# 当前验收

- Cline Adapter：104/104，372 次断言。
- 全量：404/404，3,174 次断言。
- 提交快照：Typecheck、Import Boundary、Production Build 通过。
- Windows 0.1.11：NSIS、Blockmap、Portable x64 打包成功。
- 本批没有再次运行完整五项 Live。

当前模型不支持视觉输入。地图、人物和漫画只完成真实文件、队列终态、尺寸、透明度、像素方差和 HTTP 等程序化检查；未完成人工视觉目检，地图掩码也是程序化近似对齐。不得把这些结果改写成画风或构图已经人工验收。

# Windows 0.1.11

- 安装版：`creatx/release/CreatX-0.1.11-x64-Setup.exe`
  - SHA-256：`B28CFA9E934B7EE36713ED94322A9F088DB72186034A01B6DFB01F0CAD3D1D9E`
- 便携版：`creatx/release/CreatX-0.1.11-x64-Portable.exe`
  - SHA-256：`F3FFF113EB3C7B24C8428D45D49AEEFF43C1B1C2C2EB8E3DA19A374C24A198D3`
- FileVersion：`0.1.11`
- Authenticode：`NotSigned`
- 当前解包程序从 `creatx/release/win-unpacked/CreatX.exe` 启动，环境项目根为 `D:\CodexW\Creatx\skill-sequence-live`；不要在交接时自动发送任务。

# 前端工作接回主线

当前权威根仍有另一批未提交的 Preview、`WorkspaceShell.tsx`、`ProjectNavigation.tsx`、截图与讨论文档修改。这些文件不属于本批，未暂存、未覆盖、未提交。

另一个 `c466` 工作树曾停在 amend 前提交 `d31c73a`。`d31c73a` 与 `07b2039` 是同一父提交上的两个兄弟版本，不能把 `d31c73a` 当作当前主线再次整体合并。正确方式是：

1. 让前端 Agent 先把自己新增的纯前端差异形成独立提交。
2. 在 `07b2039` 之后只 Cherry-pick（遴选提交）这些前端新增提交，或把这些提交 Rebase（变基）到当前权威 HEAD。
3. 不要 Cherry-pick `d31c73a`，不要用旧文件整体覆盖 Main、Adapter、Image Runtime、Contract 或本交接文档。
4. 冲突时以 `07b2039` 的 Skill 序列、图片门禁、Live Archive 和回执语义为权威，只重放前端展示差异。

# 已知风险与未完成项

1. `bun install --frozen-lockfile` 在新 Windows 工作树安装 1,361 个包后，会在 `@sap-ai-sdk/foundation-models@2.13.0` 和 `@sap-ai-sdk/orchestration@2.13.0` 的复制联接上出现 `ENOENT`。使用正式根同一锁文件、同版本已安装包补齐后，隔离构建和打包通过；冻结安装仍不能称为 PASS，需作为独立依赖可复现性任务修复。
2. 主工作树当前 Typecheck 可能被另一批未提交前端修改中的 `projectWorkbenches` 可选类型不一致阻塞；隔离的 `07b2039` 提交快照本身通过。不要为瞬时前端错误修改 Runtime 兼容垫片。
3. 两个临时验收目录可能因 Windows 对依赖路径返回访问拒绝而残留：`D:\CodexW\Creatx\skill-sequence-release`、`D:\CodexW\Creatx\skill-sequence-verify`。它们已经不在 Git worktree 注册表中，指向正式依赖的外部 Junction（目录联接）已移除；后续可在确认无进程占用后单独清理，不得把它们当项目事实。
4. 远端 `origin` 当前没有可见分支引用，本批没有 Push（推送）。若要建立 GitHub 主分支，必须先由用户确认远端分支命名和发布策略。

# 下一位 Agent 的恢复顺序

```powershell
Set-Location 'D:\CodexW\Creatx\creat1'
git log -1 --oneline
git status --short
git worktree list --porcelain
```

预期权威提交至少包含 `07b2039`。先区分当前未提交前端文件与本批已提交文件，再处理前端提交。前端接回后统一执行：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun typecheck
bun run test:imports
bun test
bun run build
```

不要先重跑正式五项 Live。只有上述整合验证通过、用户明确要求新真实验收时，才考虑建立新的项目和会话；不得覆盖或删除现有 `skill-sequence-live`。
