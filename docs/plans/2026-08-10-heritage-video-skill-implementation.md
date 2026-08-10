# Heritage Video Skill Implementation Plan

> Implemented on 2026-08-10. Exact verification evidence and remaining boundaries are recorded in `docs/baseline/creatx-heritage-video-skill-2026-08-10.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Let a user send a verified transcript-backed heritage video to an ordinary conversation, have Cline synthesize a minimal Skill, and install it with native approval for use after restart.

**Architecture:** Keep Cline SDK `0.0.65` as the sole Agent Harness. A focused Desktop service owns fixed-host TED transcript extraction, minimal single-file Skill validation, atomic Learned Skills persistence, startup discovery, and two CreatX tools. Renderer only orders evidence-backed catalog items and reuses the existing share dialog to admit a normal message into the selected session.

**Tech Stack:** Electron, React 19, TypeScript, Bun test, Cline Skills, Undici `EnvHttpProxyAgent`.

---

### Task 1: Freeze transcript evidence and catalog ordering

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/heritage-library-catalog.v1.json`
- Modify: `creatx/apps/desktop/renderer/src/heritage-library-seeds.ts`
- Test: `creatx/apps/desktop/renderer/tests/heritage-library-seeds.test.ts`

1. Add failing assertions that the catalog remains 20 items and four categories of five, exactly four items have a verified TED transcript descriptor, and the first item in each category is learnable.
2. Run the catalog test and confirm it fails on the missing descriptor.
3. Replace one item per category with the four verified TED videos and add transcript metadata without hard-coding order in the page component.
4. Sort learnable entries first in `filterHeritageLibrarySeeds` while retaining search/category/platform behavior.
5. Run the catalog test and confirm it passes.

### Task 2: Build transcript and Learned Skill authority

**Files:**
- Create: `creatx/apps/desktop/src/heritage-skill-service.ts`
- Create: `creatx/apps/desktop/tests/heritage-skill-service.test.ts`

1. Write failing tests for a real-shaped TED `__NEXT_DATA__` fixture, empty/malformed transcript, unsupported host, response limit, cancellation, legal Skill install, idempotency, name conflict, traversal, malformed Frontmatter and startup discovery ignoring damaged folders.
2. Run the focused test and confirm the expected missing-module failure.
3. Implement fixed-host HTTPS validation, bounded redirect/fetch, JSON transcript extraction and normalized Cue output.
4. Implement strict single-file Skill validation and create-only atomic installation under `learned-skills/v1/<name>/SKILL.md`.
5. Expose automatic `read_heritage_video_transcript` and required-approval `install_heritage_skill` tools plus startup discovery.
6. Run the focused test and confirm all success and failure paths pass.

### Task 3: Connect startup and ordinary Cline sessions

**Files:**
- Modify: `creatx/apps/desktop/src/main.ts`
- Test: `creatx/apps/desktop/tests/heritage-skill-service.test.ts`

1. Add a failing composition assertion that valid Learned Skills extend both Cline skill directories and the ordinary-session allowlist.
2. Initialize the service before `ClineRuntimeClient.create`, add both tools, and merge discovered names/directories with built-ins.
3. Dispose the service's proxy dispatcher during the existing shutdown path without killing unrelated installed software.
4. Run the focused Main/service tests.

### Task 4: Replace the prototype button with the real conversation route

**Files:**
- Modify: `creatx/apps/desktop/renderer/src/HeritageLibraryPage.tsx`
- Modify: `creatx/apps/desktop/renderer/src/CreativeLibraryActions.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`
- Create: `creatx/apps/desktop/renderer/tests/heritage-video-skill.test.tsx`

1. Write failing Renderer tests for the learnable badge, disabled unsupported state, generated evidence-bound prompt, session picker, success close, and admission failure preservation.
2. Run the focused Renderer test and confirm it fails.
3. Export/reuse the existing virtualized `ShareDialog`; generate a prompt that mandates transcript-tool-first and approved install-tool-last behavior.
4. Send through the existing `onShare` admission path, remove the old prototype notice, and show the restart boundary in the detail copy.
5. Run the focused Renderer and existing share dialog tests.

### Task 5: Verify the bounded vertical path

**Files:**
- Create: `creatx/scripts/electron-heritage-video-skill-test.ts`
- Modify: `creatx/package.json`

1. Add a lightweight isolated Electron script using a local controlled Provider and local TED-shaped transcript endpoint injection; do not call a paid external Provider.
2. Verify one pinned item opens the session selector, admits one message to the chosen conversation, calls the transcript tool, exposes native approval for installation, writes one valid Skill after approval, and reports restart-required.
3. Verify a transcript-empty case leaves no Skill and shows a specific error.
4. Run focused tests, `bun run typecheck`, `bun run test:imports`, `bun run build`, the lightweight Electron test, then the frozen full test suite once.
5. Record exact counts, Provider boundary, Windows packaging boundary and recovery entry in a baseline document and `CONTEXT.md`; inspect staged files before committing.
