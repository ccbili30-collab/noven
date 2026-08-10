# Owner Growth 整本内容 Live 与投影返修证据

日期：2026-08-06。

状态：整本内容真实完成；终态 Live 验证不完整；投影和 Owner 汇报返修只有定向自动证据，尚未第二次外部整本复验。

## 目标与边界

本轮验证一句显式 `/growth_world_pro` 是否能够由同一个 Owner连续推进四阶段，生成十二层真实文件并在原对话完成交付。图片是异步后台任务，非必需图片失败不得阻塞正文。

本轮不实现项目级统一视觉母版，不升级图片队列 Schema，不清理或覆盖任何已经整本完成的运行。

## 外部 Provider 整本运行

命令：

```powershell
Set-Location 'D:\CodexW\Creatx\creat1\creatx'
bun run test:growth-world-pro-full-live -- --fresh
```

受保护路径：

- 项目：`D:\CodexCache\Temp\CreatX Pro 全链实跑 BVQ8JM`
- 用户数据：`D:\CodexCache\Temp\CreatX Pro 全链用户数据 aps04E`
- 证据：`D:\CodexW\Creatx\creat1\artifacts\growth-world-live\full-materialization\2026-08-05T23-57-06-288Z`
- Goal：`goal_a1864c88-ded6-4bd1-a067-4b1f48107c84`
- Owner Session：`1785974229761_oot07`

持久结果：

- Goal：`completed v19`，`owner_reply_pending=0`。
- 十二层正文：`181 / 181`。
- 研究简报、正文回执、事实抽取：各 181 份。
- 正文总大小：1,816,872 bytes。
- 重复正文 SHA-256 组：0。
- 公开机器 JSON：0。
- 图片任务：181；其中 153 succeeded、8 failed、19 queued、1 generating。
- 工具校验错误：43；非法首稿均未计为完成。
- Issue：17 resolved、207 bypassed。

证据目录中的 `preserved-run.json` 和 `offline-verification.json` 已确认存在。完整项目、会话、用户数据、数据库和证据不得删除或覆盖。

## 未通过的 Live 门禁

Goal 数据库约在 `03:57:12Z` 完成，桌面投影直到约 `04:06:55Z` 才显示 completed，延迟约 591 秒。观察器在终态刚恢复时被终止，没有生成 `result.json`、最终截图、Prose 全量检查和 Clean Exit证据。

旧 Owner 正式回复还同时出现两个用户可见错误：把回复落库前的内部状态写成 `Growth 状态：active`，并遗漏 28 个当时尚未成功的图片任务。因此本次证据只能标记：

```text
content_complete_live_verification_incomplete
```

## 根因与返修

生产端此前对每次物化进度变化都串行执行一次完整 `projectGrowthGoal()`。同一 Goal版本的大量进度事件没有合并，而每次投影都读取和解析完整物化状态，最终 completed 快照排在数百个过期快照之后。

返修后：

- `GrowthProjectionDispatcher` 对同一 Goal只保留当前投影和最新脏更新；不同 Goal独立；单次错误不丢后续最新更新；Shutdown 可以等待排空。
- 完整 Live脚本用 `readGrowthGoal()` 轮询单个 Goal，不再每两秒执行重量级 `bootstrap()`。
- `GrowthOwnerControllerResult` 保留 `goalStatus` 作为回复提交前的 Store 校验事实，并新增 `deliveryGoalStatus` 表示用户交付后的终态。
- World Pro 物化层通过唯一 `finalSummary()` 形成可信 `ownerSummary`；Owner 指引必须准确汇报未完成正文和图片，不能暴露内部 active。

## 返修后自动验收

- Growth Runtime：119 / 119，PASS。
- World Materialization：34 / 34，360 次断言，PASS。
- Cline Adapter 与投影：69 / 69，230 次断言，PASS。
- Projection Dispatcher：2 / 2，PASS。
- 全量 `bun run test`：299 / 299，1,843 次断言，PASS。
- `bun run typecheck`：PASS。
- `bun run test:imports`：PASS。
- `bun run build`：PASS。
- `bun run test:desktop`：PASS；真实 Electron 覆盖 Growth 等待、精确重试、Renderer 未决请求恢复、继续、取消、三秒终态折叠、活动 Goal退出暂停和重启保持暂停，进程正常退出。
- 定向 `git diff --check`：PASS。

这些结果没有再次调用外部 Provider，不能替代 ACC-GRT-060 的第二次整本 Live。

## 恢复入口

1. 冻结并提交本轮 Owner Relay、投影合并、Owner 汇总、规格和测试。
2. 使用新的项目、用户数据和证据目录执行第二次整本 Live；不得复用或覆盖当前受保护运行。
3. 必须取得及时终态投影、原会话正式回复、准确图片汇报、`result.json`、最终截图、Prose 检查和 Clean Exit，才能把整条新线路标记全量 PASS。
4. 主链通过后，项目级统一视觉母版才能进入独立生产批次。
