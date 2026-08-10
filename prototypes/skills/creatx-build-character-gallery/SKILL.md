---
name: creatx-build-character-gallery
description: Read an existing CreatX world, frozen blueprint, or materialized world project and generate a cinematic multi-character gallery with individual character-bible HTML pages. Use when asked to create、展示、重建 or preview 世界著名人物、主要角色群像、角色圣经工作台、人物画廊 or a cast showcase from an existing world; generate several famous figures plus one genuinely ordinary person, and do not install this Prototype into Codex.
---

# Build Character Gallery

Build a world cast rather than a single isolated portrait. Reuse the bundled cinematic viewer instead of redesigning HTML for every character.

## Workflow

1. Identify the world root. Read the actual character, faction, region, conflict, visual-style, relationship, and world-baseline files that can support character selection.
2. Select six people by default:
   - Five notable figures whose actions, authority, knowledge, conflict, or symbolic role materially affect the world.
   - One ordinary person whose work and daily stakes reveal what the world feels like at human scale.
3. Keep the ordinary person ordinary. Do not turn them into a secret heir, chosen one, hidden archmage, decisive commander, or universal witness.
4. Give every character one legible visual hook. A notable figure must lead with beauty, authority, uncanniness, danger, or sacred presence. The ordinary person may lead with memorable human specificity. Never accept a generic background-extra face for a featured page.
5. Separate project fact from `derived` interpretation and `created` expansion. Preserve `sourcePaths` for every character; never present invented biography as quoted source.
6. Route all portraits through the project's existing image queue so the project visual master is injected centrally. Do not bypass the queue or manually duplicate a style block already injected by it. Use a vertical full-body key-art composition without text, watermark, modern objects, or accidental weapon/royalty/magic drift.
7. Read [references/manifest-contract.md](references/manifest-contract.md), write the UTF-8 manifest beside the portrait assets, then run:

```powershell
node "<skill-directory>\scripts\build-character-gallery.mjs" `
  --manifest "D:\path\to\character-gallery-manifest.json" `
  --output "D:\path\to\人物群像"
```

8. Read the JSON summary. Report notable/ordinary counts, evidence-status counts, visual-hook distribution, output path, and any warning exactly.
9. Preview `<output>\index.html`. Do not claim a CreatX workbench was registered unless a separate production tool completed registration.

## Selection rules

- Prefer characters already named and supported across several world files.
- Cover different social functions; do not return five rulers or five fighters.
- Include at least one person connected to the world's current conflict and at least one person who preserves, interprets, contests, or transmits knowledge.
- Avoid six near-identical silhouettes. Vary age, origin, profession, body language, costume structure, and visual-hook category while preserving one project-level art direction.
- Beauty is a character-facing default, not mandatory glamour. Translate attractiveness into the role: severe beauty, commanding presence, dangerous elegance, sacred otherness, weathered charisma, or human warmth.
- The ordinary person still needs a memorable face, occupation, possession, and local relationship, but their decisions must remain proportionate to ordinary life.

## Finished-page contract

- Generate one clean gallery index and one cinematic character-bible page per person.
- Let the portrait dominate the first screen. Put name, identity, and one defining line over the image.
- Put profile, affiliation, relationships, and the six-part character bible below the hero.
- Generate no fixed sidebar, debug panel, permanent toolbar, prompt display, mask, schema dump, or visible JSON.
- Keep gallery and character pages usable from `file://`; do not require a framework, package installation, server, or CDN.
- Preserve responsive layouts for wide desktop, tall workbench windows, and phone-width previews.

## Failure boundaries

- Stop on ambiguous world roots, unsafe paths, malformed manifests, duplicate IDs, missing portraits, unsupported image types, fewer than four or more than six notable figures, or anything other than exactly one ordinary person.
- Refuse to overwrite an output directory not marked as this Skill's own output.
- Do not fabricate successful image generation, hide missing visual-style injection, or label created details as source facts.
- Do not write into `.creatx`, register production Skills, change Renderer code, install this Prototype in a user Skill directory, or start the novel/comic phase.
