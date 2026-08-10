---
title: Cline SDK v0.0.65 固定基线
doc_type: source-baseline
owner: provider-harness
status: verified-source-baseline
last_verified: 2026-07-26
source_of_truth: docs/baseline/cline-sdk-v0.0.65.md
---

# Cline SDK v0.0.65 固定基线

## 来源

| 字段 | 值 |
| --- | --- |
| 官方仓库 | `https://github.com/cline/cline.git` |
| Tag | `sdk/sdk/v0.0.65` |
| Tag object | `d7b9f3fb69b2aafde7bd37a8edfbc1c0580f4189` |
| Commit | `f33ab3a872091952f44e43d0c8f5438099a60ada` |
| `@cline/core` | `0.0.65` |
| `@cline/sdk` | `0.0.65` |
| npm 发布时间 | `2026-07-19T04:01:54.990Z` |
| npm Core integrity | `sha512-wMxCaOjomlKsCUMMs6E3kAM7fPGlzav6+ZOGnk3Hd69FF1pVxB0zt1BVKtUnv1hf4u0VZe7XmEcfi90K8JXT5w==` |

## 本地基线

- 路径：`D:\CodexW\Creatx\cline-baseline`
- 克隆方式：官方 Tag 的 `--depth 1 --single-branch --filter=blob:none` 浅克隆。
- 当前状态：Detached HEAD（分离头）且工作树干净。
- `git rev-parse HEAD`：`f33ab3a872091952f44e43d0c8f5438099a60ada`。
- `git describe --tags --exact-match HEAD`：`sdk/sdk/v0.0.65`。
- `sdk/packages/core/package.json` 和 `sdk/packages/sdk/package.json` 均为 `0.0.65`。

该目录保存来源证据，不是 `creat1` 的文件系统依赖，也不直接在其中开发。需要修改时，从该 Commit 创建命名明确的 Branch/Worktree；通过审查的 CreatX 代码仍必须回到 `creat1` 的集成历史。

## 已有 Windows 证据

在独立 `D:\CodexW\Creatx\harness-lab` 中：

- `npm install @cline/sdk@0.0.65 --ignore-scripts` 成功，安装 303 个包；
- `ClineCore.create({ backendMode: "local" })` 成功，约 `20-33ms` 创建；
- SQLite 会话库成功创建；
- 缺 Anthropic API Key 时返回 `finishReason: "error"` 且工具调用为零；
- 自动 `dispose()` 后 Node 进程正常退出；
- 一次短时空闲快照约 `302.5 MB` Working Set 和 `287.1 MB` Private Bytes，仅作为风险样本，不是性能基准。

## 尚未证明

- Cline 使用真实 Provider 的完整 CreatX 路径；
- Cline 原生文件工具经审批后的真实结果配对；
- 个人会话的强制零项目副作用；
- 项目工作上下文、逐次审批、取消、已保存历史继续和外部文件修改；
- Electron 主进程内的窗口响应、异常、启动和退出；
- 长会话与多会话资源曲线。

因此本文件证明版本和来源固定，不证明 Cline 已达到 CreatX 生产稳定性。
