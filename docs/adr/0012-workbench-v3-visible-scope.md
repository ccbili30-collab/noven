# ADR-0012：Workbench V3 保存可见范围

## Status

Accepted

日期：2026-08-10

## Context

注册工作台原本总是投影整个真实文件夹子树，只额外隐藏 JSON 实现文件。用户需要让 AI 把一个工作台限定为特定文件范围，并明确要求一个布尔开关决定未来符合规则的新文件是否自动加入。

可见范围会改变 `.creatx/workbenches/<id>.json` 的持久合同。把字段追加到 V1/V2 会破坏它们的严格未知字段门禁；把规则放进 Renderer 或 Prompt 会形成第二权威，也无法可靠恢复。

## Decision

- 新增严格 Workbench V3；V1/V2 保持原样读取，不后台迁移。
- V3 保存 `visibility.include`、`visibility.exclude` 和 `visibility.autoIncludeNewFiles`，并可选保留 V2 的交互主页。
- 模式是注册文件夹内、使用 `/` 的相对文件路径，只支持普通段、`*`、`?` 与完整段 `**`。Windows 匹配不区分大小写，排除优先。
- `autoIncludeNewFiles=true` 时每次 Projection（投影）按规则读取当前真实文件；`false` 时同次写入冻结当前匹配文件的相对路径清单。清单不是内容副本，不让缺失文件继续出现。
- 规则只裁剪 registered workbench；`builtin:files`、真实文件和公开 `WorkbenchProjection` 合同不变。
- `set_workbench_visibility` 是唯一写入口，使用既有项目作用域、审批、串行队列、修改时间冲突门禁和原子写入。
- 注册工作台既有 JSON 隐藏规则不可绕过。规则若隐藏已登记主页则整次写入失败；工作台主页和临时展示也不能打开被规则隐藏的文件。
- 自动规则最多 64 条包含和 64 条排除模式；冻结清单最多 10,000 个文件。超限失败关闭，避免记录与匹配成本无界增长。

## Consequences

- 同一真实目录可以拥有稳定、可恢复的策展范围，而不建立第二内容模型。
- 关闭自动加入后，文件改名等同于旧文件消失和新文件出现，因此不会自动进入冻结工作台。
- 旧客户端不认识 V3 时会隔离该条记录；它不会显示一个忽略规则的错误工作台。升级属于显式用户操作触发，不做不可逆批量迁移。
- 第一版不提供手动配置 UI，也不向 Renderer 扩展规则合同；AI 工具自主选择仍需真实 Provider 验收后才能称为 Live（真实运行）。

## References

- `../discussions/2026-08-10-workbench-visible-scope.md`
- `../capabilities/workbench-registry/product-spec.md`
- `../capabilities/workbench-registry/workbench-v3.schema.json`
- `0002-project-files-are-the-content-model.md`
- `0007-workbench-registration-v1-schema.md`
- `0010-workbench-v2-interactive-home.md`
