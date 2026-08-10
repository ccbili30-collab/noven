---
title: Workbench Registry 产品规格
doc_type: capability-product-spec
owner: workbench-registry
status: unregister-runtime-verified-provider-electron-open
last_verified: 2026-08-11
source_of_truth: docs/capabilities/workbench-registry/product-spec.md
---

# Workbench Registry 产品规格

## WBR-001 内置文件表面

每个项目始终有一个固定 ID 为 `builtin:files` 的内置“文件”工作台。它在打开或创建项目时由系统生成，固定排在工作台标签第一位，不能删除，不写 `.creatx`，并使用 Project Files 拥有的统一隐藏规则展示真实文件和文件夹。

## WBR-002 同一文件身份

窄文件面板、简单预览和未来完整“文件”工作台引用同一个 `projectId + relativePath` 文件身份；工作台不保存正文或图片副本。

## WBR-003 骨架按需展示

第一条骨架只要求 AI 写入的一个真实文件能在右侧文件与预览中打开。完整注册工作台、布局组件和封面绑定不阻塞真实会话链。

## WBR-004 注册只改变视图

未来工作台注册只写 `.creatx/` 视图元数据，不移动、复制或重新定义真实文件，也不产生 Work/Artifact 身份。

## WBR-005 Schema 门禁

`.creatx` V1 Schema 已由 ADR-0007 接受。生产读写必须严格遵守该版本；计划、Fixture Parser 或局部单元测试仍不能作为注册能力已实现或 Live 的证据。

## WBR-006 V1 独立记录

每个注册工作台使用 `.creatx/workbenches/<id>.json` 中的一条声明式记录，字段只包含 `schemaVersion`、`id`、项目相对 `folder` 和可选 `title`。V1 不允许脚本、模板、布局、封面、页面、组件或内容类型；持久 ID 不得使用 `builtin:` 前缀。

## WBR-007 一个文件夹一个注册

同一规范化真实文件夹最多一条有效注册。重复注册返回已有 ID 和当前 Projection，不写新文件、不更新标题、不改变元数据修改时间。多条外部记录冲突时不任意选择赢家。

## WBR-008 通用文件夹工作台

V1 注册工作台只使用一个内置通用视图：显示标题、项目相对路径和真实文件夹子树，按子目录层级组织文件。未指定标题时使用路径最后一级名称。窄文件面板、预览、内置“文件”和注册工作台继续引用同一真实文件身份。

## WBR-009 缺失与损坏隔离

合法记录的文件夹缺失时保留 `missing` 工作台 Projection，明确显示原路径，不猜测、不删除、不伪造内容。单条 JSON 损坏、字段非法、重复路径或版本不支持时产生非阻塞诊断并跳过对应记录；内置“文件”和其他有效工作台继续可用。

## WBR-010 真实注册工具

`register_workbench` 是本能力线拥有的项目作用域中立工具，输入只包含 `folder` 和可选 `title`，必须使用 Cline 原生审批并通过 Workbench Command Port 执行。工具只有在真实 `.creatx` 原子写入和重新加载成功后才能返回成功。

## WBR-011 首批入口

第一条纵向闭环只支持用户在项目会话中要求 AI 注册，暂不提供 Renderer 手动注册按钮。批准后 Renderer 必须立即重新读取工作台投影；退出并重启应用后从真实 `.creatx` 恢复。

## WBR-012 V1 迁移边界

V1 只读取 `schemaVersion: 1`，不自动迁移或重写未知版本。未来 Schema 变化必须新增迁移设计和兼容验收，旧客户端只能诊断并失败关闭。

## WBR-013 显示标题纠正

`folder` 是真实目录绑定和注册唯一键，`title` 是独立的可变显示属性。AI 可以在首次注册时选择与文件夹名不同的清晰标题；用户纠正后，`rename_workbench` 只更新同一记录的 `title`，保持 ID、`folder` 和真实内容不变。重复 `register_workbench` 不承担改名语义。

改名必须使用 Cline 原生审批和 Workbench Command Port，并使用 Project File Command Port 的修改时间冲突门禁。内置“文件”、未知工作台、损坏或冲突记录、非法标题和并发外部修改失败关闭。工具成功后 Renderer 立即重新读取投影，重启后从同一记录恢复新标题。

## WBR-014 V2 默认主页

V2 在 V1 身份、文件夹和可选标题之外增加唯一的 `home`：`entry` 是注册文件夹内的项目相对 HTML 文件，`mode` 固定为 `interactive`。Loader 同时严格读取 V1 与 V2；设置主页时以原子冲突门禁把 V1 重写为 V2，重复设置相同主页不写盘。改名保留 V2 主页。

主页必须是注册文件夹内真实存在的普通 `.html` 文件。绝对路径、空段、`.`、`..`、非 HTML、目录、缺失文件和文件夹边界逃逸失败关闭。主页后来缺失时保留工作台和主页声明，但 Projection 标记主页缺失，不能显示空白成功状态。

## WBR-015 AI 展示命令

`set_workbench_home` 持久改变工作台默认入口，必须审批；`show_in_workbench` 只向当前项目和当前会话发布一次展示请求，自动执行且不写 `.creatx`。两者都只能引用已经注册的工作台文件夹及其内部真实 HTML 文件。AI 不得直接编辑 `.creatx` 注册 JSON。

## WBR-016 交互内容安全边界

HTML、CSS、JavaScript、JSON、图片、字体和媒体仍是普通项目文件。桌面端只通过一次性、不透明、绑定工作台文件夹的只读资源令牌提供内容；资源不能越出该文件夹。交互 iframe 使用独立 Origin（来源）且不暴露 Preload（预加载桥）、Electron、Cline、凭据或写文件能力。CSP 禁止外部网络、表单、弹窗、对象嵌入、顶层导航和子框架。

## WBR-017 V3 可见范围

已注册工作台可以通过严格 V3 记录保存唯一 `visibility`。它只裁剪该工作台的文件 Projection，不移动、复制、删除、改名或重写真实文件；内置 `builtin:files` 不接受筛选并继续作为完整普通文件兜底。Renderer 只消费过滤后的既有 `entries`，不读取规则或 `.creatx`。

`include` 与 `exclude` 是注册文件夹内的相对文件路径模式，统一使用 `/`。模式只支持普通路径段、`*`、`?` 和作为完整路径段的 `**`；绝对路径、`.`、`..`、空段和超出复杂度上限的输入失败关闭。Windows 匹配不区分大小写。空 `include` 表示允许全部普通展示文件，`exclude` 始终优先；注册工作台既有 JSON 隐藏门禁不能被规则绕过。过滤后只保留拥有可见文件后代的目录。

## WBR-018 新文件开关与冻结清单

`visibility.autoIncludeNewFiles` 默认 `true`。开启时，之后新增且符合 include/exclude 的文件自动出现。关闭时，Runtime 在同一次受控写入前扫描当前工作台，把当时符合规则的真实文件相对路径冻结为 `files`；后续新增文件默认不出现，删除或移走的文件不伪造条目。再次设置规则会以当前真实文件重新计算并原子替换清单。

V1/V2 继续严格读取且不自动改写；首次设置可见范围才原子升级为 V3。V3 的可选主页、标题、ID 和文件夹身份在改名、设置主页与修改规则时必须保留。

## WBR-019 AI 可见范围工具

`set_workbench_visibility` 是项目作用域、需要原生审批的中立工具。输入包含已注册 `folder`、可选 `include`、可选 `exclude` 和可选 `autoIncludeNewFiles`；开关省略时按 `true`。AI 不得直接编辑 `.creatx`。

工具只在严格验证模式、真实目录扫描、修改时间冲突门禁、原子写入和重新加载全部成功后返回成功。未知/内置/缺失/冲突工作台、非法模式或并发外部修改都失败关闭。已有交互主页若会被新规则隐藏，整次修改拒绝且原记录不变；被规则隐藏的 HTML 也不能由 `set_workbench_home` 或 `show_in_workbench` 绕过。

## WBR-020 注销只移除视图入口

`unregister_workbench` 只删除一个已注册工作台对应的 `.creatx/workbenches/<id>.json` 记录，不删除、移动、改名或修改 `folder` 指向的真实目录和任何内容。文件夹已经缺失且 Projection 为 `missing` 的合法注册记录仍可注销；内置 `builtin:files` 永远不可注销。

工具按已注册 `folder` 定位记录，项目作用域且需要 Cline 原生审批。未知工作台、损坏记录、重复文件夹冲突、记录身份变化、记录自读取后发生修改或删除均失败关闭；不得把输入不存在当成注销成功。成功必须以受控元数据删除和重新加载后原 ID 消失为准，并发布工作台投影失效事件。

## WBR-021 当前工作台注销回退

Renderer 重新读取工作台投影后，如果当前选择引用的注册工作台已经消失，必须清除其交互主页与临时展示状态并切换到内置 `builtin:files`。其他工作台、当前项目真实文件和会话不受影响。该回退只响应已加载快照中的确定消失，不在加载中猜测注销结果。
