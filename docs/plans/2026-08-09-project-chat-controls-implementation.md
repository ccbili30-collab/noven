# Project Chat Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the accepted four-column project conversation layout, monotonic `创作（n）` names, safe operating-system file drop, and local-only user-message controls without changing Cline history or Provider semantics.

**Architecture:** Cline remains the sole message authority. The Adapter projects Cline's persisted message IDs into stable Timeline IDs; CreatX stores only UI visibility preferences keyed by `sessionId + itemId`. Main owns the additive session counter and attachment authorization, Preload converts real DOM `File` objects to paths with Electron `webUtils`, and Renderer owns layout and interaction state.

**Tech Stack:** TypeScript 5.9, React 19, Electron 42, Bun 1.3, Node SQLite, Cline SDK 0.0.65.

---

### Task 1: Prove stable Timeline identity

**Files:**
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Test: `creatx/packages/cline-adapter/tests/projection.test.ts`

**Step 1: Write the failing tests**

Add persisted-message fixtures with `id` fields and assert that user rows project as `message:<persisted-id>` before and after unrelated messages are inserted ahead of them. Add duplicate-text fixtures to prove identity does not depend on text or array position.

**Step 2: Run the test and verify failure**

Run: `bun test packages/cline-adapter/tests/projection.test.ts` from `creatx/`.

Expected: the new assertions fail because production currently emits `message-<index>`.

**Step 3: Implement the minimum projection change**

Accept Cline `MessageWithMetadata` at the Adapter-only boundary and derive message/reasoning block IDs from its persisted `id` when present. Preserve index-based fallback only for legacy messages without IDs; expose no Cline-private type through `@creatx/contracts`.

**Step 4: Run the test and verify pass**

Run: `bun test packages/cline-adapter/tests/projection.test.ts`.

Expected: all projection tests pass, including stable duplicate-text identity.

### Task 2: Allocate ordinary project conversation names atomically

**Files:**
- Modify: `creatx/packages/session-runtime/src/index.ts`
- Modify: `creatx/packages/session-runtime/tests/store.node-test.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/packages/cline-adapter/tests/attachments.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`

**Step 1: Write the failing store tests**

Assert that projects A and B independently allocate `创作（1）`; reopen continues at `创作（2）`; deletion and rename cannot decrement the counter; malformed IDs fail closed; schema version 1 migrates additively to version 2.

**Step 2: Run the store test and verify failure**

Run: `bun run test:session-runtime`.

Expected: allocation method and schema 2 do not exist.

**Step 3: Implement the Main-owned allocation path**

Add a `project_conversation_counter(project_id PRIMARY KEY, next_number)` table and allocate under `BEGIN IMMEDIATE`. Extend `createSession(projectId, explicitTitle?)`; Main allocates only when `explicitTitle` is absent. Pass the final title into `createProjectSession`, persist it immediately, and stop replacing titles from later user prompts.

**Step 4: Cover ordinary and explicitly named sessions**

Add Adapter/Main-facing tests showing an ordinary session keeps `创作（n）` after sending and an explicit `艺术库 Chat` session neither consumes nor gets overwritten by the ordinary counter.

**Step 5: Run targeted tests**

Run: `bun run test:session-runtime && bun test packages/cline-adapter/tests/attachments.test.ts`.

Expected: all targeted tests pass.

### Task 3: Add atomic file-drop authorization

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/attachments.ts`
- Modify: `creatx/apps/desktop/tests/attachments.test.ts`
- Create: `creatx/apps/desktop/src/dropped-attachments.ts`
- Create: `creatx/apps/desktop/tests/dropped-attachments.test.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Step 1: Write failing boundary tests**

Test a real `File` path extraction seam, empty/forged file rejection, folder rejection, over-20 rejection, duplicate elimination, and a mixed valid/invalid batch leaving `AttachmentAuthorizationStore` unchanged.

**Step 2: Run and verify failure**

Run: `bun test apps/desktop/tests/attachments.test.ts apps/desktop/tests/dropped-attachments.test.ts`.

Expected: the dropped-file bridge does not exist.

**Step 3: Implement Preload and Main authorization**

Use `webUtils.getPathForFile(file)` only in Preload, invoke a dedicated Main command with the resolved batch, validate the whole batch before authorizing it, and return display-safe references without absolute paths. Do not auto-send.

**Step 4: Implement the Chat drop target**

Handle file `dragenter`, `dragover`, `dragleave`, `drop`, and Escape on `ConversationPanel`; show `松开以添加到对话`; reject the batch when existing plus incoming attachments exceeds 20; keep the button file picker as an equal path. Do not attach handlers to the canvas or workbench tree.

**Step 5: Run targeted tests**

Run: `bun test apps/desktop/tests/attachments.test.ts apps/desktop/tests/dropped-attachments.test.ts`.

Expected: all attachment tests pass with zero-side-effect failures.

### Task 4: Persist local-only user-message controls

**Files:**
- Create: `creatx/apps/desktop/renderer/src/message-visibility-preferences.ts`
- Create: `creatx/apps/desktop/renderer/tests/message-visibility-preferences.test.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Step 1: Write failing preference and transition tests**

Cover parse/serialize, per-session isolation, corrupt storage recovery, delete persistence, edit cancellation, resend failure restoration, and rejection of legacy index-fallback IDs as durable hide keys.

**Step 2: Run and verify failure**

Run: `bun test apps/desktop/renderer/tests/message-visibility-preferences.test.ts`.

Expected: preference module does not exist.

**Step 3: Implement local visibility state**

Store only stable user Timeline IDs under a versioned Renderer `localStorage` key. Filter user rows after Timeline turn projection; never remove Assistant, reasoning, tools, notices, or Cline history.

**Step 4: Implement actions and recovery**

Add focusable `删除 / 修改 / 重发` controls. First deletion uses the shared `DesktopDialog` to explain “只从你的界面删除，AI 仍保留”. Edit places text in Composer and records the original ID; resend submits the same text. Hide optimistically only during a real `sendMessage` path and restore on synchronous, IPC, Provider, cancellation, or persistence failure. Disable edit/resend while a Run or approval is active.

**Step 5: Run targeted Renderer tests**

Run: `bun test apps/desktop/renderer/tests/message-visibility-preferences.test.ts apps/desktop/renderer/tests/timeline-channels.test.ts`.

Expected: all message projection and preference tests pass.

### Task 5: Implement the fixed four-column layout and collapse rules

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/workspace-layout.ts`
- Modify: `creatx/apps/desktop/renderer/tests/workspace-layout.test.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/ProjectNavigation.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Step 1: Write failing layout tests**

Assert fixed order `project / chat / canvas / workbench-tree` in both modes, left collapse at 52px with restoration of drag-start width, and narrow-width priority of left navigation before right workbench navigation.

**Step 2: Run and verify failure**

Run: `bun test apps/desktop/renderer/tests/workspace-layout.test.ts`.

Expected: old Workbench mode still reorders Chat to the right and clamps project width to 220px.

**Step 3: Implement layout state and DOM ownership**

Always pass `navigationContent="sessions"`; show the project name in the Chat heading; keep project sessions in the left navigation; move the workbench selector/resource tree to the right; keep Chat mounted in the middle-left. Replace the version-3 panel preference with a version-4 reader that ignores old reordering semantics.

**Step 4: Implement collapse and responsive behavior**

Treat 52px as a true collapsed state, preserve the pre-drag expanded width, orient the right-rail toggle toward the edge, and apply the accepted narrow-window collapse priority without clearing project, session, file, draft, attachment, scroll, editor, or Run state.

**Step 5: Run targeted layout tests**

Run: `bun test apps/desktop/renderer/tests/workspace-layout.test.ts apps/desktop/renderer/tests/workbench-resource-tree.test.ts`.

Expected: all targeted layout/resource tests pass.

### Task 6: Integrated verification and repository memory

**Files:**
- Modify: `docs/capabilities/session/product-spec.md`
- Modify: `docs/capabilities/session/acceptance.md`
- Modify: `docs/capabilities/workspace-ui/product-spec.md`
- Modify: `docs/capabilities/workspace-ui/acceptance.md`
- Modify: `CONTEXT.md`
- Create: `docs/baseline/creatx-project-chat-controls-2026-08-09.md`

**Step 1: Run the frozen targeted suite**

Run from `creatx/`: the Task 1-5 test commands once each, then `bun run typecheck`, `bun run test:imports`, and `bun run build`.

Expected: all commands exit 0. Do not call a real Provider for file-drop or local-hide verification.

**Step 2: Run isolated Electron acceptance**

Use a temporary `--user-data-dir`; create/reopen/delete/rename sessions, drag a real temporary file, exercise delete/edit/resend failure recovery with missing Provider credentials, and inspect 1360×860, 900×700, and 860×620. Close the isolated app and verify no residual process for that executable/Profile.

**Step 3: Update authoritative status**

Record exact tests, assertion counts, Electron evidence, missing Provider boundary, and any unverified scale/keyboard scenario. Mark `ACC-WUI-061..063 / ACC-SES-021` only to the strength actually observed.

**Step 4: Final integrity check and semantic commit**

Run: `git diff --check`, inspect `git status --short`, and review staged content before committing. Do not package a new Windows release unless the user separately requests packaging.
