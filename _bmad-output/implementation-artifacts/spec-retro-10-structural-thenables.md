---
title: 'Epic 10 item 6: a structural type stands for the thenable its header names'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_revision: '4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Fidelity Review reviewer 1 rejects F-7 for evidence XT-contracts-5 and XT-contracts-8 read that the prompt does not carry.
    evidence: |-
      Standing reject at tree 1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48; the Maintainer waived the same gap for Story 10.2 (ESC-10.2-9, ESC-10.2-10) instead of enlarging the prompt. Settled by a Maintainer ruling for epic-10-item-6-structural-thenables.
    location: >-
      packages/contracts/tests/xaravel/namespaces.test.ts, packages/contracts/tests/xaravel/web.test.ts
    severity: low
---

# Epic 10 item 6: a structural type stands for the thenable its header names

Action item `epic-10-item-6-structural-thenables` (decisions/ESC-10.3-2.md, option 1). The ruling approves the `tools/lint-rules/thenables.ts` change and its tests inside the item, beside its `packages/contracts` changes (the MAINT-2026-10-16 amendment of 2026-10-22, `--item` Fidelity Review).

<intent-contract>

## Intent

**Problem:** `Console\Kernel.queue` returns the structural `PendingDispatch` and `Bus\QueueingDispatcher.batch` the structural `PendingBatch`. Both are listed thenables (AD-6), but a structural type has no runtime value, so no `registerClass` or contract token names its FQCN, and `registeredFqcn` returns null: `packages/contracts/async-surface.json` lacks their `thenable` lines and lint's `xaravel/no-async-thenable-return` cannot see them.

**Approach:** In the shared resolver (`localFqcn` in `tools/lint-rules/thenables.ts`, behind `registeredFqcn`), when a binding declared in a file `…/packages/contracts/src/structural/<Name>.ts` is `<Name>`, the file exports `<Name>` under that name, nothing registers it, and the file's first line is `// <FQCN>,…` or `// <FQCN> …` with `<FQCN>` shaped as a class name, resolve it to that FQCN. Regenerate `packages/contracts/async-surface.json`; XT-contracts-5 and XT-contracts-8 assert the two new lines.

## Boundaries & Constraints

**Always:** `registerClass` and contract tokens of the same local still win. Match by qualified name only. The path test is on the resolved file path's segments `packages/contracts/src/structural/<Name>.ts`, so it holds on the real tree and on temp roots. The header must be the file's first line, `// ` then an FQCN (`isFqcn`; a leading `\` is normalised) then `,` or a space. Update the header comments of `thenables.ts`, `docs/ops/async-surface.md` and `docs/ops/lint.md`, and the stale ESC-10.3-2 notes in `web.test.ts`.

**Never:** Change any `packages/contracts` file other than `async-surface.json`, `tests/xaravel/namespaces.test.ts` (XT-contracts-5) and `tests/xaravel/web.test.ts` (XT-contracts-8). Never remove or weaken an assertion: XT-contracts-8's "no thenable line" check becomes an exact expected thenable set. Do not cover `SupportsPartialRelations::getOneOfManySubQuery()` (out of scope per the ruling). No `THENABLE_TYPES` change; no other package's `async-surface.json` changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Structural via import | `Kernel.ts` imports `PendingDispatch` from `../structural/PendingDispatch`, whose line 1 is `// Illuminate\Foundation\Bus\PendingDispatch, as …` | `registeredFqcn(kernel, "../structural/PendingDispatch", "PendingDispatch")` → that FQCN; also via `null` from the importer and through a barrel re-export | — |
| Space-terminated header | `// Psr\Http\Message\StreamInterface (psr/…` | that FQCN | — |
| Not a class name | first line `// PHP's built-in …`, or the FQCN on line 2, or no comment, or `//Illuminate\X,` | null | — |
| Name mismatch | `structural/Foo.ts` exports `Bar` with an FQCN header; or `export { Impl as Foo }` | null | — |
| Outside structural | same file at `packages/contracts/src/console/X.ts` or `packages/other/src/structural/X.ts` | null | — |
| Registration wins | structural file also `registerClass("A\\B", Name)` or a contract token `Name` | `A\B` / the token FQCN | — |
| async-surface | real `packages/contracts` | gains exactly `Kernel.queue` (PendingDispatch) and `QueueingDispatcher.batch` (PendingBatch) thenable lines | — |
| Lint | `async function f(): Promise<PendingDispatch>` importing the structural file | `no-async-thenable-return` reports it with `Illuminate\Foundation\Bus\PendingDispatch` | — |

</intent-contract>

## Code Map

- `tools/lint-rules/thenables.ts:300` `localFqcn` -- after the registration check, when no import binding exists, try the structural rule; `moduleInfo` (`:250`) caches per path+mtime, so read the header there (add a `header` FQCN-or-null field to `ModuleInfo`, set by `moduleInfo` from the file text; `moduleInfoOf` stays statement-only and gives null). Header comment `:1-33` gains the rule.
- `tools/lint-rules/plugin.ts:1143` `noAsyncThenableReturn` -- uses `registeredFqcn` for imports, so no change; same-file use of a structural type inside its own file is not a case (the file declares only the type).
- `tools/async-surface/async-surface.ts:721` -- resolver is `registeredFqcn` over source paths; no change.
- `packages/contracts/src/console/Kernel.ts:38`, `packages/contracts/src/bus/QueueingDispatcher.ts:21` -- read-only sources of the two new lines.
- `packages/contracts/async-surface.json` -- regenerated by `bun run async-surface contracts`.
- `packages/contracts/tests/xaravel/namespaces.test.ts:368-379` -- XT-contracts-5's exact thenable list gains `["Bus\\QueueingDispatcher.batch", "Illuminate\\Bus\\PendingBatch"]`; test title mentions it.
- `packages/contracts/tests/xaravel/web.test.ts:13-16, 331-335, 430-436` -- XT-contracts-8: collect thenable lines into a map (not into `actualAsync`) and assert it equals exactly `[["Console\\Kernel.queue", "Illuminate\\Foundation\\Bus\\PendingDispatch"]]`; keep `assertFalse(actualAsync.has("Console\\Kernel.queue"))`; update comments.
- `conformance/tests/xaravel/async-surface.test.ts` -- new `XT-conformance-264` (after 263's style: temp files + `registeredFqcn`, plus the real CLI `--check contracts` and the two committed lines).
- `conformance/tests/xaravel/lint-signatures.test.ts:276-286, 389-394` -- XT-conformance-133 edge case: a temp `packages/contracts/src/structural/PendingDispatch.ts` and a demo importer reported with the FQCN.
- `_bmad-output/implementation-artifacts/story-manifests.md:19` -- XT-conformance-264 off-manifest for this item; next free `-265`.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/thenables.ts` -- structural rule + header comment.
- `packages/contracts/async-surface.json` -- regenerate.
- `packages/contracts/tests/xaravel/namespaces.test.ts`, `web.test.ts` -- assert the new lines as above.
- `conformance/tests/xaravel/async-surface.test.ts` -- XT-conformance-264 covering the I/O matrix rows except Lint.
- `conformance/tests/xaravel/lint-signatures.test.ts` -- the Lint row.
- `docs/ops/async-surface.md`, `docs/ops/lint.md`, `story-manifests.md` -- wording.

**Acceptance Criteria:**
- Given the change, when `bun run async-surface --all --check` runs, then it passes, and `git diff main -- 'packages/*/async-surface.json'` shows only the two added thenable lines in `packages/contracts`.
- Given the change, when the full `bun run harness`, `bun run typecheck` and `bun run lint` run, then all pass with no differences.
- Given the diff, then the only `packages/**` files changed are `packages/contracts/async-surface.json`, `namespaces.test.ts` and `web.test.ts`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/async-surface.test.ts conformance/tests/xaravel/lint-signatures.test.ts packages/contracts/tests/xaravel/namespaces.test.ts packages/contracts/tests/xaravel/web.test.ts` -- pass
- `bun run async-surface --all --check`, `bun run typecheck`, `bun run lint`, `bun run harness` -- pass, `differ=0`
- `bun run fidelity:review status --item epic-10-item-6-structural-thenables --spec _bmad-output/implementation-artifacts/spec-retro-10-structural-thenables.md` -- `current`

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 13, false 4, maybe-false 1
- findings:
  - `[false]` `[reject]` (blind) The diff leaves out the spec and does not answer reviewer 1's reject — the spec is excluded from the reviewed diff by design (it is the edge-case layer's claims file); the reject is this pass's Fidelity layer findings, triaged below.
  - `[low]` `[reject]` (blind) The resolver narrows ESC-10.3-2 (a structural file's own `this` and self-references stay unresolved) without recording it — it is recorded in the `thenables.ts` header, `docs/ops/async-surface.md` and pinned by XT-conformance-264; the only fix left would edit this spec. It is the one reading that meets the action's "no other packages/contracts file changes": the literal reading adds about 14 `src/structural/PendingDispatch.ts` / `PendingBatch.ts` lines, which fail XT-contracts-8's "every non-PSR entry is in scope" check unless `tests/xaravel/support/contract-namespaces.ts` changes. Raised for the Maintainer's confirmation under Auto Run Result.
  - `[low]` `[patch]` (blind) `web.test.ts`'s header still says ESC-10.3-1 waits on the Maintainer — patched: it cites the ruling (sync under DIV-1.5).
  - `[low]` `[patch]` (blind) The bare-specifier route real consumers use (`@xaravel/contracts/console` through type-only barrel re-exports) is untested — patched: XT-conformance-264 resolves `PendingDispatch` and `PendingBatch` through `@xaravel/contracts/console` and `/bus`.
  - `[low]` `[reject]` (blind) A single-word header (`// A subset …`) would resolve — the file must also be `<A>.ts` exporting `A`; a single-segment class name (`Countable`) is a valid FQCN under the ruling's "a class name".
  - `[low]` `[reject]` (blind) A malformed header fails silently for future structural thenables — no such file exists; a header lint over every structural file is new surface beyond the item; the exact thenable-set assertions catch the current two.
  - `[low]` `[patch]` (blind) `docs/ops/lint.md` gives only the comma form — patched: both forms, the export condition and the "reached from another module" condition.
  - `[false]` `[reject]` (blind) Sprint tracking is not updated — the orchestrator sets the item's status with SPS when it lands (iteration step D), not the build.
  - `[low]` `[patch]` (blind) The Proofs paragraph in `docs/ops/async-surface.md` reads badly — patched: a comma list naming the five thenable lines.
  - `[low]` `[reject]` (blind) XT-conformance-264's CLI check runs only on the real package — XT-conformance-263 already covers the temp-package CLI path; the real-package `--check` is the surface the intent names.
  - `[low]` `[reject]` (edge) A UTF-8 BOM before the header hides it — no repository file has a BOM, and the guard adds a branch for an input never shown to occur.
  - `[low]` `[reject]` (intent) Divergence a, the self-reference carve-out — same root cause as the blind narrowing finding; see that row.
  - `[low]` `[patch]` (intent) Divergence b, the bare-specifier route untested — same root cause as the blind bare-specifier finding; patched there.
  - `[low]` `[reject]` (intent) Divergence c, a leading `\` is accepted — the shared resolver normalises a leading `\` for `registerClass` and tokens too (`normaliseFqcn`); consistent, harmless.
  - `[false]` `[reject]` (intent) Divergence d, the resolver is tested only under `conformance/` — descriptive; it matches the ruling's split of review layers.
  - `[false]` `[reject]` (verification-gap) No gaps found — nothing to route.
  - `[maybe-false]` `[defer]` (fidelity, standing reviewer 1 F-7) `namespaces.test.ts`: the API-surface rows, Upstream declarations and contract implementations XT-contracts-5 reads are not in the prompt — no defect is named; it is the evidence gap the Maintainer waived for Story 10.2 (ESC-10.2-9, ESC-10.2-10) rather than enlarge the prompt. Settled only by a Maintainer ruling for this item.
  - `[low]` `[defer]` (fidelity, standing reviewer 1 F-7) `web.test.ts`: the API-surface rows, Upstream sources, `console/Kernel.ts` and `structural/PendingDispatch.ts` are not in the prompt — the same gap; same route. Reviewer 2 passed F-7 on the same tree.

## Auto Run Result

Status: done
Resolved 2026-10-24: the Maintainer waived F-7 for this item and confirmed the structural-file narrowing (`decisions/ESC-10.3-2.md`, #368). After merging `origin/main`, the item's checks passed again on tree `bf54705307d28eb2ff1e237f96d4b0d8a0140c06`: the four test files (8 pass), `bun run async-surface --all --check` (ok, 51 packages), `bun run typecheck`, `bun run lint` and the full `bun run harness`. Its Fidelity Review is `current`: reviewer 2 passes, and reviewer 1's reject fails only F-7, which the waiver covers.

Earlier blocking condition (kept for the record): the item's Fidelity Review is not `current`. Reviewer 1 (codex) rejects F-7 only, at tree `1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48`, asking for evidence the prompt does not carry: the `contracts.jsonl` rows, Upstream sources and contract/structural files that XT-contracts-5 and XT-contracts-8 read. Reviewer 2 passes every item. It names no defect. This is the gap the Maintainer waived for Story 10.2 rather than enlarge the prompt (ESC-10.2-9, ESC-10.2-10: options "raise `WHOLE_FILE_CAP`" and "widen `dataFileExcerpt`" not taken). A carried F-7 finding must fail again on a re-run (ESC-8.8-1 item 3), so a re-review would not clear it. Only the Maintainer can waive a Fidelity item for this item (`decisions/MAINT-2026-10-23-fidelity-waivers.md`), so the item waits on the Maintainer. The built change is saved on the branch `planning/retro-10-structural-thenables`; after a ruling, the next iteration resumes it and re-runs the review on the current tree.

- **Summary.** `registeredFqcn` (via `localFqcn` in `tools/lint-rules/thenables.ts`) resolves a binding `<Name>`, reached from another module, that is declared and exported under its own name in `…/packages/contracts/src/structural/<Name>.ts` and that nothing registers, to the FQCN its first line names (`// <FQCN>,…` or `// <FQCN> …`). `packages/contracts/async-surface.json` gains exactly `Kernel.queue` → `Illuminate\Foundation\Bus\PendingDispatch` and `QueueingDispatcher.batch` → `Illuminate\Bus\PendingBatch`.
- **Files.** `tools/lint-rules/thenables.ts` (rule, header); `packages/contracts/async-surface.json` (regenerated); `packages/contracts/tests/xaravel/namespaces.test.ts` (XT-contracts-5 gains the batch line); `packages/contracts/tests/xaravel/web.test.ts` (XT-contracts-8: exact thenable set `Console\Kernel.queue`, stale ESC comments); `conformance/tests/xaravel/async-surface.test.ts` (XT-conformance-264); `conformance/tests/xaravel/lint-signatures.test.ts` (XT-conformance-133 structural case); `docs/ops/async-surface.md`, `docs/ops/lint.md`; `story-manifests.md` (XT-conformance-264 off-manifest, next free `-265`).
- **Review.** 18 findings: 5 low patched (4 fixes), 7 low rejected and 4 false (reasons in the triage log), 2 Fidelity F-7 findings deferred to the Maintainer. Follow-up review recommended: false (no medium or high patched).
- **For the Maintainer to confirm.** The rule does not apply to a structural file's own `this`, so `PendingDispatch.onQueue(): this` and the other fluent methods of the two structural files get no thenable lines. The literal reading of ESC-10.3-2 would add about 14 such lines, which fail XT-contracts-8 unless `tests/xaravel/support/contract-namespaces.ts` changes, and the action allows no other `packages/contracts` file change.
- **Verification** (patched tree). The four test files: 8 pass. `bun run async-surface --all --check`: ok (51 packages). `bun run typecheck`, `bun run lint`: clean. `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (the 7 not-run Variants have no local backend).
- **Residual risks.** A malformed structural header silently drops a thenable; only the exact-set assertions guard the two current ones.

## Fidelity Review

### Reviewer 1: reject at tree 1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47`, on 2026-10-24T07:51:01.639Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item adds or changes no Ported Test; there are no Upstream test assertions to match. |
| F-2: No expected value is weakened | pass | Compared the changed assertions with the diff and ESC-10.3-2. Exact comparisons remain exact; the two new thenable expectations implement the expressly approved change. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new thenable comparisons match ESC-10.3-2, but the supplied evidence does not establish all consequences declared by the two changed Xaravel Tests. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the scoped diff with the contracts component and ESC-10.3-2's explicit route exception. It changes generated metadata and contracts tests, with no implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file is touched and no @​asyncRoot tag is added or retained in a touched source file. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/namespaces.test.ts`: Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks.
- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48","base":"4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T07:51:01.639Z","items":[{"id":"F-1","result":"n/a","note":"The item adds or changes no Ported Test; there are no Upstream test assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed assertions with the diff and ESC-10.3-2. Exact comparisons remain exact; the two new thenable expectations implement the expressly approved change.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test changes, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The new thenable comparisons match ESC-10.3-2, but the supplied evidence does not establish all consequences declared by the two changed Xaravel Tests.","findings":[{"path":"packages/contracts/tests/xaravel/namespaces.test.ts","detail":"Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks."},{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence."}]},{"id":"F-8","result":"pass","note":"Compared the scoped diff with the contracts component and ESC-10.3-2's explicit route exception. It changes generated metadata and contracts tests, with no implementation of another component.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file is touched and no @asyncRoot tag is added or retained in a touched source file.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47`, on 2026-10-24T07:51:01.639Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests and changes none; it touches only Xaravel Tests XT-contracts-5 and XT-contracts-8. |
| F-2: No expected value is weakened | n/a | No Ported Test or Upstream expected value changes. In XT-contracts-8 the old assertion that no thenable line exists was replaced by an exact check of the one expected line. That is stricter, and ESC-10.3-2 calls for it. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test. No Xaravel Test assertion is dropped: XT-contracts-8's placeholder assertSame(undefined, entry.thenable) is replaced by handling of the thenable line plus a new exact assertion, as ESC-10.3-2 directs. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker and cites no DIV clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is relied on, and there are no assigned Oracle requests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-5 now claims QueueingDispatcher.batch's PendingBatch thenable, and its body asserts the exact sorted thenable list, which includes that line. XT-contracts-8 claims Console\Kernel.queue sync with its PendingDispatch thenable as the only thenable line. Its body checks the signature, the structural header, the absence of a root, and the exact thenable list. The cited AD-1.1, AD-1.2, AD-6 and ESC-10.3-2 match what the bodies verify. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change is confined to packages/contracts (the generated async-surface.json and its tests), plus the tools/lint-rules resolver that ESC-10.3-2 authorises. It adds no stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No packages/*/src file is touched and no @​asyncRoot tag is added. The two new async-surface lines are thenable lines, which carry no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"1d87d0d6a5e9b396e0af9d7f745b7cd4ae1fca48","base":"4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T07:51:01.639Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests and changes none; it touches only Xaravel Tests XT-contracts-5 and XT-contracts-8.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or Upstream expected value changes. In XT-contracts-8 the old assertion that no thenable line exists was replaced by an exact check of the one expected line. That is stricter, and ESC-10.3-2 calls for it.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test. No Xaravel Test assertion is dropped: XT-contracts-8's placeholder assertSame(undefined, entry.thenable) is replaced by handling of the thenable line plus a new exact assertion, as ESC-10.3-2 directs.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker and cites no DIV clause.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is relied on, and there are no assigned Oracle requests.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-5 now claims QueueingDispatcher.batch's PendingBatch thenable, and its body asserts the exact sorted thenable list, which includes that line. XT-contracts-8 claims Console\\Kernel.queue sync with its PendingDispatch thenable as the only thenable line. Its body checks the signature, the structural header, the absence of a root, and the exact thenable list. The cited AD-1.1, AD-1.2, AD-6 and ESC-10.3-2 match what the bodies verify.","findings":[]},{"id":"F-8","result":"pass","note":"The change is confined to packages/contracts (the generated async-surface.json and its tests), plus the tools/lint-rules resolver that ESC-10.3-2 authorises. It adds no stub or fake of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No packages/*/src file is touched and no @asyncRoot tag is added. The two new async-surface lines are thenable lines, which carry no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree bf54705307d28eb2ff1e237f96d4b0d8a0140c06

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47`, on 2026-10-24T08:26:10.901Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed. |
| F-2: No expected value is weakened | pass | Compared the changed assertions with their previous forms and ESC-10.3-2. Exact thenable comparisons add the two approved entries; web coverage still rejects unexpected thenables and roots. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new thenable assertions match ESC-10.3-2, but the full consequences remain unverifiable because the inputs identified by P-1 and P-2 are absent. The recorded F-7 waiver acknowledges this gap; it does not supply the requested evidence. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the scoped diff with the action entry and ESC-10.3-2. The contracts changes update generated metadata and tests without implementing another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file or @​asyncRoot tag is changed; the added metadata entries describe synchronous thenable returns. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/namespaces.test.ts`: P-1 remains unresolved: supply the API-surface rows, Upstream declarations/constants and relevant imported contract implementations needed to verify XT-contracts-5's full consequence.
- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: P-2 remains unresolved: supply the API-surface rows, Upstream sources and contract/structural files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/namespaces.test.ts`: Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks. **not fixed**: Checked the supplied evidence and ESC-10.3-2 waiver. The requested rows, Upstream inputs and imported implementations are still absent; the waiver does not provide them.
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/web.test.ts`: Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence. **not fixed**: Checked the supplied evidence and waiver. The requested source inputs, including Kernel.ts and PendingDispatch.ts, remain absent; assertions that read those files do not supply their contents.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"bf54705307d28eb2ff1e237f96d4b0d8a0140c06","base":"4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T08:26:10.901Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the changed assertions with their previous forms and ESC-10.3-2. Exact thenable comparisons add the two approved entries; web coverage still rejects unexpected thenables and roots.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"The new thenable assertions match ESC-10.3-2, but the full consequences remain unverifiable because the inputs identified by P-1 and P-2 are absent. The recorded F-7 waiver acknowledges this gap; it does not supply the requested evidence.","findings":[{"path":"packages/contracts/tests/xaravel/namespaces.test.ts","detail":"P-1 remains unresolved: supply the API-surface rows, Upstream declarations/constants and relevant imported contract implementations needed to verify XT-contracts-5's full consequence."},{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"P-2 remains unresolved: supply the API-surface rows, Upstream sources and contract/structural files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts."}]},{"id":"F-8","result":"pass","note":"Compared the scoped diff with the action entry and ESC-10.3-2. The contracts changes update generated metadata and tests without implementing another Component's behavior.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file or @asyncRoot tag is changed; the added metadata entries describe synchronous thenable returns.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/namespaces.test.ts","detail":"Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks.","fixed":false,"note":"Checked the supplied evidence and ESC-10.3-2 waiver. The requested rows, Upstream inputs and imported implementations are still absent; the waiver does not provide them."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence.","fixed":false,"note":"Checked the supplied evidence and waiver. The requested source inputs, including Kernel.ts and PendingDispatch.ts, remain absent; assertions that read those files do not supply their contents."}]}
```

### Reviewer 2: pass at tree bf54705307d28eb2ff1e237f96d4b0d8a0140c06

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47`, on 2026-10-24T08:26:10.901Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the item assigns none. |
| F-2: No expected value is weakened | n/a | No Ported Test expected value changes. XT-contracts-5 and -8 only gain the two thenable lines. The earlier 'thenable is undefined' assertion in -8 was replaced by a branch that records the thenable line and asserts it has no root, and a new assertion pins the Kernel.queue line. Nothing is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests; no assertion is removed (XT-contracts-8 swaps one assertion for a stricter check). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations skip lines are set. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers are added. The DIV-1.5 mention is a comment only. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures are relied on. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-5 and -8 bodies assert the new consequence text: the exact sorted thenable list including Bus\QueueingDispatcher.batch -> PendingBatch, and Console\Kernel.queue -> PendingDispatch as the only thenable line with no root. The cited AD-6 and ESC-10.3-2 match. ESC-10.3-2 waives F-7 for this item for the evidence gap P-1 and P-2 name (the contracts.jsonl rows and Upstream sources the prompt cannot carry). |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are the regenerated async-surface.json lines and two tests in packages/contracts. No stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No packages/*/src file is touched and no @​asyncRoot tag is added. The two new async-surface lines are thenable lines, which take no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/namespaces.test.ts`: Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks. **fixed**: The evidence gap (contracts.jsonl rows and Upstream sources for XT-contracts-5) is the one ESC-10.3-2 waives for F-7 on this item. The test body asserts the new batch thenable line, which matches the committed async-surface.json diff.
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/web.test.ts`: Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence. **fixed**: Same waiver in ESC-10.3-2 covers the XT-contracts-8 inputs. The body asserts Kernel.queue sync, its header, and the only thenable line, matching the async-surface.json diff.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"bf54705307d28eb2ff1e237f96d4b0d8a0140c06","base":"4bcdebfa4e7cd9dc71ae58754a282aa1e8deed47","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T08:26:10.901Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the item assigns none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected value changes. XT-contracts-5 and -8 only gain the two thenable lines. The earlier 'thenable is undefined' assertion in -8 was replaced by a branch that records the thenable line and asserts it has no root, and a new assertion pins the Kernel.queue line. Nothing is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests; no assertion is removed (XT-contracts-8 swaps one assertion for a stricter check).","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations skip lines are set.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers are added. The DIV-1.5 mention is a comment only.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures are relied on.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-5 and -8 bodies assert the new consequence text: the exact sorted thenable list including Bus\\QueueingDispatcher.batch -> PendingBatch, and Console\\Kernel.queue -> PendingDispatch as the only thenable line with no root. The cited AD-6 and ESC-10.3-2 match. ESC-10.3-2 waives F-7 for this item for the evidence gap P-1 and P-2 name (the contracts.jsonl rows and Upstream sources the prompt cannot carry).","findings":[]},{"id":"F-8","result":"pass","note":"Changes are the regenerated async-surface.json lines and two tests in packages/contracts. No stub or fake of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No packages/*/src file is touched and no @asyncRoot tag is added. The two new async-surface lines are thenable lines, which take no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/namespaces.test.ts","detail":"Supply the committed conformance/api-surface/contracts.jsonl rows and Upstream declarations/constants read by XT-contracts-5, plus the relevant imported contract implementations. These inputs are absent from the prompt, preventing confirmation of its declared export, parameter, constant and inheritance checks.","fixed":true,"note":"The evidence gap (contracts.jsonl rows and Upstream sources for XT-contracts-5) is the one ESC-10.3-2 waives for F-7 on this item. The test body asserts the new batch thenable line, which matches the committed async-surface.json diff."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"Supply the API-surface rows, Upstream sources and contract/structural source files read by XT-contracts-8, including console/Kernel.ts and structural/PendingDispatch.ts. Their contents are absent from the prompt, preventing confirmation of the full declared consequence.","fixed":true,"note":"Same waiver in ESC-10.3-2 covers the XT-contracts-8 inputs. The body asserts Kernel.queue sync, its header, and the only thenable line, matching the async-surface.json diff."}]}
```
