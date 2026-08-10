# CreatX Web Preview

从 `creatx` 目录运行：

```powershell
bun run preview:web
```

浏览器页面直接导入生产 `src/WorkspaceShell.tsx`、`src/MessageMarkdown.tsx` 和 `src/worldbuilder-production.css`。修改这些共享文件后，Vite 会热更新；Electron 下一次加载使用同一份修改，不存在复制或“同步回去”步骤。

`PreviewApp.tsx` 只负责演示数据和内存回调。这里的文件、消息、工作台、模型与工具状态全部是 Fixture（测试夹具），不得作为 Runtime（运行时）或 Provider（模型服务）能力证据，也不得新增 `window.creatx`、Electron、Cline 或文件系统访问。

验证命令：

```powershell
bun run build:preview:web
bun run test:preview:web
```
