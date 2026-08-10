---
title: Desktop Runtime 实现路线
doc_type: capability-plan
owner: desktop-runtime
status: restart-batch-complete
last_verified: 2026-08-11
source_of_truth: docs/capabilities/desktop-runtime/product-spec.md
---

# Desktop Runtime 实现路线

## 当前批次：用户主动重启恢复

1. 在稳定 Desktop API（桌面接口）增加重启命令和活动工作投影。
2. Main 以 Owner Turn、Growth Store 和图片队列为事实源重新检查活动工作。
3. 复用现有 `before-quit` 截止时间、暂停、取消、Store 关闭与 Utility Process Dispose（释放）链，并在清理后 Relaunch。
4. Renderer 在左右导航两种形态加入入口，活动时使用统一 Dialog 二次确认。
5. 用一次性本机偏好恢复项目与会话；无效偏好失败关闭并回退。
6. 完成合同、活动门禁、位置恢复、Renderer、Typecheck（类型检查）、Import Boundary（导入边界）、全量测试、Production Build（生产构建）和隔离 Electron 重启验收。

以上六项已于 2026-08-11 完成；验证边界见 `../../baseline/creatx-application-restart-recovery-2026-08-11.md`。

## 停止条件

- 需要修改 Cline Core；
- 无法区分已接纳副作用与可安全重放输入；
- Relaunch 会绕过现有干净退出或造成双实例；
- 当前工作树目标文件出现并发所有权冲突。

后台继续、托盘守护、自动崩溃恢复和 Utility Process 热重启保持延期。
