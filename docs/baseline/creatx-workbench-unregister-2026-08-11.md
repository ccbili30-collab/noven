---
title: 工作台注销入口自动化基线
doc_type: baseline
status: runtime-and-build-verified-provider-electron-open
date: 2026-08-11
primary_capability: workbench-registry
acceptance:
  - ACC-WBR-032
  - ACC-WBR-033
  - ACC-WBR-034
  - ACC-WBR-035
---

# 工作台注销入口自动化基线

## 已实现

- `ProjectInternalStatePort.deleteFile` 只删除受控命名空间内的普通文件，并以读取时 `modifiedAt` 阻塞过期、缺失、符号链接或越界目标。
- `WorkbenchCommandPort.unregister` 与 `unregister_workbench` 删除唯一匹配的注册 JSON，不删除或修改真实项目目录；合法 `ready` 与 `missing` 工作台均支持。
- 内置、未知、损坏、重复冲突和并发变化目标失败关闭。工具为项目作用域、`ordinary` Audience（普通会话受众）且需要原生审批。
- Desktop Runtime 注册新工具；Renderer 在刷新后的投影确认当前工作台消失时清除交互展示并回退 `builtin:files`。
- AI 系统指导明确区分“移除入口”和“删除内容”，审批卡显示“移除工作台入口”。

## 验收

- 联合定向：180/180，通过，1,300 次断言。
- 全量：598/598，通过，4,495 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项通过。
- `bun run build`：通过；正式 Main 与 Renderer 产物生成。
- 没有调用外部 Provider（模型服务），没有运行 Electron（桌面运行壳）原生审批、注销刷新或重启恢复视觉验收。

## 边界与风险

- 本批不提供 Renderer 手动注销按钮、批量注销、重新定位、损坏记录修复、真实目录删除或回收站。
- 元数据删除使用应用内项目级串行门禁和修改时间冲突检查；它与当前内部状态写入采用同一外部并发信任边界，不声称提供跨进程事务。
- 自动化证明工具贡献与审批策略存在，但不构成真实 Provider 自主选择该工具的 Live（真实运行）证据。

## 恢复入口

后续若补真实 Live，使用隔离项目创建两个工作台，分别验证保留目录注销与目录外部删除后的 `missing` 注销；审批前后检查 `.creatx/workbenches`、真实内容、Renderer 回退、重启和残留进程。
