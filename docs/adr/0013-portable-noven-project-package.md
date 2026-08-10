# ADR-0013：便携诺文项目包使用净化交换格式

## Status

Accepted

日期：2026-08-10

## Context

用户需要把一个诺文项目导出给其他人，使接收方同时看到真实作品、工作台组织、项目简介和精选协作案例。现有 Live Archive（真实运行档案）用于把隔离完整运行晋升到同机正式 Profile（配置档案），会协调 Cline、Growth 与图片任务数据库；它不是面向不受信任接收方的分享格式。

项目文件仍是内容权威，Cline 仍拥有原生消息、Run、工具协议和数据库。直接复制项目文件夹只能恢复文件；直接复制 Cline SQLite 或 Profile 会泄露隐藏上下文、权限、凭据和个人设置，并把历史文字错误地恢复为可执行会话。

当前项目列表主要由会话和内存路径形成。一个只有导入案例、尚未创建本地会话的项目需要独立、轻量的重启入口。

## Decision

### 独立 Runtime

- 新建有界 `project-package-runtime`，拥有 `.np` V1 Schema（数据合同）、规范摘要、ZIP 流式读写、暂存、完整性、双身份、幂等和冲突。
- 不扩展 `live-archive-runtime` 承担用户分享；两者不共用 Manifest、数据库导入或状态机。
- Electron Main（主进程）协调系统文件/目录选择、取消、进度和最终登记；Renderer（渲染层）只使用稳定 CreatX 合同。

### 事实所有权

- `project-files` 独占内容枚举和项目根安全边界；`files/` 是包内唯一内容权威。
- `workbench` 从当前权威记录生成净化交换格式，导入语义损坏时忽略记录并回退内置文件视图。
- `cline-adapter` 独占来源会话读取，只输出白名单案例投影；项目案例标记通过 Adapter 管理的会话关联元数据持久化。
- 导入案例由项目包能力以只读交换记录保存，不写入 Cline SQLite，不进入搜索、上下文、指令或权限。
- 受控项目元数据拥有项目简介、便携身份和导入案例；它不复制正文。
- 新增 Project Catalog（项目目录登记）保存本机路径、便携身份、来源、包身份和缺失状态，使无会话项目可重启恢复。它不保存文件或消息。

### 身份与提交

- 包内 `projectId` 表示来源血统；`packageId` 由规范内容确定性生成。Project Catalog 分别保存本地项目身份和 `importedProjectId + importedPackageId` 来源双身份，确保同一包即使曾作为副本导入也能幂等定位。副本使用新本地 `projectId`、保留 `forkedFromProjectId`，首次再导出时形成新身份下的新 `packageId`。
- 导入到用户选择的新目录旁暂存。只有预检、解压和真实字节校验全部通过后才原子提交、登记和加载。
- V1 导出先在目标同目录写完并复核临时包，再以硬链接 create-only 发布；不支持硬链接的位置失败关闭。不能使用会覆盖同名目标的 Node `rename()`，也不能用崩溃后可能遗留空文件的占位方案冒充原子提交。
- `.np` 是标准 ZIP，但后缀不构成信任。V1 使用 SHA-256 验证完整性，不验证作者身份，不执行导入内容，不自动调用 Provider（模型服务）。

### 继续创作

- `conversations/*.json` 是净化只读案例，不是会话恢复格式。
- 用户审阅 `continuationBrief` 后，系统创建新普通项目会话，并把说明作为第一条可见用户消息。旧案例不写入、不获得授权，也不复制旧模型隐藏上下文。

## Consequences

### Positive

- 分享格式可理解、可校验，不泄露整个 Profile 或把历史变成授权。
- 文件、工作台、会话和项目登记各有单一写入所有者。
- 同内容可确定性识别，导入失败不会留下半项目。
- 项目首页与案例在没有 Provider、没有新本地会话时仍可查看。

### Negative

- 需要新的版本化交换 Schema、Project Catalog 和 Cline 白名单投影。
- V1 无法证明包作者，更新版本不能覆盖或合并既有项目。
- 固定排除 `node_modules` 等环境目录后，某些源码项目导入后需要用户自行恢复依赖。
- V1 普通 ZIP 最多 60,000 个项目条目、2 GB 未压缩内容；导出原子发布要求目标文件系统支持硬链接，部分 U 盘和网络盘需改选普通本机磁盘。
- V1 结构化 JSON 单项最多 128 MB，异常压缩比超过 1,000:1、Windows 设备名/备用数据流和链接条目失败关闭；这些限制优先于导入任意第三方 ZIP 的兼容性。
- 目录已经提交但元数据或目录登记失败时会保留文件并记录 `committed-unregistered`，因此 Desktop 必须提供恢复提示，不能只用成功/失败二态隐藏该边界。

### Deferred

- 作者签名、联网发布者身份、拖入导入、自定义排除、项目升级/合并、差异包、后台导入和导入历史续写。

## Alternatives Considered

- 只压缩整个项目文件夹：拒绝，因为无法携带净化案例、受控简介、工作台语义、身份和冲突合同。
- 直接复制 Cline/Profile 数据库：拒绝，因为泄露隐私与权限，并产生跨设备数据库兼容和双写权威。
- 复用 Live Archive Manifest 与晋升器：拒绝，因为其信任对象、数据范围、接收时机和失败语义都不同。
- 把导入案例恢复为可继续的原生会话：拒绝，因为历史文字会重新进入上下文和权限链，且无法诚实恢复旧模型内部状态。
- 只依赖路径重建项目列表：拒绝，因为跨设备路径不稳定，无会话导入项目也无法重启恢复。

## References

- `docs/discussions/2026-08-10-portable-noven-project-package.md`
- `docs/capabilities/import-export/product-spec.md`
- `docs/capabilities/session/product-spec.md`
- `docs/adr/0002-project-files-are-the-content-model.md`
- `docs/adr/0005-cline-is-the-sole-agent-harness.md`
