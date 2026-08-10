# Windows Dependency Baseline And AI Tool Health Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** 恢复 CreatX 在全新 Windows 环境中的可复现依赖与源码验证基线，并建立一套一分钟级、非前端、无外部 Provider（模型服务）副作用的 AI 工具快速体检。

**Architecture:** 先把“依赖树完整”做成独立失败关闭的 Preflight（前置检查），再在非 Git Worktree（工作树）的隔离兄弟目录中只复现一次冻结安装，依据证据选择 Bun、缓存、注册源或 Windows 路径问题的最小修复。依赖恢复后只编排已有 Adapter、Image Runtime（图片运行时）和 Growth Runtime（生长运行时）测试，不建立第二套工具 Harness（智能体运行框架）或测试状态机；真实 Provider 冒烟作为用户单独授权的最终门禁。

**Tech Stack:** Windows 11、PowerShell、Bun `1.3.14`（当前基线）、TypeScript、Node Test Runner、Cline SDK `0.0.65`、现有 CreatX 测试与 Git。

---

## 任务路由与证据起点

- Primary Capability（主要能力线）：`provider-harness`。
- Adjacent Capabilities（相邻能力线）：`image-runtime`、`growth-runtime`、`desktop-runtime`。
- 当前已复现故障：`node_modules/@cline/sdk` 指向一个存在但为空的 Bun 隔离包目录，Node 与 Bun 均返回 `MODULE_NOT_FOUND`。
- 当前仍为绿色的短证据：Import Boundary（导入边界）2 项、Image Queue（图片队列）34/34、Growth Scheduler/Lifecycle 44/44。
- 当前未重新验证：Adapter 工具受众、工具回执、Session PID 接管、Typecheck（类型检查）、Production Build（生产构建）、全量测试、真实 Provider、Electron。

## 范围

### 允许修改

- `creatx/scripts/install-integrity.ts`
- `creatx/scripts/install-integrity.test.ts`
- `creatx/scripts/check-install-integrity.ts`
- `creatx/scripts/install-windows.ps1`，但仅在根因要求时修改
- `creatx/package.json`
- `bun.lock`，但仅在已确认需要变更 Bun/依赖来源且用户接受影响后修改
- 现有非前端 Adapter、Image Runtime、Growth Runtime 测试
- `docs/capabilities/provider-harness/**`
- 本计划、诊断记录、最终 Baseline（基线）与 `CONTEXT.md`

### 明确不做

- 不修改 `creatx/apps/desktop/renderer/**`、Preview、截图或 `c466` 前端工作树。
- 不修改公开 CreatX 协议、数据库 Schema（数据合同）、产品语义或权限边界。
- 不修改 Cline Core，不引入第二个 Harness，不添加永久手工复制兼容垫片。
- 不覆盖、删除或重新运行 `D:\CodexW\Creatx\skill-sequence-live`。
- 不运行完整五项 Live，不把 Fixture（测试夹具）称为 Live（真实运行）。
- 不在未恢复冻结安装前运行全量测试或重新打包。

## 执行原则与停止条件

1. 全部任务串行执行。依赖复现、脚本修改和测试存在前后依赖，不使用多个 Agent 并行。
2. 每次实质修改前重新检查 `topic-genre-style`、HEAD、工作树和 `c466` 文件所有权。
3. 不在权威根删除或重装现有 `node_modules`；现有空目录是故障证据。
4. 隔离安装最多执行一次初始复现和一次修复后验收。失败后先诊断，不盲目重跑。
5. 若根因要求升级 Bun、改变 Registry（包注册源）、改变 Lockfile 或引入缓存恢复策略，先停止并向用户提交影响分析。
6. 若发现公开协议、权限、数据库或产品行为必须变化，停止本计划。
7. 测试期望总时长：快速体检小于 60 秒；最终全量验证只在代码冻结后运行一次。

## 批次一：把依赖损坏变成稳定、快速的失败信号

### Task 1：为安装完整性写失败测试

**Files:**

- Create: `creatx/scripts/install-integrity.ts`
- Create: `creatx/scripts/install-integrity.test.ts`
- Create: `creatx/scripts/check-install-integrity.ts`
- Modify: `creatx/package.json`

**Step 1：写失败测试**

为一个同步或异步 `inspectInstalledPackage(root, expected)` 函数建立最小临时目录 Fixture，覆盖：

- 目录完全缺失；
- 目录存在但为空；
- `package.json` 缺失；
- 实际版本与期望版本不一致；
- 包完整时返回解析后的真实路径；
- `@cline/sdk@0.0.65` 存在但其依赖 `@cline/core@0.0.65` 无法解析。

测试必须使用真实文件系统目录和最小 `package.json`，不复制包解析逻辑到断言中，不使用 `globalThis` Mock（模拟）。

**Step 2：运行测试并确认失败**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun test '.\scripts\install-integrity.test.ts'
```

Expected: FAIL，原因是 `install-integrity.ts` 尚不存在。

**Step 3：实现最小检查器**

检查器只负责读取和验证，不修复依赖：

```ts
export interface InstalledPackageExpectation {
  name: string
  version: string
  requiredFiles?: readonly string[]
}

export async function inspectInstalledPackage(root: string, expectation: InstalledPackageExpectation) {
  // 解析 root/node_modules/<name> 的真实路径。
  // 要求 package.json 和 requiredFiles 存在。
  // 要求 manifest.name/version 精确匹配。
  // 返回稳定分类错误，不复制或修改任何文件。
}
```

错误至少区分：

- `install_integrity_missing`
- `install_integrity_empty`
- `install_integrity_manifest`
- `install_integrity_version`
- `install_integrity_dependency`

CLI 检查当前关键包：

- `@cline/sdk@0.0.65`
- `@cline/core@0.0.65`
- `@cline/llms@0.0.65`
- `@sap-ai-sdk/foundation-models@2.13.0`
- `@sap-ai-sdk/orchestration@2.13.0`
- `vite@7.2.4` 及 `node_modules/.bin/vite.exe` Windows Shim（命令入口）；Bun `1.3.14` 的健康 Windows 安装还会生成 `vite.bunx`

CLI 必须只输出安全路径、包名、版本和分类错误，不输出密钥、Registry Token 或环境变量。

**Step 4：增加脚本入口**

在 `creatx/package.json` 增加：

```json
"check:install": "bun run scripts/check-install-integrity.ts",
"test:install-integrity": "bun test scripts/install-integrity.test.ts"
```

**Step 5：验证单元测试通过，当前根检查稳定失败**

```powershell
bun run test:install-integrity
bun run check:install
```

Expected:

- 单元测试 PASS。
- 当前根 `check:install` FAIL，明确指出 `@cline/sdk@0.0.65` 为空，而不是笼统 `MODULE_NOT_FOUND`。

**Step 6：提交本任务**

```powershell
git add -- 'creatx/scripts/install-integrity.ts' 'creatx/scripts/install-integrity.test.ts' 'creatx/scripts/check-install-integrity.ts' 'creatx/package.json'
git diff --cached --check
git commit -m 'test(harness): detect incomplete Windows installs'
```

完成条件：安装损坏可在数秒内稳定检测，检查器不修改文件。

### Task 2：记录当前故障证据与恢复入口

**Files:**

- Create: `docs/discussions/2026-08-08-windows-dependency-and-tool-health.md`
- Modify: `CONTEXT.md`

**Step 1：记录已验证事实**

写入：当前分支/提交、Bun 版本、空目录真实路径、直接 Junction 目标、Node/Bun 解析结果、被阻断的 Adapter 测试，以及仍通过的 2 + 34 + 44 项短检查。

**Step 2：明确证据边界**

记录以下内容：

- 上游成因尚未验证；
- 当前不能重新宣称 Adapter、Typecheck 或 Build 通过；
- 打包程序仍运行不等于源码依赖健康；
- 不允许从 `c466` 或历史包目录复制文件并将其称为修复。

**Step 3：检查文档**

```powershell
git diff --check -- 'CONTEXT.md' 'docs/discussions/2026-08-08-windows-dependency-and-tool-health.md'
```

Expected: Exit code 0。

**Step 4：提交**

```powershell
git add -- 'CONTEXT.md' 'docs/discussions/2026-08-08-windows-dependency-and-tool-health.md'
git diff --cached --check
git commit -m 'docs: record Windows install integrity failure'
```

## 批次二：在隔离目录中复现冻结安装

### Task 3：建立不影响 Worktree 的安装实验目录

**Files:**

- No tracked file changes.
- Local experiment: `D:\CodexW\Creatx\dependency-install-lab`

**Step 1：确认路径与主线状态**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1'
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
Test-Path -LiteralPath 'D:\CodexW\Creatx\dependency-install-lab'
```

Expected: 主线干净、两条 Worktree、实验路径不存在。若已存在，停止并确认归属，不覆盖或删除。

**Step 2：从当前已提交主线建立本地隔离 Clone（克隆）**

```powershell
git clone --no-hardlinks --branch topic-genre-style --single-branch 'D:\CodexW\Creatx\creat1' 'D:\CodexW\Creatx\dependency-install-lab'
git -C 'D:\CodexW\Creatx\dependency-install-lab' rev-parse HEAD
```

Expected: HEAD 与权威主线一致；该目录不是 `git worktree list` 中的第三条 Worktree。

**Step 3：记录环境，不改系统设置**

```powershell
bun --version
node --version
git --version
Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled
```

只记录结果。不修改注册表、不缩短用户目录、不清空全局 Bun 缓存。

### Task 4：只运行一次冻结安装复现

**Files:**

- No tracked file changes until the failure is classified.

**Step 1：运行原始合同**

```powershell
Set-Location 'D:\CodexW\Creatx\dependency-install-lab\creatx'
$timer = [System.Diagnostics.Stopwatch]::StartNew()
bun install --frozen-lockfile
$exitCode = $LASTEXITCODE
$timer.Stop()
[pscustomobject]@{ ExitCode = $exitCode; ElapsedMilliseconds = $timer.ElapsedMilliseconds }
```

Expected: 当前已知状态下可能 FAIL。不要立即重跑。

**Step 2：运行安装完整性检查**

```powershell
bun run check:install
```

**Step 3：按首个真实失败分类**

- A：下载或完整性校验失败；
- B：缓存包完整，但 `.bun` 目标目录为空；
- C：SAP AI SDK 复制联接出现 `ENOENT`；
- D：Windows 路径长度、权限或占用错误；
- E：Postinstall（安装后脚本）先于完整依赖触发；
- F：与以上均不相符，记录为未知并停止。

**Step 4：验证上游证据**

仅针对实际分类读取 Bun 官方文档、对应版本 Release Notes（发布说明）、官方 Issue 或上游源码。不得只凭旧会话或另一个 Agent 的结论决定升级或添加绕路。

**停止门禁：** 在向用户报告根因、可选方案、锁文件影响和回滚方式之前，不修改 `package.json`、`bun.lock` 或 `install-windows.ps1`。

## 批次三：选择并实现最小依赖修复

### Task 5：根因决策门禁

**Files:**

- Modify only after user confirmation: one or more of `creatx/package.json`, `bun.lock`, `creatx/scripts/install-windows.ps1`.

根据 Task 4 的证据，只允许选择一条路线：

1. Bun 已修复同类安装问题：评估并明确升级 Bun 的版本、Lockfile 差异、Cline 补丁兼容性和回滚命令；用户确认后升级。
2. 注册源或缓存内容不完整：修正权威源或校验流程，不从历史 `node_modules` 复制包。
3. Windows 路径布局导致复制失败：在项目安装脚本中采用可复现的短缓存/临时路径，并验证接收端内容；不修改全局系统设置。
4. `install-windows.ps1` 的已知恢复逻辑不完整：只有在上游包完整且复制行为有可验证合同的情况下扩展；必须同时覆盖 `foundation-models` 与 `orchestration`，并在恢复后执行 `check:install`。

禁止把“从正式根复制现成包”作为生产修复。若只能这样通过，Task 5 失败并停止。

### Task 6：先写对应根因的失败测试，再做最小修改

**Files:**

- Modify: `creatx/scripts/install-integrity.test.ts`
- Modify conditionally: `creatx/scripts/install-windows.ps1`
- Modify conditionally: `creatx/package.json`
- Modify conditionally: `bun.lock`

**Step 1：把 Task 4 的最小失败形态转成自动测试。**

Expected: 修复前 FAIL，且失败原因与隔离安装一致。

**Step 2：实现用户已确认路线的最小修复。**

不得同时升级 Bun、切换 Registry 和改恢复脚本；一次只改变一个根因变量。

**Step 3：运行定向测试。**

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun run test:install-integrity
bun run test:imports
```

Expected: PASS。

**Step 4：提交。**

提交消息根据实际根因选择，例如：

```powershell
git add -- 'creatx/scripts/install-integrity.test.ts' 'creatx/scripts/install-windows.ps1' 'creatx/package.json' 'bun.lock'
git diff --cached --check
git commit -m 'fix(harness): restore reproducible Windows installs'
```

只暂存实际修改的文件；不得照抄全部列表。

### Task 7：从空依赖目录执行一次修复后验收

**Files:**

- Local experiment only: a newly created `D:\CodexW\Creatx\dependency-install-verify`.

不要复用失败实验目录。先确认新路径不存在，再从修复提交建立本地 Clone；运行一次：

```powershell
bun install --frozen-lockfile
bun run check:install
bun run test:install-integrity
bun run test:imports
```

Expected:

- 冻结安装退出码 0；
- 关键包、传递依赖与 Windows Shim 全部完整；
- 没有从权威根或 `c466` 复制依赖；
- 安装后 Cline 补丁脚本只修改锁定版本 `0.0.65` 的目标文件。

任一项失败即停止，不进入 AI 工具体检。

## 批次四：建立一分钟级 AI 工具快速体检

### Task 8：先使用现有真实测试形成稳定测试集合

**Files:**

- Modify: `creatx/package.json`
- Modify only when coverage is absent: existing tests under `creatx/packages/cline-adapter/tests/`

在 `package.json` 增加一个串行 `test:tool-health`，只编排现有测试入口，覆盖：

- `worker-tool-policy.test.ts`：普通会话看不到 Growth/Skill 内部工具，Worker deny-by-default（默认拒绝）。
- `projection.test.ts`：审批、自由模式、工具生命周期、项目身份、失败回执、Skill Sequence 不伪推进。
- `attachments.test.ts`：中文路径、越界失败、取消、旧图片证据拒绝、图片失败停止后续 Skill。
- `session-process-claim.node-test.ts`：死亡 PID 接管与存活 PID 失败关闭。
- `provider-quota-cooldown.test.ts`：Provider 连接冷却隔离和过期清理。
- `windows-shell.test.ts`：中文 stdout/stderr UTF-8。
- `image-runtime/tests/queue.node-test.ts`：图片并发、未知结果、取消、关机和幂等。
- `growth-runtime/tests/scheduler.node-test.ts` 与 `lifecycle.node-test.ts`：暂停、恢复、有限重试、终态和迟到回执。

先运行这些文件的现有测试。只有确实缺少验收行为时才新增测试，不复制生产逻辑。

**Step 1：运行并计时。**

```powershell
$timer = [System.Diagnostics.Stopwatch]::StartNew()
bun run test:tool-health
$exitCode = $LASTEXITCODE
$timer.Stop()
[pscustomobject]@{ ExitCode = $exitCode; ElapsedMilliseconds = $timer.ElapsedMilliseconds }
```

Expected: PASS，目标小于 60 秒。若超过 60 秒，先找出最慢文件；不通过减少失败路径覆盖来凑预算。

**Step 2：重复一次验证稳定性。**

只允许连续执行两次。两次均 PASS，测试数量一致，无残留 Node、Electron 或工具子进程。

**Step 3：提交测试入口。**

```powershell
git add -- 'creatx/package.json'
git diff --cached --check
git commit -m 'test(harness): add fast AI tool health gate'
```

若新增了缺失用例，只精确添加对应测试文件。

### Task 9：记录性能观察，不预先优化

**Files:**

- Modify: `docs/discussions/2026-08-08-windows-dependency-and-tool-health.md`

记录快速体检总时间和最慢测试文件，并从现有测试数据观察：

- 300 个历史 Worker 时 `findCompletedGrowthStage` 的读取耗时；
- 22 个图片任务时一次状态查询批次耗时；
- 测试结束后的进程数量与临时目录清理结果。

第一批只测量，不修改 `findCompletedGrowthStage` 或图片轮询。只有可复现超过接受预算时，才另开性能修复任务并先写回归基准。

## 批次五：代码冻结后的统一验收

### Task 10：定向、类型、全量和构建验收

**Files:**

- No production changes during verification.

按顺序执行；任何一步失败都先诊断，不继续堆叠失败：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun run check:install
bun run test:tool-health
bun run typecheck
bun run test:imports
bun test
bun run build
```

Expected:

- 安装完整性 PASS；
- 快速体检 PASS 且小于 60 秒目标；
- Typecheck 必须使用 `bun run typecheck`；
- Import Boundary PASS；
- 全量测试只在冻结状态运行一次；
- Production Build PASS；
- 无外部 Provider、无正式 Profile 修改、无 Electron、无前端测试。

### Task 11：更新权威状态并提交可提交批次

**Files:**

- Modify: `docs/capabilities/provider-harness/README.md`
- Modify: `docs/capabilities/provider-harness/acceptance.md`
- Create: `docs/baseline/creatx-windows-dependency-and-tool-health-2026-08-08.md`
- Modify: `CONTEXT.md`
- Modify: `BASELINE.md`

记录：

- 根因与实际修复路线；
- 冻结安装的全新目录证据；
- 快速体检、Typecheck、Import Boundary、全量和 Build 的准确数量与耗时；
- 没有真实 Provider、Electron 或前端验收；
- 两个隔离 Clone 的保留/清理状态和恢复入口；
- 分支与提交哈希。

```powershell
git diff --check
git status --short
```

只精确暂存本批文档，提交：

```powershell
git commit -m 'docs: verify Windows tool health baseline'
```

## 可选批次：低成本真实 Provider 冒烟

### Task 12：用户单独授权后执行一次 Adapter 级 Live

本任务不是前述批次的完成门禁。只有用户明确同意外部调用和成本后执行。

**目标场景：** 在新建的一次性项目与新会话中，让真实 Cline Provider 完成以下最小链：

1. 读取一个 UTF-8 中文文件；
2. 通过获批文件工具新增一个文件；
3. 调用一个无付费图片请求的 CreatX 项目工具；
4. 验证工具成功与 Assistant 回复配对；
5. 另起一轮取消等待，确认进入 `cancelled` 且无迟到文件写入；
6. 重启 Adapter 后读取历史并发送新的“继续”，不重放旧工具。

限制：

- 不启动完整 Electron，不经过 Renderer。
- 不调用图片 Provider，不运行 Growth，不碰正式 Profile 和正式 Live 项目。
- 限制模型轮数和最大工具调用数，目标总时长 3 分钟以内。
- 失败即保留项目与日志并停止，不自动重试 Provider。

通过后建立独立 Live 证据；未授权或无配置时必须 Fail Closed（失败关闭），不得用本地模板冒充 Agent。

## 最终完成定义

只有同时满足以下条件，基础修复批次才可称为完成：

1. 全新隔离目录的 `bun install --frozen-lockfile` 真实通过，不依赖主线或 `c466` 的现成 `node_modules`。
2. `check:install` 能识别空包、错误版本、缺失传递依赖和 Windows Shim。
3. `test:tool-health` 在目标时间内连续两次通过，且无残留进程。
4. Typecheck、Import Boundary、全量测试和 Production Build 在代码冻结后通过。
5. 文档明确没有重新验证前端、Electron、外部 Provider 和正式五项 Live。

若只修好当前 `node_modules`，但全新冻结安装仍失败，则任务未完成；若只通过自动测试，没有真实 Provider 授权，则只能声明本地工具基线恢复，不能声明 AI Live 已重新验收。
