---
decision: approved
decided_by: Maintainer
date: 2026-10-18
escalation_sha256: "48086101bd5a01c5fe0da2d69aa97e07cdd007be9cbdf11032e3890a2d18f0a0"
---

# ESC-4.3-1: approved, option 1, with these answers

The Maintainer approved this in the Maintainer's session on 2026-10-18.

- **(1)-(3)** The class-name brand, the value brands and callables are adopted as proposed. `registerClass` (Story 9.4) and the token generator (Epic 10) set the class brand.
- **(4)** Unported comparators: each is added by a follow-up `assert` Story, or by its owning Story through a Maintainer-approved Infrastructure Story.
- **(5)** The DIV-10 PCRE conversion rule is owned by Story 8.2 (`PORTING.md`).
- **(6)** FR-116 reads as: "`assertEquals` follows PHPUnit's `assertEquals`". The Oracle shows PHPUnit's comparator differs from PHP `==`, and Laravel's tests depend on PHPUnit's.
- **(7)** `assertContainsOnly` stays, with PHPUnit 11.5's signature and aliases.
- **(8)** `assertArraySubset` records the kind `assertThat`, as the Inventory does. Story 4.7 makes the change in `@xaravel/assert`.
- **(9)** Closure equality is accepted as a divergence. Two distinct JS functions are never `assertEquals`-equal, and PHPUnit's closure warning is dropped. It is recorded as a clause in Story 8.1's DIV records.
- **(10)** A JS `Error` going through `ExceptionComparator` is accepted for now and recorded as a clause in Story 8.1's DIV records. Story 9.10 publishes PHP's `\Error`/`\Exception` split, and Story 9.11 makes the grader read it, which closes the clause.
- **(11)** A supported way to rewrite a caught failure's message is owned by Story 9.11.
- **(12)** Done in Story 4.4 (`spec-4-4:83`).
- **(13)** The export of an exception without PHP's `string`, `file`, `line` and `trace` is a message-only difference. It is recorded as a clause in Story 8.1's DIV records.
- **(14)** Built-in classes and interfaces are owned by Story 9.10 (the runtime classes, behind a `Symbol.for` protocol) and Epic 10 (interface tokens). The grader reads them in Story 9.11. This joins ESC-4.5-1 item 2.
- **(15)** `assertArraySubset` stays on `PHPUnit\Framework\Assert`'s port. `Illuminate\Testing\Assert` delegates to it once the Testing component exists.

Rationale: option 2 breaks grader isolation (AD-2). Option 3 lets mismatches fail silently, for example wrong class names in messages, or an assertion that misreads its argument. The divergences in (9), (10) and (13) come from the JS value model and change messages or closure equality only. No expected value of a Laravel test is weakened, and each goes into Story 8.1's DIV records.
