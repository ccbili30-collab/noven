# 诺文 Windows 0.1.22 发布基线

日期：2026-08-11
源代码头：`9b2e2ee`（艺术库 `0.1.19` 恢复、生产十步新手教程与 GitHub 发布映射）
版本与发布证据：本文件同批提交

## 发布内容

Windows `0.1.22` 在 `0.1.21` 基础上增加两项已验收能力：

- 艺术库恢复 `0.1.19` 图鉴、展览、详情、CSS 与动效，63 件预批准基础藏品由 Runtime（运行时）真实物化为巨构艺术 41、暖色风格 18、纪念碑谷 4；后续新增图片仍经过唯一审批状态机。
- 生产 `WorkspaceShell` 首次 Profile 自动播放十步 Spotlight（聚光灯）教程；中断后下次仍出现，完成或明确跳过后记忆，展开与折叠项目导航均可重播。
- 教程使用设置、项目、Composer（输入区）、工作台、艺术库、灵感库和传承库的真实生产锚点，第九步展示九类能力和九项当前正式 Skill（技能）。教程本身不填写密钥、不发送消息、不调用 Provider（模型服务）、不修改项目。
- 继续包含 `0.1.21` 的安全 `unregister_workbench` 工具。
- 本发布不包含另一工作树尚未提交的抖音视频读取、世界蓝图测试实验、世界星图、因果图原型或夜间脚本。
- `.np` 生产接线仍冻结，不因版本升级恢复。

## 发布阻塞修复

隔离发布树第一次执行 Typecheck（类型检查）时，两个 `world-blueprint` 测试装配对象缺少既有 `ProjectInternalStatePort.deleteFile` 字段而失败。发布批次只在这两个测试中透传真实 `files.internal.deleteFile`，没有改变生产行为、公开协议或数据。补齐后从干净发布树重新执行全量门禁并通过。

## 产物

| 产物 | 字节 | SHA-256 | PE 版本 | 签名 |
| --- | ---: | --- | --- | --- |
| `creatx/release/诺文-0.1.22-x64-Setup.exe` | 121,561,653 | `A457F3990C8A959043A08ECC5C6F04398BFADA51A5A4C89E973E5F85F8DD19D9` | `0.1.22` | `NotSigned` |
| `creatx/release/诺文-0.1.22-x64-Setup.exe.blockmap` | 129,452 | `F06B39692335CA1FB28A5C4881C78DE9697C1279984B8AE612795EE114F56421` | 不适用 | 不适用 |
| `creatx/release/诺文-0.1.22-x64-Portable.exe` | 121,337,832 | `C013D977E2FC47E7309FCA6A733B0337DE1C18E970CE82F18B6EF5F7F06DD938` | `0.1.22` | `NotSigned` |
| `creatx/release/win-unpacked/诺文.exe` | 231,522,816 | `1E469A64172DF5C8EDB0E5A852C7AE841111C9E607E37DB6CCB9DED6CF17178B` | `0.1.22.0` | `NotSigned` |
| `creatx/release/win-unpacked/resources/app.asar` | 164,505,544 | `74DD02B1BCFC8B72D32167B03B84A40666BC6D15ED425F1C00978EB1F699C49F` | 不适用 | 不适用 |

三个 PE 的 `ProductName` 均为“诺文”。主项目规范发布目录保留全部旧 Setup/Portable，并把上一版解包目录保存为 `win-unpacked-0.1.21`。

## 验收

- `bun install --frozen-lockfile`：PASS；`bun.lock` SHA-256 前后均为 `24CA3CF0A474C2F9A7018D5F7B56795E41DC958C1751B7669BD07D0DC2CAE2B1`。
- `bun run typecheck`、`bun run test:imports`、`bun run test`、`bun run build`：PASS。
- 全量测试：604/604，4,526 次断言，83 个文件。
- `bun run package:win`：PASS，生成 Windows x64 NSIS Setup、Blockmap、Portable 与解包目录。
- 7-Zip `26.00` 对 Setup 和 Portable 执行 `t`，两者均为 Unicode NSIS 且 `Everything is Ok`。
- `app.asar`：版本 `0.1.22`；包含生产新手教程、完整工具箱文案、艺术库页面与 Runtime、63 件及 41/18/4 种子约束、`unregister_workbench`；不存在新手教程 Prototype（原型）文件或以 Douyin/TikTok/Aweme 命名的入口。
- `CREATX_TEST_ELECTRON_EXECUTABLE=release/win-unpacked/诺文.exe node --experimental-strip-types scripts/electron-onboarding-test.ts`：十步打包端 Electron（桌面运行壳）通过，覆盖首次出现、中断恢复、完成后重启、展开/折叠入口、减弱动效；Provider 请求 0、项目写入 0，退出后该 EXE 残留进程 0。
- 复制到主项目规范发布目录后，Setup、Blockmap、Portable、解包 EXE 和 `app.asar` 的源/目标 SHA-256 逐项一致。

## 未完成与风险

- 没有安装 Setup，也没有直接启动自解压 Portable；安装升级、快捷方式、卸载链和 Portable 外壳未验收。
- 本批没有用打包 EXE 重跑完整艺术库审批、重启和协议负向纵向测试；这些能力的最强 Electron 证据来自发布前功能基线，本批以全量测试、`app.asar` 内容检查和打包端教程烟测确认集成未丢失。
- 没有调用外部 Provider，也没有验证审核老师提供的真实 API Key；教程只验证零请求边界。
- 没有运行完整 `test:desktop` 或正式 Profile；没有修改正式用户数据。
- 产物未签名，Windows 可能显示 SmartScreen 警告。
- 只核对 `app.asar` 中不存在相关命名入口并以隔离 Git 源保证未夹带另一工作树内容；这不是对未来抖音读取功能的验收。

## 恢复入口

- 源代码头：`9b2e2ee`。
- 测试合同补齐：活动历史 `4d0bd9f`、GitHub 发布镜像 `f1b9bdd`。
- `0.1.22` 发布提交：活动历史 `29324b2`、GitHub 发布镜像 `c22472f`；两者文件 Tree 哈希均为 `e4e838a83b6c59a3ef868f3c8453db4db2c9c6ba`。
- 艺术库证据：`docs/baseline/creatx-art-library-019-restoration-2026-08-11.md`。
- 新手教程证据：`docs/baseline/creatx-production-onboarding-2026-08-11.md`。
- 工作台注销证据：`docs/baseline/creatx-workbench-unregister-2026-08-11.md`。
- 版本权威：`creatx/package.json`；打包配置：`creatx/electron-builder.yml`。
