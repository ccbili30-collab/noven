# 艺术库主线整合基线（2026-08-10）

## 整合范围

- 权威根：`D:\CodexW\Creatx\creat1`
- 主线分支：`topic-genre-style`
- 主线检查点：`7a2cd98 feat(desktop): checkpoint integrated workspace fronts`
- 艺术库来源分支：`art-library-live`
- 来源共同基点：`285c0182934b70cb20db874084c8cad6f3b6dcc1`
- 整合后功能头：`1e7aef6443ddfd17e14b62b399b103509af640b7`

主线检查点先收束了会话即时切换、Workbench V3 可见范围和工作台视觉批注。随后按来源顺序完整移入艺术库 15 个线性提交；来源 Worktree 中未跟踪的地图、长跑、`output/` 与原型产物不属于本次 Change Set（变更集），没有进入主线。

## 提交映射

| 来源提交 | 主线提交 |
| --- | --- |
| `a5477f6` | `5652ed3` |
| `c0f5864` | `dcffb59` |
| `941fff1` | `1ef0fa6` |
| `25169e8` | `94c7400` |
| `425b94f` | `4c68c5e` |
| `829e3b8` | `b092e4b` |
| `cc6bdbb` | `a11aacd` |
| `35d903a` | `6766674` |
| `05aee36` | `dff350c` |
| `13516af` | `284db1c` |
| `d1b69c3` | `abcb1f9` |
| `af05dbe` | `7762cce` |
| `3baae1d` | `f2b5e4a` |
| `63482ec` | `81c9de2` |
| `6860907` | `1e7aef6` |

## 冲突解决不变量

- `main.ts` 同时保留工作台可见范围工具、项目文件查询、艺术回合来源以及工作台截图和取色 API。
- `attachments.ts` 同时支持磁盘附件和 Main 生成的内存 PNG；真实字节统一经过 `authorizationBytes()`，并同时生成 Cline `userImages` 与带显示名、字节和 SHA-256 的 `imageSnapshots`。内存 PNG 不访问不存在的磁盘路径。
- `WorkspaceShell.tsx` 使用真实艺术库开关、revision 和 API；打开艺术库继续经过 `afterSave → afterAnnotation`，并保留视觉批注离开确认与会话即时切换语义。
- `CONTEXT.md` 并列保留主线三个前沿与艺术库前沿，不用后者覆盖前者。

## 验收证据

- 合并定向：52/52，通过，250 次断言。
- Renderer（渲染层）：124/124，通过，598 次断言。
- 最终全量：523/523，通过，3,646 次断言，71 个测试文件，约 100 秒。
- `bun run typecheck`：通过。
- `bun run test:imports`：两项导入边界通过。
- `bun run build`：通过。
- `git diff --check 7a2cd98..1e7aef6`：通过。
- Electron（桌面运行壳）：会话可见切换 18 ms，消息仅进入目标会话；工作台截图 12/12；工作台批注覆盖 PNG、滚动 Markdown 与隔离 HTML；艺术库三种来源、审批、导出、重启恢复和受限协议负向路径通过；诺文品牌与 Composer 验收通过。

艺术库 Electron 验收中的三种来源为聊天附件、项目文件和 Web；63 条旧种子进入候选。正式艺术库 Profile（配置档案）前后摘要不变，Provider（模型服务）调用为 0。

## 未完成与边界

- 没有外部视觉 Provider Live（真实运行）证据：真实模型看图整理、替换 `SCENE` 后的纯文字画风保持、工作台视觉批注后的真实模型回复仍未验证。
- 本轮没有运行完整 `test:desktop`。既有旧断言仍要求隐藏当前产品已经明确常驻的最右工作台导航，不能将该旧断言失败描述为本次功能回归。
- 本轮没有生成或验证 Windows 安装包、Portable（便携版），也没有推送。
- 本基线证明艺术库支线与三个主线前沿在当前源码头完成整合和所列验收，不代表外部 Provider 或发布链路已经完整闭环。

## 恢复入口

后续工作从本文件、`CONTEXT.md` 和功能头 `1e7aef6` 恢复。若要发布，必须从包含本整合留档提交的冻结头重新执行版本、Windows 打包、归档完整性和打包程序冒烟验收；不得复用艺术库支线 Worktree 的未跟踪产物。
