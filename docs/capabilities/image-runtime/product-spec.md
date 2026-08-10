---
title: Image Runtime 产品规格
doc_type: capability-product-spec
owner: image-runtime
status: growth-source-and-path-normalization-verified
last_verified: 2026-08-08
---

# Image Runtime 产品规格

## 已接受规则

- `IMG-001`：首个图片 Provider 使用可配置 Base URL（基础地址）和本地 API Key（接口密钥）；密钥不得进入 Git、日志、错误文本或 Renderer。
- `IMG-002`：第一批允许 `gpt-image-2-cheap` 和 `gpt-image-2`，通过 OpenAI 兼容的 `/images/generations` 请求文本生图。
- `IMG-003`：Provider 可以返回 `b64_json` 或 HTTPS 临时 URL；两种响应都必须转换并校验为受支持的真实图片字节。
- `IMG-004`：只有图片通过校验并经 `ProjectFileCommandPort` 成功写入、重新读取一致后，才能报告候选可用。
- `IMG-005`：配置、Provider HTTP、响应协议、临时 URL 下载、图片校验和项目存储失败必须区分；进入项目写入前的失败不得留下本次目标文件。存储阶段不是跨文件系统事务，写入后重读失败时不得谎称文件必然不存在。
- `IMG-006`：临时 URL 只允许 HTTPS；响应体设置首版有限大小，防止无界下载。
- `IMG-007`：`generate_image` 是项目作用域的中立 CreatX Tool（工具），按当前会话审批或自由 Tool Policy 执行。输入只包含 Prompt（提示词）、项目相对输出路径和可选的受支持模型；默认使用 `gpt-image-2-cheap`。
- `IMG-008`：工具只能 create-only（仅新建）写入真实项目图片，不能覆盖已有文件；Provider 凭据只进入 Electron Main Process（主进程），不得进入 Renderer（渲染进程）。图片配置不完整时工具仍可被交流模型发现，但必须在 Provider 请求和项目写入前以“尚未配置生图模型”失败关闭；桌面应用的其他能力仍可启动。
- `IMG-009`：自然语言图片请求可以直接使用 `generate_image`。工具成功已经代表图片校验、真实落盘和重读一致，Agent 不应再调用工具复查；生成一张图片本身不自动注册工作台。
- `IMG-010`：成功工具事件沿用现有 Project File Projection（项目文件投影）刷新；文件列表和右侧预览读取同一个真实项目文件，应用重启后从项目文件恢复，不建立第二套图片状态权威。
- `IMG-011`：`submit_image_generation` 持久化图片任务并立即返回 `imageTaskId`，不能等待 Provider 完成后才返回。Growth 可以在图片生成期间继续文本阶段。
- `IMG-012`：Electron Main Process 拥有唯一图片队列写入者和一个项目通道调度器。每个项目同一时刻最多一个 `generating`，第一版全局最多两个项目同时 `generating`；不为项目创建独立数据库、进程或永久 Worker。
- `IMG-013`：图片任务状态为 `queued`、`generating`、`succeeded`、`failed` 或 `interrupted`。状态变化必须持久化并通过稳定 CreatX Projection/Event 投影，Renderer 不成为状态权威。
- `IMG-014`：队列成功路径复用 `IMG-003` 至 `IMG-006` 的真实响应校验和 Project File Command Port 落盘，不建立第二套候选文件。
- `IMG-015`：Growth 可以显式声明必需图片任务；只要其中任一任务未 `succeeded`，Goal 就不能报告完成。仅出现在阶段 `imageTaskIds` 中的后台图片不会自动升级为必需任务。图片失败不阻塞无依赖的文本工作；Growth World Pro 的逐篇自动配图默认属于后台图片。
- `IMG-016`：失败任务保留错误分类和历史。Agent 修改 Prompt 后必须提交新任务，不得覆盖旧任务或把失败任务改写成成功。
- `IMG-017`：应用退出时 `queued` 任务保留，并在应用重开、Worker 恢复后继续顺序执行；当前 `generating` 任务转为 `interrupted`。可能已经产生费用的 `interrupted` 任务不自动重提。
- `IMG-018`：提交必须支持由调用方提供的幂等键；相同项目、相同幂等键只形成一个任务，防止重试造成重复付费。
- `IMG-019`：第一版不新增独立队列页面；主工作区在输入区上方提供当前项目的紧凑图片活动栏，并从持久快照和 `image.task.changed` 事件显示真实状态。Renderer 不读取 SQLite，也不显示其他项目任务。
- `IMG-020`：`edit_image` 是独立于 `generate_image` 的项目作用域中立 Tool。输入只允许项目相对 `sourceImagePath`、`maskImagePath`、Prompt、新输出 `relativePath` 和可选模型；不得传入绝对路径、Data URL、凭据或任意 Provider 字段。
- `IMG-021`：底图从 Project File Query Port 读取并只接受真实 PNG、JPEG 或 WebP；蒙版第一版只接受带 Alpha 通道的 PNG。透明蒙版像素发送为可编辑区域，源文件和蒙版均不修改。
- `IMG-022`：首个 JMRAI 图片编辑适配使用 `/images/generations` JSON 的 `image + mask` Data URL 兼容形式。标准 `/images/edits` 当前没有稳定证据，不能作为隐藏回退。
- `IMG-023`：编辑输出继续使用现有响应下载、格式/大小校验、create-only 项目落盘和重读一致。工具成功只证明真实输出可用，不保证 Provider 保持原尺寸、原像素或严格服从蒙版；地图等精确任务必须另做对齐验收。
- `IMG-024`：发送后连接断开归类为 `image_result_unknown`，不得自动重试或声称未产生费用。第一版 Growth 持久队列不接受编辑任务，活动 Growth 调用 `edit_image` 必须请求前失败关闭。
- `IMG-025`：生图连接是独立用户配置，只保存 Base URL、加密 API Key 和 `gpt-image-2-cheap` / `gpt-image-2` 默认模型。交流模型不会替换为该模型；只有 `generate_image`、`edit_image` 和持久图片队列在每次真实调用时读取最新配置。留空密钥表示保留已有密钥，Renderer 永远不回读明文。
- `IMG-026`：Image Runtime 的项目视觉 Prompt 编译器是统一视觉母版的唯一注入权威。同步 `generate_image` 在 Provider 请求前、持久图片队列在首次入库前，都从目标图片路径向上选择最近的 `<作品根>/视觉设定/统一画风.md`，并把母版置于本次图片内容之前；Worker、Skill 和 Renderer 不手工复制该母版。队列继续持久化实际 Provider Prompt；同步工具在结果中准确返回是否应用母版，不建立第二张图片任务表。
- `IMG-027`：`image_task.prompt` 保存实际发送给 Provider 的完整 Prompt。相同幂等键的精确重试必须复用已经持久化的完整 Prompt，即使母版随后修改，也不得重复拼接、冲突或产生第二次付费工作；改变单图内容仍必须使用新幂等键。
- `IMG-028`：类型级地图、角色、小说插图或漫画说明只能补充单图内容，不得覆盖项目母版。队列使用明确分区标记表达优先级；已经包含队列分区的输入只提取本次图片内容，避免 Worker 重复拼接。
- `IMG-029`：找不到、无法读取或内容为空的母版时，同步工具与队列继续使用原 Prompt；队列记录 `project_visual_style_missing` 警告，同步结果返回 `visualStyleApplied: false`，均不得阻塞文字主链。Growth World Pro 最终 Owner 汇报根据持久化的实际 Prompt 列出未应用母版的图片，不得伪装为视觉统一已经满足。
- `IMG-030`：`imageTaskId` 是稳定逻辑任务身份。每次真实 Provider 请求形成独立 Attempt；重试、跳过和应用重启不得删除或覆盖旧 Attempt 的状态、错误和时间证据。
- `IMG-031`：失败或中断任务的“重试”把同一逻辑任务转回 `queued` 并排到本项目队尾；排队任务的“跳到最后”只调整队内位置；失败或中断不提供“跳过”。“取消”永久放弃逻辑任务并形成 `cancelled`。正在生成的任务只允许取消，不允许重试或跳过。
- `IMG-032`：正在生成的任务取消时，Runtime 先持久化取消并中止该项目请求。只有原 Provider Promise 落定后才能启动同项目下一张，防止一个项目出现两个真实请求；已发请求可能产生费用时不得声称费用或远端结果一定不存在。
- `IMG-033`：项目通道按各项目最早排队任务公平领取全局槽位。一个项目有大量任务时不能占用两个槽位，也不能使其他已有排队项目永久饥饿。
- `IMG-034`：普通对话、Growth 和 Growth World Pro 共用 `submit_image_generation`。工具说明必须明确后台提交、项目隔离、幂等键、目标文件、可选文章挂接和重试限制；Agent 不需要构造队列状态、数据库字段或项目绝对路径。
- `IMG-035`：图片任务可以保存可选的 Markdown/MDX 挂接意图，但最终文章—图片关系只由正文中的标准图片引用确认。图片真实落盘后，唯一 `ImageAttachmentService` 通过 Project File Query/Command Port 验证图片、锚点和文件版本并写入；队列、Skill、Worker 和 Renderer 不得各自复制插入算法。
- `IMG-036`：挂接位置第一版只接受文末、唯一标题之后或唯一正文锚点之后。锚点缺失、重复或文件冲突时不得覆盖用户正文；图片保持 `succeeded`，挂接结果继续持久留痕。相同图片引用已存在时幂等成功。
- `IMG-037`：成功任务在活动栏显示绿色完成反馈 3 秒后移除，取消任务显示短暂“已取消”；这只是 UI 活动消隐，SQLite 任务和 Attempt 不删除。失败和中断持续显示，直到用户重试或取消。
- `IMG-038`：Growth World Pro 的生成时正文—图片关系只由持久 `WorldMaterializationReceipt` 派生。队列提供幂等中央绑定入口；任务已绑定相同意图时保持不变，绑定不同正文、标题、位置或锚点时失败关闭。Worker 不再负责复制 GWP 挂接字段，普通独立生图仍可显式提交挂接意图。
- `IMG-039`：回执先于图片成功时，队列在图片成功后执行挂接；图片先成功时，回执绑定后立即执行。应用重开或项目进入时可从正式 GWP 回执对账缺失意图。没有回执的游离任务不得按文件名、路径或 Prompt 猜测关系。
- `IMG-040`：图片任务成功与正文挂接结果分别持久化。挂接失败不把图片降级为失败，也不阻塞 GWP 正文主链；`image_attachment_conflict` 只表示没有找到安全插入位置，作为内部证据静默保留，不进入活动栏、全局错误或 Owner 最终汇报。其他挂接故障仍须披露。重复对账和重复挂接必须幂等，文件冲突不得覆盖用户修改。
- `IMG-042`：图片活动栏按“正在生成、等待生成、失败待处理、已成功/已取消短暂反馈”分区，不按全局更新时间混排。图片生成失败和非 `image_attachment_conflict` 的挂接失败必须直接显示用户可理解的错误摘要，并允许展开技术详情；位置不匹配按图片成功终态短暂反馈后消隐。
- `IMG-043`：没有取得 HTTP 结果的图片请求继续归类为 `image_result_unknown`，并从嵌套错误链提取有限白名单的 DNS、TLS、连接拒绝、连接重置、超时、取消或未知类别；不得持久化原始主机名、请求内容、凭据或任意错误字段。非取消的结果未知把当前项目通道写入 SQLite 持久门禁，后续任务保持排队且其他项目继续运行；应用重启不得清除门禁或自动领取下一张。Agent 最多自动重试一张恢复探针，再次结果未知时停止自动重试；用户可显式重试一张探针。探针成功或取得明确 HTTP 结果后恢复项目队列，结果未知则继续门禁。
- `IMG-044`：图片队列从可信 `CreatXToolExecutionContext` 自动保存可空的 Growth Goal、Work Item 和 Attempt 来源。模型输入、Prompt、路径和 Renderer 不能声明或覆盖这些来源；普通任务三项为空。相同幂等键必须复用相同来源，不同来源冲突时在 Provider 请求前失败关闭。
- `IMG-045`：Growth World Pro 终态图片证据同时包含正式物化回执绑定的任务，以及按可信 `growth_goal_id` 查询到但尚未进入回执的任务，并按任务 ID 去重。后者必须明确标为未绑定回执，不能伪装已插入正文；旧任务不按路径、文件名或 Prompt 猜测回填来源。
- `IMG-046`：新图片任务在队列唯一入口把 Windows 反斜杠规范为 `/`。视觉母版查找、幂等比较、Store 持久化和 Provider 输出必须使用同一规范路径；绝对路径、逃逸路径和其他不安全输入在任何副作用前失败关闭。旧 SQLite 路径不自动迁移。
- `IMG-047`：GWP 正式回执对账可以恢复同一任务、同一文档的历史附件意图，但不得放宽普通绑定。已成功挂接保持不变；待处理意图只规范化且不清除图片任务错误；只有成功图片的旧附件精确因 `image_attachment_conflict` 失败时才重新挂接。不同文档、取消任务和其他附件错误继续失败关闭。Markdown 已引用同一相对图片路径时，不论图注或中文路径 URL 编码表现是否不同，均幂等成功且不得重复插图。

## 当前不做

- 无上限多项目并发、用户可配置并发数、自动重提中断付费请求和复杂候选选择；
- 图片编辑队列、封面绑定、地图对齐/热点和版本历史；
- 独立队列页面、每项目独立数据库或进程；
- 统一画风版本历史、自动重绘和已有图片迁移；
- 通用多 Provider 抽象。
