---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testCallingUndefinedMacroThrowsException"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testClassBasedMacros"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testClassBasedMacrosNoReplace"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testFlushMacros"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testFlushMacrosStatic"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testHasMacro"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testMacroWithArguments"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testMacroWithDefaultArguments"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testMethodConflictDoesNotThrowException"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testNonStaticCallOfNonStaticClosure"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testNonStaticCallOfStaticClosure"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testRegisterMacro"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testRegisterMacroAndCallWithoutStatic"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testStaticCallOfNonStaticClosure"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testStaticCallOfStaticClosure"
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testWhenCallingMacroClosureIsBoundToObject"
  - XT-macroable-1
  - XT-macroable-2
  - XT-macroable-3
trigger: protected-path
proposed: >-
  Option 1 (recommended): the Maintainer approves a one-off change, made
  in the Story 11.1 PR or in a Maintainer-approved Infrastructure PR, that
  adds `"devDependencies": {"@xaravel/assert": "workspace:*",
  "@xaravel/mockery": "workspace:*"}` to `packages/macroable/package.json`
  and the four matching lines under `"packages/macroable"` in `bun.lock`,
  as #336 did for `packages/contracts`. Option 2: a standing ruling that
  a Story from Epic 9 on may change only its own package's workspace
  entry in `bun.lock` (the lines `bun install` writes for its own
  `package.json`), so each later Upstream Component's first tests do not
  each need this Escalation.
evidence: >-
  The Ported Test and the Xaravel Tests import `@xaravel/assert`.
  `bun run graph:check` (AD-2) fails without a declared dependency:
  "undeclared import: packages/macroable/tests/xaravel/macroable.test.ts
  imports "@xaravel/assert", but @xaravel/assert is not in
  @xaravel/macroable dependencies or devDependencies". Declaring it makes
  `bun install` rewrite `bun.lock` (its `packages/macroable` entry today
  lists only `dependencies`, bun.lock:443-450), and CI installs with
  `bun install --frozen-lockfile` (`.github/workflows/ratchet.yml:127`), so
  the lockfile must change with it. `/bun.lock` is a Protected Path
  (`conformance/protected-paths:33`), and the `ownership` check rejects a
  path outside `packages/macroable/**` in a Story from Epic 9 on (MAINT
  2026-10-16, second amendment). `packages/contracts` got the same two
  devDependencies through a retrospective item (#336), which a Story
  cannot use.
---

# ESC-11.1-4: the macroable tests need a `bun.lock` change

Every Story 11.1 test imports `@xaravel/assert`, which the AD-2 dependency check requires `packages/macroable/package.json` to declare. Declaring it changes `bun.lock`, a Protected Path the Story may not edit, and CI's frozen install fails without it. The implementation is otherwise complete on branch `story/11.1-impl`: `bun run harness --story 11.1` reports `checked=16 differ=0` locally, with the lockfile updated and then restored. This stops every Test ID of the Story until the lockfile lands.
