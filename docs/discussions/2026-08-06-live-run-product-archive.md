# 完整 Live 运行进入正式产品档案

日期：2026-08-06

## 用户确认的产品含义

完整、值得保留的 Live（真实运行）不能只存在于隔离测试目录。正文文件仍在，但 Owner 会话、Worker 会话、Growth Goal、阶段、Issue、回执、图片任务和最终汇报没有进入正式产品数据时，这次运行不算被产品保存。

因此，完整 Live 运行成功后必须进入正式产品档案。隔离 `userData` 只负责防止测试污染日常数据，不是最终数据归宿。

## 权威边界

- 作品内容继续以真实项目文件为权威。
- Cline 的 `sessions.db` 与会话 Artifact（产物）文件继续拥有 AI 会话事实。
- `growth.sqlite` 继续拥有 Goal、Activation、阶段、Issue 和回执。
- `image-queue.sqlite` 继续拥有图片任务。
- `session.sqlite` 继续拥有会话权限。
- 产品归档清单只协调一次跨 Store 晋升，不复制上述内容成为第二权威。

## 已接受行为

1. 完整 Live 运行结束并通过既有质量门禁后，先导出到正式 Profile 的待接收 Inbox（收件箱）。
2. 正式桌面应用下一次启动、且各 Store 尚未打开时，幂等地把 Inbox 晋升到正式项目区和各权威 Store。
3. 项目移动到持久目录后重新计算 Project ID，并统一改写所有项目关联。
4. Owner 和属于该 Goal 的 Worker 会话全部保留；最终回复必须仍可从 Owner 历史读取。
5. 不迁移模型密钥、Cookie、缓存或隔离 Profile 的通用设置。
6. 已成功和已失败图片保持历史状态；尚在 `queued` 或 `generating` 的图片保存为 `interrupted`，防止归档后静默调用 Provider 并产生费用。
7. 重复接收同一 Archive（档案）必须幂等；身份相同但内容不同必须失败关闭。
8. 单个档案导入失败不能阻止桌面应用启动；失败档案保留在 Inbox，并留下可诊断状态。
9. 原始完整运行目录不因归档成功而删除。

## 当前首个待迁移档案

- 项目：`D:\CodexCache\Temp\CreatX Pro 全链实跑 nOIEx8`
- 隔离 Profile：`D:\CodexCache\Temp\CreatX Pro 全链用户数据 OBvv9u`
- Goal：`goal_91a30e03-4832-4fc8-a2cb-45d4151edcb0`
- Owner：`1786011824234_7atom`
- 状态：Goal 已完成且 Owner 最终回复已持久化。
