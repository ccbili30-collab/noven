# Desktop 单实例与 Session 进程所有权故障

状态：已诊断、实现并生成 Windows `0.1.14`；完整证据见 `../baseline/creatx-windows-0.1.14-single-instance-2026-08-08.md`。

## 用户可见故障

CreatX 在发送消息时显示：

```text
会话配置已经发生变化。
session_conflict: session is owned by live process 46904
```

用户要求永久修复，不接受删除 Session PID、绕过所有权检查或仅结束现场进程。

## 真实原因

- PID `46904` 是旧 Worktree 启动且仍存活的 Electron Main（主进程），并真实拥有四条 Cline Session（会话）。
- 同时还存在两个打包版 CreatX 主进程组；这些实例共同使用正式 Profile 的 `sessions.db`。
- Cline Adapter 的存活 PID 拒绝逻辑正确地失败关闭，防止两个进程并发写同一 Session。
- Electron Main 在本批前没有调用 `app.requestSingleInstanceLock()`，所以相同 Profile 可启动多个 CreatX，冲突直到发送消息才暴露。
- `classifyRuntimeError()` 把所有 `session_conflict` 映射成“会话配置已经发生变化”，没有准确解释活进程占用。

当前没有 Session 数据损坏证据。

## 接受的修复边界

1. 相同 Electron `userData` Profile 只允许一个 CreatX 主实例。
2. 第二次启动不初始化 Runtime、Provider（模型服务）或数据库；它通知首实例恢复、显示并聚焦已有窗口，然后退出。
3. 不同 `--user-data-dir` 的隔离开发或测试实例继续允许并存。
4. 两种活进程所有权冲突显示“此会话正在另一个 CreatX 窗口中使用。”；其他 `session_conflict` 保留原文案。
5. 不改 Session Schema（数据合同）、PID 接管协议、Provider 行为或 Renderer（渲染层）布局。

## 验收边界

- 单元回归覆盖第二实例拒绝、已有窗口恢复/聚焦、窗口未创建和已销毁，以及精确错误分类。
- 隔离 Profile 的真实 Electron 验证必须证明：同 Profile 第二实例退出且首实例仍存活；不同 Profile 可并存；全部测试进程与临时目录被清理。
- 旧版本从未申请单实例锁，因此新版本无法命令旧版本自动退出。首次切换到修复版前仍需人工关闭全部旧 CreatX 一次。
