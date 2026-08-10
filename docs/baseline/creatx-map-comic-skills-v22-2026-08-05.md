# CreatX Map And Comic Skills V22

日期：2026-08-05

## 范围

- 以 `artifacts/skills/dist/creatx-draw-map.skill` 完整替换旧内置地图 Skill。
- 新增 `artifacts/skills/dist/creatx-draw-comic.skill`。
- 不修改 `creatx-growth-world`。

## 实现

- 内置 Skill 版本从 V21 升级到 V22。
- 地图三文件、漫画五文件以归档原始字节内置并写入 `creative-skills/v22`。
- 两个 Skill 同时进入 Cline 显式 allowlist；漫画新增 `/draw-comic` 与 `/draw_comic` 命令。
- Workbench Core Guidance 要求匹配任务首先加载相应 Skill。

## 证据边界

自动测试固定并核对全部八个归档文件的 SHA-256，验证安装、重复安装恢复、允许清单和命令规范化。两个本机应用数据目录已经通过真实安装函数生成 V22，并逐项核对八个文件的 SHA-256：

- `C:\Users\16014\AppData\Roaming\creatx\creative-skills\v22`
- `C:\Users\16014\AppData\Roaming\Electron\creative-skills\v22`

## 验收

- `bun test packages/creative-skills/tests/creative-skills.test.ts`：`19 pass / 0 fail / 323 expect()`。
- `bun run test`：`277 pass / 0 fail / 1831 expect()`。
- `bun run typecheck`：通过。
- `bun run test:imports`：Cline 与 Node strip-types 导入边界通过。
- `bun run build:preview:web`：通过。
- `bun run build`：通过。
- 使用生产构建启动 Electron，并指定 `D:\CodexCache\Temp\CreatX-map-comic-v22` 为独立应用数据目录：主进程保持运行，启动安装路径生成地图 3 文件与漫画 5 文件。

两个构建命令仍显示父级 `@tsconfig/bun/tsconfig.json` 不存在的既有警告，但构建退出码为 `0`。尚未使用真实 Provider 执行地图或漫画生产，不能把安装与发现合同称为内容生产 Live。
