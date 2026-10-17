---
test_ids:
  - XT-conformance-51
trigger: open-question
proposed: >-
  When a test's RequiresDatabase drivers (class hierarchy and method,
  intersected) and its tests/Integration/Database/<Engine> directory leave no
  backend, record the directory's engine (or `none` when there is no engine
  directory) instead of failing. Upstream skips such a test on every engine,
  so Story 2.6's Oracle run records it as `skip`, and the upstream-skip check
  carries that skip through. Change the Story 2.4 spec's backend rule and its
  "DB conflict" matrix row to say this.
evidence: >-
  Generating the Inventory with the Story 2.4 spec as written fails on 8 Test
  IDs. Illuminate\Tests\Integration\Database\Sqlite\SchemaBuilderSchemaNameTest
  has #[RequiresDatabase('sqlite')] on the class, and inherits testForeignKeys,
  testComment, testAutoIncrementStartingValue and testHasTable (2 datasets
  each) from SchemaBuilderSchemaNameTest, where those methods carry
  #[RequiresDatabase(['mariadb','mysql','pgsql',...])]. Testbench's
  AttributeParser applies class and method attributes together, so Upstream
  skips these 8 IDs on every engine. The spec's intent contract says an empty
  intersection fails, while its Verification expects exit 0 with 16216
  entries. The spec cannot satisfy both. Choosing a rule (the fallback
  proposed here, an empty `backends`, or another marker) is a decision for
  whoever owns the backend vocabulary.
---

# ESC-2.4-1: backends for a test whose database requirements cannot all be met

Story 2.4's Inventory derives `backends` from `#[RequiresDatabase]` and the `tests/Integration/Database/<Engine>` directories. When these sources contradict each other, nothing says what to record. The spec's choice of failing the run makes the Inventory impossible to generate at the Baseline Pin.

The options:

1. **Directory engine, or `none` (proposed).** Every entry keeps at least one backend. Story 2.6 runs the test under that Variant, and the Oracle records `skip`, which matches Upstream.
2. **`backends: []`.** This is faithful in that the test runs nowhere. But every consumer of `backends` (Variants, the Ratchet, the `upstream-skip` check) then has to handle an empty set.
3. **A dedicated marker.** This adds vocabulary that `conformance/variants` (Epic 5) would have to absorb.

Option 1 neither weakens the grader nor adds a divergence. The attempted implementation is saved at `_bmad-output/implementation-artifacts/spec-2-4-attempt.patch`.
