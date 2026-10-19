---
test_ids:
  - XT-mockery-7
trigger: contract
proposed: >-
  Adopt the contracts Story 4.8 builds to, as written here, and name the
  owners for items (1) and (2). (1) The return-type lookup protocol:
  `globalThis[Symbol.for('xaravel.api.signature')]` is a function
  `(fqcn, member) => { returns: string | null, nullable: boolean } | null`,
  the row shape of `conformance/api-surface/*.jsonl`, asked for the class
  that declares the method; with no lookup or no row a method is untyped
  and its safe default is null. A class or interface return type resolves
  only through `globalThis[Symbol.for('xaravel.class.lookup')](fqcn)`
  (ESC-4.6-1 item 9): it returns the class, or, for an interface, its
  contract token (`Symbol.for(fqcn)` or an AD-1 token object); an enum is a
  class with a static `cases()`, and gives its first case; a name nothing
  resolves throws a LogicException naming it, never null. Proposed owner:
  Story 5.3's harness installs the signature lookup from the committed
  surface, and Story 9.4's class registry answers interfaces with their
  tokens. (2) VerifiesDoubles wiring: a ported TestCase or Pest
  `use(VerifiesDoubles)` calls `Double.enableAutoVerify()` before `setUp`
  and `beforeEach`; its `#[After]` half runs inside the Mockery run
  protocol, after Mockery's close (`verifyAll(false)` when the body
  resolved and Mockery closed cleanly, else `verifyAll(true)`, the first
  error winning); the state lives in the run's slot, and a run adopts the
  auto-verify state enabled outside any run (in a bare `bun:test` hook, for
  example), so the next run verifies it. Proposed owners: Epic
  57's testing TestCase and the ai, mcp and boost TestCase ports. (3) A
  DIV-6 clause, "DIV-6 php-only: PHP final, visibility and reflection in
  Double's doubles": no `final`, visibility or return-type reflection
  exists at run time, so every prototype method is doubleable; a double is
  made by `Object.create`, so no JS field initializer runs (ESC-4.7-1 item
  2) and a declared field reads undefined where PHP has its declared
  default; under passthru a real method that touches a `#private` field
  throws TypeError, and `passthru(real)` copies only the real instance's own
  enumerable fields (no `#private` or non-enumerable state); accessors are
  not doubled; a double of a built-in subclass lacks the built-in's internal
  slots; parameter names come from the method's source; `FinalBypass`
  (`bypassFinals()`) is not ported; Double's plain `DoubleException`
  variants are ported but never thrown, because PHPUnit (@xaravel/assert)
  is always present. (4) The rest of Double's API has no Upstream use and
  is not ported: `received`, `unused`, `verify`, `ordered`, `listen`,
  `bypassFinals`, the pause/resume API, `AutoVerifySnapshot`, `CheckEvent`
  and the `any`, `all`, `capture`, `contains`, `matches`, `same`, `not`,
  `remaining` and `none` matchers. `received`, `unused` and `verify` stay
  reserved names. The first Story whose tests need one of them ports it,
  and a coverage scan of `JMac` names must show it.
evidence: >-
  (1) SafeDefaultResolver.php builds a call's default from
  `ReflectionMethod::getReturnType()`, which JS does not have;
  `conformance/api-surface/*.jsonl` already records each Upstream method's
  `returns` and `nullable` (for example `ai.jsonl:129`). The grader may not
  import a graded class registry (AD-2). XT-mockery-7 installs both lookups
  for its twins only, and removes them afterwards. (2)
  Integrations/PHPUnit/VerifiesDoubles.php runs `Double::enableAutoVerify()`
  in `#[Before]` and `Double::verifyAll($testFailed)` in `#[After]`;
  ai/tests/Pest.php:23, mcp/tests/TestCase.php:18 and
  boost/tests/TestCase.php:14 use it. XT-mockery-7's child `bun test`
  fixture checks the met, unmet, failing-body and not-enabled cases. (3)
  ClassGenerator.php reflects `final`, visibility and signatures and
  `eval`s a subclass; `newInstanceWithoutConstructor` still initializes
  declared property defaults; FinalBypass rewrites PHP source before it is
  compiled. ExceptionFactory.php picks the PHPUnit variant whenever
  `PHPUnit\Framework\TestCase` exists. (4) A grep of the 41 Upstream files
  that use `JMac\Testing` (conformance/upstream/{ai,mcp,boost}/tests) finds
  `Double::for`, `expects`, `allows`, `instance`, `with`, `returns`,
  `throws`, `resolves`, `times`, `never`, `OverriddenDouble`,
  `Argument::type`, `Argument::satisfies` and `VerifiesDoubles`, and none
  of the names in item (4).
---

# ESC-4.8-1: the Double port's return-type, auto-verify, PHP-only and scope contracts

Story 4.8 ports the subset of `jasonmccreary/double` v1.0.1 that the ai, mcp and boost suites use into `@xaravel/mockery` (`src/JMac/Testing/**`). Four points need a ruling or an owner outside the Story. The item numbers match `proposed`.

1. **The return-type lookup protocol (XT-mockery-7).** A call with no configured return gets a safe default by the method's declared return type, and JS has none.
   - `globalThis[Symbol.for('xaravel.api.signature')]` is a function `(fqcn, member) => { returns: string | null, nullable: boolean } | null`: the row shape of `conformance/api-surface/*.jsonl`, asked for the FQCN of the class that declares the method (a token's own FQCN). With no lookup, or no row, the method is untyped and its default is null, as PHP's for an untyped method.
   - A class or interface return type resolves only through the class-lookup protocol (`Symbol.for('xaravel.class.lookup')`, ESC-4.6-1 item 9). It returns the class, or, for an interface, its contract token: the symbol `Symbol.for(fqcn)` or an AD-1 token object. An enum is a class with a static `cases()` and gives its first case. A name nothing resolves throws a `LogicException` naming the type and the method; it never returns null silently.
   - Proposed owners: Story 5.3's harness installs the signature lookup from the committed surface, and Story 9.4's class registry answers interface names with their tokens. Without them every safe default is null, which is right only for untyped methods.
2. **VerifiesDoubles wiring.** A ported TestCase that uses `VerifiesDoubles`, or a Pest file with `pest()->use(VerifiesDoubles::class)`, calls `Double.enableAutoVerify()` before `setUp` and `beforeEach` (its `#[Before]`). The `#[After]` half runs inside the Mockery run protocol (`Symbol.for('xaravel.mockery.run')`), after Mockery's close: `Double.verifyAll(false)` when the body resolved and Mockery closed cleanly, otherwise `Double.verifyAll(true)` (ambiguities only), and the first error wins. The auto-verify state lives in the run's AsyncLocalStorage slot, and outside a run in the process slot, the same as Mockery's container. A run adopts the process slot's state: auto-verify enabled outside any run (in a bare `bun:test` hook, for example), and the doubles made since, are verified by the next run, and the process slot is emptied. Proposed owners: Epic 57's testing TestCase and the ai, mcp and boost TestCase ports.
3. **DIV-6 php-only (doubles).** Proposed DIV-6 clause: "DIV-6 php-only: PHP final, visibility and reflection in Double's doubles".
   - There is no `final`, visibility or return-type reflection at run time, so every prototype method of the target chain is doubleable, and `InvalidDoubleTargetException::isFinal` never applies.
   - A double is made by `Object.create`, so no JS field initializer runs (ESC-4.7-1 item 2): a declared field reads undefined where PHP has its declared default. `passthru($real)` copies the real instance's own enumerable fields.
   - Under passthru a real method that touches a `#private` field throws TypeError, because the double has none of the target's private slots. `passthru($real)` copies only own enumerable fields, so `#private` and non-enumerable state are not copied.
   - Accessors (getters and setters) are not doubled; they stay the target's.
   - A double of a subclass of a built-in (`Error`, `Map`, …) lacks the built-in's internal slots, so a built-in method called on it throws.
   - Parameter names, which label the comparison blocks, come from the method's source; a contract token's methods carry none, so they are labelled `argument <n>` (ESC-4.7-1 item 5).
   - A bare symbol token carries no method list, so, as on a Mockery token mock, any method name other than a reserved one is configurable on its double.
   - FinalBypass (`Double::bypassFinals()`) is not ported: it rewrites PHP source before compilation.
   - Double's plain `DoubleException` variants are ported but never thrown: PHPUnit (@xaravel/assert) is always present, so ExceptionFactory always builds the PHPUnit variant, as ExceptionFactory.php does when `PHPUnit\Framework\TestCase` exists.
4. **Out-of-scope API.** `received`, `unused`, `verify`, `ordered`, `listen`, `bypassFinals`, the pause/resume API, `AutoVerifySnapshot`, `CheckEvent` and the `any`, `all`, `capture`, `contains`, `matches`, `same`, `not`, `remaining` and `none` matchers have no Upstream use. They are ported by the first Story whose tests need them, and a coverage scan of `JMac` names must show it. `received`, `unused` and `verify` stay reserved names, so a target that declares one still needs `override`.
