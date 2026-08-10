---
title: Project Files 验收矩阵
doc_type: capability-acceptance
owner: project-files
status: workbench-file-ports-verified
last_verified: 2026-07-27
source_of_truth: docs/capabilities/project-files/product-spec.md
---

# Project Files 验收矩阵

| ID | 规则 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| ACC-PFL-001 | PFL-001 | 打开含中文和空格的 Windows 项目目录 | 获得稳定项目 ID；Cline 从该目录开始工作 |
| ACC-PFL-002 | PFL-002, PFL-003 | 获批 Cline 工具写入真实 Markdown | CreatX 读取同一文件并投影到 UI，没有正文数据库副本 |
| ACC-PFL-003 | PFL-003 | 用户或外部编辑器修改该文件后刷新 | 新内容和修改时间可见，旧缓存不冒充当前文件 |
| ACC-PFL-004 | PFL-004 | CreatX 自有文件命令收到绝对路径、`..` 或错误项目 ID | 命令失败且没有该命令副作用 |
| ACC-PFL-005 | PFL-002 | 完成一轮后重启应用 | 同一项目文件仍可扫描和读取 |
| ACC-PFL-006 | PFL-004 | 内部能力通过 Port 写入文本和二进制，再读取同一相对路径 | 字节与落盘文件一致，调用方没有获得绝对根路径 |
| ACC-PFL-007 | PFL-005 | 文件读取后被外部程序修改，旧调用方携带原修改时间写入 | 返回 `file_conflict`，外部新内容不被覆盖 |
| ACC-PFL-008 | PFL-004 | 项目内 Junction 指向项目外目录，读取或写入其下文件 | 失败且项目外没有该次写入副作用 |
| ACC-PFL-009 | PFL-007 | 查询根目录、中文/空格目录、空目录、隐藏目录和 `.creatx/workbenches` | 内容模式统一隐藏内部项；明确内部模式可以列出元数据；返回值不包含绝对根 |
| ACC-PFL-010 | PFL-007 | 目录查询收到绝对路径、`..`、文件路径、缺失目录或项目外 Junction | 缺失可区分；其他非法输入失败且不读取项目外内容 |
| ACC-PFL-011 | PFL-008 | 两个调用并发 create-only 写同一路径 | 只有一个成功，另一个返回 `file_conflict`，成功内容保持完整 |
| ACC-PFL-012 | PFL-009 | 枚举含普通隐藏文件、空目录、二进制作品、固定排除目录、临时文件和越界 Junction 的项目 | 返回完整作品/源码与空目录；排除项可解释；不读取项目外内容 |
| ACC-PFL-013 | PFL-010 | 在暂存、校验、原子提交前后分别取消或失败 | 提交前 Project Files 不打开目标；提交后读取同一真实字节；Project Catalog 不含半项目 |

版本、回收站、Watcher（监听器）和内容级冲突处理在后续批次补充，不得把本矩阵冒充完整 V1 文件验收。

## 当前证据

提交 `c9a4ae4` 已通过 `ACC-PFL-001`、`002`、`003`、`005`：含中文和空格的 Windows 项目目录形成稳定 ID，Cline 在该上下文写入真实 Markdown，文件与预览读取同一磁盘内容，外部修改后显式刷新可见，重启后仍可扫描读取。

共享接口提交 `f289dd3` 以真实 Windows 临时目录通过 `ACC-PFL-004`、`006`、`007`、`008`：未知项目、绝对路径、`..` 与 Junction 逃逸失败关闭；文本/二进制写入和读取一致；外部修改后的旧版本写入返回 `file_conflict`。这些是 Project File Port 的定向集成证据，不代表 Renderer、Creative Tool、版本或回收站已经接通。

Walking Skeleton 的 `ACC-PFL-001`、`002`、`003`、`005` 完整证据见 `../../baseline/creatx-walking-skeleton-2026-07-26.md`；本批次命令与限制见 `../../baseline/creatx-six-line-interface-enablement-2026-07-27.md`。

`ACC-PFL-009` 至 `011` 已由注册工作台纵向批次通过：真实 Windows 目录查询覆盖根、空目录、中文/空格、内部元数据、缺失、文件目标和 Junction 逃逸；并发 create-only 写入实测只有一个成功。证据见 `../../baseline/creatx-register-workbench-live-2026-07-27.md`。

2026-08-10 的便携项目 Task 2 定向测试通过 `ACC-PFL-012`：真实 Windows 中文/空格目录同时包含普通隐藏文件、空目录、图片、二进制、固定排除目录、系统缓存、诺文临时文件及项目内外 Junction；枚举不返回绝对根或项目外内容，枚举后修改在读取时返回 `package_file_conflict`。这是 Project Files Port 的定向证据，不代表 `.np` ZIP 导出、导入提交或 `ACC-PFL-013` 已完成。
