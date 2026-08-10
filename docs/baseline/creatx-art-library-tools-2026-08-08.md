---
title: CreatX 全局个人艺术库工具基线
doc_type: verification-baseline
owner: art-library
status: runtime-implemented-visual-live-pending
last_verified: 2026-08-08
---

# CreatX 全局个人艺术库工具基线

## 已实现

- `creatx/packages/art-library-runtime` 拥有唯一应用数据根内的采集区、统一审批区、分类目录、图片校验、SHA-256 去重、候选视觉读取、候审提交、批准/驳回/暂缓和确定性风格词导出。
- 六个 Application Tool（应用级工具）进入普通个人和项目会话；Growth Worker（成长任务执行者）不自动获得。
- Electron Main（主进程）固定根为 `<userData>/creatx/art-library`，从构建内随包资源幂等迁移 57 个正式作品和 6 个候审条目。`D:\CodexW\my-art` 未被读取、修改或加入 Runtime（运行时）依赖。
- 公共网络门禁覆盖协议、凭据 URL、非标准端口、DNS/IP 私网、逐跳重定向、超时和有界响应；只接受真实 PNG/JPEG/WebP/GIF 签名及安全尺寸。非视觉模型失败关闭。

## 验收证据

- Art Library 定向测试：13/13，通过，52 次断言；Cline Projection：49/49，通过，123 次断言。
- `bun run typecheck`、`bun run test:imports`、`bun run build` 与 `git diff --check`：通过。
- 有界真实公网探针：加入 DNS 固定传输后，`https://picsum.photos/512/384` 经公开重定向采集 1/1，校验为 512×384、34,742 字节；临时根随后删除。第一次 Wikimedia 地址返回 HTTP 400 且零落盘。
- `bun test`：429/430，通过 3,239 次断言；唯一失败是既有 Cline Skill 预算测试在全仓负载下 5021ms 超过固定 5 秒并遇到临时目录 `EBUSY`。同一测试隔离复跑 1/1，在 2296ms 通过。故全量测试不标记为全绿。
- `bun run test:desktop`：构建产物真实启动并记录 `[art_library_seed] imported approved=57 approval=6 skipped=0`，窗口及后续主体交互通过；整套 Fixture（测试夹具）最后在无关 Composer Skill 步骤因 `session_conflict: conversation already has an active Owner turn` 失败，不能标记为桌面全套通过。

## 未完成与风险

- 没有调用真实视觉 Provider（模型服务）完成“读取候选→生成标准字段→提交候审”，因此识图链尚非 Live（真实运行）。
- 生产艺术库前端仍是静态 iframe / `localStorage` 原型，没有接真实 Store、审批工具结果或分类导出。
- Bing RSS 和普通 HTML 图片发现是 Best Effort（尽力而为），不保证任意艺术家或站点都能搜到；版权与授权判断不在第一版范围。
- 没有生成安装包或启动正式 Profile；构建通过不等于发布闭环。
- 全量与桌面 Fixture 各有上述一个非艺术库终态失败；后续恢复时先确认这些基线问题是否仍可复现，不为艺术库添加兼容垫片。

## 恢复入口

下一步属于独立批次：在不改本批 Runtime 语义的前提下，把生产艺术库页面接到真实查询/审批合同；随后使用支持视觉输入的正式文本模型做一次 1 至 4 张真实候审提交和人工批准验收。权威规格与验收矩阵位于 `docs/capabilities/art-library/`。
