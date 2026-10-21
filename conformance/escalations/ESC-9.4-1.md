---
test_ids:
  - XT-runtime-14
  - XT-runtime-15
trigger: contract
proposed: >-
  (1) Async-path miss. Option 1a (recommended): record a ruling
  (`decisions/ESC-9.4-1.md`) that AD-10.4's async-path miss is an async
  root the spine itself names: one public function in
  `@xaravel/runtime/registry`, `resolveClassAsync(fqcn)`, returns
  `Promise<class>`, `await import()`s the file the classmap or PSR-4 map
  gives, and carries `@asyncRoot Registry.resolveClassAsync`. F-9 judges
  that tag true by this ruling; every caller that awaits it derives from
  it as AD-6's Derivation says. The sync `resolveClass` never imports.
  Option 1b: no async method; a miss loads the file with Bun's
  synchronous `require()` (as Composer's autoloader is sync), which
  departs from AD-10.4's "`await import()`" and is the Maintainer's.
  (2) Classmap encoding. Option 2a (recommended): Story 9.4 lands the
  default-flags core of `jsonEncode(value)` in `@xaravel/runtime/php`
  (the `./php` subpath ESC-9.1-1 names), as ESC-9.1-2 landed the Registry
  core early: `null`, booleans, integers, strings, lists and plain objects
  with string keys, with PHP's default escaping (`\/`, `\uXXXX` for
  non-ASCII, surrogate pairs, control characters), throwing a `TypeError`
  for any other value. Story 9.8 extends it (flags, floats, hooks,
  `bigint`) and adds the Oracle Differential tests, removing nothing.
  `writeClassmap` encodes with it; `loadClassmap` reads with `JSON.parse`.
  Option 2b: move `writeClassmap` / `loadClassmap` to Story 9.8, which
  changes `epics.md` and is the Maintainer's.
  (3) Scope. Option 3a (recommended): read the Maintainer's ruling on
  Epic 6 retro item 9 (`decisions/MAINT-2026-10-19-epic-6-items.md`) as
  covering the scan's own tests: Story 9.4 adds the same-file rule's cases
  to `conformance/tests/xaravel/registration.test.ts`, and its PR's
  `ownership` and `protected-paths` failures for `tools/registration/**`
  and that file merge with `--admin`. Option 3b: the tests go in a
  separate Maintainer-approved Infrastructure PR after Story 9.4.
evidence: >-
  AD-10.4: "On an async-path miss (queue deserialization, `db:seed
  --class`, component tags, cached routes), the map resolves the file and
  `await import()`s it. `optimize` writes the full classmap to
  `bootstrap/cache/classes.json`." Story 9.4's last AC: "When an async
  resolve misses, Then the registry maps the FQCN to a file, `await
  import()`s it ... And `writeClassmap(path)` and `loadClassmap(path)`
  round-trip `bootstrap/cache/classes.json`." AD-6: "These are the only
  async Driver-contract methods ... Adding a root needs an Escalation", a
  public method "is async if and only if it reaches a root, or it accepts
  a callback", and every async public method carries `@asyncRoot
  <Contract.method>` or `@asyncRoot callback`; F-9
  (`conformance/review/fidelity.md`) fails a tag that is not true, and
  module loading is not among the roots. AD-23 and
  `tools/lint-rules/plugin.ts` (`xaravel/no-framework-json-stringify`)
  forbid `JSON.stringify` in `packages/<p>/src/` for a non-grader package;
  `jsonEncode` is Story 9.8, after 9.4 (`epics.md`). The Epic 6 item 9
  ruling says Story PRs touching `tools/registration/` "are expected to
  fail `ownership` and `protected-paths` only for those paths"; the scan's
  tests live in `conformance/tests/xaravel/registration.test.ts`, which it
  does not name, and for an Epic 9 Story the orchestrator's merge rules
  count any other out-of-scope path as blocking. Every other part of the
  Story is planned in
  `_bmad-output/implementation-artifacts/spec-9-4-class-registry-and-fqcn.md`.
---

# ESC-9.4-1: the Registry's async miss path, the classmap's JSON encoder, and the scan's tests

Story 9.4 completes the Class Registry (AD-10). Its last acceptance criterion asks for an async resolve that `await import()`s an app class on a miss, and for `writeClassmap` / `loadClassmap` over `bootstrap/cache/classes.json`. Two binding rules stand in the way. AD-6 allows a public async method only if it reaches a listed Driver root or takes an async callback, and module loading is neither, so no `@asyncRoot` tag on the method would be true. AD-23 bans `JSON.stringify` in framework sources, and the only permitted encoder, `jsonEncode`, belongs to Story 9.8, which comes later.

A third point is scope. The Maintainer approved Story 9.4's changes to `tools/registration/`, but the new same-file rule needs tests in `conformance/tests/xaravel/registration.test.ts`, which the approval does not name.

The recommended options keep AD-10 as written and the Story order unchanged. They add no divergence and weaken no test. Work on XT-runtime-14 and XT-runtime-15 stops here, and with it the Story, which stops before implementation. The full plan is in the Story spec.
