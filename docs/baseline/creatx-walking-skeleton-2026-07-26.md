---
title: CreatX Walking Skeleton Live Evidence
doc_type: implementation-evidence
owner: integration
status: live-checkpoint
last_verified: 2026-07-26
source_commit: c9a4ae4
---

# CreatX Walking Skeleton Live Evidence

## 结论边界

提交 `c9a4ae4` 完成了第一条生产 Walking Skeleton（可运行骨架）。它证明同一个真实 Electron 应用可以连接生产 Renderer（渲染层）、稳定 CreatX IPC（进程间通信）合同、Cline SDK `0.0.65`、真实 DeepSeek Provider（模型服务）、原生工具审批、真实项目文件、Cline SQLite 历史和重启后的新回合。

这是第一条骨架的 Live（真实运行）检查点，不是完整 V1、发布构建或全部能力验收完成。

## 连续真实链路

最终 `bun run test:electron-live` 在同一用户数据目录中完成：

```text
首次 Electron 进程
→ 用户发送消息
→ DeepSeek deepseek-chat 产生真实工具请求
→ Electron 显示 editor 输入与全机信任提示
→ 拒绝一次并取消，denied.md 不存在
→ 用户发送新的文件任务
→ 审批目标被校验为当前中文和空格项目目录内的 continuous-live.md
→ 用户允许一次
→ Cline 写入真实 Markdown
→ 文件列表和预览读取同一个磁盘文件
→ 外部修改后显式刷新可见
→ 正常退出且无该用户数据目录的 Electron 子进程
→ 第二次 Electron 进程恢复历史和文件
→ 用户发送“继续”
→ DeepSeek 返回 CONTINUATION_OK
→ 正常退出且无残留进程
```

活动 Run 退出后不会自动恢复或重放工具；“继续”是一个由用户发起的新回合。

## 冻结验收

环境：Windows、Bun `1.3.14`、Node `24.15.0`、Electron `42.3.3`、Cline SDK `0.0.65`、DeepSeek `deepseek-chat`。

| 命令 | 结果 |
| --- | --- |
| `bun run install:windows` | 通过；393 installs / 440 packages，无变化 |
| `bun run typecheck` | 通过 |
| `bun test` | 16 pass，0 fail，29 次断言，3 个测试文件 |
| `bun run test:imports` | 通过；只有 `creatx/packages/cline-adapter` 导入 Cline |
| `bun run build` | Main、CommonJS Preload 和 Renderer 生产构建通过 |
| `bun run test:desktop` | 通过；1360×860 与 900×700，无页面错误、控制台错误、整体溢出或残留主进程 |
| `bun run test:live` | 通过；真实 DeepSeek、editor 审批、真实文件写入和 Runtime 释放 |
| `bun run test:electron-live` | 通过；连续链路、重启历史和新“继续”回合均完成 |

`bun run build` 仍报告父级冻结 NovelX `tsconfig.json` 缺少 `@tsconfig/bun/tsconfig.json` 的警告；CreatX 自己的显式类型检查和三端生产构建通过。本批次没有为了消除该警告修改冻结参考根。

## 证据文件

- `artifacts/walking-skeleton/desktop-1360x860.png`
- `artifacts/walking-skeleton/desktop-900x700.png`
- `artifacts/walking-skeleton/electron-live-first-run.png`
- `artifacts/walking-skeleton/electron-live-restarted.png`

## 已知限制

- Renderer 命令只传 `projectId` 和 `fileId`；绝对路径只作为只读 `displayPath` 返回，Main 在当前进程保存项目 ID 到真实路径的映射。
- 项目目录是 Cline 工作上下文，不是沙箱。用户批准文件或 Shell 工具后，该调用可能访问整台机器。
- Provider 用量尚未投影到 CreatX UI，因此 `ACC-PHS-003` 只部分通过。
- Provider 失败分类主要由定向测试验证；未对每一种真实未授权、额度、网络和模型故障分别做付费 Live 测试。
- 取消只验证了等待审批阶段，且拒绝后没有文件副作用；尚未证明已开始执行的工具或模型流在所有时序下都能及时取消。
- 连续 Live 使用中文和空格项目目录中的 ASCII 文件名。曾观察到 Cline editor 创建中文新文件名时返回成功但目标文件不存在，该兼容性风险尚未形成稳定复现和修复。
- 未验证安装包、自动更新、长时间资源占用或发布级内存基线。
- 侧聊、Growth、Study、Living、图片、`.creatx` 注册、完整工作台、版本、回收站、Watcher（监听器）、项目换肤、四档权限、严格沙箱、后台继续、精确活动 Run 恢复和长期记忆均未实现。

## 下一入口

后续任务从 `c9a4ae4` 及其后的本证据提交读取真实合同。六份 Worktree 任务书只是候选；必须先选择一个有独立验收、文件集合不重叠且不依赖其他中间实现的有界能力。未满足 Schema、Provider 或共享合同门禁的候选继续阻塞。
