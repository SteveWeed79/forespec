# Schemas

Formal validation for the Foresight archetype files. The archetype JSON declares a Foresight
format tag in its `$schema` field (e.g. `foresight/archetype/v1.1`); the schemas here give that
tag something to validate against.

| Schema | Validates | `$id` |
|---|---|---|
| [`archetype.schema.json`](./archetype.schema.json) | `../archetype.ecommerce.json` (and any base archetype) | `foresight/archetype/v1.1` |
| [`archetype.design.schema.json`](./archetype.design.schema.json) | `../archetype.ecommerce.design.json` (instrumented design layer) | `foresight/archetype-design/v2` |

## Quick check (no dependencies)

`validate.mjs` runs on a bare Node install and checks the invariants a JSON Schema can't
express by itself — unique checkpoint ids, design-signal weights summing to 1.0, and the
intentional shared ids between the base and instrumented files:

```bash
node schemas/validate.mjs
```

## Full structural validation

The `$schema` field in each archetype is a Foresight *format tag*, not a resolvable URL, so
point a validator at the schema file explicitly.

**Node (ajv, draft 2020-12):**

```bash
npm i -D ajv ajv-cli
npx ajv validate --spec=draft2020 -s schemas/archetype.schema.json        -d archetype.ecommerce.json
npx ajv validate --spec=draft2020 -s schemas/archetype.design.schema.json -d archetype.ecommerce.design.json
```

**Python (jsonschema):**

```bash
pip install jsonschema
python - <<'PY'
import json
from jsonschema import Draft202012Validator
for data, schema in [
    ("archetype.ecommerce.json",        "schemas/archetype.schema.json"),
    ("archetype.ecommerce.design.json", "schemas/archetype.design.schema.json"),
]:
    Draft202012Validator(json.load(open(schema))).validate(json.load(open(data)))
    print("valid:", data)
PY
```

## Notes

- Schemas validate **structure** (required fields, enums, id shape). The weight-sum and
  id-uniqueness invariants live in `validate.mjs` because JSON Schema can't express a sum
  constraint cleanly.
- Checkpoint ids are **permanent contracts** (see `../foresight.calibration-1.md`). Bump the
  archetype `version` when definitions change; never silently rename a checkpoint id.
