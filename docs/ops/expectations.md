# The Expectations File

The Expectations File records exactly one status for every Test ID × Backend Variant pair in the [Test Inventory](inventory.md) (FR-3, AD-15). The harness (Story 5.3) compares results against it, and the Ratchet (Story 5.6) guards it. The tool is `tools/expectations/expectations.ts`.

## The Variant vocabulary

`conformance/variants` is the closed list of Backend Variants. It is UTF-8 with LF line endings, one Variant per line, sorted by UTF-16 code units, with no duplicates. Lines starting with `#` and blank lines are ignored. A Variant is a backend (`sqlite`) or `<driver>@<backend>` (`queue-database@pgsql`).

A Test ID's Variants are exactly its Inventory `backends`; tests never declare their own. Every backend the Inventory uses must be in the vocabulary, or both commands fail and name the Test ID and backend. The vocabulary includes the post-alpha backends the Inventory already tags (`mariadb`, `mysql`, `sqlsrv`, `queue-beanstalkd@beanstalkd`), per [ESC-5.1-1](../../decisions/ESC-5.1-1.md), so the denominator stays the full count. Which Variants are alpha is not recorded here; PRD SM-1 and AD-28 define it. Adding a Variant is a Protected Path change. `queue-database@pgsql` and `session-redis@redis` are members, but no Inventory entry uses them today, so they have no Expectations lines.

## Shards

Expectations are sharded to mirror the Ported Test files:

```
conformance/expectations/<component>/<Upstream test path>.jsonl
```

`<Upstream test path>` is the Inventory entry's `source` without its `:<start>-<end>` suffix and `.php` extension. For example, `framework/tests/Integration/Support/AuthFacadeTest.php:11-18` in Component `support` goes to `conformance/expectations/support/framework/tests/Integration/Support/AuthFacadeTest.jsonl`, beside `packages/support/tests/ported/framework/tests/Integration/Support/AuthFacadeTest.test.ts`.

Each line is one JSON object with exactly these keys, in this order, and no spaces:

```
{"id":"Illuminate\\Tests\\Integration\\Support\\AuthFacadeTest::testItFailsIfTheUiPackageIsMissing","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":null}
```

Lines are sorted by `id`, then `variant`. Files are UTF-8 with no BOM, LF line endings, no blank lines, and exactly one final LF. Each `(id, variant)` appears exactly once across all shards.

## Commands

```sh
bun run expectations:init  [--root <dir>]
bun run expectations:check [--root <dir>]
```

- **`init`** adds a line for every Inventory pair that has none, in the shard the path rule names: `status:"skip"`, `reason:"not-ported-yet"` (`"deferred:ai-sdk"` for Component `ai`), `adapted:null`, `escalation:null`. It never rewrites or removes an existing line, re-sorts only the shards it adds to, and a second run changes nothing. Run it after the Inventory gains Test IDs. It prints `Expectations init: added <n> line(s) in <m> shard(s).`
- **`check`** validates the vocabulary and every file under `conformance/expectations/`. It reports each violation on its own stderr line and exits 1: a format fault (invalid UTF-8, BOM, CR, missing final LF, blank line, wrong keys or key order, unsorted or duplicated line), a Variant outside the vocabulary, `missing: <id> × <variant>`, `duplicate: <id> × <variant> in <paths>`, `unknown: <id> × <variant>`, a line in a shard outside its Component's directory, or a file that is not `.jsonl`. On success it prints `Expectations OK: <lines> line(s) in <shards> shard(s) cover <pairs> Test ID × Variant pair(s).` CI runs it in the required `check` job.

Exit codes: 0 pass, 1 violations or any failure, 2 usage error.

## After an Inventory change

When the Pin moves, `bun run pin:bump <tag> --apply` ([upstream.md](upstream.md)) edits the shards: it resets changed Test IDs to `skip` / `not-ported-yet`, renames lines of renamed Test IDs and deletes lines of removed ones. An `unknown:` line therefore means the Inventory changed without that step. Run `expectations:init` afterwards to add lines for new Test IDs. Stories edit only their own Test IDs' lines; Story 5.6 enforces that.

Skip Reason rules and status values are checked by Story 5.2. Line ownership and the Ratchet are Story 5.6.
