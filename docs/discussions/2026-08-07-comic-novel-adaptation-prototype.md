# 小说联动漫画样片讨论记录

日期：2026-08-07

状态：Prototype（原型）方向已获用户认可；生产 Skill V23 合同已据此修复，尚未完成生产 `/draw-comic` 外部 Provider（模型服务）Live（真实运行）验收。

## 用户发现

现有漫画结果缺少故事性，读者不知道人物在做什么。漫画应与前序小说创作联动，优先把已经成立的小说故事改编为漫画，而不是直接从世界设定或事件纪要中挑选素材。

## 已核实的旧链缺陷

1. 旧运行直接选择《玉角鹿过堤》这类弱目标、弱行动的世界事件文本。
2. 页面 Prompt 明确要求无文字、无字幕、无气泡，主动移除了人物关系和因果信息。
3. 图片模型一次承担整页分格、构图、多格连续性、动作、美术和文字空间，没有确定性排版。
4. 正式页面使用 `gpt-image-2-cheap`，与 Skill 对最终页使用较高质量的建议冲突。
5. 运行 Agent 明确无法预览图片，却按文件落盘宣布漫画完成。

仓库基线只证明漫画 Skill 安装和命令发现；`ACC-CSK-702` 至 `ACC-CSK-704` 没有真实 Provider 完整验收。

## 外部方法参考

- Scott McCloud, *Making Comics*: <https://www.scottmccloud.com/2-print/3-mc/index.html>
- Clip Studio / Steve Ellis, *Pro Artist’s Guide to Comic & Manga Layouts, Paneling, Flow*: <https://www.clipstudio.net/how-to-draw/archives/160963>
- Blambot, *Comic Script Basics*: <https://www.blambot.com/pages/comic-script-basics>
- Blambot, *Comic Book Grammar & Tradition*: <https://www.blambot.com/pages/comic-book-grammar-tradition>

转化为本项目的工作规则：

- 每格表达一个完整动作、信息变化或情绪反应。
- 先建立缩略分镜和阅读流向，再决定格子大小。
- 画面动作描述与对白、旁白、音效分离。
- 图片模型只画单格；格框、气泡、文字和最终页面由确定性排版完成。
- 页面末格必须承担转折、揭示或下一页驱动力。

## 本次样片

小说源：`artifacts/grey-crown-nine-lights-novel/开篇样章.md`

样片目录：`artifacts/nine-lights-comic-prototype/`

- `storyboard.md`：两页、八格漫画脚本及验收条件。
- `su-he-reference.png`：苏禾角色连续性参考。
- `prompts/`：八个单格的独立模型 Prompt。
- `p1-1.png` 至 `p2-4.png`：八张原始单格图。
- `comic.html`：确定性格框、气泡、旁白和拟声排版。
- `page-01.png`、`page-02.png`：最终两页截图。

生成路径：Codex Desktop 内置 `image_gen` 本轮不可用；使用 `codex-imagen2` 复用当前 Codex Provider 配置，通过角色参考图约束八格。没有修改 Provider 配置或输出密钥。

## 用户结论与当前观察

用户确认两页样片已经达到可用方向，认可“逐格生成 + 确定性排字”能够把故事讲清楚；同时明确指出样片本应是西幻，却漂移成中国古代视觉。这项认可只覆盖叙事与页面制作方法，不代表样片画风合格。

通过：

- 画面形成“第三灯异常 → 运盐队失踪 → 北桥危险 → 守将仍要开关 → 九灯逼近”的连续动作链。
- 对白和旁白由 HTML 确定性输出，中文字形清晰，没有依赖图片模型拼字。
- 苏禾的脸、低辫、银簪、深灰斗篷和挎包在主要格中可识别。
- 单格可以独立替换，不需要重画整页。

失败或未完成：

- Provider 没有稳定遵守请求的横向尺寸，排版层必须读取真实图片比例并裁切。
- 第二页第三格把白鳞画得过大，证据物细节不准确。
- 第二页末格把部分九灯处理成沿路灯柱，异象感与原文仍有偏差。
- 没有验证更多人物、多场景、长篇连续性、返工编辑、打印尺寸或移动端阅读。
- 没有修改、安装或验收生产漫画 Skill。

## 已推广到生产合同

内置 `creatx-draw-comic` 已升级为 V23：

1. 默认优先改编用户指定或已经接受的小说章节，不再把世界设定纪要直接当成熟故事。
2. 在绘图前检查主角目标、阻碍、失败代价、因果链、不可逆转折和翻页钩子。
3. 项目视觉证据按“用户本次要求 → `视觉设定/统一画风.md` → 已接受参考 → 原文文化与时代证据”排序；禁止从中文提示、中文姓名、Agent 地区或模型习惯推断中国古代视觉。
4. 西幻漂移为中国古代或其他文化域被定义为生产失败，不能靠“整体好看”放行。
5. 多页漫画默认逐格绘制，再以 HTML、SVG 或 Canvas 确定性完成格框、气泡、旁白和拟声；正式格和最终页使用标准质量模型。
6. 验收同时检查无字画面能否读懂动作，以及排字成品能否读懂完整因果；Agent 无法真实读取图片时只能标记未审查。

这些是 Skill、模型路由和自动合同测试证据。尚未通过生产 CreatX `/draw-comic`、真实外部 Provider、实际项目文件和最终视觉复检形成完整 Live 闭环。
