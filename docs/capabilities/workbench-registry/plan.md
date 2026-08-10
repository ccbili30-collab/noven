---
title: Workbench Registry 实现计划
doc_type: capability-plan
owner: workbench-registry
status: first-vertical-live-followups-open
last_verified: 2026-08-10
---

# Workbench Registry 实现计划

第一条骨架只投影不需要注册的文件表面，并把同一文件交给窄文件面板和简单预览。ADR-0007 已冻结注册工作台 V1 Schema 和首批 AI 入口。

状态：内置文件/预览链已由提交 `c9a4ae4` 完成；共享 File/Tool Port 已由 `f289dd3` 完成；第一条注册纵向闭环已经实现并通过真实 Electron Provider 验收。证据见 `../../baseline/creatx-register-workbench-live-2026-07-27.md`。

已完成的实施入口是 `../../plans/2026-07-27-register-workbench-vertical-slice.md`。实际顺序为：

```text
补 Project File 安全目录查询与 create-only 写入
→ Workbench Query/Command Port 与严格 V1 Loader
→ register_workbench 中立工具
→ Cline 原生审批与项目身份
→ Desktop API 工作台 Projection
→ Renderer 独立工作台标签和通用文件夹视图
→ 真实 Electron Provider 注册与重启恢复
```

图片、封面、复杂布局、Watcher、版本历史、回收站、手动注册和多个 Creative Skill 不进入该计划。

下一批不得继续按本计划扩张；必须选择尚未完整 Live 的失败路径、注册工作台文件预览，或新的独立产品需求并重新确定范围。

## 2026-08-10 V3 可见范围批次

新的独立产品需求已路由为 `WBR-017..019 / ACC-WBR-025..031`。实现顺序为：

```text
确认自动规则与冻结清单语义
→ 严格 V3 Schema 与兼容边界
→ 路径模式和唯一投影匹配器
→ set_workbench_visibility 中立工具
→ Desktop Runtime 注册与系统指导
→ 定向、全量与生产构建验收
```

本批不增加 Renderer 配置界面，不修改 `WorkbenchProjection`，不允许直接编辑 `.creatx`。外部 Provider 自主选择工具是后续独立 Live 验收，不以单元测试或受控直接调用替代。
