# Personal Art Library Tools Implementation Plan

> **For Codex:** Use the current-session Code workflow to implement this plan serially. Do not delegate, modify the production frontend, or write to `D:\CodexW\my-art`.

**Goal:** Build one global personal art-library capability that any ordinary Cline conversation can use to collect public images, submit complete approval entries, approve or reject them, and export deduplicated style keywords.

**Architecture:** Add `@creatx/art-library-runtime` as the sole owner of a Main-process application-data root. It contributes narrowly scoped CreatX tools through the existing Cline Adapter; the Adapter continues to own model execution and approvals. Directory location owns workflow state, downloaded bytes and per-item JSON own content facts, and the existing static Art Atlas is a one-time bundled migration input.

**Tech Stack:** TypeScript, Bun workspaces/tests, Node filesystem/crypto/dns/fetch APIs, Cline SDK `0.0.65` neutral tools, Electron Main Process.

---

### Task 1: Establish runtime contracts and directory invariants

**Files:**
- Create: `creatx/packages/art-library-runtime/package.json`
- Create: `creatx/packages/art-library-runtime/src/index.ts`
- Create: `creatx/packages/art-library-runtime/src/schema.ts`
- Create: `creatx/packages/art-library-runtime/src/image.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Write failing tests for safe category names, item validation, supported image signatures/dimensions, exact-root path containment and duplicate SHA-256 discovery.
2. Run `bun test packages/art-library-runtime/tests/art-library-runtime.test.ts` from `creatx/` and verify failures name the missing exports.
3. Implement the smallest schemas, parsers and filesystem service needed by the tests. Do not add a database or generic repository abstraction.
4. Re-run the targeted test and require all cases to pass.

### Task 2: Implement bounded public-web collection

**Files:**
- Create: `creatx/packages/art-library-runtime/src/network.ts`
- Create: `creatx/packages/art-library-runtime/src/collection.ts`
- Modify: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Add failing tests for direct pages, Bing RSS discovery, relative/OpenGraph image URLs, redirect validation, public-host enforcement, response limits, partial success, duplicate bytes and cancellation.
2. Implement manual redirect handling with per-hop public-target checks, bounded body reads, deterministic candidate ordering and `.partial` cleanup.
3. Download valid candidates into `incoming/<batch-id>/<candidate-id>` and return structured success/skip/failure evidence.
4. Re-run the targeted tests. Stop if private-network requests can reach injected transport or incomplete files survive.

### Task 3: Implement multimodal review and approval lifecycle

**Files:**
- Create: `creatx/packages/art-library-runtime/src/tools.ts`
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/cline-adapter/src/index.ts`
- Modify: `creatx/packages/cline-adapter/tests/projection.test.ts`
- Modify: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Add failing tests that a non-vision model cannot read candidates and a vision model receives at most four real image content blocks.
2. Pass the trusted `modelSupportsImages` capability from Cline tool context into `CreatXToolExecutionContext`; do not accept it from model input.
3. Implement `collect_art_images`, `read_art_images`, `submit_art_approval`, `review_art_approval`, and `export_art_style_keywords` with separate approval policies.
4. Test missing metadata, exact retry, conflicting replay, new category creation, reject deletion, hold zero-write and deterministic keyword export.

### Task 4: Migrate bundled static content and integrate Main

**Files:**
- Create: `creatx/packages/art-library-runtime/src/seed.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Modify: `creatx/package.json`
- Modify: `creatx/tsconfig.json`
- Modify: `creatx/packages/art-library-runtime/package.json`
- Modify: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Steps:**
1. Add a minimal seed fixture test covering approved works, pending works, missing bundled files and idempotent replay.
2. Implement the static snapshot adapter without importing or reading `D:\CodexW\my-art`.
3. Initialize the service under `app.getPath("userData")/creatx/art-library`, resolve only bundled seed candidates, and add its tools/guidance to `ClineAdapter.create`.
4. Verify Application scope makes the tools available in personal and project sessions while Growth worker profiles remain unchanged.

### Task 5: Verify and record the batch

**Files:**
- Modify: `docs/capabilities/art-library/*.md`
- Modify: `CONTEXT.md`
- Create: `docs/baseline/creatx-art-library-tools-2026-08-08.md`

**Steps:**
1. Run the art-library package tests and directly affected Adapter policy tests.
2. Run `bun run typecheck`, `bun run test:imports`, `bun test`, `bun run build`, and `git diff --check` from `creatx/`, diagnosing each first failure before any retry.
3. Run one bounded real public-page collection probe in an isolated temporary root; remove only that verified temporary root afterward.
4. Do not claim visual recognition Live without a configured vision Provider. Record exact counts, commands, failures, static migration status and the unconnected frontend boundary.
5. Review `git diff --stat`, `git diff`, and `git status --short`; do not stage or commit without an explicit user request.
