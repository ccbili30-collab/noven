# Portable Noven Project Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 实现可确定性导出、校验并导入到新目录的诺文项目包（`.np`），恢复真实文件、净化工作台、用户标记的只读案例和项目首页，同时保持 Cline/Profile/权限隔离。

**Architecture:** 新建单一 `@creatx/project-package-runtime`，拥有 V1 Schema、规范摘要、ZIP 流式读写、暂存提交、Project Catalog 和受控项目元数据；现有 `project-files / workbench / cline-adapter` 分别提供文件枚举、净化工作台和净化案例投影。Electron Main 协调系统对话框、进度与取消，Renderer 只显示稳定投影。不要复用或修改 Live Archive Manifest，不建立第二会话库、后台服务或自动 Provider 路径。

**Tech Stack:** TypeScript、Bun 1.3、Electron 42、React 19、Cline SDK `0.0.65`、`fflate` 流式 ZIP、SHA-256、Windows 原生临时目录与原子 Rename（改名）。

---

## 批次边界

### 当前目标

- 完成 `IEX-101..112 / SES-506..508 / PFL-009..010 / WUI-052..054` 的最小真实纵向闭环。
- 导入/导出全过程零自动 Provider；AI 起草按钮可以延期，不阻塞手填闭环。

### 明确不做

- 签名、联网发布者验证、拖入导入、自定义排除、升级/覆盖/合并、差异包、后台导入、会话续写、Profile/数据库复制。
- 不改变 Cline SDK、Live Archive、Growth、图片任务和权限状态机。

### 停止条件

- Cline 无法提供不读取私有数据库的稳定案例投影。
- Windows 目录提交不能证明“提交前无项目登记、提交后字节完整”。
- ZIP 依赖不能流式处理或无法在解压前取得条目边界。
- 需要改变已接受的双身份、只读案例或新目录语义。

## Task 1：建立 V1 Schema 与确定性身份

**Files:**
- Create: `creatx/packages/project-package-runtime/package.json`
- Create: `creatx/packages/project-package-runtime/src/schema.ts`
- Create: `creatx/packages/project-package-runtime/src/index.ts`
- Create: `creatx/packages/project-package-runtime/tests/schema.test.ts`
- Modify: `creatx/tsconfig.json`
- Modify: `creatx/package.json`
- Modify: `creatx/bun.lock`

1. 写失败测试：合法 Manifest、未知版本、额外字段、重复规范路径、绝对路径、反斜杠、`..`、大小溢出和错误 SHA-256。
2. 写失败测试证明导出时间、ZIP 时间戳和压缩级别不改变 `packageId`，项目简介、文件、案例或工作台任一字节变化都会改变它。
3. 添加直接依赖 `fflate`；用其流式 API 做一个 32 MB 重复数据探针，确认测试路径不把全部解压内容一次保存在内存。若失败，停止并重新选择 ZIP 库，不写兼容垫片。
4. 实现严格 V1 类型与解析器。规范描述按路径排序，使用 UTF-8 JSON；`packageId = sha256(canonical identity descriptor)`，descriptor 不含 `packageId / exportedAt / exporterVersion`。
5. 运行：

```powershell
cd D:\CodexW\Creatx\creat1\creatx
bun test packages/project-package-runtime/tests/schema.test.ts
bun run typecheck
```

6. 提交：`feat(import-export): define np package schema`。

## Task 2：文件枚举与受控项目元数据

**Files:**
- Modify: `creatx/packages/project-files/src/index.ts`
- Modify: `creatx/packages/project-files/tests/project-files.test.ts`
- Create: `creatx/packages/project-package-runtime/src/project-metadata.ts`
- Create: `creatx/packages/project-package-runtime/tests/project-metadata.test.ts`

1. 写失败测试覆盖普通隐藏文件、中文/空格、空目录、图片、二进制文件、`.git / .creatx / node_modules`、系统缓存、诺文临时文件、项目内外 Junction 和并发修改。
2. 在 Project Files 增加一个权威 `portableEntries(projectId)` Query；返回规范相对路径、种类、字节数、修改时间与排除摘要，不返回绝对根，不复制现有过滤规则。
3. 新增受控项目元数据，保存 `projectId / forkedFromProjectId? / overview`；只通过 Project Files Internal Port 写入 `.creatx`，Renderer 和 Agent 不能直接编辑。
4. 内容在枚举后变化时导出以 `package_file_conflict` 失败，不混合新旧快照。
5. 运行项目文件与元数据定向测试和 Typecheck。
6. 提交：`feat(project-files): expose portable project entries`。

## Task 3：项目登记 Store

**Files:**
- Create: `creatx/packages/project-package-runtime/src/project-catalog.ts`
- Create: `creatx/packages/project-package-runtime/tests/project-catalog.test.ts`
- Modify: `creatx/packages/contracts/src/index.ts`

1. 写失败测试覆盖登记、相同双身份幂等、同血统不同内容冲突、独立副本、缺失路径、损坏 Store、并发登记和从列表移除不删目录。
2. 实现单写入者 JSON Store，位置为 `userData/creatx/projects.v1.json`；使用串行队列和临时文件原子替换。
3. Store 只保存本机路径、本地 `projectId / forkedFromProjectId?`、来源 `importedProjectId / importedPackageId`、来源类型、显示名和最近状态，不保存文件、简介正文或案例正文。
4. 暂不接 UI；用真实 Windows 临时目录重启 Store 并验证缺失状态。
5. 提交：`feat(import-export): persist portable project catalog`。

## Task 4：案例标记与净化投影

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Create: `creatx/packages/cline-adapter/src/project-case-export.ts`
- Create: `creatx/packages/cline-adapter/tests/project-case-export.test.ts`

1. 先用真实 Cline Session Store 写失败测试：项目会话标记/取消/重启/删除；个人会话与 Growth Worker 拒绝标记。
2. 写净化测试：用户消息、最终 Assistant 回复、允许的文件读取/修改摘要保留；Reasoning、System Prompt、工具参数、Shell 命令全文、完整结果、Run、权限、外部绝对路径和私人复制前缀消失。
3. 在 Adapter 内维护唯一工具摘要白名单。未知工具只允许输出“使用了未导出的工具”及成功/失败，不透传内容。
4. 输出严格 `PortableConversationV1`，文件引用只允许指向 Task 2 的已导出路径集合；`continuationBrief` 必须是用户确认的普通文字。
5. 不读取或写入 Cline SQLite 的私有表结构之外的第二数据库，不把导入案例写回 Cline。
6. 提交：`feat(session): export sanitized project cases`。

## Task 5：净化工作台交换

**Files:**
- Modify: `creatx/packages/workbench/src/index.ts`
- Modify: `creatx/packages/workbench/tests/workbench.test.ts`
- Create: `creatx/packages/project-package-runtime/tests/workbench-portable.test.ts`

1. 写失败测试覆盖 V1/V2/V3 注册工作台、主页、可见范围、排序、越界文件、损坏 JSON 和引用未导出文件。
2. 增加 `exportPortableWorkbenches` 与 `importPortableWorkbenches`，只使用现有权威解析/写入规则，不复制工作台 Schema 校验。
3. 语义损坏记录返回 Diagnostic（诊断）并忽略；不能阻止文件项目导入，也不能覆盖现有目标记录。
4. 内置“项目首页”和“文件”不写入 `workbenches/`；它们由系统生成。
5. 提交：`feat(workbench): exchange portable layouts`。

## Task 6：流式导出与原子 `.np`

**Files:**
- Create: `creatx/packages/project-package-runtime/src/export-package.ts`
- Create: `creatx/packages/project-package-runtime/tests/export-package.test.ts`

1. 写失败测试：完整文件、空目录、简介、案例、工作台、固定排除、导出取消、目标已存在、磁盘写失败、文件中途变化、重复导出。
2. 输入只接受 Task 2/4/5 的稳定投影；Runtime 不读取 Cline 数据库或工作台原始 `.creatx`。
3. 流式写入同目录隐藏临时文件，逐项计算 SHA-256 和字节数；最后写 Checksums 与 Manifest，重新读取中央目录和摘要自检，再用 create-only 硬链接形成 `.np`；不支持硬链接的位置失败关闭。
4. 目标 `.np` 已存在且同 `packageId` 返回幂等成功；不同内容返回明确冲突，不覆盖。
5. V1 使用普通 ZIP，最多 60,000 个项目条目和 2 GB 未压缩内容；超限失败关闭，不增加 ZIP64 依赖。
6. 提交：`feat(import-export): export deterministic np package`。

## Task 7：安全导入、暂存与独立副本

状态：2026-08-10 Task 1–8 已实现并定向验收；Renderer UI、项目首页与纵向 Live 仍由 Task 9–11 完成。

**Files:**
- Create: `creatx/packages/project-package-runtime/src/import-package.ts`
- Create: `creatx/packages/project-package-runtime/tests/import-package.test.ts`

1. 构造真实恶意 ZIP 测试：伪扩展、加密条目、重复规范路径、绝对路径、`..`、反斜杠碰撞、链接属性、条目数/大小/压缩比超限、Checksum 错误和截断中央目录。
2. 解压前完成 Manifest 与条目预算预检；所有限制常量集中在 Schema 模块并投影为用户可理解的失败，不散落 UI。
3. 解压到用户目标旁唯一暂存目录，写每项时再次限制累计字节并校验摘要；禁止跟随链接。
4. 校验完成后原子提交目录，再写受控元数据、导入案例与工作台，最后登记 Project Catalog。若元数据阶段失败，记录“目录已提交但项目登记未完成”的可恢复结果，不能删除用户已提交文件或伪称完全成功。
5. 同双身份定位已有项目；同血统异内容要求显式 `fork` 命令，生成新身份和 `forkedFromProjectId`。
6. 取消只删除本批暂存；应用启动时只清理具有本 Runtime 标记且超过恢复窗口的孤立暂存，不扫描或删除普通隐藏目录。
7. 提交：`feat(import-export): import np package safely`。

## Task 8：Desktop 合同与进度取消

> 2026-08-10 发布冻结：实现与测试源码保留，但不接入 Windows `0.1.20` 的生产 Main、Preload、Desktop API 或应用依赖图。Task 9–11 与生产重新接线统一进入 `0.1.21`；恢复时不得只重新暴露隐藏接口。

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/tests/preload-path.test.ts`
- Create: `creatx/apps/desktop/tests/project-package-api.test.ts`

1. 定义稳定命令：读取项目交换投影、设置简介/案例、选择导出目标、开始导出、选择导入包/目标、开始导入、解决副本冲突、取消；定义有界进度事件和分类错误码。
2. Main 每窗口最多一个活动项目包 Job（任务）；重复开始返回冲突，不排队、不后台继续。窗口关闭或退出触发取消并等待有界清理。
3. 导入成功后用 Project Files 打开真实目录，读取工作台/首页投影，再通知 Renderer；成功前不改变当前项目。
4. 使用本地受控 Provider 计数器证明全部普通导入/导出命令 Provider 调用为零。
5. 提交：`feat(desktop): expose project package workflow`。

## Task 9：导入导出窗口与案例开关

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/ProjectNavigation.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Create: `creatx/apps/desktop/renderer/src/ProjectPackageDialog.tsx`
- Create: `creatx/apps/desktop/renderer/tests/project-package-dialog.test.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

1. 先写 Renderer 测试：有/无项目的双入口、手填简介、范围统计、排除说明、案例同源开关、来源未验证、进度、取消、冲突副本和失败保留。
2. 项目标题旁只新增一个“导入/导出项目”按钮；不增加第二套拖放入口。
3. 导出选择器默认可写 `D:\`，不存在时回退系统“文档”；用户仍可改选位置。
4. 会话行增加键盘可达案例开关和标签；导出窗口复用同一命令状态。
5. 导入成功后关闭 Dialog、选中新项目并打开首页；失败保留表单和当前项目。
6. AI 起草按钮本批可以保持未实现而不显示；不得放置无行为按钮。
7. 提交：`feat(workspace-ui): add project package dialog`。

## Task 10：项目首页与继续创作

**Files:**
- Modify: `creatx/packages/workbench/src/index.ts`
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/ProjectNavigation.tsx`
- Create: `creatx/apps/desktop/renderer/src/ProjectHomePage.tsx`
- Create: `creatx/apps/desktop/renderer/tests/project-home-page.test.tsx`

1. 系统投影顺序改为“项目首页 / 文件 / registered workbenches”，只修改排序规则，文件兜底继续不可移除。
2. 首页读取受控简介、Project Catalog 来源、本地标记案例或导入只读案例、真实文件/工作台计数；无简介时只显示编辑引导。
3. 案例文件引用复用现有 `openWorkbenchFile`，不增加通用路径读取。
4. 继续 Dialog 必须展示并允许修改 `continuationBrief`；确认后调用现有普通会话创建与正常消息接收链。取消、空说明和发送失败不创建或保留半会话。
5. 提交：`feat(workspace-ui): show portable project home`。

## Task 11：冻结验收与文档

**Files:**
- Create: `creatx/scripts/electron-project-package-test.ts`
- Modify: `creatx/package.json`
- Create: `docs/baseline/creatx-portable-project-package-<date>.md`
- Modify: `CONTEXT.md`
- Modify: affected capability status and evidence sections

1. Electron 使用真实 Windows 中文/空格项目、真实图片/HTML/Markdown、一个本地受控 Cline 会话和零付费 Provider 完成：标记案例 → 导出 `.np` → 新 Profile 导入 → 首页/文件/案例 → 重启 → 继续新会话。
2. 负向 Electron 覆盖取消、身份冲突副本、工作台语义损坏降级和缺失项目目录。
3. 验证包内不存在 Cline SQLite、Profile、密钥、Cookie、System Prompt、工具参数/结果、Run 和排队图片任务。
4. 代码冻结后依次运行：

```powershell
cd D:\CodexW\Creatx\creat1\creatx
bun install --frozen-lockfile
bun run typecheck
bun run test:imports
bun run test
bun run build
bun run test:project-package
git diff --check
```

5. 只把真实通过的结果标为 Live（真实运行）。静态 ZIP、Mock、组件测试和直接 Service 调用不得替代 Electron 新目录提交、重启恢复与真实 Cline 案例投影。
6. 最终提交：`feat(import-export): deliver portable noven projects`。

## 推荐执行顺序

按当前项目规则在权威 `creat1` 中串行执行 Task 1–11。不要并行修改 Contracts（合同）、Cline Adapter、Project Files 或顶层 Main；这些任务存在明确前后依赖。每个任务完成定向测试和小提交，最终只运行一次全量。只有用户另行要求隔离实现时，才从当前已提交设计头创建短分支 `portable-project` Worktree（工作树），审查后显式合回 `creat1`。
