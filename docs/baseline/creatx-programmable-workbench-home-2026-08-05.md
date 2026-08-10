# CreatX 可编程工作台主页基线

日期：2026-08-05

## 已实现

- Workbench V2 在 `.creatx/workbenches/<id>.json` 保存唯一交互主页；V1 继续严格读取，首次设置主页时原子迁移。
- `set_workbench_home` 持久设置默认主页并要求审批；`show_in_workbench` 只发布当前项目、当前会话的临时展示请求。
- Main Process 使用不透明 token 作为独立 Origin，只读提供注册工作台文件夹内的 HTML、CSS、JavaScript、JSON、图片、字体和媒体。
- Renderer 选择工作台后自动打开有效主页；展示事件等待最新工作台投影、只消费一次，并在切换前保存编辑草稿。缺失主页保留文件树和明确提示。
- iframe 不继承 Electron Preload、Cline、凭据或写文件能力；CSP 只允许同 token 数据访问，关闭外网、表单、弹窗、对象和子框架。

## 验收

- `bun run typecheck`：PASS。
- `bun run test`：275/275，1,809 次断言 PASS。
- `bun run test:imports`：Cline 与 Node strip-types 导入边界 PASS。
- `bun run build:preview:web`：PASS。
- `bun run build`：PASS；仍有既有 `@tsconfig/bun/tsconfig.json` 缺失警告。
- `bun run test:workbench-interactive`：真实 Electron PASS；自动主页、CSS、JavaScript、同源 JSON、SVG、外网阻断和无 `window.creatx` 均观察成功。

## 未完成与边界

- 没有真实 Provider 调用两个新工具，因此模型是否在自然对话中正确选择持久或临时工具尚无 Live 证据。
- 不支持外部 URL、跨工作台资源、多个并列主页、HTML 写项目文件、网页调用 CreatX API 或持久布局编排。
- Web Preview 的主页解析保持明确 Fixture 空实现，不能作为 Electron 沙箱证据。
- 编辑草稿冲突由既有版本门禁和当前切换代码保护；本批没有在 Electron 中人工制造外部并发写入。

恢复入口：`docs/adr/0010-workbench-v2-interactive-home.md`、`docs/capabilities/workbench-registry/product-spec.md`、`creatx/packages/workbench/src/index.ts`、`creatx/apps/desktop/src/workbench-preview-protocol.ts`。
