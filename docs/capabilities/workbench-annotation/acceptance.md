---
title: Workbench Annotation 验收矩阵
doc_type: capability-acceptance
owner: workbench-annotation
status: implementation-verified-provider-open
last_verified: 2026-08-10
source_of_truth: docs/capabilities/workbench-annotation/product-spec.md
---

# Workbench Annotation 验收矩阵

| ID | 规则 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| ACC-WBA-001 | WBA-001..003 | 在图片、Markdown 和隔离 HTML 上画矩形与自由笔画 | 蒙版紧贴当前作品像素，源文件字节不变，撤销/重做/清空真实有效 |
| ACC-WBA-002 | WBA-002, WBA-003 | 滚动、调整面板和 Windows 100%/125%/150%/200% 缩放 | 提交裁剪与批注仍贴合；坐标不确定时失败而非错位提交 |
| ACC-WBA-003 | WBA-004 | 选择 HSV 颜色、输入 Hex 并对作品取色 | 三种入口得到一致当前颜色；吸管颜色在像素容差内正确 |
| ACC-WBA-004 | WBA-005 | 点击“加入对话” | 只生成一个待发送 PNG 附件，焦点返回输入框，不自动发送，不包含相邻 UI |
| ACC-WBA-005 | WBA-005, WBA-007 | 用户补充文字并使用真实视觉 Provider 发送 | Cline 收到一个真实 `userImages`，对话重开后附件仍可预览 |
| ACC-WBA-006 | WBA-006 | 捕获、裁剪、附件注册失败 | 草稿和源文件保持，错误区分截图/附件/应用边界，可重试或丢弃 |
| ACC-WBA-007 | WBA-006 | 非空草稿时退出、切文件、切会话或切项目 | 不静默丢失；用户可取消导航或明确丢弃 |
| ACC-WBA-008 | WBA-007 | 非视觉模型或无 Provider 配置发送 | 失败关闭，附件和文字保留，无伪视觉结果 |
| ACC-WBA-009 | WBA-002 | 捕获作品旁边存在聊天、审批或项目路径 | 合成 PNG 像素只覆盖作品区域，隐私区域为零 |

## 当前证据状态

- 已通过：`ACC-WBA-001..004`、`ACC-WBA-006..007`、`ACC-WBA-009`。
- 部分通过：`ACC-WBA-005` 已证明真实附件生成、预览、待发送和既有 `userImages` 解析合同，但缺少外部视觉 Provider 回复，不能标记 Live。
- 未执行：`ACC-WBA-008`，当前隔离环境没有文本/视觉对话 Provider 配置。
- 权威命令、数量、Electron 几何和未完成边界见 `../../baseline/creatx-workbench-visual-annotation-2026-08-10.md`。
