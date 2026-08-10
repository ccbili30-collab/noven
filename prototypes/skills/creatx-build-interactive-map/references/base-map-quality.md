# Base map quality contract

Generate the base as the visual authority. Retry at most three times; if no candidate passes, stop without building an interactive map.

## Prompt contract

Use a native high-resolution PNG with at least 1,000,000 pixels and a shortest edge of at least 768 pixels. Ask for:

- one orthographic or atlas-like full-canvas composition;
- 12–35 visually distinct, closed, selectable territories when the subject supports a detailed regional map;
- crisp, continuous 2–5 px visual separators that follow terrain, political, geological, magical, or astronomical structure;
- meaningful region sizes with no decorative micro-islands masquerading as selectable territories;
- a continuous, visually distinct sea, void, rift, fog, or other truthful outer category;
- controlled bloom, fog, stars, texture, and lighting that do not hide boundaries;
- no text, labels, numbers, legend, compass, grid, frame, panel, button, watermark, or interface element.

Do not ask the image model to generate the ID mask. Preserve the returned base PNG unchanged.

## Mandatory visual review

Open the actual PNG and verify:

1. the full map is sharp at native resolution;
2. territory boundaries are visible, mostly closed, and not covered by bloom or fog;
3. the intended land/sea/void/rift semantics can be identified without guessing;
4. no text or UI is present;
5. the composition leaves no important territory clipped at the canvas edge.

The deterministic script checks technical clarity, not semantics or unwanted text. Both checks are required.
