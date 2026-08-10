# Owner Growth Result Kernel Baseline

日期：2026-08-05。

## 结论

固定 Cline SDK `0.0.65` 的公开 `extraTools` 路径能够在同一个 Owner Conversation（所有者会话）中持久保存：显式 Growth 启动用户消息、Growth 控制器 Tool Result（工具结果）和 Owner Assistant 最终回复。销毁并重建 Cline 后，普通后续回合可以从同一 Cline 历史读取这些事实，不需要第二消息存储、Renderer 拼接、隐藏摘要或 Cline Core 补丁。

这解除 `docs/plans/2026-08-05-session-authority-growth-isolation.md` 第 6 节的生产实现硬门禁，但不表示生产链已经迁移。

## 实验路径

- 脚本：`creatx/packages/cline-adapter/scripts/owner-growth-result-kernel.ts`
- 命令：在 `creatx` 目录运行 `bun run test:owner-growth-kernel`
- Runtime：真实 Cline Session 与 SQLite；受控本地 Provider。
- 明确未使用：外部有效 Provider、第二消息数据库、Cline SQLite 手工写入、Cline Core 修改。

## 已验证场景

| 场景 | 结果 |
| --- | --- |
| 显式启动消息持久化 | PASS |
| 临时 Growth 控制器 Tool Result 持久化 | PASS |
| 同一 Owner Turn 形成正式 Assistant 最终回复 | PASS |
| Cline 重启后普通追问读取最终回复 | PASS |
| 普通追问当前工具目录不含 Growth 控制器 | PASS |
| 受控失败进入 Owner 历史并由 Owner 汇报 | PASS |
| 取消进入 `aborted`，重启后可普通续聊 | PASS |
| 第二消息存储 | 未使用 |

机器结果：

```json
{
  "status": "OWNER GROWTH RESULT KERNEL PASS",
  "sdkVersion": "0.0.65",
  "activationPersisted": true,
  "toolResultPersisted": true,
  "ownerFinalPersisted": true,
  "restartFollowUpReadFinal": true,
  "failurePersisted": true,
  "cancellationRecovered": true,
  "secondMessageStore": false
}
```

## 生产约束

生产路线应采用：

```text
Owner /growth Turn
-> 临时启用受信任 Growth Controller Tool
-> Controller 等待 Growth Runtime 与 Child Worker 结束
-> 可信终态证据作为 Tool Result 回到同一 Owner Turn
-> Owner 模型生成并持久化正式最终回复
-> 验证最终回复持久化后，Goal 才能进入 completed
```

禁止恢复现有错误路线：Main 在会话外截获命令、Renderer 手工合并 Worker 历史、独立 Summary Worker 冒充 Owner 回复、普通会话加载所有 Growth 内部能力。

## 证据边界

这是受控 Provider 的公共合同实验，不是外部 Provider Live（真实模型服务运行）证据。生产实现仍须先建立失败回归测试，再完成真实 Electron、外部 Provider、取消、失败、重启、普通追问无副作用和进程回收验收。
