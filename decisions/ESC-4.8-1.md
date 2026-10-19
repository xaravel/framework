---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "f9046405e388f09c44f68b94ccd21b14ba996f55f027d2c0d2fbbf12b3a1bb77"
---

# ESC-4.8-1: approved, with these owners and one widening

The Maintainer approved this in the Maintainer's session on 2026-10-19. With this ruling, Story 4.8's AC 1 is met.

- **(1)** The return-type lookup protocol is adopted, widened to the whole surface row. `globalThis[Symbol.for('xaravel.api.signature')]` is `(fqcn, member) => row | null`, where `row` is the member's line in `conformance/api-surface/*.jsonl` as committed: `returns`, `nullable`, and `parameters` with each parameter's `name`, `type`, `nullable`, `default`, `optional` and `variadic`. Double's `SafeDefaultResolver` keeps reading only `returns` and `nullable`, so Story 4.8's code does not change. Class, interface and enum return types resolve as proposed, through `Symbol.for('xaravel.class.lookup')` (ESC-4.6-1 item 9), and a name nothing resolves throws a `LogicException` naming it. Story 5.4's harness work installs the lookup from the committed surface before any Ported Test loads (first assigned to Story 5.3, whose spec was written before this ruling). Story 9.4's class registry answers interface names with their tokens. The harness reads committed data, not graded code, so AD-2 holds.
- **(2)** The VerifiesDoubles wiring is adopted as proposed. It binds Epic 57's testing TestCase and the ai, mcp and boost TestCase ports.
- **(3)** The proposed DIV-6 clause is adopted, narrowed by (1). It is recorded in Story 8.1's DIV records as "DIV-6 php-only: PHP final, visibility and reflection in Double's doubles". Where the target's declaring class has a surface row, parameter names come from the row; the method's JS source is used only when there is none. The rest of the clause stands as written: no run-time `final` or visibility, `Object.create` runs no field initializer, `#private` and built-in internal slots are missing under passthru, accessors are not doubled, FinalBypass is not ported, and the plain `DoubleException` variants are never thrown.
- **(4)** The out-of-scope API is adopted as proposed. The first Story whose tests need one of the names ports it, and the coverage scan of `JMac` names must show it. `received`, `unused` and `verify` stay reserved names.

Rationale: `conformance/api-surface/*.jsonl` already records every Upstream method's parameter names, types and defaults as well as its return type, so returning the whole row costs nothing and lets each double use Upstream's declared signature, with the JS fallback only for targets that have no row. The remaining DIV-6 items come from JS having no run-time `final`, visibility or PHP property defaults, which is "PHP-runtime reflection with no TypeScript analogue" (PRD §5.2, DIV-6). The unported API has no Upstream use, and the coverage scan catches the first one that does. No expected value of a Laravel test is weakened.
