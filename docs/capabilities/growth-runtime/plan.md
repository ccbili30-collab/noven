# Growth Runtime 实施计划

当前 Owner Relay 实施权威为 `../../plans/2026-08-05-owner-growth-relay-repair.md`；首次整本内容 Live与投影返修证据见 `../../baseline/creatx-owner-growth-full-run-projection-repair-2026-08-06.md`。

顺序固定为：显式启动与普通聊天隔离 -> 单 Owner 四阶段真实长跑 -> Child Worker 生成、文件写入与结果回传 -> 常见错误有界重试或绕过 -> 原对话正式回复与过程投影 -> 暂停、继续和退出 -> 底线并发保护 -> 非阻塞的极端恢复加固。

主链验收优先于极端一致性审查。不得用 Renderer 拼接、隐藏摘要、第二消息存储或假 Provider 保持旧行为；但不保护六条底线的毫秒级竞态、崩溃精确恢复和关系完整性不得持续阻塞真实四阶段运行与文本质量验收。当前恢复点是先冻结并提交已通过定向测试的投影合并与 Owner 汇总修复，再执行第二次外部 Provider 整本复验；复验前不得把 ACC-GRT-060 标记通过，也不得启动项目统一视觉母版生产实现。
