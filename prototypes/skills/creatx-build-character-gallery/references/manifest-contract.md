# Character gallery manifest contract

Write one UTF-8 JSON manifest beside the generated portrait files:

```json
{
  "schemaVersion": 1,
  "worldTitle": "灰冠诸境",
  "visualStyleSource": "视觉设定/统一画风.md",
  "characters": [
    {
      "id": "su-he",
      "role": "notable",
      "evidenceStatus": "source",
      "name": "苏禾",
      "subtitle": "冷杉坡村守灯人 · 第三节点现场见证",
      "quote": "“我看见的是桥脚，不是整段山路。”",
      "significance": "让不完整记录无法冒充放行事实",
      "portrait": "portraits/su-he.png",
      "portraitAlt": "苏禾站在北境旧灯架旁",
      "visualStyleApplied": true,
      "visualHook": {
        "kind": "authority",
        "summary": "冷峻美型与不动声色的守关威压"
      },
      "headline": {
        "kicker": "守灯不是点亮一盏灯",
        "title": "她让未知保持诚实。",
        "intro": "证据尚未闭合时，她宁愿让道路停在风雪里。"
      },
      "profile": [{ "label": "身份", "value": "冷杉坡村守灯人" }],
      "relationships": [
        { "role": "同行桥匠", "name": "孟槐", "description": "共同复验北桥" }
      ],
      "affiliation": [{ "label": "所属组织", "value": "山口守灯会" }],
      "bible": [
        { "icon": "✥", "title": "性格核心", "paragraphs": ["准确高于体面。"] }
      ],
      "sourcePaths": ["人物、关系与阵营/守灯人苏禾.md"]
    }
  ]
}
```

Rules:

- `schemaVersion` is exactly `1`.
- Include four to six `notable` characters and exactly one `ordinary` character. Default to five plus one.
- `id` uses lowercase letters, digits, and hyphens and is unique.
- `evidenceStatus` is `source`, `derived`, or `created`.
- `portrait` is a relative `.png`, `.jpg`, `.jpeg`, or `.webp` path inside the manifest directory.
- `visualStyleApplied` records whether the image queue actually injected the project visual master into that portrait task. Keep it `false` when evidence is missing; the builder warns and continues.
- `visualHook.kind` is `beauty`, `authority`, `uncanny`, `danger`, `sacred`, or `human-specificity`.
- Every character has non-empty `name`, `subtitle`, `quote`, `significance`, `portraitAlt`, `visualHook.summary`, `headline`, and `sourcePaths`.
- `profile`, `relationships`, and `affiliation` are non-empty arrays.
- `bible` contains exactly six sections. Each section has a title and at least one paragraph.
- `sourcePaths` identify world evidence. They are provenance labels; the builder does not rewrite the source project.
- The builder copies portraits and static viewer assets into the output. Generated pages never display the manifest, evidence status, source paths, or internal validation data.
