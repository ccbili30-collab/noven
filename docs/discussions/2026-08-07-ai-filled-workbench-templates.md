# AI 填充型工作台模板讨论记录

日期：2026-08-07
Primary Capability：`creative-skills`
Neighbor Contract：`workbench-registry`、`workspace-ui`

## 用户意图

用户希望准备若干固定 Workbench Template（工作台模板）。模板的视觉结构、排版和交互由 CreatX 预先完成；AI 不需要每次重新设计网页，只需生成立绘等资产并填充指定内容槽位，即可得到干净成品。

首个模板是角色圣经：上半区左侧显示人物大图，右侧显示姓名、主要角色设定、人物关系、地域与势力归属；下半区横跨页面显示角色圣经。用户选择“羊皮纸档案式”视觉方向，并批准据此生成的参考图。

## 隔离原型

本批只建立静态 Web Prototype（网页原型）：

```text
prototypes/workbench-templates/character-bible/
```

其中：

- `index.html` 和 `styles.css` 拥有稳定布局。
- `character-data.js` 是 AI 唯一需要编辑的数据入口。
- `app.js` 使用 `textContent` 投影数据，不执行数据中的 HTML。
- 示例立绘位于 `assets/`，正式内容应替换为模板目录内的相对资产路径；协议、网络地址、绝对路径和 `..` 路径被拒绝。
- 缺少字符串或数组时显示 `—`，不让单个空字段破坏整页。

该原型没有注册 `.creatx` 工作台，没有接入生产 Renderer（渲染层），也没有定义多个模板共用的生产 Schema（数据合同）。后续只有在更多模板证明字段共性后，才决定是否抽取共享合同，不能从单个角色模板提前推导通用模板系统。

## 视觉和运行证据

批准参考图：

```text
artifacts/character-workbench-template-reference/character-workbench-parchment.png
```

真实 HTML 第二轮截图：

```text
artifacts/character-workbench-template-reference/html-pass-2.png
```

Chrome 在 `1672×941` 下渲染后：页面宽高为 `1672×941`，没有首屏滚动；人物框为 `(119,22,488,579)`，档案区为 `(673,22,880,579)`，角色圣经为 `(22,626,1629,278)`，与参考图主要构图接近。JavaScript 没有 Page Error（页面错误）或 Console Error（控制台错误）。这只是 Prototype 证据，不是生产工作台 Live（真实运行）证据。

## 竖向比例纠正

用户随后指出工作台应适应接近正方形和竖屏的可用区域，甚至以竖向呈现为主要模式。原版只用 `1100px` 和 `760px` 宽度断点，导致 `1455×1410` 这类宽度很大但比例接近正方形的工作台仍错误保持横向档案。

纠正后的主断点改为可用页面宽高比：不超过 `6:5` 时，立绘、身份、档案和角色圣经组成一个连续纵向阅读面；不超过 `620px` 时进一步改成完整单列。该行为只重排现有 DOM，不重新加载数据，也不把窄桌面窗口伪装成手机界面。

真实 Chrome 比例验收：

- `1672×941`：保持横向构图、六列角色圣经，页面为 `1672×941`，没有横向或纵向滚动。
- 用户截图比例 `1455×1410`：进入纵向构图，立绘位于档案上方，角色圣经两列，页面为 `1455×2235`，只有纵向滚动。
- `800×1200`：纵向构图、两列角色圣经，页面宽度严格为 `800px`。
- `430×900`：完整单列，页面宽度严格为 `430px`。
- 从宽横屏实时缩放到竖向窗口时，同一个姓名 DOM 节点和数据标记保持存在，证明 CSS Reflow（重排）没有重新挂载或清空内容。

首轮比例测试发现右上装饰圆盘造成隐藏横向溢出，已把纵向模式改为只裁切横向装饰溢出；第二轮四种视口均无 Page Error、Console Error 或横向滚动。验收截图为 `responsive-wide-v2.png`、`responsive-reported-ratio-v2.png`、`responsive-portrait-v2.png` 和 `responsive-narrow-v2.png`。
