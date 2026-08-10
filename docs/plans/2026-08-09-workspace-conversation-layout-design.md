# Workspace Conversation Layout 与本机消息操作设计

状态：设计已确认；用户已授权进入实现，生产修改尚未开始。

主要能力线：`workspace-ui`

相邻合同：`session`、现有附件授权、Cline Adapter 投影

来源：`../discussions/2026-08-09-project-chat-workbench-layout-and-message-controls.md`

## 1. 目标和边界

目标是让项目、对话、作品和工作台导航保持稳定空间关系，并补齐桌面软件常见的文件拖入与本机用户消息整理能力。

允许修改 Renderer 布局、布局偏好、本机消息可见性偏好、稳定 Desktop IPC（进程间通信）附件入口、普通项目会话显示名分配及对应测试。不得修改 Cline Harness（智能体运行框架）消息权威、Provider 行为、项目文件内容、Growth 协议或工具副作用。

完成标准是 `WUI-043 / ACC-WUI-061..063` 与 `SES-014 / ACC-SES-021` 获得真实生产 Renderer 接线和比例匹配的 Electron 验证。Web Preview、Fixture（测试夹具）或单元测试不能单独形成 Live（真实运行）完成声明。

## 2. 四栏布局与响应模式

Wide（宽屏）固定四栏顺序：

```text
ProjectNavigation | ConversationPanel | CreationStage | WorkbenchTree
```

组件身份不随 Chat / Workbench 模式改变，只改变有效宽度和可见性，避免流式对话、草稿、画布、编辑器和滚动状态因 DOM 重排而重建。最右 WorkbenchTree 的收起控制朝右，折叠恢复控制朝左。

左导航允许从当前保存宽度连续拖到 `52px`。在拖动达到折叠宽度时提交 `leftOpen=false`，同时保存拖动开始前的展开宽度；重新打开恢复该宽度。低于完整文字可读宽度时，标签单行省略、低频动作收拢，但不产生水平滚动。`52px` 是折叠状态，不把完整导航强行渲染在 52px 中。

空间分配优先级：Chat 和 CreationStage 是主工作表面，两侧导航是 Supporting Context（辅助上下文）。可用空间不足时先折叠 ProjectNavigation，再折叠 WorkbenchTree；仍不足时进入窄桌面模式，一次只保留 Chat 或工作台画布为主表面，但提供明确切换和返回路径。跨模式保留当前项目、会话、工作台、文件、编辑草稿、Composer 草稿、附件、滚动、焦点意图和运行状态。

布局偏好升级到新版本键；旧宽度在读取时转换并限制到当前窗口安全范围，不保留旧 Workbench 模式的栏位重排语义。

## 3. 项目和会话显示

ConversationPanel 顶部标题改为项目名称；当前项目会话标签仍使用 Session 显示名。ProjectNavigation 在项目下投影会话，不再投影工作台。工作台选择、目录和资源只由最右 WorkbenchTree 拥有。

普通项目会话创建时由 Main 的单一写入边界分配 `创作（n）`。计数按项目持久、单调递增，删除和重命名不回退。计数不能只从当前会话列表求最大值，否则删除最高编号后会复用；实现必须使用用户级持久计数器，并由 Main 串行更新。显示名仍写入 Cline Session 元数据，Session ID、项目归属和历史不变。

系统或内部会话继续使用显式标题，不进入普通计数器。既有标题不迁移。用户可通过 Session 行右键菜单和非右键替代路径进入同一重命名命令；运行中会话沿用现有失败关闭规则。

## 4. 文件拖入附件数据流

Chat 面板处理 `dragenter / dragover / dragleave / drop`，仅在操作系统文件存在时进入附件覆盖态。工作台和导航不是有效目标。Escape 清除覆盖态，不修改附件列表。

Preload 使用 Electron `webUtils.getPathForFile()` 从真实 `File` 取得操作系统路径，再调用专用 Desktop IPC。Renderer 不直接接收路径，也不能传字符串伪造文件。Main 校验每项非空、为普通文件、数量与当前待发送附件合计不超过 20，然后把路径送入现有 `AttachmentAuthorizationStore`，返回既有 `AttachmentReference`。

新增附件与文件选择器结果使用同一去重、展示、移除、发送和消费路径。部分文件失败时整次 Drop（拖放）失败关闭，不留下半批授权；草稿、已有附件和焦点不变。发送前文件消失或变化继续由现有授权解析边界拒绝。

## 5. 本机消息可见性与重新发送

Renderer 保存 `sessionId + TimelineItem.id` 的隐藏集合。该集合只是本机 UI Preference（界面偏好），不进入 Cline 消息、Runtime 或 Prompt。Timeline 投影先保持 Cline 原始顺序和工具配对，再在最终用户消息显示层过滤隐藏 ID，Assistant、工具和状态不被连带隐藏。

删除成功后立即隐藏，并在首次使用时明确说明 AI 仍保留历史。修改把原文放回 Composer，保存目标消息 ID；用户取消时清除编辑状态且原消息不变。用户发送修改内容或重发时先产生正常 Optimistic Message（乐观消息），再隐藏原消息；Desktop 命令失败则撤销新乐观项并恢复原消息。发送成功不改变既有回复和副作用。

消息动作使用可聚焦按钮和上下文菜单共享同一命令，Hover 只显示快捷控件而不是唯一入口。运行、等待审批或取消中禁用修改和重发；删除仍只改变本机显示，但不得让焦点落在被移除节点中。

## 6. 测试与真实验收

自动规格至少覆盖：

- 四栏 DOM 顺序在 Chat / Workbench 切换中不变；左右导航折叠方向正确。
- 左导航连续拖到 52px 后进入折叠，重新展开恢复拖动前宽度；键盘调整具有等价边界。
- 1360×860、900×700、860×620 及窗口缩放时按既定优先级折叠，状态不丢失。
- 项目下只出现所属会话；顶部显示项目名；最右导航只出现当前项目工作台。
- 项目计数器跨重启、删除、重命名和并发请求保持单调且不复用；系统会话不占编号。
- 真实 File Drop 不能由字符串路径伪造；文件夹、超量、不可读和部分失败零副作用。
- 删除只过滤用户消息；重启后保持；修改取消、发送失败和重发失败恢复原消息；AI 历史读取完全不变。
- 鼠标、右键、键盘、焦点返回、长项目名、长会话名和 150% 缩放。

真实 Electron 验收使用隔离 Profile，不调用外部 Provider；拖入真实临时文件并观察待发送附件即可验证本批新边界。修改/重发的 Provider 终态不是本批新增语义，但必须证明请求仍走真实 `sendMessage` 路径，不能用本地回复冒充。

## 7. 停止条件

若实现需要修改 Cline 消息文件、Cline Core 私有类型、公开 Session 协议、项目文件格式或 Provider 语义，立即停止并重新评审。若本机隐藏 ID 在真实投影中不稳定，也不得用消息文本或数组位置猜测身份，必须先建立稳定显示合同。
