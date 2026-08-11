---
title: 艺术库 0.1.19 体验恢复设计
doc_type: implementation-design
owner: art-library
status: accepted-for-implementation
date: 2026-08-11
---

# 艺术库 0.1.19 体验恢复设计

## 目标与边界

恢复艺术库作为“个人艺术图鉴”的主体验，并把 63 张基础藏品安全物化到正式分类。按用户后续澄清，生产页面直接复用 `0.1.19` 提交 `285c018` 的页面、CSS 与动效，而不是在 React 中重新设计；父级 React 继续提供真实 Runtime 快照与受限图片协议，旧页面只作为展示边界。

## 数据设计

`readBundledArtAtlasSeedManifest` 从 `art-concept-data.json` 生成 63 条确定性清单，每条包含稳定 ID、原图字节与 SHA-256、来源、目标分类和可验证的旧策展元数据。分类映射只来自冻结数据中的 `groups/gallery_groups`，预期精确为 41/18/4。

迁移以新的完成标记为终态，逐条执行并允许中断重试：

1. 新 Profile：验证 63 条清单后直接写入对应正式目录。
2. 旧 seed Profile：仅迁移带匹配 seed snapshot、ID 与 SHA-256 的条目。
3. 已执行错误 reset 的 Profile：仅恢复 `source.kind=seed`、ID 与 SHA-256 全部匹配的 incoming 条目。
4. 完成前重新枚举 63 个正式条目、分类计数和来源身份；成功后才写完成标记。

任一非种子身份占用 seed ID、目标目录冲突、元数据/原图哈希变化、标记内容不匹配或分类计数不符时失败关闭。迁移不得删除或重写无法证明属于种子的目录。

基础藏品不是新版视觉模型输出，不能伪装成 `visual-curation-v1`。它们保留可识别的 bundled curation 身份；后续如果公共合同需要新增状态，必须先单独评审协议兼容性。本批优先使用现有可读的 V1 元数据与 seed 字段表达来源。

## 前端设计

生产 `ArtLibraryPage` 保留快照刷新、revision 门禁和审批命令，将首页替换为 React `ArtAtlasSurface`：

- 左侧为 `0.1.19` 的“诺文”品牌、Keats 文案与艺术图鉴说明；
- 中央为可键盘、按钮和滚轮导航的圆环作品轨道；
- 作品、分类和数量来自 `snapshot.libraries`；图片只用 `creatx-art-library://item/<id>/original`；
- 点击作品进入真实 React 详情；展览入口进入按真实分类组织的浏览界面；审批入口只显示以后新增的候审项；
- 保留关键词导出、打开 AI 对话提取风格及完整审批编辑能力；
- 支持 `prefers-reduced-motion`，减少动效时不依赖旋转动画表达状态。

视觉验收冻结在 1600×1000、DPR 1；参考为 `0.1.19` 提交 `285c018` 的 `art-atlas.html` 及现存 CSS/JS/图片资产。生产实现不读取 `window.ART_ATLAS_*`，不把静态 JSON 当作运行事实。

## 风险

最高风险是错误识别 seed 所有权并改写用户数据，因此迁移宁可阻断也不猜测。其次是恢复视觉时误删真实审批功能；验收必须同时覆盖图鉴、展览、详情、审批和导出入口。旧 HTML 截图只能证明视觉参考，不能证明真实数据接入。
