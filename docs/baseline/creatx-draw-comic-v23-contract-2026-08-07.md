# CreatX Draw Comic V23 Contract Baseline

日期：2026-08-07

## 当前目标

把《九灯之夜》两页视觉样片中已经获用户认可的叙事方法推广到生产 `creatx-draw-comic` Skill，并阻止样片暴露的文化画风漂移。当前批次只修改漫画方法、正式图片模型路由、对应测试与规格；不接入新的工作台，不修改图片 Provider，不重新运行整套真实漫画生产。

## 已实现

- 小说章节成为默认改编来源；只有缺少成熟故事时，才允许基于世界设定补写明确标注的有限桥段。
- 故事门禁要求目标、阻碍、失败代价、连续因果、不可逆转折与翻页钩子。
- 视觉权威由项目证据决定，禁止从用户语言、中文姓名、Agent 地区或模型默认推断视觉文化。
- `视觉设定/统一画风.md` 与已接受角色、服装、地点参考进入正式漫画 Prompt；西幻漂移为中国古代被定义为失败。
- 默认逐格生图，最终格框、对白、旁白与拟声采用确定性排版；图片无字不再等同于最终漫画无字。
- Draw Comic 正式格、重复角色、复杂动作和最终页由 `gpt-image-2` 处理；草图和普通图片的既有默认路由不变。
- 完成声明要求真实视觉复检；无法读取图片只能报告未审查。

## 证据

- 原型真实图片：`artifacts/nine-lights-comic-prototype/page-01.png` 与 `page-02.png`。
- 用户认可的是故事可读性和逐格排版方向；用户明确否定其中国古代视觉漂移。
- `creatx/packages/creative-skills`：`bun test`，20 pass、0 fail、356 次断言。
- `creatx/packages/image-runtime`：`bun test tests/image-runtime.test.ts`，17 pass、0 fail、56 次断言。
- 内置 Skill 归档通过 `quick_validate.py`，结果为 `Skill is valid!`。
- `creatx` 全量 `bun test`：318 pass、0 fail、2,171 次断言。
- `bun typecheck`、`bun run test:imports` 与 `bun run build` 通过。
- Production Build 输出一条上级 `tsconfig.json` 找不到 `@tsconfig/bun/tsconfig.json` 的非致命警告；构建仍以 Exit Code 0 完成。该警告未在本批处理。
- `git diff --check` 通过；仅存在 Windows 工作副本换行提示。

## 非 Live 边界

本批证据证明生产 Skill 文本、安装版本、模型选择和自动合同一致；没有证明外部 Provider 对视觉权威的实际遵循率，也没有通过生产 Electron、真实 `/draw-comic` 回合、真实项目落盘和人工逐页复检。因此 `ACC-CSK-703` 至 `ACC-CSK-708` 不能整体标记为 Live。

两页原型自身仍有三项已知缺陷：文化画风错误；白鳞证据物比例不准；九灯异象部分被画成普通路灯。原型文件必须作为珍贵视觉证据保留，不得因本批合同修复而删除或改写。

## 恢复入口

下一批若要形成 Live 证据，应从真实 CreatX 会话显式执行 `/draw-comic`，选择一个已有小说章节和项目 `视觉设定/统一画风.md`，验证逐格任务使用正式模型、最终排字文件真实落盘、视觉文化未漂移、Agent 实际读图后再完成汇报。失败不得伪装成功，也不得用 Fixture（测试夹具）替代 Provider 结果。
