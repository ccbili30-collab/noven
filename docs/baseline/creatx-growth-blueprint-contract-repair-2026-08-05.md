# Growth World Pro Blueprint Contract Repair

日期：2026-08-05

## 范围

本批修复 Growth World Pro 前三阶段的可信阶段动作、Worker 工具权限、层级文类合同、蓝图 Issue 对账和 Provider 传输恢复。停止边界是全世界蓝图进入 `review -> waiting`；不进入第四阶段正文物化，不提交图片，不评价正文文风质量。

## 实现

- Scheduler 把可信 `stageKey` 传入 Adapter 和工具上下文；蓝图工具在任何文件、状态或工作台副作用前验证阶段动作。
- `world-blueprint` Worker Profile 的同一白名单同时控制 Cline 可见 CreatX 工具与执行 Tool Policy。模型看不到 `register_workbench`，根工作台仍由 `initialize` 经 Workbench Port 幂等建立。
- `append/amend` Schema 和执行校验都从十二层出版文类库派生；group 不接受 `genreKey`，故事层不接受历史层的 `legendary-chronicle`。
- Adapter 按 `toolCallId` 收集根工具错误，忽略同一失败的 Runtime 汇总重复；Growth V9 把 Issue 绑定到持久 stage attempt，只有可信回执及权威蓝图证据通过后才 `resolved/bypassed`。
- Live Harness 不再用字符串分类器猜测业务结果，而是直接读取生产 `growth_issue`，并拒绝未解决 Issue、重复 dedupe key、遗留 running attempt、公开 JSON、错误工作台数量或越过蓝图审查门。
- 明确的 Provider socket 关闭、连接重置和传输超时显示“模型服务连接中断”，最多执行三次同阶段恢复。普通缺回执和未知失败仍在两次后停止。

## 自动验收

在 `D:\CodexW\Creatx\creat1\creatx` 执行：

```text
bun run test:growth-store  -> 69 pass, 0 fail
bun test                   -> 266 pass, 0 fail, 1,650 assertions, 33 files
bun typecheck              -> PASS
bun run test:imports       -> PASS
bun run build              -> PASS
bun run test:desktop       -> PASS
```

Growth Store 覆盖成功、缺回执、普通异常、持久恢复、Issue 去重、可信回执对账、两次普通停止、三次 Provider 传输恢复和第三次耗尽停止。全仓 Build 使用生产 Electron 输出；Desktop 验收覆盖启动、退出、IPC、Growth 控件和持久投影。

## Provider Live

命令：

```text
bun run test:growth-world-pro-blueprint-contract-live
```

真实模型：`gpt-5.6-luna`。运行耗时 672 秒，结果：

- Goal `goal_fc4a52de-c767-4ad4-a38f-600a0f8eb10f` 最终为 `waiting v5`。
- 停止原因是“Growth World Pro 全世界蓝图草案等待用户检查；继续且没有新修正后才会冻结。”
- 3 份可信阶段回执；0 个 running attempt。
- 十二层共 248 个对象：189 个 entry、59 个 group；每层 14 至 16 个 entry。
- 43 条世界内部因果关系。
- 15 份内部蓝图证据通过生产校验；公开文件只有 `灰冠诸境/世界基准.md` 与 `灰冠诸境/资料索引.md`，公开 JSON 为 0。
- 恰好 1 个根工作台，指向 `灰冠诸境`。
- 4 个独立工具调用错误形成 4 个唯一 dedupe key，最终全部 `resolved`；没有未知错误转绿。
- Electron 由 Harness 正常关闭，无本次 Live 残留进程。

本机证据位于 `artifacts/growth-world-live/blueprint-contract/result.json`、`stopped.png` 和 `project/`。这些 Artifact（产物）是本机 Live 证据，不是产品运行时依赖。

## 未完成与风险

- 本批没有冻结蓝图、进入第四阶段、生成正文或提交图片，因此不证明完整 Pro 能一次跑完，也不证明分层文类最终正文质量。
- Live 最终成功样本没有再次触发 socket 故障；三次传输恢复有自动状态机证据，触发该分支的前序真实运行证据为两次 `UND_ERR_SOCKET` 后按旧两次边界停止。
- `gpt-5.6-luna` 在初始化期间仍产生 4 次无效工具调用。代码正确拒绝并恢复，但模型调用效率仍有改进空间，不能通过放宽蓝图合同掩盖。
