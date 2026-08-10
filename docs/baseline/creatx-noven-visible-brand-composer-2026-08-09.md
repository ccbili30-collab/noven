# 诺文可见品牌、统一字体与 Composer 控件基线

日期：2026-08-09  
Capability（能力）映射：`WUI-049 / ACC-WUI-071`  
源提交：初版 `9cd3f99`；截图语义纠正与本文件更新同批提交

## 已实现

- 桌面窗口、启动/错误文案、全局导航、内置艺术库和 Windows 安装显示身份使用“诺文”。可见品牌权威常量为 `creatx/apps/desktop/src/product-brand.ts`。
- 内部 `appId: com.creatx.desktop`、包名、协议、Desktop API、LocalStorage 键和 Profile 保持不变；没有用户数据或安装身份迁移。
- “点子库”用户可见名称和分享来源改为“灵感库”；传承库继续独立存在。
- Composer 底栏顺序为添加、自由/审批、Skill；Skill 前置一次性启用控件为 `14×14px`，保持 Checkbox（复选框）语义。
- Run（运行）活动后，原 `34×34px` 发送按钮在同一坐标原位切换为灰色停止方块；页面保持唯一 `.wb-send`，不新增独立停止按钮，并继续连接既有 `cancelRun` 调用链。
- 用户消息去掉“你”；修改、重发、删除文字默认折叠为 `0px / opacity 0`，Hover（悬停）或键盘焦点时展开；对话图片圆角为 `10px`，主滚动条轨道透明。
- 官方 JetBrains Mono `2.304` Regular / SemiBold WOFF2 随 Renderer（渲染进程）和内置艺术库离线打包；OFL（开放字体许可证）保存在桌面字体资源目录。中文缺字回退为 `Microsoft YaHei UI / Noto Sans CJK SC`。

## 验收

- 定向与 Renderer/错误投影：`bun test apps/desktop/renderer/tests apps/desktop/tests/visible-brand.test.ts packages/contracts/tests/errors.test.ts`，137/137、557 次断言通过。
- Typecheck（类型检查）：`bun run typecheck` 通过。
- Production Build（生产构建）：`bun run build` 通过；主 Renderer 与艺术库产物均包含两份 WOFF2 字体。
- 隔离 Electron：`bun run test:noven-brand` 通过。窗口标题为“诺文”；主界面和艺术库 `document.fonts.check` 均确认 JetBrains Mono 已加载；Skill 与权限控件同处左侧底栏并相邻，前置控件为 `14×14px`。图文回合确认用户气泡无“你”、操作文字从 `0px` 展开到 `31.5px`、图片圆角 `10px`、滚动轨道透明；活动 Run 的停止态与发送态同为 `34×34px` 且坐标一致，`.wb-send=1 / .wb-stop-run=0`。测试使用独立临时 Profile 与本地受控 Provider（模型服务），结束后源码 Electron 残留进程为 0。
- `git diff --check` 通过。

## 未完成与风险

- 未运行全仓全量、完整 `test:desktop`、Windows 打包或安装/升级链验证；`0.1.17` 不包含本批。
- 没有调用外部 Provider Live（真实运行）。本地受控 Provider 只建立活动 Run 以观察停止按钮；取消后的完整 Provider 终态与消隐时机沿用既有实现，没有在本批重新验收。
- JetBrains Mono 本身不包含完整中文字形；中文显示来自已声明的系统回退字体。不同 Windows 机器的中文外形可能有轻微差异，但不会依赖联网字体。
- 内部仍会出现 `CreatX` 类型名、协议名、日志和 Profile 路径，这是明确保留的兼容边界，不是漏改的用户可见品牌。

## 恢复入口

如继续发布，先从本文件记录的工作树执行最终 Typecheck、Production Build 和 Windows `0.1.18` 打包；打包后核验中文 EXE/快捷方式/卸载显示名、旧 `com.creatx.desktop` 安装身份与正式 Profile 复用，再决定是否发布。
