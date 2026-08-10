---
name: creatx-causality
description: Read an existing Noven or CreatX Growth World project and generate an offline interactive full-world causal graph containing only explicit causes relations with their recorded reasons. Use for /causality, 因果图、因果链、因果网络、世界自洽性检查, or when Growth needs to visualize upstream causes and downstream effects; do not infer causality from references, adoption, ownership, proximity, or co-occurrence.
---

# Build Full-world Causality

Generate the causal viewer through the bundled deterministic script. Do not reconstruct relationship files or viewer code by hand.

## Workflow

1. Identify the current project root. If the project contains several worlds, identify the requested `worlds/<世界名>` root.
2. Read [references/input-contract.md](references/input-contract.md) when source discovery, fallback, or failures matter.
3. Run:

```powershell
node "<skill-directory>\scripts\build-causality.mjs" `
  --project-root "D:\path\to\project"
```

Add `--world-root "worlds\世界名"` for a multi-world project. Add `--goal-id "goal_..."` only when the user selects a specific Growth Goal. Use `--output` only when the user explicitly requests another project-relative result directory.

4. Read the printed JSON summary. Report the selected source, causal work/fact counts, missing documents, degradation state, and output path exactly.
5. Open the generated `index.html`. Verify search, drag, zoom, and at least one visible directional causal chain. If the page fails, do not register it.
6. Call `register_workbench` for the generated `世界因果图` directory, then call `set_workbench_home` with `index.html`. Do not edit `.creatx` directly and do not claim registration unless both tools succeed.

## Causal boundary

- Include only relations whose stored type is exactly `causes`.
- Preserve every stored direction and reason. Never reverse a relation or replace its reason.
- Never promote references, adoption, support, ownership, location, similarity, or co-occurrence to causality.
- Prefer complete materialized relations. Allow a frozen blueprint as an explicitly degraded view without invented facts.
- Stop when there is no explicit causal relation, the selected source is malformed, worlds are ambiguous, paths escape the project, or the output is not owned by this Skill.
- Read only real project files. List missing documents instead of fabricating summaries.

## Product boundary

This is an experimental visualization of the AI's recorded causal understanding, not objective proof, a simulator, a graph editor, or a counterfactual engine. Do not modify world content, blueprints, Growth state, permissions, or Provider configuration.
