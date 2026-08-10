# Input and output contract

## Sources

Prefer `.creatx/growth/goals/<goal-id>/world/materialization/relations.json`. Fall back only to a frozen `world/blueprint` containing an index, layer documents, and `relations.json`.

Only `type: "causes"` enters the output. Each accepted edge must resolve both endpoints and retain its stored `reason`. A selected world with zero accepted causal edges fails with `NO_CAUSALITY`.

## Selection

Restrict by `--goal-id` or `--world-root` when supplied. Refuse automatic selection when valid candidates represent several worlds. For one world, prefer materialization over blueprint, then the newest candidate with Goal ID as tie-breaker. An explicitly selected malformed Goal fails instead of silently choosing another.

## Output

The default output is `<project-root>/<world-root>/世界因果图` and contains:

```text
index.html
app.js
styles.css
graph-data.js
generation-summary.json
.noven-causality.json
```

The output is offline and dependency-free. The marker is the only overwrite authority. Never overwrite a non-empty directory without a valid marker owned by this Skill. Never write inside `.creatx`.

The viewer embeds bounded real project text for local inspection. Missing documents remain listed in `generation-summary.json`. Workbench registration is a separate product tool action after generation and visual verification.
