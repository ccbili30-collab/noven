# ADR-0010：工作台 V2 使用受限交互主页

## Status

Accepted

日期：2026-08-05

## Context

工作台需要由 AI 持久指定默认界面，也需要在当前会话中临时展示项目内 HTML。V1 严格拒绝页面字段，Renderer 不能直接读取 `.creatx`，而普通 `file://`、Data URL 或开放整个项目的协议会扩大文件与 Electron 信任边界。

## Decision

- 新增严格 V2，唯一扩展为 `home: { entry, mode: "interactive" }`；V1 继续原样读取，首次设置主页时原子迁移。
- 持久主页和临时展示使用两个工具；前者写注册记录并要求审批，后者只发布当前会话事件。
- Main Process（主进程）为一次展示签发不透明令牌，令牌绑定 `projectId + workbenchId + folder`。
- `creatx-workbench://preview/<token>/...` 只读提供该文件夹内资源。iframe 使用独立来源和 sandbox；响应 CSP 关闭网络、表单、弹窗、顶层导航、对象和子框架。
- 主页失效或加载失败必须回退到工作台文件树并显示诊断，不能伪装成功。

## Consequences

项目可以保存完整的可编程展示作品，同时 `.creatx` 仍只是可丢失视图元数据。相对资源可用，但跨工作台共享资源、外部 CDN、网页写文件和多面板编排需要以后单独设计权限与兼容语义。
