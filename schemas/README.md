# Schemas

Formal validation for the Foresight library + archetype files. Each file declares a Foresight
format tag in its `$schema` field; the schemas here give that tag something to validate against.

| Schema | Validates | `$id` |
|---|---|---|
| [`library.checkpoint.schema.json`](./library.checkpoint.schema.json) | `../library/checkpoints/*.json` (shared checkpoint definitions — no severity) | `foresight/checkpoint-library/v1` |
| [`archetype.manifest.schema.json`](./archetype.manifest.schema.json) | `../archetype.*.json` (archetype manifests — `{ ref, severity }` lists) | `foresight/archetype/v2` |
| [`archetype.schema.json`](./archetype.schema.json) | the **resolved** archetype (output of `library/resolve.mjs`) | `foresight/archetype-resolved/v2` |
| [`archetype.design.schema.json`](./archetype.design.schema.json) | `../archetype.ecommerce.design.json` (instrumented design layer) | `foresight/archetype-design/v2` |

## Quick check (no dependencies)

`validate.mjs` runs on a bare Node install and checks the invariants a JSON Schema can't
express — library ids unique across all files, every manifest `ref` resolves with a valid
severity, the resolved archetype's ids are unique, and the design-signal weights sum to 1.0:

```bash
node schemas/validate.mjs      # or: npm run check
```

## Full structural validation

The `$schema` field is a Foresight *format tag*, not a resolvable URL, so point a validator at
the schema file explicitly.

**Python (jsonschema):**

```bash
pip install jsonschema
python - <<'PY'
import glob, json, subprocess
from jsonschema import Draft202012Validator

def check(path, schema):
    Draft202012Validator(json.load(open(schema))).validate(json.load(open(path)))
    print("valid:", path)

for f in glob.glob("library/checkpoints/*.json"):
    check(f, "schemas/library.checkpoint.schema.json")
check("archetype.ecommerce.json",        "schemas/archetype.manifest.schema.json")
check("archetype.ecommerce.design.json", "schemas/archetype.design.schema.json")

# the resolved archetype (resolver output)
resolved = json.loads(subprocess.check_output(["node", "library/resolve.mjs", "archetype.ecommerce.json"]))
Draft202012Validator(json.load(open("schemas/archetype.schema.json"))).validate(resolved)
print("valid: resolved archetype")
PY
```

**Node (ajv, draft 2020-12):** `npm i -D ajv-cli`, then `npx ajv validate --spec=draft2020 -s <schema> -d <file>` per file (resolve first with `node library/resolve.mjs archetype.ecommerce.json > /tmp/resolved.json` to validate the resolved output).

## Notes

- Schemas validate **structure** (required fields, enums, id shape). Ref-resolution, id
  uniqueness, and the weight-sum invariant live in `validate.mjs` because JSON Schema can't
  express them cleanly.
- Checkpoint ids are **permanent contracts** (see `../foresight.calibration-1.md`). Bump the
  `version` when a definition changes; never silently rename an id.
