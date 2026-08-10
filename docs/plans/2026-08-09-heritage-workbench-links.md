# 传承库与工作台导航统一修复实施计划

## 目标与边界

Primary Capability Line（主要能力线）为 `workspace-ui`，相邻只引用 `project-files` 的真实文件身份与读取合同。允许修改 Renderer（渲染层）的传承库目录、工作台布局、Markdown 交互及其测试和权威文档。明确不修改 Provider、Cline Adapter、项目文件协议、正式 Profile 和发布版本。

验收标准为 `WUI-046..048 / ACC-WUI-068..070`。如果实现需要新增任意路径读取、覆盖用户导入或改变公开协议，则停止。

## Step 1：建立失败信号和数据合同

- Output：旧错误验收改为 `workbench-canvas` 可操作；Markdown 测试覆盖相对文件、图片、标题锚点和失败关闭；传承库测试约束版本化 JSON、四类各五条和数据驱动筛选。
- Test：从 `creatx/` 运行对应 Renderer 定向测试，确认生产代码修改前至少新增行为稳定失败。

## Step 2：实现三条最小生产路径

- Output：传承库从版本化 JSON 读取目录；右侧分隔线恢复拖动/键盘；项目 Markdown 图片与相对链接调用现有工作台打开链并传递可选标题锚点。
- Test：对应定向测试全部通过，`git diff --check` 通过。

## Step 3：集成与真实界面验收

- Output：Renderer 全套、Typecheck（类型检查）、Production Build（生产构建）通过；隔离 Electron 覆盖三项用户交互，并保留可复现日志。
- Test：只使用隔离 Profile；不关闭正式 Portable，不运行外部 Provider。

## Step 4：冻结证据与提交

- Output：更新 `BASELINE.md`、`CONTEXT.md` 和本批基线，准确记录测试数量、Live（真实运行）边界、未验收项与恢复入口；检查暂存范围后提交。
- Test：`git status --short` 只包含本批文件和既有三项未跟踪用户文件；提交后工作树边界可解释。
