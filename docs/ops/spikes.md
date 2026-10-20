# Temporal and bcrypt spikes (OQ-4, OQ-8)

Story 8.4 answers two Phase 0 questions with Oracle evidence:

- **OQ-4.** Does Bun 1.4.3's `Temporal` cover what the Carbon port needs?
- **OQ-8.** Do PHP `$2y$` bcrypt hashes verify in Bun once the input is truncated to 72 UTF-8 bytes?

`conformance/spikes/spikes.ts` holds two registries:

- **Carbon needs** (XT-conformance-157). Each need has an id `<group>.<name>`, PHP expressions (one per sample, each returning a string) and a `temporal()` mapping that returns the same number of strings, or `null` with a reason when Temporal has no API for it. The groups are `tz` (timezone and DST), `month` (overflow and clamping), `bounds` (`startOf*` / `endOf*`), `instant` (nanosecond instants) and `format` (one need per PHP `date()` token, applied to four samples).
- **bcrypt cases** (XT-conformance-158). Each case runs `$pw = <literal>; $h = crypt($pw, '$2y$12$XaravelSpike84OracleTu');` in the Oracle and records `$h`, `password_verify($pw, $h)` and `strlen($pw)`. The salt is fixed so the Oracle's two evaluations match; cost 12 is Laravel's default. Bun verifies `Bun.password.verify(utf8(pw).subarray(0, 72), h)`, passing the bytes without re-decoding them, and the untruncated string as the control.

The PHP side of every comparison comes only from the Oracle's signed fixtures, never from a value written by hand. A mapping uses only `Temporal`, `Intl` and plain arithmetic. A need is `covered` when every Temporal string equals the Oracle's value, otherwise it is a `gap`. When a mapping disagrees with the Oracle, either the mapping was wrong and is fixed, or Temporal cannot express the need and it stays a gap.

## Commands

| Command | What it does |
| --- | --- |
| `bun run spikes:requests [--check]` | Writes `conformance/oracle-requests/8.4.jsonl` from the registries, one `php-expr` request per need and per case (Story 3.4's per-Story request flow). With `--check` it writes nothing and exits 1 when the file differs. |
| `bun run spikes:check` | Runs every mapping and the bcrypt verifier live, reads and verifies each request's fixture `conformance/fixtures/conformance/<sha256>.json` against `conformance/oracle/oracle.pub`, and compares all three with `conformance/spikes/REPORT.md`. It prints one violation per line, naming the need or case id, and exits 1. On a pass it prints `SPIKES OK: <c> covered, <g> gaps (of <n> needs); <v>/<k> bcrypt cases verify.` A running Bun other than the `.bun-version` pin is a violation. |
| `bun run spikes:generate` | Rewrites `REPORT.md` from the registries, the fixtures and a live run. It refuses, writing nothing, on any violation other than report drift. |

Each takes `--root <dir>`. Exit codes: 0 pass, 1 any violation or failure, 2 a usage error.

## Changing a need or a case

The fixtures can only come from CI, because only the `oracle.yml` `story` job holds the signing key:

1. Edit the registry, run `bun run spikes:requests`, and check it with `bun tools/oracle/story.ts check 8.4`.
2. Push. The `story` job evaluates the new requests twice in the Oracle image, signs them, and commits the fixtures to the Story branch.
3. Pull, fix any mapping that was simply wrong, then run `bun run spikes:generate` and `bun run spikes:check`.

Until step 3, `spikes:check` and XT-conformance-157 and 158 fail because fixtures are missing.

## Where the results go

- `REPORT.md` has the per-need table and the per-case bcrypt table.
- `decisions/OQ-8.md` records the bcrypt measurement. The Maintainer had already accepted the 72-byte truncation approach.
- OQ-4 and OQ-12 are the Maintainer's rulings. They are raised as `conformance/escalations/ESC-8.4-1.md` (OQ-4, citing XT-conformance-157) and `ESC-8.4-2.md` (OQ-12, citing XT-conformance-159). The Maintainer writes `decisions/OQ-4.md` and `decisions/OQ-12.md`.
