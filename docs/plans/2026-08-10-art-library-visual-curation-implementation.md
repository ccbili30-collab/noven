# Art Library Visual Curation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade each newly curated artwork to a real single-image interpretation, editable three-group tags, and reusable four-layer reverse Prompt, then expose evidence-based classification, on-demand library/personal style extraction, complete human review, and a safe reset of 63 legacy seed metadata records without changing the existing file workflow.

**Architecture:** Keep `incoming → approval → libraries` and the sole Cline Harness unchanged. Introduce metadata schema v2 as the only authority for new curation while retaining read compatibility for non-seed v1 user items; enrich existing application tools instead of adding an Art Agent. Reset bundled seed results through an idempotent, seed-identity-checked migration that preserves verified original bytes and re-creates ordinary incoming candidates.

**Tech Stack:** TypeScript, Bun test, Electron Main/Preload/Renderer, React, Cline SDK `0.0.65`, JSON files under the existing `ArtLibraryService` write owner.

---

## Scope and stop conditions

- Work serially in the existing `art-library-live` worktree. Do not use another Agent or run competing builds.
- Do not modify the formal Profile, package Windows, add another Harness, or create a dedicated Art Agent.
- Do not change the authority of directory states or let Renderer/model contracts receive absolute paths.
- Stop before any destructive seed operation unless all source assets, expected IDs, image hashes, and seed ownership are verified in an isolated Profile.
- Stop if schema v2 requires silently rewriting a non-seed v1 item or if quality would be represented by a string-length heuristic.

### Task 1: Add metadata schema v2 without rewriting non-seed v1 items

**Files:**
- Modify: `creatx/packages/art-library-runtime/src/schema.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Modify: `creatx/packages/contracts/src/index.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Step 1: Write failing schema tests**

Add cases proving that a new submission requires this authority:

```ts
{
  schemaVersion: 2,
  curationMethod: "visual-curation-v1",
  styleAnalysis: "...three image-specific observations...",
  patternTags: ["粗颗粒纸面", "硬边块面"],
  compositionTags: ["低机位", "右侧留白"],
  moodTags: ["由冷色和压缩空间支持的紧张感"],
  reversePrompt: {
    style: "opaque gouache-like rendering...",
    composition: "wide frame, low viewpoint...",
    scene: "two maintenance workers beside a sealed gate...",
    negative: ["glossy 3D render", "centered portrait", "logo", "watermark", "garbled text"],
  },
}
```

Also prove that `decodeArtItemMetadata` still reads a non-seed v1 record as legacy, while new submission rejects `promptDraft`, missing four-layer fields, unknown fields, and direct reuse of the submitted title or non-placeholder artist name inside reverse Prompt text.

**Step 2: Run the failing tests**

Run from `creatx/`:

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "schema v2|legacy v1"
```

Expected: FAIL because schema v2 and `reversePrompt` do not exist.

**Step 3: Implement the smallest versioned contract**

Define `ArtReversePrompt`, `ArtItemMetadataV1`, `ArtItemMetadataV2`, and `ArtItemMetadata` as a discriminated union. `requireArtItemMetadata` creates only v2; `decodeArtItemMetadata` strictly decodes either version. Do not generate `promptDraft` or `negativeTags` for v2. Project v1 as `curationStatus: "legacy-unverified"`, v2 as `curationStatus: "current"` with `reversePrompt`.

**Step 4: Verify Task 1**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "schema v2|legacy v1|moves complete entries|projects real approval"
bun run typecheck
```

Expected: all selected tests and typecheck PASS.

**Step 5: Commit**

```powershell
git add -- creatx/packages/art-library-runtime/src/schema.ts creatx/packages/art-library-runtime/src/service.ts creatx/packages/contracts/src/index.ts creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts
git commit -m "feat(art-library): version visual curation metadata"
```

### Task 2: Make the Agent perform one real-image curation at a time

**Files:**
- Create: `creatx/packages/art-library-runtime/src/visual-curation.ts`
- Modify: `creatx/packages/art-library-runtime/src/index.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Modify: `creatx/packages/art-library-runtime/src/tools.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Step 1: Write failing tool-contract tests**

Assert that `read_art_images` and `submit_art_approval` accept exactly one candidate/item, schema metadata requires the three outputs, and the tool description contains the single authoritative method: observe visible facts, write human interpretation, create three tag groups, create `STYLE / COMPOSITION / SCENE / NEGATIVE`, compare categories, submit to approval, never approve.

**Step 2: Run the failing tests**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "single-image visual curation"
```

Expected: FAIL because both tools still allow one to four items and advertise the old fields.

**Step 3: Implement one method authority**

Export one `ART_VISUAL_CURATION_METHOD` constant from `visual-curation.ts`; reuse it in tool descriptions. Change both JSON schemas to `minItems: 1, maxItems: 1`, require v2 fields, retain real visual-model failure closure, and do not create a local fallback analysis.

**Step 4: Verify Task 2**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "single-image visual curation|fails closed for non-vision"
bun run typecheck
bun run test:imports
```

Expected: all selected tests, typecheck, and both import boundaries PASS.

**Step 5: Commit**

```powershell
git add -- docs/plans/2026-08-10-art-library-visual-curation-implementation.md creatx/packages/art-library-runtime/src/visual-curation.ts creatx/packages/art-library-runtime/src/index.ts creatx/packages/art-library-runtime/src/service.ts creatx/packages/art-library-runtime/src/tools.ts creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts
git commit -m "feat(art-library): enforce single-image curation"
```

### Task 3: Give classification and style extraction real current-library evidence

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Modify: `creatx/packages/art-library-runtime/src/tools.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Step 1: Write failing evidence tests**

Create two categories with overlapping subject matter but different form/composition tags. Assert that `inspect_art_library` returns for each category:

- all current tag frequencies split by the three groups;
- two to four deterministic representative summaries selected to cover the category's tag vocabulary;
- no absolute path, original bytes, stale generated profile, title-only classification hint, or approval item.

Also assert a personal scope aggregates every approved category while a named scope contains only that category. Empty/missing scopes return explicit empty or missing results, never invented summaries.

**Step 2: Run the failing tests**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "classification evidence|style extraction materials"
```

Expected: FAIL because `snapshot()` only returns names/counts.

**Step 3: Implement bounded evidence projections**

Add optional `scope: { kind: "all" } | { kind: "library"; title: string }` to `inspect_art_library`. Count normalized keywords without discarding frequency. Select at most four approved representatives with deterministic greedy tag-coverage and stable ID tie-breaking; return their IDs, titles, `styleAnalysis`, tags, and curation status, never paths or image bytes. The current conversation model synthesizes the requested library/personal interpretation and four-layer Prompt; Runtime does not call a Provider or persist the generated conclusion.

Keep `export_art_style_keywords` unchanged and deterministic.

**Step 4: Verify Task 3**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "classification evidence|style extraction materials|exports first-seen"
bun run typecheck
```

Expected: all selected tests and typecheck PASS.

**Step 5: Commit**

```powershell
git add -- creatx/packages/contracts/src/index.ts creatx/packages/art-library-runtime/src/service.ts creatx/packages/art-library-runtime/src/tools.ts creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts
git commit -m "feat(art-library): expose style evidence"
```

### Task 4: Let human approval edit every curated result

**Files:**
- Modify: `creatx/packages/contracts/src/index.ts`
- Modify: `creatx/packages/art-library-runtime/src/service.ts`
- Modify: `creatx/packages/art-library-runtime/src/tools.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`
- Test: add a narrow exported validator test only if Main command validation cannot be exercised without booting Electron

**Step 1: Write failing approval-edit tests**

Submit one v2 approval item, then approve with edits for `title`, `styleAnalysis`, `palette`, all three tag groups, all four reverse Prompt layers, and target category. Assert exact persisted metadata and unchanged original SHA-256. Add failure cases for unknown fields, malformed colors/tags, missing Prompt layers, and invalid target; assert zero movement.

**Step 2: Run the failing tests**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "edits complete visual curation"
```

Expected: FAIL because the current review path accepts only title and three tag groups.

**Step 3: Implement one shared review edit contract**

Expand `ReviewArtApprovalCommand` and the service review input. Rebuild v2 metadata through the schema validator before rename. Make Main validate and reconstruct only allowed fields; do not cast arbitrary Renderer objects into metadata. Keep hold/reject/idempotency behavior unchanged.

**Step 4: Verify Task 4**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "edits complete visual curation|holds without mutation|emits monotonic"
bun run typecheck
git diff --check
```

Expected: all selected tests, typecheck, and diff check PASS.

**Step 5: Commit**

```powershell
git add -- creatx/packages/contracts/src/index.ts creatx/packages/art-library-runtime/src/service.ts creatx/packages/art-library-runtime/src/tools.ts creatx/apps/desktop/src/main.ts creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts
git commit -m "feat(art-library): edit complete approval metadata"
```

### Task 5: Reset only the 63 verified bundled seed results into incoming candidates

**Files:**
- Replace behavior in: `creatx/packages/art-library-runtime/src/seed.ts`
- Modify: `creatx/apps/desktop/src/main.ts`
- Test: `creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts`

**Step 1: Write failing isolated migration tests**

Use a copied seed fixture and temporary library root. Cover:

- exactly 57 approved plus 6 approval seed records become 63 ordinary incoming candidates;
- every candidate ID equals the verified original SHA-256 prefix and keeps only source/image candidate facts;
- old `styleAnalysis`, tags, prompt, category and artist-derived content are absent;
- a second run is idempotent;
- non-seed approved/approval/incoming items are byte-identical;
- missing seed ownership, count mismatch, unreadable source, hash mismatch, partial old state, or duplicate conflicting bytes fails before destructive deletion;
- interruption after verified deletion can retry from bundled source without losing originals.

**Step 2: Run the failing tests**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "resets bundled seeds"
```

Expected: FAIL because current import writes legacy metadata directly to approval/libraries.

**Step 3: Implement fail-closed reset**

Before mutation, decode all 63 bundled asset references, inspect every image, calculate hashes/IDs, and verify all existing targeted records carry the expected `seed` marker. Then remove only those exact seed directories, preserve/recreate non-seed category directories as required, and ingest verified originals as `source.kind: "seed"` candidates under one migration batch. Write a new marker only after all candidates exist; retries reconcile by ID and bytes. Do not reuse any old descriptive metadata.

**Step 4: Verify Task 5**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts --test-name-pattern "resets bundled seeds|collects valid|ingests trusted bytes"
bun run typecheck
git diff --check
```

Expected: all selected tests, typecheck, and diff check PASS using temporary roots only.

**Step 5: Commit**

```powershell
git add -- creatx/packages/art-library-runtime/src/seed.ts creatx/apps/desktop/src/main.ts creatx/packages/art-library-runtime/tests/art-library-runtime.test.ts
git commit -m "feat(art-library): reset legacy seed curation"
```

### Task 6: Render the real approval and library surface with v2 editing

**Files:**
- Replace: `creatx/apps/desktop/renderer/src/ArtLibraryPage.tsx`
- Modify: `creatx/apps/desktop/renderer/src/App.tsx`
- Modify: `creatx/apps/desktop/renderer/src/WorkspaceShell.tsx`
- Modify: `creatx/apps/desktop/renderer/src/worldbuilder-production.css`
- Create: `creatx/apps/desktop/renderer/tests/art-library-page.test.tsx`
- Modify: `creatx/apps/desktop/renderer/preview/PreviewApp.tsx`

**Step 1: Write failing Renderer tests**

Cover loading, empty, exact Runtime error, approval list, category list, item detail, v2/legacy status, editable interpretation/palette/tags/four Prompt layers/category/title, reject confirmation, hold, disabled repeat submission, deterministic keyword export, and one refresh per `art_library.changed` revision. Assert no iframe or `localStorage` authority.

**Step 2: Run the failing tests**

```powershell
bun test apps/desktop/renderer/tests/art-library-page.test.tsx
```

Expected: FAIL because production still renders the static surface.

**Step 3: Implement the real React surface**

Render `ArtLibrarySnapshot` and `creatx-art-library://` images directly. Use chips for three editable tag groups, textarea/editor fields for interpretation and four Prompt layers, palette controls, explicit approve/reject/hold, and separate “导出关键词” guidance from conversational “提取风格”. Preserve selected item when still present after a revision; otherwise return to its containing list.

**Step 4: Verify Task 6**

```powershell
bun test apps/desktop/renderer/tests/art-library-page.test.tsx
bun test apps/desktop/renderer/tests
bun run typecheck
bun run build
```

Expected: Renderer tests, full Renderer suite, typecheck, and Production Build PASS.

**Step 5: Commit**

```powershell
git add -- creatx/apps/desktop/renderer/src/ArtLibraryPage.tsx creatx/apps/desktop/renderer/src/App.tsx creatx/apps/desktop/renderer/src/WorkspaceShell.tsx creatx/apps/desktop/renderer/src/worldbuilder-production.css creatx/apps/desktop/renderer/tests/art-library-page.test.tsx creatx/apps/desktop/renderer/preview/PreviewApp.tsx
git commit -m "feat(desktop): curate real art approvals"
```

### Task 7: Verify persistence, migration, real Provider flow, and sampled reverse-Prompt quality

**Files:**
- Create: `creatx/scripts/electron-art-library-test.ts`
- Create: `creatx/scripts/art-library-visual-quality-sample.ts` only if the existing image task path cannot drive the sample without a script
- Modify: `docs/capabilities/art-library/acceptance.md`
- Modify: `docs/capabilities/art-library/README.md`
- Modify: `CONTEXT.md`
- Create: `docs/baseline/creatx-art-library-visual-curation-2026-08-10.md`

**Step 1: Freeze code and run targeted verification**

```powershell
bun test packages/art-library-runtime/tests/art-library-runtime.test.ts apps/desktop/tests/art-library-asset-protocol.test.ts apps/desktop/tests/attachments.test.ts apps/desktop/tests/art-turn-sources.test.ts apps/desktop/renderer/tests/art-library-page.test.tsx
bun run typecheck
bun run test:imports
```

Expected: all targeted tests, typecheck, and import boundaries PASS.

**Step 2: Run isolated Electron acceptance**

Use an isolated copied Profile and temporary project. Verify attachment/project/web intake, one-image reads, v2 submission, complete human edits, approve/reject/hold, category evidence, deterministic keyword export, current-label style-material scope, restart persistence, constrained image URLs, and the 63-seed reset. Assert the formal Profile hash/mtime boundary remains unchanged and no test process survives.

**Step 3: Run one real visual sample when configured**

With a real configured visual text Provider, curate one new image. Remove the original from the generation request, replace only `SCENE`, generate a different scene through the configured image Provider, and record human visual judgment. If either Provider is unavailable, record structural verification only and leave `ACC-ART-025/026/032` not Live.

**Step 4: Run full verification once after code freeze**

```powershell
bun test
bun run typecheck
bun run test:imports
bun run build
bun run test:desktop
git diff --check
```

Expected: all commands PASS, or the first unrelated failure is diagnosed and recorded without expanding this batch. Do not package Windows.

**Step 5: Record evidence and commit**

Update acceptance, capability status, baseline, and `CONTEXT.md` with exact counts, Provider classes, Profile boundary, visual sample result, known failures, and recovery commit.

```powershell
git add -- creatx/scripts/electron-art-library-test.ts creatx/scripts/art-library-visual-quality-sample.ts docs/capabilities/art-library/acceptance.md docs/capabilities/art-library/README.md CONTEXT.md docs/baseline/creatx-art-library-visual-curation-2026-08-10.md
git commit -m "test(art-library): verify visual curation workflow"
```

Do not stage a script path that was not needed or created.

## Completion boundary

The batch is complete only when a real ordinary conversation reads one image at a time, submits v2 interpretation/tags/four-layer Prompt, a human can edit every requested field before approval, category/personal style extraction reads current approved tag evidence without persisting a stale profile, 63 legacy seed descriptions are gone while verified originals are recoverable as candidates, restart preserves the exact state, and the visual sample result is honestly recorded. Unit tests alone do not prove reverse-Prompt quality.
