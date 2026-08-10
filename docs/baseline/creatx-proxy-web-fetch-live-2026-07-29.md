---
title: CreatX 代理感知网页抓取 Live 证据
doc_type: baseline-evidence
status: live
date: 2026-07-29
capability: provider-harness
acceptance: ACC-PHS-021
---

# CreatX 代理感知网页抓取 Live 证据

## 范围

本批只修复固定 Cline SDK `0.0.65` 的 `fetch_web_content` 在 CreatX 中不使用系统代理的问题。没有新增 `web_search` 工具，没有修改 Cline Core，也没有把搜索教程接入 Study 或 Growth World。

## 根因

Cline 内置 Web Fetch Executor（网页抓取执行器）调用 Node 全局 `fetch`。当前 Windows 环境配置了 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 和 `NO_PROXY`，但 Node 全局 `fetch` 不自动使用这些变量。CreatX 原先只给模型 Provider 注入 `EnvHttpProxyAgent`，网页抓取仍然直连。

同一进程的对照探针结果：

| URL | 直连 | 通过现有 `EnvHttpProxyAgent` |
| --- | --- | --- |
| Bing 搜索 | `200` | `200` |
| DuckDuckGo HTML | Connect Timeout | `202` |
| Wikipedia `Middle_Ages` | Connect Timeout | `200`，正文约 1.09 MB |
| Britannica `Middle-Ages` | `403` | `403` |

Britannica 的 `403` 是站点拒绝，不属于代理缺失；Agent 必须换来源，不能伪装成功。

## 实现

`@creatx/cline-adapter` 通过 Cline 公开的 `capabilities.toolExecutors.webFetch` 覆盖点注册代理感知执行器，并复用 Adapter 已有的 `EnvHttpProxyAgent`。执行器保留 HTTP/HTTPS 限制、30 秒超时、5 MB 响应上限、HTML/JSON 转换、50,000 字符输出上限和明确 HTTP 错误。未设置进程级全局 Dispatcher，也没有导入 Cline 私有路径。

## 验收

| 命令或路径 | 结果 |
| --- | --- |
| `bun test packages/cline-adapter/tests/web-fetch.test.ts` | `3 pass / 0 fail`，5 个断言 |
| `bun test packages/cline-adapter/tests` | `30 pass / 0 fail`，73 个断言 |
| `bun run typecheck` | 通过 |
| `bun run test:imports` | `Cline import boundary: PASS` |
| `node --env-file-if-exists=.env.local --experimental-strip-types scripts/cline-web-fetch-live-test.ts` | `CLINE WEB FETCH LIVE PASS` |

真实 Run 没有使用 Shell：

```text
fetch_web_content(Bing RSS 搜索结果)
→ 从真实 item/link 取得 https://en.wikipedia.org/wiki/Middle_Ages
→ fetch_web_content(Wikipedia 正文)
→ 根据正文回答中世纪通常为 5 世纪至 15 世纪
→ Run completed
```

临时项目、Cline SQLite 和 Session Permission Store（会话权限存储）在测试后删除，Adapter 和代理 Dispatcher 已释放。

## 未完成

- Study 尚未学会自动构造 Bing RSS 查询、选择来源和在站点拒绝时换源。
- 没有独立的结构化 `web_search` API；当前搜索能力依赖可抓取的搜索结果页。
- 没有证明所有搜索引擎、网页或动态 JavaScript 页面可读。
- 本批是生产 Adapter 与真实 Provider Live，不是 Electron UI 连续验收。

`creative-skills` 已在 V5 Study Skill 中写入“发现资料缺口 → Bing RSS 搜索 → 读取少量正文 → Study 整理来源 → 失败时换源”，合同证据见 `creatx-study-web-guidance-2026-07-29.md`。下一步只剩用一句自然语言 Study 请求做真实完整验收。
