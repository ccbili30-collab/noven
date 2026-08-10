---
title: Cline 外部文件引用兼容性证据
doc_type: implementation-evidence
owner: provider-harness
status: task-2-runtime-verified
last_verified: 2026-07-28
source_of_truth: docs/plans/2026-07-28-frontend-electron-interface-handoff.md
---

# Cline 外部文件引用兼容性证据

## 已实现边界

`@creatx/cline-adapter` 的普通发送和 Steer 现在接受中立的只读 `userFiles` 路径数组，并只在 Adapter 内转换为 Cline SDK `0.0.65` 的公开 `CoreSessionService.send({ userFiles })` 输入。Renderer、Main 和共享消息合同尚未接入附件。

Adapter 在启动 Provider（模型服务）请求前要求每个显式附件路径为绝对路径、指向真实普通文件且可读取。缺失文件、目录或无法读取的文件分别形成 `attachment_missing`、`attachment_unreadable` 或 `attachment_invalid`，不会依赖 Cline 把读取错误包装成 file block 后继续请求 Provider。

确定性集成测试使用真实 Cline Core、SQLite、Windows 中文临时路径和真实文件加载器，只替换远端 DeepSeek SSE 响应。捕获的真实 Provider 请求包含标准化 Windows 路径和源文件正文；项目目录与 Cline 数据目录都没有出现同名文件副本。Cline 消息历史仍由 Cline 独占，CreatX 没有建立附件内容数据库。

## 验收结果

2026-07-28 在 Windows、Bun `1.3.14` 验证：

- `bun test packages/cline-adapter/tests/attachments.test.ts packages/contracts/tests/errors.test.ts`：`25 pass / 0 fail / 33 expect() calls`，其中附件兼容测试 `2/2`。
- `bun run test:imports`：`Cline import boundary: PASS`。
- `bun run typecheck`：通过。

测试首次按 Red-Green-Refactor（红-绿-重构）执行时，两个附件场景均失败：Adapter 忽略 `userFiles`，缺失文件也未失败关闭。接入公开合同和预检后，同一测试通过。

## 未完成与限制

本证据不是 Electron 或真实 Provider Live（真实运行）。测试替换了远端模型响应，没有证明真实 DeepSeek 能基于附件完成创作。

尚未实现原生文件选择、进程内授权 Token、选择后文件变化门禁、附件移除、发送/Steer 公共命令、历史附件 Projection（投影）和安全打开历史附件。Task 2 只证明 Cline 原始消息/Provider 输入会形成 file block；稳定 `MessageProjection.attachments` 必须与 Task 3 的真实 Main Handler 一起加入，不能提前公开半套 Desktop API。

文件预检与 Cline 实际读取之间仍存在很小的文件系统竞态。Task 3 必须在 Main 解析授权 Token 时重新校验大小和修改时间，并在 Adapter 进入 Cline 前再次读取失败关闭；不得用 Cline 的错误内容 file block 冒充成功附件。

下一入口是 `docs/plans/2026-07-28-frontend-electron-interface-handoff.md` Task 3：实现 Electron 文件选择授权、稳定合同、Main/Preload、Renderer 和历史链接闭环。
