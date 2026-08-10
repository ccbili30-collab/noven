---
title: Image Runtime 验收矩阵
doc_type: capability-acceptance
owner: image-runtime
status: growth-source-and-path-normalization-verified
last_verified: 2026-08-08
---

# Image Runtime 验收矩阵

| ID | 规则 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| `ACC-IMG-001` | IMG-001 | 缺少 Base URL 或 API Key | 请求发出前失败，错误不包含密钥 |
| `ACC-IMG-002` | IMG-002, IMG-003 | Provider 返回 `b64_json` | 解码、验证图片并返回统一候选 |
| `ACC-IMG-003` | IMG-002, IMG-003, IMG-006 | Provider 返回 HTTPS URL | 下载、限制大小、验证图片并返回统一候选 |
| `ACC-IMG-004` | IMG-004 | 候选写入真实项目 | 经 Project File Port 落盘并重新读取相同字节 |
| `ACC-IMG-005` | IMG-005 | HTTP、错误 JSON、未知响应、非图片字节或超限响应 | 返回可定位错误，且未进入项目写入时目标文件不存在 |
| `ACC-IMG-006` | IMG-002, IMG-004 | 分别真实调用两个指定模型 | 每个成功结果均形成可打开的真实图片文件；失败则记录独立真实错误 |
| `ACC-IMG-007` | IMG-007, IMG-008 | Cline 加载 `generate_image` | 工具为项目作用域并遵守当前会话 Tool Policy；缺少项目身份或输入无效时请求前失败 |
| `ACC-IMG-008` | IMG-007 至 IMG-010 | 用户只说“帮我生成一张黄昏下的海边灯塔插画，保存在项目里” | 真实 Cline 自主调用 `generate_image`，Electron 按当前模式审批或自动批准，JMRAI 生成真实项目图片 |
| `ACC-IMG-009` | IMG-008 | 相同目标路径再次执行 | 返回文件冲突且不覆盖已有图片 |
| `ACC-IMG-010` | IMG-010 | 图片生成后打开文件与预览，再退出重启 | 列表出现真实文件，右侧成功解码同源图片；退出无残留进程，重启后历史、文件和预览恢复 |
| `ACC-IMG-011` | IMG-011 | 提交一个生图任务且 Provider 响应较慢 | 工具立即返回稳定 `imageTaskId`，调用方可继续文本工作 |
| `ACC-IMG-012` | IMG-012, IMG-013 | 项目 A 连续提交 A1/A2，项目 B 提交 B1 | A1 与 B1 可以同时生成；A2 必须等待 A1；任一项目始终最多一个 `generating`，全局最多两个 |
| `ACC-IMG-013` | IMG-014 | 队列任务成功 | 沿用现有图片校验和 Project File Port，真实图片落盘并可由文件预览读取 |
| `ACC-IMG-014` | IMG-015 | Growth 的必需图片仍排队、失败或中断 | Goal 不得完成；无依赖文本阶段仍可继续 |
| `ACC-IMG-027` | IMG-015 | Growth 阶段提交后台图片但未把任务 ID 声明为必需 | Runtime 保留并验证任务引用，但不写入 Goal 的 `requiredImageTaskIds`；正文完成可以结束 Goal，图片队列继续处理 |
| `ACC-IMG-015` | IMG-016 | Provider 返回分类失败后 Agent 修改 Prompt | 旧失败任务保持可见，新 Prompt 创建新的任务 ID |
| `ACC-IMG-016` | IMG-017 | 一个任务 generating、另一个 queued 时退出再重开 | 前者恢复为 `interrupted` 且不自动重提；后者由恢复后的 Worker 继续顺序执行 |
| `ACC-IMG-017` | IMG-018 | 同一提交因超时使用相同幂等键重试 | 只存在一个图片任务和一次可调度 Provider 工作 |
| `ACC-IMG-018` | IMG-013, IMG-019 | 打开桌面并在两个项目间切换 | 输入区上方只显示当前项目的持久任务快照和增量状态；不读取 SQLite，不混入另一项目，也没有 Fixture 队列页面 |
| `ACC-IMG-019` | IMG-013, IMG-017 | 状态持久化失败或退出发生在转换边界 | 失败关闭为可诊断状态，不把未知付费结果标记成功或自动重复提交 |
| `ACC-IMG-020` | IMG-020 | Cline 加载 `edit_image` | 工具为项目作用域、原生审批，只接受五个稳定字段并由 Session 注入项目身份 |
| `ACC-IMG-021` | IMG-020, IMG-021 | 输入缺失、越界、非图片或无 Alpha 蒙版 | Provider 请求前失败，没有输出文件 |
| `ACC-IMG-022` | IMG-022, IMG-023 | 分别用两个模型提交同一底图和蒙版 | 每次调用独立记录成功、失败或结果未知；成功结果经真实项目落盘和重读一致，不用一个模型结果代替另一个 |
| `ACC-IMG-023` | IMG-023 | Provider 改变尺寸、构图或蒙版外内容 | 工具保留真实输出与元数据，不宣称严格局部编辑；精确地图流程拒绝把它当作已对齐高亮层 |
| `ACC-IMG-024` | IMG-024 | 请求发送后连接被重置 | 返回 `image_result_unknown`，不自动重试且不创建目标文件 |
| `ACC-IMG-025` | IMG-024 | 活动 Growth 调用同步 `edit_image` | 请求前失败并说明编辑任务尚未进入持久队列 |
| `ACC-IMG-026` | IMG-008, IMG-025 | 在桌面保存独立生图 Base URL、Key 和默认模型，再修改配置并重启 | 密钥不进入 Renderer 或明文设置文件；下一次同步工具和队列读取最新连接/默认模型；未配置时请求前失败关闭；重启后配置仍存在 |
| `ACC-IMG-028` | IMG-026, IMG-028 | 地图 Worker 与角色 Worker 向同一作品根提交不同图片任务 | 两个任务持久 Prompt 均包含同一最近视觉母版、各自单图内容和不可覆盖的优先级标记；Provider 实收 Prompt 与数据库一致 |
| `ACC-IMG-029` | IMG-027 | 首次提交后修改《统一画风.md》，再以相同幂等键精确重试 | 返回同一任务和首次持久化 Prompt，不重复拼接、不冲突、不产生第二次 Provider 工作；改变单图内容仍冲突 |
| `ACC-IMG-030` | IMG-029 | 普通独立生图或 Growth 图片找不到可读母版 | 图片任务继续使用原 Prompt；队列产生可分类警告；Growth 最终汇报列出未应用母版的真实路径，不把它报告为已统一 |
| `ACC-IMG-038` | IMG-026, IMG-029 | 同一作品根分别通过同步 `generate_image` 和持久队列生成图片 | 两个 Provider 请求都由同一编译器注入最近《统一画风.md》且不重复拼接；同步结果返回 `visualStyleApplied: true`，队列保存完整 Prompt；缺母版时两者继续原 Prompt并准确返回未应用状态 |
| `ACC-IMG-031` | IMG-030, IMG-031 | 失败任务重试、排队任务跳到最后、任一未完成任务取消 | 重试与跳到最后均进入本项目队尾；失败/中断不提供跳过；取消形成终态；逻辑任务 ID 不变，每次 Provider Attempt 和旧错误仍可审计 |
| `ACC-IMG-032` | IMG-031, IMG-032 | 取消一个已进入 Provider 的任务 | 该项目控制器收到中止；原 Promise 落定前同项目下一张不启动；其他项目槽位不受影响；不宣称远端费用必然不存在 |
| `ACC-IMG-033` | IMG-012, IMG-033 | 三个项目持续排队且全局槽位为二 | 任一时刻最多两个不同项目生成；槽位释放后选择已有最早排队项目，不由单一大项目长期占用 |
| `ACC-IMG-034` | IMG-034 | 分别从普通会话、Growth 和 GWP 加载生图工具 | 三者发现同一个稳定工具；说明和 Schema 足以提交后台任务及可选挂接，不暴露数据库、绝对路径或 Renderer 状态 |
| `ACC-IMG-035` | IMG-035, IMG-036 | 图片成功后挂接到唯一 Markdown 标题或正文锚点 | 通过 Project File Port 写入标准相对图片引用；工作台重读正文即可获得关系；重复执行不重复插入 |
| `ACC-IMG-036` | IMG-035, IMG-036, IMG-040 | 目标文档标题与蓝图标题不同、锚点重复或写入竞争 | 无法证明唯一位置时不覆盖正文，图片仍成功；`image_attachment_conflict` 保留内部证据但不进入活动栏、全局错误或 Owner 汇报，其他挂接错误仍可见 |
| `ACC-IMG-037` | IMG-019, IMG-037 | 成功、取消、失败和中断事件进入当前项目活动栏 | 成功绿色停留 3 秒后消隐；取消短暂停留；失败/中断保留操作；重启后数据库历史仍存在 |
| `ACC-IMG-038` | IMG-038, IMG-039 | GWP 回执先保存，图片随后成功 | 回执派生并持久绑定正文意图；图片成功后自动写入唯一 Markdown 引用 |
| `ACC-IMG-039` | IMG-038, IMG-039 | 图片先成功，GWP 回执随后保存 | 回执绑定后立即挂接，不重复 Provider 请求，不要求 Worker 手工 attachment |
| `ACC-IMG-040` | IMG-039, IMG-040 | 重启时回执存在但任务没有挂接意图，或重复运行对账 | 从正式回执恢复；重复对账与重复挂接不重复插图，不改变已有正确意图 |
| `ACC-IMG-041` | IMG-038, IMG-040 | 同一任务已经绑定不同文章或正文锚点发生冲突 | 异义绑定失败关闭；正文不被覆盖；图片保持成功，失败原因可被 Owner 与 UI 披露 |
| `ACC-IMG-042` | IMG-039 | 项目存在没有任何物化回执的图片任务 | 任务保持游离，不按同名、目录或 Prompt 自动绑定 |
| `ACC-IMG-043` | IMG-031 | 失败任务点击重试，同时项目已有其他排队任务 | 原任务转为 queued 并排到项目队尾；历史 Attempt 保留；失败/中断不提供跳过 |
| `ACC-IMG-044` | IMG-042 | 当前项目同时有生成中、排队、失败、成功、位置不匹配与其他挂接失败 | 展开栏按四类固定顺序分区；位置不匹配归入成功并按时消隐，其他失败摘要直接可见，技术详情可展开，按钮只包含当前状态合法操作 |
| `ACC-IMG-045` | IMG-024, IMG-043 | Fetch 拒绝并在嵌套 cause 中携带标准网络错误码 | 任务保持 `image_result_unknown`；Attempt 保存白名单类别和错误码但不包含原始主机名、请求内容或凭据；原任务不自动重试 |
| `ACC-IMG-046` | IMG-012, IMG-043 | 同一项目排队三张图，第一张在取得 HTTP 结果前发生连接故障，随后重启应用 | 第一张失败后项目写入持久门禁，余下两张保持 queued；重启后仍不领取下一张，其他项目通道不受影响 |
| `ACC-IMG-050` | IMG-043 | Agent 对门禁项目重试一张探针，探针再次得到 `image_result_unknown`，随后再次申请重试 | 第二次 Agent 自动重试在 Provider 请求前失败关闭；任务和门禁保留。用户显式重试仍可探测，成功或明确 HTTP 结果后恢复队列 |
| `ACC-IMG-047` | IMG-044 | 普通会话和两个不同 GWP Worker 提交图片；再以相同幂等键重试或改换来源 | 普通任务来源为空；GWP 任务从工具上下文保存精确 Goal、Work Item、Attempt；相同来源幂等复用，不同来源请求前失败关闭 |
| `ACC-IMG-048` | IMG-045 | 同一 Goal 有回执绑定图片、已入队但回执丢失图片和旧版无来源图片 | 终态按任务 ID 汇总前两类并把后者标为未绑定回执；旧版无来源任务保持未归属，不通过路径或 Prompt 猜测 |
| `ACC-IMG-049` | IMG-046 | 相同幂等键先后使用 `世界\\地图\\主图.png` 与 `世界/地图/主图.png`，并提交一个逃逸路径 | 两种安全写法复用同一任务且持久化 `/`；逃逸路径在视觉母版、Store 和 Provider 前失败关闭；Prompt 不重复拼接 |
| `ACC-IMG-051` | IMG-035, IMG-038, IMG-047 | 项目打开时，正式 GWP 回执遇到同文档的旧标题格式附件冲突、已成功附件、待处理失败图片和不同文档绑定 | 同文档位置冲突只对成功图片规范化并幂等收敛；已成功附件不重写；失败或中断图片只规范待处理意图并保留任务错误；不同文档继续失败关闭；已有未编码中文图片引用不产生第二条引用 |

`ACC-IMG-001` 至 `010` 验收已完成的同步单图 Electron 纵向闭环；`ACC-IMG-011` 至 `019` 中原全局单 Worker Runtime 已实现，但 `ACC-IMG-012` 与 `018` 已由本批新产品语义取代，当前代码尚未满足项目通道和可见进度栏。`ACC-IMG-020` 至 `025` 是独立同步图片编辑批次，不构成地图对齐、编辑队列或工作台图片布局。

`ACC-IMG-031` 至 `037` 已由项目图片工作流自动化批次实现并验证；其最强证据是 Runtime、真实 SQLite、真实项目文件端口、稳定 Desktop API 和 Renderer 组件测试，不是外部 Provider 或 Electron 视觉 Live。

## 当前证据

`ACC-IMG-001` 至 `005`、`007` 与 `009` 由 `image-runtime` 的 10 项定向测试覆盖。`ACC-IMG-006` 的双模型证据见 `../../baseline/creatx-image-provider-pilot-live-2026-07-27.md`。`ACC-IMG-008` 与 `010` 已由真实 DeepSeek、Cline、JMRAI 和 Electron 连续验收，见 `../../baseline/creatx-image-electron-live-2026-07-28.md`。

`ACC-IMG-011`、`012`、`015` 至 `017`、`019` 已有真实 SQLite 和确定性 Worker Runtime 证据；`013` 使用现有真实图片校验与 Project File Port，但 Provider HTTP 为测试响应；`014` 由 Growth 完成门禁与图片状态查询分别提供组合证据；`018` 只有稳定 Event 和成功文件刷新，尚无可见任务状态。完整证据见 `../../baseline/creatx-image-queue-runtime-2026-07-28.md`。当前没有真实 Cline/JMRAI 后台队列 Live。

`ACC-IMG-020`、`021`、`024`、`025` 已由 `image-runtime` 定向测试覆盖。`ACC-IMG-022` 的 `gpt-image-2` 正式 Runtime 路径成功，`gpt-image-2-cheap` 正式调用为结果未知；此前 cheap 独立 Pilot 成功不能替代本次接口结果。`ACC-IMG-023` 已由标准模型真实全图重绘结果证明门禁必要。证据见 `../../baseline/creatx-image-edit-provider-live-2026-07-30.md`；尚无 Cline/Electron 用户流程 Live。

`ACC-IMG-026` 的配置、动态解析、缺配置失败关闭和队列默认模型由自动测试覆盖；真实 Electron 已验证系统加密、Renderer 脱敏、UI 保存和重启恢复。该批没有再次调用外部图片 Provider，不能替代既有双模型 Live。

`ACC-IMG-028` 至 `030` 由 Image Queue 16 项、World Blueprint 27 项和 World Materialization 35 项定向测试覆盖。测试使用真实 Project File Port 与 SQLite，并覆盖冻结缺失文件、关闭与母版读取竞态；Provider 调用为本地测试端口。本批没有外部图片 Provider Live，也没有重绘既有图片。

`ACC-IMG-031` 至 `037` 由 Image Queue 27 项、Image Attachment 3 项、Renderer 图片活动 5 项、World Materialization 40 项及跨包全量测试覆盖。协议和存储使用真实实现，图片 Provider 仍是本地确定性测试端口。完整结果见 `../../baseline/creatx-project-image-workflow-2026-08-07.md`。

`ACC-IMG-047` 至 `049` 已由 Image Queue V3 迁移、可信工具上下文、终态汇总和路径规范化测试覆盖；最终 Image Queue 为 33/33。旧无来源任务和旧反斜杠记录不猜测回填或批量迁移。

`ACC-IMG-051` 由 Image Queue 37 项、Document Attachment 4 项、World Materialization 49 项和 Desktop 对账过滤 1 项定向测试覆盖。正式 Profile 的完整副本以 97 份真实回执执行恢复，得到 95 个成功附件、1 个失败图片任务、1 个中断图片任务且 Markdown 变更为 0；未直接修改正式 Profile。
