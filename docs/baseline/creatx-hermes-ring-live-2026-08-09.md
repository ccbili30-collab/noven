---
title: 赫尔墨斯环城外部 Provider 长跑与物化恢复证据
doc_type: baseline-evidence
owner: growth-runtime
status: verified-with-known-failures
last_verified: 2026-08-09
source_of_truth: creatx/packages/world-blueprint/src/materialization.ts
---

# 赫尔墨斯环城外部 Provider 长跑与物化恢复证据

## 范围

本批在 Windows `0.1.16` 解包应用的隔离 Profile 中，使用真实 Provider（模型服务）完成《赫尔墨斯环城》项目恢复与附属创作。项目为 `D:\CreatXProjects\赫尔墨斯环城`，Owner Session 为 `1786220338799_7mw34`，Growth Goal 为 `goal_c1861cde-cd5e-42bd-b2d6-c473b39e05c9`。文本模型是 `gpt-5.6-luna`，图片模型是 `gpt-image-2-cheap`。

本证据覆盖 `GRT-036` 至 `GRT-039` 的真实恢复路径，并为 `ACC-GRT-060` 提供第二次外部长跑输入；由于 Clean Exit（干净退出）未通过且图片队列仍有历史失败，本轮不把 `ACC-GRT-060` 标记为完整通过。

## 生产修复

真实恢复连续暴露三个同根问题：

1. 旧 `bypassed` Issue 被当作当前对象延期依据，使仍为 `ready` 的对象不再进入 Writer。
2. 用户受控重开已完成 Goal 后，旧层报告的固定 `reportId` 与新恢复内容冲突。
3. 单纯跳过旧报告会让 Scheduler 把恢复层判为“连续阶段无进度”。

权威修复位于 `creatx/packages/world-blueprint/src/materialization.ts`：只有当前状态确为 `blocked` 的对象可以被终态 disposition 延期；历史报告保持不可变，恢复层和恢复终态使用带 Goal version 的新报告 ID。没有覆盖旧报告、直接改写完成状态或用文件存在冒充可信回执。

生产修复和本证据由提交 `dcc4d43` 记录。

## Live 结果

- GWP 正文对象：`97/97 completed`，真实正文缺失 `0`。
- Markdown 图片引用：最终审计为 `111`，失效引用 `0`；审计只修复 3 个 URL 编码相对路径。
- Study：学习档案与视觉指南存在，工作台已注册。
- 六人角色 OC：6 份角色卡、6 张真实 PNG、6 个详情页和群像入口；孟桥保持普通维修工身份。
- 小说《拒动窗口》：7 章正文、大纲、README 与离线 HTML，结局已落地；状态是完整可读初稿，不是出版定稿。
- 地图：真实 `1024×1536` 底图、同尺寸 ID 掩膜、10/10 区域颜色、10 个匹配 HTML 热点和工作台。
- 条漫《五秒的方向》：两段、每段两格，共 4 张真实竖向 PNG；中文对白由 HTML/CSS 确定性叠加，避免生图乱码。
- 项目总入口：`项目总入口.html`；项目内验收清单：`赫尔墨斯环城-世界工程档案/最终验收清单.md`。
- 注册工作台共 6 个：项目总工作台、Study、角色群像、小说、交互地图和条漫。

人工目检了地图底图和 4 张漫画面板。地图使用灰绿工业结构与紫色危机锚点，作为技术图受控例外；漫画保持粗深轮廓、赛璐璐人物、灰绿工业舱与局部紫色锚点。既有 GWP 档案图没有全部重绘，不宣称全库逐图视觉统一。

## 验收

- `bun test packages/world-blueprint/tests/materialization.test.ts`：49/49，482 次断言。
- `bun run typecheck`：通过。
- 外部 Provider 原会话完成物化恢复、小说、地图、漫画和最终审计，不是 Mock（模拟）或 Fixture（测试夹具）。
- 隔离应用重启后，同一会话新的只读 Provider 回合再次核对 97/97、总入口、小说、地图、漫画、角色与 Study；Run 回到 `completed`，项目文件数为 245。

本批没有运行全量测试、Production Build（生产构建）或重新打包 Windows 产物。

## 已知失败与债务

1. 图片队列终态为 95 succeeded、1 failed、1 interrupted。失败图 `授权链与紧急改写条款.png` 是 Provider HTTP 400 / output moderation；中断图 `伊芙琳：紧急联合席议员.png` 来自历史应用重启。二者没有被伪装为成功。
2. 历史图片附件绑定会重复发出 `image_queue_conflict`，并使监督事件日志膨胀；真实创作回合没有因此失败，但监督 CDP（Chrome DevTools Protocol，浏览器调试协议）连接最终关闭。
3. 已完成的历史 `run_growth` 时间线工具项仍长期显示 `streaming`。隔离窗口未在 15 秒内优雅退出，强制关闭后 Session 暂时恢复为 `failed`；新的真实只读回合成功后自然回到 `completed`。不得直接改数据库隐藏该问题。
4. 小说仍需独立文学审校；地图与 GWP 历史技术图是受控视觉例外；条漫没有额外导出合成 PNG 页面。
5. 夜间监督脚本和 `artifacts/overnight-hermes-ring/` 是未审查的任务证据，不属于本生产修复提交。

## 恢复入口

后续优先分别诊断两项产品债务：图片队列附件绑定冲突的重复事件，以及已完成 `run_growth` 工具项在重启前不能收束。不要把二者与 Provider 图片失败合并成笼统错误。`ACC-GRT-060` 只有在完整长跑、最终截图、Prose 检查和 Clean Exit 均形成稳定证据后才能转为通过。
