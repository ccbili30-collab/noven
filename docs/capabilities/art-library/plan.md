---
title: Art Library 第一版计划
doc_type: capability-plan
owner: art-library
status: runtime-implemented-visual-live-pending
last_verified: 2026-08-08
---

# Art Library 第一版计划

1. 建立应用数据根、目录合同、元数据验证、图片签名/尺寸检查和 SHA-256 去重。
2. 实现受控公共网络请求、Bing RSS 候选页面发现、网页图片地址提取和有界原图下载。
3. 实现候选视觉读取、标准候审提交、批准/驳回/暂缓和分类关键词导出。
4. 把应用级工具接入 Cline Adapter（适配层）并向所有普通会话提供，不创建专属会话。
5. 从打包静态 Art Atlas 幂等迁移首批正式作品和候审内容。
6. 运行定向测试、Adapter 合同测试、Typecheck（类型检查）、全量测试和 Production Build（生产构建）。
7. 记录自动证据、真实网络探针结果、视觉 Provider 边界和前端未接线状态。

2026-08-08 当前进度：步骤 1 至 5 已实现；定向测试、Typecheck、导入边界、生产构建、真实单图公网探针和构建产物中的 57+6 桌面迁移已验证。全量 430 项有 429 项通过，唯一既有 Cline Skill 预算测试在全仓负载下以 5021ms 超过 5 秒，隔离复跑 1/1 通过。桌面 Fixture 完成启动、迁移和主体交互后，在无关的活动 Owner 回合冲突处失败；外部视觉 Provider 与真实前端审批仍待后续独立验收。

停止条件：需要修改 Cline Core、无法阻断私网目标、非视觉模型仍会收到图片、审批可以被绕过、静态迁移只能依赖兄弟目录，或核心测试/Typecheck 无法恢复绿色。
