---
test_ids:
  - XT-config-7
trigger: protected-path
proposed: >-
  Option 1 (recommended): a Maintainer-approved change to
  `conformance/api-surface/additions.jsonl` (Protected) adds the 48 lines
  listed below, one `member: null` line per class Story 15.2 ported from
  vlucas/phpdotenv v5.7.0, phpoption/phpoption 1.10.0 and
  graham-campbell/result-type 1.2.0, each citing `FR-20`, the requirement
  those ports implement (FR-20.1, phpdotenv's grammar; FR-20.2, its
  repository precedence). They are `extra` because the Upstream export
  `conformance/api-surface/config.jsonl` covers only `illuminate/config`,
  while ESC-15.2-4's ruling makes `@xaravel/config` own these classes
  under their original FQCNs. The lines go in canonical order, sorted by
  component then FQCN, between the `collections` and later components'
  lines. Story 15.3 then writes XT-config-7 (the Epic-close checks,
  `api-surface:gate config` among them) once the lines are on `main`.
  Option 2: one line per member instead of per class; it explains the
  same items with one line per public member of the 48 classes, and none
  of the classes has an Upstream record its members could match.
evidence: >-
  At 377bceeaca9ef68f2aba23cad47e8b1ebc3e15f3, `bun run api-surface
  --details config` prints `api-surface config: 25 Upstream, 25 matched,
  0 missing, 0 renamed, 48 extra, 0 mismatched, 0 div12; 48 unexplained
  (AD-15)`; all 48 items are `extra class` lines under `Dotenv\`,
  `PhpOption\` and `GrahamCampbell\ResultType\`, so `bun run
  api-surface:gate config` fails. docs/ops/api-surface.md § Explained
  items: an `extra` item is explained only by an `additions.jsonl` line,
  `member: null` for the whole class, and docs/ops/oracle.md § Citation
  files lets an addition cite `FR-<n>`. AD-16 makes
  `conformance/api-surface/` Protected (everything in `conformance/`
  except expectations, escalations, oracle requests and fixtures). Probe
  on 2026-10-30: with the 48 lines below merged into a local copy of
  additions.jsonl in canonical order (restored afterwards, never
  committed), `bun run api-surface:gate config` prints `api-surface:gate
  config: 0 unexplained (AD-15)` with no citation problem. The other
  Epic-close checks need no Protected Path: `packages/config` has its
  README, LICENSE and NOTICE, and its docs page (still unwritten:
  `packages/config/docs/` is empty) is package work; it has no `async-surface.json` yet
  (packages/collections, runtime and others commit one), and no
  `blocked-by:config` line exists under conformance/expectations.
---

# ESC-15.3-2: the config API-surface gate needs 48 `additions.jsonl` lines

Story 15.3 carries Epic 15's close, and its first check is that `bun run api-surface:gate config` passes with zero unexplained members. It fails today on 48 `extra` classes: the phpdotenv, PhpOption and ResultType ports Story 15.2 registered under their original FQCNs, which ESC-15.2-4's ruling put in `@xaravel/config`. The Upstream export for `config` covers only `illuminate/config`, so only `additions.jsonl` lines can explain them, and that file is Protected.

Option 1 adds one `member: null` line per class, citing `FR-20`; with them the gate passes (probed locally, not committed). Option 2 cites each member instead. XT-config-7 waits for the lines; under the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md`, this `protected-path` Escalation waits for the second key.

The proposed lines:

```jsonl
{"component":"config","fqcn":"Dotenv\\Dotenv","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Exception\\ExceptionInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Exception\\InvalidEncodingException","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Exception\\InvalidFileException","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Exception\\InvalidPathException","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Exception\\ValidationException","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Loader\\Loader","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Loader\\LoaderInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Loader\\Resolver","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\Entry","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\EntryParser","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\Lexer","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\Lines","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\Parser","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\ParserInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Parser\\Value","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\AdapterRepository","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\AdapterInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ApacheAdapter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ArrayAdapter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\EnvConstAdapter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\GuardedWriter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ImmutableWriter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\MultiReader","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\MultiWriter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\PutenvAdapter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ReaderInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ReplacingWriter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\ServerConstAdapter","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\Adapter\\WriterInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\RepositoryBuilder","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Repository\\RepositoryInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\FileStore","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\File\\Paths","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\File\\Reader","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\StoreBuilder","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\StoreInterface","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Store\\StringStore","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Util\\Regex","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Util\\Str","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"Dotenv\\Validator","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"GrahamCampbell\\ResultType\\Error","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"GrahamCampbell\\ResultType\\Result","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"GrahamCampbell\\ResultType\\Success","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"PhpOption\\LazyOption","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"PhpOption\\None","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"PhpOption\\Option","member":null,"citation":"FR-20"}
{"component":"config","fqcn":"PhpOption\\Some","member":null,"citation":"FR-20"}
```
