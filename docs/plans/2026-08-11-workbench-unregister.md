# Workbench Unregister Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add an approved `unregister_workbench` tool that removes only one registered workbench view record and safely returns the UI to builtin files.

**Architecture:** Extend the Project Internal State Port with compare-before-delete semantics, then expose that operation only through the Workbench Command Port. The Renderer reconciles a disappeared active workbench to `builtin:files`; no project content API or directory deletion is introduced.

**Tech Stack:** TypeScript, Bun tests, Electron Runtime tool contributions, React 19.

---

### Task 1: Freeze product and acceptance semantics

**Files:**
- Modify: `docs/capabilities/workbench-registry/product-spec.md`
- Modify: `docs/capabilities/workbench-registry/acceptance.md`
- Modify: `docs/capabilities/workbench-registry/plan.md`

Record metadata-only deletion, approval, missing-folder support, conflict failure, active-view fallback and explicit non-goals.

### Task 2: Add compare-before-delete internal state support

**Files:**
- Modify: `creatx/packages/project-files/src/index.ts`
- Test: `creatx/packages/project-files/tests/project-files.test.ts`

Write a failing test for deleting the exact namespaced record, preserving ordinary content and rejecting stale, missing and unsafe targets. Implement the smallest `deleteFile` Port method and rerun the package test.

### Task 3: Add the unregister command and AI tool

**Files:**
- Modify: `creatx/packages/workbench/src/index.ts`
- Test: `creatx/packages/workbench/tests/workbench.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/packages/creative-skills/src/index.ts`

Test ready and missing workbenches, content preservation, unknown/conflict failure, change notification and required approval. Implement the command, tool contribution and Desktop aggregation.

### Task 4: Reconcile a removed active workbench

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Test: `creatx/apps/desktop/renderer/tests/workspace-layout.test.ts`

Add a pure reconciliation rule and an effect that selects `builtin:files` only after a loaded snapshot proves the active registered ID disappeared.

### Task 5: Verify and record evidence

Run the project-files, workbench and Renderer tests, then `bun run typecheck`, `bun run test:imports`, `bun run build`, and `git diff --check`. Update the capability evidence, `CONTEXT.md` and a dated baseline without claiming Provider or Electron Live evidence that was not run.
