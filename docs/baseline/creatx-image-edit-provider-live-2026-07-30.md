---
title: CreatX 图片编辑接口 Provider Live 证据
doc_type: live-evidence
owner: image-runtime
status: one-model-pass-one-model-unknown
date: 2026-07-30
---

# CreatX 图片编辑接口 Provider Live 证据

## 范围

本批新增项目作用域 `edit_image` Tool（工具）及 `ImageRuntime.editToProject`。输入为项目内底图、项目内带 Alpha 的 PNG 蒙版、Prompt（提示词）、新输出路径和模型。Runtime 读取并验证真实项目字节，以 Data URL 调用 JMRAI `/images/generations` 的 `image + mask` 兼容形式，再通过 Project File Command Port create-only（仅新建）落盘并重读一致。

这不是 Electron、地图热点、地图 Manifest（清单）、多地区队列或完整 `/draw-map` Live（真实运行）。

## 真实调用

命令：

```powershell
bun run test:image-edit-live
$env:CREATX_IMAGE_EDIT_MODEL = 'gpt-image-2'
bun run test:image-edit-live
```

共同输入：

- 底图：`artifacts/map-skill-pilot/base-map.png`，490,182 字节；
- Alpha PNG 粗蒙版：`artifacts/map-skill-pilot/rough-control-mask.png`，25,565 字节；
- Prompt：只自然高亮蒙版山地并尽量保留其他地图内容。

| 模型 | Runtime 结果 | Provider 结果 | 视觉结论 |
| --- | --- | --- | --- |
| `gpt-image-2-cheap` | Result Unknown（结果未知） | 请求约 60 秒后连接重置，无输出文件 | 不自动重试；此前独立 Pilot 曾成功返回并较好保持构图，但本次正式接口没有完成证据 |
| `gpt-image-2` | PASS | Base64 PNG，3,482,029 字节，1536×1024，项目落盘与重读一致 | 模型整体重绘成另一张地图，只保留中央山地高亮语义，不满足严格配准 |

标准模型原始结果保存为 `artifacts/map-skill-pilot/gpt-image-2-natural-highlight.png`。它证明模型接受底图与蒙版输入，不证明蒙版外像素、原地图文字、地形或画布尺寸得到保留。

## 自动验收

- `packages/image-runtime`：`15 pass / 0 fail / 50 assertions`；
- `packages/creative-skills`：`10 pass / 0 fail / 168 assertions`；
- `bun run typecheck`：通过；
- `bun run test:imports`：Cline Import Boundary（引入边界）通过；
- `bun run build`：生产 Electron 构建通过；Vite 仍报告仓库既有的 `@tsconfig/bun/tsconfig.json` 基础配置解析警告，但没有阻断构建。

测试覆盖项目身份、严格工具字段、项目相对输入、Data URL 请求、Alpha PNG 门禁、输出 create-only、重读一致、Growth 禁用以及连接断开分类为 `image_result_unknown`。

## 已知边界

- JMRAI 的标准 `/images/edits` 在先前 Pilot 中连续被远端重置，当前只接已验证过一次成功的 `/images/generations` 兼容字段。
- `image + mask` 属于该中转当前观察到的兼容行为，不是已获得官方稳定性承诺的协议。
- Provider 可以改变尺寸、裁切、文字与整张地图。`edit_image` 表示编辑请求和真实输出，不保证精确局部编辑。
- 同步请求断开可能已经产生费用，因此归类为结果未知并禁止自动重试。
- Growth 图片队列尚不支持底图和蒙版；活动 Growth 中 `edit_image` 请求前失败关闭。
- 本批没有在真实 Electron 中让 Cline 自主调用并审批 `edit_image`。
