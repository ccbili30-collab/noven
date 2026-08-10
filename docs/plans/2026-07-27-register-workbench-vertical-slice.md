---
title: Register Workbench Vertical Slice Implementation Plan
doc_type: implementation-plan
owner: integration
status: implemented-live-checkpoint
last_verified: 2026-07-27
primary_capability: workbench-registry
baseline_commits:
  - c9a4ae4
  - f289dd3
---

# Register Workbench Vertical Slice Implementation Plan

**实施结果：** 2026-07-27 已按本计划完成第一条纵向闭环。真实命令、Provider、拒绝与批准、重启和未覆盖边界见 `../baseline/creatx-register-workbench-live-2026-07-27.md`；本文件保留为实施过程和恢复依据，不再作为下一任务。

**Goal:** 用户在真实 Electron 项目会话中要求 AI 注册一个现有文件夹，经 Cline 原生审批后立即看到通用工作台，并在应用重启后从真实 `.creatx` 恢复。

**Architecture:** `@creatx/workbench` 拥有 V1 Loader（加载器）、Query/Command Port（查询/命令端口）、幂等规则和 `register_workbench` 中立工具；它只使用 `@creatx/project-files` Port，不读取绝对项目根。Main 组合 Project Files、Workbench 和 Cline Adapter；Renderer 只消费稳定 Desktop Projection（桌面投影）。

**Tech Stack:** TypeScript、Bun Test、Electron Main/Preload、React Renderer、Cline SDK `0.0.65`、Windows 原生文件系统。

## 当前范围

### 实现

- 不落盘的 `builtin:files` 内置工作台；
- ADR-0007 的 `.creatx/workbenches/<id>.json` V1 Parser 和写入；
- 安全目录查询与 create-only 项目文件写入；
- Workbench Snapshot、Diagnostic、Query/Command Port；
- `register_workbench` 项目工具和 Cline 原生逐次审批；
- Desktop API 工作台查询；
- 独立工作台标签区和一个通用文件夹视图；
- 重复注册、缺失、损坏、冲突、拒绝、重启和真实 Provider 验收。

### 不实现

- 手动注册按钮、注册改名、重新定位、移除或删除；
- 模板、布局、页面、组件、图标、封面、图片或内容类型；
- 父子工作台专用导航和继承合并；
- Watcher（监听器）、版本历史、回收站或自动修复外部移动；
- Creative Skill/Plugin Package、Growth、Study、Living、地图或因果；
- Cline Core 修改、第二 Harness（智能体运行框架）或新权限系统。

## Task 1：补齐 Project File 目录与仅创建语义

**Files**

- Modify: `creatx/packages/project-files/src/index.ts`
- Modify: `creatx/packages/project-files/tests/project-files.test.ts`

**步骤**

1. 在测试中先定义 `listDirectory(projectId, relativePath, visibility)`：返回直接子项，支持 `.` 根目录；`visibility: "content"` 应用统一隐藏规则，`"internal"` 允许 Workbench 读取 `.creatx`，两者都拒绝绝对路径、`..` 和符号链接/Junction 逃逸。
2. 增加空文件夹、中文和空格、隐藏目录、缺失目录、目标是文件、项目外 Junction 的失败测试并确认红灯。
3. 扩展 `ProjectFileQueryPort`，返回 `ProjectDirectorySnapshot | undefined`；`undefined` 只表示目录不存在，非法或非目录仍抛出分类错误。
4. 将 `ProjectFileWriteRequest.expectedModifiedAt` 扩展为 `string | null`：`null` 表示只允许目标不存在；目标已存在时返回 `file_conflict`。
5. 增加并发 create-only 写入测试：同一路径最多一次成功，另一调用失败且已成功内容不被覆盖。
6. 运行 `bun test packages/project-files/tests/project-files.test.ts` 和 `bun run typecheck`。

**完成条件:** Workbench 后续不需要项目绝对路径即可验证空目录、枚举元数据文件并安全创建记录。

**停止条件:** Node 文件 API 无法在当前 Windows 语义下阻止 Junction 逃逸或 create-only 覆盖；此时停止并修订 ADR-0006，不能在 Workbench 中直接访问文件系统。

## Task 2：定义稳定 Workbench Projection

**Files**

- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/contracts/tests/errors.test.ts`

**步骤**

1. 先编写类型消费测试或编译 Fixture，定义以下稳定字段：
   - `WorkbenchEntry`: `kind`、`name`、`relativePath`、文件项可选 `fileId`；
   - `WorkbenchProjection`: `id`、`source`、`title`、`folder`、`state`、扁平子树 `entries`；
   - `WorkbenchDiagnostic`: `code`、可选 `recordPath`、用户可解释 `message`；
   - `WorkbenchSnapshot`: `projectId`、有序 `workbenches`、`diagnostics`、`refreshedAt`。
2. `source` 只允许 `builtin | registered`；`state` 只允许 `ready | missing`。
3. 增加 `workbench_invalid` 和 `workbench_conflict` 错误分类，不能包装成普通 Runtime 错误。
4. 扩展 `CreatXDesktopApi`，只增加 `readWorkbenches(projectId)`；不把 Workbench 私有记录或绝对路径暴露给 Renderer。
5. 运行 Contracts 测试和 `bun run typecheck`。

**完成条件:** Renderer 获得的是可重建投影与诊断，不是原始 JSON 或文件系统能力。

## Task 3：实现 Workbench Registry 与工具

**Files**

- Create: `creatx/packages/workbench/package.json`
- Create: `creatx/packages/workbench/src/index.ts`
- Create: `creatx/packages/workbench/tests/workbench.test.ts`
- Modify: `creatx/tsconfig.json`

**步骤**

1. 先写真实临时目录测试，覆盖 `ACC-WBR-005` 至 `007`、`009` 至 `014`：内置投影无写入、合法注册、重复幂等、重启重载、缺失、损坏、未知版本、ID/文件名不一致、重复文件夹、非法路径和 create-only 冲突。
2. 实现严格 V1 Decoder（解码器）：使用 `JSON.parse` 后逐字段校验，拒绝未知字段和非 `schemaVersion: 1`；不使用字符串拼接解析 JSON。
3. 实现 `WorkbenchRegistryService`：构造函数只接收 `ProjectFileQueryPort/ProjectFileCommandPort`，绝不接收项目根。
4. 实现 `queries.snapshot(projectId)`：首先生成 `builtin:files`，然后逐文件隔离加载有效注册；使用安全目录查询生成通用子树和 `missing` 状态。
5. 实现 `commands.register({ projectId, folder, title? })`：按项目串行化；规范化并验证真实非根目录；先检测有效或冲突记录；生成 UUID；以 `expectedModifiedAt: null` 原子创建；重新加载后才返回成功。
6. 实现 `register_workbench` 的 `CreatXToolContribution`：项目作用域、`approval: "required"`、对象 JSON Schema、`retryable: false` 由 Adapter 保持；工具只调用 Workbench Command Port。
7. 运行 `bun test packages/workbench/tests/workbench.test.ts`、Project Files 回归和 `bun run typecheck`。

**完成条件:** 一个不依赖 Cline 类型和绝对路径的真实 Workbench Package 完成持久化、投影、幂等与失败隔离。

## Task 4：接入 Main、Preload 与 Cline

**Files**

- Modify: `creatx/package.json`
- Modify: `creatx/bun.lock`
- Modify: `creatx/electron.vite.config.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Modify: `creatx/packages/cline-adapter/tests/projection.test.ts`

**步骤**

1. 将 `@creatx/workbench` 加入 Workspace 依赖、TypeScript Paths 和 Electron Main 内部 Package 打包列表；不加入 Preload 或 Renderer 依赖。
2. Main 使用现有 `ProjectFileService` 的 Port 创建唯一 `WorkbenchRegistryService`。
3. 创建 Cline Adapter 时注入 `register_workbench` Contribution；不修改 Cline Core 或创建新 Tool Loop。
4. 实现 `readWorkbenches(projectId)` IPC，Main 只返回 `WorkbenchSnapshot`。
5. Preload 暴露同名稳定方法，参数只有 `projectId`。
6. 补 Adapter/集成测试，证明工具保持原生审批、正确注入 `projectId`，缺少项目关联时失败关闭。
7. 运行 `bun run test:imports`，确保只有 `cline-adapter` 导入 `@cline/`。

**完成条件:** 真实 Cline Session 能看到工具，Main 是唯一组合点，Renderer 不获得文件 Port 或 Cline 类型。

## Task 5：实现独立工作台标签与通用视图

**Files**

- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/styles.css`
- Modify: `creatx/scripts/desktop-test.ts`

**步骤**

1. 先扩展 Desktop 测试 Fixture，断言右侧窄幅“文件/预览”和独立“工作台”标签同时存在，`builtin:files` 固定第一。
2. 将 `RightSurface` 改为可表达窄幅文件、预览和指定 Workbench ID 的判别联合；同一时间只展开一个右侧表面。
3. 项目加载、切换、显式刷新和成功 `tool.finished` 后调用 `readWorkbenches(projectId)`；切换项目清除旧工作台状态。
4. 在右侧 Rail（边栏）中保留“查看：文件/预览”，另加“工作台：文件/注册项”标签区；点击当前工作台再次收回。
5. 内置和注册工作台复用一个 `GenericFolderWorkbench`：显示标题、路径、目录分组和真实文件；点击文件继续使用现有 `readFile(projectId, fileId)` 预览。
6. `missing` 显示保存标题、原路径和明确缺失状态；诊断显示为非阻塞项目警告，不遮挡聊天和内置“文件”。
7. 工作台展开时在当前右侧 Panel 位置使用更宽但有上限的稳定轨道；窄窗口使用覆盖层，聊天与控制不重叠。
8. 在 1360×860、900×700 和最小 860×620 运行 Desktop/Playwright 截图与文本溢出检查。

**完成条件:** 用户能区分辅助文件/预览和工作台标签；注册结果立即可见且没有 Fixture 生产数据。

## Task 6：完成真实 Electron 纵向验收

**Files**

- Modify: `creatx/scripts/electron-live-test.ts`
- Modify: `creatx/scripts/live-test.ts`（仅在通用工具提示确需同步时）
- Create: `docs/baseline/creatx-register-workbench-live-2026-07-27.md`
- Modify: `CONTEXT.md`
- Modify: `docs/capabilities/workbench-registry/README.md`
- Modify: `docs/capabilities/workbench-registry/acceptance.md`
- Modify: `docs/capabilities/workbench-registry/plan.md`

**步骤**

1. Live Fixture 创建含中文/空格的现有文件夹及真实 Markdown，记录注册前文件路径和内容。
2. 用户发送明确注册要求；断言真实 Provider 选择 `register_workbench`，审批输入只有 `folder/title`。
3. 首次拒绝审批，断言没有 `.creatx/workbenches/*.json`、没有新工作台和项目内容副作用。
4. 再次请求并批准；断言合法 V1 JSON、真实目录和文件未移动、工具成功、工作台标签立即出现且显示真实文件。
5. 退出 Electron，检查无残留进程；重启后不调用 Provider，断言同一 ID、标题、路径和文件从 `.creatx` 恢复。
6. 注入一条损坏 JSON 后再次读取，断言有效工作台与 `builtin:files` 仍可用，并显示非阻塞诊断。
7. 集中运行：`bun run typecheck`、`bun test`、`bun run test:imports`、`bun run build`、`bun run test:desktop`、`bun run test:live`、`bun run test:electron-live`。
8. 检查 Electron/Node/Bun 残留进程和 Live 临时目录；恢复测试生成但无语义变化的旧截图。
9. 记录命令、测试数量、Provider、截图、失败和未完成边界；只有连续 Electron Live 通过后才把注册能力标为 Live。

**完成条件:** `ACC-WBR-005` 至 `015` 按证据类型通过或明确保留未通过，主用户故事在一个真实 Electron 进程链中闭环。

## 全局停止条件

- 必须修改 Cline Core、引入第二 Harness 或让 Renderer/Workbench 接收绝对项目根；
- 需要改变 ADR-0007 的 Schema、一个文件夹一个注册或缺失/损坏行为；
- 真实 Provider 只能通过原生 Editor 直接写 JSON，不能稳定调用中立工具；
- 工作台 UI 必须先确定模板、布局、封面或图片合同才能显示；
- 现有用户文件必须移动、复制或转换为 Work/Artifact 身份；
- 任一失败只能靠 Fixture、Mock（模拟）或本地模板掩盖。

触发停止条件时回到用户或新 ADR，不添加兼容垫片继续推进。
