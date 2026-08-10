---
title: CreatX Register Workbench Live Evidence
doc_type: implementation-evidence
owner: integration
status: live-checkpoint
last_verified: 2026-07-27
source_commit: 013987c
---

# CreatX 注册工作台 Live 证据

## 结论边界

第一条注册工作台纵向闭环已经接入生产 Electron、Cline SDK `0.0.65`、真实 DeepSeek Provider（模型服务）、原生逐次审批、真实项目目录、`.creatx` V1 记录、Renderer 工作台标签和重启恢复。

这证明“AI 创建真实目录并注册为通用工作台”的核心用户故事可运行，不代表模板、封面、手动注册、删除、迁移、Watcher（监听器）、版本或回收站已经实现。

## 连续真实链路

`bun run test:electron-live` 在一个含中文和空格的 Windows 临时项目中完成：

```text
准备一个独立的“拒绝注册”目录
→ DeepSeek 调用 register_workbench
→ 用户拒绝，确认没有 JSON 和工作台标签
→ 用户要求创建名为“小说”的创作项目
→ DeepSeek 依次调用 Cline editor 创建 小说/大纲.md 与 小说/第一章.md
→ 两次审批输入的相对路径和正文严格匹配后批准
→ DeepSeek 调用 register_workbench(folder=小说, title=小说)
→ 第三次原生审批后批准
→ .creatx/workbenches/wb_<uuid>.json 原子创建
→ Renderer 立即出现“小说”工作台并列出两份真实 Markdown
→ 从工作台点击 第一章.md，右侧预览读取同一磁盘正文
→ 退出无残留 Electron 子进程
→ 注入一条损坏 JSON
→ 重启后同一工作台和两份文件恢复，损坏记录只产生非阻塞诊断
→ 从恢复的工作台点击 大纲.md，右侧预览读取同一磁盘正文
→ Cline 历史继续仍返回 CONTINUATION_OK
```

最终一次真实记录 ID 为 `wb_cd560222-bfe8-455d-9089-2b190de15400`。测试结束后临时项目和用户数据按设计清理，该 ID 只作为本次运行证据。

## 验收结果

环境：Windows、Bun `1.3.14`、Node `24.15.0`、Electron `42.3.3`、Cline SDK `0.0.65`、DeepSeek `deepseek-chat`。

| 命令 | 结果 |
| --- | --- |
| `bun install` | 通过；只加入本地 `@creatx/workbench` Workspace Package（工作区包）并更新锁文件 |
| `bun run typecheck` | 通过 |
| `bun test` | 37 pass，0 fail，100 次断言，4 个测试文件 |
| `bun run test:imports` | 通过；只有 `creatx/packages/cline-adapter` 导入 Cline |
| `bun run build` | Main、CommonJS Preload 和 Renderer 生产构建通过 |
| `bun run test:desktop` | 通过；1360×860、900×700、860×620，无页面错误、控制台错误、整体溢出或残留主进程 |
| `bun run test:live` | 通过；原有真实 DeepSeek、editor 审批和文件链未回归 |
| `bun run test:electron-live` | 通过；真实创建两份 Markdown、注册拒绝无写入、批准落盘、工作台文件预览、损坏隔离、退出和重启恢复连续完成 |

`bun run build` 仍有父级冻结 NovelX `tsconfig.json` 缺少 `@tsconfig/bun/tsconfig.json` 的既有警告；CreatX 类型检查和三端生产构建通过。本批次没有修改冻结参考根。

## 证据文件

- `artifacts/walking-skeleton/desktop-1360x860.png`
- `artifacts/walking-skeleton/desktop-900x700.png`
- `artifacts/walking-skeleton/desktop-860x620.png`
- `artifacts/walking-skeleton/electron-live-first-run.png`
- `artifacts/walking-skeleton/electron-live-restarted.png`

## 已知限制

- `register_workbench` 只注册现有目录。本次 AI 通过两次 Cline 原生 `editor` 创建文件和父目录，再单独审批注册；该故事没有使用 Shell（命令行）。
- 缺失目录的 `missing` Projection（投影）和 Renderer 状态已实现，但本批没有在真实 Electron 中删除目录后截图验收。
- 元数据 create-only 并发冲突、非法路径、Junction（目录联接）逃逸和重复记录由真实 Windows 临时目录测试覆盖；没有注入磁盘满、权限拒绝或进程在原子落点中间崩溃。
- 本次 Live 已在首次运行中从注册工作台点击 `第一章.md` 预览，并在重启后点击 `大纲.md` 预览；两次均与磁盘 UTF-8 正文严格一致。
- V1 没有手动注册、改名、重新定位、删除、自动迁移、模板、封面、布局或内容类型。

## 下一入口

注册工作台第一纵向闭环完成后，不再要求集成线继续扩张。下一批必须从尚未通过的具体 Acceptance ID（验收编号）或另一条独立能力线选择；候选 Worktree 仍需逐条确认文件所有权和验收，不自动同时创建。
