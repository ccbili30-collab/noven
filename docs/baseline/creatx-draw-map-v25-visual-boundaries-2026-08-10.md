# CreatX Draw Map V25 Visual Boundaries

日期：2026-08-10
状态：正式 Skill 打包、第二题材真实 Provider 前向复验、独立浏览器交互与生产构建通过
能力线：`creative-skills`
验收：`ACC-CSK-501..509`

## 当前批次

本批将用户认可的“清晰底图作为视觉权威，再从底图真实边界反推区域蒙版”提升为 Draw Map V25 的正式方法。正式包新增自包含 `derive-region-mask.mjs`，不依赖 Python、OpenCV、Pillow 或 Sharp；它读取原生 PNG，检查清晰度，使用内部种子与图像梯度执行标记分水岭，输出完整同尺寸 ID 蒙版、Manifest（清单）和配准审查图，并对微小区域与弱贴合失败关闭。

Viewer（查看器）继续只显示不可变原图。所有 `land` 使用同一原图裁切、金边和轻微抬升；`water` / `unknown` 原位高亮。全尺寸渲染层从“访问过的每个区域永久缓存”改为只缓存当前区域，并去除选区扫描中的逐像素十六进制字符串和临时邻居数组。

可读维护源位于 `prototypes/skills/creatx-build-interactive-map/`，`creatx/scripts/package-draw-map.ts` 机械生成正式 `draw-map.ts`。内置版本提升为 `v25`，不会覆盖既有 V24。

## 第二次独立前向复验

第二主题为“冰封海洋中的火山环形群岛文明”，没有复用第一张银河图的底图、坐标、区域计划或蒙版。底图由本会话通过真实 Codex OpenAI-compatible（OpenAI 兼容）图片 Provider 路径生成；Artifact（产物）没有记录上游模型标识，因此不能进一步声称具体模型版本。

- 原图：`artifacts/map-skill-forward-test-v25/base-map.png`，`1254×1254`，SHA-256 `765363ABA95091F034A5EB4625F0660977E9185E0B80BF8B43F60C487518E6D8`。
- 区域：32 个，其中 30 个 `land`、2 个 `water`；全部 `1,572,516` 像素有归属，最小区域 3,595 像素。
- 底图质量：动态范围 214、平均梯度 57.18、强边缘比例 0.456。
- 边界贴合：边界像素 36,114，边界平均梯度 52.75，内部平均梯度 16.41，比例 3.214；门禁为 1.25。
- 蒙版 SHA-256：`725CF5F37E551934D9E08BEDD05908033F71C748AF23E448D05B29077F28A7A2`。
- 浏览器：本机 Edge 无界面真实打开最终构建；32/32 区域逐区点击，首次选择 44–191 ms、平均 62 ms；同区再点、`Esc`、关闭按钮、卡片拖动通过，当前区域缓存匹配，控制台、页面和资源错误为 0。
- 最终截图：`artifacts/map-skill-forward-test-v25/selected-region-final.png`，SHA-256 `17BF14BBAA272214091A17AF8CF392CE6AB6F1420091F067B097EE5B330F4BD9`。

首次蒙版推导真实拒绝了 7 个仅有 1–280 像素的错误区域。修正后数值门禁虽然通过，但人工查看仍发现两个纹理复杂卫星岛被外层冰洋抢占；为每个内部视觉盆地补种后主体完整，随后又删除靠边种子消除右下岛泄漏。该过程证明数值贴合比不能代替配准图目检，并形成 V25 的多视觉盆地种子规则。

## 安装与验收

- `bun run scripts/package-draw-map.ts`：PASS，正式包共 10 个文件。
- `bun test packages/creative-skills/tests/creative-skills.test.ts`：22/22，405 次断言。
- `bun run typecheck`：PASS。
- `bun test`：480/480，3,435 次断言。
- `bun run build`：PASS。
- `git diff --check`：PASS；仅出现仓库既有的 LF/CRLF 提示。
- 隔离安装后的 `creatx-draw-map` 运行 Skill Creator `quick_validate.py`：`Skill is valid!`。
- 权威应用目录 `%APPDATA%\creatx\creative-skills\v25\creatx-draw-map` 已安装并再次通过同一校验。
- 本批调用了真实图片 Provider；全量测试与生产构建使用项目真实实现，不用 Fixture 冒充 Provider Live。

## 未完成与风险

- 没有证明所有 Provider、所有题材或每次第一次生成都能得到清晰底图。稳定合同是最多三次尝试、质量门禁和失败关闭。
- 自动指标无法证明语义区域正确，也可能漏掉局部泄漏；配准审查图和逐区浏览器点击仍是必需门禁。
- 本批验证的是 Skill 自带独立 Viewer，没有重新验收正式 Electron 工作台注册、Windows 安装包或软件内完整 Agent 一句话运行。
- 手动安装时曾把 V25 同时写入不被应用扫描的 `%APPDATA%\creative-skills\v25`。当前执行策略阻止递归清理；权威 `%APPDATA%\creatx\creative-skills\v25` 不受影响，旁路目录没有被应用注册。
- `artifacts/overnight-hermes-ring/` 与两个 `overnight-hermes` 脚本属于用户既有未跟踪内容，本批未修改或清理。

## 恢复入口

- 正式 Skill 注册与版本：`creatx/packages/creative-skills/src/index.ts`
- 正式打包内容：`creatx/packages/creative-skills/src/draw-map.ts`
- 打包生成器：`creatx/scripts/package-draw-map.ts`
- 可读 Skill：`prototypes/skills/creatx-build-interactive-map/SKILL.md`
- 蒙版推导：`prototypes/skills/creatx-build-interactive-map/scripts/derive-region-mask.mjs`
- 产品规则：`docs/capabilities/creative-skills/product-spec.md` 的 `CSK-501..507`
- 验收规则：`docs/capabilities/creative-skills/acceptance.md` 的 `ACC-CSK-501..509`
- 第二次前向证据：`artifacts/map-skill-forward-test-v25/`
