# CreatX 项目图片工作流自动化证据

日期：2026-08-07
状态：代码与自动化验收通过；不是外部图片 Provider 或 Electron 视觉 Live

## 已实现路径

- `ImageTaskQueue` 按项目建立瞬时通道：同项目最多一个 Provider 请求，全局最多两个项目并行，并按各项目最早排队任务公平轮转。
- 每次 Provider 请求形成持久 Attempt；重试移到项目队首，跳过移到项目队尾，取消形成终态。取消生成中任务后，旧 Promise 落定前不启动同项目下一张。
- `submit_image_generation`、`manage_image_generation` 和 `attach_image_to_document` 作为项目作用域工具进入同一 Cline Tool Contribution（工具贡献）边界。普通会话、Growth 与 Growth World Pro 共用提交工具，不获得数据库字段或绝对路径。
- Renderer 只通过稳定 Desktop API 和 `image.task.changed` 读取当前项目任务；成功绿色显示 3 秒后消隐，取消短暂显示，失败和中断保留合法操作。
- `ImageAttachmentService` 在图片真实落盘后按精确文档与唯一锚点写入标准 Markdown 引用。图片成功、挂接失败分别保存；正文引用是最终关系权威。
- Markdown 根据文章路径解析项目相对图片。宽屏普通插图右浮动，横图全宽，窄屏上下排列。普通 HTML 不作为文本交给 Renderer，而是从 HTML 所在目录经 `creatx-workbench://` Token 和 Content Security Policy（内容安全策略）进入隔离 iframe。

## 代码检查点

- `cb10cde feat(image): persist project task attempts`
- `a5997ad feat(image): schedule isolated project lanes`
- `ecf30cd feat(desktop): show project image task progress`
- `f9e8de6 feat(image): attach generated images to documents`
- `8913805 feat(workbench): render linked images and project html`

## 验收结果

从 `D:\CodexW\Creatx\creat1\creatx` 执行：

```text
bun install --frozen-lockfile  PASS，708 installs / 746 packages，无变化
bun run typecheck             PASS
bun run test:imports          PASS，Cline 与 Node strip-types 导入边界
bun test                      PASS，356 / 356，2,953 次断言
bun run build                 PASS，Main、Preload、Renderer 生产构建
git diff --check              PASS
```

定向证据包括：Image Queue 27 项、Image Attachment 3 项、项目文件 18 项、工作台预览协议 5 项、Markdown 2 项、Renderer 图片活动与进度 5 项、World Materialization 40 项。普通 HTML 协议测试使用真实临时项目和真实 Project File Port，验证同目录 CSS 可读、父目录逃逸失败、未知与过期 Token 失败关闭。

## 未完成与风险

- 本批没有调用外部图片 Provider；跨项目真实付费请求并行、远端取消结果和供应商限流尚未形成新 Live 证据。
- 本批没有启动 Electron 做 Markdown 环绕、横图切换、HTML JavaScript 和返回状态的视觉验收。Production Build 与组件/协议测试通过，不能替代肉眼 Live。
- 已成功的图片任务只从活动栏消隐，不从数据库删除；这是既定持久证据语义。
- 应用崩溃前结果未知的图片仍不自动重提，避免重复费用；需要用户或 Agent 显式重试。
