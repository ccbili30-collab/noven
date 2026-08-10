---
title: CreatX 六线共享接口验收证据
doc_type: implementation-baseline
owner: integration
status: verified
last_verified: 2026-07-27
implementation_commit: f289dd3
---

# CreatX 六线共享接口验收证据

## 1. 结论

提交 `f289dd3`（`feat(core): add shared capability ports`）实现并验证了两组最小共享边界：

- `ProjectFileService` 独占 Main 内项目 ID 到真实根路径映射，并提供 `ProjectFileQueryPort/ProjectFileCommandPort`。
- 中立 `CreatXToolContribution` 由唯一 Cline Adapter 通过公开 `createTool/extraTools` 转换，并使用 Cline 原生 Tool Policy（工具策略）。

这不是六条线全部开工或能力完成声明。当前只有 Renderer-only UI、有验收编号的单一 Adapter 缺口和单一 Project Files 后续能力可以进入范围审查；Workbench、Creative Plugin 和 Image Runtime 仍分别被 Schema（数据合同）、Skill 范围/Workbench Port 和真实图片 Provider 阻塞。

## 2. 真实实现边界

### Project File Port（项目文件端口）

- Main 不再保存第二份 `projectRoots` Map。
- Renderer 命令仍只传 `projectId/fileId`；没有新增 IPC（进程间通信）命令。
- 内部能力可以按安全相对路径读取字节、写入文本或二进制，并用 `expectedModifiedAt` 阻止旧内容覆盖外部新修改。
- 未知项目、绝对路径、`..` 和项目外 Junction（目录联接）读取/写入失败关闭。
- 预览内容复用安全字节读取；未知二进制类型只返回元数据，不整文件加载。

### Tool Contribution Port（工具贡献端口）

- Contracts 不含 Cline 类型。
- Adapter 拒绝非法、重复和 Cline 内置冲突工具名，以及空说明、非对象 Schema 和无效超时。
- 项目工具缺少 `projectId` 时失败关闭；显式工具失败保留错误分类。
- 一个中立工具已进入真实 Cline Session 配置，但测试没有发起 Provider Turn（模型回合）。

## 3. 验收结果

工作目录：`D:\CodexW\Creatx\creat1\creatx`。Runtime（运行时）：Windows、Bun `1.3.14`、Electron `42.3.3`、Cline SDK `0.0.65`。

| 命令 | 结果 | 证据边界 |
| --- | --- | --- |
| `bun run typecheck` | PASS | CreatX TypeScript 合同与实现通过 |
| `bun test` | `25 pass / 0 fail / 58 expect()` | Project Files、Contracts、Adapter 定向测试；含真实临时目录和本地真实 Cline Session 创建 |
| `bun run test:imports` | PASS | 只有 `cline-adapter` 导入 Cline |
| `bun run build` | PASS | Electron Main、Preload、Renderer 生产构建通过 |
| `bun run test:desktop` | `DESKTOP PASS` | 900×700 窗口、真实文件列表和预览仍可用 |
| `bun run test:live` | `LIVE PASS` | 真实 DeepSeek `deepseek-chat`、原生 `editor` 审批、真实 Markdown 和成功工具事件 |
| `bun run test:electron-live` | `ELECTRON LIVE PASS` | 同一 Electron 连续链的拒绝/取消无副作用、批准写入、外部刷新、退出、重启历史和新“继续”回合 |
| `Get-CimInstance Win32_Process ...` | 无匹配输出 | 没有残留指向本仓库的 Electron、Node 或 Bun 进程 |
| `Get-ChildItem $env:TEMP ...` | 无匹配输出 | 没有遗留本轮 Live 项目或数据目录 |

`bun run build` 仍输出上级 `tsconfig.json` 无法解析 `@tsconfig/bun/tsconfig.json` 的警告，但生产构建成功。该警告在本批次没有扩大，也未被隐藏为通过项。

残留检查使用：

```powershell
$repo = 'D:\CodexW\Creatx\creat1\creatx'
Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -match '^(electron|node|bun)(\.exe)?$') -and
  $_.CommandLine -and
  $_.CommandLine.Contains($repo, [System.StringComparison]::OrdinalIgnoreCase)
}

Get-ChildItem -LiteralPath $env:TEMP -Directory | Where-Object {
  $_.Name -like 'creatx-live-*' -or
  $_.Name -like 'CreatX 连续验收项目 *' -or
  $_.Name -like 'creatx-electron-live-*'
}
```

## 4. Live 测试修正记录

第一次 `bun run test:live` 中，真实 Provider、审批和文件写入均成功，但模型把期望文本 `CreatX live file tool passed.` 写成了不带句号的 `CreatX live file tool passed`，导致精确断言失败。该差异与接口行为无关，却暴露了测试把模型保留自然语言标点当成文件链路不变量。

提交 `f289dd3` 将测试内容改为无标点 ASCII Sentinel（哨兵文本）`CREATX_LIVE_FILE_TOOL_PASSED`，并把失败退出码设置移到异步清理之后。随后 Live 重跑通过，临时目录清理也通过。工具审批、真实落盘、成功事件和精确内容比较仍全部保留，没有用宽松匹配掩盖失败。

## 5. Acceptance（验收）映射

- 通过：`ACC-PFL-004`、`ACC-PFL-006`、`ACC-PFL-007`、`ACC-PFL-008`。
- 通过：`ACC-PHS-018`，边界是本地真实 Cline Session 配置。
- 未通过声明：`ACC-PHS-019`。真实 DeepSeek Live 使用的是 Cline 原生 `editor`，没有调用 CreatX 贡献工具。
- Walking Skeleton 既有验收继续通过，但本批次没有新增 UI、Workbench、Creative Skill 或 Image Runtime 能力。

## 6. 未完成与风险

- `.creatx` Schema、Workbench Command Port 和注册工作台未实现。
- 没有具体 Creative Skill 或 CreatX 创作工具，也没有真实 Provider 调用中立贡献工具的证据。
- 没有图片 Provider、认证、图片任务或候选状态合同；二进制 File Port 只解决安全落盘能力。
- `expectedModifiedAt` 依赖文件修改时间，只是乐观覆盖门禁，不是内容合并、版本历史、回收站或跨进程事务。
- 自动审批取决于受审查的工具声明和集成配置，不提供操作系统级权限隔离。
- 构建的上级 TypeScript 配置警告仍待独立诊断；本批次未发现其导致构建或 Runtime 失败。

## 7. 下一恢复入口

1. 从骨架提交 `c9a4ae4` 和共享接口提交 `f289dd3` 恢复代码。
2. 阅读 ADR-0006、`coordination/worktrees/README.md` 和目标线任务书。
3. 只启动一个门禁已满足、验收编号明确且文件独占的后续任务；不要自动创建六个 Worktree。
