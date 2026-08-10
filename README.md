# CreatX Active Development

CreatX 是建立在完整 Coding Agent（编码智能体）之上的通用艺术创作桌面工作台。它使用成熟 Harness（智能体运行框架）处理会话、模型、工具和取消，在外部提供面向创作的主会话、真实文件、预览、动态工作台和内置 Skill（技能）。

## 当前状态

- `D:\CodexW\Creatx\creat1` 是最新完整集成的权威根目录。
- CreatX 生产代码全部位于 `creatx/**`；根级旧 NovelX/OpenCode 快照已从活动树移除，可由标签 `pre-repository-cleanup-20260806` 恢复。
- Cline SDK/Core `0.0.65` 已选为唯一 Harness；固定源码基线位于兄弟目录 `D:\CodexW\Creatx\cline-baseline`。
- Fixture（测试夹具）Web 原型位于独立工作区，只提供视觉和交互证据，不是 Live（真实运行）产品。

当前 CreatX 桌面应用从 `creatx/` 安装、构建和启动。当前状态与最强 Live 证据以 [`CONTEXT.md`](CONTEXT.md) 和能力线文档为准。

## 从这里开始

1. [`AGENTS.md`](AGENTS.md)：开发、证据、并行和维护规则。
2. [`CONTEXT.md`](CONTEXT.md)：当前状态、阅读顺序和下一恢复入口。
3. [`docs/product/creatx-product-understanding.md`](docs/product/creatx-product-understanding.md)：产品共识。
4. [`docs/product/creatx-requirement-map.md`](docs/product/creatx-requirement-map.md)：V1 与第一骨架的能力归属。
5. [`docs/capabilities/README.md`](docs/capabilities/README.md)：当前能力、实现与验收入口。

## 已接受的第一骨架

```text
生产 Electron UI
→ Electron 主进程内的固定 Cline
→ 真实 Provider
→ Cline 原生逐次审批
→ 一个真实文件写入
→ 文件与预览显示同一文件
→ 取消、失败和干净退出
→ 重启读取历史，用户发送新的“继续”回合
```

上述链路已经继续扩展到 Growth、图片队列、注册工作台、创作资料库和 Chat / Workbench 双模式。尚未完成的边界以 `CONTEXT.md` 为准。

在 Windows 上从 `creatx/` 运行：

```powershell
bun run install:windows
bun run build
bun run start
```

## 真实性与安全边界

- 缺少真实 Provider 时 Agent 能力失败关闭，不使用模板或确定性回复冒充 Live。
- Cline 的 `cwd/workspaceRoot` 只是工作上下文。第一版使用原生 Tool Policy（工具策略）和逐次审批；用户批准 Cline 文件或 Shell（命令行工具）后，该次调用可能访问整台机器。
- Cline 独占消息、Run、工具和执行结果。CreatX 不建立第二套会话、Run 或持久 UI 执行事实。

提交代码或文档前阅读 [`AGENTS.md`](AGENTS.md) 中的验证、权限和完成报告规则。
