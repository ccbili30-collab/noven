# Skill Sequence 运行恢复与统一视觉入口基线

日期：2026-08-08

## 已实现

- Composer Skill Sequence（输入框技能序列）继续使用普通 Session 的十二次单 Turn 预算，但把预算触顶解释为内部执行片段结束；同一 Skill 最多自动续跑四个片段。
- 自动续轮沿用同一 Cline Session（会话）和真实历史，内部 Prompt 明确要求读取成功工具结果与项目文件，不重复已成功副作用；用户原话只投影一次。
- Cline SDK 将十二次工具调用后的上限错误折叠为 `finishReason: error`。Adapter 只在“迭代数达到预算且成功工具调用数覆盖每次迭代”时识别为预算边界，避免把恰好发生在第十二次的普通 Provider（模型服务）失败误判为可恢复上限。
- 每个 Skill 完成后才进入下一 Skill；四个片段仍未完成时停止后续 Skill，返回已完成、当前部分完成、未启动及片段数的结构化结果，不伪装整体成功。
- Adapter 创建时先执行 Cline 正式 stale reconcile；恢复具体 Session 前先读取 SQLite 权威记录。旧 PID 已死亡时，以条件更新接管 SQLite 与 Session Manifest；旧 PID 仍存活或所有权中途变化时，在 Provider 与工具副作用前失败关闭。
- 同步 `generate_image` 与持久 `ImageTaskQueue` 现共用 `visual-prompt.ts`。两者从目标路径向上选择最近《统一画风.md》，防止重复拼接；缺失、空白、无法读取或项目刷新失败时继续原 Prompt。同步结果准确返回 `visualStyleApplied`，队列继续保存 Provider 实收完整 Prompt。

## 验收证据

- 本地真实 Cline 链路：同一普通 Turn 真实执行十二次自动批准工具，触发 Cline 上限后自动续轮，再进入第二个 Skill；一条正式用户消息、零未解决 Runtime 红错、最终 `completed`。
- `bun typecheck`：通过。
- `bun run test:imports`：Cline Import Boundary 与 Node Strip Types Boundary 通过。
- `bun test --timeout 30000`：397/397，通过，3,157 次断言。
- `node --experimental-transform-types --test packages/cline-adapter/tests/session-process-claim.node-test.ts`：2/2，通过。
- `node --experimental-transform-types --test packages/image-runtime/tests/queue.node-test.ts`：33/33，通过。
- `bun test tests/image-runtime.test.ts`：19/19，通过，62 次断言。
- `bun run build`：Electron Main、Preload 与 Renderer Production Build 通过。
- `git diff --check`：通过。

上述 Cline 验收使用本地确定性 Provider 响应，但运行了真实 Cline 模型循环、十二次真实 CreatX 工具执行、消息持久化与自动续轮；没有调用外部 Provider，不能替代真实地图、人物、小说和漫画的内容质量长跑。

## 未完成与风险

- 四个片段仍耗尽时，Adapter 已停止后续 Skill 并形成结构化未完成结果，Renderer 当前只保留 `unknown / 结果未知` 状态；专门的黄色详情卡与跨重启的可读未完成摘要尚未实现。因此 `ACC-CSK-015` 的运行门禁已覆盖，用户可读详情尚未完整闭环。
- 应用退出或崩溃不会自动重放活动工具；用户需在原会话发送“继续”。根据历史精确选择未完成 Skill 的重启路由仍是后续恢复批次。
- 没有修改 Cline Core、图片数据库 Schema、Renderer、正式 Profile、现有作品或发布包；没有重跑整本 GWP，也没有删除任何整本产物。
- 世界星图继续冻结，不属于本批。

## 恢复入口

- 产品与故障讨论：`docs/discussions/2026-08-08-skill-sequence-runtime-recovery.md`
- Creative Skills：`docs/capabilities/creative-skills/`
- Provider Harness：`docs/capabilities/provider-harness/`
- Image Runtime：`docs/capabilities/image-runtime/`
- Adapter 实现：`creatx/packages/cline-adapter/src/index.ts`
- 视觉 Prompt 权威：`creatx/packages/image-runtime/src/visual-prompt.ts`
