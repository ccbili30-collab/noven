# CreatX 完整 Live 档案晋升证据

日期：2026-08-06

## 验收对象

- 源项目：`D:\CodexCache\Temp\CreatX Pro 全链实跑 nOIEx8`
- 源隔离 Profile：`D:\CodexCache\Temp\CreatX Pro 全链用户数据 OBvv9u`
- Goal：`goal_91a30e03-4832-4fc8-a2cb-45d4151edcb0`
- Owner：`1786011824234_7atom`
- 正式 Profile：`C:\Users\16014\AppData\Roaming\creatx`
- 正式项目：`C:\Users\16014\AppData\Roaming\creatx\creatx\projects\live-tests\太衡界世界`
- 新 Project ID：`aa56341087d409ac0535`

第二个历史整本：

- 源项目：`D:\CodexCache\Temp\CreatX Pro 全链实跑 qQikl2`
- 源隔离 Profile：`D:\CodexCache\Temp\CreatX Pro 全链用户数据 wySQry`
- Goal：`goal_03236e7a-d62d-4dfc-9e5f-c6efea7376cb`
- Owner：`1785897255513_598te`
- 正式项目：`C:\Users\16014\AppData\Roaming\creatx\creatx\projects\live-tests\灰冠诸境`
- 新 Project ID：`f4db8935e6fb08baf8e2`

## 真实结果

- 472 个项目文件进入持久项目区。
- 201 条 Cline 会话进入正式会话权威：Owner 1、Worker 200；151 completed、50 failed。
- 会话 `cwd`、`workspace_root`、`messages_path` 和 `metadata_json.creatxProjectId` 已统一重映射；本档案旧临时路径计数为 0。
- Owner 最终 Assistant 回复可从正式 `messages_path` 读取，内容以“太衡界世界创作完成”开头。
- 正式 Growth 保存 1 个 completed Goal、17 个 reported stage attempt、17 份 report receipt 和 70 个 Issue：64 bypassed、5 resolved、1 needs_help。
- 正式图片队列保存 97 个任务：67 succeeded、6 failed、24 interrupted；其中 23 个源 queued 任务按费用边界转为 `image_archive_interrupted`。正式项目没有 queued 或 generating 图片任务。
- Owner 会话权限保持 project/free。
- Inbox 晋升后移动到 `creatx/live-archives/completed`，原源项目和源隔离 Profile 均仍存在。
- 新构建 CreatX 使用正式 Profile 启动成功，并保持运行。

《灰冠诸境》历史整本同时完成兼容迁移：

- 688 个项目文件和 292 条 Cline 会话进入正式产品：Owner 1、Worker 291；91 completed、200 failed、Owner 1 idle。
- 源 Growth Schema 早于 `owner_reply_pending`，归档器未修改源库，而是在 Inbox SQLite 快照上迁移到当前 Schema。
- 正式 Growth 保存 1 个 completed Goal、23 个 stage attempt（18 reported、5 missing）、18 份 report receipt 和 208 个 Issue（195 bypassed、13 resolved）。
- 141 个图片任务完整保留：102 succeeded、38 failed、1 interrupted；无 queued/generating。
- 正式档案旧临时路径为 0；Owner 的后续问答和最后可见 Assistant 文本均保留。第一次接收由旧 Build 拒绝并留下 `failure.json`，重新构建后同一 Inbox 自动重试成功，没有重新导出或产生半套正式记录。
- 两个源整本项目和两个源隔离 Profile 均仍存在。

## 自动验收

- `bun install --frozen-lockfile`：通过。
- `bun run typecheck`：通过。
- `bun run test:imports`：通过。
- `bun run test`：319/319，通过，2,937 次断言。
- `bun run test:live-archive`：4/4，通过。
- `bun run build`：通过。
- 《太衡界世界》的 201 会话、70 Issue、17 回执、97 图片任务先在全新临时目标 Profile 完成迁移与精确重复导入，再进入正式 Profile。
- 《灰冠诸境》的旧 Schema、292 会话、208 Issue、18 回执和 141 图片任务先在全新临时目标 Profile 完成兼容迁移，再由正式 Inbox 的失败保留与启动重试完成真实恢复。

## 没有声称的内容

- 本批没有再次调用外部文本或图片 Provider。
- 本批没有重新跑一整本 Growth；晋升的是已经完成并保留的 Live 运行。
- 普通项目导出、跨设备分享、选择性会话导入尚未实现。
- 单个 Inbox 失败会写 `failure.json` 并允许桌面继续启动；第一版尚未在 Renderer 提供归档失败管理界面。
