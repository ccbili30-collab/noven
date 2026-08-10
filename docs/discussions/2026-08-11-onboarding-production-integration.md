---
title: 首次引导进入生产软件的产品确认
doc_type: discussion
owner: workspace-ui
status: accepted-for-implementation
last_verified: 2026-08-11
---

# 首次引导进入生产软件的产品确认

## 用户要求

用户确认把现有 `onboarding-prototype.html?variant=spotlight` 的聚光灯教程接入正式诺文：软件第一次打开时自动播放，左下角保留入口，之后可随时重新播放。

经确认，“第一次”按本机 Profile（配置档案）解释：每个 Profile 只自动播放一次；用户点击跳过或完成后写入已看标记。中途异常退出不写标记，下次启动重新出现。左下角入口始终从第一步重播，不清除已看标记。

## 接受边界

- 复用 Prototype（原型）的 Spotlight（聚光灯）视觉、十步文案、完整能力卡和 Skill 工具箱内容。
- 正式引导覆盖真实 `WorkspaceShell`，步骤锚点绑定真实设置、项目、Composer（输入区）、工作台、艺术库、灵感库和传承库控件。
- 步骤切换可以打开真实页面，但不得自动填写 API、选择目录、发送消息、调用 Provider（模型服务）、修改项目文件或制造演示数据。
- 目标控件暂不存在时，说明卡居中显示，不伪造控件或阻塞退出。
- 生产版不带入 `PROTOTYPE` 标识、三方案切换器、Preview Fixture（预览测试夹具）或独立 URL 状态。
- Escape、跳过和最后一步完成均可退出；输入框获得焦点时不劫持空格、Enter 或方向键。

## 明确不做

- 不把教程变成 AI 对话或专属 Agent；不调用外部模型。
- 不把 Prototype 源文件直接变成生产依赖；共享内容进入明确的生产组件。
- 不在本批实现版本升级后重复播放、跨设备同步或教程进度续播。
