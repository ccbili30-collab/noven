# 诺文对话即时切换与路由完整性基线

日期：2026-08-10  
能力：`WUI-050 / ACC-WUI-072`  
状态：Integrated With Bounded Electron Evidence（已集成并取得有界 Electron 证据）

## 已实现

- 点击会话立即更新可见 Session ID（会话标识），同步清除旧 Timeline（时间线）。
- 新历史到达前显示“正在打开会话”，不会用旧内容或新项目空态冒充目标历史。
- Composer（输入区）发送、Steer（追加指令）和 Skill Sequence（技能序列）显式读取立即更新的目标会话。
- 无脏编辑器时保存门禁同步通过；脏编辑器仍等待真实保存，失败不导航。
- 跨项目核心打开与 Timeline 并行；Growth Goal（生长目标）和 Workbench（工作台）投影在核心项目打开后后台补齐。
- 项目打开由最新选择协调器串行，过期结果不提交；快速返回原项目时仍重新校准 Main（主进程）的当前项目。
- 同一会话重复选择保持既有 Timeline 和一次性打开滚动语义。

## 验收

- Renderer（渲染层）：`bun test apps/desktop/renderer/tests`，113/113，通过，538 次断言。
- 全量：`bun test`，486/486，通过，3,451 次断言，65 个文件，109.03 秒。
- Typecheck（类型检查）：`bun run typecheck`，通过。
- Production Build（生产构建）：`bun run build`，通过。
- 隔离 Electron：`bun run test:session-switch`，通过。目标项目含 1,200 个真实 Markdown 文件；点击 B 并在同一操作窗口发送后，下一次 `requestAnimationFrame` 回调中的选中态与标题为 B，旧 A 消息节点为 0；最终冻结 Build 在当前负载下测得 205 ms。Provider 收到 2 个受控请求，A 只保留 A 消息，B 只保存目标消息。
- 滚动回归：`bun run test:conversation-scroll`，通过；重复选择同会话并缩放后滚动位置仍为 `120`。
- 第一次全量命令被 124 秒外层上限终止且无汇总；清理确认无残留进程后，以 300 秒上限唯一重跑取得上述完整通过结果。

Electron 使用本地受控 Provider（模型服务）验证真实 Cline 消息接纳和持久 Timeline，不是外部 Provider Live（真实运行）。正式 Profile 未修改。

## 未完成

- 没有优化 Main 的项目文件扫描算法；超大项目的工作台和文件投影仍可能晚于 Chat。
- 没有运行完整 `test:desktop`、Windows 打包、Setup/Portable 或正式 Profile 视觉验收。
- 没有覆盖脏编辑器保存期间的完整 Electron 视觉流程；该失败关闭边界由同步/异步门禁测试和既有文档编辑器测试覆盖。

## 风险与恢复入口

当前最不确定部分是极大项目文件扫描期间工作台旧画面与新 Chat 短暂并存的视觉感受；消息路由不依赖该工作台投影。后续如继续优化，应从 `apps/desktop/renderer/src/App.tsx` 的项目投影加载和 Main `openProject` 文件扫描计时开始，不得重新阻塞 Chat 身份切换。
