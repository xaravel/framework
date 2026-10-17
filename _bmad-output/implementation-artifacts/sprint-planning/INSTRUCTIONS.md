# Extract Story test scope from epics.md

Repo: /Users/ea/repos/xaravel. Source: `_bmad-output/planning-artifacts/epics.md` (read-only; do not edit anything in the repo).
Upstream snapshot: `conformance/upstream/{framework,mcp,boost,ai}/` (you may `ls`/`grep` it to check that files you name exist).
Background: epics.md lines 809-826 (Epic List structure decisions). Each Story in Phases 1-8 names its Upstream test scope as selectors; sprint planning resolves them to Test IDs. An acceptance criterion (AC = one `**Given**` block) that no Upstream selector covers is verified by a Xaravel Test `XT-<component>-<n>`.

Your job: for each `### Story N.M` in your line range, in file order, emit one JSON object. Read every Epic header in your range carefully: it defines abbreviations (e.g. `SCT` = `tests/Support/SupportCollectionTest.php`), the selector base directory (e.g. "selector test scope under `tests/Database/`" means bare `{X,Y}.php::*` selectors are relative to that dir), exclusions ("Relationship selectors in EMT and EBT belong to Epic 37, and are excluded here") and residual rules ("Any `SCT` Test ID matched by no selector belongs to Story 14.5").

Write a JSON array to the output file named in your prompt. Object shape:

```json
{
  "story": "14.2",
  "title": "<exact Story title from the heading>",
  "component": "<one kebab-case component name, normally the package dir under packages/ that the Story edits; for Xaravel-only components such as skeleton/installer use that name>",
  "kind": "upstream" | "xaravel",
  "deferred": null,
  "acs": [
    {
      "n": 1,
      "given": "<the Given line, trimmed to ~80 chars>",
      "verify": "selectors" | "xt",
      "include": ["framework/tests/Support/SupportCollectionTest.php::testMake*"],
      "exclude": [],
      "residual": []
    }
  ],
  "notes": ""
}
```

Rules:
- `kind`: `upstream` for an Upstream Component Epic/Story (header says "Upstream Component", or it has selector scope), `xaravel` for a Xaravel Component (runtime, contracts, htmx, testbench, skeleton, installer, framework meta-package etc.). In a `xaravel` Story every AC is `verify: "xt"`.
- `verify: "selectors"` only when the AC's own text names Upstream tests (a test scope, a test file, `::*`, a glob). Every other AC is `verify: "xt"` with empty lists.
- Selector normal form: `<pkg>/<path-glob>::<method-glob>`, `<pkg>` one of `framework`, `mcp`, `boost`, `ai`. Path relative to the package root, e.g. `framework/tests/Support/SupportCollectionTest.php`. Path glob may use `*` (within one path segment) and `**` (any number of segments, e.g. `framework/tests/Foundation/Cloud/**`). Method glob uses only `*` and is matched against the PHPUnit method name (or the Pest test description); use `*` for a whole file. EXPAND every brace group and every abbreviation: no `{`, `}` or abbreviation may remain. One string per expanded selector. Apply the Epic's base directory.
- `exclude`: selectors (same normal form) that the Epic or Story says are NOT part of this AC's scope (e.g. Epic 36 excludes the relationship selectors in EMT and EBT that Epic 37 owns: list them on each Epic 36 AC whose include would otherwise match them).
- `residual`: file paths (normal form, no `::`) when the AC says "plus every X Test ID that no earlier selector matched" / "every TRT Test ID not matched by Story 57.3" / the Epic says unmatched IDs in a file belong to this Story. The resolver gives this Story whatever in that file no explicit selector anywhere claimed.
- `deferred`: set to a short reason string (and still fill `acs` as best you can) when the Story's test scope cannot be resolved from the snapshot today, i.e. any AC's scope is: Expectations entries / `blocked-by:<c>` entries; "resolved by sprint planning when this Story is planned"; a re-verification of tests another Story owns ("this Story re-verifies them"); or "one manifest per (owning) Component" spanning more than one component. Otherwise `deferred: null`.
- Tests described as `blocked-by:testbench` (or another later component) in a header are not in this Story's scope unless an AC names them.
- Put anything ambiguous, and every judgment you made, in `notes`. Do not invent selectors that the text does not state.
- Verify a sample of your file paths exist under `conformance/upstream/`; if a named file does not exist, keep the selector and say so in `notes`.

When done, validate the file with `python3 -c "import json;json.load(open('<file>'))"` and reply with: number of Stories, how many deferred, and any notes worth a human's attention (max 15 lines).
