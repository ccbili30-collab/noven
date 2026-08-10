# CreatX Active Development

- Read `CONTEXT.md` and `BASELINE.md` before changing code.
- `D:\CodexW\Creatx\creat1` is the canonical active root for the deepest and newest CreatX product, architecture, and implementation work.
- `creat1` always keeps the newest complete integrated head. Do not move an authoritative module out in a way that leaves the active product dependent on untracked sibling files.
- Stable checkpoints, reference sources, experiments, and isolated worktrees live as siblings under `D:\CodexW\Creatx` and use short functional English `kebab-case` names such as `runtime-baseline` or `electron-shell`. Do not use numbered names such as `creat2`, `creat3`, `creat4`, or `creat5`.
- Sibling directories are frozen evidence, references, or isolated work areas by default. They become active project facts only through a reviewed decision and an explicit Git merge, cherry-pick, extraction, or recorded regeneration into `creat1`.
- The removed NovelX/OpenCode snapshot remains recoverable from Git tag `pre-repository-cleanup-20260806`; it is not part of the active tree or a permitted Runtime dependency.
- Cline SDK `0.0.65` is the sole selected Agent Harness. Read `docs/adr/0005-cline-is-the-sole-agent-harness.md` and `docs/product/creatx-requirement-map.md` before any new Runtime, session, tool, Provider, desktop, or workbench implementation.
- `D:\CodexW\Creatx\cline-baseline` preserves official Tag `sdk/sdk/v0.0.65` at Commit `f33ab3a872091952f44e43d0c8f5438099a60ada`. It is source evidence, not a runtime-relative dependency or an active product root.
- Only the planned `creatx/packages/cline-adapter` may import Cline packages or Cline-private types. Do not add another Harness, a dual-Harness abstraction, a runtime fallback, or first-version Cline Core patches without a new accepted ADR.

## Project Memory And Conversation Boundary

- The long-running primary Codex conversation may remain the main product-discovery route, but no conversation is a durable source of truth.
- Every accepted product decision, architecture decision, protocol change, verified result, known failure, frozen item, and recovery entry must be distilled into `creat1` during the same committable batch.
- A new Agent must be able to recover the project from `CONTEXT.md`, repository documents, current code, tests, and evidence without reading historical chat.
- If continuing work requires reconstructing facts from an old conversation, the previous batch is not closed.
- Discussion volume is not progress by itself. Only decisions that have an owner, status, evidence boundary, and repository location may guide implementation.

### Shared Product Understanding

- `docs/product/creatx-product-understanding.md` is the canonical high-signal description of what CreatX is, what the user values, how product and technical decisions are divided, which directions are accepted, and which questions remain open.
- Read that document before proposing product behavior, architecture, workflows, or broad UI changes. Read the detailed discussion records only when the summary points to them or more evidence is required.
- Understanding the product is a completion requirement. Code that compiles or passes tests but violates the accepted user workflow, trust boundary, or product meaning is incorrect.
- Before changing a capability, identify its product intent, authoritative implementation, public contract, persisted data, tests, and user-visible failure behavior. If that map does not exist yet, establish it as part of the batch.
- Update shared understanding when an accepted decision changes. Preserve superseded reasoning through ADRs or discussion history instead of silently rewriting why the project took a direction.
- The user is not expected to validate Rust, SQL, concurrency, persistence, or process-management details. Agents own technical rigor and must present only the product consequences and material trade-offs that require user decisions.

### Discovery Capture And Promotion

- When product discovery produces new user intent, examples, corrections, rejected interpretations, or unresolved questions, first capture them in a dated document under `docs/discussions/` before distributing conclusions across the repository.
- A discovery record preserves the user's semantic meaning and the evolution of the discussion. It is evidence for later synthesis, not an automatically accepted product baseline, ADR, protocol, data model, acceptance criterion, or implementation claim.
- After capture, promote each stable item deliberately to its authoritative destination: product understanding, ADR, protocol, acceptance matrix, executable test, `CONTEXT.md`, or an explicit unresolved list.
- Do not wait until implementation to record important discovery, and do not rely on conversation compression as the only copy.
- When a later clarification changes an earlier interpretation, preserve both and state the supersession relationship. Do not silently rewrite the history into false agreement.
- Do not create an accepted ADR while the underlying product semantics are still being corrected or while materially different reasonable behaviors remain unresolved.
- During product discovery, do not ask the user to choose a consequence already entailed by an accepted product meaning. Derive and record those invariants; ask only when multiple materially different user experiences remain reasonable.

### Capability Lines And Task Routing

- `docs/capabilities/README.md` is the registry for product Capability Lines（能力线）. Route every product, architecture, implementation, or Bug task to one primary capability before changing code or authoritative specifications.
- A capability line owns the accepted behavior, explicit boundaries, open questions, acceptance matrix, implementation order, and links to its authoritative code and evidence. It spans UI, Runtime, persistence, protocol, and tests when the complete product behavior crosses those layers; it is not required to match one code package.
- Discussion records preserve user intent and corrections. ADRs explain significant decisions. Capability specifications state what the current product must do. Acceptance matrices state how that behavior will be observed. Do not make one document perform all four roles.
- One business rule has one primary capability owner. Adjacent capabilities reference that rule through a contract and link instead of restating it.
- For a cross-capability task, name one primary line and only the affected neighboring contracts. If ownership is ambiguous, resolve the registry before implementation.
- Do not create empty capability folders for completeness. Establish a line only when stable discovery exists or work is about to require its product and acceptance boundary.
- Before implementation, every targeted product rule must have a stable capability ID and every claimed result must map to an acceptance ID or explicitly state that no acceptance specification exists yet.

## Frontier And Checkpoint Flow

- New product, architecture, integration, and implementation work happens in `creat1` first.
- When a capability reaches an accepted stable checkpoint, preserve it outside `creat1` only through a Git branch/worktree, tagged export, or another provenance-preserving snapshot with its source commit and verification recorded.
- Name the external directory for the capability or evidence it owns, not its chronological number.
- Continue frontier development in `creat1` from the same integrated history. A checkpoint does not replace or become newer than `creat1`.
- Do not import sibling directories through filesystem-relative runtime dependencies. Reuse must enter through source control or an explicit extraction contract.

## Development Method

Use Specification-First（规格优先）and Repository-as-Memory（仓库即记忆）development.

- Production feature implementation is blocked until the product baseline and architecture baseline are reviewed and accepted.
- Before that gate passes, allowed work is limited to discussion, repository documentation, evidence gathering, and explicitly disposable Web prototypes.
- A disposable prototype must not become a hidden production foundation. Reuse requires a separate review of ownership, dependencies, tests, security, and failure semantics.

Before production implementation, define and review:

- the current goal, allowed scope, explicit non-goals, acceptance criteria, and stop conditions;
- product vocabulary, user-visible semantics, known invariants, unresolved questions, and required product decisions;
- process ownership, data authority, write ownership, protocol boundaries, failure categories, cancellation, recovery, permissions, and migration rules;
- the smallest real vertical path that can falsify the architecture.

Do not attempt to design every future table, module, content type, Agent role, or workflow before evidence exists. Freeze hard-to-change boundaries early and keep reversible product details open.

### Prototype And Walking Skeleton

- Use Web prototypes to make incomplete product ideas concrete before committing to production behavior.
- Mark Fixture（测试夹具）, Mock（模拟）, and visual-only states as Prototype（原型）. They are never Live（真实运行）evidence.
- Introduce a thin Electron shell early enough to test filesystem access, tray behavior, notifications, background continuation, process ownership, and clean exit.
- Before broad feature work, complete one Walking Skeleton（可运行骨架） through the real Electron UI, CreatX contracts, Cline Adapter, real Provider, native approval, real project file, event return, cancellation, and completed-history reopen boundaries. An active Run stops when the application exits or crashes; the user may reopen the session and send a new “continue” turn. Exact active-Run continuation and exactly-once side-effect recovery are later capabilities, not Walking Skeleton gates.
- The skeleton must include a real Provider and real files before it can be called Live.

### Frozen Batches And Change Control

- Implement one bounded, vertically coherent batch at a time.
- New ideas discovered during a batch are recorded for later triage unless they invalidate the current product meaning or architecture.
- A change to product semantics, public protocol, data compatibility, permission boundaries, or architecture requires impact analysis and an accepted decision before implementation.
- Each completed batch updates current status, tests, verification evidence, known limitations, and the next recovery entry.
- If an unrelated failure appears, diagnose it separately. Do not expand the active batch or add compatibility shims to preserve momentum.

## AI-Maintainable Architecture

- One business rule has one authoritative implementation. Do not repeat it across prompts, state machines, storage, UI, and tests.
- Organize code by complete business capability so an Agent can work from one module, its stable contracts, and its tests.
- Add interfaces only at real ownership or replacement boundaries. Do not create an interface, service, repository, or manager for every concrete implementation.
- Keep the Renderer independent from Harness-private messages and persistence schemas. UI commands and projections go through stable CreatX contracts.
- Keep database writes behind one declared owner. Other processes use commands or queries through that owner and never update its tables directly.
- Generate cross-language protocol types from one authority. Do not maintain equivalent Rust, TypeScript, and Python contracts by hand.
- Tests are executable specifications and cover success, failure-closed behavior, idempotency, cancellation, recovery, permissions, and unknown-result boundaries in proportion to risk.
- Keep files and modules within a context size that an Agent can safely understand. Split mixed responsibilities, not merely long files.
- Keep `CONTEXT.md` current with implemented state, strongest Live evidence, known failures, and the exact next recovery point.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected package or area when helpful, e.g. `growth`, `desktop`, `workbench`, `image`, or `skills`.

Examples: `fix(desktop): preserve conversation history`, `docs: update capability baseline`, `test(growth): cover owner recovery`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.
- In Effect generators, bind services to named variables before calling methods. Do not use nested service yields such as `yield* (yield* Foo.Service).bar()`.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported namespace by name rather than aliasing a star import.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the narrowest scope that needs them so they read like normal imports. Avoid inline chains such as `await import("./module").then((mod) => mod.value())` or `(await import("./module")).value()`. Keep branch-specific imports inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Run the integrated CreatX suite from `creatx/`; run a package-local test only when the package script explicitly requires it.

## Type Checking

- Always run `bun run typecheck` from `creatx/`; never invoke `tsc` directly for project verification.
