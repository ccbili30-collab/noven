---
title: CreatX 能力线索引
doc_type: capability-registry
owner: integration
status: integrated-head-current
last_verified: 2026-08-11
source_of_truth: docs/capabilities/README.md
---

# CreatX 能力线索引

能力线把聊天中确认的产品概念转换为可定位、可规划、可验收的功能入口。它按完整产品能力组织，不等同于代码目录、进程或某一层技术实现。

## 如何使用

处理需求、Bug 或设计变更前：

1. 在下表找到唯一 Primary Line（主要能力线）。
2. 阅读该能力线的 `README.md`、权威产品规格和验收矩阵。
3. 只通过链接引用相邻能力的规则，不在多条能力线重复定义同一规则。
4. 如果找不到归属，先更新本索引并指定主要能力线，再进行设计或实现。
5. 讨论记录用于追溯原意，ADR 用于解释难以逆转的选择；二者都不能代替能力规格和验收入口。

```text
用户讨论与纠正
      ↓  提升
能力线产品规格
      ↓
验收矩阵 ──→ 实现计划
      ↓           ↓
可执行测试 ← 代码与协议
      ↓
Live 证据与当前状态
```

## 当前能力线

| 能力线 | 主要拥有内容 | 状态 | 权威入口 |
| --- | --- | --- | --- |
| `provider-harness` | 固定 Cline、Provider、Adapter、中立 Tool Port、事件转换、Windows 生命周期和升级门禁 | Utility Process And Heavy History Verified（工具子进程与重型历史已验证） | `provider-harness/README.md` |
| `session` | 普通个人/项目会话、审批/自由默认与切换；未来可选的压缩继承、完整复制转移和侧聊 | Basic Session Live; Worker Retention Verified（基础会话已真实接通；Worker 留存已验证） | `session/README.md` |
| `personal-ai` | 旅鸽身份、长期关系、初次认识及身份连续性 | Planned（待整理） | 当前来源：`../discussions/2026-07-25-personal-ai-session-memory-discovery.md` |
| `memory` | 个人长期记忆、项目记忆、跨项目蒸馏、记忆校正与上下文预算 | Deferred After V1（第一版后延期） | 当前来源：`../discussions/2026-07-25-personal-ai-session-memory-discovery.md` |
| `permissions` | 未来可选的计划、审批、协作、自由四档及 Change Set（变更集） | Deferred（延期） | 当前两档由 `session/product-spec.md` 拥有；四档来源为 `../discussions/2026-07-26-first-version-priority-correction.md` |
| `creative-skills` | Skill 加载与触发、工作台协助、Growth 创作路线、Study、Living、可选择地图和因果关系网 | Owner Growth Full Run Live; Creative Routes Partially Live（Owner Growth 整本已真实运行；其他创作路线部分真实运行） | `creative-skills/README.md` |
| `growth-runtime` | Goal、Growth Run、阶段、Worker attempt、进度、问题、暂停、取消、恢复和终态 | Owner Authority Integrated; Terminal Evidence Verified（Owner 权威已集成；终态证据已验证） | `growth-runtime/README.md` |
| `project-files` | 真实项目根、Query/Command Port、目录查询与外部修改；后续版本和回收站 | Workbench File Ports Verified（工作台文件端口已验证） | `project-files/README.md` |
| `workspace-ui` | 生产主会话、审批、文件/预览和注册工作台界面 | Chat / Workbench Desktop Live（Chat / Workbench 桌面界面已真实接通） | `workspace-ui/README.md` |
| `agent-runtime` | CreatX 用户可见 Run（运行记录）、工具、取消和终态投影；执行事实由 Cline 拥有 | Skeleton Projection Live（骨架投影已接通） | `provider-harness/product-spec.md` 与 `../adr/0005-cline-is-the-sole-agent-harness.md` |
| `workbench-registry` | 内置文件工作台、`.creatx/` V1 视图元数据、注册幂等和文件夹投影 | First Vertical Live（第一纵向闭环已真实接通） | `workbench-registry/README.md` |
| `workbench-annotation` | 当前工作台可见画面的非破坏性蒙版、精确截图和待发送视觉附件 | Implementation Started（已开始实现） | `workbench-annotation/README.md` |
| `image-runtime` | 图片 Provider、Prompt、校验、项目隔离队列、真实项目落盘和文章挂接 | Single Image Live; Growth Source And Paths Verified（单图已真实接通；Growth 来源与路径已验证） | `image-runtime/README.md` |
| `video-analysis` | 抖音链接解析、下载、语音转写、可选关键帧、分析留存与学习来源回执 | Runtime And Package Verified; Provider UI Live Pending（运行时与打包已验证；Provider UI 真实链待验收） | `video-analysis/README.md` |
| `art-library` | 全局个人艺术库、联网图片采集、候审、分类审批和风格词导出 | Runtime Implemented; Visual Live Pending（运行时已实现；视觉真实验收待完成） | `art-library/README.md` |
| `desktop-runtime` | Electron 前台启动、单实例、干净退出与用户主动整应用重启；未来可选的后台继续、自动恢复、安装和更新 | User Restart Electron Live（用户主动重启已通过桌面实测） | `desktop-runtime/README.md` |
| `import-export` | 完整 Live 档案晋升；`.np` 便携项目包、案例对话、完整性校验和导入隔离 | Live Archive Live; Portable Project Accepted（真实运行档案已迁移；便携项目设计已接受） | `import-export/README.md` |

不要为了补齐表格创建空目录。只有一条能力拥有足够稳定的产品语义，或即将进入设计与实现时，才建立它的权威文档。

跨全部能力的 Cline 复用级别、唯一修改位置和禁止触及边界见 `../product/creatx-requirement-map.md`。

## 归属规则

- 一条业务规则只有一个主要能力线。
- 跨能力行为必须指定主要所有者；相邻能力只保存合同和链接。
- UI 布局不拥有领域生命周期；领域规格不重复定义像素、组件树或视觉样式。
- 通用权限规则归 `permissions`；某类会话采用什么默认权限及隔离关系归 `session`。
- 通用记忆写入、来源和容量归 `memory`；会话何时创建继承快照以及快照随谁删除归 `session`。
- 文件副作用和冲突提交归 `project-files` 或 `agent-runtime`；侧聊删除后是否回滚已生效文件属于 `session` 的用户可见语义。
- Skill 的触发、教程和创作结果归 `creative-skills`；工具权限、文件提交、图片队列和工作台组件继续由相邻能力强制。

## 文档最小结构

每条已建立的能力线至少包含：

- `README.md`：任务路由、范围、相邻合同、当前状态和阅读顺序。
- `product-spec.md`：带稳定编号的权威产品规则与未决问题。
- `acceptance.md`：用户可观察的成功、失败、取消、恢复、越权和幂等场景。
- `plan.md`：依赖顺序、可交付批次、阻塞项和停止条件。

状态机、协议、数据模型和专门测试设计只在证据需要时增加，不能预先生成空文档。
