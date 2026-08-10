---
title: CreatX 传承库与工作台项目引用修复基线
doc_type: verification-baseline
owner: workspace-ui
status: bounded-electron-verified
date: 2026-08-09
---

# CreatX 传承库与工作台项目引用修复基线

## 已实现边界

- `WUI-046 / ACC-WUI-068`：内置传承库从 TypeScript 种子迁移为 `heritage-library-catalog.v1.json`，20 条目录按 `OC创作 / 艺术欣赏 / 世界观 / 图画创作` 各 5 条。分类和来源由内置目录与个人导入共同生成；个人 Profile 的导入、喜欢和收藏合同未改。
- `WUI-047 / ACC-WUI-069`：解除 `workbench-canvas` 的显式禁用，指针与方向键都调整最右工作台导航；继续复用 `creatx.workspace.panel-widths.v4`、`168–520px` 导航边界和约 `300px` 中央画布预算。
- `WUI-048 / ACC-WUI-070`：对话中的当前项目图片和相对 Markdown 文件链接复用既有 `openWorkbenchFile`、草稿保存门禁和真实 `projectId + fileId`。`文件.md#标题` 打开后滚到匹配标题；外部协议、绝对路径、查询参数、越界和不存在文件失败关闭。

没有新增 Desktop API、IPC（进程间通信）、数据库、Provider（模型服务）协议或 Cline 历史字段。

## 素材核验边界

2026-08-09 对哔哩哔哩条目通过公开 `x/web-interface/view` 元数据核对真实 BV、标题、作者、说明与封面；其余来源通过实际 HTTPS 页面、最终重定向、标题和可读取正文核对。目录摘要只记录来源页能够支持的范围；没有读取完整视频字幕的条目明确保留“只作为入口、不扩写细节”的边界。第三方链接未来仍可能下线，不等于 CreatX 已复制或永久保存来源内容。

## 验收

- 新增失败信号在生产修改前因三个缺失导出稳定失败；实现后定向 `17/17`、167 次断言通过。
- Renderer（渲染层）全套 `104/104`、514 次断言通过。
- `bun run typecheck` 通过。
- 最终状态的 `bun run typecheck` 与 `bun run build` 通过。
- 最终状态的 `bun run test:heritage-workbench-links` 使用隔离 Profile、真实临时项目和本地受控 Provider 通过：项目图片打开；`小说/正文.md#第三章` 打开并定位；外部/越界链接失败关闭；导航宽度 `252 -> 247.9375px`；中央画布 `539.65625px`；传承库四类与 20 条投影正确。
- 全量 `bun test` 为 `476/477`、3,399 次断言；唯一失败是范围外 World Materialization（世界物化）历史层回执测试在全仓负载下 `5043ms > 5000ms`，隔离复跑 `1/1`、19 次断言、`3126ms` 通过。因此不标记全量通过。
- 完整 `bun run test:desktop` 在进入本批交互前因既有 Chat 默认布局与旧 Paper Workspace 断言不一致停止；实际列宽为 `251 / 851 / 251px`，页面错误、控制台错误和失败请求均为 0。本批专用 Electron 证据不等于完整 Desktop 通过。

## 未完成与风险

- 没有调用外部 Provider，本地受控 Provider 只证明真实 Cline 消息与 Renderer 交互链。
- 没有修改或自动迁移个人传承库条目；旧自定义分类继续在动态筛选中可达。
- 外部 HTTPS Markdown 链接保持此前不可操作，只保证它们不进入工作台；是否交给系统浏览器属于后续产品决策。
- 没有打包 Windows 新版本；`0.1.17` 不含本批，也不含其前一批对话打开定位修复。
- 正式 Portable 与 `C:\Users\16014\AppData\Roaming\creatx` 未被测试关闭或修改；隔离 Electron 和临时目录残留为 0。

## 恢复入口

实现入口为：

- `creatx/apps/desktop/renderer/src/heritage-library-catalog.v1.json`
- `creatx/apps/desktop/renderer/src/heritage-library-seeds.ts`
- `creatx/apps/desktop/renderer/src/MessageMarkdown.tsx`
- `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- `creatx/scripts/electron-heritage-workbench-links-test.ts`

下一阶段若用户要求发布，先确认本批提交状态，再按独立发布批次升版、重新 Typecheck、Build、打包并对产物使用隔离 Profile 验收；不要直接启动正式 Portable。
