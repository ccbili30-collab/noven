# Workbench Visual Annotation 验收基线（2026-08-10）

## 已实现

- `WBA-001..006`：项目文件工作台的当前可见区域可进入非破坏性视觉批注，支持矩形、自由画笔、`2 / 5 / 9px`、撤销、重做、可撤销清空和明确丢弃。
- HSV（色相/饱和度/明度）全色调色盘包含色相条、二维饱和度/明度面、严格 `#RRGGBB`、最近颜色和作品像素吸管；颜色固定不透明。
- 批注以归一化坐标保存，Canvas（画布）通过 Portal（跨层渲染）固定覆盖工作台可见区域；长文滚动、面板尺寸变化和 Windows 缩放后仍贴合。
- Main（主进程）根据当前 DOM 的项目/文件身份与工作台边界自行截图，不接受 Renderer（渲染进程）提供任意图像字节或窗口坐标。
- 合成 PNG 只进入进程内 Attachment Authorization（附件授权），不写临时项目文件；仍受 PNG 签名、10 MiB、15 分钟授权、预览与一次消费门禁。
- “加入对话”只增加一个待发送图片附件并聚焦 Composer（输入区），不自动发送、不自动调用 Provider（模型服务）。捕获失败保留草稿并允许重试；离开当前作品的导航统一要求确认丢弃。

## 真实验收

- `bun test`：504/504，3,517 次断言，68 个测试文件。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline import boundary 与 Node strip-types boundary 通过。
- `bun run build`：Main、Preload（预加载桥）与 Renderer Production Build（生产构建）通过。
- `bun run test:workbench-capture`：图片、文档 DOM、隔离 iframe 在 100%/125%/150%/200% 缩放下 12/12 精确裁剪；外部哨兵像素为零。
- `bun run test:workbench-annotation`：125% 缩放下真实打开 PNG、滚动 Markdown 和隔离 HTML，三者均生成 542×890 PNG；三个源文件 SHA-256（文件指纹）不变、Timeline（对话时间线）消息为 0、Composer 获得焦点。吸管读取底图而非蒙版。源身份失败关闭后草稿与撤销历史保留，修复身份后重试成功；取消离开导航后草稿仍在。
- `git diff --check`：通过，仅存在仓库既有 LF/CRLF 提示。

## 未完成与风险

- 本机只有图片生成 Provider 环境变量，没有可供隔离测试使用的文本/视觉对话 Provider 配置；因此 `ACC-WBA-005` 的真实 Cline `userImages` 外部视觉回复与 `ACC-WBA-008` 的非视觉模型失败关闭尚未 Live（真实运行）验收。现有附件 `resolve` 单测只证明数据 URI 进入既有 Cline 输入合同，不冒充 Provider Live。
- 第一版不恢复应用崩溃或重启前尚未加入对话的草稿，不做长文自动滚动拼接、HTML 语义选择、源码范围、橡皮、箭头、文字、图层或源图编辑。
- 没有 Windows 打包、安装包、Portable 或正式用户 Profile 验收；本批未提交，且与会话即时切换及 Workbench V3 可见范围的未提交修改共存。

## 恢复入口

1. 有隔离的真实视觉 Provider 配置后，发送一张批注附件和文字，确认 Cline 请求含一个真实 `userImages`、回复可见、会话重开附件仍可预览。
2. 用明确非视觉模型或缺失配置重放同一发送，确认失败关闭且待发送附件和文字保留。
3. 用户要求发布时，先审查并按语义拆分当前混合工作树，再提交和执行 Windows 打包；不得把本批单独从依赖的未提交前沿中硬拆。
