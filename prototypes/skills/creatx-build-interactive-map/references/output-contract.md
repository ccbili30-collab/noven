# Interactive map output contract

Write UTF-8 JSON beside the two PNG files:

```json
{
  "schemaVersion": 1,
  "title": "灰冠诸境",
  "canvas": { "width": 1672, "height": 941 },
  "base": "art-map.png",
  "mask": "region-id-mask.png",
  "regions": [
    {
      "id": "nine-rivers",
      "name": "九河盆地",
      "kind": "land",
      "maskColor": "#deef51",
      "summary": "内海东北岸向长河腹地展开的九水农耕盆地",
      "details": [
        { "label": "相邻地区", "value": "黑脊、长脊、三河、琥珀、黑苇" }
      ],
      "sourcePaths": ["宇宙、自然与地理/九河盆地.md"]
    }
  ]
}
```

Rules:

- `schemaVersion` is exactly `1`.
- `canvas` equals both PNG dimensions.
- `base` and `mask` are relative paths inside the manifest directory.
- Both images are opaque PNG files. The base remains the unmodified visual authority.
- `id` and lowercase six-digit `maskColor` are unique.
- `kind` is `land`, `water`, or `unknown`. `water` and large `unknown` regions highlight in place; `land` lifts.
- Every mask pixel matches one declared `maskColor`; every declared region owns at least one pixel.
- `summary`, `details`, and `sourcePaths` are optional display content. Omit missing evidence instead of inventing citations.
- The builder copies assets to fixed output names and rewrites the output manifest. Generated HTML never displays the manifest, mask, validation counts, or debugging controls.
