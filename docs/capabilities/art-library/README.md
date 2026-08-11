---
title: Art Library 能力线入口
doc_type: capability-entry
owner: art-library
status: atlas-restoration-runtime-electron-verified
last_verified: 2026-08-11
source_of_truth: docs/capabilities/art-library/product-spec.md
---

# Art Library（艺术库）能力线

本能力线拥有本机个人总艺术库、候选采集、候审条目、分类目录、审批移动、拒绝删除和分类风格词导出。它横跨任何普通会话可调用的 Application Tool（应用级工具）与本机文件事实，但不拥有 Cline 会话、Provider（模型服务）、前端布局或项目作品文件。

当前产品语义来自 `../../discussions/2026-08-08-personal-art-library-tools.md`。2026-08-06 的独立艺术库 Chat 语义已经被取代。

当前 Runtime（运行时）已由 `creatx/packages/art-library-runtime` 权威实现，并注册为七个应用级工具。公网、当前回合附件和当前项目图片已共用真实候选摄入、候审、分类、驳回和确定性风格词导出后端。

2026-08-10 已实现正式化边界 `ART-018..022 / ACC-ART-015..024`：当前回合对话图片与当前项目图片汇入同一文件状态机，生产页面已由静态 iframe 改为读取真实 Runtime 快照，Renderer 只能按 ID 读取受限原图。隔离 Electron 已完成完整修订批准、暂缓、无效修订失败、确认驳回、确定性关键词导出、三次冷启动恢复和协议负向检查；正式艺术库 193 个文件的前后摘要不变。

同日视觉整理质量升级 `ART-023..029 / ACC-ART-025..032` 已进入 Runtime、工具合同、Renderer 和63条种子安全重置：单图整理分别产出作品解读、三组标签和四层反推 Prompt；分类比较获得关键词频率和代表摘要；完整人工修订可持久化；分类及个人整体风格按当前关键词由普通会话按需提取。当前最强证据仍是本地真实文件与受控 Electron，不是外部视觉 Provider Live。由于没有可用的视觉文本模型与图片 Provider 配置，`ACC-ART-025/026/029/030/032` 的模型理解与纯文字换剧情视觉保持尚未验证，能力继续标记为 Bounded（有界）而非完整 Live。

2026-08-11 用户明确纠正上述“63条种子安全重置”的产品语义：63 张均是预批准基础藏品，应真实位于巨构艺术41、暖色风格18、纪念碑谷4；审批只服务以后新增图片。`ART-030..034 / ACC-ART-033..037` 已取代 `ART-016/017 / ACC-ART-012` 的旧 reset 目标。生产界面直接复用 `0.1.19` 提交 `285c018` 的图鉴、圆环、展览、详情、CSS 和动效，通过受控展示 iframe 接收真实 Runtime 与受限图片协议提供的事实；Runtime、全量自动测试和隔离 Electron 已验收，外部视觉 Provider、正式 Profile 迁移与 Windows 打包未验证。证据见 `../../baseline/creatx-art-library-019-restoration-2026-08-11.md`。

当前证据与准确边界见 `../../baseline/creatx-art-library-visual-curation-2026-08-10.md`。Web Preview 中的艺术库数据明确是只读 Fixture（测试夹具），不得作为真实审批证据。

相邻合同：

- `provider-harness`：Cline 提供模型循环、工具调用、审批和视觉模型能力元数据；本能力不建立第二套 Agent。
- `session`：普通会话和个人会话发现应用级工具；艺术库不绑定任何会话。
- `workspace-ui`：投影真实审批和分类数据；不得继续以 `localStorage` 决定事实。
- `image-runtime`：拥有生成图片，不拥有互联网参考图采集。
- `project-files`：拥有普通创作项目文件并通过可信查询口提供收藏源字节；个人艺术库使用独立的应用数据根，不写入当前项目。

阅读顺序：`product-spec.md` → `acceptance.md` → `../../discussions/2026-08-11-art-library-restoration.md` → `../../plans/2026-08-11-art-library-restoration-design.md` → `../../plans/2026-08-11-art-library-restoration.md`。
