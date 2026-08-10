# NovelX 最终联合基线（2026-07-23）

## 联合边界

- 分支：`codex/novelx-final-integration`
- 起点：`7f0d2f82c6d0efa1981c58e83818609e93e0add2`
- 地图来源：`codex/novelx-map-variants@389b0e8df1a47c55d4c98a16119c076a8da1b68c`
- 世界包来源：`codex/novelx-world-package@6264ad580ed4b69c224fd4f84195ae69cda01314`
- Study 来源：`novelx-study@8b14efd6883b287901a32fc9f4529c1f10a24b50`

联合工作在新建的干净工作树中完成，没有复制任何来源工作树的未提交文件。地图线的 `prototypes/`、生成图片、预览数据和 API 凭证未进入 Git。世界包只保留 NovelX 软件内展览，没有 HTML 浏览器模板、HTML `.zib` 导出器或导出入口。

## 冲突处理

Atlas V3 首个提交只在 `packages/opencode/src/novelx/world-visual.ts` 发生一次文本冲突。最终实现保留：

- integration 的 Visual Profile（视觉注册资料）规范化、跨层无效父级脱离和缺失人文展示入口的徽记任务兜底；
- 地图线的共享 base map、每个 geography/human area 的唯一 variant、V2 可读和 V3 完整任务集；
- 风貌任务从规范化后的 `profile.scenery` 生成，避免绕过展示兜底。

`world-image-queue.ts` 沿用 integration 既有 OpenAI-compatible Provider（模型服务）解析和异步状态，并加入地图线的共享底图依赖、完整区域蒙版和显式 dy-parse 地图端点。没有加入第二套全局凭证存储。

世界包的 `novelx-resource-workspace.tsx` 自动合并，同时保留新的资源路径解析、缺失目录空态、worldPackage 投影和 `NovelXWorldPackageView`。

Study 对 Agent、命令、工具注册和 Schema 导出只做加法合并。

## 联合验收

### OpenCode

联合回归命令覆盖全部 `test/novelx`、Growth/Study 命令、NovelX 工具、Task 权限、Agent 注册和 Session 重试：

```text
200 pass / 0 fail / 826 assertions
```

地图检查点：

```text
world-image-queue + world-visual + growth-loop
14 pass / 0 fail / 51 assertions
```

Study 检查点：

```text
63 pass / 0 fail / 341 assertions
```

### App

- 地图投影：4 pass / 0 fail / 20 assertions。
- 世界包与图谱：13 pass / 0 fail / 35 assertions。
- NovelX 工作台 Playwright E2E（端到端测试）：1 pass，约 42 秒。

### 类型与构建

- `packages/opencode`: `bun run typecheck` 通过。
- `packages/app`: `bun run typecheck` 通过。
- `packages/schema`: `bun run typecheck` 通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run build` 通过。
- `packages/desktop`: `OPENCODE_CHANNEL=prod bun run package:win` 通过，产物为正式 `NovelX.exe` 与 NSIS 安装包。

没有运行仓库全量测试。

## Live 证据边界

- Growth：真实 `gpt-5.6-luna` 世界→图志纪行→人物→三章小说证据来自 integration checkpoint 对应代码；本联合头没有重新消耗 Provider 完整跑一遍。
- 地图：地图来源线使用真实 dy-parse `/api/v1/image/inpaint`，最终完整区域版本 `1 attached / 0 failed`；联合头没有重新调用，也没有完成 `gpt-image-2` 对比。
- Study：来源线以最终运行代码连续从零完成两次 Markdown 资料整理；联合头没有重新调用 Provider。
- 世界包只读取正式项目产物，不调用 Provider。

以上来源证据不能替代联合安装包的新项目完整 Live 验收。在对外宣称“一句话生成全部内容”前，仍需在本联合头新建空项目重新跑一次 Growth；图片可以异步失败或保持排队，但不得用 Fixture（测试夹具）或假图冒充 attached。

## 已知限制

- Windows 上 `bun install --frozen-lockfile` 仍可能因 `tree-sitter-powershell` 找不到 `node-gyp.cmd` 或 `@aws/durable-execution-sdk-js` 链接 `ENOENT` 返回非零。本工作树使用 `--ignore-scripts` 建立了本地依赖图；目标测试、类型检查、生产构建和 Electron 原生重建均已通过，但干净机器依赖安装仍是未解决的环境债。
- 既有 compaction 取消时序测试在本机要求 `<250ms`，但基线和联合前工作树均可测得约 500ms 以上。本批没有通过放宽阈值掩盖。
- PDF、EPUB、Office、OCR、音频与视频 Study 适配器尚未实现。
- 世界包离线导出被冻结；当前只有 NovelX 软件内权威展示。
- 地图 Image Edit 质量仍依赖模型对完整区域蒙版的服从度。

## 合并后 UI 回归修复

真实安装版本发现：打开一个 Markdown 后，持久化的 `activeFile` 会覆盖世界、故事和世界包等其他资源主视图；同时旧图志清单的视觉哈希失配会把整个世界控制器升级为错误状态。

修复后：

- 文件选择仍按项目保留，但编辑器只在文件所属的资源工作面显示；图谱和世界包永远优先显示自己的主视图。
- 世界包的数据可用判断接受世界事实、地图、图志、人物、故事或图谱中的任意正式投影，不再只依赖早期骨架。
- 蓝图和世界事实继续严格校验；图志/纪行作为可选衍生投影，哈希失配时降级为空并保留警告，不再阻断世界地图和正式事实展示。
- App 定向回归：36 pass / 0 fail / 100 assertions。
- App 与 E2E 类型检查通过。
- Playwright 工作台 E2E：1 pass；覆盖旧图志不阻断地图、打开文件后切世界/世界包不串台、返回文件面恢复原文件。

## Study 项目恢复与重命名

真实 NovelX 数据库中，Study 根会话保留了正确的项目目录，但非 Git 资料目录归属于 OpenCode 的 `global` 项目，未进入 NovelX 本地项目栏，因此正式 Study 文件与会话存在却无法从项目方块恢复。

本批仅修复 App 投影，不迁移数据库、不修改 Session 的 `project_id`、不初始化 Git：

- NovelX 工作区启动后读取全局根会话索引，只恢复未归档且 `agent=study` 的独立目录。
- 恢复时按规范化 Windows 路径去重，排除 Study 子 Agent、普通会话、归档会话和已存在项目。
- 每个恢复目录继续使用原会话与原文件路径，并加载为可切换的 NovelX 本地项目。
- 项目方块右键菜单新增“重命名”，使用只包含名称的紧凑对话框，复用既有项目元数据持久化，不混入图标、颜色或启动脚本设置。

验收：

- `novelx-workspace-model.test.ts`：19 pass / 0 fail / 44 assertions。
- App 与 E2E 类型检查通过。
- Playwright 工作台 E2E：1 pass，37.8 秒；覆盖 Study 项目自动出现、进入原 Study 会话、项目右键重命名提交，并继续执行既有世界、文件与世界包回归路径。
- 本批没有调用 Provider，没有启动或修改图片队列。
