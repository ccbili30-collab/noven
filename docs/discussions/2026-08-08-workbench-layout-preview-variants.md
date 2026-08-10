# 工作台布局对照原型

日期：2026-08-08

状态：Prototype（原型），未提升为生产产品决定

## 目的

在不改变生产 `WorkspaceShell`、Cline 会话、项目文件和工作台协议的前提下，同时比较三种桌面构图：

- `workbench-core`：工作台画布占主位，Chat 位于右侧；
- `workbench-balanced`：工作台和 Chat 使用更接近的宽度；
- `chat-focus`：保持当前生产顺序，作为对照。

## 实现边界

原型入口为 `creatx/apps/desktop/renderer/preview/PreviewApp.tsx` 与 `preview.css`。选择结果只写入 URL 查询参数和根元素 `data-preview-variant`，不创建会话、不修改项目、不写生产布局偏好。按钮与 `Alt + ← / →` 都可以切换；原型底部控制条明确标记为 Web Preview。

本批不修改生产 `WorkspaceShell`，不接受新的默认布局，也不改变已确认的 Chat / Workbench 两态语义。任何生产迁移都需要单独的产品确认、响应式边界和 Electron 视觉验收，不能直接复制原型 CSS。

## 验证

在 `D:\CodexW\Creatx\creat1\creatx` 执行：

```text
bun run typecheck             PASS
bun run test:preview:web      PASS
bun run build:preview:web     PASS
```

自动脚本验证三个布局按钮、`workbench-core` 的画布与 Chat 实际 Grid 列位、URL 同步和返回 `chat-focus`。同一流程继续覆盖艺术库、点子库、设置、项目菜单、斜杠 Skill、工作台文件、面板拖动和外部请求隔离。生成截图保存在 `artifacts/frontend-redesign/web-preview/`，它们是原型视觉证据，不是 Electron Live（真实运行）证据。

首次验收曾因运行中的处理区已经默认展开，而旧脚本仍无条件点击导致其被关闭并超时。测试已改为仅在尚未展开时点击；生产的“运行时保持展开”行为没有改变。
