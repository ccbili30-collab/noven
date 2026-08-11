# 诺文 Windows 0.1.21 发布基线

日期：2026-08-11
功能头：`7a773ae`（安全注销工作台入口）
版本与发布证据：本文件同批提交

## 发布内容

Windows `0.1.21` 在 `0.1.20` 基础上增加 `unregister_workbench`：

- 普通项目会话可在原生审批后只移除 `.creatx/workbenches/<id>.json` 工作台入口，真实作品目录和内容保持不变。
- 合法 `missing` 入口可清理；内置、未知、损坏、重复冲突和读取后并发变化的目标失败关闭。
- 当前打开入口消失后，Renderer（渲染层）回退到内置“文件”工作台。
- 艺术库 Runtime（运行时）和生产页面未被本批修改。
- 新手引导 Prototype（原型）仍是未提交的本地设计产物，不进入 `0.1.21`。
- `.np` Task 1–7 源码继续保留，但生产 Main、Preload、Desktop API 和根依赖图仍不接入 `@creatx/project-package-runtime`。

## 产物

| 产物 | 字节 | SHA-256 | PE 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.21-x64-Setup.exe` | 132,231,893 | `E133B95418660862C6E2F4FFA0AAFB1E2445298D79F94069D16A2DDF58E67CEC` | `0.1.21` | `NotSigned` |
| `creatx/release/诺文-0.1.21-x64-Setup.exe.blockmap` | 136,788 | `A58DE85F2B0A53853305B1C9CE7DCDACBC967282B5C53270F5FE98E88C06AE78` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.21-x64-Portable.exe` | 132,008,057 | `CAEA6AC76680C32F343657817C1584D1CCED079A7A61EA040035D3BF11AB028F` | `0.1.21` | `NotSigned` |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `13DC03E298CC04A020925B69C0063D889313B392F18FD72FAC42A73AD121CE21` | `0.1.21.0` | `NotSigned` |
| `creatx/release/win-unpacked/resources/app.asar` | 179,013,978 | `1F4028999A30EF3EEA2FD11F427F104ECA481C20086DA6994F54593283CF143A` | 不适用 | 不适用 |

三个 PE 的 `ProductName` 均为“诺文”。

## 验收

- 功能代码冻结全量：598/598，4,495 次断言；联合定向：180/180，1,300 次断言。
- 版本批次 `bun run typecheck`、`bun run test:imports`、`bun run package:win`：PASS。
- 7-Zip `26.00` 对 Setup 和 Portable 执行 `t`，两者均为 Unicode NSIS 且 `Everything is Ok`。
- 直接读取 `app.asar`：版本为 `0.1.21`；不存在新手引导脚本、`@creatx/project-package-runtime` 依赖、文件或 Desktop 标志；Main 包含 `unregister_workbench`。
- `CREATX_TEST_EXECUTABLE=release/win-unpacked/诺文.exe bun run test:noven-brand` 使用隔离 Profile 与本地受控 Provider（模型服务）通过；退出后诺文/Electron 残留进程为 0。
- 第一次烟测遇到已运行的旧 `0.1.20 Portable` 单实例并被判定为无效证据；清理该次路径明确的旧进程后重新运行，以上结果来自第二次真实 `0.1.21` 解包 EXE。

## 未完成与风险

- 没有外部 Provider 自主选择 `unregister_workbench`，也没有执行 Electron 原生审批、批准前后磁盘检查、重启恢复或真实目录保留 Live（真实运行）验收。
- 没有 Renderer 手动“移除工作台入口”按钮；当前能力由普通项目会话中的 Agent 工具提供。
- 没有安装 Setup，也没有直接启动自解压 Portable；安装升级、快捷方式、卸载链和 Portable 外壳未验收。
- 没有运行完整 `test:desktop`；本轮没有重复执行全量测试，598/598 对应未再改变的功能代码头 `7a773ae`。
- `.np` 用户能力仍未接回生产链；`0.1.21` 版本号不表示该冻结项完成。
- 产物未签名，Windows 可能显示 SmartScreen 警告。

## 恢复入口

- 功能提交：`7a773ae`。
- 工作台注销证据：`docs/baseline/creatx-workbench-unregister-2026-08-11.md`。
- `.np` 恢复计划：`docs/plans/2026-08-10-portable-noven-project-package.md` Task 9。
- 新手引导仍从浏览器原型与后续独立生产设计批次继续，不属于本发布。
- 版本权威：`creatx/package.json`；打包配置：`creatx/electron-builder.yml`。
