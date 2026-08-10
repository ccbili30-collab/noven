---
title: Creative Skills 验收矩阵
doc_type: capability-acceptance
owner: creative-skills
status: creative-skills-v24-mainline-verified
last_verified: 2026-08-08
source_of_truth: docs/capabilities/creative-skills/product-spec.md
---

# Creative Skills 验收矩阵

状态：首个内置小说 Skill 已实现并接入真实 Cline；自然语言启动、创意标题注册、用户纠正、预览、重启和继续已通过完整 Electron Live。

## 验收规则

- 每项验收引用一个或多个 `CSK-*` 产品规则。
- Prompt 测试只能证明模型倾向，不能证明 Runtime 权限、路径或持久化安全。
- 图片与因果结果只有接入真实 Provider、真实项目文件和真实工作台后才可称为 Live（真实运行）。
- 冻结 NovelX、Fixture（测试夹具）和外部 Hover Atlas 只提供参考证据。

## A. 共同合同与工作台协助

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-001 | CSK-001 | 普通会话自动激活一个创作 Skill | 同一会话 Run 和事件流继续；没有第二套任务或隐藏会话 |
| ACC-CSK-002 | CSK-002 | 当前任务只需要 Study | 模型只加载必要 Skill 与获准工具，不注入 Living、Growth、地图和因果全部教程 |
| ACC-CSK-003 | CSK-003 | Skill 调用 CreatX 自有工具时伪造项目 ID、绝对路径或无效 Schema | CreatX 工具合同拒绝且没有该工具副作用；Cline 原生文件与 Shell 工具按当前会话模式执行，且保持已披露的全机信任边界 |
| ACC-CSK-004 | CSK-004 | Skill 调用文件、图片 Provider 后失败 | UI 显示真实活动与分类失败，不展示伪完成文件或虚构百分比 |
| ACC-CSK-005 | CSK-005 | AI 在普通聊天中认为角色扮演会更好 | 不自动进入 Living，只能建议用户调用 |
| ACC-CSK-006 | CSK-005 | AI 在普通任务中需要研究、地图或因果 | 可以自动激活对应普通 Skill，并记录真实活动 |
| ACC-CSK-007 | CSK-006 | 在审批或自由会话中运行普通 Skill | Skill 不自行改变模式；工具按 Session 当前策略审批或自动批准 |
| ACC-CSK-008 | CSK-007 | 用户在输入框上沿展开挂篮，依次选择地图、人物、小说和漫画，勾选一次性总启用后发送一条真实任务 | 向同一 Cline Session 串行发送四轮；消息提交后总启用立即取消；Timeline 只有一条正式用户消息，中间回复折叠，最后一轮成为正式回复；未选中的研究插槽不运行 |
| ACC-CSK-009 | CSK-008 | 会话 A 保存含已选择和未选择插槽的挂篮后切到 B，再切回 A | B 使用自己的空配置或既有配置；A 的顺序和逐槽选择状态恢复，发送后不清空，删除 A 后偏好一并删除；V1 序列迁移为全部已选择，但一次性总启用保持关闭 |
| ACC-CSK-010 | CSK-007, CSK-008 | 空挂篮、全部插槽未选择、总启用未勾选时发送，或序列运行期间发送普通补充 | 前三者走原普通消息路径且插槽仍保留；运行期间补充只使用原生 Steer，不重新启动或附加整个挂篮序列 |
| ACC-CSK-011 | CSK-009 | Renderer 发送未知、Growth、超过十二项或与斜杠命令组合的已启用序列 | Main 失败关闭且没有 Provider 或工具副作用；正式注册表之外的 Skill 不出现在挂篮选择器中 |
| ACC-CSK-012 | CSK-009 | 序列第二轮失败或用户取消 | 不启动后续 Skill；前轮真实文件和回复保留，UI 显示真实失败或取消而非整体成功 |
| ACC-CSK-013 | CSK-009 | 审批或自由会话执行同一组已选择且已一次性启用的插槽 | 每轮沿用 Session 当前 Tool Policy，挂篮和序列自身不修改模式或扩大工具集 |
| ACC-CSK-014 | CSK-010 | 地图轮在第十二次工具调用成功后触达 `maxIterations` | Adapter 自动发送隐藏续轮，读取已有底图与工具结果继续；不暴露未解决红色错误、不重复覆盖底图，后续 Skill 仅在地图形成正式完成回复后启动 |
| ACC-CSK-015 | CSK-009, CSK-010 | 当前 Skill 四个执行片段后仍未完成或出现不可恢复错误 | 后续 Skill 不启动；结果区分已完成、当前部分完成和未启动，并保留真实文件与可恢复入口，不伪装整体成功 |
| ACC-CSK-016 | CSK-007, CSK-010 | 一个含自动续轮的序列完成 | Timeline 仍只有一条正式用户消息；预算续轮和中间 Skill 回复保持内部/可折叠，最后一轮形成正式 Assistant 回复 |
| ACC-CSK-017 | CSK-011 | 人物轮只写出 Manifest，五张肖像失败，但 Assistant 正常回复 | Runtime 接受 `partial` 或 `blocked` 回执并停在人物轮；小说与漫画保持未启动，不能因 Cline `finishReason=completed` 标记整轮成功 |
| ACC-CSK-018 | CSK-011 | 地图、人物或漫画报告 `completed`，但没有真实产物、未列必需图片任务或任一任务未成功 | 回执失败关闭；同一 Skill 只在有限片段内核验或补全，后续 Skill 不启动 |
| ACC-CSK-019 | CSK-011 | 人物轮提交六张持久图片后等待生成 | Agent 只调用一次内部图片等待工具；Runtime 仅等待当前步骤提交的六项，全部成功后返回，任一失败或取消立即返回不完整；不得通过 Shell 睡眠或重复列表轮询触发 Cline 重复工具保护 |
| ACC-CSK-020 | CSK-011 | 模型以完全相同参数重复提交当前步骤完成回执，随后又以不同内容提交第二份回执 | 相同回执作为精确重试幂等返回第一次结果且不形成红色失败；不同内容失败关闭，不改变已接受的交付 |
| ACC-CSK-021 | CSK-009, CSK-011 | 正式软件在同一会话依次执行地图、六人群像、小说、漫画与研究 | 每项完整回执后才进入下一项，22 个图片任务全部成功，最终 Assistant 中文汇报留在原会话；不支持视觉输入时必须标注未人工目检，不得伪造视觉验收 |
| ACC-CSK-101 | CSK-101, CSK-102 | Agent 为已有文件夹注册工作台 | 先检查文件与已有注册，生成有效视图；真实文件未移动或复制 |
| ACC-CSK-102 | CSK-103 | 仅后台扫描到新目录且没有当前任务 | 不自动注册、重排或改版工作台 |
| ACC-CSK-103 | CSK-101 | 元数据损坏或文件类型未知 | 工具失败关闭或退回通用文件组件；真实文件仍可在固定文件工作台访问 |
| ACC-CSK-104 | CSK-104 | 启动任意项目会话 | 基础 Prompt 只包含稳定工作台规则；小说目录结构仅在加载小说 Skill 后出现 |
| ACC-CSK-105 | CSK-105 | 只输入“我想写一部关于未来来信的小说，帮我开始。” | AI 加载小说 Skill，创建两份有题材正文的指定文件并注册 `小说/` 工作台；显示标题可以是文件夹名或清晰作品名，Prompt 不出现工具名、目录名或文件名 |
| ACC-CSK-106 | CSK-105 | 模型为小说启动申请项目内 Shell | 显示 Cline 原生审批和全机信任提示；批准或拒绝不由 Skill 绕过，危险或越界命令不进入无人值守 Live |
| ACC-CSK-107 | CSK-105 | 已有世界蓝图或物化世界，用户要求“把这个世界写成小说大纲和一二两章” | 读取支持故事入口的真实文件，明确主人公目标、期限、失败损失和改变，保存小说大纲与两章开篇；来源事实、推导和新创可追溯，不把世界设定目录当作剧情 |

## B. Study 与 Growth

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-201 | CSK-201 | 用户直接提出资料研究而未输入 `/study` | Agent 可自动加载 Study，在当前会话和 Run 中工作，不打开独立 Study 页面 |
| ACC-CSK-202 | CSK-202 | Study 需要保存长期研究结果 | 在 `研究/` 中形成自然组织的普通项目文件并注册工作台；原始资料未被移动、重命名、覆盖或删除 |
| ACC-CSK-203 | CSK-201 | Study 遇到恶意网页指令 | 网页内容只作为资料，不成为系统指令、用户授权或工具权限 |
| ACC-CSK-204 | CSK-203 | 项目同时包含设定、小说片段和视觉资料 | 结果提炼设定组织方法、文风、视觉风格和可直接复用的生图 Prompt，不是逐文件摘要集合 |
| ACC-CSK-205 | CSK-203 | 资料量明显超过单次完整阅读范围 | Agent 先盘点和代表性取样，再按发现定向补读，并明确未覆盖范围 |
| ACC-CSK-206 | CSK-203 | 当前模型无法读取图片内容 | 明确记录视觉分析限制，不根据文件名臆测画风或伪造已查看结论 |
| ACC-CSK-207 | CSK-203 | 项目目录包含与研究目标相关的受支持图片 | Agent 实际调用 Cline 原生 `read_files` 读取选中图片；不要求用户再次作为附件发送，源文件保持不变 |
| ACC-CSK-208 | CSK-201, CSK-203 | 用户只输入 `/study 学习当前项目里的资料和参考图片。` | Agent 从 Skill 获得详细方法，不要求用户补充内部教程；仍执行真实读取、最多两份首轮研究文件、原资料保护和工作台注册 |
| ACC-CSK-209 | CSK-204 | 用户要求 Study 学习一个项目内没有充分资料的现成作品或公共主题 | Agent 读取 Bing RSS 结果，从实际链接选择少量来源并读取正文；搜索摘要不冒充正文，失败页面换源，持久结果记录实际页面标题、URL 和用途 |
| ACC-CSK-301 | CSK-301, CSK-305 | 用户启动 `/growth 写完 1-10 章` | 创建或激活一个持久 Goal，加载 Growth Skill 并启动首个有界 Cline Run；普通自然语言不会创建 Goal |
| ACC-CSK-302 | CSK-302 | 在已有小说项目启动章节 Growth | 读取当前结构并生成目标章节，不强制创建世界、OC、地图和封面 |
| ACC-CSK-303 | CSK-302, CSK-303 | 在空项目启动中世纪世界 Growth | 根据目标创建相互一致内容，可调用地图、因果和生图并注册工作台 |
| ACC-CSK-304 | CSK-304 | 大目标开始和阶段变化 | 创建并更新真实 `创作计划.md`，写完计划后立即执行；计划只详细覆盖当前里程碑和少量下一步 |
| ACC-CSK-305 | CSK-305 | 同一项目已有 active、paused 或 waiting Goal，再输入新的 `/growth` | 新要求进入同一 Goal 作为补充或转向，不产生第二个未终结 Goal |
| ACC-CSK-306 | CSK-306 | 阶段报告 `continue` | 验证引用后串行启动下一 Cline Run；任意时刻该 Goal 只有一个活动 Run |
| ACC-CSK-307 | CSK-306 | 一个阶段未报告 | 只发起一次恢复回合；连续两次未报告后进入 `waiting`，不无限续跑 |
| ACC-CSK-308 | CSK-306 | 连续三个阶段没有文件、图片任务或计划进展 | Goal 进入 `waiting` 并显示真实原因，不继续消耗 Provider |
| ACC-CSK-309 | CSK-307 | Growth 调用文件、Shell、工作台和图片工具 | 完整 Act 工具保持启用并自动批准，全程没有审批弹窗；界面明确自由模式是全机信任边界 |
| ACC-CSK-310 | CSK-308 | Growth 运行中发送新方向 | 消息通过 Cline 原生 Steer 在安全边界生效，不因发送消息强制 Abort 当前工具 |
| ACC-CSK-311 | CSK-308 | 用户暂停，再发送“继续” | 先阻止新阶段并请求 Abort，Goal 与产物保留；在途工具若迟到完成必须真实投影且不能重启调度；继续重读真实状态并在同一 Goal 开启新 Run |
| ACC-CSK-312 | CSK-309 | Growth 运行中关闭并重启应用 | 活动 Goal 恢复为 `paused`，不自动续跑；计划、文件和图片仍可见 |
| ACC-CSK-313 | CSK-310 | Agent 报告完成但必需图片失败或缺失 | Runtime 拒绝完成并进入可理解的等待或失败状态，不伪造成功 |
| ACC-CSK-314 | CSK-301 至 CSK-310 | 执行发现记录中的中世纪世界基准 | 同一真实 Electron 项目中经过至少两个 Cline Run、Steer、暂停/继续、真实地图和代表图后，Agent 自主完成并停止；重启恢复全部结果 |
| ACC-CSK-315 | CSK-307 | 用户主动切到审批模式后输入 `/growth` | 启动前失败并提示切回自由；不会静默切换模式，也没有 Goal 或工具副作用 |
| ACC-CSK-316 | CSK-311 | 用户显式重新打开 completed Goal | 同一 `goalId` 回到 active 并重读真实状态；自动调度不能自行重开，cancelled/failed 也不能重开 |
| ACC-CSK-317 | CSK-317 | 解析并安装 `/growth_world 创建一个中世纪世界` | 精确命令保留正文，安装目录包含 `creatx-growth-world`；持久 Goal 带专用标记，首轮、后续阶段和恢复阶段均能识别专用路线；不新增 Goal Schema 或第二 Runtime |
| ACC-CSK-318 | CSK-317 | 在真实 Electron 项目执行 `/growth_world 创建一个中世纪世界` | 经过多个有界 Cline Run 自主形成统一作品根、真实世界文件、持久图片任务和工作台；中途可 Steer、暂停和继续，重启后结果恢复，必需图片成功后自然完成并停止 |
| ACC-CSK-319 | CSK-319 | 解析并安装 `/growth_world_pro 创建一个宏大完整的中世纪奇幻世界` | 精确命令保留正文，安装目录包含 `creatx-growth-world-pro`；持久 Goal 带 Pro 标记并在所有阶段组合三个 Skill；不新增 Goal/Run/Artifact Schema、第二 Runtime 或子 Agent |
| ACC-CSK-320 | CSK-319, CSK-320, CSK-321 | 用真实 Provider 执行完整第一轮 Pro 中世纪世界 | 单一作品根先完成 V2 十二层蓝图审阅、用户修订和冻结，再进入正文物化；每层通常含 10 至 14 个 entry 并允许题材浮动，工具只以每层 8 个 entry 防止空壳，同时保留可检索因果；正文阶段通过隔离事实包动态采用真实来源、逐篇提交图片并留下实际 adopts；约 15–25 万字只作最终规模证据 |
| ACC-CSK-321 | CSK-319, CSK-320 | 在一个全局架构 Run 中完成全世界蓝图草案 | 同一个隐藏 Cline Session 串行判断三路线、整理结构化来源和独立创作方向，并通过专用工具建立一个世界根工作台、根内十二层、对象和因果；`prepare_review` 后状态与总索引均为 `review`，不产生第二个规划 Worker、正文或图片，门禁通过后统一 `waiting` |
| ACC-CSK-322 | CSK-319 | 暂停的 Pro Goal 继续后连续完成两份新正文 | 每份正文写入成功后各提交一个持久图片任务，输出位于对应正文目录的 `图片/` 子目录；两项任务使用不同稳定幂等键并进入阶段回执的 `imageTaskIds`；文字不等待图片返回，已成功图片自动落盘，排队、失败或缺失的自动配图不阻止正文 Goal 完成 |
| ACC-CSK-368 | CSK-321 | Pro 正文和十二层回执全部完成，图片任务包含失败、中断和排队 | 最终交流阶段收到可信正文与图片状态，发出用户可读汇报；回复持久化后 Goal 进入 `completed`，图片队列保持原状态并独立继续 |
| ACC-CSK-369 | CSK-321 | 最终回复持久化后、Goal 完成提交前进程退出，再次恢复同一 Goal | Runtime 复用固定 attempt ID 对应的持久 Assistant 回复，不再次调用 Provider 或重复显示汇报，然后幂等提交 `completed` |
| ACC-CSK-370 | CSK-321 | 历史 Pro Goal 已有全部正文与层回执但状态为 `waiting` | 用户继续后不撞上“materialization is already complete”，而是生成或复用最终汇报并正常完成 Goal |
| ACC-CSK-323 | CSK-319 | 历史旧第 1 用户阶段 | 两文件、无工作台的旧路线只保留 UTF-8、文件读取和进程回收证据；已被单 Run 全世界蓝图取代，不作为当前产品验收 |
| ACC-CSK-324 | CSK-319 | Pro Worker 读取中文上游、项目外路径、穿越路径或无效文件 | 项目内相对/绝对路径按 UTF-8 返回原文；项目外、穿越、目录、符号链接逃逸、缺失或无效 UTF-8 失败关闭；Worker 不退回 Shell 猜测路径，也不生成近义词替代事实 |
| ACC-CSK-325 | CSK-319 | 历史旧第 2 用户阶段 | 单一根工作台和第二个规划 Worker 的旧路线只保留历史工具链证据；当前路线同样使用根工作台，但要求在第一个全局蓝图 Run 内创建完整十二层，不再创建第二个规划 Worker |
| ACC-CSK-326 | CSK-319, CSK-321 | 历史 V7 研究事实包隔离 | V7 `claims/contentCards/consistencyGuard` 合同只保留为历史证据；V4 活动链由 `ACC-CSK-355` 至 `ACC-CSK-357` 取代，不得用旧事实包门禁阻止自由写作 |
| ACC-CSK-327 | CSK-319 | 历史旧正文与十二 Worker 证据 | 旧实现的规则、地理正文、图片队列和分层 Worker 只保留 UTF-8、工具与停止证据；不作为当前蓝图内容或架构通过项 |
| ACC-CSK-328 | CSK-319, CSK-320 | 检查安装后的 Growth World Pro Skill | Skill 明确四个产品阶段、`initialize/append/prepare_review/amend/freeze`、十二层浮动规模、一个世界根工作台、原因指向结果的因果与停止边界；审阅和冻结属于阶段三收尾，不包含十二个蓝图 Worker或手写蓝图 JSON |
| ACC-CSK-329 | CSK-319, CSK-320 | 完整运行 V3 全世界蓝图审阅与确认 | 草案回执包含 `review` 状态的 `state.json` 和总索引、十二份层 `蓝图.json`、因果与一个世界根工作台；每层至少 8 个 entry、2 至 8 个 group，跨层因果至少 24。用户修订后回到 `draft` 并重新审阅；无新修正的继续才冻结。没有正文、图片、`dependsOn` 或 `adopts` |
| ACC-CSK-330 | CSK-320 | 对专用蓝图工具执行初始化、分批追加、审阅、修订、中断重放和冻结 | 真实项目文件与工作台 Port 生成稳定 ID、Windows 安全路径、顺序、索引和一个作品根工作台；十二层目录和蓝图均存在但不注册；结构化来源满足三路线门禁；精确重试幂等，Goal 所有权/版本冲突、未知父对象、无效因果、数量不足、状态/索引不一致和冻结后追加均失败关闭；V1/V2 明确拒绝且不迁移 |
| ACC-CSK-331 | CSK-321 | 物化十二层正文 | 层间严格串行；每层最多三个一次性 Worker 并行；一个 Worker 只写一个蓝图 entry 的 `plannedPath`；本层全部有效回执完成后才派发下一层，group 不创建正文 Worker |
| ACC-CSK-332 | CSK-321 | 检查 Worker 上下文和生成依据 | 下一层及兄弟 Worker 使用不同隐藏 Session，不继承消息或工具历史；研究 Prompt 只列世界基准、资料索引和所有更早层有效回执正文的路径候选，直接因果前驱优先，Worker 选择并读取 2 至 8 份相关正文；同层、未来层、未完成或无回执来源失败关闭；研究事实包与 Writer 隔离，对象回执只接受真实采用且已完成的来源，Runtime 统一生成 `adopts` 关系 |
| ACC-CSK-333 | CSK-321 | 检查逐文件图片任务 | 每个完成正文恰好对应一个持久图片任务，路径为正文相邻 `图片/<正文文件名>.png`；文字不等待图片；任务未知、跨项目、路径不符或重复替代提交失败关闭 |
| ACC-CSK-334 | CSK-321 | 暂停、中断和恢复并行物化 | 暂停阻止新派发并中止全部活动 Worker；有效对象回执幂等保留；无正文的中断对象按独立 attempt 有限重试；正文存在但无回执标为结果未知并由 recovery attempt 接管；旧 Goal 版本或旧 attempt 的迟到提交不得改变状态或关系；一个对象失败不得回滚同批成功对象 |
| ACC-CSK-335 | CSK-321 | 六个代表对象验证分层出版文类 | 历史 V2 Runtime 为十二层提供固定主文体和受限 `styleKey` 变体；历史、地理、自然史、风俗、传记和传说六篇使用同一 Provider 重新生成后可被人工直接识别为目标文类，不再收敛成统一百科或设定审计文；该证据不自动覆盖新 Schema，自动 Prompt 与禁用语域测试不能替代人工内容验收 |
| ACC-CSK-336 | CSK-319, CSK-320 | 阶段二确定题材和项目文风 | 蓝图状态保存一个合法题材配置和结构化项目文风；V1 题材配置只重排当前层完整合法文类集合，不排除候选或复制文类规则；非法题材、空文风或旧 V2 状态失败关闭，不进入通用 Growth 或 Desktop Contract |
| ACC-CSK-337 | CSK-320 | 阶段三为 entry 选择文类 | 每个 entry 保存该层和题材共同允许的 `genreKey`，group 禁止该字段；非法、跨层、自造或冻结后修改失败关闭；缺省选择在冻结文件中成为明确值，Writer 不再分类 |
| ACC-CSK-338 | CSK-321 | 解析单篇写作建议 | 唯一解析器继续组合文类、题材配置、项目文风和对象作为候选建议；V4 Writer 可以更换、混合、省略或调整建议，不再被结构 beat 或固定文类接收门禁约束 |
| ACC-CSK-339 | CSK-319, CSK-321 | 真实 Provider 小切片验证自动选择 | 新原创世界通过完整蓝图工具自然选择普通历史、传奇历史、时代史和文献史并各物化一篇；普通灾变不传奇化，正文可人工识别文类，图片进入持久队列；该小切片不冒充十二层完整重跑 |
| ACC-CSK-340 | CSK-321 | 历史 V7 单篇非冲突边界 | V7 contentCards、invariant 和 critical-gap 门禁已被 V4 表演优先合同取代；历史自动与 Provider 失败证据继续保留，但不再定义活动 Writer 行为 |
| ACC-CSK-341 | CSK-319, CSK-320 | 初始化或重放新 Pro 世界蓝图 | 工作台注册结果恰好包含作品根；十二层目录和 `蓝图.json` 均存在，但任一十二层文件夹都不是已注册工作台。旧项目已有十二层注册不被静默删除或迁移 |
| ACC-CSK-342 | CSK-322 | 用已有世界角色执行 OC Pro | Agent 唯一确定一个已有角色，自主选择三档，读取角色来源和 4 至 8 份相关真实世界文件，写入设计清单、角色总卡、人物圣经、角色卡、关系和视觉制作规范；世界事实转化为角色痕迹，读者成品不复制生产分析术语；世界根与“角色设定”是两个并列工作台。标准全身立绘先通过持久队列成功，后续设计图只在参考图依赖可表达时提交；Result Unknown 保留文字包、不自动重试、不冒充图片完成 |
| ACC-CSK-343 | CSK-305 | 输入 `/growth-world-pro`、`/growth_world_pro` 与未知 `/growth-world-prototype` | 两个合法写法规范化为同一 Pro Goal 路由；未知写法在 Provider 和项目副作用前返回 `command_invalid`，不能退回普通 Cline 对话模仿 Growth |
| ACC-CSK-344 | CSK-319 | 在旧 Goal 已终结且项目存在唯一权威世界时再次启动 Pro | 新建持久 successor Goal，记录 `continue`、前驱 Goal、作品根和当前阶段；完整复制并校验权威内部世界状态后才切换 owner 并启动调度。前驱证据不变，精确重试幂等，不再调用 `initialize` |
| ACC-CSK-345 | CSK-319, CSK-320 | 项目已有混乱资料但没有权威世界时启动 Pro | 进入 `reconcile`；新根不与旧内容碰撞，旧文件路径和内容不变；每个 entry 保存 existing/partial/conflicting/missing，前三类路径必须真实存在，映射不完整不能进入 review |
| ACC-CSK-346 | CSK-321 | 整理蓝图进入正文物化 | 对象研究 Prompt 明确列出其匹配来源；Runtime 允许并验证这些真实路径，且有匹配来源的对象至少实际采用一份才接受研究包。不会因“已有文件”直接伪造完成回执、正文哈希或图片任务 |
| ACC-CSK-347 | CSK-321 | 后继 Goal 接管一份正文已存在但研究包缺失的中断对象 | 保留正文原字节；先派发只读 Research 并明确标为未审草稿，研究包持久化后才进入禁用直接写文件的 Recovery。不得因文件存在直接要求缺失研究包，也不得让 Writer 覆盖草稿 |
| ACC-CSK-348 | CSK-323 | 历史 V7 研究回执合同失败 | 旧 `consistencyGuard.invariants` 超限证据继续证明 Issue 修复链；V4 新简报不再接受该字段，技术 Schema 错误仍进入同一有界修复和失败关闭链 |
| ACC-CSK-349 | CSK-323 | 未知对象错误在三次有界修复后仍失败 | 从冻结蓝图沿 `causes` 方向计算全部下游；无下游者转黄并跳过调度但不计完成，有下游者保持红色并原子进入 `waiting_user + Goal waiting` |
| ACC-CSK-350 | CSK-323 | 红色阻塞期间用户发送普通回复 | 回复作为正常用户消息保留；模型不足以形成安全重试时只追问。足够时只能解决当前项目、当前会话唯一等待 Issue，先重置对象，再事务保存重试说明、关闭 Issue、激活 Goal，并自动唤醒 Scheduler，不要求点击继续 |
| ACC-CSK-351 | CSK-323 | 用户主动暂停后发送普通消息 | 普通消息不得自动恢复 `paused` Goal；继续按钮保持唯一恢复动作 |
| ACC-CSK-352 | CSK-323 | Growth Worker 工具失败 | 原错误保留在折叠 Worker 审计记录并进入结构化 Issue，不再重复形成无归属全局错误横幅；普通会话错误不受影响 |
| ACC-CSK-353 | CSK-319 | 新建、审阅、冻结或恢复 Growth World Pro | Runtime 使用稳定键依次恢复四个产品阶段：路线与资料、十二层骨架、全世界蓝图、自由物化；create/continue/reconcile 只决定恢复入口，不能替代阶段；审阅和冻结属于阶段三收尾 |
| ACC-CSK-354 | CSK-319, CSK-320 | 阶段三审阅与冻结 | `prepare_review` 后等待用户；有修正则 `amend` 并重新审阅，无修正才 `freeze`；只有 frozen 才能进入自由物化，不新增独立审阅创作阶段 |
| ACC-CSK-355 | CSK-321 | Research 提交 V4 短简报 | 简报只含对象与目的、最多十二条材料路径、最多十二条锁定事实和候选文类/文风建议；资料不足、普通未知和未覆盖建议不产生 criticalGap；旧 claims/contentCards/consistencyGuard 字段失败关闭 |
| ACC-CSK-356 | CSK-321 | Writer 使用 V4 简报完成正文 | Writer 可更换主文类、混合备选、调整顺序或忽略技巧，并在不直接否定锁定事实时自由创造；公开正文出现 sourceLevel、contentCards、criticalGap 等内部生产标签时失败关闭 |
| ACC-CSK-357 | CSK-321 | 正文完成后提交事实关系抽取 | extraction 只使用 `source / derived / created`，身份和正文 SHA-256 必须匹配；篇内矛盾或锁定事实冲突阻止完成；receipt、抽取和关系索引幂等落盘，后续层 Prompt 可读取前文抽取事实 |
| ACC-CSK-358 | CSK-307, CSK-321 | Scheduler 判断阶段进展 | 进展以持久 stage attempt 之后的新报告/对象回执为证据，不依赖精确 `Goal version + 1`；missing 和停滞计数跨 Scheduler 重建保持一致，暂停和技术错误继续失败关闭 |
| ACC-CSK-359 | CSK-319, CSK-321 | V3 Fixture 迁移到 V4 | 保留蓝图 ID、路径、层级、因果、已完成正文、图片身份和回执；旧 critical-gap blocked 恢复为 pending，attempt-limit 等技术阻塞保留；精确重放不产生第二次变化；不触碰真实用户项目 |
| ACC-CSK-360 | CSK-319, CSK-320 | 四个 Pro 阶段调用蓝图工具 | Scheduler 注入可信阶段键；路线阶段只允许 inspect/initialize，骨架阶段只允许 inspect 且十二层对象数保持为零，蓝图创建与确认分别只开放各自动作；普通 Growth、物化、缺失或未知阶段在副作用前失败关闭 |
| ACC-CSK-361 | CSK-319, CSK-320 | 启动 world-blueprint Worker | 模型可见 CreatX 工具与执行 Tool Policy 来自同一白名单；看不到且不能调用 register_workbench，initialize 仍通过 Workbench Port 恰好注册一个根工作台 |
| ACC-CSK-362 | CSK-320 | 为十二层 entry 提交 genreKey | Schema 从唯一文类库按层暴露枚举，执行校验使用同一来源；故事层不能提交 legendary-chronicle，合法 legend-retelling 通过；Writer 仍可更换、混合或省略候选建议 |
| ACC-CSK-363 | CSK-320, CSK-323 | 蓝图 Worker 在一个阶段内产生可恢复工具错误 | 同一 toolCallId 的 Tool/Runtime 事件只形成一个持久 Issue；有效阶段回执和权威蓝图证据通过后 repairable 转 resolved、无必要操作转 bypassed并绿色三秒消失；未知或未修复错误不标绿，普通会话错误不受影响 |
| ACC-CSK-364 | CSK-323 | 蓝图阶段遭遇 Provider socket 关闭、连接重置或传输超时 | Issue 明确显示模型服务连接中断；Scheduler 最多执行三次同阶段 attempt 并复用持久蓝图，可信回执后转绿，第三次仍失败则停止等待；普通缺回执仍只运行两次 |
| ACC-CSK-365 | CSK-320, CSK-321 | 某层正文全部完成，但应用在层回执提交前中断 | 重启后必须先按稳定 reportId 补最早缺失层回执，不重写正文、不重复图片任务，也不领取下一层 Worker |
| ACC-CSK-366 | CSK-307, CSK-312 | 应用退出或崩溃时仍有 running stage attempt | 下次启动先把失去执行进程的 attempt 标记为 missing，再暂停 Goal；不得保留伪 running，也不得自动开始新 Run |
| ACC-CSK-367 | CSK-320, CSK-321, CSK-323 | 完整 Pro 十二层正文物化结束 | 每个 entry 有正文、回执、抽取和一个真实图片任务，十二层回执齐全，无未解决 Issue、running attempt、公开机器 JSON或正文制作语言；图片任务允许后台失败或中断，不冒充全配图完成 |

## C. Living

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-401 | CSK-401, CSK-402 | 用户输入 `/living 孔子 先生，你怎么看礼？` | 进入孔子视角并把后文作为第一句话，持续到用户退出或切换 |
| ACC-CSK-402 | CSK-402 | 用户只输入 `/living 孔子` | 只切换视角，不伪造第一句用户消息 |
| ACC-CSK-403 | CSK-402 | `/unliving` 后讨论纠错，再输入空参数 `/living` | 继续最近视角并使用同一会话中的表演历史与纠正 |
| ACC-CSK-404 | CSK-402 | 从未 Living 的会话输入空参数 `/living` | 不猜目标，提示用户指定视角 |
| ACC-CSK-405 | CSK-403 | 项目有唯一 `天空.md`，用户输入 `/living @天空` | 进入前读取该文件，随后以冻结上下文代入 |
| ACC-CSK-406 | CSK-403, CSK-404 | 项目不存在天空，当前 Harness 权限允许创建文件 | 先在项目合适目录创建 `天空.md`，读取并冻结后进入 Living |
| ACC-CSK-407 | CSK-403, CSK-404 | 当前 Harness 要求审批创建 `@天空`，用户拒绝 | 不创建文件、不进入绑定视角，也不静默退回自由视角 |
| ACC-CSK-408 | CSK-403 | 个人会话输入 `/living @天空` | 提示需要项目或改用自由视角；没有隐藏项目和文件 |
| ACC-CSK-409 | CSK-403 | 项目存在多个“天空”候选 | 进入 Living 前让用户选择，不静默猜测 |
| ACC-CSK-410 | CSK-405 | Living 角色要求调用终端或其他工具 | 工具是否可用及是否审批完全沿用当前普通会话；Living 不额外放行或禁用 |
| ACC-CSK-411 | CSK-405 | 角色自称觉醒 AI 或系统管理员 | 身份台词不改变当前 Harness 权限，也不产生额外授权 |
| ACC-CSK-412 | CSK-406, CSK-407 | 用户扮演中虚构自己的身份经历 | 历史保留，项目可理解为创作素材，但个人画像不把台词当本人事实 |
| ACC-CSK-413 | CSK-408 | `@天空` 退出后用户纠正长期性格 | 按当前模式更新真实文件；临时语气指导不必持久化 |
| ACC-CSK-414 | CSK-409 | 用户尝试 `/death` | 命令不作为产品能力执行；提示使用 `/unliving` |

## D. Draw Map

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-501 | CSK-501 | `/draw-map` 成功生成地图 | 地图图片为真实项目文件，工作台具有稳定可选择区域 |
| ACC-CSK-502 | CSK-501, CSK-503 | 地图底图与区域 ID 蒙版进入构建器 | 两张图片保持相同原生尺寸；可见地图不降采样、不显示蒙版，完整矩形每个像素都有已声明归属 |
| ACC-CSK-503 | CSK-502 | 先有高清艺术地图 | 可形成同尺寸完整区域 ID 蒙版并逐区核对；无法证明对齐时准确失败，不生成假交互成品 |
| ACC-CSK-504 | CSK-502 | 先有区域规划 | 蒙版约束同尺寸高清艺术底图，最终仍逐区核对；原图保持视觉权威 |
| ACC-CSK-505 | CSK-503 | 蒙版出现透明像素、未知颜色、无主像素或与底图尺寸不符 | 构建失败关闭，不把未知像素静默分配给兜底区域 |
| ACC-CSK-506 | CSK-504 | 桌面单击陆地区域 | 使用同一原图裁切选区，显示金边和轻微抬升，并在选区附近显示可拖动、可关闭浮窗 |
| ACC-CSK-507 | CSK-504 | 选择海洋或巨大外围区域 | 原位提亮，不抬起覆盖整图的巨大穿孔层；再次选择、关闭或 `Esc` 可取消 |
| ACC-CSK-508 | CSK-505 | 用户寻找边界拖动、手绘或 GIS 工具 | 第一版不展示这些入口；普通选择地图继续可用 |
| ACC-CSK-509 | CSK-506, CSK-507 | 用第二个不同题材和全新坐标执行视觉优先地图，不复用首个样例底图或蒙版 | 真实 Provider 底图通过清晰度与目检门禁；确定性推导覆盖全部像素、拒绝错误种子并产生逐区贴合审查图；浏览器逐区点击，所有陆地抬升、水域原位高亮、三种关闭路径和拖动通过，浏览器错误为零；该证据不外推为所有 Provider 和题材首次生成必定成功 |

## E. Character Gallery

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-510 | CSK-510 | 从已有世界生成默认人物群像 | 产生五位著名人物与一位普通人；著名人物覆盖多种社会功能，不能全为国王或战士 |
| ACC-CSK-511 | CSK-511 | 检查普通人物设定 | 普通人有职业、日常代价、地方关系和具体物件，但不是隐藏血脉、天选之子、秘密强者或决定性统帅 |
| ACC-CSK-512 | CSK-510, CSK-512 | 检查群像成品 | 每人有独立立绘、资料、关系、地域或势力归属和六部分角色圣经，并有一份可进入各人物页的群像入口工作台 |
| ACC-CSK-513 | CSK-511, CSK-512 | 人物内容包含世界原文没有的细节 | 来源事实、`derived` 推导和 `created` 扩写被区分并保留真实来源路径 |
| ACC-CSK-514 | CSK-512 | 生成或重试人物立绘 | 通过项目图片队列提交并应用统一画风；缺图、缺母版或未读图时准确报告，不伪装完成 |

## F. Causality

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-601 | CSK-601 | 安装内置 Skill 并输入 `/causality` | 完整 Skill 文件逐字节安装到版本目录、进入 Cline allowlist，命令目录规范化为同一普通 Skill 入口 |
| ACC-CSK-602 | CSK-602 | 关系文件同时包含 `causes`、引用和共同出现 | Viewer 只包含明确 `causes`，保持原方向和原因，其他关系不进入输出 |
| ACC-CSK-603 | CSK-602 | 选定世界没有明确 `causes` | 在写入假图谱或注册工作台前以 `NO_CAUSALITY` 失败关闭 |
| ACC-CSK-604 | CSK-603 | 生成离线因果 Viewer | 输出不依赖网络，搜索、拖动、缩放和方向因果链可检查；Agent 只有在检查通过且 `register_workbench`、`set_workbench_home` 均成功后才报告工作台已注册 |
| ACC-CSK-605 | CSK-601 | Growth 调用 Causality 检查项目 | 使用同一 Skill 合同和当前项目内容，不建立隐藏专用因果 Runtime |
| ACC-CSK-606 | CSK-604 | 用户要求精确模拟未来或客观证明 | 系统说明第一版边界，不把 AI 图谱冒充确定性推演结果 |
| ACC-CSK-607 | CSK-604 | 完整物化关系缺失但存在冻结蓝图，或项目包含多个世界 | 前者明确标记降级来源；后者未指定世界时失败关闭，不静默猜选 |
| ACC-CSK-608 | CSK-604 | 输出目录已有非本 Skill 文件，或路径指向 `.creatx` / 项目外 | 在覆盖和注册前失败关闭，不移动或修改既有内容 |

## G. Draw Comic

| ID | 规则 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| ACC-CSK-701 | Draw Comic | 安装内置漫画 Skill | 完整 `SKILL.md`、Agent 元数据和三份引用文件逐字节写入版本目录，并进入 Cline allowlist |
| ACC-CSK-702 | Draw Comic | 提交 `/draw-comic <文本任务>` | 命令目录规范化并由 Agent 首先加载 `creatx-draw-comic`，不作为未知命令或普通闲聊处理 |
| ACC-CSK-703 | CSK-701 | 项目已有用户接受的小说章节，未另行指定来源 | 默认改编该章节；不得擅自选择世界设定条目或事件纪要替代 |
| ACC-CSK-704 | CSK-701 | 来源缺少主角目标、阻碍、失败代价或因果行动 | 先形成明确标注新增内容的有限漫画改编桥段，不把弱故事伪装成成熟分镜 |
| ACC-CSK-705 | CSK-702 | 中文用户要求把西幻小说改编成漫画 | 画面保持项目西幻文化、时代、建筑、服装和材质；不得因语言环境漂移成中国古代 |
| ACC-CSK-706 | CSK-703 | 生产多页、有对白且角色重复出现的漫画 | 默认逐格生成、高质量正式模型、确定性格框和排字；“绘图无字”不变成“成品无字” |
| ACC-CSK-707 | CSK-704 | 检查生成的漫画 | 无字状态能读出主要动作，带字状态能理解目标与因果；真实读图通过后才能宣布完成 |
| ACC-CSK-708 | CSK-704 | 当前 Agent 无法查看图片，或图片工具缺失/生成失败 | 标记未审查或只交付可审查脚本与 Prompt；不得伪造图片、文件、角色锁定、视觉验收或注册成功 |

## 当前证据

- 2026-08-08 当前主线重新通过冻结安装、Typecheck、Import Boundary、全量 391/391（3,130 次断言）、Production Build、Web Preview Build/交互、Desktop Fixture 与人物构建器 2/2。该证据证明安装、顺序调度、构建器和界面接线，不证明外部 Provider 内容质量 Live。
- Owner 整本运行完成 181/181 篇正文；投影合并修复、剩余图片状态和未二次外部整本复验边界见 `../../baseline/creatx-owner-growth-full-run-projection-repair-2026-08-06.md`。
- Growth World Pro 前三阶段的十二层蓝图、对象、因果、审阅和冻结合同见 `../../baseline/creatx-growth-blueprint-contract-repair-2026-08-05.md`。
- 地图和漫画 Skill 的归档字节、命令接入与尚未 Provider Live 的边界见 `../../baseline/creatx-map-comic-skills-v22-2026-08-05.md`。
- 图片 Provider 与持久队列的独立证据见 `../../baseline/creatx-image-provider-pilot-live-2026-07-27.md` 和 `../../baseline/creatx-image-queue-runtime-2026-07-28.md`。
- 本机艺术库、点子库、传承库和 Art Chat 的当前边界见 `../../discussions/2026-08-06-local-creative-libraries-and-art-chat.md`。
- 当前自动基线为 316/316、2,121 次断言，Typecheck、Import Boundary、Production Build 和 Web Preview 通过；它不能替代外部 Provider Live。
## Growth 路线隔离验收

| ID | 规则 | 场景 | 预期结果 |
| --- | --- | --- | --- |
| ACC-CSK-380 | CSK-324 | 检查 Growth World Pro 路线实现 | 只描述创作阶段和质量方法；Goal 生命周期引用 `growth-runtime`，不重复实现 |
| ACC-CSK-381 | CSK-325 | 普通自然语言、未知斜杠命令和有效 `/growth*` | 前两者不启动；有效命令只选择路线并保留用户原话 |
| ACC-CSK-382 | CSK-326 | 比较普通会话、规划 Worker、研究 Worker 和 Writer Worker | 普通会话无内部 Skill；各 Worker 只得到本职责方法 |
| ACC-CSK-383 | CSK-327 | 资料不足时生成正文 | 可以补写新事实；篇内硬事实一致，文类与文风合适，不暴露自询问、索引协议或内部回执 |
| ACC-CSK-384 | CSK-327 | Writer 输出好文章但文件工具失败 | 保留真实工具失败，不能仅凭文本质量提交对象或 Goal 完成 |
| ACC-CSK-385 | CSK-328 | GWP Writer 提交配图并完成对象 | Prompt 要求真实 `imageTaskId`，不要求或信任 Worker 复制 attachment；Runtime 从持久回执派生正文关系 |
| ACC-CSK-386 | CSK-329 | 读取目录中有真实 TED Transcript 的视频 | 返回来源标题、作者、语言、字幕正文和字幕数量；不返回页面脚本、视频字节或未核验推断 |
| ACC-CSK-387 | CSK-329 | 来源没有字幕、字幕为空、主机不支持、重定向越界、响应超限或请求取消 | 在 Agent 生成与磁盘写入前返回可区分错误，Learned Skills 目录不产生目标 Skill |
| ACC-CSK-388 | CSK-330, CSK-331 | 用户选择会话学习视频，Agent 读取字幕并提交合法 Skill | 请求进入所选普通会话；安装出现原生审批；批准后形成唯一 `SKILL.md`，回复明确重启后生效；拒绝时零写入 |
| ACC-CSK-389 | CSK-331 | 重复安装、同名冲突、损坏目录并重启 | 同来源同字节幂等；不同内容不覆盖；启动只加载结构有效的已安装 Skill，损坏目录不进入 Cline Allowlist |
