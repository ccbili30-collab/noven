---
title: 首次引导生产接入设计
doc_type: design
owner: workspace-ui
status: accepted
last_verified: 2026-08-11
---

# 首次引导生产接入设计

## 产品与交互

生产引导是 `WorkspaceShell` 顶层的模态 Spotlight（聚光灯）层，不是新窗口、独立网页或假会话。十步顺序沿用已确认 Prototype：欢迎、API、项目、视频种子、工作台、艺术库、灵感库、传承库、AI 能力工具箱、完成。每一步先切换到对应真实页面，再测量稳定的 `data-onboarding` 锚点；目标存在时四块遮罩围出准确高光区，目标缺失时使用全屏遮罩和居中说明卡。遮罩阻止点击底层其他区域，但目标只用于说明，不在教程中替用户执行真实业务操作。

左下角展开导航显示“新手教程”，折叠 Rail（图标栏）显示带标题的帮助图标。首次门禁使用 Renderer 本机 `localStorage`，键为带版本的 UI 偏好，不进入项目、Cline 会话、Main Process（主进程）或 Desktop API。只有跳过、Escape 或最后一步完成才写入已看标记；左下角重播只打开第 1 步，不清除标记。引导打开的设置或资料库在结束时回到普通工作区，用户真实项目、会话、草稿和文件不变。

## 代码与验证

`OnboardingTour.tsx` 统一拥有步骤、能力目录、首次门禁解析、目标测量、键盘和卡片定位；`WorkspaceShell` 只拥有是否打开与页面切换回调；`ProjectNavigation` 只拥有重播入口。生产 CSS 从 Spotlight 原型提取并改为 `wb-onboarding-*` 命名，移除 Prototype Stamp（三方案标记）、演示艺术库和其他方案样式。

纯函数测试覆盖首次/已看/损坏存储、完成写标记、缺失目标与边界定位；Renderer 静态测试覆盖十步、左下角入口和完整 Skill 工具箱。隔离 Electron 使用全新 Profile 验证首次自动出现、页面锚点、跳过后重启不自动出现、左下角重播、Escape、普通与减弱动效以及零 Provider 调用。视觉验收至少覆盖 1600×1000 和窄窗口，确保卡片不越界、高光不截断。
