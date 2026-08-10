# CreatX Current Context

## 当前生产新手引导前沿

2026-08-11 已实现 `WUI-055 / ACC-WUI-077`：生产 `WorkspaceShell` 首次 Profile 自动播放十步 Spotlight（聚光灯）教程，明确跳过、Escape 或完成后才记录，未完成退出下次仍出现；展开与折叠项目导航均有永久重播入口。设置、项目、Composer（输入区）、工作台、艺术库、灵感库和传承库使用真实生产锚点，第九步展示九类能力和九项当前正式 Skill（技能），不加载 Prototype（原型）或 Fixture（测试夹具），不自动填写、发送、调用 Provider（模型服务）或修改项目。

定向 3/3（11 次断言）、全量 604/604（4,527 次断言，83 个文件）、Typecheck（类型检查）、两项 Import Boundary（导入边界）、Production Build（生产构建）和 1600×1000 隔离 Electron（桌面运行壳）通过。实机覆盖未完成退出恢复、完成后重启、展开/折叠入口、十步真实锚点、减弱动效与完整 Skill 工具箱；本地 Provider 请求 0、隔离项目目录写入 0、退出残留进程 0。未执行 Windows 打包、正式 Profile 或外部 Provider Live（真实运行），当前批次尚未提交。完整边界见 `docs/baseline/creatx-production-onboarding-2026-08-11.md`。

## 当前艺术库 0.1.19 恢复前沿

2026-08-11 已在当前工作树恢复艺术库产品语义：63 张预批准基础藏品真实物化为巨构艺术41、暖色风格18、纪念碑谷4，后续新增图片继续走 `incoming → approval → libraries`；新 Profile、错误 reset Profile 和旧 57+6 Profile 可按稳定 ID、snapshot 与 SHA-256 安全恢复，用户艺术数据不被改写。生产图鉴、展览、详情、CSS 和动效直接复用 `0.1.19` 提交 `285c018`，七个核心视觉文件与旧提交 Git blob 哈希逐项一致；三个展示桥只接受当前 Runtime（运行时）投影，静态 JSON、iframe 内默认值和 `localStorage` 不拥有事实。

定向 32/32（181 次断言）、全量 601/601（4,516 次断言，82 个文件）、Typecheck（类型检查）、两项 Import Boundary（导入边界）和 Production Build（生产构建）通过。隔离 Electron 在 1600×1000 完成 63 件圆环、详情返回、41/18/4 展览、新增审批、关键词导出、重启恢复、减弱动效、受限图片负向路径与零残留；正式 Profile 的 136 文件摘要前后不变。没有外部 Provider（模型服务）、正式 Profile 迁移或 Windows 打包；当前批次尚未提交。完整边界见 `docs/baseline/creatx-art-library-019-restoration-2026-08-11.md`。

## 当前诺文 Windows 0.1.21 发布前沿

2026-08-11 已将工作台注销功能头 `7a773ae` 打包为 Windows `0.1.21`。Setup 为 132,231,893 字节，SHA-256 `E133B95418660862C6E2F4FFA0AAFB1E2445298D79F94069D16A2DDF58E67CEC`；Portable 为 132,008,057 字节，SHA-256 `CAEA6AC76680C32F343657817C1584D1CCED079A7A61EA040035D3BF11AB028F`。PE 版本与 ProductName（产品名）为 `0.1.21 / 诺文`，产物未签名。

功能冻结的全量为 598/598（4,495 次断言）；版本批次的 Typecheck（类型检查）、两项 Import Boundary（导入边界）、Production Build（生产构建）、Windows NSIS/Portable、7-Zip 完整性、`app.asar` 版本与边界检查和解包 EXE 隔离品牌烟测通过，退出后残留进程为 0。`app.asar` 包含 `unregister_workbench`，不包含新手引导 Prototype（原型）脚本或 `@creatx/project-package-runtime`。没有外部 Provider（模型服务）、工作台注销原生审批 Live（真实运行）、Setup 安装或 Portable 外壳启动证据；完整边界见 `docs/baseline/creatx-windows-0.1.21-2026-08-11.md`。

## 当前工作台注销入口前沿

2026-08-11 已实现 `WBR-020..021 / ACC-WBR-032..035`：普通项目会话可通过需要原生审批的 `unregister_workbench` 只移除一个工作台视图记录，真实目录与内容不变；合法 `missing` 入口同样可清理，内置、未知、损坏、重复冲突和并发变化目标失败关闭。当前入口消失后 Renderer 回退 `builtin:files` 并清除临时交互展示。联合定向 180/180（1,300 次断言）、全量 598/598（4,495 次断言）、Typecheck、Import Boundary 和 Production Build 通过。没有外部 Provider 自主调用或 Electron 审批/重启 Live；证据与恢复入口见 `docs/baseline/creatx-workbench-unregister-2026-08-11.md`。

## 当前 Causality 因果图 Skill 前沿

2026-08-10 已实现实验性内置 `creatx-causality`：普通项目会话或 Growth 可通过同一 `/causality` Skill 读取当前世界已经明确登记的 `type: "causes"` 关系，保留原方向与原因，生成项目内无网络依赖的搜索、拖动、缩放因果 Viewer（查看器）。引用、采纳、归属、位置、相似与共同出现不会被提升为因果；没有明确因果、多世界未选择、损坏 Goal、项目外真实路径、Junction（目录联接）输出和非本 Skill 产物覆盖均失败关闭。完整物化关系优先，冻结蓝图只作为明确标记的降级来源。

Skill Creator 官方校验在 `PYTHONUTF8=1` 下通过；定向 24/24（432 次断言）、Typecheck（类型检查）、Import Boundary（导入边界）两项和 Production Build（生产构建）通过。当前没有真实 Provider（模型服务）调用，也没有通过真实 Agent 完成 `register_workbench + set_workbench_home` 的 Electron（桌面运行壳）Live（真实运行）验收；它不是客观因果证明、模拟器或图编辑器。证据与恢复入口见 `docs/baseline/creatx-causality-skill-2026-08-10.md`。

## 当前诺文 Windows 0.1.20 发布前沿

2026-08-10 已将 Causality 功能头 `9b6562e` 与此前进入主线的艺术库、灵感库、传承库、工作台和会话更新打包为 Windows `0.1.20`。Setup 为 126,784,754 字节，SHA-256 `9D20613D8FC0C7C95182DA86064728923D93344C9DBF19634DBA5BDC266EA50C`；Portable 为 126,560,912 字节，SHA-256 `CA3562D13C531C6B246EF12A45361D0CC3E6D3276C6ADE4538A6C861A77BDC7E`。PE 版本与 ProductName（产品名）为 `0.1.20 / 诺文`，产物未签名。

发布冻结发现隐藏 `.np` Desktop 接线会让 Electron 在创建窗口前触发 Node ESM 导入失败，因此 `0.1.20` 已从生产 Main、Preload、Desktop API 和根依赖图完全断开 `@creatx/project-package-runtime`，不提供或宣传 `.np` 用户能力；Task 1–7 Runtime 与保留协调器源码留给 `0.1.21`。代码冻结后全量 595/595（4,468 次断言），Typecheck、两项 Import Boundary、Production Build、Windows NSIS/Portable、7-Zip 完整性与 `app.asar` 反向边界检查通过；打包 `诺文.exe` 隔离启动和界面烟测通过，残留进程为 0。没有安装 Setup、直接启动 Portable、完整 Desktop、外部 Provider Live 或打包端 Causality Agent 纵向验收。完整证据见 `docs/baseline/creatx-windows-0.1.20-2026-08-10.md`。

## 当前灵感库双库与百条样本前沿

2026-08-10 灵感库已从旧题材筛选收敛为“启发 / 幻想”两个库：中文或英文问号结尾进入启发，其他完整陈述式点子进入幻想；旧 JSON `category` 继续兼容但不参与页面分类。内置样本现为启发50条、幻想50条，共100条；保留两条用户共创启发与原25条幻想，新增73条均有真实可访问公共网页来源，来源事实与重新创作剧情明确分开。热度仍为本机排序，收藏2分、喜欢1分，同分保持原顺序，不伪造公共计数。

当前90个唯一公共来源 URL 经直接 HTTP 核验全部返回200。定向7/7（621次断言）、Renderer 114/114（1,044次断言）、Typecheck、Production Build 和专用 Web Preview 浏览器验收通过；浏览器确认幻想50条、启发50条、900×700无横向溢出且页面错误0。完整 Preview 的品牌与入口旧文本已更新，随后被范围外 Chat Studio 工作台旧结构断言阻塞。没有外部 Provider、Electron、Windows 打包或用户数据迁移。完整证据见 `docs/baseline/creatx-idea-library-two-buckets-2026-08-10.md`。

## 当前 `.np` 便携诺文项目包设计前沿

2026-08-10 已接受并提升 `IEX-101..112 / SES-506..508 / PFL-009..010 / WUI-052..054`：`.np` 为标准 ZIP，使用稳定项目血统 `projectId` 与确定内容 `packageId`，只导出完整作品/源码、净化工作台和用户标记的只读案例；项目简介显式编辑，继续创作从可审阅说明创建新的普通项目会话。导入只进入用户选择的新目录，先预检与暂存校验再原子提交；同内容幂等，同血统异内容只允许取消或独立副本。V1 不复制 Cline/Profile 数据库，不导入 Run/权限/付费队列，不自动调用 Provider，不做签名、合并、拖入或自定义排除。

架构采用独立 `project-package-runtime`，并增加只保存路径/便携身份的轻量 Project Catalog（项目目录登记），使无本地会话的导入项目可重启恢复；它不成为文件或会话权威。最右工作台导航未来把系统“项目首页”固定第一、“文件”调整第二。

2026-08-10 已完成实施计划 Task 1–8：新增严格 V1 Manifest/Checksums Schema、规范 UTF-8 身份描述与 SHA-256 `packageId`；身份覆盖项目血统、三段简介、规范文件摘要和空目录路径，排除导出时间、诺文版本与 ZIP 元数据。Project Files 现提供独立便携枚举/读取 Port，保留普通隐藏文件、中文/空格、空目录、图片和二进制，固定排除 `.git / .creatx / node_modules`、诺文临时文件、系统缓存和全部符号链接/Junction；排除目录不被递归扫描，摘要区分已知文件字节与未扫描项。枚举后文件大小或修改时间变化以 `package_file_conflict` 失败。受控 `.creatx/portable-project/metadata.v1.json` 保存便携血统、来源血统和三段简介，普通文件 Query/Command 无法读写。

Project Catalog 已在 `userData/creatx/projects.v1.json` 以单实例串行队列和同目录临时文件原子保存本机路径、本地便携身份、原包双身份、来源、显示名与可用/缺失状态；同原包幂等命中，同血统异内容默认冲突，显式独立副本保留来源血统；移除登记不删除项目目录，损坏 Store 失败关闭。项目案例标记现在作为 Cline Session metadata 的单一事实持久保存；个人会话、Growth Worker 与活动 Run 失败关闭，删除来源会话即删除标记。`PortableConversationV1` 直接读取 Cline 消息 Artifact（产物），只输出用户可见消息、无工具调用的最终 Assistant 回复、固定工具活动摘要与已导出文件引用；Reasoning、内部协议、原始工具输入/结果、Shell 全文、外部绝对路径、常见凭据、邮箱/中国手机号/身份证号和显式私人复制前缀均不进入投影，缺少完整可见往返或读取期间会话发生变化时失败关闭。

工作台现在可在同项目串行门禁内交换严格解析后的 V1/V2/V3 注册记录；主页和冻结可见文件必须引用 Task 2 的规范导出路径。损坏、未知版本、重复文件夹、越界引用和单项写入失败只产生 Diagnostic（诊断）并跳过该项；目标已有 ID 或文件夹不覆盖，内置视图不进入交换，现有“文件”由目标系统生成，“项目首页”仍冻结至 Task 10。Task 5 定向 27/27（120 次断言）通过，覆盖往返、排序、内置视图、损坏目标保留、写失败隔离和非规范路径失败关闭。

Task 6 已实现标准 ZIP `.np` 的流式导出：固定写入三个逻辑根，保留空目录与真实二进制，逐项计算 SHA-256，最后写 Manifest/Checksums，并从磁盘重新核对中央目录、规范路径、条目大小、摘要和双身份。导出结束会复枚举项目阻止混合快照；相同 `packageId` 幂等保留既有目标，不同内容或损坏目标不覆盖；取消、文件变化和写失败清理受控临时文件。V1 普通 ZIP 限制为 60,000 个项目条目和 2 GB 未压缩内容，目标同目录使用硬链接 create-only 原子发布，不支持硬链接的位置失败关闭。导出保存窗口未来优先定位可写 `D:\`，否则回退系统“文档”，该 UI 规则冻结至 Task 9。

Task 7 已实现安全导入 Runtime：在解压前拒绝伪扩展、加密/ZIP64/链接、重复或 Windows 不安全路径、条目/大小/压缩比超限、Checksum/身份错误和截断中央目录；通过后分块写入目标旁带标记暂存，逐项复核真实字节，再原子提交新目录。导入案例以受控只读 JSON 保存而不进入 Cline，工作台语义损坏降级并保留文件兜底；同包幂等，同血统异内容要求显式独立副本。提交前取消只清理本批暂存；目录提交后元数据或 Catalog 失败保留文件并记录 `committed-unregistered` 可恢复状态。

Task 8 曾把 `.np` Runtime 接入独立项目包 Contracts（合同）、Preload（预加载桥）和 Desktop 单 Job（任务）协调器；该实现与测试源码保留为后续恢复材料，但 2026-08-10 发布冻结发现它作为隐藏启动依赖会让普通 Electron 在窗口创建前因 Node ESM 导入边界失效。按产品决定，Windows `0.1.20` 已从生产 Main、Preload、Desktop API 和应用依赖图移除整个项目包入口，不提供或宣传隐藏 `.np` 能力。

`.np` Task 1–7 的 Runtime、Schema、真实 ZIP 导入导出与失败关闭测试继续保留；Task 8 的 Desktop 协调器当前不在生产启动链，Windows `0.1.21` 仍未接回该能力。Task 9–11 与重新接线继续冻结；恢复时必须先完成 Renderer UI、D 盘默认选择器、项目首页、继续创作、Electron 新 Profile 重启和打包纵向验收，不能仅恢复旧 Preload 方法。共享项目包协议位于 `packages/contracts/src/project-package.ts`，恢复入口为 `docs/plans/2026-08-10-portable-noven-project-package.md` Task 9。

## 当前传承库视频学习与 Skill 安装前沿

2026-08-10 已实现 `CSK-329..331 / ACC-CSK-386..389 / WUI-051 / ACC-WUI-073`：传承库四类各置顶一条真实 TED 英文字幕视频，请求通过现有普通项目会话进入唯一 Cline SDK `0.0.65` Runtime（运行时）；Agent（智能体）必须在同一会话先读取匹配字幕，再经现有审批/自由权限安装一个严格单文件 Learned Skill（学习技能）。固定主机、重定向、1 MB、20 秒、取消、字幕身份、Frontmatter（头部元数据）、来源、路径、冲突、原子写入与损坏/符号链接启动发现均失败关闭；安装后需重启诺文生效，不做热加载。

生产字幕工具重新读取四条真实 TED 页面得到 415 / 281 / 105 / 452 个 Cue（字幕片段）。定向 12/12（172 次断言）、Typecheck（类型检查）、Import Boundary（导入边界）和 Production Build（生产构建）通过；冻结全量为 528/531，3 个范围外 World Materialization（世界物化）测试在全仓负载下触发 5 秒超时，同文件隔离 49/49（482 次断言）通过。隔离 Electron 使用真实 TED 字幕和本地受控 Provider（模型服务）完成前四置顶、普通会话发送、读字幕、原生审批、磁盘安装和最终回复；没有外部 Provider 内容质量 Live（真实运行）、第二次 Electron 重启调用、视频下载/音频转写/视觉学习、Windows 打包。既有传承库/工作台链接脚本在进入本批页面前暴露范围外键盘分隔线旧失败，本批未放宽。完整证据与恢复入口见 `docs/baseline/creatx-heritage-video-skill-2026-08-10.md`。

## 当前艺术库主线整合前沿

2026-08-10 已在 `7a2cd98` 主线检查点上完整移入 `art-library-live` 的 15 个线性提交，整合功能头为 `1e7aef6`。会话即时切换、Workbench V3 可见范围、工作台视觉批注与艺术库本地/聊天/Web 收集、单图视觉整理、真实审批及确定性风格词导出同时保留；磁盘附件和 Main 生成的内存 PNG 共用真实字节授权，并同时进入 Cline `userImages` 与回合 `imageSnapshots`。

合并定向 52/52（250 次断言）、Renderer 124/124（598 次断言）、最终全量 523/523（3,646 次断言，71 个测试文件）、Typecheck（类型检查）、Import Boundary（导入边界）和 Production Build（生产构建）通过。Electron（桌面运行壳）已验证 18 ms 会话可见切换且消息只进入目标会话、12/12 工作台截图、三类工作台批注作品，以及艺术库聊天附件/项目文件/Web 三种来源、审批、导出、重启恢复和协议负向路径；正式艺术库 Profile（配置档案）前后摘要不变，Provider（模型服务）调用为 0。

本批没有外部视觉 Provider Live（真实运行）、完整 `test:desktop` 或 Windows 打包证据；旧 Desktop 断言仍要求隐藏当前产品明确常驻的最右工作台导航。未跟踪地图、长跑、`output/` 与原型产物未进入整合。完整提交映射、冲突不变量和恢复入口见 `docs/baseline/creatx-art-library-mainline-integration-2026-08-10.md`。

## 当前工作台视觉批注前沿

2026-08-10 已实现 `WBA-001..006 / ACC-WBA-001..004,006..007,009`：项目文件的图片、滚动 Markdown 和隔离 HTML 可在当前工作台可见区域叠加矩形/自由画笔蒙版，使用三档粗细、撤销/重做/清空、HSV 全色调色盘、Hex、最近颜色和底图像素吸管；Main 根据当前项目/文件身份与 DOM 边界截图并注册受控内存 PNG，源文件不变。“加入对话”只增加待发送附件、聚焦输入框，不自动发送；失败保留草稿，离开作品统一确认丢弃。

全量 504/504（3,517 次断言）、Typecheck（类型检查）、Import Boundary（导入边界）、Production Build（生产构建）通过。真实 Electron 在 100%/125%/150%/200% 下完成 12/12 图片/文档/iframe 隐私裁剪；125% 下三种真实作品均生成 542×890 PNG，源 SHA-256 不变、Timeline 为 0、吸管不读取蒙版，失败恢复与导航取消通过。没有可供隔离测试的文本/视觉对话 Provider 配置，因此真实 Cline `userImages` 外部回复和非视觉模型失败关闭仍未 Live（真实运行）验收；未打包、未提交。完整边界与恢复入口见 `docs/baseline/creatx-workbench-visual-annotation-2026-08-10.md`。

## 当前 Workbench V3 可见范围前沿

2026-08-10 已实现 `WBR-017..019 / ACC-WBR-025..031`：普通项目会话新增 `set_workbench_visibility`，可为 registered workbench 设置包含/排除相对路径规则；`autoIncludeNewFiles` 默认开启，关闭时冻结当刻匹配的真实文件清单。首次设置原子升级严格 V3，V1/V2 继续读取；内置“文件”、真实内容和公开 Projection 不变，JSON 门禁、非法路径、超限模式、损坏记录和会隐藏交互主页的规则均失败关闭。

最终定向 94/94（629 次断言）通过；生产代码冻结后的全量为 493/493（3,479 次断言），随后只补充 3 个幂等与开关回归断言并复跑定向，生产代码未再变化。Typecheck（类型检查）、Import Boundary（导入边界）、Production Build（生产构建）与产物工具特征检查通过。没有外部 Provider Live（真实运行）、Electron 审批/重启视觉验收、正式 Profile 或 Windows 打包；第一版没有前端规则编辑器。当前改动尚未提交，并与上一批会话即时切换修改共存；完整边界与恢复入口见 `docs/baseline/creatx-workbench-visible-scope-2026-08-10.md`。

## 当前对话即时切换与路由完整性前沿

2026-08-10 已实现 `WUI-050 / ACC-WUI-072`：无脏编辑器时点击会话在下一次 Renderer（渲染层）提交中切换目标身份并卸载旧 Timeline（时间线），历史、项目扫描、Growth Goal（生长目标）和 Workbench（工作台）投影不再串行阻塞 Chat；发送、Steer（追加指令）和 Skill Sequence（技能序列）按立即更新的 Session ID（会话标识）路由。项目打开采用最新选择串行协调，过期结果不提交；脏编辑器继续真实保存失败关闭。

隔离 Electron 使用 1,200 文件目标项目和本地受控 Provider（模型服务），在点击 B 后同一操作窗口发送：下一次 `requestAnimationFrame` 回调中的选中态和标题为 B、旧 A 消息节点为 0，最终冻结 Build 在当前负载下测得 205 ms，持久 Timeline 证明目标消息只进入 B；目标项目未就绪时文件引用失败关闭，不借用旧项目。Renderer 113/113（538 次断言）、全量 486/486（3,451 次断言）、Typecheck（类型检查）、Production Build（生产构建）和既有对话滚动 Electron 回归通过。没有外部 Provider Live（真实运行）、正式 Profile、完整 Desktop 或 Windows 打包；Main 的超大项目文件扫描本身未优化。完整证据与恢复入口见 `docs/baseline/creatx-conversation-switch-routing-2026-08-10.md`。
## 当前艺术库视觉整理与真实审批前沿

2026-08-10 艺术库已完成 v2 单图视觉整理、三组自由标签、四层反推 Prompt、分类代表证据、完整审批修订、63条旧种子安全重置和真实 React 页面接入，保持唯一 `incoming → approval → libraries` 状态机。页面直接读取 Runtime 快照与受限图片协议，revision 去重刷新；批准、暂缓、拒绝确认、确定性关键词导出和错误草稿保留均进入真实桌面路径，不使用 iframe 或艺术库 `localStorage` 事实。

定向 38/38（203 次断言）、Renderer 113/113（563 次断言）、全量 499/499（3,564 次断言）、Typecheck（类型检查）、两项 Import Boundary（导入边界）和 Production Build（生产构建）通过。专用隔离 Electron 三次冷启动完成全字段修订批准、暂缓、无效修订失败、确认驳回、确定性导出、持久恢复及协议负向检查；正式艺术库193个文件的前后摘要一致，Provider 调用为零。既有诺文品牌 Electron 验收同步通过。完整 Desktop 只在旧布局断言处失败：测试仍要求隐藏当前产品明确常驻的最右工作台导航，页面/控制台/请求错误均为0。

本机没有可确认支持视觉输入的文本 Provider 和图片 Provider 隔离配置，因此真实模型看图、分类理由、库级风格提取和“移除原图后只改 `SCENE`”的纯文字视觉保持抽样未 Live（真实运行），不得把结构测试称为反推质量通过。准确证据、遗留临时目录和下一恢复入口见 `docs/baseline/creatx-art-library-visual-curation-2026-08-10.md`；页面提交为 `63482ec`。

## 当前诺文 Windows 0.1.19 发布前沿

2026-08-10 已将 Draw Map V25 功能头 `fd32fc6` 打包为 Windows `0.1.19`。Setup 为 126,671,686 字节，SHA-256 `2F00F212AE6AC82C3390EE7E73640A170919E9F60C127EBEBA9B2F31740D334E`；Portable 为 126,447,881 字节，SHA-256 `CEB28E73931AB26E77E033BC7C1C57D0DA94660730EF7D181D67E28EC75396A2`。PE 版本与 ProductName（产品名）为 `0.1.19 / 诺文`，产物未签名。

定向 36/36（424 次断言）、Typecheck（类型检查）、Production Build（生产构建）、Windows NSIS/Portable、两个自解压包的 7-Zip 完整性与打包 `app.asar` V25 深度核验通过；解包 `诺文.exe` 使用隔离 Profile 与本地受控 Provider（模型服务）通过既有品牌/交互冒烟，退出后测试进程残留为 0。地图功能头在版本提升前全量为 480/480（3,435 次断言），本发布批次未重复全量。没有安装 Setup、直接启动 Portable、运行完整 Desktop 或在打包 EXE 内重跑真实图片 Provider 一句话地图 Live（真实运行）。完整哈希与边界见 `docs/baseline/creatx-windows-0.1.19-2026-08-10.md`。

## 当前 Draw Map V25 清晰底图与视觉边界前沿

2026-08-10 已将用户认可的“清晰原生底图 → 内部种子与图像梯度反推完整 ID 蒙版 → 配准目检 → 逐区浏览器验收”提升为 `CSK-506..507 / ACC-CSK-509` 和正式 Draw Map V25。自包含脚本检查分辨率、动态范围、平均梯度、强边缘、最小区域与边界贴合，输出蒙版、Manifest（清单）和审查图；Viewer（查看器）只缓存当前区域。纹理复杂或包含多个内部视觉盆地的同一语义区域必须逐盆地布种，圆、椭圆、平滑宏观多边形和泰森格不能冒充贴合。

第二个全新冰环火山群岛题材通过真实图片 Provider 前向生成：`1254×1254`，32 个区域、全部 1,572,516 像素有归属，最小区域 3,595 像素，边界/内部梯度比 3.214；Edge 逐区 32/32 点击，30 个陆地与 2 个水域路径、三种关闭、拖动和当前区域缓存通过，0 浏览器错误，首次选择平均 62 ms。Skill 已安装到 `%APPDATA%\creatx\creative-skills\v25` 并通过 `quick_validate.py`。定向 22/22（405 次断言）、Typecheck（类型检查）、全量 480/480（3,435 次断言）和 Production Build（生产构建）通过。没有证明所有 Provider/题材首次必成，也未重跑正式 Electron、Windows 打包或软件内完整 Agent 一句话流程；完整证据与恢复入口见 `docs/baseline/creatx-draw-map-v25-visual-boundaries-2026-08-10.md`。

## 当前诺文 Windows 0.1.18 发布前沿

2026-08-09 已把功能头 `a905275` 打包为 Windows `0.1.18`，首次生成中文命名的 `诺文-0.1.18-x64-Setup.exe`、Blockmap、Portable 和 `win-unpacked/诺文.exe`。Setup 为 126,642,034 字节、SHA-256 `4351128BD8B7EF4E9888EDDC90A0C26B4C342320249BAD83586918BD7D50F272`；Portable 为 126,418,202 字节、SHA-256 `EF178F798BC6E3E5AF9CD7AF04B03BE1DA7A8165C467A3166E5FD87D0B6E0405`。PE 版本和 ProductName（产品名）为 `0.1.18 / 诺文`，产物未签名。

Typecheck（类型检查）、Production Build（生产构建）、Windows NSIS/Portable 打包、两个自解压包的 7-Zip 完整性和打包 `app.asar` 特征核验通过；解包 `诺文.exe` 使用隔离 Profile 与本地受控 Provider（模型服务）真实通过 `ACC-WUI-071` 品牌、字体、Skill、消息 Hover、图片圆角、透明滚动轨道及发送/停止原位替换。未安装 Setup、未直接启动 Portable、未调用外部 Provider Live（真实运行）、未运行全仓全量或完整 Desktop；旧正式 CreatX 的 5 个进程和 Profile 未触碰。完整哈希与恢复入口见 `docs/baseline/creatx-windows-0.1.18-2026-08-09.md`。

## 当前诺文可见品牌与 Composer 控件前沿

2026-08-09 已实现 `WUI-049 / ACC-WUI-071`：所有当前用户可见品牌改为“诺文”，但 `appId`、包、协议、Desktop API、LocalStorage 和 Profile 保持 `creatx` 兼容身份，不做迁移；点子库改名灵感库；Skill 挂篮进入“自由 / 审批”旁并把前置勾选缩为 `14×14px`。用户气泡去掉“你”，修改/重发/删除默认仅图标并在 Hover/焦点展开文字，对话图片为 `10px` 圆角且滚动轨道透明；活动 Run 把原发送按钮原位替换为灰色停止方块，不新增第二个按钮。官方 JetBrains Mono `2.304` Regular / SemiBold 已离线进入主 Renderer 与艺术库，中文回退系统中文字体。

Renderer/错误投影 137/137（557 次断言）、Typecheck（类型检查）、Production Build（生产构建）、`git diff --check` 和专用隔离 Electron 通过；Electron 确认主界面与艺术库字体真实加载、Skill 相邻几何、消息 Hover、图片圆角、透明滚动轨道及发送/停止原位替换，且源码 Electron 残留为 0。没有外部 Provider（模型服务）、全仓全量、完整 Desktop、Windows 打包或正式 Profile；`0.1.17` 不包含本批。准确边界与恢复入口见 `docs/baseline/creatx-noven-visible-brand-composer-2026-08-09.md`。

## 当前传承库与工作台项目引用修复前沿

2026-08-09 已实现 `WUI-046..048 / ACC-WUI-068..070`：传承库改为版本化 JSON 的 20 条目录，`OC创作 / 艺术欣赏 / 世界观 / 图画创作` 各 5 条，筛选同时保留个人导入分类与来源；中央画布和最右工作台导航分隔线恢复指针与键盘调整；对话项目图片、相对文件链接及 `文件.md#标题` 复用真实工作台打开链，非法路径失败关闭。

定向 17/17（167 次断言）、Renderer 104/104（514 次断言）、Typecheck（类型检查）、Production Build（生产构建）和专用隔离 Electron 通过。全量为 476/477（3,399 次断言），唯一范围外 World Materialization 测试在全仓负载下 5043ms 超时，隔离 1/1（19 次断言）通过；完整 Desktop 在进入本批交互前因既有 Chat 默认布局与旧断言不一致停止。没有外部 Provider（模型服务）、正式 Profile、Windows 打包或用户数据迁移；`0.1.17` 不包含本批。完整边界见 `docs/baseline/creatx-heritage-workbench-links-2026-08-09.md`。

## 当前对话打开一次性底部定位前沿

2026-08-09 已实现 `WUI-045 / ACC-WUI-067`：每次真正进入或切换到会话后，首次非空 Timeline（时间线）提交自动定位到底部一次；空历史不提前消费，同一打开周期内重渲染、重复选择当前会话、窗口缩放和 Chat / Workbench 表面切换不重复拉底，离开再进入可重新定位。`WUI-033` 的底部流式黏附、上滚停跟和“回到最新”保持不变。

控制器定向 6/6（19 次断言）、Renderer 100/100（477 次断言）、Typecheck（类型检查）、Production Build（生产构建）和隔离 Electron 80 段长历史切换验收通过；Electron 手动上滚到 `120` 后重复选择当前会话并缩放仍保持 `120`。没有外部 Provider（模型服务）、正式 Profile、全仓全量或完整 Desktop。当前 Windows `0.1.17` 产物生成早于本修复，不包含它；完整边界见 `docs/baseline/creatx-conversation-open-scroll-2026-08-09.md`。

## 当前 Windows 0.1.17 Cline Runtime 隔离发布前沿

2026-08-09 已把提交 `a4128bec` 的 Cline Utility Process（实用进程）隔离与图片请求预算修复以版本提交 `f5d82fa` 打包为 Windows `0.1.17`。Setup、Blockmap、Portable 和解包 EXE 的版本、SHA-256、未签名状态已核验，两个自解压包均通过 7-Zip 完整性检查；`app.asar` 包含独立 `cline-runtime.js`，Main Bundle（主进程包）不含 Cline SDK、`ClineCore` 或 `SqliteSessionStore` 标志。

解包 EXE 使用自动创建的隔离 Profile 真实完成跨进程 `register_workbench`、审批、持久化和工具结果往返；强杀 Utility 后窗口保持存活并以 `runtime_unavailable` 失败关闭，正常退出后相关进程与临时目录残留均为 0。该验收使用本地受控 Provider（模型服务），不是外部 Provider Live（真实运行）；未安装 Setup、未直接启动 Portable、未修改正式 Profile，也未重新运行全量或完整 Desktop。产物哈希、准确边界与恢复入口见 `docs/baseline/creatx-windows-0.1.17-2026-08-09.md`。

## 当前 Cline Utility Process 与重型历史性能前沿

2026-08-09 已解决正式 `0.1.16 Portable` 在 19 MB 图片历史下 Electron Main 约 1.46 GB 并触发 `AppHangB1` 的结构性问题。Cline Adapter、Session、权限存储和档案恢复现运行于受监督 Utility Process；Main 只代理稳定 CreatX 命令、事件、工具、审批、取消和持久化回调。旧回合 `read_files` 项目图片不再进入新 Provider 请求，单 Run 图片读取超限失败关闭；正式 Cline 历史不迁移、不改写。

正式 19,262,810 字节历史副本的新回合请求体为 121,317 字节；Main Working Set 为 7,180,288 -> 7,180,288 字节，Utility Process 为 273,825,792 -> 594,944,000 字节。真实跨进程 `register_workbench`、审批、结果返回、子进程强杀后窗口存活与失败关闭、聊天图片和退出无残留通过。Adapter + Contracts 138/138（420 次断言）、全量 470/470（3,361 次断言）、Typecheck、Import Boundary、Production Build 和 `git diff --check` 通过。没有外部 Provider、Windows 打包或完整 Desktop 全套通过；`test:desktop` 在既有默认 Chat 与旧 Paper Workspace 断言不一致处提前停止。恢复入口与风险见 `docs/baseline/creatx-cline-runtime-isolation-2026-08-09.md`。

## 当前创意库分享弹窗关闭与性能修复前沿

2026-08-09 已实现 `WUI-044 / ACC-WUI-066`：创意库分享只等待 Runtime（运行时）接收消息，不再等待完整 AI 回复；普通消息发送语义不变。发送期间 X、Escape 和遮罩始终可关闭且不取消后台 Run。917 条正式会话改为标题/路径搜索与 64px 固定行高虚拟窗口，首屏只挂载 10 行；全屏动态模糊已移除。接收前失败和缺少接收回调均失败关闭，接收后后台拒绝已绑定处理并沿既有事件链投影。

定向测试 8/8（17 次断言）、Typecheck（类型检查）、Production Build（生产构建）与 `git diff --check` 通过。未运行全量测试、完整 Electron、Windows 打包或真实 Provider Live（真实运行）；正式 Profile 的 917 条滚动与真实分享仍待隔离 Electron 验收。完整边界见 `docs/baseline/creatx-creative-library-share-dialog-2026-08-09.md`。

## 当前 GWP 图片附件严格恢复前沿

2026-08-09 已定位并修复《赫尔墨斯环城》项目打开时连续跳出 `image_queue_conflict`：97 份正式回执中，92 个成功图片任务曾把 `# 标题` 等 Markdown 语法作为纯标题锚点，旧挂接失败后又被不可改绑门禁重复拒绝。Image Runtime 新增仅供正式回执使用的同文档恢复入口；成功附件保持不变，待处理意图只规范化，只有成功图片的旧 `image_attachment_conflict` 才重挂，不同文档和其他错误继续失败关闭。Markdown 已引用同一图片路径时兼容图注差异及中文路径编码差异，不重复插图。

定向测试为 Image Queue 37/37、Document Attachment 4/4、World Materialization 49/49（482 次断言）、Desktop 1/1，Typecheck（类型检查）通过。正式 Profile 完整副本执行 97 份真实回执后为 95 个附件成功、1 个图片任务失败、1 个中断且 Markdown 变更 0；未修改正式 Profile、未运行全量测试、Production Build（生产构建）或打包。当前 Windows `0.1.16` 尚不包含修复，后续发布并首次打开项目后才会正式自动收敛。完整边界见 `docs/baseline/creatx-image-attachment-recovery-2026-08-09.md`。

## 当前赫尔墨斯环城外部 Provider 长跑前沿

2026-08-09 已在 Windows `0.1.16` 隔离实例和原 Owner Session 中完成《赫尔墨斯环城》真实长跑：GWP 97/97 可信正文、111 个有效 Markdown 图片引用、Study、六人角色群像、七章小说《拒动窗口》、10 区可点击地图、两段四图竖向条漫和项目总入口均已落盘；隔离应用重启后的新真实 Provider 回合再次确认全部核心入口可恢复。文本模型为 `gpt-5.6-luna`，图片模型为 `gpt-image-2-cheap`。

真实恢复修复了三个 World Materialization（世界物化）问题：只有当前 `blocked` 对象可按终态 disposition 延期；重开 Goal 后旧层报告保持不可变并写版本化恢复报告；已有最终报告时写版本化恢复终态报告。定向测试 49/49（482 次断言）和 Typecheck（类型检查）通过；没有运行全量测试、Production Build（生产构建）或重新打包。图片仍有 1 个 Provider 失败和 1 个历史重启中断；历史附件绑定冲突会重复发出 `image_queue_conflict`，已完成 `run_growth` 工具项仍可能停在 `streaming` 并阻碍 Clean Exit（干净退出）。因此 `ACC-GRT-060` 仍不标记为完整通过。完整证据和恢复入口见 `docs/baseline/creatx-hermes-ring-live-2026-08-09.md`。

## 当前 Windows 0.1.16 图片附件发布前沿

2026-08-09 功能提交 `987121b` 与版本提交 `db0585a` 已生成 Windows `0.1.16` NSIS Setup、Blockmap 和 Portable x64。功能头全量 456/456（3,302 次断言）、图片定向 111/111（375 次断言）、隔离 Electron 图片验收、版本提交后 Typecheck、Production Build、两个 EXE 的 7-Zip 完整性和 `app.asar` 特征核验通过。Setup 126,441,352 字节，SHA-256 `E34CED693E71333BC6A2A5B34F69D68923A006AD23C3831A6BECE4996973B301`；Portable 126,217,512 字节，SHA-256 `83852CB1EE8FA39D499A5F6BA6A701854B0323ECA96CACF9A05F894387541B2E`。未安装、未启动打包产物、未修改正式 Profile、未调用外部视觉 Provider，三个 EXE 均未签名。完整记录见 `docs/baseline/creatx-windows-0.1.16-2026-08-09.md`。

## 当前对话图片附件与即时等待反馈前沿

2026-08-09 已实现 `WUI-005 / WUI-011 / PHS-024`：普通消息成功进入 Run 后立即在 Assistant 一侧显示“正在准备回复…”，首个真实推理、工具或回复到达后替换；PNG/JPEG 经过真实签名、单图 10 MiB 与单批 20 MiB 门禁后通过 Cline `userImages` 进入模型，文本继续使用 `userFiles`。Composer 和单条持久用户消息均显示缩略图并可打开大图；重载后图片从 Cline 持久 image block 经 `creatx-attachment://` 受限协议读取，Renderer 不接触绝对路径或 Base64，也没有第二套消息/附件数据库。乐观/持久图片消息重复已修复。

定向 111/111（375 次断言）、456/456 全量测试（3,302 次断言）、Typecheck（类型检查）、两项 Import Boundary（导入边界）、Production Build（生产构建）和隔离 Electron 验收通过；Electron 使用延迟本地受控 Provider，验证等待态、1 次真实 image content 请求、单条用户消息、强制重载后的缩略图与大图，不是外部视觉 Provider Live（真实运行）。用户提供的真实 299,332 字节 JPEG 已由生产分类器识别为 `image/jpeg`。WebP/GIF/SVG/视频/音频及模型视觉能力 Profile 不在本批；完整 Desktop 尚未运行，Windows `0.1.16` 已在后续发布批次生成。完整证据见 `docs/baseline/creatx-chat-image-attachments-2026-08-09.md`。

## 当前项目对话与工作台控制前沿

2026-08-09 已实现并集成 `WUI-043 / SES-014`。完全展开的桌面顺序固定为“左侧全局导航 / 中左 Chat（对话）/ 中右工作台画布 / 最右工作台导航”；项目下改列所属会话，左右导航均可真正折叠，左导航压到 `52px` 后重新展开恢复压缩前宽度。普通项目会话由 Main（主进程）按项目持久、单调分配 `创作（n）`，删除和重命名不复用编号，Session ID 与显示名保持独立。

文件拖入整个 Chat 后只成为待发送附件，通过 Preload（预加载桥）的 Electron `webUtils.getPathForFile()` 和 Main 短期授权链，Renderer 不接触绝对路径。用户消息删除只持久隐藏本机投影；修改与重发创建正常新回合，成功后隐藏原消息，Provider（模型服务）失败或取消时恢复原消息与编辑草稿，不改写 Cline 历史、AI 上下文或既有副作用。全量 450/450（3,283 次断言）、Typecheck（类型检查）、两项 Import Boundary（导入边界）、Production Build（生产构建）和隔离 Electron 验收通过；Electron 覆盖三档窗口、命名、布局、删除重启、修改/重发成功与失败恢复，但使用本地受控 Provider，不是外部 Provider Live（真实运行）。真实操作系统文件拖放尚未自动化。本批已进入 Windows `0.1.15`，完整实现证据和发布证据分别见 `docs/baseline/creatx-project-chat-controls-2026-08-09.md` 与 `docs/baseline/creatx-windows-0.1.15-2026-08-09.md`。

## 当前 Windows 0.1.14 单实例修复前沿

2026-08-08 已永久修复同一正式 Profile 可启动多个 CreatX、直到发送消息才触发 `session_conflict` 的问题。Electron Main 现在在 Runtime、Provider（模型服务）和数据库初始化前申请单实例锁；第二次启动唤醒首窗口后退出，不同 `--user-data-dir` 的隔离实例仍可并存。Cline Session PID 保护继续失败关闭，活进程占用显示准确中文，不改 Schema、Provider 或 Renderer 布局。权威规则为 `SES-013 / ACC-SES-020`。

定向 31/31（36 次断言）、Typecheck、两项 Import Boundary、Production Build、源码 Electron 与解包打包程序的双实例隔离 Profile 实测均通过；没有运行全量测试或调用真实 Provider。Windows `0.1.14` Setup 为 126,439,177 字节，SHA-256 `E4676988E96776763FF32B67A15274ED9B99B86F237E65948C97AAFA16DEF331`；Portable 为 105,714,989 字节，SHA-256 `A4A30ABFFCC57FE96FC6AD18CF8D44387BB6A6B07A7E12CA5CE85A08FF6990E7`。两者版本均为 `0.1.14`、归档完整且未签名。旧版本不持有新锁，首次切换前仍需关闭全部旧 CreatX 一次。完整边界见 `docs/baseline/creatx-windows-0.1.14-single-instance-2026-08-08.md`。

## 当前 Windows 0.1.13 合并发布前沿

2026-08-08 已把全局个人艺术库 Runtime 与桌面 Workbench 交互整合头打包为 CreatX `0.1.13`。安装版 `creatx/release/CreatX-0.1.13-x64-Setup.exe` 为 126,438,486 字节，SHA-256 `DA0B0FC298185C103B5A53C09159646A3D164DFA19AAA6207E05F5BAA39BE462`；便携版 `creatx/release/CreatX-0.1.13-x64-Portable.exe` 为 126,214,735 字节，SHA-256 `C32BB3BD1E720DF4D3C22DC359BEA69BE7DC9FCAAF6CA3B2BE019F25EB4DE828`。两个发布 EXE 的文件/产品版本均为 `0.1.13`，Authenticode 状态为 `NotSigned`。

冻结安装 743/747 无变化，Typecheck、两项 Import Boundary、Production Build 和 Windows NSIS/Portable 打包通过。`app.asar` 核对到 Renderer 与 Web Preview 各一套艺术库资源，共 2 份数据文件和 126 张图片；解包 EXE 使用隔离 Profile 真实启动、窗口响应并迁移 57 个正式作品和 6 个候审条目后正常关闭。没有安装 NSIS、启动 Portable、调用 Provider 或修改正式 Profile；本轮没有重跑全量测试，整合前沿的 69/69 定向组合与既有 429/430 全量边界继续如实保留。完整记录见 `docs/baseline/creatx-windows-0.1.13-2026-08-08.md`。

## 当前桌面基础交互统一前沿

2026-08-08 已将用户确认的成熟桌面交互语言记录为 `WUI-042 / ACC-WUI-060`：展开、选中、中央打开与 Chat / Workbench 模式分别管理。真实 Renderer 中项目再次点击只折叠工作台列表，当前工作台再次点击只折叠资源，多层目录独立折叠，文件继续在中央真实打开；上述导航动作和会话切换均不清除当前文件、画布、草稿或持续存在的对话组件。项目菜单统一方向键、Escape、外部点击与焦点返回；重命名、删除、分享和工具审批复用统一 Dialog 焦点合同；无行为的品牌下拉和 Chat 三点按钮已移除。Workbench AI 对话默认 320px，可在 280–620px 内连续拉伸，窗口缩放按比例恢复。

Renderer 定向测试 7/7（23 次断言）、Typecheck 和 Production Build 通过。真实 Electron 自动验收两次通过菜单、Dialog、工作台/目录/文件、编辑保存、会话保持、分隔线和 1360×860、900×700、860×620 窗口检查，随后在范围外 Skill Sequence 场景因既有活动 Owner Turn 返回 `session_conflict`；页面、控制台和请求诊断均为空。因此 `ACC-WUI-060` 在本批范围有真实桌面证据，但全套 `test:desktop` 未通过，也没有真实 Provider 调用。权威记录为 `docs/discussions/2026-08-08-desktop-interaction-language.md`；全产品异步成功/失败/重试视觉仍是后续工作。

同日已生成 Windows `0.1.12` 安装版与便携版。打包冒烟进一步发现并修复“回到最新”覆盖 Growth 操作；最终解包 EXE 通过本批全部交互范围，随后在范围外 Skill Sequence 历史数量断言以 `userCount=1, assistantCount=4` 停止。安装版 SHA-256 为 `98BF71FEC60F812E445D2B08A5FE75F665210A03960A6B4A6E13112BAE82F58C`，便携版为 `BE89869269C2805A3AB43502A71350B86392225F4E06AA3F6E7EB14654BAD964`；两者文件版本为 `0.1.12` 且未签名。完整证据与恢复入口见 `docs/baseline/creatx-windows-0.1.12-2026-08-08.md`。

## 当前全局个人艺术库工具前沿

2026-08-08 已取消专属艺术库 AI/Chat 路线，改为任何普通个人或项目会话均可调用同一全局个人艺术库工具。`creatx/packages/art-library-runtime` 已实现公开图片采集、真实图片校验、全库 SHA-256 去重、最多四图视觉读取、统一候审、人工批准/驳回/暂缓、分类目录移动和三组风格关键词确定性导出；Electron Main 固定写入 `<userData>/creatx/art-library`，Growth Worker 不自动获得工具。构建内静态 Art Atlas 已幂等迁移 57 个正式作品与 6 个候审条目，不读取或依赖 `D:\CodexW\my-art`。

定向 Art Library 13/13（52 次断言）、Cline Projection 49/49（123 次断言）、Typecheck、两项 Import Boundary、Production Build 和 `git diff --check` 通过；真实公网重定向探针采集 1/1。全量为 429/430（3,239 次断言），唯一既有 Skill 预算测试在全仓负载下 5021ms 超时，隔离复跑 1/1 通过。桌面 Fixture 已真实从构建产物迁移 57+6 并完成主体交互，最后在无关活动 Owner 回合冲突处失败，不能标记为桌面全套通过。本批未调用真实视觉 Provider，生产艺术库前端仍是静态原型，因此识图与前端审批不标记为 Live（真实运行）。完整证据与恢复入口见 `docs/baseline/creatx-art-library-tools-2026-08-08.md`。

## 当前 Windows 依赖完整性与 AI 工具健康检查前沿

2026-08-08 在 `0.1.11` 打包后的非前端短检查中，权威源码根的 `node_modules\@cline\sdk` 被确认指向一个存在但为空的 Bun Isolated（隔离安装）目录，`package.json` 和全部文件缺失，Node/Bun 均无法解析 `@cline/sdk`；`vite@7.2.4` 包本体存在，但 `node_modules\.bin\vite.exe` 与 `vite.bunx` 均缺失。Adapter 定向测试因此在执行任何用例前失败。该结果证明当前源码依赖树损坏，不证明正在运行的 `0.1.11` 打包 Runtime（运行时）损坏。

提交 `0763ea6` 新增只读 `bun run check:install`，检查 Cline SDK `0.0.65` 传递依赖、两个 SAP AI SDK `2.13.0` Bun Store（包存储）变体、Vite 包与 Windows Shim（命令入口），单元测试 11/11 通过。当前根检查按预期以 `install_integrity_empty` 和 `install_integrity_missing` 失败；SAP 两包和 Vite 包本体通过。相邻短检查为 Import Boundary 2 项、Image Queue 34/34、Growth Scheduler/Lifecycle 44/44，通过；没有运行 Typecheck（类型检查）、全量测试、Production Build（生产构建）、Electron、外部 Provider（模型服务）或正式五项 Live（真实运行）。不得复制 `c466` 或历史 `.bun` 包来修绿。

隔离 Clone `D:\CodexW\Creatx\dependency-install-lab` 从 `45832e2` 执行唯一一次 `bun install --frozen-lockfile`，18.65 秒安装 1,361 个包后以两个 SAP AI SDK 包的 `ENOENT ... (copyfile)` 失败。全局缓存分别完整含 471/547 个文件，项目隔离 Store 仅留下 136/84 个文件且都缺 Manifest，证明失败发生在 Bun `1.3.14` Windows Isolated Linker（隔离链接器）的缓存复制阶段。`LongPathsEnabled=0`，两包最大目标路径为 281/264 字符，超过 259 字符的文件均未复制。

用户确认后，短路径 Control Variable Experiment（控制变量实验）从 `fbe96d0` 建立 `D:\CodexW\cx-install`，固定 Bun、缓存、Registry（包注册源）、锁文件与命令，只改变项目路径。唯一一次冻结安装仍失败，但 `orchestration` 在最长路径由 264 降至 245 后恢复完整；`foundation-models` 最长路径降至 262，仍有 3 个目标超过 259 并缺 Manifest。该对照确认传统 Windows 路径上限是 Isolated Linker 的触发条件。

修复提交 `2cf78df` 将默认布局固定为 Hoisted Linker（提升式链接器），删除 `install-windows.ps1` 的缓存复制旁路，并让 Cline Postinstall 与安装完整性检查同时支持 Hoisted/Isolated 布局。全新长路径 Clone `D:\CodexW\Creatx\dependency-install-verify` 的唯一一次 `bun install --frozen-lockfile` 以退出码 0 在 34.06 秒完成 695 个包；安装完整性 5/5、安装回归 13/13、Import Boundary 2/2、Typecheck 和 Adapter 中文文件读取 1/1 通过。没有修改 Bun `1.3.14`、`bun.lock`、Registry 或 `LongPathsEnabled=0`，没有手工复制包。未运行 Adapter 全文件、全量测试、Production Build、Electron、前端、外部 Provider 或正式五项 Live；权威根既有损坏 `node_modules` 继续保留为证据。恢复入口为 `PHS-023 / ACC-PHS-032` 与 `docs/discussions/2026-08-08-windows-dependency-and-tool-health.md` 的“修复与全新安装验收”。
## 当前 Composer Skill 五项正式 Live 与 Windows 0.1.11 前沿

2026-08-08 已在正式 CreatX、正式 Profile 和真实 Provider（模型服务）中完成一次五项挂篮连续 Live（真实运行）。会话 `1786178002600_eskup`、序列 `skill_sequence_1786178009558` 按地图、六人角色群像、小说大纲与前两章、两页漫画、项目研究总结严格串行完成；每项取得可信 `completed` 回执后才启动下一项。项目 `D:\CodexW\Creatx\skill-sequence-live` 与完整会话永久保留。最终图片状态为 22 succeeded、0 failed、0 interrupted、0 cancelled，Owner 的最终中文汇报保留在原会话。

人物轮最初使用 `Start-Sleep` 与 Shell 反复轮询六张图片，触发 Cline 0.0.65 Mistake Tracker（重复工具循环检测）而主动终止；图片 Provider 本身没有失败。现在仅对 `skill-sequence` Tool Audience（工具受众）开放 `wait_for_skill_sequence_images`，由 Runtime 一次等待当前步骤提交的持久图片终态，支持取消、失败立即返回和 30 分钟上限，禁止 Agent 用 Shell 睡眠或目录轮询。相同 `report_skill_sequence_step` 完成回执作为 Exact Retry（精确重试）幂等返回，内容不同的第二份回执仍冲突失败。同步 `generate_image` 也只在当前步骤中计为图片证据，旧任务 ID 不能冒充本轮交付。

正式 Live 终态后，旧自动化对完整长页面截图超过 90 秒，脚本因此记录 `runner_failed` 并关闭窗口；日志已经先记录产品 `completed`，五项产物和会话均未受影响。脚本现先写 `final-snapshot.json`，只截当前视口、30 秒超时，截图失败只记辅助证据失败且重新打开正式软件。当前文本模型不支持视觉输入，因此图片只完成尺寸、透明度、方差和 HTTP 等程序化验证，没有伪装成人工目检；地图掩码也明确是程序化近似对齐。

当前冻结代码通过 Cline Adapter 104/104（372 次断言）、全量 404/404（3,174 次断言）、Typecheck、Import Boundary、Production Build 和 `git diff --check`。CreatX `0.1.11` 安装版 `creatx/release/CreatX-0.1.11-x64-Setup.exe` 为 121,154,440 字节，SHA-256 `B28CFA9E934B7EE36713ED94322A9F088DB72186034A01B6DFB01F0CAD3D1D9E`；便携版 `creatx/release/CreatX-0.1.11-x64-Portable.exe` 为 120,930,722 字节，SHA-256 `F3FFF113EB3C7B24C8428D45D49AEEFF43C1B1C2C2EB8E3DA19A374C24A198D3`；Blockmap 为 129,485 字节，SHA-256 `BD5D6D6C0217A153501776FC08E8530246F3E65F67BAF1A07FB9992D58972D77`；解包 EXE 为 231,522,816 字节，SHA-256 `410A315685CEE3BDE436B310BBD84E59BDA33ABD5364B1BCE56819F9543F4476`。三个 EXE 文件版本均为 `0.1.11`，Authenticode 均为 `NotSigned`。隔离发布工作树的 `bun install --frozen-lockfile` 安装 1,361 个包后，因两个 SAP AI SDK 2.13.0 包在 Windows 复制联接时 `ENOENT` 而失败；使用正式根中同一锁文件、同版本的这两个已安装包补齐隔离依赖后，Production Build、NSIS、Blockmap 与 Portable 打包通过。该依赖安装问题仍是发布可复现性风险，不能记为冻结安装 PASS。完整证据见 `docs/baseline/creatx-skill-sequence-formal-live-2026-08-08.md`。

## 当前 Windows 0.1.9 打包前沿

2026-08-08 已将 Skill Sequence 真实运行恢复、Session PID 接管和统一视觉入口修复打包为 CreatX `0.1.9`。安装版 `creatx/release/CreatX-0.1.9-x64-Setup.exe` 为 126,393,193 字节，SHA-256 `6B9384E71FAD017312BF0EDFCF945FF963E203A010B4AD3B9EAB1D5C1D0E6554`；便携版 `creatx/release/CreatX-0.1.9-x64-Portable.exe` 为 126,169,427 字节，SHA-256 `68E5E6B8F6A54523C7CD949BF94B51A8D5043199D1DF97FBC84069320299620A`；Blockmap 为 133,949 字节，SHA-256 `7AEF64FF649B91D26E7341FC1E5850BBFADF73A6B05E26A08175F4DD88AAE5B3`。安装版、便携版与解包 EXE 的文件版本均为 `0.1.9`，旧 `0.1.8` 保留，Authenticode 状态均为 `NotSigned`。

冻结安装无变化，`bun run package:win` 完成 Production Build、NSIS、Blockmap 与 Portable x64。打包期间原 `0.1.8` Portable 主进程保持运行，没有关闭软件或修改正式 Profile。新包没有启动、安装、调用外部 Provider 或执行五轮/整本 Live；自动化代码证据沿用提交 `d974697` 的 397/397 全量测试（3,157 次断言）及相关定向验收。完整记录见 `docs/baseline/creatx-windows-0.1.9-2026-08-08.md`。

## 当前 Skill Sequence 真实运行恢复前沿

2026-08-08 已修复 CreatX `0.1.8` 实机五轮挂篮在地图第十二次工具调用后停止的问题。普通聊天仍保持十二次 Turn 预算；挂篮把该上限作为内部执行片段边界，同一 Skill 最多自动续跑四段，沿用同一 Cline Session、真实工具结果和项目文件，用户原话只投影一次。每个 Skill 完成后才进入下一项；四段仍耗尽会停止后续项并返回结构化未完成结果。Adapter 在恢复历史前先收束真正死亡的旧进程，再通过带条件的 SQLite 与 Manifest 更新接管 PID；存活进程或并发接管失败关闭。同步 `generate_image` 与持久图片队列现共用唯一视觉 Prompt 编译器，并准确返回是否应用最近《统一画风.md》。

本地真实 Cline 链路已完成十二次真实工具调用、触发上限、自动续轮和下一 Skill，未出现未解决 Runtime 红错。Typecheck、Import Boundary、全量 397/397（3,157 次断言）、PID 接管 2/2、图片队列 33/33、同步生图 19/19、Production Build 和 `git diff --check` 通过。没有外部 Provider、正式 Profile、整本重跑或新发布包。四段耗尽时 Renderer 当前只显示“结果未知”，专用黄色详情卡与跨重启可读摘要尚未闭环；世界星图继续冻结。完整证据见 `docs/baseline/creatx-skill-sequence-runtime-recovery-2026-08-08.md`。

## 当前 Windows 0.1.8 打包前沿

2026-08-08 已将 Unified Creative Workflows（统一创作工作流）整合头打包为 CreatX `0.1.8`。安装版 `creatx/release/CreatX-0.1.8-x64-Setup.exe` 为 126,390,709 字节，SHA-256 `7F4EB0E439D3D8574F6A69FA9447139D9F8A71935AE9D64D05082CB9F6944A28`；便携版 `creatx/release/CreatX-0.1.8-x64-Portable.exe` 为 126,166,946 字节，SHA-256 `69AA03B605B74727884B59AF963B68414DF8C6C296F262AB29792788D5615803`；Blockmap 为 134,091 字节，SHA-256 `AC8E5252DDD2F23F29A04951436994EF443384A1E8C3ADBCE27AD977353863A3`。安装版、便携版与 `release/win-unpacked/CreatX.exe` 的文件版本均为 `0.1.8`，旧 `0.1.7` 产物未覆盖，Authenticode 状态均为 `NotSigned`。

`bun run package:win` 以退出码 0 完成 Production Build（生产构建）、NSIS 与 Portable x64 打包，`git diff --check` 通过。本批没有启动或安装新 EXE，没有修改正式 Profile，没有调用外部 Provider（模型服务），也没有重新运行整本 GWP；因此这里只证明当前整合头可以生成 Windows 发布包，不构成创作质量或长跑稳定性的新增 Live（真实运行）证据。完整记录见 `docs/baseline/creatx-windows-0.1.8-2026-08-08.md`。

## 当前 Unified Creative Workflows 主线整合前沿

2026-08-08 已将 `unified-art-style` 的新增能力选择性接入 `topic-genre-style`：`70d4f85` 接入 Composer Skill Sequence（输入区技能顺序）、漫画 V23 方法与已跟踪《九灯之夜》证据；`c8e5c14` 接入地图 V24、五位著名人物加一位普通人的角色群像、既有世界转小说，以及角色画廊、互动地图、世界星图和角色设定工作台 Prototype（原型）。`0117736` 与 `811180a` 因主线已有更新等价实现而跳过；来源分支旧 Main、Adapter、Growth、Image Queue 和 Preview 没有覆盖主线。来源工作树约 84MB 未跟踪样片未复制、未删除、未提交，旧桌面截图也未倒灌；合并后由当前代码重新生成并人工查看了界面证据。

主线验收为冻结安装无变化、Typecheck、Import Boundary、全量 391/391（3,130 次断言）、Production Build、Web Preview Build、Web Preview 自动交互和 Desktop Fixture PASS；人物画廊构建器 2/2、直接相关组合 68/68（501 次断言）通过。Desktop 验证挂篮会话隔离、一次性启用和一条用户消息对应两个顺序 Run，测试进程正常退出。没有调用外部 Provider、生成新地图/人物/小说/漫画成品或运行整本 GWP，因此创作质量与外部模型遵循率尚未 Live（真实运行）。世界星图继续只是 Prototype，不进入正式安装或挂篮。完整边界见 `docs/baseline/creatx-approved-creative-skills-v24-2026-08-08.md` 与 `docs/plans/2026-08-08-unified-creative-workflows-integration.md`。

## 当前工作台布局对照原型

2026-08-08 Web Preview 新增 `工作台核心 / 均衡布局 / Chat 对照` 三种即时切换，只通过根级 `data-preview-variant` 改变原型 Grid 投影，不修改生产 `WorkspaceShell`、会话、文件或持久协议。URL 保存当前对照项，`Alt + ← / →` 可循环切换；自动验收验证三项按钮、`workbench-core` 的实际列位、URL 同步和返回 Chat。Typecheck、完整 Web Preview 交互测试和 Preview Production Build 通过，截图证据位于 `artifacts/frontend-redesign/web-preview/`。该原型不是已接受的生产布局，后续合并不得据此整体覆盖当前 Chat / Workbench 产品语义。记录见 `docs/discussions/2026-08-08-workbench-layout-preview-variants.md`。

## 当前 Growth 终态清理与 Windows 0.1.7 前沿

2026-08-08 已完成 Growth 终态一致性、Worker 回收、轻量历史与新图片路径规范化批次。World Materialization（世界物化）的进度、层报告、控制器结果和 Owner 汇报现在消费同一终态证据；部分完成逐项披露，取消不再伪装成 `session_persistence`。GWP 图片任务保存可信 Goal、Work Item 和 Attempt 来源；同对象开放 Issue 在终态统一收敛。正式 Owner Assistant 回复持久化并提交 Goal 终态后，Desktop 才异步精确回收该 Owner/Goal 的终态 Worker；活动 Worker 保留，清理崩溃由受控 Journal（清理日志）幂等重放，作品、Owner 历史、Growth 和图片事实不删除。新 Live Archive 只保存 Owner Session，终态历史不再重载 Worker Artifact。旧正式档案不会因本批自动扫描删除既有 Worker。

新图片任务在视觉母版读取、幂等比较、Store 写入和 Provider 调用前统一把 Windows 反斜杠规范为 `/`；不安全路径在任何副作用前失败关闭，旧 SQLite 不迁移。Windows Builder 已使用七层 CreatX 鸟标 ICO，版本升为 `0.1.7`。安装版 `creatx/release/CreatX-0.1.7-x64-Setup.exe` 为 126,376,823 字节，SHA-256 `7217EBA6E4147DBD7A1EC180BBE49BFF765C1F601DD8147645C4BCEE5612B876`；便携版 `creatx/release/CreatX-0.1.7-x64-Portable.exe` 为 126,153,058 字节，SHA-256 `DCB862E35F4E6F801AA47097AFF2331051F5E0140A846D863052717B7407D11B`；Blockmap 为 133,367 字节，SHA-256 `4BC53E71B1A603FD50EEB492293639D8122BD1D128EA9506F4517B00F84F6A70`。三个 EXE 版本资源为 `0.1.7`，解包程序可提取并识别鸟标，Authenticode 均为 `NotSigned`。

最终验证：`bun install --frozen-lockfile` 无变化，Typecheck、Import Boundary、全量 384/384（3,055 次断言）、Production Build 和 `git diff --check` 通过；Image Queue 33/33、Worker Retention 5/5（18 次断言）、Owner Delivery 14/14、Cline Attachments 32/32（160 次断言）、Live Archive 两个定向场景和 Windows 图标 1/1 通过。源码构建与 `release/win-unpacked/CreatX.exe` 均使用隔离 Profile 和本地测试 Provider 完成 Desktop 冒烟，测试进程正常退出。没有调用外部 Provider、运行整本 GWP、安装 NSIS、启动 Portable 或修改正式 Profile，因此本批不是外部 Live 长跑证据。已知 Medium 风险仍是极窄的 Start Activation 尚未绑定既有 Goal 时并发 Pause 可能漏掉一次迟到 Owner Provider 回合；现有门禁阻止 Scheduler/文件副作用，但该竞态尚未补齐屏障测试。证据与恢复入口见 `docs/baseline/creatx-growth-terminal-cleanup-2026-08-08.md`。

## 当前 Windows 0.1.6 打包与实机冒烟前沿

2026-08-07 已把工作台与长跑流畅度第一批修复及当前整合头打包为 CreatX `0.1.6`。安装版为 `creatx/release/CreatX-0.1.6-x64-Setup.exe`（121,153,269 字节，SHA-256 `5271F69B1E2639AB5503D0DD1CF5B9D31FBA078036301DEBF3C7B3244D3E9F47`）；便携版为 `creatx/release/CreatX-0.1.6-x64-Portable.exe`（120,923,513 字节，SHA-256 `3464E6AEB635921C31192045983A0AEDE95D61C81C46ED8F943B59585B477DEF`）；Blockmap 为 128,936 字节，SHA-256 `0DE279235FD68DE3E3ABADBA1E51B90CF1A9A1516C5959485ADE541B8B655D24`。旧 `0.1.5` 及更早产物保留，三个 EXE 版本资源均为 `0.1.6`，Authenticode 状态仍为 `NotSigned`。

`bun run package:win` 以退出码 0 完成 Production Build、NSIS 和 Portable x64 打包。随后用 `release/win-unpacked/CreatX.exe`、隔离 Profile 和真实临时 Markdown/PNG 做打包程序冒烟：窗口启动成功，图片 `readFile` 只返回 `creatx-workbench://` URL，无 Base64；工作台打开图片后保存无关 Markdown，原图片 DOM 标记仍存在；页面错误与控制台错误均为 0，测试实例正常关闭并清理 Profile。截图保留于 `D:\CodexCache\Temp\creatx-0.1.6-smoke.png`。本次没有调用 Provider、运行 GWP、修改正式 Profile 或安装 NSIS；真实长跑帧率与内存仍需用户任务验证。

## 当前工作台与流式性能前沿

2026-08-07 已完成第一批工作台与长跑流畅度修复：项目图片通过 `creatx-workbench://` 稳定 URL 加载，不再把完整 Base64 作为常规 Preview 跨 IPC；无关项目写入保留当前 Preview，真实图片变化无空帧替换。Main 对同 Session、同 Timeline Item 的 16ms 增量合并为最新一次，Renderer 对已有 Item 原位置更新。文本 Provider 额度失败后按连接冷却 30 秒，暂停、取消和退出可中断，同一失败连接不再连续创建后续必败 Worker，其他连接不受影响。

冻结安装无变化、Typecheck、Import Boundary、定向 31/31、Cline Adapter 相关 32/32、全量 374/374（3,006 次断言）、Production Build 和 `git diff --check` 通过。没有调用真实 Provider、重启当前 Electron、修改正式项目或执行实机性能复测；Cline Core 对单 Worker 的有限 429 重试仍保留，独立进程迁移仍是后续架构批次。决定与证据见 `docs/discussions/2026-08-07-workspace-stream-performance.md`，权威验收为 `ACC-WUI-058` 与 `ACC-GRT-064`。

## 当前对话图片流式稳定性前沿

2026-08-07 已修复流式 Markdown 每次追加文本都重建匿名图片组件的问题：链接与图片渲染器现在保持模块级稳定，项目上下文通过 React Context 传递；图片只在项目、文件 ID 或修改时间真实变化时重新读取。Chat 图片单独限制为最大 `460px / 46vh`，工作台大图和图文环绕版式不变。

修复前新增回归稳定失败，修复后定向 3/3（15 次断言）、Typecheck、Import Boundary、全量 365/365（2,980 次断言）、Production Build 和 `git diff --check` 通过。没有启动 Electron 重放真实多图流式消息；刚生成的 `0.1.5` 早于本批修改，不包含该修复。决定与证据见 `docs/discussions/2026-08-07-chat-image-stream-stability.md`，权威验收为 `ACC-WUI-057`。

## 当前 Windows 0.1.5 打包前沿

2026-08-07 已把 Owner 命令项目隔离及当前整合批次打包为 CreatX `0.1.5`。安装版为 `creatx/release/CreatX-0.1.5-x64-Setup.exe`（121,155,180 字节，SHA-256 `69C9F3B11F1872BAB8D4C961A563382FCFE08CFD094BF76E821CCB016B6B9306`）；便携版为 `creatx/release/CreatX-0.1.5-x64-Portable.exe`（120,925,415 字节，SHA-256 `801B6C8CF9465D27B86C27A13E7268948720375C2FD7B93F4D58835F0D388C7C`）。安装版 Blockmap 为 129,176 字节，SHA-256 `479764D9E38E8E711CA4E7BDC2596AE215EC14EF78E3395D4C9640D83D6FA5BD`。

`bun run package:win` 以退出码 0 完成 Production Build、NSIS 和 Portable x64 打包；两个 EXE 的文件版本与产品版本均为 `0.1.5`，旧 `0.1.4` 产物保留。本批没有启动或安装新 EXE，也没有触发正式 GWP 或 Provider 请求；两个 EXE 的 Authenticode 状态仍为 `NotSigned`，Windows 可能显示未知发布者。

## 当前 Owner 命令项目隔离前沿

2026-08-07 已移除 Renderer 的全局单条 Owner 恢复槽：显式 GWP 与 Resume 现在按 Owner Session 保存为版本化集合，不同项目可以各自保存、运行和重启恢复；同一 Session 的不同未决命令仍失败关闭，同一项目主任务冲突继续由 Growth Runtime 权威判断。旧 `creatx.pending-owner-command.v1` 在首次读取时保留 requestId 迁移，单条损坏不会删除其他项目记录，后台恢复错误不再投影到当前无关会话。

定向恢复测试 5/5（17 次断言）、Typecheck、Import Boundary、全量 364/364（2,979 次断言）、Production Build 和 `git diff --check` 通过。没有调用 Provider、修改正式 Growth 数据、自动重发现场失败命令或启动 Electron；不同项目真实 GWP 并行仍待新 Build 实机验证。决定与证据见 `docs/discussions/2026-08-07-owner-command-project-isolation.md`，权威规则为 `GRT-023` 与 `ACC-GRT-063`。

## 当前 Windows 0.1.4 打包前沿

2026-08-07 已把图片连接故障隔离及当前整合批次打包为 CreatX `0.1.4`。安装版为 `creatx/release/CreatX-0.1.4-x64-Setup.exe`（121,154,770 字节，SHA-256 `B6CFBA8473FBF65D0FD49DDB062CE63C80895A5AB6F76D0C1B7460C7B2319665`）；便携版为 `creatx/release/CreatX-0.1.4-x64-Portable.exe`（120,924,900 字节，SHA-256 `B468D007CE0ACA6CE9536FBC6B2D63B6D31B7BD115CB5740BA682A96614E0DAF`）。安装版 Blockmap 为 129,184 字节，SHA-256 `12DBFEBC3911A98B295BC627AC16D1B6452880D8D55B0B3683F8E4ACDD5F13BB`。

`bun run package:win` 以退出码 0 完成 Production Build、NSIS 和 Portable x64 打包；两个 EXE 的文件版本与产品版本均为 `0.1.4`，旧 `0.1.0` 至 `0.1.3` 产物保留。本批没有启动或安装新 EXE，也没有触发正式图片任务；两个 EXE 的 Authenticode 状态仍为 `NotSigned`，Windows 可能显示未知发布者。

## 当前图片连接故障隔离前沿

2026-08-08 已把此前 30 秒内存冷却替换为 SQLite 持久项目门禁。Image Runtime 继续从嵌套 `cause` 提取白名单网络类别与标准错误码，不保存原始主机名或请求内容；非取消的 `image_result_unknown` 使余下任务保持排队，应用重启也不会领取下一张，其他项目继续运行。Agent 只允许一张自动恢复探针；再次结果未知后必须停止自动重试，用户显式重试仍可探测。成功或明确 HTTP 结果恢复队列，未知结果继续门禁。

该门禁已进入当前全量与正式五项 Live；本次 22 个图片任务全部成功，没有实际触发未知结果门禁，因此真实网络故障恢复仍只有自动化证据。旧记录因未保存底层 `cause` 仍无法追溯当时的精确网络原因。原始隔离决定见 `docs/discussions/2026-08-07-image-transport-failure-isolation.md`，替代决定见 `docs/discussions/2026-08-08-strict-skill-sequence-and-image-gate.md`。

## 当前 Composer Skill 严格串行前沿

2026-08-08 Composer Skill 挂篮已改为可信完整交付推进：一个 Cline Turn 的正常结束不再等同于当前 Skill 完成；只在序列 Tool Audience 中开放的 `report_skill_sequence_step` 验证真实项目产物，地图、人物群像和漫画还必须验证必需图片任务全部成功。`partial`、`blocked`、失败、取消、缺回执或四段预算耗尽都会停在当前项，剩余 Skill 保持未启动。普通会话仍看不到内部回执工具，同一 Session 只保留一条正式用户消息。正式五项连续 Live 已通过，结果和边界见本文件顶部及对应基线。

## 当前图片挂接位置冲突前沿

2026-08-07 已把 `image_attachment_conflict` 从用户故障降为内部诊断证据：图片仍保持成功并短暂显示“已生成”，三秒后从活动栏消隐；项目打开时的 GWP 回执对账不再发送该冲突的全局 Runtime（运行时）错误；Owner 最终汇报不再列出这类未插入文章。系统不猜测新位置、不修改正文、不重新生图，其他图片生成或挂接故障继续如实显示。

定向 50/50、Typecheck、Import Boundary、全量 361/361（2,969 次断言）和 Production Build 通过。没有调用外部 Provider、启动 Electron、修改正式数据库或现有作品文件；正式《灰冠诸境》界面是否不再显示旧冲突，仍需使用包含本批代码的新 Build 实机重开项目验证。产品决定见 `docs/discussions/2026-08-07-silent-image-attachment-mismatch.md`。

## 当前 Windows 0.1.3 打包前沿

2026-08-07 已把 GWP 回执驱动正文图片关系批次打包为 CreatX `0.1.3`。安装版为 `creatx/release/CreatX-0.1.3-x64-Setup.exe`（121,154,772 字节，SHA-256 `DE739A861D6169E09C2B56C2A11B18078AA1F58A762B5FF7EE1656C1A153C413`）；便携版为 `creatx/release/CreatX-0.1.3-x64-Portable.exe`（120,924,898 字节，SHA-256 `7F5D524DD5466CF9B282D2694AEADC5478F2EEC8742E046B4E07516C4750E380`）。安装版 Blockmap 为 129,319 字节，SHA-256 `D7195436AE12612904FF67230996B7B08E766AC3A719D27300A74FC7D5469060`。

`bun run package:win` 以退出码 0 完成 Production Build、NSIS 和 Portable x64 打包；文件与产品版本资源均为 `0.1.3`，旧 `0.1.0` 至 `0.1.2` 产物保留。本批没有启动或安装新 EXE，因此尚未触发正式旧世界的回执对账。两个 EXE 的 Authenticode 状态仍为 `NotSigned`，Windows 可能显示未知发布者。

## 当前 GWP 正文图片关系前沿

2026-08-07 Growth World Pro 已停止依赖 Writer 手工复制 `attachment`：持久 `WorldMaterializationReceipt` 的 `artifactPath + imageTaskId` 是生成关系权威，图片队列复用现有挂接列幂等绑定，图片先成功或回执先保存都进入唯一 `ImageAttachmentService`。项目进入后由 Electron Main 扫描所有权威世界的正式回执并后台对账；异义关系失败关闭、游离任务不猜测、挂接失败不回滚图片成功或阻塞正文。后续产品澄清规定位置不匹配静默，其他挂接缺失仍进入 Owner 汇报。

队列语义同步调整为失败/中断重试进入项目队尾，只有 queued 可“跳到最后”；Renderer 按生成中、等待、失败待处理和短暂终态分区，错误摘要直接可见、技术详情可展开。冻结安装、Typecheck、Import Boundary、图片队列 28/28、全量 358/358（2,964 次断言）、Production Build 和 `git diff --check` 通过。没有调用外部 Provider、启动 Electron 或修改《灰冠诸境》《太衡界世界》及正式数据库；旧世界要在新 Build 实机打开后才执行正式对账。证据见 `docs/baseline/creatx-gwp-receipt-image-attachments-2026-08-07.md`。

## 当前项目图片工作流前沿

2026-08-07 项目级图片工作流已完成代码与自动化闭环：同项目严格单 Provider 请求、全局最多两个项目并行、公平轮转和 Attempt 持久证据已经取代旧全局单 Worker；重试进入项目队首，跳过进入队尾，取消永久放弃逻辑任务。普通会话、Growth 和 Growth World Pro 共用 `submit_image_generation`，并可用 `manage_image_generation` 查询、重试、跳过和取消；Renderer 只通过稳定 Desktop API 显示当前项目进度。

图片成功后的可选挂接由唯一 `ImageAttachmentService` 通过 Project File Port 写入标准 Markdown 引用。工作台从正文真实引用解析图片，宽屏普通图右侧环绕、横图全宽、窄屏上下排列。普通 HTML 被分类为不可直接编辑的 `html`，从文件所在目录经 `creatx-workbench://` 隔离协议预览，不使用 `dangerouslySetInnerHTML`、`file://` 或 Data URL，也不暴露 Electron、Node、Cline 或 Provider 接口。

冻结安装、Typecheck、Import Boundary（导入边界）、356/356 全量测试（2,953 次断言）、Production Build 和 `git diff --check` 通过。没有调用外部图片 Provider，也没有启动 Electron 做图文与 HTML 视觉 Live；跨项目真实付费并发和最终版式仍待用户级验收。证据见 `docs/baseline/creatx-project-image-workflow-2026-08-07.md`。

## 当前 Windows 0.1.2 打包前沿

2026-08-07 已把项目图片工作流集成头打包为 CreatX `0.1.2`。安装版为 `creatx/release/CreatX-0.1.2-x64-Setup.exe`（121,156,440 字节，SHA-256 `13274874C5081594ACF82A49DB30C457BECA700DDED55BACE75E89BA373F0297`）；便携版为 `creatx/release/CreatX-0.1.2-x64-Portable.exe`（120,926,561 字节，SHA-256 `764EAAD3742E986F0F4F1C45167213F70929D342B9EEFEB2B4CDB97CA509B93D`）。安装版 Blockmap 为 129,985 字节，SHA-256 `1A2FB38C1F9194E1EC06E4DA31527F15165073CDBF232CEAE81C09CA53D768B1`。`bun run package:win` 以退出码 0 完成 Production Build、NSIS 和 Portable x64 打包，旧 `0.1.0` 与 `0.1.1` 产物均保留。

本批没有启动新 EXE，以免与当前运行中的软件争用正式 Profile。两个 EXE 的版本资源均为 `0.1.2`，Authenticode 状态为 `NotSigned`，Windows 可能显示未知发布者；不得把它们称为已签名正式发行版。

## 当前全局模型与会话回退前沿

2026-08-07 已确认设置页当前选中的文本 Profile 是全局默认，对话框模型下拉只提供单会话覆盖。历史或迁入会话的 `creatxTextProfileId` 仍可解析且含有效凭据时保留；Profile 已删除、未迁移、无法解析或缺凭据时，Cline Adapter 在 Provider 请求前自动改用全局默认并把 Provider、模型和 Profile ID 写回同一会话。全局也无凭据时本地失败关闭，Provider 请求和新增 Cline 用户消息均为零。

真实故障会话 `1786011824234_7atom` 仍绑定已不存在的 `openai-compatible / gpt-5.6-luna` Profile，而正式设置仅有已配置的 DeepSeek；旧 Adapter 因全局 `configured=true` 通过门禁后构造了无 Key、无 Base URL 的旧连接，导致 `/draw-comic` 在加载 Skill 前落到默认 OpenAI 地址。现场确认没有漫画文件、工作台或项目版本副作用。本批定向模型测试 33/33（159 次断言）、Import Boundary、Typecheck、全量 342/342（2,910 次断言）和 Production Build 通过；没有修改该会话、重放消息、调用 Provider或重启 Electron。权威规则为 `PHS-021`、`SES-011`，决定记录见 `docs/discussions/2026-08-07-global-model-session-fallback.md`。

## 当前 Growth 内容恢复前沿

2026-08-07 Growth World Pro 已把内容级失败从单一僵硬重试改为 `retry / repair / accept / bypass` 四种恢复动作：授权修复只进入红色 `repairing`，对象形成可信物化回执后才转绿色 `resolved`；安全绕过持久成功后转绿色 `bypassed`，两种绿色反馈均在 3 秒后从界面消失。`blocked`、`retryable` 和兼容旧数据 `unknown + block` 均可恢复；Writer 修复只获得当前对象权限和精确错误，半成品 extraction 不再提前锁死后续可信提交。自动修复耗尽时可如实绕过局部对象或其依赖子树，剩余世界继续生成，最终汇报保留缺失范围；身份、持久状态、并发主任务、正式回执覆盖和未知副作用风险仍失败关闭。

本批未重启当前 Electron、未修改现有 Goal/Issue、未调用 Provider，也未重跑整本。验证为直接相关目录 220/220（2,274 次断言）、Import Boundary、Typecheck、全量 339/339（2,898 次断言）和 Production Build。新 Build 中的真实 Growth 恢复与同题材整本复跑尚待用户执行。产品决定见 `docs/discussions/2026-08-07-growth-content-repair-freedom.md`，权威规则为 `GRT-034` 与 `ACC-GRT-062`。

## 当前 Session 运行状态隔离前沿

2026-08-07 Renderer 已把全局 `runState` 改为按 Session ID 隔离：非当前会话的 `run.state` 终态不再被过滤，创建、发送、分享、Owner 恢复和删除只更新目标会话；已等待完成但漏收终态事件的命令离开 `running` 并标记 `unknown`。正式 Profile 中《太衡界世界》首次打开及切换会话再返回均为 `completed`，active 处理区 0、“正在处理”0、“已处理”1、折叠明细预挂载 0，正式 Owner 回复仍可见。本批没有调用 Provider 或重跑 Growth。Typecheck、Import Boundary、329/329 全量测试（2,960 次断言）和 Production Build 通过。证据见 `docs/baseline/creatx-session-run-state-isolation-2026-08-07.md`。

## 当前完整 Live 档案前沿

2026-08-06 已接通完整 Growth Live 从隔离 Profile 到正式产品数据的 Inbox 晋升：通过既有整本 PASS 门禁且测试 Electron 关闭后，脚本把项目、关联数据库快照和 Owner/Worker Artifact 写入正式 Inbox；正式桌面在各 Store 打开前幂等接收，重算 Project ID，并由 Cline Adapter、Growth Runtime、Image Runtime 和 Session Runtime 各自写回唯一权威。模型密钥、Cookie、缓存和隔离设置不进入档案；源 `queued/generating` 图片保存为带原因的 `interrupted`，不自动继续付费 Provider 工作。单个档案失败保留 `failure.json`，不阻止桌面启动。

《太衡界世界》已从 `nOIEx8 / OBvv9u` 真实迁入正式 Profile：472 个项目文件、201 条会话（Owner 1、Worker 200）、1 个 completed Goal、70 个 Issue、17 个 stage attempt、17 份 report receipt 和 97 个图片任务均可从正式权威读取。《灰冠诸境》也已从旧 Schema 的 `qQikl2 / wySQry` 兼容迁入：688 个项目文件、292 条会话（Owner 1、Worker 291）、1 个 completed Goal、208 个 Issue、23 个 stage attempt、18 份 report receipt 和 141 个图片任务均保留。两个档案旧临时路径均为 0、正式图片队列均无 queued/generating，四个源目录仍保留。证据见 `docs/baseline/creatx-live-archive-promotion-2026-08-06.md`，恢复入口为 `docs/capabilities/import-export/`。

正式 Profile 首次打开《太衡界世界》时暴露出会话恢复性能缺陷：每个 Worker 通过 Cline Core 按 ID 读取时都会再次扫描全部 Session，200 个 Worker 的 Timeline 恢复实测 62.3 秒并使 Electron 超过 1.2 GB 后失去响应。Adapter 现改为从已取得的 Worker Record 直接读取 Cline 消息 Artifact，缺少路径的旧记录才回退 Cline；Owner 仍由 Cline 读取。相同正式数据副本中《太衡界世界》降至约 0.6–1.0 秒，《灰冠诸境》291 个 Worker 约 1.1 秒。生产 Electron 已观察到用户消息、折叠处理区和正式 Assistant 回复同时可见，折叠区不预挂载 753 个内部明细。证据见 `docs/baseline/creatx-live-archive-conversation-recovery-2026-08-06.md`。

## 当前 Growth 蓝图与题材前沿

2026-08-06 已修正 Growth World Pro 阶段二、三的对象所有权冲突：阶段一 `initialize` 创建唯一世界根工作台和十二份空层蓝图，阶段二只 `inspect` 并强制对象数保持为零，阶段三成为具体 group、entry、来源映射和因果的唯一创建阶段。蓝图 `append` 现在只在已存在对象与提交语义完全一致时保留它们并补写缺失对象；同 key 异义继续失败关闭。Blueprint Worker 工具错误通过当前 attempt 的观察端口在 Worker 返回前写入 Growth Issue，终态重复对账按 tool call 幂等。该能力不自动重放退出或崩溃前的 Provider 和未知工具。

题材配置从 4 个扩充为 36 个可见题材，包含中式修仙、武侠、神话史诗、航海时代、太空歌剧、赛博朋克、末世、恐怖和现实/惊悚等方向；它们共享 9 组文类偏好母型，只排序候选 Publication Genre，不成为正文硬合同。定向证据为 World Blueprint 32/32、Creative Skills 19/19、Scheduler 31/31 和真实 Cline Adapter 蓝图失败观察 1/1；集成 Growth Node 120/120、Typecheck、Import Boundary、全量 319/319（2,937 次断言）和 Production Build 均通过。没有运行新的外部 Provider 或整本 Live；失败测试项目不迁移、不补生成，完整整本产物保留。恢复入口为 `docs/discussions/2026-08-06-growth-blueprint-recovery-and-topic-taxonomy.md`。

## 当前项目统一画风前沿

2026-08-06 Growth World Pro 第三阶段已经通过 `write_world_blueprint prepare_review` 受信任地产生 `<作品根>/视觉设定/统一画风.md`；Blueprint Worker 没有获得通用写权限，冻结前验证母版存在且非空。持久 `ImageTaskQueue` 从目标图片路径向上选择最近母版，在首次持久化前编译最终 Prompt，数据库保存 Provider 实收内容；精确幂等重试复用首次 Prompt，不因母版后来修改而重复拼接或冲突。缺失母版时保留原 Prompt、记录分类警告并继续，World Pro Owner 最终汇报列出未应用母版的图片。第一版没有数据库 Schema、Renderer、Provider、视觉版本状态机或自动重绘变化。定向证据为 World Blueprint 27/27、Image Queue 16/16、World Materialization 35/35；分支原验收为冻结安装、Typecheck、Import Boundary、全量 318/318（2,154 次断言）和 Production Build，合并后将在主线重新验收。新工作树的 Cline 补丁脚本同时兼容实际存在的 Hoisted 与 Bun Isolated 安装路径。尚未执行外部图片 Provider 视觉一致性 Live，也未重绘既有图片。恢复入口为 `docs/plans/2026-08-06-project-visual-style.md`。

## 权威根与代码边界

- 当前权威根：`D:\CodexW\Creatx\creat1`
- 当前分支：`topic-genre-style`
- 当前产品源码：`creatx/**`
- 唯一 Agent Harness（智能体运行框架）：Cline SDK `0.0.65`
- Cline 只读来源证据：`D:\CodexW\Creatx\cline-baseline`
- 只有 `creatx/packages/cline-adapter` 可以导入 Cline 包或私有类型。
- 根级 NovelX/OpenCode 快照已由提交 `e286ed4` 从活动树移除，可从标签 `pre-repository-cleanup-20260806` 恢复。
- 活动文档只保留产品、ADR、能力线及其引用闭包；旧计划、旧试跑流水和旧界面参考继续由同一清理前标签保存。

## 当前产品主线

CreatX 是以真实对话、真实项目文件和可编程工作台为核心的 AI 创作桌面应用。普通会话由 Cline 拥有消息、模型循环、工具和取消事实；CreatX 拥有项目、工作台、Growth Goal、图片任务、稳定 UI 合同和桌面生命周期。

当前已接通：

- Chat / Workbench 双模式、文件阅读与编辑、工作台注册和交互主页；
- 普通会话、审批/自由模式、附件、模型配置和中文用户可见输出；
- Growth、Growth World、Growth World Pro 的显式命令、Owner 权威、阶段 Worker、暂停/继续/取消、问题恢复和最终回复；
- 十二层世界蓝图、正文物化、来源采用关系和持久图片队列；
- 艺术库、点子库、传承库、Art Chat、地图与漫画 Skill。

## 当前最强证据

- Owner 整本运行与投影修复：`docs/baseline/creatx-owner-growth-full-run-projection-repair-2026-08-06.md`
- Growth 前三阶段蓝图合同：`docs/baseline/creatx-growth-blueprint-contract-repair-2026-08-05.md`
- Chat / Workbench 真实桌面布局：`docs/baseline/creatx-chat-first-workspace-live-2026-08-05.md`
- 可编程工作台主页：`docs/baseline/creatx-programmable-workbench-home-2026-08-05.md`
- 地图与漫画 Skill：`docs/baseline/creatx-map-comic-skills-v22-2026-08-05.md`
- 本机创作资料库与 Art Chat：`docs/discussions/2026-08-06-local-creative-libraries-and-art-chat.md`
- Cline 第一条真实骨架：`docs/baseline/creatx-walking-skeleton-2026-07-26.md`
- 图片 Provider 与队列：`docs/baseline/creatx-image-provider-pilot-live-2026-07-27.md`、`docs/baseline/creatx-image-queue-runtime-2026-07-28.md`
- 完整 Live 档案晋升：`docs/baseline/creatx-live-archive-promotion-2026-08-06.md`
- 完整 Live 档案会话恢复：`docs/baseline/creatx-live-archive-conversation-recovery-2026-08-06.md`

2026-08-06 当前集成状态：冻结安装、Typecheck、Import Boundary（导入边界）、323/323 全量测试（2,944 次断言）、Live Archive Node 4/4 和 Production Build（生产构建）通过。正式 Profile 中两本完整 Live 档案的 Owner 对话已经在真实 Electron 中恢复可见。本轮没有重新调用外部 Provider 或重新跑一整本 Growth；真实验收是迁移并打开既有完整整本，而不是新的内容生成验收。

## 已知边界

- 最近整本运行完成 181/181 篇正文，但最终桌面观察曾受投影排队影响；修复后尚未再次跑完整外部 Provider 整本验证。
- Art Chat 分享、地图和漫画没有新的真实 Provider 生产验收。
- 精确崩溃续跑和严格一次副作用恢复不是当前 Walking Skeleton 门禁。
- `C:\Users\16014\.codex\worktrees\89bf\creat1` 是用户当前 `unified-art-style` 并行工作树，必须保留并通过提交合并。

## 下一恢复入口

新任务先从 `docs/capabilities/README.md` 选择唯一能力线，再读取对应 `product-spec.md`、`acceptance.md` 和 `plan.md`。涉及 Owner/Growth 主链时，以 `docs/capabilities/growth-runtime/`、`docs/capabilities/creative-skills/` 和上述 Owner 整本证据为准，不从历史聊天或已删除中间计划恢复规则。
