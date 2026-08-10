---
name: creatx-draw-map
description: Read an existing CreatX world, geography blueprint, or map request and generate a clean high-resolution interactive atlas backed by one immutable base image and a complete same-size region-ID mask derived from the base image's visible boundaries. Use when asked to build, rebuild, or preview a 可点击地图、战棋式区域地图、世界地图工作台 or selectable atlas whose region details appear in floating cards.
---

# Build Interactive Map

Generate a finished selectable map through the bundled deterministic scripts. Keep the user-facing page visually clean and fail closed when the base is unclear or the mask does not align.

## Locate this Skill

Use the absolute directory of the loaded `SKILL.md` when the Skill tool reports it. Otherwise locate the newest installed `creatx-draw-map` directory under `%APPDATA%\creatx\creative-skills\`; verify that it contains this file and both bundled scripts before running anything. Never leave `<skill-directory>` as a literal placeholder.

## Workflow

1. Identify the project and world root. Read the actual geography, region, ocean, route, settlement, and visual-style files relevant to the requested map.
2. Read [references/base-map-quality.md](references/base-map-quality.md). Generate a new native-resolution base PNG with clear closed boundaries, no text, and no interface. Open and inspect the actual PNG. Retry at most three times; if none passes, stop.
3. Preserve the accepted Provider PNG unchanged. Never redraw, blur, downsample, crop, or paint over it to help the mask.
4. Define every selectable region and its truthful kind. A detailed regional map should normally expose 12–35 meaningful territories rather than a few smooth macro shapes. Every territory that should lift is `land`; sea, rift, void, fog, or another giant outer region is `water` or `unknown` and highlights in place.
5. Read [references/region-plan-contract.md](references/region-plan-contract.md). Open the base at native resolution and place seed points well inside each visible region. Use multiple seeds along long winding regions and around the outer canvas. For a textured island or another region split into several internal visual basins, place at least one seed safely inside every basin; one seed for the whole semantic region is not sufficient when interior ridges can trap the watershed.
6. Run the bundled `scripts/derive-region-mask.mjs` with the region plan. It deterministically checks base clarity, derives a complete same-size ID mask from image gradients, writes the manifest and alignment review, rejects tiny regions, and rejects weak boundary alignment.
7. Open the alignment review. Verify every region against the immutable base. Do not accept circles, ellipses, smooth macro polygons, Voronoi cells, boundary leaks, decorative fragments, or semantics that cross visible borders. Adjust seeds or regenerate the base; do not lower the quality gates merely to obtain output.
8. Run:

```powershell
node "<verified-skill-directory>\scripts\build-interactive-map.mjs" `
  --manifest "D:\path\to\map-manifest.json" `
  --output "D:\path\to\交互地图"
```

9. Preview through a local HTTP server. Click every region at least once, inspect one lifted territory and each in-place region type, test close/reselect/`Esc`, and check browser errors. Report actual counts, timings, dimensions, quality metrics, alignment ratio, output path, and failures.
10. Register the completed map directory only after the mask, build, visual review, and browser interaction pass. Do not claim registration unless `register_workbench` succeeds.

## Finished-page contract

- Show the complete native-resolution base map as the dominant full-window surface.
- Do not generate a fixed sidebar, header, toolbar, debug control, legend, mask preview, or permanent explanatory block.
- Keep the ID mask invisible. It exists only for hit testing, clipping, highlighting, and boundaries.
- Show region information only after selection, in a compact draggable and closable floating card near the selected point.
- Re-selecting the region, the close button, or `Esc` closes the card.
- Lift land from the same base image. Highlight water, rifts, void, and very large outer regions in place.
- Cache only the currently selected region's full-size render layers. Do not retain five full-size canvases for every visited region.

## Failure boundaries

- Stop on an unclear base, failed visual review, more than three Provider attempts, malformed plan or manifest, path escape, mismatched dimensions, duplicate IDs/colors/seeds, unknown colors, missing or transparent pixels, tiny regions, weak alignment, an unowned output directory, browser errors, or a failed region click.
- Never fill unknown pixels with a silent fallback, lower the gate to force success, or rewrite the Provider original to make an inaccurate mask appear aligned.
- Never use a purely geometric mask as Live evidence for a visual-first map.
- Do not write `.creatx` metadata directly, change production Renderer code, or bypass `register_workbench`.
