---
title: "Story 9.13: Oracle rows for the runtime's PHP-mirroring checks"
type: 'feature'
created: '2026-10-22'
baseline_revision: '6ce8ae16d3794cc1ba6b0262afd658557f2c2cb2'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.13.md'
  - '{project-root}/decisions/MAINT-2026-10-22-epic-9-item-3-split.md'
  - '{project-root}/packages/runtime/docs/class-registry.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** XT-runtime-12, 13, 14, 18, 20 and 23 check behaviour that mirrors PHP (class-name lookup, by-reference writes, null normalisation, array copy-on-assign), but their expected values come only from the test author's reading of PHP: no Oracle row grounds them (Epic 9 retro finding S2). Local PHP 8.5.11 already shows one difference: PHP keeps a leading `\` in its not-found message (`new ('\App\Missing')` throws `Class "\App\Missing" not found`), while `resolveClass("\\App\\Missing")` throws `Class "App\Missing" not found`.

**Approach:** Add one `php-expr` request per Test ID to `conformance/oracle-requests/9.13.jsonl`, each evaluating only the PHP construct its test mirrors, and make each test compare Xaravel's result with the signed fixture. Fix every difference in `packages/runtime`.

## Boundaries & Constraints

**Always:**
- Edit only `packages/runtime/**`, `conformance/oracle-requests/9.13.jsonl`, the `conformance/fixtures/runtime/*.json` the `xaravel-oracle` bot signs for it, this spec, and the Story's status lines (`sprint-status.yaml`, `stories/9.13.md` `status:`).
- Request lines: `{id, kind, input, sha256}` in that order, `kind: "php-expr"`, `input: {bindings: {}, setup: [...], exprs: [...]}`, rendered and hashed with `makeRequest`/`renderRequest` from `tools/oracle/request.ts` (run from a scratch script outside the repo). Requests contain no Laravel code and no Upstream fixture; classes they need are declared in `setup` with `eval('namespace …; class … {}')` under names unique to this file. The run is the bare PHPUnit TestCase in the global namespace, each `setup` statement and each expr its own `eval` in one shared scope.
- Each test reads its fixture as `values.test.ts` does (`oracle(id)`: dynamic import of `packages/assert/tests/xaravel/oracle-values.ts`, `readRequests`, `readSignedFixture`, `conformance/oracle/oracle.pub`), with `REQUESTS = "conformance/oracle-requests/9.13.jsonl"`; a missing fixture fails the test. Each file header names Story 9.13 and gives the F-10 recorded reason (Xaravel Tests, no Upstream test inputs; docs/ops/oracle.md § Per-Story requests).
- Every existing assertion stays. Where one hard-codes a value the Oracle contradicts, its expected value becomes the Oracle's (read from the fixture), and the runtime is fixed to match.

**Never:**
- Remove or loosen an assertion; add a skip, an `adapted:` marker or an Expectations line.
- Edit `packages/mockery/**` (its `Expectation.ts:135` copy of the stripped message is that component's; report it, do not fix it), `tools/oracle/**`, or any other Story's request file.
- Hand-write or edit a fixture.

## I/O & Edge-Case Matrix

| Scenario | Xaravel input | PHP construct in the request | Expected |
|----------|--------------|---------------------------|----------|
| XT-12 lookup | `resolveClass` of `App\Models\Post`, `\app\models\post`, `APP\MODELS\POST`; `fqcn(Post)`, `fqcn(new Post())` | `(new \ReflectionClass($n))->getName()` for each; `get_class(new ('\app\models\post'))` | `fqcn(resolveClass(n))` and `fqcn(new Post())` equal each Oracle name (`App\Models\Post`) |
| XT-13 miss | `resolveClass` (sync and async) of `App\Missing`, `\App\Missing` | `new $n` for each, in a try | message equals the Oracle's: `Class "App\Missing" not found`, `Class "\App\Missing" not found`; a PHP `Error` |
| XT-14 lookup | `resolveClass("tests\\fixtures\\foo")`; key `app\models\POST` taken; `resolveClass("App\\Post2")` | `getName()` of `tests\fixtures\foo`; `class_exists('app\models\POST')`; `new ('App\Post2')` | name `Tests\Fixtures\Foo`; collision is true (so `registerClass` refuses); message `Class "App\Post2" not found` |
| XT-18 Ref | `bump(r)`, list append through `Ref` | `function (&$x) { $x++; }` on `$r = 1`; `(function (&$x) { $x = [...$x, "a"]; })($list)` | `r.value` equals Oracle int (2); `jsonEncode(list.value)` equals Oracle `json_encode($list)` |
| XT-20 null | `normalizeNull` of `undefined`, `null`, `0`, `""`, `false`, `{a: 1}` | `(function (): void {})()`, `null`, `0`, `""`, `false`, `["a" => 1]` | each Xaravel result equals the decoded Oracle value (arrays compared through `jsonEncode` vs `json_encode`) |
| XT-23 copy | the test's `original`, `valueCopy`, every mutation it makes, the shared `Ref`, the sparse push | the same structure as PHP arrays with `$original["ref"] = &$ref`, `$copy = $original`, the same mutations, `$copy["ref"] = 2`; sparse `[5 => 1]`, unset, copy, push | `jsonEncode([list, php])` of original and copy equal the Oracle's `json_encode`; shared object `===`; `ref.value` equals Oracle `$ref`; pushed keys equal Oracle `array_key_last` (6, 6) |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:166-171` -- `notFound(fqcn)` builds the message from `normalise(fqcn)`, stripping a leading `\`; PHP keeps the name as written (local PHP 8.5.11: `new`, `::`, constants all give `Class "\App\Missing" not found`). Fix here; lookups still normalise (`normalise` at :57).
- `packages/runtime/tests/xaravel/registry.test.ts:54-140` -- XT-runtime-12..14; hard-coded literals at :94-95, :103, :133 become fixture comparisons (the literals for names without `\` may stay alongside).
- `packages/runtime/tests/xaravel/values.test.ts:20-60` -- the fixture idiom to copy (`Output`, `oracle(id)`, `rawResult`); XT-runtime-18 at :284, XT-runtime-20 at :343.
- `packages/runtime/tests/xaravel/semantics.test.ts:340-420` -- XT-runtime-23.
- `packages/assert/tests/xaravel/oracle-values.ts:107` -- `decode` (int → number, array → AD-9 value), read-only.
- `tools/oracle/request.ts:145-170` -- `requestHash`, `makeRequest`, `renderRequest`, read-only.
- `tools/oracle/evaluate.php:60-80, 380-410` -- result encoding (`{"value"}` / `{"throws":{class,message}}`) and the eval loop, read-only.
- `packages/runtime/docs/class-registry.md:4` -- say the not-found message keeps the name as given.

## Tasks & Acceptance

**Execution:**
- `conformance/oracle-requests/9.13.jsonl` -- one `php-expr` request each for XT-runtime-12, 13, 14, 18, 20, 23, per the matrix -- the Oracle rows the Story adds.
- `packages/runtime/src/registry/registry.ts` -- `notFound` uses the name as given -- the difference the Oracle shows.
- `packages/runtime/tests/xaravel/registry.test.ts`, `values.test.ts`, `semantics.test.ts` -- per test, compare with the fixture per the matrix; header names Story 9.13 and the F-10 reason -- AC1-AC4.
- `packages/runtime/docs/class-registry.md` -- the message rule -- docs follow the code.

**Acceptance Criteria:**
- Given each of the six requests, when `bun run oracle:story check 9.13` runs, then every line is accepted.
- Given local PHP 8.5.11, when each request's setup and exprs run in a scratch script outside the repo, then every result equals what the runtime produces (checked before the first push).
- Given the signed fixtures, when the six tests run, then each compares Xaravel's results with them and passes.

## Design Notes

The fixtures exist only after `oracle.yml#story` signs them on the PR, so the loop pushes the branch and opens the PR once the request file and tests are written, pulls the bot's commit, then runs the full checks. Until then the six tests fail with a missing fixture; that is expected locally.

## Verification

**Commands:**
- `bun run oracle:story check 9.13` -- expected: every request accepted.
- `bun test packages/runtime` -- expected: pass once the fixtures are pulled.
- `bun run harness --story 9.13`, then `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: no difference.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run oracle:verify-fixtures` -- expected: clean.
