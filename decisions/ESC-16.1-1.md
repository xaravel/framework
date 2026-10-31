---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "a9a9607bef62252fcc4810070e0f944dc1a72e9855ef2c83e7f9c56ab4fa1626"
---

# ESC-16.1-1: approved, option 1 (the json-schema tests validate with `ajv` in place of `opis/json-schema`)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

- `opis/json-schema` (v2.6.0 at the Pin) is a test-only dependency of Upstream's `tests/JsonSchema/TypeTest.php`. No Laravel API exposes it, and no other Component uses it, so AD-22 gives it no owner in the framework.
- `@xaravel/json-schema` takes the npm `ajv` 8.17.1 (its draft 2020-12 build, `ajv/dist/2020`, Opis 2.x's default draft) and `ajv-formats` 3.0.1 as exact-pinned `devDependencies`, with the reason in the package README (NFR-2). The monitor adds them, with `bun.lock`, in this ruling's PR, because `bun.lock` is Protected. No runtime code imports them.
- The Ported `TypeTest` keeps Upstream's `makeValidator`, `assertValidOnJsonSchema` and `assertNotValidOnJsonSchema` helpers on its local `TypeTest` class and validates `jsonDecode(String(schema))` against the data (a PHP `(object) [...]` as the runtime's `stdClass`). Every assertion, expected value and dataset row stays as Upstream wrote it, and no `adapted` marker is needed.
- **No DIV clause, unless ajv disagrees.** The Oracle records Opis's verdict for each of the 172 dataset rows, so the harness shows row by row whether ajv agrees. A row where they disagree is not adapted: it raises its own Escalation naming the row and both verdicts.

Story 16.1 resumes with all three of its Escalations ruled.
