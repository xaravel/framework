---
title: 'Story 8.4: Temporal and bcrypt spikes, and the OQ-12 decision'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'f6f0a76f3d0ab7c953d30bd976d51a60785f52c3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Three Phase 0 open questions have no evidence or ruling on `main`:
- OQ-4 (PRD:1430): does Bun 1.4.3's `Temporal` cover what Carbon needs?
- OQ-8 (PRD:1434): do PHP `$2y$` hashes verify in Bun once the input is truncated to 72 UTF-8 bytes? The Maintainer has already accepted that approach; the Differential Test is missing.
- OQ-12 (PRD:1438): may a security-relevant Upstream release trigger an out-of-cycle pin bump?

**Approach:**
- A spike tool, `conformance/spikes/spikes.ts`, holds two registries:
  - Carbon **needs**: each has PHP expressions, whose truth comes from signed Oracle fixtures, and a Temporal mapping run live on Bun.
  - bcrypt **cases**: each has a PHP-produced `$2y$` hash from a signed fixture, which Bun verifies live.
- The tool generates `conformance/oracle-requests/8.4.jsonl` from the registries (Story 3.4's flow), and generates `conformance/spikes/REPORT.md` from the registries, the fixtures and the live run. A fail-closed `check` compares all three.
- `decisions/OQ-8.md` records the bcrypt result. The orchestrator writes it: the Maintainer accepted the approach, and this file only records the measurement.
- OQ-4's and OQ-12's rulings belong to the Maintainer. They are raised as open Escalations, ESC-8.4-1 and ESC-8.4-2, each with a recommended ruling. The Maintainer later writes `decisions/OQ-4.md` and `decisions/OQ-12.md`.

## Boundaries & Constraints

**Always:**
- **Needs registry.** Ids are `<group>.<name>`. Each need lists `exprs`, one PHP expression per sample, each returning a string. Its `temporal()` returns the same number of strings, or `null` with a reason when Temporal has no API for the need.
  - A need is `covered` when every Temporal string equals the Oracle's value; otherwise it is a `gap`.
  - The mapping may use `Temporal`, `Intl` and plain arithmetic, but no hard-coded expected value and no zone table of its own.
  - The groups are below. Each AC group has at least one need.
    - **`tz`** (timezone and DST, `\Carbon\CarbonImmutable::parse(..., '<zone>')`):
      - `addHours` across the spring-forward gap (America/New_York 2026-03-08 01:30 +1h);
      - `addDay` landing in the gap (2026-03-07 02:30 +1 day);
      - an ambiguous fall-back time (2026-11-01 01:30);
      - `addHours(2)` across fall-back (from 00:30);
      - `(int) diffInHours` over the 23-hour day;
      - `setTimezone('Asia/Kolkata')`;
      - `startOfDay` on a day without midnight (America/Sao_Paulo 2018-11-04).
    - **`month`** (overflow and clamping, UTC):
      - `addMonth` and `addMonthNoOverflow` from 2026-01-31;
      - `subMonth` and `subMonthNoOverflow` from 2026-03-31;
      - `addYear` and `addYearNoOverflow` from 2024-02-29.
    - **`bounds`** (`startOf*` / `endOf*`): one need per unit (minute, hour, day, week, month, quarter, year). Each takes 2026-10-14 15:47:23.123456 America/New_York, and its `exprs` are `[startOfX, endOfX]` formatted `Y-m-d H:i:s.u`.
    - **`instant`** (nanosecond instants):
      - a `U.u` microsecond round-trip through `createFromFormat`;
      - a pre-epoch `U.u` (1969-12-31 23:59:59.250000 UTC);
      - `getTimestampMs`;
      - `(int) diffInMicroseconds` over 1.000001 s.
    - **`format`** (PHP `date()` tokens): one need per token of `d D j l N S w z W F m M n t L o X x Y y a A B g G h H i s u v e I O P p T Z c r U`. Each is applied by `DateTimeImmutable::format` to four samples:
      - 2026-10-18 08:34:56.789012 America/New_York;
      - 2027-01-01 00:05:09.000001 Europe/London (ISO week 53 of 2026);
      - 2024-02-29 23:59:59.500000 Asia/Kolkata;
      - 1969-07-20 20:17:40 UTC.
  - The expected values are never written by hand: they come only from the fixtures.
- **bcrypt cases.** Each case's setup is `$pw = <PHP literal>; $h = crypt($pw, '$2y$12$<fixed 22-char salt>');` and its exprs are `$h`, `password_verify($pw, $h)` and `strlen($pw)`.
  - The fixed salt keeps the Oracle's two evaluations identical; cost 12 is Laravel's default.
  - The cases are ASCII of 71, 72, 73 and 200 bytes, and multibyte: `é`×36 (72 bytes); `a`+`é`×36 (73 bytes, where the 72-byte cut splits a character); and `a`+`パ`×66+`b` (200 bytes).
  - Bun verifies `Bun.password.verify(utf8(pw).subarray(0, 72), h)`, with the bytes passed and not re-decoded. Bun's result on the untruncated string is recorded as the control.
- **Requests.** Every line comes from `makeRequest`/`renderRequest` (`tools/oracle/request.ts`), uses kind `php-expr`, and has id XT-conformance-157 (needs) or XT-conformance-158 (bcrypt). It must pass `bun tools/oracle/story.ts check 8.4`.
- **Fixtures.** They are read from `conformance/fixtures/conformance/<sha256>.json` and checked with `verifyFixture` against `conformance/oracle/oracle.pub`. Only the CI `oracle.yml` `story` job produces them, and it commits them to `story/8.4`.
- **Tool CLI.** It follows `tools/porting/porting.ts`: a header comment and the subcommands `requests [--check]`, `check` and `generate`, each taking `[--root <dir>]`. Exit codes are 0 for a pass, 1 for a violation (fail closed) and 2 for a usage error. `check` prints one violation per line, naming the need or case id:
  - the request file differs from the registry;
  - a fixture is missing or fails verification;
  - an output has an `error`, or a result that is not a string;
  - the running Bun is not `.bun-version`;
  - `REPORT.md` drifts (first differing line).

  On a pass, `check` prints `SPIKES OK: <c> covered, <g> gaps (of <n> needs); <v>/<k> bcrypt cases verify.`
- **Report.** Two tables:
  - `| Group | Need | What Carbon needs | PHP (Oracle) | Temporal | Result |`, where Result is `covered` or `gap`, and a `gap` from `null` shows the reason;
  - `| Case | Bytes | PHP password_verify | Bun, truncated to 72 bytes | Bun, untruncated |`.
- **Escalations.** Each is `trigger: open-question`.
  - ESC-8.4-1 has `test_ids: [XT-conformance-157]`. It quotes the covered/gap counts and the gaps, and proposes building the Carbon port on Temporal, with a stated approach per gap.
  - ESC-8.4-2 has `test_ids: [XT-conformance-159]`. It proposes that a security-relevant Upstream release may trigger an out-of-cycle pin bump through the normal pin-bump flow.
  - Both stay open, with no orchestrator decision file.

**Never:**
- Don't edit `AGENTS.md`, the PRD, the spine, SPEC, `epics.md`, `conformance/expectations/**`, the harness, `tools/oracle/**`, `tools/ownership/**` or `tools/protected-paths/**`.
- Don't add an npm dependency.
- Don't write `decisions/OQ-4.md`, `decisions/OQ-12.md` or a decision for ESC-8.4-1 or ESC-8.4-2: those rulings are the Maintainer's.
- Don't hand-write or sign a fixture. Don't use random-salt `password_hash` or `Hash::make`: the Oracle rejects nondeterministic output.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pass | fixtures, report current | `SPIKES OK: …` | exit 0 |
| No fixture | a request without its fixture file | `<id>: no signed fixture conformance/fixtures/conformance/<sha>.json` | exit 1 |
| Bad signature | fixture altered | `<id>: fixture <path>: the signature does not verify` | exit 1 |
| Stale requests | registry changed, jsonl not regenerated | `conformance/oracle-requests/8.4.jsonl: differs from the registry; run bun run spikes:requests` | exit 1 |
| Report drift | `REPORT.md` edited | `conformance/spikes/REPORT.md: drift at line <n>; run bun run spikes:generate` | exit 1 |
| Usage | unknown subcommand or flag | usage on stderr | exit 2 |

</intent-contract>

## Code Map

- `prd.md:1430,1434,1438`: the OQ-4, OQ-8 and OQ-12 text. OQ-8's approach is "Maintainer: accepted".
- `tools/oracle/request.ts:157,164`: `makeRequest` and `renderRequest`. `tools/oracle/fixtures.ts:60,69,99,145`: `FIXTURES_DIR`, `PUBLIC_KEY_FILE` and `verifyFixture(text, pem, sha)`. Story fixtures land at `conformance/fixtures/<component>/<sha>.json`.
- `tools/oracle/story-requests.ts:1-48`: the request rules (the id is on the manifest, no duplicate sha, LF end). `tools/oracle/story.ts check 8.4` judges them locally.
- `tools/oracle/evaluate.php`: `php-expr` runs `setup`/`exprs` in a bare TestCase closure with the Upstream vendor loaded, so `\Carbon\CarbonImmutable` is available. The clock is frozen. Two evaluations must match (`story.ts:154-175`). A string result is `{"value":"…"}`, or `{"bytes":…}` when it is not UTF-8. An int is `{"value":{"int":"71"}}`.
- `packages/assert/tests/xaravel/comparison.test.ts:12-37`: the pattern for an XT that reads a signed fixture.
- `conformance/probes/probes.ts:1114`: reuse `runningBunViolation`. `tools/expectations/expectations.ts`: `UsageError`.
- `conformance/tests/xaravel/porting.test.ts`: the XT and CLI-fixture-root template. `conformance/harness/xaravel.ts:39` already discovers `conformance/tests/xaravel/**/*.test.ts`, so no harness change is needed.
- `tools/escalations/escalations.ts:95,235-255`: the Escalation frontmatter. `conformance/escalations/ESC-8.3-2.md` shows the shape.
- `stories/8.4.md`: XT-conformance-157, 158 and 159, component `conformance`.

## Tasks & Acceptance

**Execution:**
- `conformance/spikes/spikes.ts` (new): the registries, the Temporal mappings, the bcrypt verifier, `renderRequestsFile`, `checkSpikes(root, live)` (pure), `renderReport`, and the CLI.
- `conformance/oracle-requests/8.4.jsonl` (new): written by `spikes:requests`.
- `conformance/spikes/REPORT.md` (new): written by `spikes:generate` once the fixtures exist.
- `conformance/tests/xaravel/spikes.test.ts` (new): XT-conformance-157, 158 and 159.
- `decisions/OQ-8.md` (new): frontmatter `decision: confirmed`, `decided_by: orchestrator (MAINT-2026-10-16)`, `date`, `source: conformance/spikes/REPORT.md`. The body gives the per-case table, and states that truncating to 72 UTF-8 bytes reproduces PHP while the untruncated control shows Bun's pre-hash.
- `conformance/escalations/ESC-8.4-1.md` and `ESC-8.4-2.md` (new).
- `package.json`: the `spikes:requests`, `spikes:check` and `spikes:generate` scripts. `docs/ops/spikes.md` (new), linked from `docs/ops/probes.md`.

**Acceptance Criteria:**
- **XT-conformance-157** (OQ-4, FR-25):
  - Every AC group and every listed token has a need.
  - The requests file equals the registry render.
  - Each need's fixture verifies.
  - Each need's live Temporal result, compared with the fixture, gives the Result its `REPORT.md` row shows. This is asserted per need.
  - `REPORT.md` equals `renderReport`.
  - Either `decisions/OQ-4.md` exists with `decided_by: Maintainer`, or ESC-8.4-1 exists with `trigger: open-question`, cites XT-conformance-157 and has no decision file.
- **XT-conformance-158** (OQ-8, FR-78):
  - Every case's fixture verifies.
  - The hash starts `$2y$12$`.
  - PHP's `password_verify` is true, and `strlen` equals the case's byte count.
  - `Bun.password.verify` on the 72-byte truncation is true for every case.
  - The untruncated control is false for every case over 72 bytes.
  - `decisions/OQ-8.md` names every case id with its result.
- **XT-conformance-159** (OQ-12): either `decisions/OQ-12.md` exists with `decided_by: Maintainer` and states whether such a bump is allowed, or ESC-8.4-2 exists with `trigger: open-question`, cites XT-conformance-159 and has no decision file.
- The I/O matrix rows, run on `mkdtempSync` fixture roots through the CLI, each give their message and exit code.

## Spec Change Log

- Mapping corrections. The mappings were checked against a local, unsigned preview of `evaluate.php` before the CI round trip; only the CI fixtures count. Three mappings were simply wrong and were fixed. None of them became a gap:
  - `instant.getTimestampMs`: Carbon computes `round(rawFormat('Uu') / 1000)`, which gives `-1250` before the epoch, not the instant's `-750`. The mapping now does the same arithmetic over `Uu`.
  - `format.p`: PHP prints `Z` only for a UTC abbreviation (Europe/London in winter gives `+00:00`), so the mapping tests Intl's abbreviation and not a zero offset.
  - `bounds.week`: Carbon's `en` locale starts the week on Monday (`first_day_of_week => 1`), so the mapping uses ISO day 1, not Intl's en-US Sunday.
- Gaps: `format.I` (null, as designed) and `format.T` (Intl gives `GMT+5:30` for IST). ESC-8.4-1 carries both.
- Verification note: the harness `--id` glob supports only `*` and `?`, so `'XT-conformance-15[789]'` matches nothing. Use `--id XT-conformance-157 --id XT-conformance-158 --id XT-conformance-159`.

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 39 findings — high 0, medium 5, low 29, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) `decisions/OQ-4.md` and `OQ-12.md` are absent, and XT-157/159 accept an open Escalation in their place. A ruling is the Maintainer's (AGENTS.md: raise an Escalation, never decide locally). The AC is recorded as conditional on ESC-8.4-1 and ESC-8.4-2 (LESSONS, epic 4), and the open rulings are reported under Auto Run Result.
  - `[low]` `[reject]` (intent) The hashes come from `crypt()`, not `Hash::make`. It is the same `$2y$` bcrypt at Laravel's cost. A random salt cannot get a fixture, because the Oracle rejects differing evaluations.
  - `[low]` `[reject]` (intent) There is no multibyte case at 71 bytes. The AC's lengths are all covered, and multibyte is covered at 72, 73 (split character) and 200.
  - `[false]` `[reject]` (intent) The fixtures are not in the diff. They are in commit a13159a, which the CI `story` job signed; the review diff left them out on purpose, as machine-signed data.
  - `[false]` `[reject]` (intent) The XTs use `expect` from `bun:test`. AGENTS.md forbids that only in Ported Tests; 50 Xaravel Test files under `conformance/tests/xaravel/` do the same.
  - `[medium]` `[patch]` (edge, with its claim row) `check` passes on a failed bcrypt case: Bun's truncated verify false, the control wrong, or a bad Oracle `password_verify`/`strlen`. Fix: added id-named violations to `checkSpikes`.
  - `[low]` `[patch]` (edge) A `crypt()` failure string as the hash would be verified as a mismatch. Fix: a hash without `SALT_PREFIX` is a violation. Grouped with the bcrypt-violation entry.
  - `[medium]` `[patch]` (edge, and blind's three-way-verdict finding) `verifyCase` swallows a throw as `false`, so a rejected hash looks like a mismatch. Fix: removed the catch, so a throw fails loudly.
  - `[low]` `[patch]` (edge) Oracle `password_verify`/`strlen` are not checked by the CLI. Fix: grouped with the bcrypt-violation patch.
  - `[low]` `[reject]` (edge) A `{throws: null}` result raises a TypeError. That needs a malformed signed fixture, which the Oracle never writes, and it still fails loudly.
  - `[low]` `[reject]` (edge) An `error` that is not an object prints `null` fields. Same class: the evaluator always writes an object, and it still fails.
  - `[low]` `[reject]` (edge) An undecodable fixture shows `(no fixture)` in the report. The violation is still reported and the check exits 1.
  - `[low]` `[reject]` (edge) `U.u` parsing has no format guard. The inputs are registry constants, not user input.
  - `[low]` `[patch]` (edge) `Math.round` versus PHP's round half away from zero in `getTimestampMs`. Fix: rounds as PHP does.
  - `[low]` `[reject]` (edge) `--root` given twice: the last one wins. This is unlikely, and a guard is new surface.
  - `[low]` `[reject]` (edge) A gap reason containing ` | ` would split the report cell. No reason contains one, and escaping is new surface.
  - `[low]` `[reject]` (edge) The untruncated control at ≤72 bytes is asserted only through OQ-8.md. The REPORT drift check also pins it, and the new `checkSpikes` violation covers it.
  - `[medium]` `[patch]` (edge claim) Same root as the first bcrypt finding: `check` is not fail-closed on OQ-8. Shares that fix.
  - `[low]` `[patch]` (edge claim, and blind's matching finding) XT-159's ruled-branch regex passes any text containing "may". Fix: it now requires frontmatter `decision: allowed | not-allowed`, and ESC-8.4-2 says so.
  - `[low]` `[reject]` (edge claim) `checkSpikes` reads files, so it is not pure. As with `checkProbes`, "pure" here means it runs nothing and writes nothing; its doc comment says exactly that.
  - `[medium]` `[patch]` (verification-gap) No test covers a running Bun other than the pin, for `check` or `generate`. Fix: added both cases to `cliMatrix`.
  - `[low]` `[patch]` (verification-gap) The `requests` write path is never run. Fix: added a stale-file case to `cliMatrix`.
  - `[low]` `[reject]` (blind) The spec's Verification `--id` glob matches nothing. The fix edits this build's spec; the Change Log already records the working command.
  - `[false]` `[reject]` (blind) No permission is recorded for the Protected Paths. MAINT-2026-10-16 treats every Epic 1–8 Story as a Maintainer-approved Infrastructure Story.
  - `[false]` `[reject]` (blind) OQ-8.md's `decided_by: orchestrator` is unverifiable. `decisions/MAINT-2026-10-16-unattended-orchestrator.md` is on `main`, and PRD:1434 records "Maintainer: accepted"; OQ-8.md cites the PRD.
  - `[medium]` `[patch]` (blind) ESC-8.4-1's proposed table source, ICU zoneinfo64, has no tzdata abbreviations. Fix: the source is now the IANA tzdata release matching `process.versions.tz`, or PHP's timelib through the Oracle.
  - `[low]` `[patch]` (blind) `format.p` relies on the Intl abbreviation that the Escalation rejects. Fix: ESC-8.4-1 now says `p` reads the same table.
  - `[low]` `[patch]` (blind) No sample tests extreme years or most ordinal suffixes. Fix: ESC-8.4-1 now lists them under "Not covered by the spike". New samples would need another Oracle round trip for plain arithmetic.
  - `[low]` `[patch]` (blind) The Europe/Dublin argument was never measured. Fix: ESC-8.4-1 now marks it as reasoning.
  - `[low]` `[patch]` (blind) The `(int)` casts hide Carbon 3's float diffs, and other Carbon areas are absent. Fix: listed under "Not covered by the spike" in ESC-8.4-1.
  - `[low]` `[reject]` (blind) Bun-hash → PHP-verify is not measured. The AC asks only for PHP → Bun, and OQ-8.md labels the reverse as inferred.
  - `[low]` `[reject]` (blind) Covered by the verifyCase entry above (same root).
  - `[low]` `[reject]` (blind) The error-output and wrong-type violations are untested. Testing them needs signed malformed fixtures under a throwaway key; the paths only fail closed.
  - `[low]` `[patch]` (blind) Covered by the XT-159 regex entry above (same root).
  - `[low]` `[reject]` (blind) The Carbon, ICU and tz versions are not recorded in REPORT. The Pin and `.bun-version` fix them, and drift fails on any change.
  - `[low]` `[patch]` (blind) `FIXTURE_DIR`/`PUBLIC_KEY_FILE` are copied from `tools/oracle/fixtures.ts`. Fix: they are now imported.
  - `[low]` `[reject]` (blind) The fixtures are verified twice per run. That is 72 Ed25519 verifies, which takes negligible time.
  - `[low]` `[reject]` (blind) The CLI matrix runs inside XT-157. The repository uses one XT id per file, and a CLI failure still fails a named test.
  - `[false]` `[reject]` (blind) The committed spec is stale (`in-review`, empty log). The workflow updates the status and the log in this step, and they are committed at finalize.

## Design Notes

**Why the Oracle supplies every expected value.** Carbon's real behaviour is the specification, and hand-written values would encode guesses: for example, whether Carbon 3's `addHours` across the DST gap is wall-clock or real time, or what `X` prints. A mapping that disagrees with the fixture is either fixed, when the mapping was simply wrong, or reported as a `gap`, when Temporal cannot express the need. The Spec Change Log records which it was.

**Fixtures need a CI round trip.** This host has no Docker and no signing key. During implementation:
1. Commit the registry and `8.4.jsonl`, push, and open the PR.
2. The `oracle.yml` `story` job signs the fixtures and commits them to `story/8.4`.
3. Pull them, fix any mapping errors, run `spikes:generate`, write the Escalations and OQ-8.md from the report, and push.

Until step 3, `spikes:check` and XT-157/158 fail on missing fixtures. That is expected.

**Covered vs gap for `I` and `T`.** Temporal has no DST flag and no zone abbreviation. `T` uses `Intl.DateTimeFormat` with `timeZoneName: 'short'`; it is a gap if any sample disagrees, which is likely for IST. `I` returns `null` ("no DST flag in Temporal").

## Verification

**Commands:**
- `bun tools/oracle/story.ts check 8.4`: expected exit 0.
- `bun run spikes:requests --check`, `bun run spikes:check`: expected exit 0 once the fixtures are on the branch.
- `bun run harness --xaravel --id 'XT-conformance-15[789]'`: expected to pass.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run harness --xaravel`: expected exit 0.
- CI: the `oracle` `story` job commits the fixtures, and every other check is green.

## Auto Run Result

Status: done

**Summary.** Story 8.4 adds the spike tool `conformance/spikes/spikes.ts`. It has two registries:
- 65 Carbon needs in five groups: `tz`, `month`, `bounds`, `instant`, and `format` (every PHP `date()` token). Signed Oracle fixtures supply the expected values. Each need's Temporal mapping runs live on Bun 1.4.3.
- 7 bcrypt cases. Each hash is PHP's own `$2y$12$`. Bun verifies it live on the input truncated to 72 UTF-8 bytes.

The 72 Oracle requests (`conformance/oracle-requests/8.4.jsonl`) went through Story 3.4's flow. The `oracle.yml` `story` job signed the fixtures and committed them as a13159a. `conformance/spikes/REPORT.md` is generated, and `bun run spikes:check` fails closed.

**Results**
- **OQ-4:** 63 covered and 2 gaps, `format.I` (no DST flag in Temporal) and `format.T` (Intl gives `GMT+5:30` for IST). The ruling is raised as ESC-8.4-1, which recommends building the port on Temporal with a generated tzdata table for the zone metadata.
- **OQ-8:** confirmed. All 7 cases verify after truncation, including the 72-byte cut inside a character. The untruncated control fails for every case over 72 bytes. `decisions/OQ-8.md` records this.
- **OQ-12:** raised as ESC-8.4-2, which recommends allowing an out-of-cycle pin bump for security-relevant releases, with a Maintainer-only override.

**Conditional ACs.** The AC1 ruling and AC3 are conditional on the Maintainer. `decisions/OQ-4.md` and `decisions/OQ-12.md` are the Maintainer's to write, and ESC-8.4-1 and ESC-8.4-2 wait on the Maintainer. XT-157 and XT-159 accept either the ruling (`decided_by: Maintainer`, and for OQ-12 `decision: allowed | not-allowed`) or the open Escalation, so they pass now and stay strict once the ruling lands.

**Files changed**
- `conformance/spikes/spikes.ts` (new): the registries, the mappings, `checkSpikes`, `renderReport` and the `requests|check|generate` CLI.
- `conformance/spikes/REPORT.md` (new): the generated report.
- `conformance/oracle-requests/8.4.jsonl` (new): the requests.
- `conformance/fixtures/conformance/*.json` (new, 72): signed by CI.
- `conformance/tests/xaravel/spikes.test.ts` (new): XT-conformance-157, 158 and 159, plus the CLI matrix.
- `decisions/OQ-8.md` (new): the bcrypt result.
- `conformance/escalations/ESC-8.4-1.md` and `ESC-8.4-2.md` (new): open, for the Maintainer.
- `package.json`: the `spikes:*` scripts. `docs/ops/spikes.md` (new) and `docs/ops/probes.md`: the docs.
- `stories/8.4.md`, `sprint-status.yaml`: the Story is `done`.

**Review findings.** There were 39 findings: 4 medium and 9 low entries patched, nothing deferred, and the rest rejected with the reasons in the Review Triage Log.
- **Patched:**
  - fail-closed bcrypt violations in `check`;
  - no swallowed `verifySync` throw;
  - pin-mismatch and request-write tests;
  - ESC-8.4-1's table source corrected (ICU has no tzdata abbreviations), with its unmeasured claims and its scope limits marked;
  - XT-159 requires an explicit `decision:` value;
  - PHP-style rounding in `getTimestampMs`;
  - the shared constants are imported, not copied.
- **Rejected:** 5 false and 21 low; each reason is in the log.

**Follow-up review recommended: true.** Four medium entries were patched. The specific unverified risks:
- The Oracle-side bcrypt violations (hash prefix, `password_verify`, `strlen`) have no test, because testing them needs a signed malformed fixture.
- ESC-8.4-1's tzdata-table proposal is reasoning, not measured.

**Verification**
- `bun tools/oracle/story.ts check 8.4`: 72 accepted.
- `spikes:requests --check`: exit 0.
- `spikes:check`: `SPIKES OK: 63 covered, 2 gaps (of 65 needs); 7/7 bcrypt cases verify.`
- `typecheck`, `lint` and `escalations:check`: exit 0.
- `bun run test`: 276 pass, 0 fail.
- `bun run harness --xaravel`: 276/276, `differ=0`.

**Residual risks**
- REPORT.md records live Intl and Temporal output, so a Bun bump that changes them shows up as drift and needs a regenerate.
- ESC-8.4-1 and ESC-8.4-2 wait on the Maintainer.
