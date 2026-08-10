# CreatX 创意库分享弹窗关闭与性能修复基线

日期：2026-08-09
主能力线：`workspace-ui`
规则：`WUI-044`
验收：`ACC-WUI-066`

## 已实现

- 创意库分享新增 `admitSharedMessage` Desktop API（桌面接口）。普通 `sendMessage` / `steerMessage` 继续保留等待完整 Run 的既有语义；分享只等待 Runtime（运行时）调用接收回调。
- 接收前同步或异步失败会返回原错误，不消费附件授权、不关闭选择面；发送流程未回调接收就结束时以 `message_admission_missing` 失败关闭。
- 接收后 IPC（进程间通信）立即返回，完整 AI Run 在 Main（主进程）后台继续。后台 Promise 始终绑定拒绝处理；Steer 后台失败转为现有 `runtime.error`，普通发送继续由 Cline Adapter 的既有 Runtime 事件投影。
- 分享弹窗不再因 Pending（提交中）禁用关闭。X、Escape 和遮罩使用统一 `DesktopDialog` 关闭合同；关闭不取消 AI Run，只有目标会话按钮在提交期间禁用以防重复发送。
- 917 条会话使用标题/路径搜索与固定 `64px` 行高虚拟窗口。420px 首屏含 Overscan（预渲染余量）只挂载 10 行，尾部仍可滚动访问；没有截断会话。
- 移除创意库分享全屏遮罩的动态 `backdrop-filter`，保留半透明背景。

## 验收结果

工作目录：`D:\CodexW\Creatx\creat1\creatx`

- `bun test apps/desktop/tests/message-admission.test.ts apps/desktop/renderer/tests/creative-library-share-list.test.ts apps/desktop/renderer/tests/creative-library-share-dialog.test.tsx`：8/8，通过，17 次断言。
- `bun run typecheck`：通过。
- `bun run build`：通过；Main、Preload（预加载桥）和 Renderer（渲染进程）生产产物均生成。
- `git diff --check`：通过。

测试覆盖：接收后立即返回、接收前失败、接收后后台失败、缺少接收回调失败关闭、标题/路径搜索、917 条首尾虚拟窗口、关闭按钮可用和有界 DOM 挂载。

## 未完成与风险

- 本批未运行全量测试、完整 `test:desktop`、Windows 打包或安装版/便携版。
- 未调用真实 Provider，也未用正式 Profile 发起一次创意库分享；因此不能把回复时延、Provider 错误视觉或正式 917 条列表滚动称为 Electron Live（真实运行）。
- 选择面关闭不取消已接收 Run 是产品合同。用户若需要停止回复，仍使用对话中的既有取消能力。
- Renderer 依据当前 Session Run State 选择 Send 或 Steer；极窄的跨进程状态变化仍按既有失败关闭语义返回 `session_conflict`，不会自动猜测重试或重复提交。

## 恢复入口

后续若做 Electron 验收，从隔离 Profile 建立大量 Session，使用延迟受控 Provider：验证选择面三种关闭方式、接收后立即消失、后台回复仍进入目标会话、接收前故障保留选择面，以及首部/中部/尾部滚动与搜索。不要修改正式 Profile，也不要把本地受控 Provider 标记为外部 Provider Live。
