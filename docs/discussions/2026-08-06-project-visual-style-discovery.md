# 项目统一视觉母版发现记录

日期：2026-08-06

## 用户意图

同一 Growth World Pro 作品中的地图、角色立绘、小说插图和漫画必须共享唯一视觉母版。视觉一致性由图片队列集中执行，不能依赖各个 Worker 手工复制提示词，也不能阻塞世界正文主链。

第三阶段蓝图确认前，在作品根形成公开文件：

`<作品根>/视觉设定/统一画风.md`

它只规定项目级视觉语言：媒介质感、色彩明暗、时代材质与工艺、建筑服饰武器、纹样象征、线条细节与构图，以及禁止出现的现代或违和元素。

## 已接受边界

- 所有异步图片继续经过 `submit_image_generation -> ImageTaskQueue`。
- 队列在首次持久化任务前读取离输出图片最近的作品根视觉母版，并保存实际发送给 Provider 的完整 Prompt。
- 类型级和单图 Prompt 可以补充内容，但不得覆盖母版。
- 精确幂等重试复用已经持久化的完整 Prompt，不因母版后来变化而冲突或再次拼接。
- 找不到母版时继续使用原 Prompt；Growth World Pro 最终汇报必须如实说明哪些图片没有应用母版。
- 第一版不升级图片队列 Schema，不增加 Provider、视觉版本状态机或自动重绘，也不修改 Renderer。

## 当前代码证据

- `ImageTaskQueue.submit` 当前直接保存 Worker Prompt，没有读取项目文件。
- `image_task.prompt` 已保存并投影实际 Provider Prompt，因此无需新增数据库字段。
- World Pro 当前以 `<正文目录>/图片/<正文同名>.png` 生成配图，能够从输出路径向上寻找作品根。
- Blueprint Worker 没有通用文件写入权限，因此《统一画风.md》必须由 `write_world_blueprint` 的第三阶段动作受信任地创建，而不是开放额外写权限。
- Owner 最终汇报由 World Materialization 的图片证据生成，可根据持久 Prompt 是否带母版标记报告遗漏。

## 后续但不在本批

- 正文与对应图片的工作台组合展示。
- World Pro 完成后自动衔接世界因果、地图、主要角色、小说与漫画的后继 Goal。
