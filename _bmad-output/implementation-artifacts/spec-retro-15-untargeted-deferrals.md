---
title: 'Assert the DIV-9.18 TypeError for a non-UTF-8 .env and the Lexer cap inside a multibyte character (epic-15-retro-item-2)'
type: 'chore'
created: '2026-10-30'
status: 'done'
baseline_revision: 'f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb'
review_loop_iteration: 3
followup_review_recommended: false
context:
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/MAINT-2026-10-30-epic-15-items-2-5.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md'
warnings: []
deferred:
  - summary: >-
      Mockery's 1000-byte cut may give U+FFFD in place of PHP's split bytes, a silently different value DIV-9.18 rules out.
    evidence: |-
      spec-4-5-mockery-core.md:181/195/203 records the U+FFFD substitution. Pre-existing in packages/mockery (a
      Protected Path), outside this item's scope. Settle by probing Mockery's cut on a value whose 1000th byte falls
      inside a multibyte character and comparing with DIV-9.18.
    location: >-
      packages/mockery (1000-byte cut)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Epic 15 retro finding S2 left two untargeted deferrals where the port diverges from PHP: (b) a `.env` file that is not valid UTF-8 (a Latin-1 `A=caf\xe9`) cannot load, because the runtime's `file_get_contents` throws `TypeError: file_get_contents(): the result splits a UTF-8 sequence, which JS cannot hold`, where PHP returns the bytes and `Str::utf8` with `$fileEncoding` converts them; (c) an unquoted value whose Lexer `{1,1000}` token ends inside a multibyte character (`"A=" + "a".repeat(999) + "éb"`) throws `TypeError: preg_match(): the result splits a UTF-8 sequence, which JS cannot hold`, where PHP rejoins the tokens. The Maintainer ruled (`decisions/MAINT-2026-10-30-epic-15-items-2-5.md` item 2.1) that both fall under the new clause DIV-9.18: the runtime throws a `TypeError` naming the limit, and item 2 adds XT-config cases asserting it, marked DIV-9.18. Parts (a) and (d) moved to Story 17.4 / item 8 and to item 10.

**Approach:** Add Xaravel Test `XT-config-8` in a new `packages/config/tests/xaravel/dotenv-utf8.test.ts` that pins both `TypeError`s (class and exact message) through phpdotenv's public entry points, each assertion marked `// adapted:DIV-9.18`, with a valid-UTF-8 control beside each. Point the code comments, the README and the spec-15-2 deferral at DIV-9.18. No runtime or parser behaviour changes.

## Boundaries & Constraints

**Always:** The test asserts what the port does today (probed on `main` at the baseline): JS `TypeError` (`instanceof TypeError`) with the exact messages above. Each `TypeError` assertion carries `// adapted:DIV-9.18`. The test's consequence string cites `FR-20.1` and `DIV-9.18`. The temp `.env` files go in a `mkdtempSync` directory removed in `finally`; tests write no environment (use `createArrayBacked`, `parse`).

**Never:** Change any runtime or config behaviour or message; edit `conformance/expectations/**`, `conformance/oracle-requests/**`, an existing assertion, `decisions/**`, `epics.md` or packages other than `packages/config` and `packages/runtime`; do (a) or (d); edit the item's `action`, `owner` or `epic`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| (b) Latin-1 file | `.env` bytes `A=caf\xe9\n`; `Dotenv.createArrayBacked(dir).load()`, the same with `fileEncoding` `"ISO-8859-1"`, and `safeLoad()` | throws | JS `TypeError`, message `file_get_contents(): the result splits a UTF-8 sequence, which JS cannot hold` (safeLoad does not swallow it) |
| (b) control | `.env` UTF-8 `A=café\n`, `createArrayBacked(dir).load()` | `{ A: "café" }` | none |
| (c) cap inside `é` | `Dotenv.parse("A=" + "a".repeat(999) + "éb")`, and the same content as a UTF-8 file loaded with `createArrayBacked` | throws | JS `TypeError`, message `preg_match(): the result splits a UTF-8 sequence, which JS cannot hold` |
| (c) control | `Dotenv.parse("A=" + "a".repeat(998) + "éb")` (the token ends on a character boundary) | `{ A: "a"×998 + "éb" }` | none |

</intent-contract>

## Code Map

- `packages/config/tests/xaravel/dotenv.test.ts:1-20,139-200` -- style to follow (header comment, imports from `@xaravel/assert` / `@xaravel/config` / `@xaravel/runtime/php`, `xaravelTest(id, consequence, fn)`, try/catch + `Assert.assertInstanceOf` + `Assert.assertSame` on `.message`, temp dir in `try/finally`). Read-only.
- `packages/config/src/Dotenv/Dotenv.ts:106,118` -- `createArrayBacked(paths, names, shortCircuit, fileEncoding)`, `parse(content)`.
- `packages/config/src/Dotenv/Store/File/Reader.ts:1-5,48` -- header comment; `file_get_contents(path)` is where (b) throws. Add a header sentence citing DIV-9.18.
- `packages/config/src/Dotenv/Parser/Lexer.ts:1-4` -- header; `{1,1000}` counts bytes, so (c) throws in `preg_match`. Add a sentence citing DIV-9.18.
- `packages/runtime/src/php/fileFunctions.ts:7-10` -- header says contents JS cannot hold throw a `TypeError`; add `(DIV-9.18)`.
- `packages/runtime/src/php/stringFunctions.ts:11-12` -- header on the UTF-8 limit for string functions (`decodeResult`, used by `preg_match`); add `(DIV-9.18)`.
- `packages/config/README.md:20-26` -- § Ported libraries; add one bullet-free sentence that a `.env` that is not valid UTF-8, or a value whose 1,000-byte Lexer token ends inside a multibyte character, throws a `TypeError` (DIV-9.18).
- `_bmad-output/implementation-artifacts/spec-15-2-phpdotenv-grammar-port.md:28-35` -- second `deferred` entry; append to its `evidence` that it is settled by DIV-9.18 and XT-config-8 (do not delete the entry).
- `_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md` finding S2 -- append a resolution note for (b) and (c).
- `decisions/DIV-9.md:50` -- DIV-9.18 text (read-only).

## Tasks & Acceptance

**Execution:**
- `packages/config/tests/xaravel/dotenv-utf8.test.ts` -- new XT-config-8 covering every matrix row.
- `packages/config/src/Dotenv/Store/File/Reader.ts`, `packages/config/src/Dotenv/Parser/Lexer.ts`, `packages/runtime/src/php/fileFunctions.ts`, `packages/runtime/src/php/stringFunctions.ts` -- comment-only DIV-9.18 citations.
- `packages/config/README.md` -- the DIV-9.18 sentence.
- `_bmad-output/implementation-artifacts/spec-15-2-phpdotenv-grammar-port.md`, `_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md` -- record the resolution.

**Acceptance Criteria:**
- Given the branch, when `bun run harness --xaravel --id 'XT-config-*'` runs, then XT-config-8 passes and no other Xaravel Test changes outcome.
- Given the diff, when it is read, then no file outside `packages/config/**`, `packages/runtime/**` and `_bmad-output/implementation-artifacts/**` changes, and every non-test change in `packages/**` is a comment or README text.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 8, false 4, maybe-false 4
- findings:
  - `[low]` `reject` (blind) Code Map omits `packages/config/docs/config.md`, which the diff edits — XT-config-7 requires the Divergences section to name every cited DIV clause, so the edit is needed; the only fix is editing this build's spec.
  - `[low]` `patch` (blind) spec-15-2's Residual risks bullets still read (b) and (c) as open — appended "(settled 2026-10-30 by DIV-9.18; asserted by XT-config-8)" to both.
  - `[maybe-false]` `reject` (blind) the PHP-side claims in the test header have no Oracle evidence — the Oracle's JSON cannot carry non-UTF-8 bytes (DIV-9.18's premise); the PHP behaviour is from the retro S2 probe on PHP 8.5.11 and the Maintainer's ruling; the test asserts only the port. If true it would be low (comment wording).
  - `[low]` `patch` (blind) `fileFunctions.ts` header: "no valid" typo and DIV-9.18 attached to the wrapper/context limits — citation moved onto the UTF-8 clause, typo fixed.
  - `[low]` `patch` (blind) `stringFunctions.ts` header cites DIV-9.18 for lone-surrogate input — citation moved onto the split-sequence result only.
  - `[maybe-false]` `defer` (blind) Mockery's 1000-byte cut yields U+FFFD (spec-4-5) where DIV-9.18 says "never a silently different value" — pre-existing in `packages/mockery`, outside this item; settle by probing Mockery's cut on a split multibyte character.
  - `[low]` `reject` (blind) README sentence sits under "Ported libraries" — the spec places it there deliberately as the package's reader-facing note; moving it is cosmetic.
  - `[false]` `reject` (blind) the retro note leaves item 2 in-progress — the orchestrator sets the item `done` with SPS in the same PR; (a)/(d) targets are recorded in `decisions/MAINT-2026-10-30-epic-15-items-2-5.md`.
  - `[maybe-false]` `reject` (blind) missing cases (safeLoad with fileEncoding, file-load 998 control, Windows-1252, null `.message` after a failed assertInstanceOf) — every added case takes the same `file_get_contents` / Lexer path already asserted; `Assert` throws on the first failure, so `.message` is never reached on null. If true it would be low.
  - `[false]` `reject` (blind) spec gaps (AC names only XT-config, empty triage log, filename) — runtime edits are comment-only and the full harness ran with differ=0; the log is written here; fixes are spec edits.
  - `[low]` `patch` (edge) test header says controls show every valid-UTF-8 string behaves as in PHP, contradicted by (c) — reworded to "the same input without the limit's trigger loads as in PHP".
  - `[low]` `patch` (edge) docs scope the Lexer cap to "an unquoted value" though a long unquoted comment also throws — README and docs now say "an unquoted value or comment".
  - `[low]` `patch` (edge) `stringFunctions.ts` lone-surrogate attribution — same fix as the blind row above.
  - `[low]` `patch` (edge) `fileFunctions.ts` citation covers wrapper/context limits — same fix as the blind row above.
  - `[maybe-false]` `reject` (intent) spec-15-2 residual bullets unchanged — same root cause as the blind row; patched there. Grouped.
  - `[false]` `reject` (intent) harness, typecheck, lint and Fidelity Review not evidenced — run: harness differ=0, XARAVEL 527 passed 0 failed, tsc 0, lint 0, Fidelity Review two passes at tree e9fe3255 (re-run on the patched tree below).
- verification-gap layer: no findings. Fidelity Review: reviewer 1 pass (codex), reviewer 2 pass (claude) at tree e9fe32559d0b5be9099091a25a837ddb9582fb2a; the patches changed the tree, so the Finalize re-check runs it again.

### 2026-10-30 — Review pass (Finalize re-check, Fidelity Review at tree 798e44a6)
- verdicts: 1 finding — high 0, medium 0, low 0, false 1, maybe-false 0
- findings:
  - `[false]` `patch` (fidelity, reviewer 1 F-7) the Lexer's first token includes `A=`, so 999 a's would not split `é` — false: `EntryParser.splitStringIntoParts` cuts `A=` off and `parseValue` calls `Lexer.lex(value)` (`packages/config/src/Dotenv/Parser/EntryParser.ts:101,174,191`), and the probe shows 999 throws while 998 parses. The reject stands until the tree changes (ESC-8.8-1), so the evidence went into the test: the (c) comment cites the value-only lexing, and XT-config-8 now asserts `Lexer::lex` directly (998 a's give the 1,000-byte token `"a"×998 + "é"` then `"b"`; 999 a's throw the `preg_match()` TypeError). The inputs are unchanged.

### 2026-10-30 — Review pass (Finalize re-check, Fidelity Review at tree 1bf439e1)
- verdicts: 1 finding — high 0, medium 0, low 0, false 0, maybe-false 1
- findings:
  - `[maybe-false]` `reject` (fidelity, reviewer 1 F-7, missing evidence only) asks for `EntryParser.ts`' `splitStringIntoParts` / `parseValue` call path, which the prompt did not show — the file is in the repository (`packages/config/src/Dotenv/Parser/EntryParser.ts:101,174,191`) and settles it. Under `decisions/MAINT-2026-10-24-evidence-gaps.md` the reject counts as a pass, noted as an evidence gap; `status --item` prints `current` for tree 1bf439e125f647641927873ab55a0055987e606a. Copied to INBOX for the next retrospective.

### 2026-10-30 — Review pass (Finalize re-check, Fidelity Review at tree 3a89f26d)
- Deleting the item's old `bmad-build-auto-result-retro-15-untargeted-deferrals.md` note (it must go in the PR that sets the item `done`, XT-conformance-1000) changed the bound tree, so the layer ran again.
- verdicts: 2 findings — high 0, medium 0, low 0, false 0, maybe-false 2
- findings:
  - `[maybe-false]` `reject` (fidelity, reviewer 1 F-7, missing evidence only) the same `EntryParser.ts` call-path request as above — settled by `packages/config/src/Dotenv/Parser/EntryParser.ts:101,174,191`; counts as a pass, noted as an evidence gap.
  - `[maybe-false]` `reject` (fidelity, reviewer 2 F-7, missing evidence only) the same request — same evidence and ruling.
- `status --item` prints `current` for tree 3a89f26d247d188803d29f7d37a239452b78bfac.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-config-*'` -- expected: XT-config-8 PASS, no differences.
- `bun run typecheck` -- expected: exit 0.
- `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: no differences (NOT-RUN Variants allowed).

## Fidelity Review

### Reviewer 1: pass at tree e9fe32559d0b5be9099091a25a837ddb9582fb2a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:07:44.906Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds no Ported Tests or assigned Ported Test IDs. |
| F-2: No expected value is weakened | pass | No existing expected value is weakened. The new exact error expectations are expressly authorized by DIV-9.18 and carry its markers. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Every added adaptation marker cites DIV-9.18 for a TypeError caused by invalid UTF-8 file bytes or a Lexer token splitting a multibyte character, exactly as that clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-config-8 checks each declared loading and parsing error with its class and exact message, plus both successful controls. Its FR-20.1 citation concerns the dotenv grammar boundary being tested, subject to the recorded DIV-9.18 exception. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to the action item's config and runtime components. The diff adds documentation and a real integration test, with no replacement implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain no async methods or async-root tags. Their synchronous file reading is explicitly authorized by ESC-15.2-3; the other declarations require no tags under AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e9fe32559d0b5be9099091a25a837ddb9582fb2a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:07:44.906Z","items":[{"id":"F-1","result":"n/a","note":"The change adds no Ported Tests or assigned Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"No existing expected value is weakened. The new exact error expectations are expressly authorized by DIV-9.18 and carry its markers.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Every added adaptation marker cites DIV-9.18 for a TypeError caused by invalid UTF-8 file bytes or a Lexer token splitting a multibyte character, exactly as that clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-config-8 checks each declared loading and parsing error with its class and exact message, plus both successful controls. Its FR-20.1 citation concerns the dotenv grammar boundary being tested, subject to the recorded DIV-9.18 exception.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to the action item's config and runtime components. The diff adds documentation and a real integration test, with no replacement implementation of another component.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain no async methods or async-root tags. Their synchronous file reading is explicitly authorized by ESC-15.2-3; the other declarations require no tags under AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e9fe32559d0b5be9099091a25a837ddb9582fb2a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:07:44.906Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test (the Inventory section says no Ported Test IDs are assigned). The only test is the new Xaravel Test XT-config-8, which has no Upstream source to compare. |
| F-2: No expected value is weakened | pass | No Ported Test or stale_tests file is touched. In XT-config-8, the expected values are exact assertSame comparisons. The TypeError expectations are marked adapted:DIV-9.18, and that clause tells a test that depends on non-UTF-8 bytes to assert the TypeError. The control cases expect PHP's own values ({A:'café'} and the rejoined 998 a's + 'éb'). Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. The diff removes no assertion. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line, so there is no Skip Reason to judge. |
| F-5: Every `adapted` marker matches its clause | pass | Every adapted marker is adapted:DIV-9.18, on the TypeError instanceof and message assertions in XT-config-8. DIV-9.18 exists in decisions/DIV-9.md and covers exactly two things: a non-UTF-8 file read such as a Latin-1 .env, and a PCRE match whose bounds fall inside a multibyte character, as phpdotenv's {1,1000} Lexer cap can. For these the test must assert the TypeError and carry the clause. The marked lines do only that, and the controls are unmarked. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) reports no assigned, changed or present error fixture. The XT relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-config-8's body checks each claim in its consequence string. (1) A Latin-1 file (bytes A=caf\xe9\n) through load(), through load() with ISO-8859-1, and through safeLoad() each throws a JS TypeError whose message is exactly decodeResult('file_get_contents') ('file_get_contents(): the result splits a UTF-8 sequence, which JS cannot hold'). Reader.readFromFile calls file_get_contents before Str::utf8, and safeLoad only swallows InvalidPathException. (2) Dotenv::parse and a file load of 'A=' + 999 a's + 'éb' throw the preg_match TypeError. EntryParser lexes only the value, so the 1,000-byte token ends after the first byte of é. (3) Controls: a UTF-8 file loads {A:'café'}, and 998 a's + 'éb' parses to the whole value (the token ends on the é boundary). FR-20.1 (phpdotenv's grammar) is checked by the controls, and DIV-9.18 by the TypeError cases. The exact preg_match message is not provable from the prompt, because the pcre source is not shown, but the test runs it. |
| F-8: No stub, fake or partial implementation of another Component | pass | The edits stay in the two listed components: packages/config (README, docs, comments in Lexer.ts and Reader.ts, a new XT) and packages/runtime (comment-only DIV-9.18 citations in fileFunctions.ts and stringFunctions.ts). They add no stub, fake, hard-coded return or partial implementation of another component. Parts (a) and (d) are rerouted by MAINT-2026-10-30-epic-15-items-2-5 rather than implemented here. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts. All of their declarations are sync. file_get_contents is a sync readFileSync, as ESC-15.2-3 rules (config is sync, not Filesystem IO). Lexer::lex is a sync generator. No export is async or takes an async callback, so no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e9fe32559d0b5be9099091a25a837ddb9582fb2a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:07:44.906Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test (the Inventory section says no Ported Test IDs are assigned). The only test is the new Xaravel Test XT-config-8, which has no Upstream source to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test or stale_tests file is touched. In XT-config-8, the expected values are exact assertSame comparisons. The TypeError expectations are marked adapted:DIV-9.18, and that clause tells a test that depends on non-UTF-8 bytes to assert the TypeError. The control cases expect PHP's own values ({A:'café'} and the rejoined 998 a's + 'éb'). Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare. The diff removes no assertion.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line, so there is no Skip Reason to judge.","findings":[]},{"id":"F-5","result":"pass","note":"Every adapted marker is adapted:DIV-9.18, on the TypeError instanceof and message assertions in XT-config-8. DIV-9.18 exists in decisions/DIV-9.md and covers exactly two things: a non-UTF-8 file read such as a Latin-1 .env, and a PCRE match whose bounds fall inside a multibyte character, as phpdotenv's {1,1000} Lexer cap can. For these the test must assert the TypeError and carry the clause. The marked lines do only that, and the controls are unmarked.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) reports no assigned, changed or present error fixture. The XT relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-config-8's body checks each claim in its consequence string. (1) A Latin-1 file (bytes A=caf\\xe9\\n) through load(), through load() with ISO-8859-1, and through safeLoad() each throws a JS TypeError whose message is exactly decodeResult('file_get_contents') ('file_get_contents(): the result splits a UTF-8 sequence, which JS cannot hold'). Reader.readFromFile calls file_get_contents before Str::utf8, and safeLoad only swallows InvalidPathException. (2) Dotenv::parse and a file load of 'A=' + 999 a's + 'éb' throw the preg_match TypeError. EntryParser lexes only the value, so the 1,000-byte token ends after the first byte of é. (3) Controls: a UTF-8 file loads {A:'café'}, and 998 a's + 'éb' parses to the whole value (the token ends on the é boundary). FR-20.1 (phpdotenv's grammar) is checked by the controls, and DIV-9.18 by the TypeError cases. The exact preg_match message is not provable from the prompt, because the pcre source is not shown, but the test runs it.","findings":[]},{"id":"F-8","result":"pass","note":"The edits stay in the two listed components: packages/config (README, docs, comments in Lexer.ts and Reader.ts, a new XT) and packages/runtime (comment-only DIV-9.18 citations in fileFunctions.ts and stringFunctions.ts). They add no stub, fake, hard-coded return or partial implementation of another component. Parts (a) and (d) are rerouted by MAINT-2026-10-30-epic-15-items-2-5 rather than implemented here.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts. All of their declarations are sync. file_get_contents is a sync readFileSync, as ESC-15.2-3 rules (config is sync, not Filesystem IO). Lexer::lex is a sync generator. No export is async or takes an async callback, so no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 798e44a6e6515b7b92300a8ecebd74408120161a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:13:38.619Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds no Ported Test or assigned Ported Test ID. |
| F-2: No expected value is weakened | pass | No existing expected value is weakened. The new TypeError class and exact message assertions carry DIV-9.18 markers permitting that difference. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Each added adaptation marker cites DIV-9.18 for a TypeError caused by unsupported non-UTF-8 bytes, matching that clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-config-8 checks the declared file-reading cases, but its Lexer input does not trigger the multibyte split its consequence declares. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to the authorized config and runtime components; the diff introduces no implementation of another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain no asyncRoot tags or async exports. Their synchronous file read is expressly authorized by ESC-15.2-3. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-7** `packages/config/tests/xaravel/dotenv-utf8.test.ts`: The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"798e44a6e6515b7b92300a8ecebd74408120161a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:13:38.619Z","items":[{"id":"F-1","result":"n/a","note":"The change adds no Ported Test or assigned Ported Test ID.","findings":[]},{"id":"F-2","result":"pass","note":"No existing expected value is weakened. The new TypeError class and exact message assertions carry DIV-9.18 markers permitting that difference.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Each added adaptation marker cites DIV-9.18 for a TypeError caused by unsupported non-UTF-8 bytes, matching that clause.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"XT-config-8 checks the declared file-reading cases, but its Lexer input does not trigger the multibyte split its consequence declares.","findings":[{"path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All changed paths belong to the authorized config and runtime components; the diff introduces no implementation of another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain no asyncRoot tags or async exports. Their synchronous file read is expressly authorized by ESC-15.2-3.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 798e44a6e6515b7b92300a8ecebd74408120161a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:13:38.619Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or changes no Ported Test and no Expectations line, so there is no Ported Test to compare with Upstream source lines. |
| F-2: No expected value is weakened | pass | No Ported Test is touched. The new XT-config-8 asserts the TypeError class and the exact message (assertSame against FILE_LIMIT and PCRE_LIMIT). The FILE_LIMIT string matches decodeResult's text in stringFunctions.ts. Its controls assertSame exact values ({A:'café'} and the whole 1,000-char value). Each line that replaces PHP's kept-bytes result with the TypeError carries // adapted:DIV-9.18. That clause says exactly this: a test that depends on such bytes asserts the TypeError and is marked with the clause. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed and no stale_tests file is listed, so no Upstream assertion count applies. The diff removes no assertion anywhere. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Each // adapted:DIV-9.18 marker in dotenv-utf8.test.ts was read against clause DIV-9.18 in decisions/DIV-9.md. The clause covers a non-UTF-8 file read (a Latin-1 .env before mb_convert_encoding) and a PCRE match whose bounds fall inside a multibyte character (phpdotenv's {1,1000} Lexer cap). It requires the test to assert the TypeError and carry the clause's marker. The marked assertions are exactly those TypeError instanceOf and message checks. The unmarked controls are unadapted, as they should be. The Expectations file has no adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, for any assigned Oracle request. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The consequence string claims six things, and the body checks each one. 1) A Latin-1 file throws file_get_contents()'s TypeError through load(), through load() with ISO-8859-1 and through safeLoad(); a loop asserts the class and exact message for all three. 2) A UTF-8 file loads: assertSame {A:'café'}. 3) Dotenv::parse of 999 a's then é throws preg_match()'s TypeError. The Lexer runs on the value only, so the 1,000-byte token ends inside é (bytes 1,000-1,001); the comment says so. 4) The same input as a file load throws the same TypeError. 5) 998 a's (a boundary-ending token) parse to the whole value. The cited DIV-9.18 is the clause tested. FR-20.1 (.env parsing matches phpdotenv's grammar) is the parsing consequence that the controls verify and that this divergence limits. |
| F-8: No stub, fake or partial implementation of another Component | pass | The edits are confined to packages/config (README, docs, comments in Lexer.ts and Reader.ts, the new XT) and packages/runtime (comments in fileFunctions.ts and stringFunctions.ts). Both components are in the item's scope. No code behaviour changes, and no stub, fake or hard-coded return is added. As the MAINT-2026-10-30-epic-15-items-2-5 ruling directs, parts (a) and (d) are deferred, not faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts, and the change adds no export. Every declaration is sync: Lexer.lex is a sync generator, Reader.read and readFromFile are sync, and file_get_contents is a sync readFileSync, which ESC-15.2-3 rules is not an async root. The string functions are sync. No tag is missing or untrue. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"798e44a6e6515b7b92300a8ecebd74408120161a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:13:38.619Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or changes no Ported Test and no Expectations line, so there is no Ported Test to compare with Upstream source lines.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. The new XT-config-8 asserts the TypeError class and the exact message (assertSame against FILE_LIMIT and PCRE_LIMIT). The FILE_LIMIT string matches decodeResult's text in stringFunctions.ts. Its controls assertSame exact values ({A:'café'} and the whole 1,000-char value). Each line that replaces PHP's kept-bytes result with the TypeError carries // adapted:DIV-9.18. That clause says exactly this: a test that depends on such bytes asserts the TypeError and is marked with the clause.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed and no stale_tests file is listed, so no Upstream assertion count applies. The diff removes no assertion anywhere.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Each // adapted:DIV-9.18 marker in dotenv-utf8.test.ts was read against clause DIV-9.18 in decisions/DIV-9.md. The clause covers a non-UTF-8 file read (a Latin-1 .env before mb_convert_encoding) and a PCRE match whose bounds fall inside a multibyte character (phpdotenv's {1,1000} Lexer cap). It requires the test to assert the TypeError and carry the clause's marker. The marked assertions are exactly those TypeError instanceOf and message checks. The unmarked controls are unadapted, as they should be. The Expectations file has no adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, for any assigned Oracle request.","findings":[]},{"id":"F-7","result":"pass","note":"The consequence string claims six things, and the body checks each one. 1) A Latin-1 file throws file_get_contents()'s TypeError through load(), through load() with ISO-8859-1 and through safeLoad(); a loop asserts the class and exact message for all three. 2) A UTF-8 file loads: assertSame {A:'café'}. 3) Dotenv::parse of 999 a's then é throws preg_match()'s TypeError. The Lexer runs on the value only, so the 1,000-byte token ends inside é (bytes 1,000-1,001); the comment says so. 4) The same input as a file load throws the same TypeError. 5) 998 a's (a boundary-ending token) parse to the whole value. The cited DIV-9.18 is the clause tested. FR-20.1 (.env parsing matches phpdotenv's grammar) is the parsing consequence that the controls verify and that this divergence limits.","findings":[]},{"id":"F-8","result":"pass","note":"The edits are confined to packages/config (README, docs, comments in Lexer.ts and Reader.ts, the new XT) and packages/runtime (comments in fileFunctions.ts and stringFunctions.ts). Both components are in the item's scope. No code behaviour changes, and no stub, fake or hard-coded return is added. As the MAINT-2026-10-30-epic-15-items-2-5 ruling directs, parts (a) and (d) are deferred, not faked.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts, and the change adds no export. Every declaration is sync: Lexer.lex is a sync generator, Reader.read and readFromFile are sync, and file_get_contents is a sync readFileSync, which ESC-15.2-3 rules is not an async root. The string functions are sync. No tag is missing or untrue.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 1bf439e125f647641927873ab55a0055987e606a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:18:12.013Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Test. |
| F-2: No expected value is weakened | pass | The new test uses exact expected messages and values; its TypeError expectations are explicitly permitted by DIV-9.18. No existing assertion is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Every added adapted marker cites DIV-9.18 and checks the permitted TypeError for invalid UTF-8 bytes or a match splitting a multibyte character. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The direct Lexer assertions establish the byte boundary for value-only input, but the supplied source does not establish that Dotenv parsing passes only the value to Lexer. P-1 therefore cannot be confirmed resolved. |
| F-8: No stub, fake or partial implementation of another Component | pass | The diff stays within the assigned config and runtime components and adds documentation and tests without introducing another component's implementation. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain no async methods or tags requiring validation; ESC-15.2-3 explicitly permits the synchronous file read used by Reader. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/config/tests/xaravel/dotenv-utf8.test.ts`: Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases. **not fixed**: The change retains 999 a's and adds direct Lexer boundary assertions plus an explanation that EntryParser removes A=. That explanation could resolve the earlier finding, but EntryParser's implementation is absent from the supplied evidence, so the parse and file-load call paths cannot be confirmed.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"1bf439e125f647641927873ab55a0055987e606a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:18:12.013Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Test.","findings":[]},{"id":"F-2","result":"pass","note":"The new test uses exact expected messages and values; its TypeError expectations are explicitly permitted by DIV-9.18. No existing assertion is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Every added adapted marker cites DIV-9.18 and checks the permitted TypeError for invalid UTF-8 bytes or a match splitting a multibyte character.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"fail","note":"The direct Lexer assertions establish the byte boundary for value-only input, but the supplied source does not establish that Dotenv parsing passes only the value to Lexer. P-1 therefore cannot be confirmed resolved.","findings":[{"path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The diff stays within the assigned config and runtime components and adds documentation and tests without introducing another component's implementation.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain no async methods or tags requiring validation; ESC-15.2-3 explicitly permits the synchronous file read used by Reader.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.","fixed":false,"note":"The change retains 999 a's and adds direct Lexer boundary assertions plus an explanation that EntryParser removes A=. That explanation could resolve the earlier finding, but EntryParser's implementation is absent from the supplied evidence, so the parse and file-load call paths cannot be confirmed."}]}
```

### Reviewer 2: pass at tree 1bf439e125f647641927873ab55a0055987e606a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:18:12.013Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item adds or changes no Expectations line and no Ported Test, so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | XT-config-8 checks each expected value exactly: assertSame on the full TypeError messages (FILE_LIMIT, PCRE_LIMIT, which match decodeResult's text), assertInstanceOf TypeError, and assertSame on whole loaded or parsed arrays. Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and no assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Every adapted:DIV-9.18 marker sits on an assertion of the TypeError or its message. DIV-9.18 says an Xaravel Test that depends on such bytes asserts the TypeError and is marked with this clause, which is exactly what these lines do. The control assertions carry no marker. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle fixture, and no error fixture is listed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each claim in the consequence is checked by the body. Latin-1 file through load(), load() with fileEncoding ISO-8859-1, and safeLoad(): each asserts the TypeError and file_get_contents' message. Dotenv::parse and the file load of A= + 999 a's + éb: each asserts preg_match's TypeError and message. Lexer.lex on 998 a's + éb gives exactly [998 a's + é, 'b'], a 1,000-byte first token, and on 999 a's it throws, which shows directly that the Lexer lexes only the value after NAME= (phpdotenv's EntryParser::parseValue calls Lexer::lex($value)). Controls: the UTF-8 file loads {A:'café'}, and the 998-a value parses whole. FR-20.1 (phpdotenv grammar) and DIV-9.18 are the bullets these checks cover. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are comments in packages/config Lexer.ts and Reader.ts, comments in packages/runtime fileFunctions.ts and stringFunctions.ts, plus docs and a config XT. Both components are in the item's scope, and no stub, fake or hard-coded return is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in the four touched source files. Lexer.lex is a sync generator, Reader.read uses the sync file_get_contents (ESC-15.2-3 keeps the config read sync), and file_get_contents and the string functions are sync. No async export is left untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases. **fixed**: The finding assumed the Lexer token includes 'A='. phpdotenv's EntryParser splits the name off and calls Lexer::lex on the value alone, and the port follows it, as the test's comment cites. The test now supplies that evidence directly: Lexer.lex on 998 a's + éb gives a 1,000-byte first token that ends after é, and Lexer.lex on 999 a's + éb throws preg_match's TypeError. So with 999 a's the cap does fall inside é, and the parse and file-load cases are right as written. The consequence string now states this.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"1bf439e125f647641927873ab55a0055987e606a","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:18:12.013Z","items":[{"id":"F-1","result":"n/a","note":"The item adds or changes no Expectations line and no Ported Test, so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"XT-config-8 checks each expected value exactly: assertSame on the full TypeError messages (FILE_LIMIT, PCRE_LIMIT, which match decodeResult's text), assertInstanceOf TypeError, and assertSame on whole loaded or parsed arrays. Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and no assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Every adapted:DIV-9.18 marker sits on an assertion of the TypeError or its message. DIV-9.18 says an Xaravel Test that depends on such bytes asserts the TypeError and is marked with this clause, which is exactly what these lines do. The control assertions carry no marker.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle fixture, and no error fixture is listed.","findings":[]},{"id":"F-7","result":"pass","note":"Each claim in the consequence is checked by the body. Latin-1 file through load(), load() with fileEncoding ISO-8859-1, and safeLoad(): each asserts the TypeError and file_get_contents' message. Dotenv::parse and the file load of A= + 999 a's + éb: each asserts preg_match's TypeError and message. Lexer.lex on 998 a's + éb gives exactly [998 a's + é, 'b'], a 1,000-byte first token, and on 999 a's it throws, which shows directly that the Lexer lexes only the value after NAME= (phpdotenv's EntryParser::parseValue calls Lexer::lex($value)). Controls: the UTF-8 file loads {A:'café'}, and the 998-a value parses whole. FR-20.1 (phpdotenv grammar) and DIV-9.18 are the bullets these checks cover.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes are comments in packages/config Lexer.ts and Reader.ts, comments in packages/runtime fileFunctions.ts and stringFunctions.ts, plus docs and a config XT. Both components are in the item's scope, and no stub, fake or hard-coded return is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in the four touched source files. Lexer.lex is a sync generator, Reader.read uses the sync file_get_contents (ESC-15.2-3 keeps the config read sync), and file_get_contents and the string functions are sync. No async export is left untagged.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.","fixed":true,"note":"The finding assumed the Lexer token includes 'A='. phpdotenv's EntryParser splits the name off and calls Lexer::lex on the value alone, and the port follows it, as the test's comment cites. The test now supplies that evidence directly: Lexer.lex on 998 a's + éb gives a 1,000-byte first token that ends after é, and Lexer.lex on 999 a's + éb throws preg_match's TypeError. So with 999 a's the cap does fall inside é, and the parse and file-load cases are right as written. The consequence string now states this."}]}
```

### Reviewer 1: reject at tree 3a89f26d247d188803d29f7d37a239452b78bfac

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:22:09.503Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed. |
| F-2: No expected value is weakened | pass | The new test uses exact expected values and messages; its expected TypeErrors are expressly permitted by DIV-9.18. No existing assertion is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Each added adapted:DIV-9.18 marker asserts the TypeError and limit message that clause permits for invalid UTF-8 bytes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The direct Lexer assertions demonstrate the stated byte boundary, but the supplied material still does not establish which string Dotenv.parse and file loading pass to Lexer. Both previous findings remain unresolved for those paths. |
| F-8: No stub, fake or partial implementation of another Component | pass | The diff stays within the action item's config and runtime components and adds no implementation of another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files retain no asyncRoot tags or async exports. Their synchronous file reading is explicitly authorized by ESC-15.2-3; the remaining declarations perform synchronous string processing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

- **F-7** `packages/config/tests/xaravel/dotenv-utf8.test.ts`: Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts, parseValue and the relevant call path from Dotenv.parse and file loading. Without that source, the comments cannot establish whether A= is removed before lexing, so the 999-a inputs and their claimed TypeErrors cannot be confirmed. Resolve P-2 using that evidence or correct both inputs and their consequence accordingly. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading. **not fixed**: EntryParser.ts and its relevant call path are still absent. The new comments and direct Lexer assertions do not supply the requested source evidence.
- **P-2** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases. **not fixed**: The parse and file-load cases still use 999 a's. That may be correct if EntryParser removes A= first, but the requested source evidence establishing this is absent; the earlier finding is therefore not resolved.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"3a89f26d247d188803d29f7d37a239452b78bfac","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:22:09.503Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"The new test uses exact expected values and messages; its expected TypeErrors are expressly permitted by DIV-9.18. No existing assertion is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Each added adapted:DIV-9.18 marker asserts the TypeError and limit message that clause permits for invalid UTF-8 bytes.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"The direct Lexer assertions demonstrate the stated byte boundary, but the supplied material still does not establish which string Dotenv.parse and file loading pass to Lexer. Both previous findings remain unresolved for those paths.","findings":[{"path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts, parseValue and the relevant call path from Dotenv.parse and file loading. Without that source, the comments cannot establish whether A= is removed before lexing, so the 999-a inputs and their claimed TypeErrors cannot be confirmed. Resolve P-2 using that evidence or correct both inputs and their consequence accordingly.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The diff stays within the action item's config and runtime components and adds no implementation of another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files retain no asyncRoot tags or async exports. Their synchronous file reading is explicitly authorized by ESC-15.2-3; the remaining declarations perform synchronous string processing.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading.","fixed":false,"note":"EntryParser.ts and its relevant call path are still absent. The new comments and direct Lexer assertions do not supply the requested source evidence."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.","fixed":false,"note":"The parse and file-load cases still use 999 a's. That may be correct if EntryParser removes A= first, but the requested source evidence establishing this is absent; the earlier finding is therefore not resolved."}]}
```

### Reviewer 2: reject at tree 3a89f26d247d188803d29f7d37a239452b78bfac

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb`, on 2026-10-31T02:22:09.503Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test and no Expectations line, so no Inventory row or Upstream assertion applies. |
| F-2: No expected value is weakened | pass | The only touched test is the new XT-config-8. It compares exact message constants with assertSame and checks the TypeError class with assertInstanceOf; nothing is loosened. No existing test or stale_tests file is changed. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test or existing assertion is changed or removed. The change adds one Xaravel Test and edits only comments in source. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | Each '// adapted:DIV-9.18' marker sits on a TypeError class or message assertion. DIV-9.18 in decisions/DIV-9.md says a test that depends on such bytes asserts the TypeError and is marked with this clause. The control assertions carry no marker, and the messages match decodeResult's text in stringFunctions.ts. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, and no assigned Oracle request. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The consequence says the parse and file-load cases with 999 a's then é throw because the Lexer tokenises only the value after 'A='. The direct Lexer.lex assertions back the byte arithmetic for a value on its own. The claim that Dotenv::parse and a file load hand the Lexer only the value rests on EntryParser.ts (splitStringIntoParts, parseValue), which is cited in a comment but not supplied. Prior findings P-1 and P-2 therefore remain unresolved. |
| F-8: No stub, fake or partial implementation of another Component | pass | Both edited components, config and runtime, are listed in the action item's components. The runtime edits are comment-only. No stub, fake or hard-coded return of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts. Lexer.lex is a sync generator, and Reader.read and file_get_contents are sync, as ESC-15.2-3 rules. Only comments changed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is changed. |

Findings:

- **F-7** `packages/config/tests/xaravel/dotenv-utf8.test.ts`: P-1/P-2 still open: supply packages/config/src/Dotenv/Parser/EntryParser.ts (splitStringIntoParts and parseValue, and the Parser/Lines call path into it), so it can be confirmed that 'A=' is cut off before Lexer::lex. Or, if 'A=' does reach the Lexer, move the cap to 997 a's and update the consequence string and comments for both the Dotenv.parse and the file-load cases. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading. **not fixed**: The prompt does not include EntryParser.ts. The test only adds a comment naming its path and parseValue -> Lexer.lex, which is not the source evidence the finding asks for.
- **P-2** (reviewer 1, F-7) `packages/config/tests/xaravel/dotenv-utf8.test.ts`: The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases. **not fixed**: The inputs were not changed to 997 a's. The implementer argues that EntryParser cuts off 'A=' before lexing, and the direct Lexer.lex assertions are consistent with that. The premise can only be confirmed from EntryParser.ts, which is not supplied (P-1).

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"3a89f26d247d188803d29f7d37a239452b78bfac","base":"f0e1bca4d7b725c27010f7d9822b3d70a6cf11eb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T02:22:09.503Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test and no Expectations line, so no Inventory row or Upstream assertion applies.","findings":[]},{"id":"F-2","result":"pass","note":"The only touched test is the new XT-config-8. It compares exact message constants with assertSame and checks the TypeError class with assertInstanceOf; nothing is loosened. No existing test or stale_tests file is changed.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test or existing assertion is changed or removed. The change adds one Xaravel Test and edits only comments in source.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Each `// adapted:DIV-9.18` marker sits on a TypeError class or message assertion. DIV-9.18 in decisions/DIV-9.md says a test that depends on such bytes asserts the TypeError and is marked with this clause. The control assertions carry no marker, and the messages match decodeResult's text in stringFunctions.ts.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, and no assigned Oracle request.","findings":[]},{"id":"F-7","result":"fail","note":"The consequence says the parse and file-load cases with 999 a's then é throw because the Lexer tokenises only the value after `A=`. The direct Lexer.lex assertions back the byte arithmetic for a value on its own. The claim that Dotenv::parse and a file load hand the Lexer only the value rests on EntryParser.ts (splitStringIntoParts, parseValue), which is cited in a comment but not supplied. Prior findings P-1 and P-2 therefore remain unresolved.","findings":[{"path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"P-1/P-2 still open: supply packages/config/src/Dotenv/Parser/EntryParser.ts (splitStringIntoParts and parseValue, and the Parser/Lines call path into it), so it can be confirmed that `A=` is cut off before Lexer::lex. Or, if `A=` does reach the Lexer, move the cap to 997 a's and update the consequence string and comments for both the Dotenv.parse and the file-load cases.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Both edited components, config and runtime, are listed in the action item's components. The runtime edits are comment-only. No stub, fake or hard-coded return of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in Lexer.ts, Reader.ts, fileFunctions.ts or stringFunctions.ts. Lexer.lex is a sync generator, and Reader.read and file_get_contents are sync, as ESC-15.2-3 rules. Only comments changed.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"Supply packages/config/src/Dotenv/Parser/EntryParser.ts, including splitStringIntoParts and parseValue and their call path, to substantiate the new explanation that Lexer receives the value without A=. The comments and direct Lexer tests alone do not resolve P-1 for Dotenv.parse and file loading.","fixed":false,"note":"The prompt does not include EntryParser.ts. The test only adds a comment naming its path and parseValue -> Lexer.lex, which is not the source evidence the finding asks for."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/config/tests/xaravel/dotenv-utf8.test.ts","detail":"The Lexer pattern includes A= in its first token. For A= plus 999 a's plus éb, the first 1,000-byte token contains A= and 998 a's; the next contains aéb, so neither splits é. Use 997 a's to put the first byte of é at byte 1,000, update the consequence and comments, and apply that corrected input to both parse and file-load cases.","fixed":false,"note":"The inputs were not changed to 997 a's. The implementer argues that EntryParser cuts off `A=` before lexing, and the direct Lexer.lex assertions are consistent with that. The premise can only be confirmed from EntryParser.ts, which is not supplied (P-1)."}]}
```

## Auto Run Result

Status: done

- **Summary.** Epic 15 retro item 2's remaining part, (b) a non-UTF-8 `.env` and (c) the Lexer's 1,000-byte cap inside a multibyte character, is asserted under DIV-9.18 by the new Xaravel Test XT-config-8. No runtime or parser behaviour changed. (a) and (d) moved to Story 17.4 / item 8 and to item 10 (`decisions/MAINT-2026-10-30-epic-15-items-2-5.md`).
- **Files.**
  - `packages/config/tests/xaravel/dotenv-utf8.test.ts`: new XT-config-8 (both `TypeError`s through `load()`, `load()` with `fileEncoding`, `safeLoad()`, `Dotenv::parse`, a file load and `Lexer::lex`, with valid-UTF-8 controls; assertions marked `adapted:DIV-9.18`).
  - `packages/config/src/Dotenv/Store/File/Reader.ts`, `packages/config/src/Dotenv/Parser/Lexer.ts`, `packages/runtime/src/php/fileFunctions.ts`, `packages/runtime/src/php/stringFunctions.ts`: comment-only DIV-9.18 citations.
  - `packages/config/README.md`, `packages/config/docs/config.md`: the DIV-9.18 note and Divergences bullet (XT-config-7 needs the bullet).
  - `_bmad-output/implementation-artifacts/spec-15-2-phpdotenv-grammar-port.md`, `_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md`: the deferral, residuals and finding S2 record the resolution.
- **Review.** 20 findings over four passes. Patched 7 low (comment citations, a typo, doc wording, the spec-15-2 residuals, and the Lexer evidence for a false F-7). Deferred 1 (Mockery's U+FFFD cut against DIV-9.18, pre-existing, medium unverified). Rejected 12 with reasons in the triage log. The Fidelity Review is `current` at tree 3a89f26d247d188803d29f7d37a239452b78bfac: both reviewers' rejects are a missing-evidence-only F-7 (the `EntryParser.ts` call path), noted as evidence gaps under `decisions/MAINT-2026-10-24-evidence-gaps.md`.
- **Follow-up review recommended:** false (patched: 0 high, 0 medium, 7 low).
- **Verification.** `bun run harness`: differ=0 (7 Variants NOT-RUN, no local backend); Xaravel Tests 527 passed, 0 failed, 5 skipped; `bun run harness --xaravel --id 'XT-config-*'`: 8/8; `bun run typecheck` and `bun run lint`: exit 0.
- **Residual risks.** The Fidelity Review prompt does not show unchanged files a test's explanation relies on (here `EntryParser.ts`); noted as an evidence gap.
