---
name: creatx-build-world-constellation
description: Read a CreatX Growth World Pro project, frozen world blueprint, or materialized world relationship index and generate an interactive twelve-layer world constellation sphere backed by real project files. Use when asked to build, rebuild, or preview a 世界关系球、世界星图、星座球 or interactive world graph from an existing CreatX world; do not use it to invent a new world or install a Codex skill.
---

# Build World Constellation

Generate the viewer through the bundled script. Do not reconstruct paths, relationships, or viewer files by hand.

## Workflow

1. Identify the CreatX project root. Accept a world root when the project contains more than one world.
2. Read [references/input-contract.md](references/input-contract.md) when input discovery, fallback behavior, or failure handling matters.
3. Run:

```powershell
node "<skill-directory>\scripts\build-world-constellation.mjs" `
  --project-root "D:\path\to\project"
```

Add `--world-root "worlds\世界名"` when the project contains multiple worlds. Add `--goal-id "goal_..."` only to select a specific Growth Goal. Add `--output "D:\path\to\output"` to override the default `<world-root>\世界关系球` directory.

4. Read the JSON summary printed by the script. Report the selected source, counts, missing documents, degradation state, and output path exactly as returned.
5. Preview through a local HTTP server because the Prototype（原型）loads Globe.GL from a pinned CDN URL:

```powershell
python -m http.server 4187 --directory "<output-directory>"
```

6. Treat `index.html` as the generated entry point. Do not claim a CreatX workbench was registered unless a separate production tool actually completed that action.

## Required behavior

- Prefer a valid materialized `relations.json` over blueprint-only data.
- Permit blueprint-only generation as an explicitly degraded, low-density view with no invented facts.
- Preserve relation types and reasons. Never rename references or adoption links to causality.
- Embed only text read from real project files. List missing files instead of fabricating content.
- Never write into `.creatx`.
- Refuse to overwrite a directory that is not marked as this Skill's output.
- Stop on malformed selected input, ambiguous worlds, path escape, or an unsafe output target.
- State that the generated Prototype requires network access and is not production Renderer or Live（真实运行）evidence.

## Scope boundary

Do not create new world content, modify blueprints, register production Skills, change CreatX protocols, install dependencies, or write to a user's Codex Skill directory.
