---
title: CreatX Workbench Title Correction Live Evidence
doc_type: live-evidence
owner: workbench-registry
status: live-verified
last_verified: 2026-07-27
source_commit: b3725dd
---

# CreatX 工作台标题纠正 Live 证据

## 结论

真实 DeepSeek `deepseek-chat`、Cline SDK `0.0.65` 和同一 Electron 进程已经完成：

```text
“我想写一部关于未来来信的小说，帮我开始。”
→ 加载小说 Skill
→ 创建 小说/大纲.md 与 小说/第一章.md
→ 注册 folder=小说、title=未来来信
→ 用户询问原因并要求把显示标题改成“小说”
→ AI 解释命名并调用 rename_workbench
→ 同一工作台 ID 更新为 title=小说
→ 第一章真实磁盘内容可预览
→ 退出无残留进程
→ 重启恢复 title=小说、folder=小说 和两份文件
→ 用户发送“继续”后收到 CONTINUATION_OK
```

注册 ID 为 `wb_39a76f19-ce91-4507-a562-02adbcc936cc`。改名前后 ID 与 `folder` 不变，`小说/` 内仍严格只有 `大纲.md` 和 `第一章.md`，两份正文逐字未变。本次成功运行没有调用 Shell。

## 代码边界

- `rename_workbench` 是项目作用域、审批必需的中立工具；输入为已注册 `folder` 与新 `title`。
- Workbench Command Port 串行化改名，通过内部记录的 `modifiedAt` 使用 Project File Command Port 原子覆盖并检测并发冲突。
- 重复注册仍不修改标题；显式改名不创建第二条记录，不改变真实文件夹。
- Renderer 没有新增专用按钮；真实工具完成事件触发现有文件与工作台投影刷新。

## 验收

| 命令 | 结果 |
| --- | --- |
| `bun test` | 43 pass，0 fail，134 次断言 |
| `bun run typecheck` | 通过 |
| `bun run test:imports` | 通过；只有 Cline Adapter 导入 Cline |
| `bun run build` | Main、Preload、Renderer 生产构建通过；保留既有父级 tsconfig 警告 |
| `bun run test:electron-natural-manual` | 通过；真实 DeepSeek、真实 Electron、注册、改名、预览、重启和继续完整连接 |

成功截图：

- `artifacts/walking-skeleton/electron-live-first-run.png`：用户纠正、AI 解释、`rename_workbench` 完成、右侧真实第一章预览和“小说”工作台标签。
- `artifacts/walking-skeleton/electron-live-restarted.png`：重启后的同一会话、恢复的“小说”标签与 `CONTINUATION_OK`。

## 失败与限制

成功前有三次未通过运行：一次在批准注册后等待 Provider/Cline 终态超时；一次被待审批截图超时阻塞，已改为非阻塞证据；一次由模型生成的 PowerShell 被 Cline 解析为非法 `run_commands` 输入并正确失败。最终成功运行通过更新后的 Skill 避免了仅为创建父目录调用 Shell。

`artifacts/walking-skeleton/electron-live-failure.png` 保留最后一次成功前失败界面；它是滚动诊断截图，不是成功 Live 证据。

本批没有验收元数据写入故障注入、真实外部并发修改、发布安装包、长时间资源占用或其他领域 Skill。非法/未知改名和修改时间冲突由单元测试与 Project File Port 测试覆盖，不冒充 Electron Live。
