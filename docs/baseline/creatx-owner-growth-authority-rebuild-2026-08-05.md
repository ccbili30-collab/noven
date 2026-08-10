# CreatX Owner Growth Authority Rebuild

日期：2026-08-05。

状态：生产实现与受控 Provider（模型服务）/Electron 验收通过；外部 Provider 长跑 Live（真实运行）尚未执行。

## 目标链路

```text
Owner Conversation
-> 持久化显式 /growth* 用户消息
-> 绑定 Owner 的 Growth Run
-> 有界 Child Workers
-> 子结果正式回到 Owner Turn
-> 真实项目文件由工作台展示
-> Owner Assistant 正式最终回复
-> Goal 终态后活动折叠
-> 普通追问读取同一 Cline 历史
```

本批重建的首要目标是让 Growth 能稳定跑通并交付可读作品。Cline SDK `0.0.65` 仍是唯一 Agent Harness（智能体运行框架），没有修改 Cline Core、写入 Cline 私有数据库、增加第二消息库或用 Renderer 伪造 Owner 回复。

## 权威边界

- Cline Conversation 唯一拥有用户消息、Assistant 回复、Provider Turn、工具调用、工具结果和后续对话上下文。
- Growth Runtime 唯一拥有 Goal、阶段、attempt、进度、等待、恢复、取消和终态。
- Project Files 唯一拥有作品正文、图片、索引、工作台元数据和用户编辑结果。
- Renderer 只投影上述权威事实，不创建消息事实，也不把 Worker 尾声伪装成 Owner Assistant。

## 已实现合同

### Audience 隔离

- 工具注册使用失败关闭的 `ordinary`、`owner-growth`、`owner-growth-issue` 和五类 Worker Profile。
- 普通会话看不到 `report_growth_progress`、蓝图写入、物化或其他 Growth 内部工具，也不加载 Growth 内部 Skill。
- 未声明、重复或未知 audience 均拒绝注册。

### Owner 回传与完成门禁

- 显式 `/growth*` 原文先持久化到 Owner Cline 历史，再临时开放 `run_growth`。
- `run_growth` 等待 Scheduler，并将结构化终态作为 Tool Result 返回同一 Owner Turn。
- Worker 尾声始终是内部活动，不构成外层 Assistant 回复。
- Worker 完成只进入 `active + CREATX_GROWTH_OWNER_COMPLETION`；显式必需图片校验通过且 Owner Assistant 回复已经持久化后，Main 才提交 `completed`。

### 崩溃恢复与问题回合

- 若 Owner 回复已持久化、但终态回调前进程崩溃，重启只认“最后一个显式 `/growth*` 用户消息 -> 成功的 `run_growth` Tool Result -> 后续 Assistant 回复”，并幂等完成 Goal，不重新调用 Provider。
- 等待问题只在对应 Owner 回合临时使用 `owner-growth-issue`，且只开放 `resolve_growth_issue`；回合结束恢复普通隔离。
- 取消同时覆盖 Owner 与全部 Child Worker。退出时仍活动的 Goal 保存为 `paused`，重启后保持暂停，不伪装为正在执行或已完成。

### 旧链清理

- 删除公共 `world-summary` Worker Profile、Skill 映射和对应测试依赖。
- World Materialization 收尾只生成确定性可信证据，由 Owner 汇报。
- 不再使用 UI 私有消息、隐藏摘要、Summary Worker 或每轮 Prompt 补丁维持连续性。

## 验收证据

受控 Provider/Electron 路径已验证：

- Owner 显式命令真实形成 `run_growth` Tool Call。
- Worker 缺少合法回执时准确进入 waiting，Owner 仍形成正式 Assistant 回复。
- Growth 展开、折叠、继续和取消接入真实状态。
- Chat/Workbench、文件编辑、图片解码和四个视口通过生产 Renderer 重放。
- 活动 Growth 退出时保存为 `paused`，Electron 重启后仍为 `paused`。
- 测试 Electron 和本机受控 Provider 无残留进程。

关键命令：

```powershell
cd D:\CodexW\Creatx\creat1\creatx
bun run build
node --experimental-strip-types scripts/desktop-test.ts
bun run test:owner-growth-kernel
```

冻结工作树上的最终结果为：Typecheck（类型检查）通过，Import Boundary（导入边界）通过，`280 pass / 0 fail / 1773 expect()`，Build（生产构建）通过，`DESKTOP PASS`，`OWNER GROWTH RESULT KERNEL PASS`。Kernel 同时证明启动消息、Tool Result、Owner 最终回复和重启追问均已持久化，失败与取消可恢复，且不存在第二消息存储。

## 未完成与风险

- 未执行外部 Provider 的整本 Growth 长跑，因此不能宣称外部 Live 全链完成。
- Desktop 使用本机 OpenAI-compatible 受控 Provider，能够验证真实 Cline/Tool/Electron 协议，但不能证明外部模型质量、网络稳定性或长上下文表现。
- 另一 worktree 的前端修改未合并。本批独立绿色提交后才能按 Git 来源复核合并，尤其不能覆盖 `main.ts`、Contracts、Session 或 Growth 权威边界。

## 恢复入口

- 计划：`docs/plans/2026-08-05-session-authority-growth-isolation.md`
- Owner 结果 Kernel：`docs/baseline/creatx-owner-growth-result-kernel-2026-08-05.md`
- 主实现：`creatx/apps/desktop/src/main.ts`
- Adapter 合同：`creatx/packages/cline-adapter/src/index.ts`
- Growth 状态与恢复：`creatx/packages/growth-runtime/src/`
- Desktop 重放：`creatx/scripts/desktop-test.ts`
