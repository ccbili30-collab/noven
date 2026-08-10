---
title: Windows 依赖完整性与 AI 工具快速健康检查
doc_type: discussion
status: targeted-fix-verified
date: 2026-08-08
primary_capability: provider-harness
adjacent_capabilities:
  - image-runtime
  - growth-runtime
  - desktop-runtime
---

# 当前结论

CreatX `0.1.11` 打包后的第一轮非前端短检查发现：权威源码根的依赖树不完整，导致 Cline Adapter（适配层）测试无法启动。该结果证明当前源码验证环境损坏，不证明已经打包的 `0.1.11` Runtime（运行时）损坏；本轮没有重启 Electron、调用外部 Provider（模型服务）或修改正式 Profile。

当前权威根：`D:\CodexW\Creatx\creat1`。安装完整性检查器提交为 `0763ea6`，该提交建立在计划提交 `bcf42ab` 之后。短路径控制变量实验使用主线 `fbe96d0`，不修改权威依赖树。

# 已复现故障

直接运行：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun test '.\packages\cline-adapter\tests\attachments.test.ts'
```

测试在进入用例前稳定失败：

```text
Cannot find module '@cline/sdk' from '...\packages\cline-adapter\src\index.ts'
0 pass
1 fail
1 error
```

文件系统核验结果：

- `node_modules\@cline\sdk` 是 Junction（目录联接）。
- 当前目标为 `node_modules\.bun\@cline+sdk@0.0.65+9c2ded8b7566788e\node_modules\@cline\sdk`。
- 目标目录存在，但递归文件数为 0，`package.json` 不存在。
- `creatx/package.json` 和 `packages/cline-adapter/package.json` 均正确声明 `@cline/sdk: 0.0.65`，`bun.lock` 也保存该精确版本。
- Node 与 Bun 都无法从权威根解析 `@cline/sdk`。
- 同一 `node_modules\.bun` 中存在两份较早且包含 Manifest（清单）的 `@cline/sdk@0.0.65` 变体，但它们不是当前权威联接目标；不得复制它们来冒充安装修复。
- `vite@7.2.4` 包本体完整，但当前 `node_modules\.bin\vite.exe` 与 `vite.bunx` 都不存在。另一条健康前端 Worktree 中的 Bun Windows 命令入口为 `vite.exe` 与 `vite.bunx`，不是无扩展名的 `vite`。
- `@sap-ai-sdk/foundation-models@2.13.0` 与 `@sap-ai-sdk/orchestration@2.13.0` 的当前 Bun Store（包存储）变体均含正确 Manifest 和分发文件。

当前只证明直接故障层是“权威联接目标为空且 Vite 命令入口缺失”。为什么安装形成该状态仍未验证，可能来源包括不完整安装、Bun 隔离复制、缓存/注册源、Windows 路径或安装后脚本；在隔离复现前不得选定其中一个。

# 隔离冻结安装复现

从主线 `45832e2` 建立了本地隔离 Clone（克隆）`D:\CodexW\Creatx\dependency-install-lab`。该目录不是 Git Worktree，建立后无 `node_modules`、状态干净，Git 仍只登记两条 Worktree。

在该目录只执行一次：

```powershell
Set-Location 'D:\CodexW\Creatx\dependency-install-lab\creatx'
bun install --frozen-lockfile
```

结果为 18.65 秒、退出码 1：Bun 报告安装 1,361 个包，两个包失败。

```text
ENOENT: No such file or directory: failed to link package: @sap-ai-sdk/foundation-models@2.13.0 (copyfile)
ENOENT: No such file or directory: failed to link package: @sap-ai-sdk/orchestration@2.13.0 (copyfile)
```

失败后的只读完整性检查显示：

- `@cline/sdk@0.0.65`、`vite@7.2.4`、`vite.exe` 和 `vite.bunx` 完整；这证明权威根此前的空 SDK 与缺 Shim 是失败安装残留，不是锁文件必然产物。
- Bun 全局缓存中的 `foundation-models` 有 471 个文件和正确 Manifest，隔离 Store 只有 136 个文件且无 Manifest，缺 335 个文件。
- Bun 全局缓存中的 `orchestration` 有 547 个文件和正确 Manifest，隔离 Store 只有 84 个文件且无 Manifest，缺 463 个文件。
- 因此 Registry（包注册源）下载缓存完整，失败发生在 Bun 从缓存复制到项目 Isolated Store（隔离包存储）的阶段。

本机 `LongPathsEnabled=0`。目标路径统计为：

- `foundation-models` 最大目标路径 281 字符，32 个文件超过 259 字符，超过 259 字符的文件复制成功数为 0。
- `orchestration` 最大目标路径 264 字符，3 个文件超过 259 字符，超过 259 字符的文件复制成功数为 0。
- 两包同时有大量不超过 259 字符的后续文件缺失，符合复制在前一个失败点后终止的形态。

这些数据使 Windows 路径长度成为当前最强触发假设，但仍未构成因果证明；Bun 可能在其他复制环节以相同 `ENOENT` 失败。

# 短路径控制变量实验

用户确认后，从主线 `fbe96d0` 建立新的本地隔离 Clone `D:\CodexW\cx-install`。该目录不是 Git Worktree，建立后状态干净，Git 仍只登记权威主线与 `c466` 两条 Worktree。实验固定 Bun `1.3.14`、全局缓存、Registry、锁文件和安装命令，只缩短项目路径；未修改 `LongPathsEnabled=0`。

在 `D:\CodexW\cx-install\creatx` 只执行一次：

```powershell
bun install --frozen-lockfile
```

结果为 20.40 秒、退出码 1：Bun 报告安装 1,363 个包，仅 `@sap-ai-sdk/foundation-models@2.13.0` 以 `ENOENT ... (copyfile)` 失败。安装日志保留在隔离 Clone 的 `install-short-path.log`，不纳入权威仓库。

只读完整性与缓存对比结果：

- `orchestration` 从长路径实验的 84/547 文件、缺 Manifest，变为 547/547 文件完整且 Manifest 存在；其最长目标路径从 264 降到 245 字符，超过 259 字符的目标从 3 个降到 0 个。
- `foundation-models` 从长路径实验的 136/471 文件，变为 397/471 文件；仍缺 74 个文件和 Manifest。其最长目标路径从 281 降到 262 字符，超过 259 字符的目标从 32 个降到 3 个，这 3 个文件仍全部未复制。
- Cline SDK、Vite 包和 Vite Windows Shim 完整；`check:install` 只因 `foundation-models` 缺 Manifest 以退出码 1 失败。

该对照高度支持 Windows 传统路径上限是 Bun `1.3.14` Isolated Linker 复制失败的触发条件：同一包在目标路径全部降到 259 字符以内后恢复完整，仍有 3 个超限目标的包继续失败。当前证据仍不等于修复完成，也没有证明 Bun 在 `LongPathsEnabled=1` 或其他 Linker 布局下一定正确；短路径 Clone 本身仍无法完成冻结安装。

# 修复与全新安装验收

提交 `2cf78df` 将仓库默认安装布局固定为 Bun Hoisted Linker（提升式链接器），不升级 Bun、不修改 `bun.lock`、Registry 或系统 `LongPathsEnabled`。同时：

- `install-windows.ps1` 改为单次 `bun install --frozen-lockfile`，删除从缓存复制 `foundation-models` 后重跑的历史旁路；
- Cline 补丁脚本在 Hoisted 布局没有 `.bun` 目录时继续验证并修补顶层 `@cline/llms@0.0.65`；
- 安装完整性检查同时接受完整 Hoisted 顶层包和 Isolated Store 变体，仍拒绝缺包、空目录、坏 Manifest、版本错误、缺入口和缺传递依赖；
- 安装回归从 11 项增至 13 项，新增 Hoisted SAP 包和 Hoisted Cline Postinstall 行为。

从修复提交建立全新长路径 Clone `D:\CodexW\Creatx\dependency-install-verify`，只执行一次不带临时 `--linker` 参数的：

```powershell
bun install --frozen-lockfile
```

结果为退出码 0、34.06 秒、695 个 Hoisted 包，证明仓库 `bunfig.toml` 自身生效。随后验证：

- 安装完整性 5/5 PASS：Cline SDK、两个 SAP AI SDK、Vite 和 Windows Shim 全部完整；
- 安装回归 13/13 PASS；
- Import Boundary 2/2 PASS；
- Typecheck 退出码 0，13.18 秒；
- Adapter 中文相对路径 `read_files` 定向用例 1/1 PASS，4 次断言，5.47 秒，不再停在 SDK 导入阶段。

整份 `attachments.test.ts` 有 38 项，30 秒外部预算内未完成且没有断言失败；因此本批只声明上述单项恢复。没有运行 Adapter 全文件、全量测试、Production Build、Electron、前端、外部 Provider 或正式五项 Live。权威根既有损坏 `node_modules` 继续作为故障证据保留，未删除或重装；修复证明的是新安装合同已经恢复。

# 上游证据

- Bun 官方 Issue `oven-sh/bun#26543` 仍为 Open（开放）：Windows Workspace + Isolated Linker（隔离链接器）出现 `failed to link package ... (copyfile)`，清缓存无效。
- Bun 官方 Issue `oven-sh/bun#28133` 在 `1.3.10` 复现同类 Windows `ENOENT copyfile`，仅作为 `#26543` 的重复项关闭，不是已修复证据。
- 2026-08-08 官方最新稳定 Release（发布版）仍为 `1.3.14`，CreatX 已经固定该版本；当前不存在可直接升级验证的更高稳定版。

当前可以确认的根因层级是“Bun `1.3.14` Windows Isolated Linker 从完整缓存向项目 Store 复制深路径 SAP 包时触发传统 Windows 路径上限”。Hoisted Linker 对照已在相同系统设置和长路径 Clone 中完成冻结安装。

# 失败关闭检查

`bun run check:install` 现在只读验证：

- `@cline/sdk@0.0.65` 及其隔离依赖 `@cline/core`、`@cline/llms`；
- 两个 SAP AI SDK `2.13.0` 包的 Hoisted 顶层包或全部 Bun Store 变体；
- `vite@7.2.4` 包本体；
- `node_modules\.bin\vite.exe` Windows Shim（命令入口）。

检查器区分：

- `install_integrity_missing`
- `install_integrity_empty`
- `install_integrity_manifest`
- `install_integrity_version`
- `install_integrity_dependency`

其安装回归 13/13 通过，覆盖缺包、空目录、缺失/损坏 Manifest、版本错误、缺入口文件、Junction 真实目标、Bun 隔离传递依赖、多 Store 变体、Hoisted SAP 包和没有 `.bun` 目录的 Cline Postinstall。权威根既有损坏依赖树未重装，因此在该目录运行检查仍按预期失败：

```text
FAIL @cline/sdk@0.0.65: install_integrity_empty
FAIL vite Windows shim: install_integrity_missing
PASS foundation-models
PASS orchestration
PASS vite@7.2.4
```

检查器不复制、删除或修复任何文件。

# 故障发现阶段的短检查边界

依赖故障发现前后已执行：

- Import Boundary（导入边界）：2 项 PASS。
- Image Queue（图片队列）：34/34 PASS，覆盖项目通道、公平轮转、取消、未知结果、幂等和关机中断。
- Growth Scheduler/Lifecycle：44/44 PASS，覆盖暂停、恢复、有限重试、终态和迟到回执。
- Install Integrity（安装完整性）：11/11 PASS；当前根 Preflight（前置检查）按设计 FAIL。
- Adapter 工具测试：0 个用例执行，被空 `@cline/sdk` 阻断。

这些都是定向自动测试。没有运行 Typecheck（类型检查）、全量测试、Production Build（生产构建）、打包、Electron、外部 Provider 或正式五项 Live（真实运行）。

# 冻结决定与恢复入口

- 不重装、删除或手工修补权威根的 `node_modules`，保留当前故障证据。
- 不从 `c466`、历史 `.bun` 变体或正式发布目录复制依赖。
- 隔离 Clone 已建立且不是第三条 Git Worktree；失败依赖树作为复现证据保留，不重跑、不修补。
- 短路径控制变量实验已完成且仍失败；`D:\CodexW\cx-install` 与其失败依赖树作为证据保留，不重跑、不修补。
- 修复选择 Hoisted Linker，不升级 Bun、不切换 Registry、不改变 Lockfile，也不保留缓存复制恢复策略。
- 当前修复提交为 `2cf78df`，全新安装证据位于 `D:\CodexW\Creatx\dependency-install-verify`；后续从 `PHS-023 / ACC-PHS-032` 恢复。
