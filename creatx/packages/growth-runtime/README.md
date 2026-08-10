# Growth Runtime

This package owns the persisted CreatX Growth Goal product state and serial stage scheduling policy. It does not run models itself, copy Cline messages or Runs, execute Cline tools, or project Electron UI.

## Stable boundary

- Public commands and projections are defined by `@creatx/contracts`.
- `state.ts` is the sole automatic lifecycle transition authority.
- `schema.ts` is the sole SQLite schema and migration authority. V2 adds idempotent stage-report receipts; V3 adds the user-visible status reason.
- `store.ts` owns idempotent creation and reports, one unterminated Goal per project, optimistic versions, terminal-state protection, explicit user reopen, and atomic persistence failure handling.
- `progress.ts` owns `report_growth_progress`, trusted stage identity checks, artifact/image evidence validation, required-image completion gates, and the neutral evidence query port. It has no scheduler dependency.
- `scheduler.ts` owns one serial drain per Goal, bounded stage input, missing-report recovery, stagnation protection, and the neutral stage Runner and progress fingerprint Ports. It never imports Cline or creates a background Worker.

The database path is supplied by the future desktop persistence owner. Unknown schema versions and corrupt data fail closed; this package never replaces them with an empty database.

## Verification

From `creatx/`:

```powershell
bun test packages/growth-runtime/tests/state.test.ts
bun run test:growth-store
```

The first command covers the pure state algebra under Bun. The second uses Node's real `node:sqlite` implementation because Bun 1.3.14 does not resolve that built-in module.
