---
title: 艺术库 0.1.19 视觉与 63 张正式藏品恢复验收
doc_type: baseline
owner: art-library
status: runtime-electron-verified
last_verified: 2026-08-11
---

# 艺术库 0.1.19 视觉与 63 张正式藏品恢复验收

## 已实现

- `ART-030..034 / ACC-ART-033..037` 已接入当前工作树。打包内 63 张基础藏品在启动时真实物化到 `libraries/<分类>/items/<作品>/`：巨构艺术 41、暖色风格 18、纪念碑谷 4；seed 不进入 `incoming` 或 `approval`。
- 新 Profile、已执行错误 reset 的 Profile 和旧 57 approved + 6 approval Profile 使用稳定 ID、冻结 snapshot、原图 SHA-256 和确定性分类恢复；非 seed ID 冲突、原图变化和目标冲突失败关闭。用户作品、候选、候审和正式藏品不被迁移改写。
- 后续新增图片仍只走 `incoming → approval → libraries`。批准、暂缓、确认驳回、完整字段编辑、关键词导出、普通会话 AI 风格提取入口和受限图片协议均保留。
- 生产图鉴、展览和详情直接复用 Windows `0.1.19` 提交 `285c018` 的页面、CSS 与动效。`art-atlas.html`、`art-atlas-intro.js`、`art-atlas-orbit.js`、`art-concept.css`、`art-concept.js`、`art-library-concept.html` 和 `artwork-detail-concept.html` 与该提交的 Git blob 哈希逐项一致。
- 新增三个 Runtime 展示桥页面，只接受父 React 注入的当前 Runtime 投影；旧静态 JSON、iframe 内默认数据和 `localStorage` 不成为作品、分类或审批事实。桥接层同步真实 63 件总数，修复旧页面右侧进度尺残留 `57` 的演示数字。

## 自动验收

- 定向：`bun test apps/desktop/renderer/tests/art-library-page.test.tsx packages/art-library-runtime/tests/art-library-runtime.test.ts` → 32/32，181 次断言。
- Typecheck（类型检查）：`bun run typecheck` → PASS。
- Import Boundary（导入边界）：`bun run test:imports` → Cline 与 Node strip-types 两项 PASS。
- 全量：`bun test` → 601/601，4,516 次断言，82 个测试文件。
- Production Build（生产构建）：`bun run build` → Main、Preload、Renderer PASS。

## 隔离 Electron

`node --experimental-strip-types scripts/electron-art-library-test.ts` 使用临时 `--user-data-dir` 和临时项目，完成：

1. 新 Profile 启动后真实投影为 incoming 0、额外准备的三条新增候审、巨构艺术 41、暖色风格 18、纪念碑谷 4。
2. 1600×1000、DPR 1 下打开 `0.1.19` 圆环图鉴，左右总数均为 63，当前分类为巨构艺术；作品点击进入旧版详情并从旧版详情入口返回。
3. 旧版展览真实显示三类 41/18/4；新增候审作品完成批准、暂缓、失败保留草稿和确认驳回，批准后新增分类可切换并导出确定性关键词。
4. 冷启动后审批与分类持久化；在 `prefers-reduced-motion: reduce` 下再次完成图鉴、详情和展览导航。
5. 合法受限图片可加载，元数据、查询、穿越和哈希篡改原图失败关闭；所有 Electron Main PID 退出。
6. 正式 Profile 前后均为 136 个文件，摘要保持 `f8573916f0a2d68c55c979cea93100664f54a74ea543d9a2650e01e75a6e5568`；没有修改正式艺术库。

视觉证据：

- `artifacts/art-library-restoration-019-atlas-final.png`
- `artifacts/art-library-restoration-019-exhibition-final.png`

## 未完成与风险

- 本批没有调用外部视觉 Provider（模型服务），因此单图视觉整理和只凭 Prompt 重生成的内容质量边界仍沿用上一基线的 Bounded（有界）状态。
- 三种新增来源在 Electron 脚本中由真实 Service 准备，不是普通会话中由外部 Provider 自主调用工具的 Live（真实运行）证据。
- 没有生成新的 Windows 安装包或 Portable；现有 `0.1.21` 发布包不包含本工作树恢复。
- 正式 Profile 未执行迁移；安全恢复由隔离 Profile、重放与冲突失败测试证明，不能等同于用户正式数据现场迁移。
- 功能与新手引导共同进入提交 `c564192`；范围外世界蓝图、因果星图和夜间脚本修改未进入该提交。

## 恢复入口

下一步若要生成新的 Windows 版本，必须单独完成版本号、安装包与打包程序纵向验收。不得继续重画 `0.1.19` 页面，也不得把 63 张基础藏品重新送审。
