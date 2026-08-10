# Input and output contract

## Accepted input

The script accepts a CreatX project root containing `.creatx/growth/goals` and one or more Growth World Pro Goal directories.

Preferred full-density source:

```text
.creatx/growth/goals/<goal-id>/world/materialization/relations.json
```

Required shape:

```json
{
  "schemaVersion": 1,
  "nodes": [{ "id": "...", "title": "...", "layer": "...", "path": "worlds/<world>/..." }],
  "relations": [{ "from": "...", "to": "...", "type": "causes", "reason": "..." }]
}
```

Blueprint-only fallback:

```text
.creatx/growth/goals/<goal-id>/world/blueprint/index.json
.creatx/growth/goals/<goal-id>/world/blueprint/layers/*.json
.creatx/growth/goals/<goal-id>/world/blueprint/relations.json
```

The blueprint index must be frozen and declare `root`. Layer objects with `kind: "entry"` and `plannedPath` become works. Only explicit relations whose endpoints both resolve to entries are included. Facts and materialized正文 relationships remain empty; the result is marked `degraded: true`.

## Automatic selection

1. Restrict candidates by `--goal-id` and `--world-root` when supplied.
2. Refuse automatic selection when valid candidates contain more than one distinct world root.
3. For one world, prefer materialization over blueprint-only data, then choose the most recently modified candidate of that kind. Use the Goal ID as a stable tie-breaker.
4. Report ignored malformed candidates as warnings. If an explicitly selected Goal is malformed, fail.

## Output ownership

The default output is:

```text
<project-root>/<world-root>/世界关系球
```

The directory contains:

```text
index.html
globe-app.js
styles.css
starfield-panorama-nebula.png
graph-data.js
generation-summary.json
.creatx-world-constellation.json
THIRD_PARTY_NOTICES.md
```

The marker file is the only overwrite authority. A pre-existing non-empty directory without a valid marker is never overwritten. The script writes no files under `.creatx`.

## Trust boundary

The viewer embeds real text available at generation time, so it can preview files without a private backend API. Missing documents are counted and listed in `generation-summary.json`; empty content is not presented as successful reading.

The Prototype bundles its starfield but loads `globe.gl@2.46.1` over HTTPS. It is not an offline bundle, a production workbench registration, or Live evidence for CreatX Renderer integration.
