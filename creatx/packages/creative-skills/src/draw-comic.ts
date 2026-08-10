import { DRAW_COMIC_SKILL_NAME } from "./skill-names.ts"

export { DRAW_COMIC_SKILL_NAME } from "./skill-names.ts"

const DRAW_COMIC_SKILL_TEXT_FILES = {
  "agents/openai.yaml": `interface:
  display_name: "CreatX Draw Comic"
  short_description: "Adapt a readable story into visually continuous comic panels and deterministically lettered pages"
  default_prompt: "Use $creatx-draw-comic to adapt the selected story or accepted novel chapter into a readable comic with project-faithful art direction, panel continuity, separate lettering, and visual review."
`,
  "references/direction-contracts.md": `# Direction contracts

Use these contracts to keep decisions inspectable. Omit fields that add no decision value.

## Source and story contract

\`\`\`json
{
  "source": {
    "files": ["The exact project files being adapted"],
    "selection_reason": "Why this source can carry the requested comic",
    "adaptation_status": "direct chapter adaptation | bounded story bridge from non-narrative material"
  },
  "story_engine": {
    "protagonist": "Who acts",
    "immediate_goal": "What they must accomplish in this sequence",
    "obstacle": "Who or what actively prevents it",
    "stakes": "What becomes worse if they fail",
    "causal_sequence": ["Action or discovery", "Consequence", "Escalation"],
    "irreversible_turn": "The choice, reveal, loss, or commitment that changes the situation",
    "ending_hook": "Why the reader turns the page"
  }
}
\`\`\`

If the source cannot fill this contract, do not disguise a setting note or event inventory as a finished story. Write a bounded adaptation bridge first. Preserve canon facts, but add the minimum actions, opposition, and consequences needed for a readable sequence.

## Visual authority contract

Resolve visual authority in this order:

1. explicit user direction for this comic;
2. the nearest project \`视觉设定/统一画风.md\`;
3. accepted project character, costume, location, map, and material references;
4. culture, period, technology, climate, architecture, and material evidence in the selected story;
5. a bounded art-direction decision when the project is genuinely open.

\`\`\`json
{
  "world_identity": {
    "culture_and_period": "Observable canon, not a language-based guess",
    "technology_and_craft": "Allowed construction, transport, weapons, tools, and production methods",
    "architecture_and_costume": "Project-specific shapes, materials, and social boundaries",
    "forbidden_drift": ["Concrete visual cultures, periods, or technologies that would contradict the work"]
  },
  "visual_language": {
    "line_and_shape": "Weight, speed, silhouette, anatomy, and acting",
    "color_and_light": "Narrative color and physical light logic",
    "surface_and_medium": "Ink, paint, print, paper, or digital mark behavior",
    "space_and_detail": "Perspective, negative space, depth, and detail hierarchy"
  }
}
\`\`\`

Never infer Chinese, Japanese, Western, modern, or any other visual culture from the user's language, character-name spelling, the Agent's locale, or an image-model default. A Western-fantasy project must not silently acquire Chinese historical buildings or clothing; the reverse drift is equally wrong.

## Page and panel contract

\`\`\`json
{
  "page_role": "What changes by the end of this page",
  "start_state": "What the reader understands at page entry",
  "end_state": "The changed situation at page exit",
  "reading_direction": "Derived from the project or user requirement",
  "panels": [
    {
      "id": "stable-panel-id",
      "narrative_job": "One unique action, reaction, discovery, information change, or meaningful duration",
      "visible_moment": "One drawable instant, not a paragraph or montage",
      "transition": "How this follows the prior panel",
      "shot_and_viewpoint": "Scale, angle, distance, and spatial relationship",
      "action_geometry": "Hands, gaze, weight, prop contact, and motion direction",
      "reader_focus": "The first thing the reader must notice",
      "lettering": ["Exact dialogue, caption, or sound effect added after illustration"],
      "continuity_delta": "What state changes after this panel"
    }
  ]
}
\`\`\`

Delete or merge a panel when it adds no new action, information, emotion, viewpoint, or meaningful duration. Use an establishing view only when geography matters. Use a close-up only when its detail changes interpretation. Make the last panel earn the page turn.

## Continuity contract

For recurring subjects, retain only durable facts needed by later panels:

\`\`\`json
{
  "characters": [{ "id": "stable-id", "identity": "face, silhouette, body, hair", "outfit": "construction and wear", "state": "injury, emotion, carried objects" }],
  "locations": [{ "id": "stable-id", "geometry": "doors, windows, routes, scale, light sources" }],
  "props": [{ "id": "stable-id", "structure": "shape, material, orientation, damage state" }]
}
\`\`\`

Preserve identity and story state, not every incidental pixel. Keep reference roles separate: identity references do not decide page layout; style references do not rewrite canon; layout sketches do not redesign characters.
`,
  "references/gpt-image-2-workflow.md": `# Image production workflow

Use only capabilities verified on the current image Provider.

## Default production split

For multi-page comics or identity-sensitive sequences, generate one panel image per approved panel by default. Let the image model draw the scene; use project-local HTML, SVG, Canvas, or another deterministic compositor for panel borders, crops, balloons, captions, sound effects, and exact text.

Whole-page image generation is suitable for thumbnails, layout exploration, or a deliberately experimental page. Do not use it as the default final method until one representative page proves readable order, continuity, and text space.

Do not turn “separate lettering” into “silent comic.” The illustration request should contain no generated words, but the final composed page should include the script's dialogue, captions, and sound effects unless silence is narratively deliberate.

## Panel prompt order

Use a short labeled prompt:

\`\`\`text
GOAL
Create one finished comic panel for a known page and panel ID.

STORY MOMENT
Describe one visible action, reaction, discovery, or changed state.

PROJECT VISUAL AUTHORITY
Compile the relevant culture, period, technology, architecture, costume, line, color, light, and material constraints from the project. State concrete forbidden drift.

PERSISTENT SUBJECTS
Describe identity, gaze, body framing, object contact, and spatial relationship. Assign every reference image one authority and say what to ignore.

COMPOSITION
State shot, viewpoint, action direction, reader focus, and reserved negative space for later lettering.

MUST PRESERVE
List canon, identity, geography, and successful prior elements.

MAY VARY
List legitimate pose, framing, weather, and incidental-detail freedom.

MUST AVOID
No generated text, balloons, captions, panel borders, watermark, cultural drift, decorative concept-art posing, or extra story subjects.
\`\`\`

Prefer physical and observable instructions over praise words such as beautiful, cinematic, premium, masterpiece, or highly detailed.

## Reference discipline

- Establish a clean character identity reference before a sequence when a recurring character lacks one.
- Reuse the same accepted identity reference for every panel containing that character.
- Use a location reference when doors, routes, elevation, or repeated staging matters.
- Keep the reference set small and give each image exactly one authority.
- Restate invariants on every generation or edit; do not rely on conversation memory.

## Quality and model choice

- Use low-cost generation only for thumbnails, composition tests, or disposable direction probes.
- Use the standard high-quality image model for final panels, recurring-character identity, anatomy-sensitive action, and final page assets.
- If the tool does not expose the required quality or reference behavior, report that boundary instead of describing a draft as final.
- Treat requested dimensions as a request until the returned file is inspected. Read the actual dimensions before composing or cropping.

## Lettering and composition

Compose final pages from the real panel files. Keep exact text in the compositor, not in the image prompt. Place balloons in reading order, aim tails at the speaker, keep critical faces and actions unobstructed, and reserve captions for time, place, narration, or off-panel voice.

If a raster exporter is genuinely available, export the composed page and inspect it. Otherwise save and register the working HTML/SVG page and state accurately that no raster page was exported. Never claim a screenshot, PNG, or print page that no tool produced.

## Iteration

1. Approve the story engine and page beats.
2. Generate continuity references.
3. Produce one representative page or a small sequence.
4. Inspect actual panel images and the composed page.
5. Replace only failed panels or lettering placements.
6. Continue only after the representative sequence reads correctly.

Stop after repeated failure of the same invariant. Do not hide it with more adjectives, extra effects, or a style explanation.
`,
  "references/quality-review.md": `# Comic quality review

Inspect every actual panel image and every composed page at readable size. File existence is not visual review.

## Story readability

- **Silent pass:** hide lettering. Can a reader broadly follow who acts, what changes, where danger or opposition appears, and why the final image matters?
- **Lettered pass:** restore dialogue and captions. Can a reader identify the protagonist's immediate goal, obstacle, stakes, causal sequence, and page-turn hook?
- Does every panel add an action, reaction, discovery, information change, viewpoint, or meaningful duration?
- Does every page have an identifiable start state and changed end state?
- Is the reading order clear without instructions?

Failure means rewrite beats or replace the smallest failed panel. Do not add an explanatory paragraph outside the comic to repair unreadable storytelling.

## Project and style fidelity

- Does the result follow the project's actual culture, period, technology, architecture, costume, materials, and unified visual style?
- Did any visual culture appear only because of the user's language, a character name, the Agent locale, or model habit?
- Would a reader mistake Western fantasy for Chinese historical fantasy, or any other materially different setting?
- Are line, color, light, surface, and detail hierarchy observable in the image rather than asserted in a style label?

Cultural or period drift is a production failure, even when the image is attractive.

## Continuity and physical correctness

- Are recurring faces, silhouettes, bodies, hair, outfits, injuries, carried objects, and props identifiable?
- Do grips, gaze, body weight, object orientation, and contact points make sense?
- Are entrances, windows, routes, furniture, scale, and movement direction spatially consistent?
- Are there duplicated limbs, fused objects, invented symbols, accidental text, or missing critical props?

## Lettering and page grammar

- Are dialogue, captions, and sound effects exact and legible?
- Do balloon order and tails identify the speaker without covering faces or decisive action?
- Do panel size, gutter, overlap, border removal, and silence have a narrative reason?
- Is the result an actual comic page rather than a poster, concept-art collage, or equal-grid storyboard?

## Review authority

The reviewing Agent must use an available visual-reading tool on the real files. If the current model or toolchain cannot view the images, mark them unreviewed and stop before final acceptance. Do not substitute successful generation, valid bytes, file reread, or Provider metadata for visual approval.

## Decision

- **Accept:** both silent and lettered passes read, project style is faithful, continuity is usable, and defects are below the intended-use threshold.
- **Local edit:** one bounded panel crop, balloon placement, prop, or anatomy detail fails while the rest is worth preserving.
- **Regenerate:** the panel action, identity, composition, culture, or multiple interacting elements fail.
- **Rewrite beats:** the images are individually plausible but the sequence has no clear goal, causality, escalation, or turn.
- **Stop and report:** required tools are absent or repeated generation violates the same invariant.

Never rename a failure as intentional style merely because the image is attractive.
`,
  "SKILL.md": `---
name: creatx-draw-comic
description: Adapt an accepted novel chapter, story, script, memory, idea, or project text into readable comic panels and composed pages with project-faithful visual direction, story beats, character continuity, deterministic lettering, and real visual review. Use when a user asks to draw, adapt, storyboard, continue, revise, or visually develop a comic, manga, manhua, graphic novel, webcomic, or multi-panel narrative with an image-generation or image-editing model.
---

# CreatX Draw Comic

Produce a comic, not a collection of illustrations. Preserve the selected story's causal action and the project's visual identity while separating drawing from exact lettering.

## Non-negotiable rules

- Prefer a user-selected or accepted novel chapter when the project already contains one. Do not silently replace it with a world-setting note or event inventory.
- Do not infer visual culture from the user's language, character names, Agent locale, or model defaults. Read project visual authority before writing image prompts.
- Do not default the final deliverable to a silent comic. Generate illustrations without text, then add dialogue, captions, and sound effects deterministically unless silence is earned by the story.
- For multi-page or identity-sensitive work, generate individual panels by default and compose the page afterward. Whole-page generation is a draft or explicitly validated exception.
- Use low-cost images only for disposable tests. Use the standard high-quality model for final panels, recurring identity, anatomy-sensitive action, and final page assets.
- Inspect the actual images and composed pages before declaring success. If visual inspection is unavailable, mark the images unreviewed and stop.
- Never claim an image, edit, character lock, file, page export, or workbench succeeded without tool evidence.

## Workflow

### 1. Resolve the source and visual authority

Read the user's named source first. Otherwise prefer, in order:

1. the accepted novel chapter or story currently being developed;
2. an existing project story or script with a clear protagonist and causal sequence;
3. the user's supplied prose or idea;
4. non-narrative world material only after writing a bounded comic adaptation bridge.

Read the nearest \`视觉设定/统一画风.md\` when present, then relevant character, costume, location, map, architecture, material, and technology references. Read \`references/direction-contracts.md\` before choosing a style or adapting non-narrative material.

If multiple sources would create materially different comics and the user has not chosen one, ask one focused question. Otherwise state the selected source and proceed.

### 2. Pass the story gate

Before drawing, identify:

- protagonist and immediate goal;
- active obstacle or opposition;
- failure stakes;
- causal action or discovery sequence;
- irreversible turn or reveal;
- page-ending hook.

If these are missing, write a compact adaptation bridge before the comic script. You may add bounded actions, dialogue, opposition, and consequences inside open canon space. Do not pretend the source already contained a plot it did not contain.

### 3. Write the comic adaptation script

Create a reviewable script such as \`漫画/<作品名>/漫画改编脚本.md\`. Define each page's start state, changed end state, and final-panel purpose. Define each panel as one visible action, reaction, discovery, information change, or meaningful duration.

Keep the panel's drawing instruction separate from exact dialogue, captions, and sound effects. Let story beats determine panel count and panel geometry. Do not force an equal grid merely because it is easy to generate.

### 4. Establish continuity assets when needed

For recurring work, establish only the references that reduce meaningful drift:

- character identity and expression reference;
- outfit and critical-prop construction;
- recurring-location geometry;
- project visual-language reference.

Save accepted references with the comic. Reuse the same identity authority across panels. Do not let a style reference redesign the world or a layout sketch redefine a character.

### 5. Generate panels, then letter pages

Read \`references/gpt-image-2-workflow.md\` before image production.

Generate one image per approved panel by default. Give the model one visible moment, explicit project style constraints, reference roles, composition, lettering space, and \`MUST PRESERVE\`, \`MAY VARY\`, and \`MUST AVOID\` lists.

After panel generation:

1. inspect actual dimensions and content;
2. replace failed panels without regenerating successful ones;
3. compose real panel files in project-local HTML, SVG, Canvas, or another available deterministic format;
4. add exact dialogue, captions, sound effects, balloons, tails, crops, borders, and gutters outside the image model;
5. export a raster page only when a real exporter is available and verified.

For sustained comic work, register the comic directory as a workbench with \`register_workbench\`; do not edit \`.creatx\` by hand. A one-off image test does not require a workbench.

### 6. Review the real result

Read \`references/quality-review.md\` and inspect every real panel and composed page.

Run both tests:

- hide lettering and verify the broad action remains understandable;
- restore lettering and verify goal, obstacle, stakes, causality, and reading order become explicit.

Also check project culture and period, unified style, identity, anatomy, geography, exact text, balloon order, and page turn. Fix the smallest failed layer: rewrite beats, replace one panel, adjust lettering, or stop after repeated invariant failure.

## Output

Return or save, as appropriate:

- the selected source and comic adaptation script;
- accepted continuity references;
- individual panel images;
- the deterministic lettered page or workbench;
- raster page exports only when actually produced;
- a truthful list of failed, unreviewed, or style-drifted panels.

Do not move existing project content merely to organize the comic. Do not include credentials, copyrighted source pages, Provider responses, or unrelated reference assets in the output package.
`,
} as const

export const DRAW_COMIC_SKILL_FILES = Object.fromEntries(
  Object.entries(DRAW_COMIC_SKILL_TEXT_FILES).map(([relativePath, source]) => [relativePath, Buffer.from(source, "utf8").toString("base64")]),
) as Record<keyof typeof DRAW_COMIC_SKILL_TEXT_FILES, string>

export const DRAW_COMIC_SKILL_SOURCE = DRAW_COMIC_SKILL_TEXT_FILES["SKILL.md"]
