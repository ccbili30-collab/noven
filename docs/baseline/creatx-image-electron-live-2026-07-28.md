---
title: CreatX 第一条图片 Electron Live
doc_type: verification-evidence
owner: image-runtime
status: live
last_verified: 2026-07-28
---

# CreatX 第一条图片 Electron Live

## 范围

本证据只证明：自然语言项目请求经过真实 DeepSeek 与 Cline 选择 `generate_image`，Electron 显示原生审批，JMRAI 生成一张真实项目图片，文件列表和右侧预览读取该项目文件，退出后无残留进程，重启恢复历史、文件和预览。

生产实现提交：`5ff00d1`（`feat(image): add Electron generation flow`）。

不证明候选队列、多个结果、图生图、图片编辑、取消恢复、结果未知、封面绑定、工作台图片布局或正式凭据设置。

## 真实链路

2026-07-28 在 Windows 上执行：

```text
bun run test:electron-image-live
```

仅发送自然语言：

```text
帮我生成一张黄昏下的海边灯塔插画，保存在项目里。
```

最终连续运行结果：

```text
ELECTRON IMAGE LIVE PASS
生成文件：灯塔插画.png
generate_image 原生审批：通过
本轮 Shell 审批：0
Windows 图片解码：1254 x 1254 PNG
Renderer 图片解码：1254 x 1254
首进程退出：无残留
重启：历史、文件和图片预览恢复
```

截图：

- `artifacts/image-runtime/electron-image-live.png`
- `artifacts/image-runtime/electron-image-restarted.png`

## 自动化门禁

- 工具输入只允许非空 Prompt、项目相对图片路径和两个受支持模型。
- 路径必须保持在临时项目内；批准前目标文件必须不存在。
- 测试只允许已观察到且与临时项目绑定的只读目录检查变体，任何其他 Shell、写入工具或额外审批均失败。最终成功运行没有 Shell 审批。
- 图片必须经 Windows `System.Drawing.Image` 和 Renderer `<img>` 双重解码。
- 两次 Electron 进程都必须正常退出，并检查没有仍引用本次 `userData` 的子进程。

## 过程中暴露并关闭的问题

- Bun 直接执行 Playwright Electron 脚本时出现调试握手超时，改回项目已验证的 Node 测试运行方式，并用 `--env-file-if-exists=.env.local` 加载本地忽略配置。
- DeepSeek 会波动性地先检查项目目录或在图片成功后尝试复查；基础图片指引明确工具成功已完成校验和重读，不需要额外验证。
- 单图请求曾触发 `register_workbench`；当前规则明确单张图片本身不自动注册工作台。
- 这些 Prompt 约束降低模型波动，但不构成权限边界；真正的副作用门禁仍是 Cline 原生审批与 Project File Port。

## 相邻证据

Provider 的两个模型、URL/Base64 两种响应和失败关闭测试见 `creatx-image-provider-pilot-live-2026-07-27.md`。本证据没有重复声明标准模型在 Electron 中被调用。
