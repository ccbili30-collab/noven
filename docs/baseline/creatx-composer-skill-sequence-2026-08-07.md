---
title: CreatX Composer Skill 挂篮基线
doc_type: baseline
capability: creative-skills
status: implemented-fixture-live-external-provider-pending
verified_at: 2026-08-07
---

# CreatX Composer Skill 挂篮基线

## 已实现

- Composer 上沿增加小型 Skill 挂签，点击后向上展开挂篮；关闭态不占用输入框旁的常驻横向空间。
- 挂篮支持添加、逐槽选择、重复使用、原生选择、上移、下移和删除，最多十二项。挂签旁有独立的一次性总启用按钮；只有明确启用后，已选择插槽才随下一条消息发送。消息提交时总启用立即自动取消，插槽继续保留；运行中可查看但禁止修改。
- 挂篮按 Cline Session ID 保存于版本化 Renderer Local Storage（本地存储）；切换会话隔离，切回恢复，发送后不清空，删除会话时清除对应偏好。V1 序列自动迁移为全部已选择；一次性总启用不持久化，切换会话后保持关闭。
- `SendMessageCommand` 携带可选冻结序列；普通 Steer 不附带序列。
- Main 通过唯一 Creative Skills 注册表校验正式可排队 Skill，拒绝未知名称、Growth 路线、超过十二项、与斜杠命令组合及未终结 Growth Goal 冲突。
- Cline Adapter 在同一个正式会话中串行执行多轮。首轮投影唯一用户原话，后续使用内部续轮标记；中间 Assistant 回复进入同一回合详情，最后一轮成为正式回复。
- 任一轮非完成或取消后停止剩余序列；所有轮次沿用当前 Session Tool Policy（工具策略），不提升权限或创建第二套运行内核。
- 第一版注册：`creatx-novel-start`、`creatx-study`、`creatx-draw-map`、`creatx-draw-comic`。未生产化因果和候选 OC 能力没有伪装入口。

## 验收

- `bun typecheck`：通过。
- 定向测试：67 / 67，通过，466 次断言。
- `bun test`：324 / 324，通过，2,197 次断言。
- `bun run test:imports`：Cline 与 Node strip-types 导入边界通过。
- `bun run build:preview:web`：通过；Chromium 宽/窄视觉探针 0 页面错误、0 Console 错误。
- `bun run build`：Main、Preload、Renderer 生产构建通过。
- `bun run test:desktop`：2026-08-08 DESKTOP PASS。真实 Electron UI 验证会话 B 配置、会话 C 为空、切回 B 恢复；一次性总启用默认关闭、用户勾选后通过 Composer 正式发送、提交时立即自动取消且槽位保留；生产 IPC 通过本地 Provider Fixture（测试夹具）执行 `study -> draw-map` 两轮，Timeline 只有一条正式用户消息和两条 Assistant 回复；进程退出与 Growth 重启基线继续通过。
- 本批未使用外部真实 Provider，因此以上序列执行属于生产链 + Fixture 证据，不是创作质量 Live（真实运行）。

## 未完成与风险

- 未验证外部 Provider 是否稳定按要求首先加载每轮 Skill、正确承接前轮真实产物并形成合格最终汇报。
- 第一版不保存活动序列的当前槽位；应用在中途退出或崩溃后保留 Cline 历史和项目文件，但不自动从精确 Skill 继续。
- 序列偏好是设备本机 UI 偏好，不是项目文件或跨设备同步状态。
- 未生产化 Skill 只有进入同一注册表并具备安装、失败和验收合同后才能出现在选择器中。

## 恢复入口

- 产品规则：`docs/capabilities/creative-skills/product-spec.md` 的 `CSK-007` 至 `CSK-009`。
- 验收规则：`docs/capabilities/creative-skills/acceptance.md` 的 `ACC-CSK-008` 至 `ACC-CSK-013`。
- 讨论记录：`docs/discussions/2026-08-07-composer-skill-sequence.md`。
- 实施计划：`docs/plans/2026-08-07-composer-skill-sequence.md`。
