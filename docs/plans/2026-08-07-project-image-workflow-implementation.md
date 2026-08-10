# Project Image Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立项目隔离的图片队列、可操作的当前项目进度栏、受控文章图片挂接，以及工作台中的稳定 Markdown/HTML 图文展示。

**Architecture:** 保留一个由 Electron Main Process（主进程）拥有的 SQLite Store（存储），把现有全局单 Worker 改为“全局最多两个项目通道、每项目最多一个请求”的调度器。`image_task` 表示稳定逻辑任务，新增 Attempt（尝试）历史保存每次真实 Provider 请求；图片成功后由独立挂接服务通过 Project File Command Port（项目文件命令端口）写入标准 Markdown 引用，Renderer 只消费稳定合同和事件。

**Tech Stack:** React 19、TypeScript、Electron IPC、Bun、Node `sqlite`、现有 `@creatx/contracts`、`@creatx/image-runtime`、`@creatx/project-files`、lucide-react、独立 CSS。

---

## 实施前置条件

- 当前 `topic-genre-style` 工作树存在大量未提交修改。执行本计划前必须先完成并提交或明确冻结该批次；不得在脏工作树中直接同时改 `main.ts`、`WorkspaceShell.tsx`、`contracts/src/index.ts` 和图片 Runtime。
- 不复制其他 worktree 文件，不使用 `git add -A`，不清理整本 Growth 运行产物。
- 本计划不要求真实 Provider 调用。Provider Live（真实运行）只在代码冻结、用户配置可用且单独授权后执行。
- 第一版全局并发常量固定为 `2`；不增加设置项，避免把调度策略扩大为新的配置系统。

## 批次一：冻结产品合同和数据库迁移

### Task 1: 更新 Image Runtime 规格与验收矩阵

**Files:**
- Modify: `docs/capabilities/image-runtime/product-spec.md`
- Modify: `docs/capabilities/image-runtime/acceptance.md`
- Modify: `docs/capabilities/image-runtime/README.md`
- Modify: `docs/capabilities/workspace-ui/product-spec.md`
- Modify: `docs/capabilities/workspace-ui/acceptance.md`
- Reference: `docs/discussions/2026-08-07-project-image-workflow.md`

**Step 1:** 将 `IMG-012` 从“全局唯一顺序 Worker”改为“每项目单通道、全局最多两个活动项目”。

**Step 2:** 增加重试、跳过、取消、Attempt 历史、当前项目进度投影和成功后 UI 消隐规则；替换 `IMG-019` 的“无专用队列界面”为“无独立队列页面，但主工作区有紧凑项目进度栏”。

**Step 3:** 增加图文挂接、Markdown 环绕和普通 HTML 安全预览规则。明确正文引用是关系权威，数据库挂接意图不是内容事实。

**Step 4:** 为下列失败路径建立 Acceptance（验收）ID：同项目并发竞争、跨项目并行、取消中请求、重启中断、重试历史、跳过排序、文档锚点冲突、重复挂接、HTML 越界资源。

**Step 5:** 执行文档检查。

Run: `git diff --check -- docs/capabilities docs/discussions/2026-08-07-project-image-workflow.md`

Expected: Exit code 0。

### Task 2: 为队列 Schema V2 写失败测试

**Files:**
- Modify: `creatx/packages/image-runtime/tests/queue.node-test.ts`
- Modify: `creatx/packages/image-runtime/tests/live-archive.node-test.ts`
- Modify: `creatx/packages/image-runtime/src/queue-schema.ts`
- Modify: `creatx/packages/image-runtime/src/live-archive.ts`

**Step 1:** 添加 V1 数据库升级测试，覆盖现有 `queued/generating/succeeded/failed/interrupted` 记录无损迁移。

**Step 2:** 添加新库结构测试：

```text
image_task
  status 增加 cancelled
  queue_rank 保存当前项目内顺序
  attachment_* 保存可选挂接意图和挂接结果

image_task_attempt
  image_task_id + attempt_number 唯一
  status / error / started_at / completed_at
```

**Step 3:** 运行测试并确认当前 Schema V1 失败。

Run: `bun run test:image-queue`

Run: `node --experimental-transform-types --test packages/image-runtime/tests/live-archive.node-test.ts`

Expected: FAIL，原因是 Schema V2、Attempt 表和 `cancelled` 尚不存在。

**Step 4:** 实现显式 V1 → V2 事务迁移。迁移不得删除任务，不得把旧 `interrupted` 自动改回 `queued`；已有非排队状态形成一条迁移 Attempt 证据。

**Step 5:** 更新 Live Archive 导入，使 V1/V2 来源都能进入当前 Schema；未知列或冲突继续失败关闭。

**Step 6:** 重跑定向测试。

Run: `bun run test:image-queue`

Run: `node --experimental-transform-types --test packages/image-runtime/tests/live-archive.node-test.ts`

Expected: PASS。

**Step 7:** 暂存时只列出本任务文件并提交。

```powershell
git add -- 'creatx/packages/image-runtime/src/queue-schema.ts' 'creatx/packages/image-runtime/src/live-archive.ts' 'creatx/packages/image-runtime/tests/queue.node-test.ts' 'creatx/packages/image-runtime/tests/live-archive.node-test.ts'
git commit -m "feat(image): migrate project image task history"
```

## 批次二：项目通道调度和任务控制

### Task 3: 实现 Store 的原子项目队列操作

**Files:**
- Modify: `creatx/packages/image-runtime/src/queue-store.ts`
- Modify: `creatx/packages/image-runtime/tests/queue.node-test.ts`

**Step 1:** 先写失败测试，覆盖：

- `claimNextForProject(projectId)` 只能在该项目没有 `generating` 时领取；
- 两个项目可以各有一个 `generating`；
- 同项目第二次领取返回空；
- `skip` 把 `queue_rank` 移到本项目最大值之后；
- `retry` 把失败/中断任务重新入队到本项目最小值之前，并新增 Attempt 而不删除旧 Attempt；
- `cancel` 形成 `cancelled`，保留错误和 Attempt 历史；
- 非法状态转换返回 `image_queue_conflict`。

**Step 2:** 实现以下权威 Store 方法，所有读改写必须在 SQLite 事务内完成：

```ts
listRunnableProjects(limit: number): string[]
claimNextForProject(projectId: string): ImageTaskProjection | undefined
retryNow(projectId: string, imageTaskId: string): ImageTaskProjection
skipToProjectTail(projectId: string, imageTaskId: string): ImageTaskProjection
cancel(projectId: string, imageTaskId: string): ImageTaskProjection
listProject(projectId: string): ImageTaskProjection[]
```

**Step 3:** 保持 `imageTaskId` 为逻辑任务身份。Growth 的 `requiredImageTaskIds` 不因重试或跳过而变化。

**Step 4:** 运行定向测试。

Run: `bun run test:image-queue`

Expected: PASS，且测试断言任一项目最多一个 `generating`。

### Task 4: 把单 Worker 改为有界项目通道调度器

**Files:**
- Modify: `creatx/packages/image-runtime/src/queue.ts`
- Modify: `creatx/packages/image-runtime/tests/queue.node-test.ts`

**Step 1:** 写失败测试，使用可控制的测试端口证明：

- A1 与 B1 可以同时进入 Provider；
- A2 必须等待 A1；
- 完成 A1 后 A2 开始；
- 全局第三个项目必须等待任一槽位释放；
- 调度按项目最早排队任务轮转，不让同一项目占满两个槽位。

**Step 2:** 用 `Map<projectId, ActiveImageRequest>` 替换单个 `activeController`，用活动 Promise 集合替换单个 `drainPromise`。全局并发常量固定为 2。

**Step 3:** 每次槽位释放后重新查询可运行项目。不要常驻创建每项目 Worker，不要把 Provider 调用放进 SQLite 事务。

**Step 4:** 实现 `retry`、`skip`、`cancel` 调度入口：

- 失败/中断任务 `retry`：队首；
- 排队、失败或中断任务 `skip`：队尾；
- 排队、失败或中断任务 `cancel`：立即终态；
- 生成中任务 `cancel`：先持久化取消意图并调用该项目控制器，只有原 Promise 离开后才占用下一任务；
- 生成中任务拒绝 `skip` 和 `retry`。

**Step 5:** 关闭时中止所有活动控制器，并等待全部活动 Promise 落定；所有仍生成中的任务成为 `interrupted`，不得自动重提。

**Step 6:** 运行定向测试。

Run: `bun run test:image-queue`

Expected: PASS，无未处理 Promise rejection（Promise 拒绝）和残留计时器。

**Step 7:** 提交本批。

```powershell
git add -- 'creatx/packages/image-runtime/src/queue.ts' 'creatx/packages/image-runtime/src/queue-store.ts' 'creatx/packages/image-runtime/tests/queue.node-test.ts'
git commit -m "feat(image): schedule isolated project lanes"
```

## 批次三：稳定合同、Electron 接入和项目进度栏

### Task 5: 增加图片任务查询与控制合同

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/tests/app-event-routing.test.ts`

**Step 1:** 先写合同/路由失败测试。

**Step 2:** 增加稳定命令，不向 Renderer 暴露数据库结构：

```ts
type ImageTaskAction = "retry" | "skip" | "cancel"

interface ControlImageTaskCommand {
  projectId: string
  imageTaskId: string
  action: ImageTaskAction
}

readImageTasks(projectId: string): Promise<DesktopResult<ImageTaskProjection[]>>
controlImageTask(command: ControlImageTaskCommand): Promise<DesktopResult<ImageTaskProjection>>
```

**Step 3:** `main.ts` 必须同时验证 `projectId` 和 `imageTaskId` 所属关系，防止一个项目操作另一个项目的任务。

**Step 4:** 保持现有 `image.task.changed` 为唯一增量事件。应用初始化和项目切换使用 `readImageTasks` 读取持久快照，避免重启后进度丢失。

**Step 5:** 运行定向测试和类型检查。

Run: `bun test ./apps/desktop/tests/app-event-routing.test.ts`

Run: `bun run typecheck`

Expected: 两条命令均 Exit code 0。

### Task 6: 实现当前项目图片进度栏

**Files:**
- Create: `creatx/apps/desktop/renderer/src/image-task-activity.ts`
- Create: `creatx/apps/desktop/renderer/src/ImageTaskProgress.tsx`
- Create: `creatx/apps/desktop/renderer/tests/image-task-activity.test.ts`
- Create: `creatx/apps/desktop/renderer/tests/image-task-progress.test.tsx`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Step 1:** 写纯投影测试：只保留当前项目任务，计算总数、完成数、生成中标题和排队数；成功事件保留 3 秒后移除活动列表，但原任务数组不删除。

**Step 2:** 写组件测试：

- `queued` 显示跳过和取消；
- `generating` 只显示取消；
- `failed/interrupted` 显示重试、跳过和取消；
- `succeeded` 显示绿色完成反馈；
- `cancelled` 显示短暂已取消反馈；
- 操作按钮有稳定可访问名称，快速点击时禁用，避免重复 IPC。

**Step 3:** `App.tsx` 在 bootstrap、项目切换和 `image.task.changed` 时维护当前项目任务 Projection。切换项目必须清空旧项目 UI，再读取新项目快照。

**Step 4:** 把紧凑进度栏放在 Composer（输入区）上方，与 Growth 进度条同层但互不覆盖。默认只展示一行；展开后查看全部活动任务。

**Step 5:** CSS 不使用会导致消息滚动区反复重排的绝对高度动画。成功消隐只做 opacity/transform 动画，最终再移除节点。

**Step 6:** 运行 Renderer 定向测试。

Run: `bun test ./apps/desktop/renderer/tests/image-task-activity.test.ts ./apps/desktop/renderer/tests/image-task-progress.test.tsx`

Expected: PASS。

**Step 7:** 提交本批。

```powershell
git add -- 'creatx/packages/contracts/src/index.ts' 'creatx/apps/desktop/src/preload.ts' 'creatx/apps/desktop/src/main.ts' 'creatx/apps/desktop/tests/app-event-routing.test.ts' 'creatx/apps/desktop/renderer/src/App.tsx' 'creatx/apps/desktop/renderer/src/WorkspaceShell.tsx' 'creatx/apps/desktop/renderer/src/worldbuilder-production.css' 'creatx/apps/desktop/renderer/src/image-task-activity.ts' 'creatx/apps/desktop/renderer/src/ImageTaskProgress.tsx' 'creatx/apps/desktop/renderer/tests/image-task-activity.test.ts' 'creatx/apps/desktop/renderer/tests/image-task-progress.test.tsx'
git commit -m "feat(desktop): show project image task progress"
```

## 批次四：文章图片挂接

### Task 7: 建立唯一的图片挂接服务

**Files:**
- Create: `creatx/packages/image-runtime/src/document-attachment.ts`
- Create: `creatx/packages/image-runtime/tests/document-attachment.node-test.ts`
- Modify: `creatx/packages/image-runtime/src/index.ts`
- Modify: `creatx/packages/image-runtime/src/queue.ts`
- Modify: `creatx/packages/image-runtime/src/queue-store.ts`
- Modify: `creatx/packages/contracts/src/index.ts`

**Step 1:** 定义可选挂接意图：目标 Markdown/MDX 路径、替代文字和以下一种位置：文末、唯一标题之后、唯一正文锚点之后。禁止字节偏移和模糊同名匹配。

**Step 2:** 先写失败测试，覆盖：

- 图片文件不存在时不修改正文；
- 目标不是 Markdown/MDX 时失败关闭；
- 唯一锚点成功插入标准 `![alt](relative/path.png)`；
- 锚点不存在或重复时不写文件；
- 已存在相同引用时幂等成功；
- 写入前文件变化时重新读取一次，锚点仍唯一才重试；
- 第二次仍冲突则保存 `attachment_conflict`，不覆盖用户正文；
- 图片成功但挂接失败时图片任务仍为 `succeeded`。

**Step 3:** 实现 `ImageAttachmentService`，只通过 `ProjectFileQueryPort` 和 `ProjectFileCommandPort` 工作。标准 Markdown 引用是最终关系事实；任务表只保存挂接意图和执行结果。

**Step 4:** 为 `submit_image_generation` 增加可选 `attachment` 输入，并增加中立 `attach_image_to_document` Tool（工具）供已有图片使用。两个入口必须调用同一个服务，不复制插入规则。

**Step 5:** 队列在真实图片落盘并 `succeed` 后调用挂接服务。挂接失败发出更新事件并保留错误，不能回滚或删除成功图片。

**Step 6:** 运行定向测试。

Run: `node --experimental-transform-types --test packages/image-runtime/tests/document-attachment.node-test.ts packages/image-runtime/tests/queue.node-test.ts`

Expected: PASS。

### Task 8: 把挂接结果接入 Growth 最终证据

**Files:**
- Modify: `creatx/packages/world-blueprint/src/materialization.ts`
- Modify: `creatx/packages/world-blueprint/tests/materialization.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`

**Step 1:** 添加失败测试：后台图片成功但挂接失败时，文字阶段可以完成，Owner 汇报必须列出“图片已生成但未插入文章”。该原始验收后来由 `../discussions/2026-08-07-silent-image-attachment-mismatch.md` 缩小：`image_attachment_conflict` 静默，其他挂接故障继续列出。

**Step 2:** 扩展现有 `imageTaskEvidence` 返回挂接结果。不得把可选挂接失败升级为整个 Growth Goal 失败；若产品规格明确声明该挂接为必需，才进入既有必需图片门禁。

**Step 3:** 运行定向测试。

Run: `bun test ./packages/world-blueprint/tests/materialization.test.ts`

Expected: PASS。

**Step 4:** 提交本批。

```powershell
git add -- 'creatx/packages/image-runtime/src/document-attachment.ts' 'creatx/packages/image-runtime/src/index.ts' 'creatx/packages/image-runtime/src/queue.ts' 'creatx/packages/image-runtime/src/queue-store.ts' 'creatx/packages/image-runtime/tests/document-attachment.node-test.ts' 'creatx/packages/image-runtime/tests/queue.node-test.ts' 'creatx/packages/contracts/src/index.ts' 'creatx/packages/world-blueprint/src/materialization.ts' 'creatx/packages/world-blueprint/tests/materialization.test.ts' 'creatx/apps/desktop/src/main.ts'
git commit -m "feat(image): attach generated images to documents"
```

## 批次五：工作台图文与 HTML 展示

### Task 9: 实现 Markdown 响应式图文布局

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/MessageMarkdown.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`
- Modify: `creatx/apps/desktop/renderer/tests/message-markdown.test.tsx`

**Step 1:** 写测试，验证图片仍由项目文件 Projection 解析，不接受任意外部 URL 或 HTML 注入。

**Step 2:** 图片加载后按实际宽高比标记普通图或横向大图。普通图宽屏右浮动并由正文环绕；横向大图全宽；工作台变窄时全部回到上下布局。

**Step 3:** 为文章容器增加 clearfix，避免后续章节、表格和页脚被浮动穿透。图注保持可读，不覆盖正文。

**Step 4:** 运行组件测试。

Run: `bun test ./apps/desktop/renderer/tests/message-markdown.test.tsx`

Expected: PASS。

### Task 10: 让普通 HTML 文件进入安全预览

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/project-files/src/index.ts`
- Modify: `creatx/packages/project-files/tests/project-files.test.ts`
- Modify: `creatx/apps/desktop/src/workbench-preview-protocol.ts`
- Modify: `creatx/apps/desktop/tests/workbench-preview-protocol.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`

**Step 1:** 增加明确的 `html` 文件种类和普通项目 HTML Presentation（展示）解析合同，不把 HTML 当 Markdown 文本编辑，也不在 Renderer 直接执行字符串。

**Step 2:** 写失败测试：普通 `.html` 入口可加载同项目相对 CSS、JS 和图片；`..`、绝对路径、跨项目 Token、过期 Token 和 Electron/Node 访问全部失败关闭。

**Step 3:** 复用 `creatx-workbench://` 协议的 Token、Content Security Policy（内容安全策略）和 MIME 处理。不要创建第二套 `file://` 或 `data:text/html` 预览。

**Step 4:** 点击普通 HTML 文件时进入 iframe；返回后恢复原文件树和工作台状态。HTML 第一版只预览，不提供源码编辑切换。

**Step 5:** 运行定向测试。

Run: `bun test ./packages/project-files/tests/project-files.test.ts ./apps/desktop/tests/workbench-preview-protocol.test.ts`

Expected: PASS。

**Step 6:** 提交本批。

```powershell
git add -- 'creatx/apps/desktop/renderer/src/MessageMarkdown.tsx' 'creatx/apps/desktop/renderer/src/worldbuilder-production.css' 'creatx/apps/desktop/renderer/tests/message-markdown.test.tsx' 'creatx/packages/contracts/src/index.ts' 'creatx/packages/project-files/src/index.ts' 'creatx/packages/project-files/tests/project-files.test.ts' 'creatx/apps/desktop/src/workbench-preview-protocol.ts' 'creatx/apps/desktop/tests/workbench-preview-protocol.test.ts' 'creatx/apps/desktop/src/main.ts' 'creatx/apps/desktop/src/preload.ts' 'creatx/apps/desktop/renderer/src/App.tsx' 'creatx/apps/desktop/renderer/src/WorkspaceShell.tsx'
git commit -m "feat(workbench): present linked images and html"
```

## 批次六：集成验收与留档

### Task 11: 运行跨能力集成验证

**Files:**
- Modify: `creatx/scripts/desktop-test.ts`
- Create or Modify: `creatx/apps/desktop/tests/project-image-workflow.test.ts`

**Step 1:** 建立无外部 Provider 的确定性集成端口，验证真实 SQLite、真实项目文件和真实 IPC 合同，不把结果标记为 Provider Live。

**Step 2:** 覆盖完整流程：

```text
项目 A 提交 A1/A2
项目 B 提交 B1
→ A1 与 B1 并行
→ A2 等待 A1
→ A1 成功并挂接文章
→ Markdown 读取真实图片引用
→ 成功活动 3 秒后消隐
→ 数据库任务和 Attempt 仍存在
```

**Step 3:** 覆盖失败控制：失败 → 跳过到队尾 → 重试到队首 → 取消 → 下一任务运行；任何路径都不得删除历史或跨项目操作。

**Step 4:** 覆盖重启：`generating` 变为 `interrupted`，`queued` 保留；重新打开项目后活动栏从持久快照恢复。

**Step 5:** 运行定向集成测试。

Run: `bun test ./apps/desktop/tests/project-image-workflow.test.ts`

Expected: PASS。此结果是本地 Runtime 集成证据，不是外部 Provider Live。

### Task 12: 冻结代码后执行唯一一次全量验收

**Files:**
- Modify: `CONTEXT.md`
- Modify: `BASELINE.md`
- Create: `docs/baseline/creatx-project-image-workflow-2026-08-07.md`

**Step 1:** 确认没有运行中的子 Agent、测试 Electron、Bun 测试或打包进程会争用输出目录。

**Step 2:** 从 `creatx/` 依次执行：

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run test:imports
bun test
bun run build
git diff --check
```

Expected: 全部 Exit code 0。记录实际测试数量和断言数量，不复用旧数字。

**Step 3:** 手工桌面验收至少覆盖：

- 打开两个项目并提交图片任务，确认不同项目可并行、同项目严格串行；
- 当前项目只显示自身活动；
- 重试、跳过、取消和成功消隐符合语义；
- Markdown 宽屏环绕、横图全宽、窄屏上下布局；
- 普通 HTML 安全播放并可返回；
- 退出后无残留 Electron 子进程。

**Step 4:** 若没有真实图片 Provider 配置，明确标记“未执行外部 Provider Live”，不得用测试端口冒充。

**Step 5:** 更新 `CONTEXT.md`、`BASELINE.md` 和基线证据，列明实现范围、测试、未验证边界及恢复入口。

**Step 6:** 只暂存本计划相关文件，检查暂存差异后提交。

```powershell
git diff --cached --stat
git diff --cached --check
git commit -m "docs: record project image workflow baseline"
```

## 停止条件

遇到以下任一情况立即停止实施并回到产品或架构确认，不得添加兼容垫片硬推：

- 需要 Renderer 直接读取 SQLite；
- 需要第二个图片队列数据库或第二套 Provider Runtime；
- 无法保证同项目最多一个 Provider 请求；
- 取消后必须在旧请求尚未落定时启动同项目下一张；
- 自动挂接必须覆盖用户已修改的正文才能继续；
- HTML 预览要求放开 Node/Electron 权限或绕过现有安全协议；
- 当前工作树的既有改动与目标文件所有权不清晰；
- Typecheck 或核心队列测试无法恢复为绿色。

## 完成定义

只有同时满足以下条件，才能称为当前任务闭环：

- 普通对话、Growth 和 GWP 都通过同一图片提交入口进入项目通道；
- 两个项目可并行，同项目不会并行；
- 任务控制、历史、重启恢复和当前项目进度可见；
- 图片成功后能通过唯一挂接服务形成真实 Markdown 引用；
- 工作台能正确显示 Markdown 图文和普通 HTML；
- 失败与挂接冲突不伪装成功，也不拖死无依赖正文主链；
- 定向测试、全量测试、Typecheck、Import Boundary 和 Production Build 全部通过；
- 外部 Provider Live 是否执行被如实记录。
