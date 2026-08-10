# ADR-0007：注册工作台 V1 使用独立声明式记录

## Status

Accepted

日期：2026-07-27

## Context

CreatX 已接受真实项目文件是唯一内容模型，`.creatx/` 只能保存可丢失的视图元数据。第一条注册工作台闭环需要同时满足：同一文件夹最多一条注册、单条损坏不拖垮全部工作台、重复注册幂等、文件不移动、重启恢复，以及未来可以识别不兼容版本。

内置“文件”工作台必须在没有 `.creatx` 时工作。它若也持久化为特殊记录，会引入首次打开写盘、不可删除特殊记录、损坏后兜底入口消失和迁移分支，没有对应用户价值。

## Decision

### 内置工作台

- 内置“文件”工作台由 Runtime（运行时）生成，ID 固定为 `builtin:files`，不写入 `.creatx`。
- 持久化工作台 ID 禁止使用 `builtin:` 前缀。
- 内置“文件”始终排在第一位并使用 Project Files 的统一内容隐藏规则。

### 记录位置与最小 Schema

每个注册工作台使用一个独立 UTF-8 JSON 文件：

```text
.creatx/
└─ workbenches/
   └─ wb_<uuid>.json
```

V1 唯一允许的结构为：

```json
{
  "schemaVersion": 1,
  "id": "wb_550e8400-e29b-41d4-a716-446655440000",
  "folder": "世界",
  "title": "世界"
}
```

字段规则：

- `schemaVersion` 必须严格等于整数 `1`。
- `id` 由 CreatX 生成，采用 `wb_<uuid>`，必须与文件名（不含 `.json`）一致；`builtin:*` 永久保留。
- `folder` 是非空、非项目根的项目相对目录，持久化时统一使用 `/`；拒绝绝对路径、`.`、`..`、空段、文件路径和符号链接/Junction（目录联接）逃逸。
- `title` 可省略；存在时必须是去除首尾空白后的 1 至 120 字符字符串。省略时从 `folder` 最后一级生成显示标题。
- V1 拒绝未知字段，不保存时间戳、模板、布局、封面、图标、父 ID、页面、组件或内容类型。

字段结构的机器可读权威是 `docs/capabilities/workbench-registry/workbench-v1.schema.json`。路径存在性、目录类型、符号链接边界、文件名与 ID 匹配、文件夹唯一性和跨记录冲突由 Runtime 强制，因为 JSON Schema 无法独立表达这些项目状态规则。

### 身份、幂等和并发

- 同一平台上规范化后相同的 `folder` 只能有一条有效注册；Windows 比较不区分大小写，但保留真实路径大小写用于展示。
- 同一文件夹的重复注册返回已有 ID 和 Projection，不写新记录、不更新标题、不改变修改时间。改名由显式 `rename_workbench` 命令完成，不能偷渡进注册。
- Workbench Command Port（工作台命令端口）按项目串行化注册操作；元数据文件使用 Project File Command Port 的 create-only（仅创建）语义和原子 Rename 写入。
- 外部手工制造的重复记录全部进入冲突诊断，不任意选择一条作为权威。

### 加载、缺失和版本

- Loader（加载器）逐文件解析并校验；一条损坏记录不能阻止其他记录和内置“文件”加载。
- 合法记录指向缺失文件夹时产生 `missing` Projection，保留 ID、标题和原路径，不读取或伪造内容。
- JSON 损坏、ID/文件名不一致、字段非法、重复文件夹和未知 `schemaVersion` 产生结构化诊断；对应记录不成为可用工作台。
- V1 不自动迁移、不自动重写旧记录。未来版本必须新增明确迁移设计；旧客户端面对未知版本只诊断并失败关闭。

### 工具和界面入口

- `register_workbench` 是 `workbench-registry` 拥有的项目作用域中立工具，不属于通用 Creative Skill。
- 工具输入只包含 `folder` 和可选 `title`，审批为 `required`；工具只能通过 Workbench Command Port 执行业务规则。
- `rename_workbench` 使用已注册的 `folder` 和新 `title` 定位并更新同一记录，审批同样为 `required`；不得改变 ID、文件夹或真实内容。
- 首批只实现 AI 入口。工具成功后 Renderer 重新读取 Workbench Projection，立即显示工作台标签和通用文件夹视图。
- 内置“文件”和注册工作台位于工作台标签区；窄幅“文件/预览”继续保留，二者引用同一真实文件身份。

## Consequences

### Positive

- 单条损坏被隔离，普通文件入口和其他工作台仍可恢复。
- UUID 身份不绑定文件夹路径，未来重新定位或 CreatX 内重命名时可以保留工作台身份。
- 注册工具、桌面 UI 和未来 Skill 共享一个业务规则与 Port，不需要解析 JSON 或持有绝对路径。
- 删除整个 `.creatx` 只丢失策展视图，不影响真实项目内容和内置“文件”。

### Negative

- 加载时需要安全枚举多个 JSON，并处理重复 ID、重复路径和局部损坏。
- 现有 Project File Port 需要增加目录扫描和 create-only 写入语义。
- 首批没有修复、迁移、重新定位或删除 UI；损坏与缺失只能明确展示，不能在本批次内修复。
- Windows 路径身份比较与跨平台大小写语义未来仍需迁移测试。

## Alternatives Considered

### 单一 `.creatx/workbenches.json`

拒绝。一次损坏会使全部注册不可读取，每次更新竞争同一个文件，并扩大冲突和恢复范围。

### 在每个真实文件夹内放置配置

拒绝。它会污染用户内容目录，破坏集中元数据边界，并让移动或复制普通文件夹隐式改变注册事实。

### 为内置“文件”写特殊记录

拒绝。内置兜底能力不应依赖自身需要兜底的元数据目录。

### 用规范化路径哈希作为工作台 ID

拒绝。文件夹重命名会被迫改变工作台身份，不利于未来安全重新定位和引用更新。

## References

- `docs/adr/0002-project-files-are-the-content-model.md`
- `docs/adr/0006-minimal-capability-ports-before-worktrees.md`
- `docs/discussions/2026-07-27-register-workbench-v1-discovery.md`
- `docs/capabilities/workbench-registry/product-spec.md`
- `docs/capabilities/workbench-registry/workbench-v1.schema.json`
