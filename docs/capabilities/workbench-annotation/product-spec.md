---
title: Workbench Annotation 产品规格
doc_type: capability-product-spec
owner: workbench-annotation
status: accepted-for-implementation
last_verified: 2026-08-10
source_of_truth: docs/capabilities/workbench-annotation/product-spec.md
---

# Workbench Annotation 产品规格

## WBA-001 非破坏性视觉批注

批注是覆盖当前工作台可见作品区域的临时蒙版，不修改、复制、覆盖或保存源文件。图片、Markdown、文本、HTML 与其他已能预览的表面使用同一视觉语义。

## WBA-002 当前可见区域

第一版只捕获用户当前看到的作品区域，不自动滚动或拼接长内容。捕获结果不得包含会话、导航、审批、凭据、工具详情或工作台之外的窗口区域。

## WBA-003 基础工具

批注模式支持矩形、自由画笔、三档粗细、撤销、重做、清空和安全退出。笔画在 Pointer Move（指针移动）期间直接更新蒙版，不重建完整工作区。窗口与面板变化后必须按归一化坐标重新贴合；无法可靠贴合时阻止提交。

## WBA-004 全色调色盘与取色

颜色入口使用 HSV 全色调色盘，包含完整色相条、饱和度/明度二维区域、十六进制输入、当前颜色和最近使用颜色。吸管从当前作品画面的真实捕获像素取色。第一版颜色完全不透明，不提供 Alpha（透明度）。

## WBA-005 加入对话

“加入对话”立即捕获并精确裁剪当前作品区域，把蒙版合成为受控 PNG，再通过 Desktop Runtime 注册为现有待发送图片附件。成功后焦点回到 Composer（输入区），用户补充要求并自行发送；该动作不得自动调用 Provider。

## WBA-006 草稿与失败关闭

截图、裁剪、合成或附件注册失败时保留批注草稿并显示准确错误。批注非空时，退出模式或切换源文件不得静默丢失；第一版允许通过明确“丢弃”结束，不承诺崩溃或应用重启恢复尚未加入对话的草稿。

## WBA-007 Provider 边界

最终合成图复用现有图片附件和 Cline `userImages` 链。非视觉模型或缺失真实 Provider 配置时失败关闭，保留附件和文字，不以本地识别、模板或文本推断冒充视觉模型。

## WBA-008 明确延期

HTML 语义元素选择、文本源码范围、完整滚动页面、直接图片编辑、图层、橡皮、箭头、文字、渐变画笔和专业艺术台均不进入第一版。
