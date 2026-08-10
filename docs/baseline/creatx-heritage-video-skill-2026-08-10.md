# 传承库视频学习与 Skill 安装基线（2026-08-10）

## 实现范围

- `CSK-329..331 / ACC-CSK-386..389`：传承库每个创作用途置顶一条具有真实英文 Transcript（字幕转录）的 TED 视频。
- 用户从详情页选择普通项目会话后，请求进入可见对话；Agent（智能体）必须先调用 `read_heritage_video_transcript`，同一会话取得匹配字幕后才能调用 `install_heritage_skill`。
- 字幕工具只接受固定 TED HTTPS 地址，禁止重定向，限制 1 MB / 20 秒并支持取消；无字幕、身份不一致、非英文或非 HTML 均失败关闭。
- Learned Skill（学习技能）只有一个 `SKILL.md`，严格校验名称、描述、Frontmatter（头部元数据）、精确来源、大小和目录身份；同内容幂等，同名异内容拒绝覆盖，使用原子 create-only 写入。
- 安装沿用普通会话现有权限：审批模式显示 Native Approval（原生审批），自由模式沿用用户已选择的自动批准。启动发现把合法 Learned Skills 合并进唯一 Cline SDK `0.0.65` Skill Runtime（技能运行时）；安装后需要重启诺文，不宣称热加载。

安装位置：

```text
userData/creatx/learned-skills/v1/<name>/SKILL.md
```

## 真实来源证据

2026-08-10 使用生产 `HeritageSkillService` 从真实 TED 页面重新读取：

| 用途 | 视频 | Cue（字幕片段） | 字幕字符 |
|---|---|---:|---:|
| OC创作 | Andrew Stanton — The clues to a great story | 415 | 18,587 |
| 艺术欣赏 | Tracy Chevalier — Finding the story inside the painting | 281 | 14,838 |
| 世界观 | Kate Messner — How to build a fictional world | 105 | 5,331 |
| 图画创作 | David Carson — Design and discovery | 452 | 23,639 |

现有目录内 11 条哔哩哔哩视频经公开接口核对均没有公开字幕，因此保留为不可学习来源，没有根据标题或封面伪造方法。

## 验收结果

- 定向：`bun test apps/desktop/renderer/tests/heritage-library-seeds.test.ts apps/desktop/tests/heritage-skill-service.test.ts apps/desktop/renderer/tests/heritage-video-skill.test.ts apps/desktop/renderer/tests/creative-library-share-dialog.test.tsx`
  - 12/12，通过；172 次断言。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 两项导入边界通过。
- `bun run build`：Production Build（生产构建）通过。
- `bun run test:heritage-video-skill`：隔离 Electron（桌面运行壳）通过。
  - “全部”视图前四条为四类 TED 可学习来源。
  - 请求通过真实会话分享链进入普通对话。
  - 生产字幕工具读取真实 TED 页面。
  - 本地受控 Provider（模型服务）按读字幕、提交安装、最终回复三轮驱动唯一 Cline Runtime。
  - 审批模式显示并通过原生安装审批。
  - 隔离 `userData` 写入的 `SKILL.md` 与审批字节完全一致。
- 冻结全量：`bun run test`
  - 528/531 通过；3 个 `world materialization` 测试在全仓负载下于约 5.0–5.1 秒触发固定超时，没有断言失败。
  - 隔离 `bun test packages/world-blueprint/tests/materialization.test.ts` 为 49/49 通过、482 次断言；三项原超时测试分别约 1.71、1.87、1.71 秒。
- `git diff --check`：通过。

## 未完成与风险

- 没有使用外部文本 Provider 评价“AI 提炼的方法是否优质”；本地受控 Provider 只证明协议、顺序、审批和持久化闭环，不能称内容质量 Live（真实运行）。
- 第一版不下载原视频，不做音频转写、关键帧视觉学习、平台登录、热加载、更新、卸载或跨设备同步。
- 启动发现、Allowlist（允许列表）合并和损坏/符号链接目录排除由真实文件测试覆盖；本批没有再启动第二个 Electron 实例验证重启后的 Skill 调用。
- 未运行 Windows 打包或安装包验收。
- 最终全量不是全绿；当前证据支持“范围外负载超时、隔离通过”，不等于已经消除该测试预算风险。
- 尝试复用既有 `test:heritage-workbench-links` 时，在进入本批传承页面前被旧工作台键盘分隔线断言拦截：`before=252 / after=252 / canvasWidth=533`。该范围外问题未在本批放宽或修复；本批改用独立 Electron 验收，原脚本保持原样。

## 恢复入口

- 产品与验收：`docs/capabilities/creative-skills/product-spec.md`、`docs/capabilities/creative-skills/acceptance.md`、`docs/capabilities/workspace-ui/product-spec.md`、`docs/capabilities/workspace-ui/acceptance.md`。
- 运行权威：`creatx/apps/desktop/src/heritage-skill-service.ts`。
- UI 与目录：`creatx/apps/desktop/renderer/src/HeritageLibraryPage.tsx`、`creatx/apps/desktop/renderer/src/heritage-library-catalog.v1.json`。
- 真实 Electron 验收：`creatx/scripts/electron-heritage-video-skill-test.ts`。
