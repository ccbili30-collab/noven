# CreatX 项目对话与工作台控制基线

日期：2026-08-09（Asia/Shanghai）

主能力线：`workspace-ui`

相邻能力线：`session`、`provider-harness`

规则与验收：`WUI-043 / SES-014 / ACC-WUI-061..063 / ACC-SES-021`

## 已完成

- 完全展开的桌面固定为“左侧全局导航 / 中左 Chat / 中右工作台画布 / 最右工作台导航”，Chat / Workbench 切换不再重排组件。
- 项目导航只列项目会话；Chat 标题显示项目名，工作台选择器与资源树固定在最右侧。
- 左导航可连续缩到 `52px` 后真正折叠，重新展开恢复拖动前宽度；右导航向右折叠为 `52px`、向左恢复；窄窗先折叠左导航，再折叠右导航。
- Main 按项目串行、持久分配普通会话名 `创作（n）`。删除、重命名不复用编号，显式标题不占编号，Session ID 与显示名独立。`session.sqlite` 由 Schema 1 加法迁移到 Schema 2。
- 操作系统文件通过 Preload 的 `webUtils.getPathForFile()` 进入 Main 的 `AttachmentAuthorizationStore`，Renderer 只获得短期引用。Chat 接收文件并显示待发送附件，不自动发送；工作台不是 Drop 目标。
- 用户消息的删除只持久隐藏本机投影。修改和重发走正常 `sendMessage`，Run 成功后隐藏原消息；失败、取消或结果未知时恢复原消息，修改还恢复草稿与编辑状态。Cline 历史、Assistant 回复、工具和文件副作用不被改写。
- 真实 Electron 验收发现“Provider 异步失败后原消息仍被隐藏”的回归；提交 `6808451` 把发送中隐藏改为瞬态状态，只在 `run.state=completed` 后写入持久隐藏偏好。

## 自动验收

- 本批冻结定向组合：Bun 117/117、393 次断言；Session Runtime 5/5。覆盖稳定 Timeline ID、会话计数迁移、附件授权、消息可见性、Timeline、四栏布局和资源树。
- `bun test`：450/450，通过，3,283 次断言；本次没有复现历史 Skill 预算超时。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node 两项 Import Boundary（导入边界）通过。
- `bun run build`：Production Build（生产构建）通过。
- `bun run test:workbench-interactive`：隔离 Electron 通过。覆盖：
  - 显式“艺术库 Chat”、`创作（1）`、删除/重命名后 `创作（2）`；
  - 首次删除边界说明、删除后页面重载仍隐藏；
  - 修改取消、修改成功、重发成功；
  - 关闭本地受控 Provider 后，修改失败恢复原消息/草稿/编辑态，重发失败不提交原消息隐藏键；
  - 1360×860 四栏顺序、左右折叠方向、`52px`、左栏宽度恢复；
  - 900×700 与 860×620 窄窗折叠，860 宽时无横向溢出；
  - 工作台 iframe 外网阻断且没有 Electron Bridge 泄露。
- Electron 退出后没有对应隔离 Profile 残留进程。

## 证据边界

- Electron 中用于生成稳定消息的是本机 HTTP 受控 Provider；随后关闭它得到真实 `ECONNREFUSED` 失败。它验证桌面、Cline 和失败恢复链，不是外部 Provider Live（真实运行）。
- Drop 覆盖层使用脚本构造 DOM `File`，只证明视觉目标和 Escape 行为。Playwright 无法把它提升为真实操作系统拖入证据；Main/Preload 路径授权由定向测试证明。
- Provider 失败前 Cline 可能已经持久化新的用户输入。失败恢复保证原消息不被本机隐藏，但不删除新的失败尝试；同文重发可能因此保留两条 Cline 历史。这是“不改写 AI 历史”边界的直接结果。
- 没有修改 Cline Core、消息 SQLite、Cline 消息文件、Provider 协议或项目文件权限。

## 未完成

- 真实 Windows Explorer 文件拖入需要人工验收；文件夹、消失文件和超过 20 项的真实 OS 手势也尚未自动化。
- 没有调用外部真实 Provider，没有验证真实额度、网络抖动或远端流式中断。
- 没有运行完整 `bun run test:desktop`；本批使用了范围更小、隔离 Profile 的 `test:workbench-interactive`。
- 本批完成时 Windows `0.1.14` 尚不包含这些能力；随后已由提交 `46c5006` 升级并打包为 `0.1.15`，发布证据见 `creatx-windows-0.1.15-2026-08-09.md`。

## 提交与恢复入口

- `c88bbf0 fix(cline): preserve message timeline ids`
- `0a3e383 feat(session): allocate project conversation names`
- `0af5ec7 feat(desktop): accept dropped chat attachments`
- `0be4b91 feat(workspace): add local message controls`
- `e340139 feat(workspace): fix project chat layout`
- `6808451 fix(desktop): restore failed message replacements`

下一步若继续本能力，先用 Windows Explorer 对隔离 Profile 手工拖入普通文件、多文件、文件夹和超量批次，再决定是否打包新版本。不要把 DOM `File` 测试记为真实 OS 拖入，也不要重新实现或绕过 Cline 历史。
