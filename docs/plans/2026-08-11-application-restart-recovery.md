# Application Restart Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a real in-app “恢复诺文” action that safely relaunches the entire Electron app, confirms active work, restores the selected project/session, and never replays work automatically.

**Architecture:** `desktop-runtime` owns the restart decision and Electron lifecycle. Renderer persists a one-shot view selection and calls a stable Desktop API; Main rechecks active Owner/Growth/image facts, schedules exactly one `app.relaunch()`, and reuses the existing `before-quit` shutdown path. Session history remains owned by Cline and is only read after restart.

**Tech Stack:** Electron 42, React 19, TypeScript, Bun test, existing CreatX contracts and shutdown lifecycle.

---

### Task 1: Freeze product and acceptance boundaries

**Files:**
- Create: `docs/discussions/2026-08-11-application-restart-recovery.md`
- Create: `docs/capabilities/desktop-runtime/README.md`
- Create: `docs/capabilities/desktop-runtime/product-spec.md`
- Create: `docs/capabilities/desktop-runtime/acceptance.md`
- Create: `docs/capabilities/desktop-runtime/plan.md`
- Modify: `docs/capabilities/README.md`

**Steps:** Record DRT-001..007 and ACC-DRT-001..006; keep root-cause fixes and automatic recovery outside the batch.

### Task 2: Write failing policy and recovery tests

**Files:**
- Create: `creatx/apps/desktop/tests/application-restart.test.ts`
- Create: `creatx/apps/desktop/renderer/tests/application-restart-recovery.test.ts`
- Modify: `creatx/apps/desktop/tests/owner-growth-delivery.node-test.ts`
- Modify: `creatx/packages/image-runtime/tests/queue.node-test.ts`

**Steps:**

1. Assert idle requests return `restarting`, active requests require confirmation, and confirmed requests restart.
2. Assert one-shot selection accepts only an existing matching Session and clears corrupt/stale data.
3. Assert Owner conversation/Growth and image generation expose activity without duplicating execution state.
4. Run the four tests and confirm they fail before implementation.

### Task 3: Implement the stable restart contract and Main lifecycle

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Create: `creatx/apps/desktop/src/application-restart.ts`
- Modify: `creatx/apps/desktop/src/owner-growth-delivery.ts`
- Modify: `creatx/packages/image-runtime/src/queue-store.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`

**Steps:**

1. Add `RestartApplicationCommand`, `RestartApplicationActivity`, `RestartApplicationResult`, optional `DesktopBootstrapSelection`, and `restartApplication()`.
2. Implement pure restart decision validation and expose bounded active-state queries.
3. Recheck activity in Main, return confirmation without side effects, and schedule one Relaunch only after acceptance.
4. Reuse the current asynchronous `before-quit` cleanup and retain the no-replay invariant.
5. Run desktop, image-runtime, contract and type tests.

### Task 4: Implement navigation UI and one-shot selection restore

**Files:**
- Create: `creatx/apps/desktop/renderer/src/application-restart-recovery.ts`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/ProjectNavigation.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`

**Steps:**

1. Persist the current project/session before an accepted restart and consume it only during the next Bootstrap.
2. Put “恢复诺文” in expanded and collapsed navigation.
3. Show one accessible confirmation Dialog for active work; cancellation makes no IPC mutation.
4. Project a checking/restarting state and preserve existing error handling.
5. Run Renderer tests and a production build.

### Task 5: Freeze and verify

**Files:**
- Modify: `CONTEXT.md`
- Create: `docs/baseline/creatx-application-restart-recovery-2026-08-11.md`

**Commands:**

1. `bun test <targeted test files>`
2. `bun run typecheck`
3. `bun run test:imports`
4. `bun run test`
5. `bun run build`
6. Run isolated Electron Relaunch verification with no external Provider.
7. Check child processes, temporary Profile, `git diff --check`, and staged scope.

**Completion:** The button performs a real whole-app restart, active work is never silently interrupted, the selected Session returns when still valid, no work is replayed, and all stated verification boundaries are recorded.
