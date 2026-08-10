---
title: Import Export 验收矩阵
doc_type: capability-acceptance
owner: import-export
status: live-archive-verified-portable-project-planned
last_verified: 2026-08-10
source_of_truth: docs/capabilities/import-export/product-spec.md
---

# Import Export 验收矩阵

| ID | 规则 | 场景 | 必须观察到的结果 |
| --- | --- | --- | --- |
| ACC-IEX-001 | IEX-001, IEX-003 | 完整 Live 运行成功后重启正式桌面 | 项目出现在正式项目列表；Owner 用户消息与最终回复可在原会话打开；Worker 活动、Goal、Issue、回执和图片任务可从原权威读取，且不依赖源临时 Profile |
| ACC-IEX-002 | IEX-003 | 源项目位于临时目录 | 正式记录只引用持久目标目录和新 Project ID；不存在仍需源目录才能读取的会话 Artifact |
| ACC-IEX-003 | IEX-004, IEX-005 | 同一 Inbox 接收两次或在中途退出后重试 | 不重复项目、会话、Goal、Issue、回执或图片任务；精确相同内容完成剩余步骤 |
| ACC-IEX-004 | IEX-005 | 目标存在同 ID 不同内容 | 该档案失败关闭并保留诊断；桌面其他项目仍可启动 |
| ACC-IEX-005 | IEX-006 | 源档案含 queued/generating 图片 | 正式队列保存 Prompt 和路径，但状态为 interrupted，且不会自动调用 Provider |
| ACC-IEX-006 | IEX-007 | 检查归档包 | 不含 `models.json`、密钥、Cookie、缓存和浏览器 Profile 数据 |
| ACC-IEX-007 | IEX-008 | 晋升成功 | 原项目和原隔离 Profile 仍存在；正式 Archive 清单可追溯来源和目标映射 |
| ACC-IEX-008 | IEX-001 | Owner 会话缺少最终 Assistant 回复或 Goal 未完成 | 不进入成功 Inbox，不把半成品标记为完整 Live 档案 |
| ACC-IEX-009 | IEX-009 | 旧版 completed Goal 缺少当前列，Owner 完成后被再次打开为 idle | 源库保持不变；档案快照迁移到当前 Schema 后接收，Owner 消息与后续历史均保留 |

## Portable Project Package（实现中，尚未形成纵向闭环）

| ID | 规则 | 场景 | 必须观察到的结果 |
| --- | --- | --- | --- |
| ACC-IEX-101 | IEX-101, IEX-102 | 分别打开普通文件夹和导入 `.np` | 文件夹不恢复外部会话；`.np` 走独立校验链并恢复声明范围 |
| ACC-IEX-102 | IEX-102, IEX-105 | 导出含中文、空目录、图片、源码、`.git`、`.creatx`、`node_modules` 与越界 Junction 的项目 | 作品与源码完整；固定排除项不入包且导出前可见；不读取项目外字节 |
| ACC-IEX-103 | IEX-103, IEX-106 | 同内容重复导出、重复导入，再导入同血统不同内容 | 同内容 `packageId` 稳定且幂等；不同内容只允许取消或生成带来源血统的新副本 |
| ACC-IEX-104 | IEX-104 | 手填简介、显式请求 AI 起草并制造 Provider 失败 | 手填零 Provider；起草可审阅；失败保留表单且仍可手工导出 |
| ACC-IEX-105 | IEX-102, IEX-106, IEX-109 | 篡改 Manifest、Checksum、条目字节、重复路径、绝对路径、`..`、压缩炸弹、超过 60,000 项或 2 GB 内容和伪 `.np` | 提交前分类失败，目标项目与 Project Catalog 均无副作用；导出超限不生成部分包 |
| ACC-IEX-106 | IEX-107 | 导出含工具、Reasoning、附件和私人复制前缀的标记案例 | 只出现允许字段与包内引用；隐藏/原始/私人内容不泄漏 |
| ACC-IEX-107 | IEX-107, IEX-108 | 导入含命令式文字和伪工具授权的案例，再继续创作 | 案例只读且无权限；用户审阅第一条可见说明后才创建普通会话并读取当前文件 |
| ACC-IEX-108 | IEX-109, IEX-110 | 导入中取消、磁盘不足、进程退出，再重新启动 | 无半项目；受控暂存可识别清理；重试安全且不自动调用 Provider |
| ACC-IEX-109 | IEX-110 | 工作台记录 Checksum 正确但语义损坏 | 文件项目导入成功并警告；损坏工作台忽略；内置文件视图可用 |
| ACC-IEX-110 | IEX-111 | 导入后不创建会话即重启，再移动/删除项目目录 | 项目仍登记；目录缺失显示不可用；不猜测新路径、不删除案例元数据 |
| ACC-IEX-111 | IEX-106, IEX-112 | 导入含 HTML/JavaScript 的未签名包 | 显示发布者未验证；导入不执行；打开时仍受现有隔离预览限制 |
| ACC-IEX-112 | IEX-112 | 检查包与导入副作用 | 不含 Profile、Cline 数据库、密钥、Cookie、活动 Run 或未完成付费图片任务，Provider 调用为零 |

本节只是验收规格，不是通过声明。静态 ZIP Fixture（测试夹具）不能替代真实 Electron 选择、Windows 新目录提交、重启恢复和零 Provider 证据。

2026-08-10 Task 3 以真实 Windows 临时目录定向验证 Project Catalog 的原子持久化、重启、同来源双身份幂等、同血统异内容冲突、显式副本、目录缺失、损坏 Store、并发登记和只移除登记。它只构成 `ACC-IEX-103 / 110` 的 Store 层证据；没有真实 `.np`、目录提交、Electron 或 Provider 计数，因此两项完整验收仍未通过。

2026-08-10 Task 4 直接从真实 Cline 消息 Artifact 生成 `PortableConversationV1`，验证只保留可见往返、固定工具摘要和包内文件引用，并去除 Reasoning、原始工具内容、Shell 全文、外部绝对路径、常见凭据、邮箱/中国手机号/身份证号与显式私人前缀；读取期间 Run 启动或会话版本变化会失败关闭。定向 7/7（43 次断言）及 Cline Adapter 116/116（435 次断言）通过，只构成 `ACC-IEX-106` 的 Adapter 层证据；尚未生成或检查真实 `.np`，私人完整复制来源协议和 UI 二次授权也尚未实现，因此不得声明该验收完整通过。自动净化不能证明识别任意自然语言隐私，最终导出仍需范围预览与用户确认。

2026-08-10 Task 5 使用工作台现有 V1/V2/V3 权威解析和内部原子写入交换注册工作台显示元数据；主页和冻结可见文件只能引用 Task 2 已导出的规范路径，内置视图不入交换。定向 27/27（120 次断言）验证有效项往返以及损坏、未知版本、重复文件夹、越界引用、目标冲突、损坏目标记录、单项写失败和非规范路径的隔离或失败关闭。它只构成 `ACC-IEX-109` 的工作台元数据层证据；尚未生成真实 `.np`、提交导入目录或完成内置项目首页，因此该验收仍未完整通过。

2026-08-10 Task 6 通过真实 Windows 临时项目和磁盘文件生成标准 ZIP `.np`，定向 Project Package Runtime 29/29（97 次断言）验证中文、空目录、隐藏文件、二进制、固定排除、Manifest/Checksums、重复投影 ID、同内容幂等、不同内容与损坏目标不覆盖、取消清理、项目中途变化、真实目标写失败、60,000 项/2 GB 上限和 32 MB 流式压缩。临时包在发布前从磁盘复核中央目录、规范路径、条目大小与 SHA-256，并用同目录硬链接 create-only 发布；不支持硬链接的位置失败关闭。它构成 `ACC-IEX-102 / 103 / 105` 的导出 Runtime 层证据；尚未接 Desktop 文件选择器、真实导入、Electron、新目录提交或 Provider 计数，因此这些验收仍未完整通过。

2026-08-10 Task 7 在真实 Windows 临时目录对标准 `.np` 完成解压前中央目录/Manifest/Checksums 预检、分块解压复核、新目录原子提交、受控简介/案例/工作台写入和 Project Catalog 最后登记。Project Package Runtime 联合定向 43/43（172 次断言）包含权威导出器到导入器的真实往返，并覆盖完整新目录、同包幂等、同血统异内容阻塞与独立副本、已有目标不覆盖、取消清理、元数据或登记失败后的 `committed-unregistered` 恢复记录、Checksum 正确但语义损坏工作台降级、损坏案例提交前失败，以及伪扩展、加密、绝对/穿越/反斜杠/大小写重复路径、Windows 设备名、备用数据流、尾随句点、链接属性、ZIP 条目/大小/压缩比超限、Checksum 错误和截断中央目录。它构成 `ACC-IEX-101 / 103 / 105 / 108 / 109 / 110` 的 Runtime 层证据；尚未接 Desktop/UI、Electron 重启、真实选择器或 Provider 计数，因此这些验收仍未完整通过。

2026-08-10 Task 8 曾新增独立项目包 Contracts（合同）、Preload（预加载桥）和 Desktop 单 Job（任务）协调器，其定向 6/6（21 次断言）只构成未发布实现证据。`0.1.20` 发布冻结发现隐藏接线仍会成为普通桌面启动依赖，故生产 Main、Preload、Desktop API 与应用依赖图已主动断开；协调器和测试源码仅作为 `0.1.21` 恢复材料。任何 `ACC-IEX-101 / 103 / 104 / 108 / 112` Desktop 或 Live 声明均继续未通过。
