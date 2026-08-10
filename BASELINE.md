# CreatX Baseline

## Windows 0.1.21 工作台注销发布

2026-08-11 已将功能头 `7a773ae` 发布为 Windows `0.1.21` Setup、Blockmap 和 Portable x64。功能冻结全量 598/598（4,495 次断言）；版本批次的 Typecheck、Import Boundary、Production Build、Windows 打包、7-Zip、`app.asar` 边界和解包 EXE 隔离品牌烟测通过，退出后残留进程为 0。安装包包含 `unregister_workbench`，不包含新手引导原型或 `.np` 生产接线；未安装 Setup、未直接启动 Portable、未调用外部 Provider，也未执行注销审批 Live。证据见 `docs/baseline/creatx-windows-0.1.21-2026-08-11.md`。

## 工作台注销入口

2026-08-11 已接通 `unregister_workbench` 的受控元数据删除、原生审批策略、正式 Desktop 工具聚合和当前入口消失后的 `builtin:files` 回退。真实项目内容不会被注销操作删除或修改，`missing` 入口可清理，冲突与过期状态失败关闭。联合定向 180/180（1,300 次断言）、全量 598/598（4,495 次断言）、Typecheck、Import Boundary 和 Production Build 通过；未执行外部 Provider 或 Electron Live。证据见 `docs/baseline/creatx-workbench-unregister-2026-08-11.md`。

## 传承库与工作台项目引用修复

2026-08-09 已实现 `WUI-046..048 / ACC-WUI-068..070`：内置传承库迁移为四类各五条的版本化 JSON，个人导入分类继续可达；最右工作台导航分隔线恢复指针与键盘调整；对话项目图片、相对文件链接和 Markdown 标题锚点复用真实工作台打开链，非法引用失败关闭。定向 17/17、Renderer 104/104、Typecheck、Production Build 和专用隔离 Electron 通过；全量 476/477 的唯一范围外超时隔离通过，完整 Desktop 在既有布局断言处提前停止。没有外部 Provider、正式 Profile、Windows 打包或迁移。证据见 `docs/baseline/creatx-heritage-workbench-links-2026-08-09.md`。

## 对话打开一次性底部定位

2026-08-09 已实现 `WUI-045 / ACC-WUI-067`：每次真正进入会话后，首次非空历史提交自动定位到底部一次；同一打开周期不因重渲染、重复选择当前会话、窗口缩放或 Chat / Workbench 切换再次触发，离开再进入可重新定位。既有底部流式黏附和上滚停跟保持。Renderer 100/100（477 次断言）、Typecheck（类型检查）、Production Build（生产构建）和隔离 Electron 长历史切换验收通过；没有外部 Provider（模型服务）、正式 Profile 或全仓全量测试。现有 Windows `0.1.17` 发布包早于本修复，不包含该能力。证据见 `docs/baseline/creatx-conversation-open-scroll-2026-08-09.md`。

## Windows 0.1.17 Cline Runtime 隔离发布

2026-08-09 已将 Cline Utility Process（实用进程）隔离修复以 `0.1.17` 生成 Windows x64 Setup、Blockmap 和 Portable。版本资源、SHA-256、未签名状态、两个自解压包完整性和 `app.asar` 导入边界均已核验；解包 EXE 使用隔离 Profile 真实完成跨进程工具往返、Utility 崩溃失败关闭、主窗口存活和退出无残留。发布批次未安装 Setup、未启动 Portable、未修改正式 Profile 或调用外部 Provider（模型服务）；证据见 `docs/baseline/creatx-windows-0.1.17-2026-08-09.md`。

## Cline Utility Process 与重型图片历史性能修复

2026-08-09 已将 Cline Adapter、Session、权限存储和档案恢复从 Electron Main 迁入受监督 Utility Process，并为 `read_files` 项目图片增加单 Run 与 Provider 请求预算。正式 19,262,810 字节历史副本的新回合请求体为 121,317 字节；Main Working Set 保持 7,180,288 字节、增长 0，Cline 子进程从 273,825,792 增至 594,944,000 字节。真实跨进程工具、审批、结果返回、子进程强杀失败关闭、聊天图片和退出无残留通过；全量 470/470（3,361 次断言）、Typecheck、Import Boundary 和 Production Build 通过。没有外部 Provider、Windows 打包或完整 Desktop 全套通过；证据见 `docs/baseline/creatx-cline-runtime-isolation-2026-08-09.md`。

## 创意库分享弹窗关闭与性能修复

2026-08-09 已把创意库分享从等待完整 AI Run 改为只等待 Runtime（运行时）接收，普通 Composer 发送语义不变；选择面在提交期间保持可关闭，917 条会话通过搜索和虚拟窗口全部可访问，并移除图片密集背景上的全屏动态模糊。定向测试 8/8（17 次断言）、Typecheck（类型检查）、Production Build（生产构建）与 `git diff --check` 通过；未运行全量测试、完整 Electron、Windows 打包或真实 Provider Live（真实运行）。证据见 `docs/baseline/creatx-creative-library-share-dialog-2026-08-09.md`。

## Windows 0.1.16 图片附件发布

2026-08-09 功能提交 `987121b` 与版本提交 `db0585a` 已生成 Windows `0.1.16` Setup、Blockmap 和 Portable x64。功能头全量 456/456（3,302 次断言）、图片定向 111/111（375 次断言）、隔离 Electron、版本提交后 Typecheck、Production Build、归档完整性和 `app.asar` 特征核验通过。Setup 与 Portable 版本和哈希已核验；未安装、未启动打包产物、未调用外部视觉 Provider，三个 EXE 均未签名。证据见 `docs/baseline/creatx-windows-0.1.16-2026-08-09.md`。

## 对话图片附件与即时等待反馈

2026-08-09 已把 PNG/JPEG 聊天附件从错误的 Cline `userFiles` 文本路径分流到真实 `userImages`，并接通 Composer/历史缩略图、受限协议大图、乐观消息去重和首增量前“正在准备回复…”状态。定向 111/111（375 次断言）、456/456 全量测试（3,302 次断言）、Typecheck、两项 Import Boundary、Production Build 与隔离 Electron 通过；用户提供的真实 JPEG 已由生产分类器验证。Electron 使用本地受控 Provider，不是外部视觉 Provider Live；完整 Desktop 尚未运行，Windows `0.1.16` 已在后续发布批次生成。证据见 `docs/baseline/creatx-chat-image-attachments-2026-08-09.md`。

## Windows 0.1.14 单实例修复

2026-08-08 已在 `SES-013 / ACC-SES-020` 下接入 Electron 同 Profile 单实例门禁：第二实例在 Runtime 与持久化初始化前退出并唤醒首窗口，不同隔离 Profile 可并存；活进程 Session 冲突具有准确错误文案，原 PID 失败关闭协议不变。定向 31/31、Typecheck、Import Boundary、Production Build、源码与解包打包程序双实例实测通过；没有全量测试或 Provider 调用。Setup 与 Portable 版本、哈希和归档完整性已核验，均未签名；旧版本首次切换仍需人工全部关闭一次。证据见 `docs/baseline/creatx-windows-0.1.14-single-instance-2026-08-08.md`。

## Windows 依赖可复现安装恢复

2026-08-08 提交 `2cf78df` 将 Bun `1.3.14` 默认安装布局固定为 Hoisted Linker（提升式链接器），删除缓存手工补包旁路，并让 Cline Postinstall 与安装完整性检查兼容 Hoisted/Isolated 布局。全新长路径 Clone 的唯一一次冻结安装以退出码 0 完成；安装完整性 5/5、安装回归 13/13、Import Boundary 2/2、Typecheck 与一个此前被缺失 SDK 阻断的 Adapter 中文文件读取用例通过。没有运行全量测试、Production Build、Electron、前端或外部 Provider；权威根既有损坏依赖树未重装。证据见 `docs/discussions/2026-08-08-windows-dependency-and-tool-health.md`，权威规则为 `PHS-023 / ACC-PHS-032`。

## Windows 0.1.9 发布包

2026-08-08 已将 Skill Sequence 运行恢复、Session PID 接管与统一视觉入口修复以 `0.1.9` 生成 Windows x64 NSIS 安装版和 Portable（便携版）。冻结安装无变化，`bun run package:win` 通过；版本资源、大小、SHA-256、旧 `0.1.8` 保留和未签名状态均已核验。打包未关闭当前 `0.1.8` 软件，也未启动新包、修改正式 Profile、调用外部 Provider 或执行创作 Live。完整证据见 `docs/baseline/creatx-windows-0.1.9-2026-08-08.md`。

## Skill Sequence 运行恢复与统一视觉入口

2026-08-08 已把 Composer Skill Sequence 的十二次预算触顶改为同一 Session 内部续跑边界，每个 Skill 最多四段；下一 Skill 只在当前项完成后启动，用户原话只保留一次。恢复 Session 会先收束死亡旧 PID，再以并发保护同步接管 SQLite 和 Manifest；存活所有者失败关闭。同步生图与持久队列共用唯一项目视觉 Prompt 编译器。真实本地 Cline 循环已通过十二次工具调用后的自动续轮；Typecheck、Import Boundary、397/397 全量测试（3,157 次断言）、PID 2/2、队列 33/33、同步生图 19/19和 Production Build 通过。没有外部 Provider 或正式 Profile Live；四段耗尽的黄色详情卡与重启后可读摘要仍未完成。证据见 `docs/baseline/creatx-skill-sequence-runtime-recovery-2026-08-08.md`。

## Windows 0.1.8 发布包

2026-08-08 已将 Unified Creative Workflows（统一创作工作流）整合头以 `0.1.8` 生成 Windows x64 NSIS 安装版和 Portable（便携版）。`bun run package:win` 通过，版本资源、大小、SHA-256、旧版保留和未签名状态均已核验；没有启动新 EXE、调用外部 Provider（模型服务）或运行整本 GWP。完整证据见 `docs/baseline/creatx-windows-0.1.8-2026-08-08.md`。

## Unified Creative Workflows 与 Creative Skills V24

2026-08-08 已在保留主线 Owner/Growth、图片队列、恢复、取消、终态和 Preview 布局权威的前提下，接入 Composer Skill 顺序、漫画 V23、地图 V24、角色群像、世界转小说及其工作台 Prototype。正式普通 Skill 顺序为地图、人物、小说、漫画、研究；世界星图仅保留 Prototype。冻结安装、Typecheck、Import Boundary、全量 391/391（3,130 次断言）、Production Build、Web Preview Build/交互和 Desktop Fixture PASS；人物构建器 2/2。未调用外部 Provider 或生成新创作成品，不能称为内容质量 Live。来源工作树未跟踪样片未进入主线。完整证据见 `docs/baseline/creatx-approved-creative-skills-v24-2026-08-08.md`。

## Growth 终态清理与 Windows 0.1.7

2026-08-08 已把唯一物化终态证据、部分完成披露、取消分类、同对象 Issue 收口、GWP 图片来源、终态 Worker 受控回收、Owner-only Live Archive、轻量历史和新图片路径规范化接入真实产品链。正式 Owner 回复是回收前置条件，维护日志支持删除中断后的幂等重放；旧 Worker 不会被本批自动迁移删除。全量 384/384（3,055 次断言）、冻结安装、Typecheck、Import Boundary、Production Build、源码与打包程序隔离 Electron 冒烟通过。Windows `0.1.7` 安装版、便携版和解包程序具有 CreatX 鸟标与正确版本资源，均为 `NotSigned`。没有外部 Provider 或整本 GWP Live；精确并发 Pause 的一个 Medium 竞态仍冻结记录。完整证据见 `docs/baseline/creatx-growth-terminal-cleanup-2026-08-08.md`。

## Windows 0.1.6 发布包

2026-08-07 已将工作台与长跑流畅度第一批修复及当前整合头以 `0.1.6` 生成 Windows x64 NSIS 安装版和 Portable（便携版）。产物大小、SHA-256 和版本资源记录在 `CONTEXT.md`；旧版本未覆盖。隔离 Profile 的真实打包程序冒烟验证协议图片、无关写入后工作台图片 DOM 稳定、Renderer 零错误并正常退出。未调用 Provider、运行 GWP、安装 NSIS 或修改正式 Profile；产物没有 Authenticode 签名。

## Windows 0.1.5 发布包

2026-08-07 已将 Owner 命令项目隔离及当前整合批次以 `0.1.5` 成功生成 Windows x64 NSIS 安装版和 Portable（便携版）。产物大小、SHA-256 与版本资源记录在 `CONTEXT.md`；旧 `0.1.4` 未覆盖。`bun run package:win` 通过，但产物未进行 Authenticode 签名，也没有启动、安装或触发正式 GWP。

## Windows 0.1.4 发布包

2026-08-07 已将图片连接故障隔离及当前整合批次以 `0.1.4` 成功生成 Windows x64 NSIS 安装版和 Portable（便携版）。产物大小、SHA-256 与版本资源记录在 `CONTEXT.md`；旧 `0.1.0` 至 `0.1.3` 未覆盖。`bun run package:win` 通过，但产物未进行 Authenticode 签名，也没有启动、安装或重试正式图片任务。

## 当前基线

- 权威代码根：`D:\CodexW\Creatx\creat1\creatx`
- 集成分支：`topic-genre-style`
- 清理前恢复标签：`pre-repository-cleanup-20260806`
- 旧 NovelX/OpenCode 活动树移除提交：`e286ed4`
- 文档策略：权威入口 + Capability Line（能力线）+ 被引用证据；其余历史由清理前标签恢复
- 唯一 Harness：Cline SDK `0.0.65`
- 桌面技术栈：Electron、React 19、TypeScript、TSX、CSS、Bun

## 当前验证

2026-08-07 第一批工作台与长跑流畅度修复完成自动化验收：图片改用受限协议 URL、无关写入不替换 Preview、Timeline Upsert 按帧合并并增量更新、额度失败按文本连接冷却且可取消。冻结安装无变化、Typecheck、Import Boundary、定向 31/31、Cline Adapter 相关 32/32、全量 374/374（3,006 次断言）、Production Build 和 `git diff --check` 通过。未调用真实 Provider 或重启 Electron，不能据此宣称实机卡顿与内存已经 Live 解决；Cline Core 单 Worker 内部有限重试和独立进程迁移仍不在本批范围。

2026-08-07 对话 Markdown 图片不再因流式文本增长更换组件身份并反复读取，Chat 图片限制为 `460px / 46vh`，工作台版式保持原规则。修复前回归稳定失败，修复后定向 3/3、Typecheck、Import Boundary、全量 365/365（2,980 次断言）、Production Build 和 `git diff --check` 通过。未执行 Electron 多图流式视觉 Live，`0.1.5` 发布包不包含该后续修复。

2026-08-07 Renderer 的 Owner 命令恢复已从全局单槽改为按 Session 隔离的版本化集合，不同项目不再因另一项目存在待恢复 GWP 而收到 `growth_conflict`；旧记录保持 requestId 迁移，损坏与清理逐条隔离。定向 5/5、Typecheck、Import Boundary、全量 364/364（2,979 次断言）、Production Build 和 `git diff --check` 通过。未调用真实 Provider、修改正式运行数据或执行双项目 Electron Live。

2026-08-07 图片挂接位置不匹配已按新产品语义静默：`image_attachment_conflict` 继续持久留痕，但不进入图片失败区、项目打开全局错误或 GWP Owner 汇报；图片文件与成功状态保留，正文不自动改写。定向 50/50、Typecheck、Import Boundary、全量 361/361（2,969 次断言）和 Production Build 通过。未调用 Provider、未运行 Electron，也未修改正式作品或数据库，因此正式旧冲突的实机消隐仍未 Live。

2026-08-07 已把 GWP 回执图片挂接集成头以 `0.1.3` 成功生成 Windows x64 NSIS 安装版和 Portable（便携版）。产物大小、SHA-256 与版本资源记录在 `CONTEXT.md`；旧 `0.1.0` 至 `0.1.2` 未覆盖。`bun run package:win` 通过，但产物未进行 Authenticode 签名，也没有启动、安装或对正式旧世界执行对账。

2026-08-07 GWP 回执驱动的正文图片关系完成自动化验收：回执派生绑定、任意先后顺序、历史对账、异义失败关闭、游离任务隔离、真实 Markdown 写入、队尾重试和 UI 状态分区已经接入。冻结安装、Typecheck、Import Boundary、图片队列 28/28、全量 358/358（2,964 次断言）和 Production Build 通过。未调用外部 Provider、未运行 Electron、未修改正式数据库或两本旧世界；证据见 `docs/baseline/creatx-gwp-receipt-image-attachments-2026-08-07.md`。

2026-08-07 项目图片工作流完成自动化验收：同项目单并发、全局两个项目通道、Attempt 历史、重试/跳过/取消、Agent 工具、当前项目进度栏、Markdown 挂接、图文环绕和普通 HTML 隔离协议已经接入。冻结安装、Typecheck、Import Boundary、356/356 全量测试（2,953 次断言）、Production Build 和 `git diff --check` 通过。测试没有调用外部图片 Provider，也没有执行 Electron 视觉 Live；证据见 `docs/baseline/creatx-project-image-workflow-2026-08-07.md`。

2026-08-07 当前集成工作树以补丁版本 `0.1.2` 成功生成 Windows x64 NSIS 安装版和 Portable（便携版）；两个 EXE 与 Blockmap 的大小和 SHA-256 已记录在 `CONTEXT.md`，旧 `0.1.0` 与 `0.1.1` 均未覆盖。`bun run package:win` 以退出码 0 完成，但产物没有 Authenticode 代码签名，且为避免正式 Profile 争用没有在本批启动新 EXE。

2026-08-06 合并创作资料库后：

- `bun install --frozen-lockfile`：通过；
- `bun run typecheck`：通过；
- `bun run test:imports`：通过；
- `bun run test`：316/316，通过，2,121 次断言；
- `bun run build`：通过；
- `bun run test:preview:web`：通过。

移除根级旧源码后，从 `creatx/` 再次运行 Typecheck、316/316 全量测试和 Production Build，全部通过。上述验证没有调用新的外部 Provider。

统一活动文档并清理旧目录后，再次完成冻结安装、Typecheck、Import Boundary（导入边界）、316/316 全量测试（2,121 次断言）、Production Build（生产构建）、Web Preview（网页预览）、Markdown 链接检查和 `git diff --check`，全部通过。该轮仍未调用外部 Provider。

2026-08-06 完整 Live 档案批次在当前集成头再次通过冻结安装、Typecheck、Import Boundary、319/319 全量测试（2,937 次断言）、Live Archive Node 4/4 和 Production Build。既有《太衡界世界》整本已真实晋升到正式 Profile；该批没有重新调用外部 Provider。

2026-08-06 正式打开迁移整本后修复了大型 Growth 会话恢复：同一《太衡界世界》档案的 200 个 Worker Timeline 从 62.3 秒降至约 0.6–1.0 秒，《灰冠诸境》291 个 Worker 约 1.1 秒；生产 Electron 中 Owner 用户消息、折叠活动和最终 Assistant 回复同时可见，折叠区不预渲染内部明细。定向 128/128（735 次断言）、全量 323/323（2,944 次断言）、Typecheck、Import Boundary 和 Production Build 通过；没有调用 Provider 或重跑整本。

2026-08-07 修复 Renderer 跨会话 Run State 污染：状态按 Session ID 隔离，后台终态不会因当前会话过滤而丢失，命令返回但漏收终态时不再无限显示运行。正式 Profile 的《太衡界世界》首次打开及会话来回切换后均显示 `completed` 与“已处理”，active 处理区和折叠明细预挂载均为 0，Owner 最终回复可见。Typecheck、Import Boundary、329/329 全量测试（2,960 次断言）和 Production Build 通过；没有调用 Provider 或重跑整本。

2026-08-07 增加 Growth 内容错误的 `retry / repair / accept / bypass` 恢复语义与可信红绿反馈：兼容 `unknown + block` 旧状态，修复期间保持红色，可信回执后显示绿色“已修复完成”，安全绕过后显示绿色“已绕过”，3 秒后消失；自动修复耗尽可绕过局部对象或依赖子树并在最终汇报保留缺失。直接相关目录 220/220（2,274 次断言）、Import Boundary、Typecheck、全量 339/339（2,898 次断言）和 Production Build 通过。未重启 Electron、未调用 Provider、未修改现有运行数据，真实同题材复跑尚未验收。

2026-08-07 修复迁入或历史会话引用已失效文本 Profile 时的无凭据请求：有效单会话覆盖继续保留；失效绑定在请求前自动采用设置页全局默认并持久写回；对话框切换不再改变全局默认；全局无凭据时本地失败且不接纳消息。现场 `/draw-comic` 故障确认没有文件、工作台或项目版本副作用。定向模型测试 33/33（159 次断言）、Import Boundary、Typecheck、全量 342/342（2,910 次断言）和 Production Build 通过；没有修改现场会话、调用 Provider 或重启 Electron。

## 完成边界

当前仓库级基线只证明：新 CreatX 可以不依赖根级旧源码完成安装、类型检查、自动测试和生产构建。真实 Provider、真实文件、Electron 和整本 Growth 的最强历史证据由 `CONTEXT.md` 列出的少量 Baseline（基线）文件分别拥有；自动测试不能替代这些 Live（真实运行）证据。

## 恢复规则

- 当前代码问题从 `CONTEXT.md` 和对应 Capability Line（能力线）恢复。
- 需要检查被删除的旧源码或旧文档时，从 Git 标签 `pre-repository-cleanup-20260806` 读取，不把它重新作为运行时依赖。
- 完整整本运行产物继续保留，不因仓库清理删除。
