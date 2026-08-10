# CreatX Approved Creative Skills V24

日期：2026-08-08
状态：应用内正式 Skill 自动验收通过；外部 Provider 与内容质量未 Live

## 当前批次

本批把已经由用户确认方向的三个 Prototype（原型）适配到当前主线并晋升为 CreatX 应用本地正式 Skill，同时保留已有漫画与研究能力：

1. `creatx-draw-map`：高清完整底图、同尺寸完整矩形区域 ID 蒙版、点击裁切抬升与浮窗详情。
2. `creatx-build-character-gallery`：五位著名人物加一位普通人、独立立绘与角色圣经、群像入口工作台。
3. `creatx-novel-start`：保留原稳定名称，同时支持从已有世界建立成熟故事母型、大纲和两章开篇，也兼容空项目题材启动。
4. `creatx-draw-comic`：保留 V23 小说联动、项目视觉权威、逐格生成和确定性排字合同。
5. `creatx-study`：作为额外普通研究 Skill 保留。

正式挂篮顺序为地图 → 人物 → 小说 → 漫画 → 研究。世界关系球的视觉表现仍在重新设计，现有 `creatx-build-world-constellation` 只保留为项目 Prototype，不进入正式安装、Cline allowlist 或挂篮注册表。

## 真实接入路径

- `installBuiltinCreativeSkills()` 将五个普通 Skill 安装到应用数据目录的 `creative-skills/v24/`。
- Cline Adapter 只发现安装结果中显式允许的 Skill。
- Renderer 挂篮从唯一 `QUEUEABLE_CREATIVE_SKILLS` 注册表读取五项普通 Skill。
- 用户一次性启用后只发送一条正式用户消息；同一 Cline Session 串行执行每个已选择 Skill Run，中间回复折叠，最后一轮成为正式回复。
- 地图和人物的 HTML、CSS、JavaScript、构建器与参考合同作为正式 Skill 文件包安装，不依赖运行时读取 `prototypes/`。

## 验收

- `bun test packages/creative-skills/tests/creative-skills.test.ts`：22 pass，0 fail，387 次断言。
- Creative Skills、Composer 偏好和 Cline 投影定向组合：68 pass，0 fail，501 次断言。
- `node --test prototypes/skills/creatx-build-character-gallery/tests/build-character-gallery.node-test.mjs`：2 pass，0 fail。
- 来源分支记录的 `quick_validate.py` 五 Skill 验证未在当前主线重复执行，因为验证器不在仓库内；当前主线由逐字节安装测试和真实 Cline Skill 发现合同覆盖。
- `bun run typecheck`：PASS。
- `bun test`：391 pass，0 fail，3,130 次断言。
- `bun install --frozen-lockfile`：无依赖变化。
- `bun run test:imports`：Cline import boundary 与 Node strip-types import boundary 均 PASS。
- `bun run build`：PASS。
- `bun run build:preview:web`：PASS。
- `bun run test:preview:web`：WEB PREVIEW PASS，三种布局原型和当前界面投影保持可用。
- `bun run test:desktop`：DESKTOP PASS。当前主线真实 Electron Fixture 验证 Skill 偏好会话隔离、一次性挂篮启用，以及一条用户消息对应 Study → Draw Map 两个顺序 Run；测试进程正常退出。

## 证据边界

- 本批没有调用外部 Provider（模型服务），没有新生成地图、人物、小说或漫画成品。
- Prototype 样片、Fixture（测试夹具）和自动构建结果不是 Live（真实运行）内容质量证据。
- 地图与人物的正式 Viewer 文件已安装并经过语法、合同和构建器测试，但没有在本批通过真实 Provider 生产一套新项目成品。
- 世界关系球没有生产化；研究不能冒充因果/关系表现 Skill。
- 已有未跟踪原型、样片、图片和整本运行产物均保留，没有进入本批清理范围。
- `unified-art-style` 工作树约 84MB 未跟踪样片没有复制到主线；主线保留的《九灯之夜》和角色工作台图片均来自来源提交中已跟踪的证据。

## 恢复入口

- 正式 Skill 注册：`creatx/packages/creative-skills/src/index.ts`
- 唯一挂篮注册表：`creatx/packages/creative-skills/src/skill-sequence.ts`
- 地图包：`creatx/packages/creative-skills/src/draw-map.ts`
- 人物包：`creatx/packages/creative-skills/src/character-gallery.ts`
- 小说包：`creatx/packages/creative-skills/src/novel-opening.ts`
- 产品规格：`docs/capabilities/creative-skills/product-spec.md`
- 验收矩阵：`docs/capabilities/creative-skills/acceptance.md`
