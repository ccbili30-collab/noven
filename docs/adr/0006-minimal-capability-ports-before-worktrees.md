# ADR-0006：六条候选线只共享最小真实 Port

## Status

Accepted

日期：2026-07-27

后续：ADR-0007 已接受 Workbench V1 Schema，解除本文当时保留的 Workbench Schema 门禁；图片合同和 Creative Skill 包装仍保持延期。ADR-0006 的共享 Port 所有权不变。

## Context

第一条 Walking Skeleton（可运行骨架）已经接通真实 Electron、Cline、Provider（模型服务）、审批和项目文件。后续六条候选 Worktree（工作树）需要协作，但当前只有 Renderer 合同、Cline Adapter 和只读项目文件投影；Workbench、Creative Plugin 和 Image Runtime 若各自猜测路径、工具或写入合同，会在合并时形成多套事实。

同时，`.creatx` Schema（数据合同）、第一图片 Provider、图片任务、Creative Skill（创作技能）包装和完整工作台行为尚未确定。为了并行而预建这些未来合同，会把未接受的产品行为伪装成架构事实。

## Decision

### Project File Port（项目文件端口）

- `@creatx/project-files` 的 `ProjectFileService` 是 Main Process（主进程）内项目 ID 到真实根路径映射的唯一所有者；Main 不保留第二份路径 Map。
- 下游 Runtime（运行时）模块只通过 `ProjectFileQueryPort` 和 `ProjectFileCommandPort` 使用 `projectId + fileId/relativePath`。绝对项目路径不进入 Renderer 操作命令。
- Query Port 提供刷新、预览和内部字节读取；Command Port 提供文本或二进制写入和可选的 `expectedModifiedAt` 冲突检查。
- Port 拒绝未知项目、绝对文件路径、`..` 路径逃逸和符号链接/Junction（目录联接）逃逸。写入使用同目录临时文件后 Rename（重命名）替换。
- 本 Port 不定义 `.creatx`、Workbench、图片任务、版本、回收站、删除、移动、Watcher（监听器）或持久事务。

### CreatX Tool Contribution Port（工具贡献端口）

- `@creatx/contracts` 定义不含 Cline 类型的 `CreatXToolContribution`：工具名、说明、顶层对象 JSON Schema、应用/项目作用域、审批要求、超时和显式成功/失败结果。
- 只有 `@creatx/cline-adapter` 把该合同转换为 Cline `createTool/extraTools`。Adapter 在启动时拒绝非法名称、重复名称、Cline 内置名称冲突、空说明、非对象 Schema 和无效超时。
- 项目作用域工具执行时必须获得对应 Cline Session（会话）的 `projectId`；缺少关联时失败关闭。项目 ID 由新会话元数据保存，历史会话可由 Main 根据已保存项目根重新解析。
- 工具的 `automatic/required` 要求进入 Cline 原生 Tool Policy（工具策略）；这不是第二套审批 Runtime，也不改变 Cline 原生工具的信任边界。
- Creative Plugin 只贡献中立定义，不导入 `@cline/`；每个真实工具仍必须验证自己的输入，并只通过所需能力的 Port 执行。

### Worktree 所有权

- Contracts、Main/Preload、根依赖和跨能力集成测试继续由 `creat1` 集成线独占。
- 子线发现 Port 不足时提交合同变更请求并停止，不得在自己的目录复制路径映射、Cline 类型或平行接口。
- 本 ADR 只实现当时已被真实骨架和六线边界证明需要的两个 Port。Workbench Schema 后由 ADR-0007 单独接受；图片合同和 Skill 包装继续保持阻塞。

## Consequences

### Positive

- Workbench 和 Image Runtime 可以复用同一真实文件所有权，不需要接触绝对项目根。
- Creative Plugin 可以贡献 Cline 工具而不依赖实验性 Harness 私有类型。
- Renderer、Main、Adapter 和未来能力之间的改动位置明确，六条线不必同时修改共享文件。
- 未确定产品行为不会因为空 Package 或占位类型提前固化。

### Negative

- `creat1` 仍是共享合同和 Main 集成的串行瓶颈；涉及公共合同的工作不能与子线独立合并。
- `expectedModifiedAt` 只是单次乐观冲突门禁，不等于版本历史、回收站或跨进程事务。
- 当前仅证明中立工具能注册到真实 Cline Session 配置；尚未证明真实 Provider 会选择并成功调用 CreatX 工具。
- 自动审批仍依赖受审查的工具声明和集成配置，不构成操作系统级权限隔离。

## Alternatives Considered

### 六条线各自传绝对路径

拒绝。它会把 Main 的项目授权绕回每个 Package，并使 Renderer 或工具输入可以重新选择真实路径。

### 先定义完整 Workbench、图片和 Creative Schema

拒绝。对应产品行为和 Provider 尚未接受，提前定义只会制造假稳定性和迁移债务。

### 让 Creative Plugin 直接导入 Cline

拒绝。它会破坏 ADR-0005 的单一 Adapter 边界，并让 Cline 升级扩散到创作能力。

### 只写 TypeScript Interface，不提供实现

拒绝。空合同不能验证 Windows 文件语义、路径失败关闭或 Cline `extraTools` 的真实兼容性。

## References

- `docs/adr/0005-cline-is-the-sole-agent-harness.md`
- `docs/plans/2026-07-27-six-line-interface-enablement.md`
- 清理前 Worktree 编排记录保存在标签 `pre-repository-cleanup-20260806`
- `creatx/packages/project-files/src/index.ts`
- `creatx/packages/contracts/src/index.ts`
- `creatx/packages/cline-adapter/src/index.ts`
