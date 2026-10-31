---
title: 'A compiled-pattern cache for the runtime preg_* functions'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: dcfcb1207608e64d0f89c72c5c1eff58f92202b0
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-30-epic-15-items.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every `preg_*` call reconverts its PHP pattern (split, tokenize, emit, `new RegExp`), which made `Dotenv.parse` about 30× slower than PHP (decisions/MAINT-2026-10-30-epic-15-items.md, Item 6; action item `epic-15-retro-item-9-runtime-pcre-pattern-cache`). `pcre.ts` says "No compiled pattern is cached (AD-5)", which the ruling corrects: a cache keyed only by pattern text and flags is memoization of a pure conversion.

**Approach:** Cache `compilePattern`'s conversion result per pattern string (the pattern string carries its modifiers, so it is "pattern text and flags") in a process-wide, bounded LRU of 4096 entries (PHP's `PCRE_CACHE_SIZE`), caching a compile failure (null) too. The cached value is frozen and holds no `RegExp` with state: `searchRegExp` returns a fresh `RegExp` built from the cached `source` and `flags` on every call, so no two calls ever share `lastIndex`.

## Boundaries & Constraints

**Always:** scope `packages/runtime/**` and this item's records; results, `$matches`, counts, errors and `preg_last_error` / `preg_last_error_msg` exactly as before; the JS `TypeError` limit still names the calling function (so a throw is never cached: its message holds `fn`); `pcre.ts` cites `decisions/MAINT-2026-10-30-epic-15-items.md`; the docs sentence "Each call compiles its pattern; nothing is cached" is rewritten to the new rule; new evidence recorded with the host's PHP 8.5.11 through the existing probe.

**Never:** another component, PORTING.md, a DIV, the grader or Expectations; a cached `g` / `y` `RegExp` handed to a call; cache keys holding anything but the pattern string; per-request data in the cache; any other runtime behaviour change; weakening or removing an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| nested global | `preg_replace_callback('/a/', cb, 'xaya')`, `cb` runs `preg_match_all('/a/','aaa')`, `preg_split('/a/','bab')`, `preg_match('/a/','zza',$m,0,1)` | PHP's results for outer and inner calls | No error |
| nested sticky | `preg_replace_callback('/a/A', cb, 'aab')`, `cb` runs `preg_match('/a/A','ba',$m,0,1)`, `preg_match_all('/a/A','aaba')` | PHP's results | No error |
| nested empty-match retry | `preg_replace_callback('/x*/', cb, 'axb')`, `cb` runs `preg_split('/x*/','axb')` | PHP's results | No error |
| sequential offsets | `preg_match('/b/','abcb',$m,256,3)` then `preg_match('/b/','abcb',$m,256)` | `[["b",3]]` then `[["b",1]]` | No error |
| cached failure | `preg_match('/(/','a')` twice, `preg_match('/a/','a')`, `preg_split('/(/','a')` | false/1, false/1, 1/0, false/1 | error code as PHP |
| limit names caller | `preg_match('/a/x','a')` then `preg_split('/a/x','a')` | JS `TypeError` naming `preg_match()`, then `preg_split()` | Xaravel-only |
| LRU bound | 4096 other patterns after one | the first is converted again (a new entry) | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/pcre.ts:16` -- header line "No compiled pattern is cached (AD-5)": replace with the cache rule citing the ruling.
- `packages/runtime/src/php/pcre.ts:20-37` -- `PcrePattern`; its `search: RegExp` (line 31) is the shared stateful object to remove.
- `pcre.ts:938-977` `compilePattern(fn, pattern)` -- conversion; `new RegExp(...)` at 963 also detects `SyntaxError` (keep a validating construction). `Parser`'s `fn` (287) is used only in the 27 `limit(this.fn, …)` throws, so a successful/null result depends only on `pattern`.
- `pcre.ts:1053-1056` `searchRegExp` -- resets and returns `pattern.search`; return a fresh `RegExp(source, flags + (anchored ? "y" : "g"))`.
- `pcre.ts:1062` `pcreExec` -- sets `lastIndex` itself; the `notEmpty` retry already builds a fresh `RegExp`; unchanged.
- `packages/runtime/src/php/pcreFunctions.ts:204-210` `compiled`, and 560-561 -- callers of `compilePattern`; record `PREG_INTERNAL_ERROR` on null per call (unchanged, so a cached null still records error 1).
- `packages/runtime/docs/php-functions.md:736-737` -- "Each call compiles its pattern; nothing is cached." sentence.
- `packages/runtime/tests/xaravel/php-pcre-functions.probe.php` -- `record(label, calls, run)`, helpers `pm`/`pma`/`ps`/`prc`; add a label `cache.interleaved` before the XT-runtime-138 block.
- `packages/runtime/tests/xaravel/php-pcre-functions.probe.txt` -- one line per label; regenerate to a temp file and apply only the new line as a patch (never redirect over the tracked file).
- `packages/runtime/tests/xaravel/php-pcre-functions.test.ts` -- `RUNNERS` (150), `assertLabels` (210), header comment lists XT IDs; the label set check in XT-runtime-138 requires every recorded label to be in `RUNNERS`. Last Xaravel Test ID is XT-runtime-146; the new test is XT-runtime-147.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/pcre.ts` -- drop `search` from `PcrePattern`; split `compilePattern` into the conversion plus a cache lookup (Map LRU, 4096, delete-and-reinsert on hit, evict the oldest on insert when full, null cached, throws not cached); freeze the result and its arrays; `searchRegExp` builds a fresh `RegExp`; rewrite the header note citing the ruling.
- `packages/runtime/docs/php-functions.md` -- rewrite the cache sentence.
- `packages/runtime/tests/xaravel/php-pcre-functions.probe.php` -- add `cache.interleaved` with the matrix's PHP rows.
- `packages/runtime/tests/xaravel/php-pcre-functions.probe.txt` -- add its recorded line.
- `packages/runtime/tests/xaravel/php-pcre-functions.test.ts` -- add the runner and XT-runtime-147: `assertLabels(["cache.interleaved"])`, plus Xaravel-only checks: the same pattern string gives the same frozen entry, `searchRegExp` gives distinct `RegExp`s, the limit names each caller, and the LRU bound evicts; header lists XT-runtime-147.

**Acceptance Criteria:**
- Given the recorded `cache.interleaved` line, when XT-runtime-147 runs each case through `@xaravel/runtime/php`, then every result equals PHP's.
- Given the existing probe records, when XT-runtime-135..138 run, then they pass unchanged.
- Given `bun run harness`, `bun run typecheck` and `bun run lint`, when run on the change, then each reports no difference or error.

## Design Notes

A fresh `RegExp` per call is cheap: JavaScriptCore caches the compiled bytecode by source and flags, so the saving comes from skipping the PHP-pattern conversion, the costly part. A per-call `RegExp` also makes reentrancy (a `preg_replace_callback` callback calling `preg_*` with the same pattern) safe by construction, with no reset that a nested call could break.

## Verification

**Commands:**
- `bun test packages/runtime/tests/xaravel/php-pcre-functions.test.ts` -- expected: all pass
- `bun run harness --component runtime` then `bun run harness` -- expected: no differences
- `bun run typecheck` and `bun run lint` -- expected: clean

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 7, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) LRU recency untested: a FIFO cache passes XT-runtime-147 — added a full-cache hit-then-insert check; confirmed it fails with the hit branch's delete+set removed.
  - `[false]` `[reject]` (blind) the PHP-evidence cases cannot fail on the old shared `RegExp` — true of the parity cases, but the claim that sharing goes undetected is refuted: `first !== second` and `"search" in entry` fail if `searchRegExp` returns a shared object.
  - `[low]` `[patch]` (blind) no `preg_replace_callback` nested inside a callback with the same pattern — added the `nested-replace` case, recorded from PHP 8.5.11.
  - `[low]` `[patch]` (blind) a cached compile failure is not checked through `preg_match_all` and `preg_replace_callback`'s own path (`pcreFunctions.ts:561`) — extended the `failure` case with the three calls, recorded from PHP.
  - `[false]` `[reject]` (blind) keys that differ only by modifiers or delimiter are untested — `preg_match.forms` already runs `/a/`, `/a/A`, `~a~i`, `/a/i` and others in the same process through the cache, and matches PHP.
  - `[false]` `[reject]` (blind) the LRU test depends on test order through process-wide state — the test is synchronous, so no call interleaves; evicting earlier entries changes no result, only warmth.
  - `[low]` `[reject]` (blind) no measurement of the speed-up — the intent sets no performance AC; no code defect, and a fix would only add records.
  - `[false]` `[reject]` (blind) the Design Notes' JSC claim and the `notEmpty` retry — the fix edits this build's spec.
  - `[low]` `[reject]` (blind) a pattern built from request input stays in the process-wide cache — the ruling allows a cache keyed by pattern text; an entry depends only on its key and changes no result; PHP's own per-process PCRE cache keeps the same strings; the bound is 4096 entries as in PHP.
  - `[false]` `[reject]` (blind) sprint status not updated — the orchestrator sets the item `done` in the same PR, outside the build.
  - `[false]` `[reject]` (blind) Code Map line numbers stale — the fix edits this build's spec.
  - `[false]` `[reject]` (blind) frozen `names` / `phpOf` could be written by callers — both are `readonly` arrays in `PcrePattern` and `tsc --strict` passes, so no caller writes them.
  - `[low]` `[patch]` (blind) the docs' "a compile failure included" may read as a hidden divergence — added that it is unobservable, the error code being recorded on every call.
  - `[low]` `[reject]` (blind) the Design Notes give no reason for fresh-over-reset — the fix edits this build's spec (the reason is the reentrancy sentence there).
  - `[false]` `[reject]` (intent-alignment) the parity cases do not discriminate sharing, and "no other behaviour change" rests on the existing probes — the intent asks for cases showing PHP results, which they give; non-sharing is pinned by the Xaravel-only checks, and XT-runtime-135..138 pass unchanged.
- edge-case hunter: no findings. Fidelity Review: pass, pass at tree 7ab3a49a (zero findings); re-run on the patched tree.

### 2026-10-30 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; reviewer 1 pass (codex), reviewer 2 pass (claude) at tree 44a52d93cd21dbfc7a5e7e1525ac1333701b24b5.

## Auto Run Result

Status: done

- **Change:** the runtime's `preg_*` functions cache each pattern string's conversion in a process-wide 4096-entry LRU (compile failures included, limits not), with frozen entries and a fresh `RegExp` per call (decisions/MAINT-2026-10-30-epic-15-items.md, Item 6).
- **Files:** `packages/runtime/src/php/pcre.ts` (cache, `convertPattern`, fresh `searchRegExp`, header note); `packages/runtime/docs/php-functions.md` (cache rule); `packages/runtime/tests/xaravel/php-pcre-functions.probe.php` / `.probe.txt` (`cache.interleaved`, recorded with PHP 8.5.11); `packages/runtime/tests/xaravel/php-pcre-functions.test.ts` (XT-runtime-147).
- **Review:** 4 low patches (LRU-vs-FIFO check, nested `preg_replace_callback` case, cached failure through `preg_match_all` / `preg_replace_callback`, docs wording); 0 deferred; 11 rejected, each with its reason in the triage log.
- **Follow-up review recommended:** false (patched: high 0, medium 0, low 4).
- **Verification:** `bun test` on the pcre file 5/5 pass; `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (redis, sqlsrv and other backends NOT-RUN locally); `bun run typecheck` and `bun run lint` clean; `bun run harness --component runtime` reports no Test ID for that filter, so `--xaravel` and the full run were used. Fidelity Review `current` at tree 44a52d93.
- **Residual risks:** the speed-up on `Dotenv.parse` was not measured.

## Fidelity Review

### Reviewer 1: pass at tree 7ab3a49a2178da6d45fcbd1dd2e64073be371adc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `dcfcb1207608e64d0f89c72c5c1eff58f92202b0`, on 2026-10-31T03:09:04.692Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The diff preserves existing assertions and expected probe results. New cases compare exact PHP probe results without weakening comparisons. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no changed Ported Tests whose assertion counts require comparison with Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-147 checks nested global, sticky and empty-match calls against matching PHP probes, plus offsets, failure codes, immutable entries, independent RegExp instances, caller-specific limits and eviction. Existing touched tests retain their consequence checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are within packages/runtime. The cache implements runtime pattern conversion under the supplied Maintainer ruling and introduces no other Component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared pcre.ts's full source and declaration inventory with AD-6 and DIV-1: its exports remain synchronous, perform no IO and accept no async callbacks, so no asyncRoot tags are required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"7ab3a49a2178da6d45fcbd1dd2e64073be371adc","base":"dcfcb1207608e64d0f89c72c5c1eff58f92202b0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:09:04.692Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing assertions and expected probe results. New cases compare exact PHP probe results without weakening comparisons.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no changed Ported Tests whose assertion counts require comparison with Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-147 checks nested global, sticky and empty-match calls against matching PHP probes, plus offsets, failure codes, immutable entries, independent RegExp instances, caller-specific limits and eviction. Existing touched tests retain their consequence checks.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are within packages/runtime. The cache implements runtime pattern conversion under the supplied Maintainer ruling and introduces no other Component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Compared pcre.ts's full source and declaration inventory with AD-6 and DIV-1: its exports remain synchronous, perform no IO and accept no async callbacks, so no asyncRoot tags are required.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 7ab3a49a2178da6d45fcbd1dd2e64073be371adc

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `dcfcb1207608e64d0f89c72c5c1eff58f92202b0`, on 2026-10-31T03:09:04.692Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test and no Expectations line; only Xaravel Tests (XT-runtime-147 and the shared probe helpers) change. |
| F-2: No expected value is weakened | pass | Touched Xaravel Tests XT-runtime-135..138 compare runtime results with php-pcre-functions.probe.txt; the diff only adds the new cache.interleaved line, and every existing recorded result is unchanged. XT-runtime-147's expected values are PHP 8.5.11 probe output (e.g. xXyX/2, XXb/2, the empty-match retry, offsets, [false,1] twice for /(/), compared exactly per argument list. Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. The touched Xaravel Tests lose no assertions; XT-runtime-138's body is unchanged. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed. No Oracle fixture is relied on; the expected values come from the PHP probe. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-147's consequence is checked by its body. Global, sticky and empty-match-retry calls nested in a preg_replace_callback callback, sequential offsets and a cached compile failure with its error code all go through assertLabels(['cache.interleaved']) against PHP output. The frozen entry is checked with Object.isFrozen on the entry, names and phpOf. A separate RegExp per call is checked by the RegExp identity, lastIndex and global/sticky flag assertions. 'Limit names each caller' is checked by the TypeError messages of preg_match, preg_split, preg_match_all and preg_replace_callback. 'At most 4096 entries' is checked: the first pattern is kept after 4095 newer ones and evicted after 4096. The string cites bare AD-5 and decision MAINT-2026-10-30 Item 6, whose text the cache matches (a pure memo, no shared stateful RegExp, an LRU allowed). It cites no FR/AD bullet token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/runtime files change: pcre.ts, docs/php-functions.md and the runtime's own test, probe and probe output. No other Component's behaviour is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in pcre.ts. The new export PATTERN_CACHE_SIZE is a constant and compilePattern stays sync. No method does async-root IO or takes an async callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"7ab3a49a2178da6d45fcbd1dd2e64073be371adc","base":"dcfcb1207608e64d0f89c72c5c1eff58f92202b0","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:09:04.692Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test and no Expectations line; only Xaravel Tests (XT-runtime-147 and the shared probe helpers) change.","findings":[]},{"id":"F-2","result":"pass","note":"Touched Xaravel Tests XT-runtime-135..138 compare runtime results with php-pcre-functions.probe.txt; the diff only adds the new cache.interleaved line, and every existing recorded result is unchanged. XT-runtime-147's expected values are PHP 8.5.11 probe output (e.g. xXyX/2, XXb/2, the empty-match retry, offsets, [false,1] twice for /(/), compared exactly per argument list. Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. The touched Xaravel Tests lose no assertions; XT-runtime-138's body is unchanged.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed. No Oracle fixture is relied on; the expected values come from the PHP probe.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-147's consequence is checked by its body. Global, sticky and empty-match-retry calls nested in a preg_replace_callback callback, sequential offsets and a cached compile failure with its error code all go through assertLabels(['cache.interleaved']) against PHP output. The frozen entry is checked with Object.isFrozen on the entry, names and phpOf. A separate RegExp per call is checked by the RegExp identity, lastIndex and global/sticky flag assertions. 'Limit names each caller' is checked by the TypeError messages of preg_match, preg_split, preg_match_all and preg_replace_callback. 'At most 4096 entries' is checked: the first pattern is kept after 4095 newer ones and evicted after 4096. The string cites bare AD-5 and decision MAINT-2026-10-30 Item 6, whose text the cache matches (a pure memo, no shared stateful RegExp, an LRU allowed). It cites no FR/AD bullet token.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/runtime files change: pcre.ts, docs/php-functions.md and the runtime's own test, probe and probe output. No other Component's behaviour is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in pcre.ts. The new export PATTERN_CACHE_SIZE is a constant and compilePattern stays sync. No method does async-root IO or takes an async callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 44a52d93cd21dbfc7a5e7e1525ac1333701b24b5

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `dcfcb1207608e64d0f89c72c5c1eff58f92202b0`, on 2026-10-31T03:16:42.649Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test or assigned Ported Test ID is added or changed. |
| F-2: No expected value is weakened | pass | The diff preserves existing expected values and exact comparisons; new cache cases compare complete results with the supplied PHP probe output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds or changes no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched test bodies, helpers and PHP probes with their consequences. Nested global, sticky and retry calls, sequential offsets, failure codes, frozen entries, separate RegExp instances, caller-specific limits and LRU eviction are checked; existing checks remain intact. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are within packages/runtime, the item's authorized component. The cache implements the supplied Maintainer ruling and introduces no other component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete changed pcre.ts and declaration inventory with AD-6 and DIV-1. Its exports perform synchronous conversion and matching, with no IO or async callbacks requiring a tag; no asyncRoot tags are retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"44a52d93cd21dbfc7a5e7e1525ac1333701b24b5","base":"dcfcb1207608e64d0f89c72c5c1eff58f92202b0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:16:42.649Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test or assigned Ported Test ID is added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing expected values and exact comparisons; new cache cases compare complete results with the supplied PHP probe output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds or changes no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched test bodies, helpers and PHP probes with their consequences. Nested global, sticky and retry calls, sequential offsets, failure codes, frozen entries, separate RegExp instances, caller-specific limits and LRU eviction are checked; existing checks remain intact.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are within packages/runtime, the item's authorized component. The cache implements the supplied Maintainer ruling and introduces no other component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete changed pcre.ts and declaration inventory with AD-6 and DIV-1. Its exports perform synchronous conversion and matching, with no IO or async callbacks requiring a tag; no asyncRoot tags are retained.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 44a52d93cd21dbfc7a5e7e1525ac1333701b24b5

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `dcfcb1207608e64d0f89c72c5c1eff58f92202b0`, on 2026-10-31T03:16:42.649Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test. The only test touched is an Xaravel Test (XT-runtime-147 plus the shared RUNNERS helper), so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | No existing expected value changed. The diff to php-pcre-functions.probe.txt only adds the new 'cache.interleaved' line, and the probe.php diff only adds the matching record() block. The new expected values are what PHP 8.5.11 returned, and they are compared exactly through assertLabels (string equality per argument list). Nothing was loosened, and no Xaravel result was written into an expected value. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. No assertion was removed from XT-runtime-135 to 138: the only change near them is the new RUNNERS entry. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations line, so there is no Skip Reason or precedence to check. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field is added or kept in the changed lines. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the change relies on no Oracle fixture, and none is an error. The XT tests here rest on the PHP probe output, not on Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared XT-runtime-147's consequence string with its body, claim by claim: - Global, sticky and empty-match-retry calls nested in a preg_replace_callback callback: the 'cache.interleaved' cases global, sticky and retry, compared with PHP output. - Sequential calls with different offsets: the offsets case. - A cached compile failure keeps its error code: the failure case calls preg_match on '/(/' twice and checks preg_last_error each time, then repeats it through preg_split, preg_match_all and preg_replace_callback. - The entry is frozen: Object.isFrozen on the entry, names and phpOf, and 'search' is not in the entry. - Each call gets its own RegExp: two searchRegExp calls give different objects, the second has lastIndex 0, and the g and y flags are right. - The limit still names each caller: four jsTypeError checks naming preg_match(), preg_split(), preg_match_all() and preg_replace_callback(). - At most 4096 entries with LRU eviction: PATTERN_CACHE_SIZE is 4096, plus the eviction and recency-refresh sequences. I traced these and they hold whatever the cache held beforehand. The string cites decisions/MAINT-2026-10-30-epic-15-items.md Item 6 and a bare AD-5. It cites no FR-/AD-<n>.<k> bullet that could be the wrong one. XT-135 to 138 only gain a RUNNERS entry; XT-138's check that the evidence labels equal the RUNNERS keys stays consistent because both sides gained 'cache.interleaved'. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/runtime (pcre.ts, docs/php-functions.md, and the PCRE test, probe and probe output). Nothing stubs, fakes or partly implements another Component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): pcre.ts holds no @​asyncRoot tags. The new export PATTERN_CACHE_SIZE is a constant. compilePattern, the private convertPattern and searchRegExp are all synchronous: they do no IO and take no async callback. So no tag is needed, and none is kept falsely. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"44a52d93cd21dbfc7a5e7e1525ac1333701b24b5","base":"dcfcb1207608e64d0f89c72c5c1eff58f92202b0","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:16:42.649Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test. The only test touched is an Xaravel Test (XT-runtime-147 plus the shared RUNNERS helper), so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"No existing expected value changed. The diff to php-pcre-functions.probe.txt only adds the new `cache.interleaved` line, and the probe.php diff only adds the matching record() block. The new expected values are what PHP 8.5.11 returned, and they are compared exactly through assertLabels (string equality per argument list). Nothing was loosened, and no Xaravel result was written into an expected value.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. No assertion was removed from XT-runtime-135 to 138: the only change near them is the new RUNNERS entry.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations line, so there is no Skip Reason or precedence to check.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field is added or kept in the changed lines.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the change relies on no Oracle fixture, and none is an error. The XT tests here rest on the PHP probe output, not on Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"I compared XT-runtime-147's consequence string with its body, claim by claim:\n- Global, sticky and empty-match-retry calls nested in a preg_replace_callback callback: the `cache.interleaved` cases global, sticky and retry, compared with PHP output.\n- Sequential calls with different offsets: the offsets case.\n- A cached compile failure keeps its error code: the failure case calls preg_match on '/(/' twice and checks preg_last_error each time, then repeats it through preg_split, preg_match_all and preg_replace_callback.\n- The entry is frozen: Object.isFrozen on the entry, names and phpOf, and 'search' is not in the entry.\n- Each call gets its own RegExp: two searchRegExp calls give different objects, the second has lastIndex 0, and the g and y flags are right.\n- The limit still names each caller: four jsTypeError checks naming preg_match(), preg_split(), preg_match_all() and preg_replace_callback().\n- At most 4096 entries with LRU eviction: PATTERN_CACHE_SIZE is 4096, plus the eviction and recency-refresh sequences. I traced these and they hold whatever the cache held beforehand.\nThe string cites decisions/MAINT-2026-10-30-epic-15-items.md Item 6 and a bare AD-5. It cites no FR-/AD-<n>.<k> bullet that could be the wrong one. XT-135 to 138 only gain a RUNNERS entry; XT-138's check that the evidence labels equal the RUNNERS keys stays consistent because both sides gained `cache.interleaved`.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/runtime (pcre.ts, docs/php-functions.md, and the PCRE test, probe and probe output). Nothing stubs, fakes or partly implements another Component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): pcre.ts holds no @asyncRoot tags. The new export PATTERN_CACHE_SIZE is a constant. compilePattern, the private convertPattern and searchRegExp are all synchronous: they do no IO and take no async callback. So no tag is needed, and none is kept falsely.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
