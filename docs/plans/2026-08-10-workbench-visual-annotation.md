# Workbench Visual Annotation Implementation Plan

**Execution status (2026-08-10):** Tasks 1–5 and the Electron/failure/privacy portions of Task 6 are complete. External vision Provider delivery and non-vision failure-closed verification remain open because no isolated text/vision Provider configuration is available. See `docs/baseline/creatx-workbench-visual-annotation-2026-08-10.md`.

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a non-destructive workbench overlay that turns the current visible artifact plus rectangle/freehand marks into a pending vision attachment.

**Architecture:** Renderer owns normalized annotation draft commands and paints one overlay canvas above the existing workbench surface. Electron Main captures only a validated canvas rectangle, registers the trusted PNG in the existing attachment authorization store, and returns an ordinary pending `AttachmentReference`; Cline remains the message and Provider authority. Source project files never change.

**Tech Stack:** React 19, TypeScript 5.9, Electron 42 `webContents.capturePage`, Canvas 2D, Bun tests, Playwright/CDP Electron acceptance.

---

### Task 1: Freeze Product And Acceptance Boundaries

**Files:**
- Create: `docs/discussions/2026-08-10-workbench-visual-annotation.md`
- Create: `docs/capabilities/workbench-annotation/{README.md,product-spec.md,acceptance.md,plan.md}`
- Modify: `docs/capabilities/README.md`

**Steps:** Record `WBA-001..008`, `ACC-WBA-001..009`, source-preservation and privacy stop conditions. Verify all Markdown is UTF-8 and linked from the capability registry. Do not claim implementation.

### Task 2: Prove Capture Geometry Before Production UI

**Files:**
- Create: `creatx/apps/desktop/src/workbench-capture.ts`
- Create: `creatx/apps/desktop/tests/workbench-capture.test.ts`
- Create: `creatx/scripts/electron-workbench-capture-test.ts`
- Modify: `creatx/package.json`

**Steps:** First test strict finite positive CSS-pixel rectangles and output bounds. Implement capture through an injected `capture(rect)` boundary so unit tests use real geometry logic without Electron Mock globals. Add an isolated Electron fixture that captures image, Markdown and iframe pixels at device scale and proves adjacent sentinel UI is absent. Run `bun test apps/desktop/tests/workbench-capture.test.ts`, then `node --experimental-strip-types scripts/electron-workbench-capture-test.ts`. Stop if crop alignment is not exact.

### Task 3: Build The Pure Annotation Draft Engine

**Files:**
- Create: `creatx/apps/desktop/renderer/src/workbench-annotation-state.ts`
- Create: `creatx/apps/desktop/renderer/tests/workbench-annotation-state.test.ts`

**Steps:** Write failing tests for normalized rectangle/freehand commands, three widths, undo/redo, clear, resize replay, source identity and dirty state. Implement immutable command history with one active pointer command kept outside history until pointer-up. Run the focused test and keep pointer sampling bounded.

### Task 4: Add Trusted Generated PNG Attachments

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/apps/desktop/src/attachments.ts`
- Modify: `creatx/apps/desktop/tests/attachments.test.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`

**Steps:** Add a strict `CaptureWorkbenchAnnotationCommand` and Desktop API result. Test and implement in-memory trusted PNG authorization with signature and 10 MiB limits, preview, resolve, consume and expiry semantics. Main verifies current project/file identity and capture rectangle, captures Main window pixels, and returns one normal pending image reference. Never accept Renderer-supplied arbitrary image bytes.

### Task 5: Integrate Overlay And Minimal Toolbar

**Files:**
- Create: `creatx/apps/desktop/renderer/src/WorkbenchAnnotationOverlay.tsx`
- Create: `creatx/apps/desktop/renderer/src/WorkbenchColorPicker.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/styles.css`
- Modify: targeted Renderer tests

**Steps:** Add a discoverable annotation toggle to `CreationStage`, overlay only `.wb-map-canvas`, and expose rectangle/pen, undo/redo, clear, three widths, current color and “加入对话”. Implement HSV/Hex/recent colors. Eyedropper requests a one-pixel trusted capture. “加入对话” captures the exact canvas rectangle, appends the returned reference through `appendAttachmentSelection`, clears the overlay only after success, returns to Chat without remounting the artifact, and focuses Composer. Nonempty exit/navigation requires explicit discard.

### Task 6: Verify Failure, Privacy And Real Vision Delivery

**Files:**
- Create: `creatx/scripts/electron-workbench-annotation-test.ts`
- Update: capability evidence and `CONTEXT.md`

**Steps:** Verify pointer/keyboard controls, resize, iframe, image, Markdown, capture failure, duplicate activation, attachment failure and source hashes. Inspect the produced PNG and prove no adjacent sentinel pixels. Use a real configured vision Provider for one message only; without configuration report Provider Live open. Then run focused tests, `bun run typecheck`, `bun run test:imports`, one frozen `bun test`, `bun run build`, and `git diff --check`. Do not package Windows unless separately requested.
