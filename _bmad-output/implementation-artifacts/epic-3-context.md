# Epic 3 Context: Oracle fixtures, signing & Upstream scans

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Framework Agents get trustworthy expected values from real PHP Laravel without installing PHP. Inputs for every Differential Test are extracted mechanically from the Upstream snapshot. The Oracle container runs them once per Pin and produces Ed25519-signed fixtures that CI verifies, so nobody can forge one. Stories can request extra values through their own request file. The epic also extracts, as committed data, the Upstream facts that later work relies on: the public API surface, facade `@method` lists, `singleton()` bindings, boot-only state, the closure allowed-identifier list, the DIV-12 property/method pairs, and PHPUnit/Mockery usage. The grader (Epic 4), lint (Epic 6), the closure codec and `PORTING.md` all start from these lists, not from hand-written guesses.

## Stories

- Story 3.1: Oracle request format and mechanical extraction
- Story 3.2: Batch fixture generation and Ed25519 signing
- Story 3.3: Fixture signature verification in CI
- Story 3.4: Per-Story Oracle requests
- Story 3.5: API-surface export
- Story 3.6: Upstream scans: facades, singletons and boot-only state
- Story 3.7: Upstream scans: closure identifiers, DIV-12 pairs and test-API usage

## Requirements & Constraints

- **Kind.** This is Conformance System work (`component: conformance`), done as Maintainer-approved Infrastructure Stories. Every acceptance criterion is verified by an `XT-conformance-<n>` test. The IDs are already allocated in `stories/3.*.md` (68 onwards), one per AC in order; do not renumber them. These tests run under plain `bun test` until Epic 5 moves them onto `xaravelTest`.
- **Differential families.** Str, the SQL grammars (all five: sqlite, pgsql, mysql, mariadb, sqlsrv), Blade rendered HTML, validation messages and date formatting. Generator output is never Oracle-generated; it uses the Protected reference files in `conformance/fixtures/generators/`.
- **Determinism everywhere.** Extraction, batch generation, API-surface export and every scan must give byte-identical output when run twice on the same snapshot or Pin. A nightly job re-checks Oracle determinism. A difference fails the job and opens an Escalation.
- **Data files.** JSONL, sorted, one record per line, UTF-8 with LF line endings. Tools read Upstream only from `conformance/upstream/` and never fetch. Contributors need neither Docker nor PHP, and `bun test` never calls Docker.
- **Protection.** Scan outputs, `conformance/oracle/requests/`, `oracle.pub`, the api-surface `additions.jsonl`/`exceptions.jsonl`, `tools/lint-rules/singletons.json` and `conformance/boot-only-state` are all Protected, so they land only through Maintainer review. `conformance/fixtures/` (signed) and `conformance/oracle-requests/` are not Protected, and `conformance/fixtures/` must have no CODEOWNERS owner.
- **Secrets.** The Ed25519 private key exists only as a secret of the Oracle job. Never commit it. Only the Oracle, dashboard and release jobs may hold write scopes.

## Technical Decisions

- **Request record.** It is validated by `conformance/oracle/schema.json`. Required fields:
  - `id`: a Test ID or an `XT` ID;
  - `kind`: `php-expr`, `blade-render`, `sql-grammar`, `validation-message`, `date-format`, …;
  - `input`;
  - `sha256` of the canonical request.

  `bun run oracle:extract` writes `conformance/oracle/requests/<component>.jsonl`, with one request per Differential Test ID × dataset.
- **Fixtures.** Each fixture is `conformance/fixtures/<component>/<request-id>.json`. It holds the request hash, the output, and an Ed25519 signature over both. The verification key is `conformance/oracle/oracle.pub`, and its fingerprint is recorded in `docs/ops/oracle.md`. CI fails a fixture whose signature doesn't verify, or whose hash doesn't match its request, and names the file. Fixtures are protected by signature, not by path.
- **Per-Story requests.** A Story commits `conformance/oracle-requests/<story-id>.jsonl`. The Oracle workflow runs on the PR and validates each request against the schema and the Story's `test_ids` / `xaravel_test_ids`. It rejects unowned IDs with a PR comment. It runs the rest in the image and commits signed fixtures to the Story branch as the `xaravel-oracle` GitHub App. Fidelity Review checks each request against Upstream.
- **API surface.** `bun run oracle:api-surface` uses PHP Reflection in the image to write `conformance/api-surface/<component>.jsonl`. Each line is one public class, interface, trait or function member: FQCN, member name, static flag, parameter names, defaults and nullability. `additions.jsonl` and `exceptions.jsonl` start empty, and their schema requires a citation on every line: an FR, a DIV or a `deferred:` item. The `.d.ts` diff itself belongs to Epic 6.
- **Scans.**
  - `scan:facades` writes `conformance/scans/facades.jsonl`. For each `Illuminate\Support\Facades\*` class it lists the accessor, the root class and every `@method` signature. Facade delegators are generated from it.
  - `scan:singletons` writes `tools/lint-rules/singletons.json`, listing every class an Upstream provider binds with `singleton()`. It also seeds `conformance/boot-only-state` with the properties written only during `register`/`boot`. Lint later rejects `this.<field>` writes after construction in the listed classes, and boot-only state throws if written after `sealed`.
  - `scan:closures` writes `allowed-identifiers.json`: every facade short name and global helper function name. These are the only free identifiers the closure codec allows besides parameters and ECMAScript built-ins.
  - `scan:div12` writes `conformance/scans/div12-pairs.jsonl`: every class where a property and a method share a name, classified as model-config, option-pair or method-plus-state. The list is committed into `PORTING.md`.
  - `scan:test-api` writes `conformance/scans/phpunit-assertions.jsonl` and `mockery-api.jsonl`: every assertion and Mockery method used by the Upstream suites, with usage counts.
- **Stack.**
  - Bun 1.4.3, TypeScript 7.0.2 (`tsc --strict`) and oxlint 1.88.0. Never use Node, npm, Jest, Vitest, ESLint or Prettier.
  - The Oracle runs PHP 8.5.11 at Pin `v13.37.0`.
  - The Pin has one source of truth, `conformance/baseline-pin`. Derive every other value from it, and hash every build input into image or cache keys.
  - PHP code that a tool runs needs at least one test that really executes it.

## Cross-Story Dependencies

- 3.1 → 3.2 → 3.3. Story 3.4 reuses 3.1's schema, 3.2's signing and 3.3's verification. Stories 3.5–3.7 depend only on the snapshot and the image, so they can run in parallel with 3.1–3.4.
- **Later epics.** Epic 4's grader coverage needs 3.7's usage scans. Epic 6 needs 3.5's surface for the `.d.ts` diff and 3.6's `singletons.json` for lint. Epic 5's nightly job runs the Oracle determinism re-check. Phase 1+ Differential Tests consume the fixtures. The serializable-closure Epic consumes `allowed-identifiers.json`. `PORTING.md` (Epic 8) consumes the DIV-12 pairs.
- **Maintainer-run steps.** Plan these up front: generating the Ed25519 key pair and the job secret, creating and installing the `xaravel-oracle` GitHub App (it is not yet in `docs/ops/identities.md`), and the live workflow runs. Remember that admin merges can't prove identity-separation checks.
- **What Epic 2 left in place.**
  - The read-only snapshot `conformance/upstream/{framework,ai,mcp,boost}/` and `conformance/baseline-pin` (a table of tags and tree hashes), with `tools/upstream/upstream.ts` (`readPin`, `upstreamPath`, `UPSTREAM_REPOS`).
  - The Oracle image: `conformance/oracle/Dockerfile` and `locks/`, with `tools/oracle/oracle.ts`. It provides `runInImage` (`--network none`, read-only mounts), `runInImageNetworked`, `imageTag` (`<Pin>-<imagehash>`) and `IMAGE_UPSTREAM_DIR=/oracle/upstream`. The image user is 1001, and it is published to GHCR only by `oracle.yml#oracle`. This is documented in `docs/ops/oracle.md`.
  - The Inventory `conformance/inventory/<component>.jsonl` (fields `id, component, kind, backends, source, hash, assertions, oracle`) and `conformance/component-map`, which maps test files to Components and records FQCN namespaces and aliases. Test IDs are `<FQCN>::<method>#<dataset>` for PHPUnit and `<suite>/<file>::… #<dataset>` for Pest.
  - The tools under `tools/` (`inventory`, `baseline` with its PHP `lister.php`/`recorder.php`/`runner.php`, `pin-bump`, `component-map`, `workflow-permissions` with `ALLOWED_WRITE_JOBS` that already includes `oracle.yml#oracle`, and `protected-paths`). All follow one CLI shape: `main(argv)`, `UsageError` exiting with 2, `--root`, and a `check` mode that fails closed.
  - The retro flagged duplicated JSONL, walk and spawn helpers across tools. It suggests a shared `tools/lib` once Epic 3's tools start.
  - The test model is `conformance/tests/xaravel/*.test.ts`, with temp fixture roots, a fake `docker`/`php` on `PATH`, and real-snapshot parts guarded by `existsSync`.
