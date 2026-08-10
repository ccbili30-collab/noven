---
title: CreatX 首个图片 Provider Pilot Live 证据
doc_type: live-evidence
owner: image-runtime
status: provider-to-project-file-live
date: 2026-07-27
implementation_commit: c91a58e
---

# CreatX 首个图片 Provider Pilot Live 证据

## 范围

本批验证 JMRAI OpenAI-compatible（OpenAI 兼容）图片接口到真实项目文件的后端闭环：

```text
本地忽略配置
→ ImageRuntime
→ /v1/images/generations
→ URL 或 b64_json
→ 图片字节校验
→ ProjectFileCommandPort create-only 写入
→ ProjectFileQueryPort 重读一致
```

这不是 Electron、Agent Tool（智能体工具）、审批、图片队列、取消、工作台或 UI Live（真实运行）。

## 真实结果

命令：`bun run test:image-live`

Prompt：简单白底红色圆形测试图。两个请求均使用真实网络、真实凭据和真实 Provider，没有 Mock（模拟）、Fixture（测试夹具）或本地图片降级。

| 模型 | 结果 | Provider 传输 | 落盘文件 | 字节 | 尺寸 |
| --- | --- | --- | --- | ---: | --- |
| `gpt-image-2-cheap` | PASS | HTTPS URL | `图片/gpt-image-2-cheap.png` | 795325 | 1254×1254 |
| `gpt-image-2` | PASS | `b64_json` | `图片/gpt-image-2.png` | 831539 | 1254×1254 |

最终真实测试项目位于 Git 忽略的 `creatx/tmp/image-provider-live-projects/run-Dvim1i`；脚本默认在该父目录下创建唯一项目，避免重复运行覆盖旧候选。两张图片均由 Windows 图像读取验证为 PNG，并经过人工可视检查。

## 定向与全量验证

- `bun test packages/image-runtime`：`7 pass / 18 assertions`。
- `bun run typecheck`：通过。
- `bun run test:imports`：通过。
- `bun test`：`50 pass / 152 assertions`。
- `bun run build`：通过；保留一个来自仓库父级 `tsconfig.json` 的既有 `@tsconfig/bun/tsconfig.json` 查找警告。
- Git 跟踪内容密钥扫描：通过；本地密钥文件 `creatx/.env.local` 由 `.gitignore` 排除。

## 已知边界

- 未测 Provider 超时、额度耗尽、429 后恢复和结果未知。
- Provider JSON 和临时 URL 下载均使用流式硬限额；图片为 25 MiB，兼容 Base64 的 Provider JSON 为 36 MiB。
- 输出只接受 PNG、JPEG 和 WebP，且要求目标扩展名匹配真实字节。
- `create-only` 防止覆盖现有候选；默认 Live 脚本每次创建新测试项目。显式复用 `CREATX_IMAGE_TEST_PROJECT` 且目标已存在时会返回存储冲突。
- Project File Port 不是跨文件系统事务；如果写入成功但紧随其后的重读失败，错误会归为存储失败，当前不会伪装成已回滚。
- 正式凭据设置、系统凭据库、Agent 工具、审批、候选队列、UI 和工作台绑定均未实现。
