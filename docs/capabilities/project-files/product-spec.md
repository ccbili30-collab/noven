---
title: Project Files 产品规格
doc_type: capability-product-spec
owner: project-files
status: workbench-file-ports-verified
last_verified: 2026-07-27
source_of_truth: docs/capabilities/project-files/product-spec.md
---

# Project Files 产品规格

## PFL-001 真实项目根

用户选择的真实目录形成 CreatX 项目身份和默认工作上下文。Renderer 只传稳定项目 ID，Main 解析真实根；项目根不被描述为 Cline 工具沙箱。

## PFL-002 文件是内容事实

扫描、读取和预览直接使用项目中的真实文件。CreatX 不把正文复制进数据库，也不创建 Work/Artifact 身份。

## PFL-003 骨架文件投影

第一条骨架允许获批的 Cline 原生工具写入一个真实文件；CreatX 随后扫描或刷新并向文件/预览界面返回该文件。外部修改后再次刷新必须读取新内容。

## PFL-004 CreatX 文件命令边界

CreatX 自有 Project File Query/Command Port 只接受 Main 已注册的项目 ID、文件 ID 或项目相对路径，并拒绝无效项目、绝对路径、`..` 和符号链接/Junction 逃逸。Query Port 提供刷新、预览和内部字节读取；Command Port 提供文本/二进制写入。该规则不改变用户已经批准的 Cline 原生文件或 Shell 工具的全机信任性质。

## PFL-005 写入与冲突边界

CreatX 自有写入先在目标目录生成临时文件，再以 Rename 替换目标。调用方可以传入读取时的 `expectedModifiedAt`；目标不存在或修改时间已经变化时必须以 `file_conflict` 失败，不得覆盖较新的外部内容。这个门禁不是版本历史、合并算法或严格事务。

## PFL-006 V1 后续范围

可靠监听、内容级冲突处理、每次修改版本、回收站和恢复属于 V1 最终目标，但不属于当前共享 Port。未实现前不得在 UI 或文档中宣称可用。

## PFL-007 安全目录查询

内部能力可以按 `projectId + relativePath` 查询真实目录的直接子项，包括空目录；查询必须区分普通内容视图和明确的内部元数据读取。两种模式都拒绝绝对路径、`..`、目标是文件和符号链接/Junction 逃逸。内容模式的隐藏规则只由 Project Files 实现，Workbench 和 Renderer 不复制过滤列表。

## PFL-008 Create-only 写入

Project File Command Port 必须能表达“仅当目标不存在时创建”。目标已经存在时返回 `file_conflict`，不得覆盖；并发创建同一路径最多一个成功。该语义用于创建带随机 ID 的元数据记录，不等于通用事务或数据库唯一索引。

## PFL-009 便携导出枚举

Project Files（项目文件）拥有便携包的内容枚举边界：返回项目内普通作品与源码、空目录和规范相对路径，固定排除 `.git / .creatx / node_modules`、诺文临时文件、系统缓存和符号链接/Junction。排除目录和链接不得为统计大小而递归扫描；摘要分别报告可直接测量的排除文件字节数和未扫描项数量。其他模块不得复制过滤规则或通过绝对路径绕过枚举。

## PFL-010 导入提交与登记分离

项目包 Runtime 可以在用户授权的新目录旁创建受控暂存目录，但只有完整校验和原子目录提交成功后才能让 Project Files 打开真实根。Project Catalog（项目目录登记）只保存路径和便携身份，不成为文件内容权威；路径缺失不能触发猜测、移动或删除。
