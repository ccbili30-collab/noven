---
title: 持久单 Worker 图片队列 Runtime 证据
doc_type: implementation-evidence
owner: image-runtime
status: task-7-runtime-verified
last_verified: 2026-07-28
source_of_truth: docs/capabilities/image-runtime/product-spec.md
---

# 持久单 Worker 图片队列 Runtime 证据

实现提交：`f540b5b`（`feat(image): add persistent generation queue`）。

## 已实现边界

`@creatx/image-runtime/queue` 新增独立 SQLite V1 Store、`ImageTaskQueue` 和 `submit_image_generation` 中立项目工具。任务只保存 `projectId`、幂等键、Prompt（提示词）、项目相对目标路径、模型、状态、分类错误和时间；不保存图片字节、绝对路径、Provider（模型服务）凭据或 Cline Run 复制体。

提交同步持久化为 `queued` 并立即返回稳定 `imageTaskId`。相同项目和幂等键的完全相同重试返回原任务，不再次调度；冲突输入失败关闭。SQLite 自增序号是 FIFO（先进先出）的唯一排序权威，单 Worker 同时最多 claim 一个 `generating`。活动或成功任务的目标路径有唯一索引，真实落盘继续复用现有 `ImageRuntime` 图片校验和 create-only `ProjectFileCommandPort`。

队列保存 `queued | generating | succeeded | failed | interrupted`，每次持久状态变化产生稳定 `image.task.changed` Event（事件）。失败保留分类和脱敏后的错误；改变 Prompt 必须使用新幂等键形成新任务。启动把遗留 `generating` 转为 `interrupted`，只恢复 `queued`；退出先持久化中断状态再 Abort 当前图片请求，迟到结果不能覆盖中断状态。

Electron Main 在图片配置完整时创建唯一 Store/Worker，同时保留原同步 `generate_image`。启动 Worker 前先从 Cline 历史恢复项目 ID 与真实路径映射；退出与 Cline Adapter 一并收敛后关闭数据库。Renderer 不读取数据库，只在成功事件后刷新现有文件投影，没有新增队列页面。

## 验收结果

2026-07-28 在 Windows、Node `24.15.0`、Bun `1.3.14` 验证：

- `bun run test:image-queue`：真实 `node:sqlite`，`11 pass / 0 fail`。
- `bun test`：CreatX Bun 全量 `75 pass / 0 fail / 220 assertions`。
- `bun run test:growth-store`：`26 pass / 0 fail`。
- `bun run test:session-runtime`：`3 pass / 0 fail`。
- `bun run typecheck`：通过。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun run build`：生产构建通过；仍有仓库既有的上级 `@tsconfig/bun/tsconfig.json` 缺失警告。
- `bun run test:desktop`：生产 Electron Main 真实初始化队列 V1 数据库，Renderer 无错误，正常退出且工作区 Electron 进程无残留。

队列测试覆盖立即返回、精确幂等重试只调度一次、FIFO/最大并发一、持久事件序列、失败历史与脱敏、新 Prompt 新任务、重启中断、queued 恢复、退出 Abort、不重提 interrupted、真实 Image Runtime/Project File Port 落盘重读、目标冲突不覆盖和未知 Schema 失败关闭。

## 未完成与限制

本批没有通过真实 Cline 调用 `submit_image_generation`，也没有发起真实 JMRAI 后台请求，因此没有证明文字 Run 与真实图片 HTTP 并行、Provider Abort 时序或可能已收费请求的外部行为。Electron 探针使用测试配置但没有网络请求；不能称为图片队列 Live。

`ACC-IMG-011`、`012`、`015` 至 `017`、`019` 获得 Runtime 证据；`ACC-IMG-013` 只通过真实本地图片校验与文件 Port、但 HTTP 为测试响应；`ACC-IMG-014` 仍是 Growth Runtime 门禁与图片状态查询的组合证据；`ACC-IMG-018` 的可见状态等待 Task 8。没有专用队列页面、多 Worker、自动重提 interrupted、图生图、图片编辑或封面绑定。

下一入口是 Dynamic Growth 计划 Task 8：把 Goal 创建、Scheduler、Lifecycle、图片任务查询和最小可见状态接入生产 Main/Renderer。Task 9 才运行完整真实 Electron Growth Live。
