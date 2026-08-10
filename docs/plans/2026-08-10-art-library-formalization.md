# Personal Art Library Formalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the existing personal art-library Runtime into a real desktop feature that can collect public images, current-turn chat attachments, and current-project images into one human-reviewed filesystem library.

**Architecture:** Keep `ArtLibraryService` as the sole workflow and persistence authority. Add source adapters that normalize web bytes, a trusted current-turn attachment snapshot, and a trusted current-project file into the existing candidate directory shape; every source then follows the same validation, SHA-256 deduplication, visual reading, approval, rejection, category, and keyword-export path. Replace the production static iframe with typed React projections and Main-process commands; serve originals through an ID-based read-only Electron protocol without exposing absolute paths.

**Tech Stack:** TypeScript, Bun workspaces/tests, Electron Main/Preload/Renderer, React 19, Cline SDK `0.0.65`, Node filesystem/crypto APIs.

---

## Scope and gates

**Primary capability:** `art-library`.

**Adjacent contracts:** `project-files` supplies trusted project bytes; `session` supplies trusted session/project identity; `provider-harness` supplies the visual model loop; `workspace-ui` displays real projections and human decisions.

**In scope:** PNG/JPEG/WebP/GIF runtime validation; current-turn PNG/JPEG chat attachments; current-project image files supported by `project-files`; real approval/category UI; style keyword export; restart persistence; static-seed compatibility.

**Out of scope:** videos, cloud sync, background crawling, arbitrary absolute paths, moving original project files, an art-library-specific Agent, library-level AI prompt synthesis, retroactively importing every historical chat image.

**Stop conditions:** stop before production changes if the existing Profile cannot be copied and decoded without mutation; if project or attachment bytes cannot be tied to trusted session context; if the baseline cannot typecheck after dependencies are restored; or if the UI would need direct filesystem access.

## Chosen design and rejected alternatives

Use one native React surface backed by typed Desktop API commands. Do not use an iframe `postMessage` bridge: it preserves two UI runtimes and leaves security, refresh, and error semantics split. Do not regenerate static HTML from disk: it cannot provide safe live approval or concurrent Agent updates. Do not add separate local-import tools with a second persistence path: all bytes must enter the existing candidate state machine.

The Agent-facing source contract should be one new `import_art_images` tool for local sources while retaining `collect_art_images` for web discovery. Its model input contains only selectors:

```ts
type ImportArtImagesInput = {
  query: string
  sources: Array<
    | { kind: "turn_attachment"; index: number }
    | { kind: "project_file"; relativePath: string }
  >
}
```

`sessionId` and `projectId` come only from `CreatXToolExecutionContext`. Attachment indices resolve only against the active admitted turn for that session. Project paths resolve only inside the active project through `ProjectFileQueryPort`; the model never supplies an absolute path.

### Task 1: Promote the accepted product and acceptance rules

**Files:**
- Modify: `docs/capabilities/art-library/product-spec.md`
- Modify: `docs/capabilities/art-library/acceptance.md`
- Modify: `docs/capabilities/art-library/README.md`
- Reference: `docs/discussions/2026-08-10-art-library-formalization.md`

**Steps:**
1. Add `ART-018` for trusted current-turn attachment collection and `ART-019` for trusted current-project image collection.
2. Add `ART-020` requiring byte-copy semantics, shared validation/deduplication, and zero mutation of source files.
3. Add `ART-021` requiring the production UI to read the Runtime snapshot and forbidding `localStorage` as workflow authority.
4. Add `ART-022` for ID-based read-only image delivery and no Renderer absolute paths.
5. Add acceptance cases for success, duplicate bytes, changed/missing source, personal-session project rejection, cancellation, restart, concurrent tool/UI updates, and traversal attempts.
6. Run `git diff --check` from the repository root; expect exit code 0.
7. Commit only the specification batch: `git commit -m "docs(art-library): specify local image collection"`.

### Task 2: Restore a green dependency baseline before feature work

**Files:**
- Verify only: `creatx/bun.lock`
- Verify only: `creatx/package.json`

**Steps:**
1. From `creatx/`, run `bun install --frozen-lockfile`; expect no lockfile diff and `@cline/sdk@0.0.65` installed.
2. Run `bun test packages/art-library-runtime/tests/art-library-runtime.test.ts`; record the exact existing count and require all tests to pass.
3. Run `bun run typecheck`; expect exit code 0.
4. Run `git status --short`; stop if installation changed tracked dependency files or if baseline tests fail for a production reason.

### Task 3: Generalize candidate source records without breaking existing files

**Files:**
- Modify: `creatx/packages/art-library-runtime/src/schema.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Write failing decode tests for all existing seed/web `schemaVersion: 1` records and new optional source provenance fields.
2. Define backward-compatible optional fields rather than rewriting 63 existing items:

```ts
interface ArtSourceRecord {
  pageUrl: string
  imageUrl: string
  pageTitle?: string
  platform?: string
  kind?: "web" | "chat-attachment" | "project-file" | "seed"
  displayName?: string
  projectRelativePath?: string
}
```

3. Keep `pageUrl` and `imageUrl` for schema compatibility. For local sources write non-resolvable identifiers such as `creatx-chat://<session>/<index>` and `creatx-project://<project>/<encoded-relative-path>`; never write an absolute path.
4. Extract the existing candidate write transaction into one reusable `ingestBytes` boundary that performs image inspection, hash deduplication, `.partial` cleanup, record writing, and atomic rename.
5. Route web collection through `ingestBytes` without changing its observable results.
6. Test identical bytes from web/local sources return the existing ID and create no copy.
7. Run the targeted art-library test; expect all cases to pass.
8. Commit: `git commit -m "refactor(art-library): unify candidate ingestion"`.

### Task 4: Add trusted project-image ingestion

**Files:**
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Modify: `creatx/packages/art-library-runtime/src/tools.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`
- Test: `creatx/packages/project-files/tests/project-files.test.ts`

**Steps:**
1. Write failing tests for exact project-relative lookup, supported image bytes, missing file, non-image file, traversal, personal session without `projectId`, duplicate bytes, and source unchanged after import.
2. Inject the narrow existing `ProjectFileQueryPort` into the art-library source gateway; do not import project-files internals into the Runtime.
3. Resolve `relativePath` against `refreshProject(context.projectId)`, require `kind === "image"`, and read bytes through `readBytes`.
4. Call `ingestBytes` with trusted project provenance and copy bytes into `incoming`; never rename or write the project file.
5. Add `project_file` to `import_art_images`; fail closed when trusted `context.projectId` is absent.
6. Re-read and hash the project source after the test import to prove zero mutation.
7. Run the two targeted test files; expect all cases to pass.
8. Commit: `git commit -m "feat(art-library): collect project images"`.

### Task 5: Snapshot current-turn chat images safely

**Files:**
- Modify: `creatx/apps/desktop/src/attachments.ts`
- Create: `creatx/apps/desktop/src/art-turn-sources.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/packages/art-library-runtime/src/tools.ts`
- Test: `creatx/apps/desktop/tests/attachments.test.ts`
- Create: `creatx/apps/desktop/tests/art-turn-sources.test.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Write failing tests that one attachment read produces both the Cline image payload and an immutable same-byte snapshot; changing/deleting the source afterward must not change imported bytes.
2. Make attachment resolution return trusted image snapshots with index, display name, media type, bytes, and SHA-256 while preserving the current `userImages` result.
3. Store snapshots by `sessionId` for only the active admitted turn. Enforce the existing 10 MiB per-image and 20 MiB batch limits; reject a second active turn for the same session.
4. Clear snapshots on completed, failed, cancelled, rejected admission, application shutdown, and session deletion. Do not persist them into chat history or a second attachment database.
5. Resolve `turn_attachment` only by trusted `context.sessionId` plus bounded index, then call `ingestBytes`.
6. Test cancellation before import leaves no candidate, successful import survives snapshot cleanup, duplicate bytes remain one item, and another session cannot access the snapshot.
7. Run the three targeted test files; expect all cases to pass.
8. Commit: `git commit -m "feat(art-library): collect chat images"`.

### Task 6: Expose a real read/write Desktop contract

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Create: `creatx/apps/desktop/src/art-library-asset-protocol.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/apps/desktop/src/preload.ts`
- Create: `creatx/apps/desktop/tests/art-library-asset-protocol.test.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Write failing tests for a snapshot containing category/item summaries, approval metadata, incoming counts, stable IDs, and ID-based image URLs with no absolute path.
2. Add typed `readArtLibrary`, `reviewArtApproval`, and `exportArtStyleKeywords` API methods plus an `art_library.changed` event.
3. Implement a read-only `creatx-art-library://item/<id>/original` protocol that resolves IDs through `ArtLibraryService`, verifies containment and current SHA-256, and returns the recorded MIME type.
4. Reject unknown IDs, malformed paths, directories, metadata files, traversal, and hash-changed originals.
5. Have both successful Agent tools and direct human UI commands emit `art_library.changed`; failed and `hold` operations must not report a mutation.
6. Treat a direct UI approve/reject click as the explicit human decision. Keep Agent `review_art_approval` calls under native Tool Policy approval.
7. Run contracts, Runtime, protocol, and import-boundary tests; expect all to pass.
8. Commit: `git commit -m "feat(desktop): expose real art library"`.

### Task 7: Replace the static production iframe with the real React surface

**Files:**
- Replace: `creatx/apps/desktop/renderer/src/ArtLibraryPage.tsx`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`
- Create: `creatx/apps/desktop/renderer/tests/art-library-page.test.tsx`
- Modify: `creatx/apps/desktop/renderer/preview/PreviewApp.tsx`
- Preserve as seed-only: `creatx/apps/art-library/public/art-library/*`

**Steps:**
1. Write failing Renderer tests for loading, empty, error, approval, category, item detail, export, refresh-event, and rejected confirmation states.
2. Render `ArtLibrarySnapshot` directly. The top level must expose “待审批” plus real categories; do not assume exactly three permanent categories.
3. Show original image, AI analysis, source display, suggested category, editable title/category/tag fields, and explicit approve/reject/hold actions.
4. Require confirmation before reject. Disable repeat submission while pending and show the exact Runtime error category instead of a generic failure.
5. Implement keyword export as deterministic text returned by Main; copying to clipboard is a UI action and must not invoke a Provider.
6. Subscribe to `art_library.changed` and refresh once per revision. Preserve selection when the item still exists; otherwise return to the containing list.
7. Remove `localStorage` and iframe use from the production path. Keep bundled static assets only for seed migration/evidence until a later cleanup batch.
8. Run Renderer tests; expect all cases to pass.
9. Commit: `git commit -m "feat(desktop): render real art library"`.

### Task 8: Verify real workflows, failure paths, and restart persistence

**Files:**
- Create: `creatx/scripts/electron-art-library-test.ts`
- Modify: `docs/capabilities/art-library/acceptance.md`
- Modify: `docs/capabilities/art-library/README.md`
- Modify: `CONTEXT.md`
- Create: `docs/baseline/creatx-art-library-formalization-2026-08-10.md`

**Steps:**
1. Use an isolated copied Profile and real temporary project; never mutate the formal Profile during automated acceptance.
2. In Electron, send one real PNG/JPEG attachment and ask the configured visual model to collect it. Require one tool import, one visual read, complete metadata, and one approval entry.
3. Ask the same ordinary project conversation to collect one real project image. Require the same candidate pipeline and prove the project file hash is unchanged.
4. Approve one item into an existing category, approve one into a new category, reject one, restart Electron, and verify exact directory states and UI projections.
5. Verify duplicate bytes across attachment/project/web create one identity; cancellation and model-without-vision fail closed with no approval entry.
6. Verify the Renderer never receives an absolute path and cannot fetch metadata or another filesystem path through the asset protocol.
7. Run from `creatx/`: targeted tests, `bun run typecheck`, `bun run test:imports`, `bun test`, `bun run build`, `bun run test:desktop`, and the new Electron acceptance script. Run full tests once after code freeze.
8. Call an external visual Provider only when a real configured profile is available. If unavailable, record the chain as structurally verified but not Visual Live（视觉真实运行）.
9. Record exact commands, counts, Profile boundary, Provider identity class, known failures, and the recovery commit in the baseline and `CONTEXT.md`.
10. Review `git diff --check`, `git diff --stat`, `git status --short`, and staged content before the final semantic commit.

## Completion criteria

The batch is complete only when a user can, from an ordinary conversation, collect the current-turn image or a current-project image; the exact copied bytes appear in `incoming`, AI-produced complete metadata moves them to `approval`, the real desktop approval page changes the filesystem state, restart restores the same view, and exported style words come only from approved item tags. A passing unit test without the real Electron path is not completion.

## Release boundary

Do not package or call the feature released in this batch unless the user separately authorizes a Windows release. Packaging requires the normal version bump, Production Build（生产构建）, NSIS/Portable generation, archive integrity checks, isolated packaged-app smoke, and explicit unsigned-binary disclosure.
