---
title: 艺术库视觉整理与真实审批有界验收
doc_type: baseline
owner: art-library
status: bounded-electron-verified
last_verified: 2026-08-10
---

# 艺术库视觉整理与真实审批有界验收

## 结果

艺术库保持唯一 `incoming → approval → libraries` 文件状态机，并完成以下升级：

- v2 单图整理把作品解读、`patternTags / compositionTags / moodTags` 和 `STYLE / COMPOSITION / SCENE / NEGATIVE` 分开保存；旧 v1 只投影为 `legacy-unverified`。
- `read_art_images` 与 `submit_art_approval` 在工具层和 Service 层均强制一次一图；分类上下文返回当前关键词频率和最多4条代表摘要。
- 审批命令和真实 React 页面允许修改标题、分类、作品解读、色板、三组标签和四层 Prompt；错误保留当前选择与草稿，未提交草稿在页面切换后仍按作品 ID 保留，批准或拒绝后清除，提交期间禁止重复操作。
- 63条旧种子删除旧解读、Prompt、标签和分类，只保留校验过的原图与来源重新进入 `incoming`；非种子条目不变。
- 生产页面直接读取 `readArtLibrary()`，响应 `art_library.changed` 的单调 revision，每个新 revision 最多读取一次；没有 iframe 或艺术库 `localStorage` 事实权威。
- “导出关键词”是当前批准作品标签的确定性去重；“提取风格”进入普通对话，不持久化固定库级结论。

关键实现提交：`05aee36`、`13516af`、`d1b69c3`、`af05dbe`、`3baae1d`、`63482ec`。

## 自动验收

- 定向：`bun test packages/art-library-runtime/tests/art-library-runtime.test.ts apps/desktop/tests/art-library-asset-protocol.test.ts apps/desktop/tests/attachments.test.ts apps/desktop/tests/art-turn-sources.test.ts apps/desktop/renderer/tests/art-library-page.test.tsx` → 38/38，203 次断言。
- Renderer：`bun test apps/desktop/renderer/tests` → 113/113，563 次断言。
- 全量：`bun test` → 499/499，3,564 次断言。
- `bun run typecheck` → PASS。
- `bun run test:imports` → Cline 与 Node strip-types 两项边界 PASS。
- `bun run build` → Main、Preload 和 Renderer Production Build（生产构建）PASS。
- `git diff --check` 在提交前执行；无空白错误。

## 隔离 Electron

`node --experimental-strip-types scripts/electron-art-library-test.ts` 使用临时 `--user-data-dir`、临时项目和真实构建页面，Provider 调用为零。它完成：

1. 真实 Service 状态机准备 `chat-attachment / project-file / web` 三种来源标记的三条候审作品；启动时63条内置种子成为普通重整理候选。
2. 页面逐字段修改第一条作品并批准到新分类；第二条暂缓后用空标题批准，Runtime 失败关闭，返回列表再进入仍保留空标题草稿；第三条经确认弹窗驳回。
3. 导出文本精确为 `用户形式, 原始构图0, 用户构图, 用户情绪`，没有模型调用。
4. 三次冷启动保持批准、暂缓、驳回墓碑和全部用户修订；合法受限图片加载，元数据、查询、穿越 URL 和冷启动后的哈希篡改原图加载失败。
5. 三个 Electron Main PID 均退出；成功运行的临时 Profile 与项目由脚本清理。
6. 正式候选路径 `%APPDATA%\creatx\creatx\art-library` 前后均为193个文件，摘要均为 `f3bdeb84e3b414bb6aa38a507777576cbf9ef5db09bd9d2de6b0ecee0dc802f1`，证明未修改正式艺术库。

既有 `electron-noven-brand-test.ts` 同步从 iframe 断言改为真实 React 页面断言，并以共享 Electron runtime 运行通过，确认 JetBrains Mono 在艺术库页面真实加载。

## 未通过与非 Live 边界

- 本机没有显式配置可确认支持视觉输入的文本 Provider，也没有图片 Provider 环境配置。本批没有调用外部 Provider，没有让真实普通会话看图生成作品解读或四层 Prompt，也没有移除原图、替换 `SCENE` 后生成新图。因此 `ACC-ART-025/026/029/030/032` 的模型质量与视觉保持未 Live。
- Electron 脚本中的三种来源由真实 Service 状态机准备，用于验证页面、持久化和来源投影；它不是 Agent 在普通会话中调用收集工具的证据。当前回合附件、项目文件和公网收集的权限、重复与失败路径继续由自动测试覆盖。
- `bun run test:desktop` 启动真实 Electron 后，在进入艺术库前因旧 Paper Workspace（纸面工作区）断言失败：测试要求 Chat 模式隐藏最右工作台导航，当前已接受布局要求该导航常驻。现场 `pageErrors / consoleErrors / failedRequests` 均为空。该旧断言没有为本批倒退产品语义。
- 三次启动/清理诊断在脚本修复前留下 `D:\CodexCache\Temp\noven-art-library-data-22iGhM`、`...-MYx5zv` 和 `...-eJJK3u`；相关 Electron 进程均已不存在，后续成功运行可自动清理，但当前执行环境阻止删除这三个工作区外旧目录。它们只含隔离测试 Profile，可由用户安全删除。
- 未提交审批草稿只在当前应用进程内按作品 ID 保留，批准、拒绝或条目被外部移除时清理；应用退出后不会把草稿冒充成已保存元数据。当前没有跨进程草稿恢复或退出前提醒。
- 未运行 Windows 打包、安装、更新或正式 Profile 普通会话。

## 恢复入口

下一步不是继续修改文件状态机，而是在用户提供明确的视觉文本模型和图片 Provider 隔离配置后运行质量抽样：单图真实观察 → v2整理 → 移除原图 → 只替换 `SCENE` → 纯文字生成新图 → 人工记录视觉语言保持或漂移。不得用字段长度、Fixture、当前原图参与生成或艺术家姓名代替这项验收。
