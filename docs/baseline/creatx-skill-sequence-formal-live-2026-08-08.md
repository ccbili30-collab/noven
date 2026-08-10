---
title: Composer Skill 五项正式 Live 与 Windows 0.1.11
doc_type: baseline
status: verified-with-visual-review-boundary
date: 2026-08-08
primary_capability: creative-skills
adjacent_capabilities:
  - image-runtime
  - desktop-shell
source_branch: topic-genre-style
---

# 验收目标

验证 Composer Skill 挂篮在正式 CreatX、正式 Profile 和真实 Provider 中，能把用户的一条普通任务按五个 Skill 严格串行执行；当前项只有真实产物、必需图片和可信完成回执全部成立后才进入下一项。完整跑完的项目、会话、图片和验收记录必须保留。

# 真实运行身份

- 项目：`D:\CodexW\Creatx\skill-sequence-live`
- 会话：`1786178002600_eskup`
- 序列：`skill_sequence_1786178009558`
- 顺序：`creatx-draw-map` → `creatx-build-character-gallery` → `creatx-novel-start` → `creatx-draw-comic` → `creatx-study`
- 运行日志：`D:\CodexW\Creatx\skill-sequence-live\验收记录\skill-sequence-2026-08-08T08-33-18.492Z\run-log.json`

# 根因与修复

第一次正式运行在人物步骤停止。日志证明六张图片 Provider 请求最终全部成功，停止原因不是图片失败，而是 Agent 使用 `Start-Sleep`、目录查询和任务列表反复轮询，触发 Cline SDK 0.0.65 的 Mistake Tracker 重复工具循环保护并主动 Abort。

修复没有修改 Cline Core，也没有增加第二套图片状态机。Adapter 新增只对 `skill-sequence` 受众开放的 `wait_for_skill_sequence_images`：

- 当前步骤提交完持久图片后只调用一次。
- Runtime 只等待本步骤实际提交的任务。
- 全部成功才返回完成；`failed`、`interrupted`、`cancelled` 立即返回不完整。
- 支持用户取消，最长等待 30 分钟。
- Agent 不再使用 Shell 睡眠、目录扫描或重复列表轮询。

完成回执也补充精确重试语义：完全相同的第二次 `report_skill_sequence_step` 幂等返回第一次结果；内容不同的第二份回执仍然冲突失败。同步 `generate_image` 记录为本步骤图片证据；持久图片任务必须在步骤运行期间由该步骤提交，旧任务 ID 不可冒充本轮证据。

# 正式结果

1. 地图：`地图源/art-map-v5.png`，13 区域交互地图，工作台 `wb_7d41e200`。
2. 角色群像：`人物群像源/portraits/*-v2.png`，五位著名人物加一位普通人，6/6 图片成功，工作台 `wb_2a1a1d09`。
3. 小说：`小说/小说大纲.md`、`小说/第一章-第十三声钟.md`、`小说/第二章-七天的潮汐.md`，共 6,471 字，工作台 `wb_6fac27f6`。
4. 漫画：8/8 面板成功，`漫画/盐月沉陆-开篇两页/comic.html`、`page-01.png`、`page-02.png`，工作台 `wb_4164b6de`。
5. 研究：`研究/学习档案.md`、`研究/视觉风格与生图指南.md`，工作台 `wb_fc61cd62`。

最终图片状态为 22 succeeded、0 failed、0 interrupted、0 cancelled。五项都取得可信 `completed` 回执，最终正式 Assistant 中文汇报保留在原会话，Run 进入 `completed`。

# 辅助脚本故障边界

产品进入 `completed` 后，旧自动化尝试对完整长页面执行 `fullPage` 截图，90 秒后超时并记录 `runner_failed`，随后关闭了测试窗口。该事件发生在产品完成、最终回复持久化和 22 张图片成功之后，不推翻 Live，但暴露了验收脚本把辅助截图错误混入 Runner 终态的问题。

脚本已改为先写 `final-snapshot.json`，再只截当前视口，截图超时缩短为 30 秒；截图失败只记录 `screenshot_failed`，不覆盖产品终态，异常分支会重新打开正式软件到测试项目。这个脚本收尾修复经过 Typecheck、生产构建和全量测试，但没有为了验证截图再重跑珍贵的完整五项。

# 视觉验收边界

当前文本模型不支持图片输入。地图、人物和漫画图片只完成真实文件、队列终态、尺寸、透明度、像素方差、HTTP 可读性等程序化检查，没有进行人工视觉目检，也没有把程序化检查称为画风或构图验收。地图掩码是程序化近似对齐。后续若使用支持视觉输入的会话，应针对现有产物补充目检，不重新生成或删除本次结果。

# 自动化与构建

- Cline Adapter：104/104，372 次断言。
- 全量：404/404，3,174 次断言。
- Typecheck：PASS。
- Import Boundary：PASS。
- Production Build：PASS。
- `git diff --check`：PASS。
- 本批没有再次运行完整五项 Live。
- 隔离工作树 `bun install --frozen-lockfile`：FAIL；Bun 安装 1,361 个包后，复制 `@sap-ai-sdk/foundation-models@2.13.0` 与 `@sap-ai-sdk/orchestration@2.13.0` 的 Windows 联接时 `ENOENT`。这两个包从正式根同一锁文件、同版本的已安装副本补入隔离依赖后，提交快照的 Production Build 和 Windows 打包通过。该操作只修复验收环境，没有修改依赖合同；冻结安装仍不能标记为通过。

# Windows 0.1.11 产物

| 产物 | 字节 | SHA-256 | FileVersion | Authenticode |
| --- | ---: | --- | --- | --- |
| `creatx/release/CreatX-0.1.11-x64-Setup.exe` | 121,154,440 | `B28CFA9E934B7EE36713ED94322A9F088DB72186034A01B6DFB01F0CAD3D1D9E` | `0.1.11` | `NotSigned` |
| `creatx/release/CreatX-0.1.11-x64-Portable.exe` | 120,930,722 | `F3FFF113EB3C7B24C8428D45D49AEEFF43C1B1C2C2EB8E3DA19A374C24A198D3` | `0.1.11` | `NotSigned` |
| `creatx/release/CreatX-0.1.11-x64-Setup.exe.blockmap` | 129,485 | `BD5D6D6C0217A153501776FC08E8530246F3E65F67BAF1A07FB9992D58972D77` | — | — |
| `creatx/release/win-unpacked/CreatX.exe` | 231,522,816 | `410A315685CEE3BDE436B310BBD84E59BDA33ABD5364B1BCE56819F9543F4476` | `0.1.11` | `NotSigned` |

# 未完成与恢复入口

- 未进行支持视觉输入模型的图片人工目检。
- 未对真实网络未知结果故障做新的外部 Provider Live；持久门禁和单探针行为由自动化覆盖。
- 未用修正后的截图收尾脚本重跑五项；现有完整项目与会话是保留的权威 Live 产物。
- Bun 1.3.14 在新 Windows 工作树复制两个 SAP AI SDK 包时仍会 `ENOENT`；当前发布包使用同一锁文件和正式根的同版本已安装包完成隔离打包，后续应单独修复冻结安装可复现性。
- 恢复时先打开会话 `1786178002600_eskup`，检查最终汇报和现有工作台；不要重新发送五项任务，也不要删除 `D:\CodexW\Creatx\skill-sequence-live`。
