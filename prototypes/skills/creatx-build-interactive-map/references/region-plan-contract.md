# Region plan contract

Write UTF-8 JSON beside the immutable base PNG:

```json
{
  "schemaVersion": 1,
  "title": "裂隙纪元星图",
  "base": "base-map.png",
  "mask": "region-id-mask.png",
  "manifest": "map-manifest.json",
  "review": "alignment-review.png",
  "minimumRegionPixels": 2000,
  "minimumAlignmentRatio": 1.25,
  "regions": [
    {
      "id": "outer-void",
      "name": "外层虚空",
      "kind": "water",
      "maskColor": "#101820",
      "seeds": [[8, 8], [1663, 8], [8, 932], [1663, 932]]
    },
    {
      "id": "north-reach",
      "name": "北境",
      "kind": "land",
      "maskColor": "#315f8a",
      "seeds": [[420, 220]],
      "summary": "来自项目文件的区域说明",
      "sourcePaths": ["世界/地理/北境.md"]
    }
  ]
}
```

Rules:

- Keep all paths relative to the plan directory.
- Use unique IDs and lowercase six-digit colors.
- Add 1–3 points well inside each ordinary territory.
- For one semantic region containing several disconnected parts or strong internal visual basins, add one safe seed per part or basin, usually 3–12 in total. If substantially more are needed, reconsider whether the map should expose separate regions.
- Add a chain of points through a long rift, sea, river, or other winding region.
- Add seeds around the canvas perimeter for the outer region so it cannot leak through a single accidental low-gradient path.
- Keep every seed at least five pixels from a visible boundary.
- Use `land` for every territory that should lift. Use `water` or `unknown` only for large regions that should highlight in place.
- If a region is too small or the alignment score fails, adjust the base image or seed plan. Do not lower the gate merely to obtain output.

Run:

```powershell
node "<skill-directory>\scripts\derive-region-mask.mjs" `
  --plan "D:\path\to\region-plan.json"
```

The script writes the mask, manifest, and alignment review only after all pixels, regions, clarity metrics, and alignment gates pass.
