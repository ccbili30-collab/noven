# CreatX 对话打开一次性底部定位基线

日期：2026-08-09（Asia/Shanghai）

主能力线：Workspace UI（工作区界面）

权威规则：`WUI-033 / WUI-045 / ACC-WUI-042 / ACC-WUI-067`

## 已实现

- 每次真正进入或切换到一个 Session（会话）后，主对话等待首次非空 Timeline（时间线）提交，再立即定位到最底部一次。
- 空会话不消费本次定位；稍后首次出现消息时仍会定位。
- 同一会话打开周期内，重复选择当前会话、React 重渲染、窗口缩放和 Chat / Workbench 表面切换不重新触发打开定位。
- 离开会话后再次进入形成新的打开周期，可以再次定位。
- 既有底部黏附保持：用户仍在底部时流式回复继续贴底；用户上滚后停止跟随并显示“回到最新”。

唯一业务实现位于 `creatx/apps/desktop/renderer/src/conversation-scroll-controller.ts`。`WorkspaceShell` 只把当前 Session ID 和 Timeline 提交交给该控制器，不复制判断规则。

## 验收

- 新控制器测试在旧实现上稳定为 3 失败、3 通过，证明首次定位、空历史延期和重新进入场景能捕捉缺口。
- 修复后控制器定向测试 6/6，通过，19 次断言。
- Renderer 全套：100/100，通过，477 次断言，覆盖 26 个文件。
- `bun run typecheck`：通过。
- `bun run build`：通过，Main、Preload 和 Renderer Production Build（生产构建）均完成。
- `bun run test:conversation-scroll`：真实启动源码 Electron，使用隔离 Profile 和本地受控 Provider（模型服务）生成 80 段长回复；从空会话返回后对话位于底部。随后手动上滚至 `scrollTop=120`，再次选择当前会话并缩放窗口后仍为 `120`。测试退出码 0，隔离项目和 Profile 均已清理。
- 本次 Electron 验收未调用外部 Provider，不是外部 Provider Live（真实运行）。

## 未完成与风险

- 没有运行全仓全量测试或完整 `test:desktop`；本批证据为 Renderer 全套、Typecheck、Production Build 和专用 Electron 场景。
- 没有使用正式 Profile 验收超长真实历史，也没有修改正式 Profile。
- 当前正在运行的正式便携版来自 `D:\CodexCache\Temp\3HfUqwK38rHOLns6YOHLUaVBiOg`，启动时间早于本批测试，未被关闭或修改。
- 已生成的 Windows `0.1.17` Setup 和 Portable 位于本批代码之前，不包含该修复；需要新的 Windows 版本才能交付给便携版用户。

## 恢复入口

后续若需要打包，先从本文件与 `docs/discussions/2026-08-09-conversation-open-scroll-position.md` 恢复语义，再按补丁版本生成新 Windows 产物。不得把旧 `0.1.17` 描述为已包含本修复。
