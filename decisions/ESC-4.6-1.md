---
decision: approved
decided_by: Maintainer
date: 2026-10-18
escalation_sha256: "54055e9cdf57d4583d85e5ec3b6c4b667ebf9596431d24d8d39b7be0c0c0329e"
---

# ESC-4.6-1: approved, with these owners

The Maintainer approved this in the Maintainer's session on 2026-10-18. With this ruling, Story 4.6's AC 3 is met.

- **(1)** The `MODEL_STATE` protocol binds Story 36.1, as proposed. Story 36.1 also rules on a fresh string-keyed `set` on a constructor-less model mock.
- **(2)** `Mockery.capture` writes `ref.value`. Story 9.5's `Ref<T>` keeps a writable `value` (AD-9).
- **(3)** `alias:` and `overload:` are PHP-only. They are recorded as a DIV-6 clause in Story 8.1's DIV records: "DIV-6 php-only: Mockery `alias:`/`overload:` mocks (class aliasing, autoload interception)".
- **(4)** Run-time method visibility is PHP-only. It is recorded as a DIV-6 clause in Story 8.1's DIV records: "DIV-6 php-only: run-time method visibility (Mockery's protected/private guards)".
- **(5)** With `shouldIgnoreMissing` and no default value, a missing call returns null. With `recursive`, it returns a new ignore-missing mock. Both are adopted as proposed.
- **(6)** `returns`, `throws` and `resolves` (`JMac\Testing\Double`) are owned by the new Story 4.8, which ports Double into the grader.
- **(7)** The coverage step becomes blocking when CI's `check` job is made a required check (ESC-4.4-2 item 4).
- **(8)** With several class targets, only the first class is in the prototype chain. Adopted as proposed.
- **(9)** Class-name strings: `andThrow('<FQCN>')` resolves only the grader's own exception classes. `Container::mock` resolves through `globalThis[Symbol.for('xaravel.class.lookup')]`, which Story 9.4's class registry installs.
- **(10)** `partialMock()` is owned by Epic 57's testing TestCase.

Rationale: JS has no class aliasing, no autoload interception and no run-time visibility, so (3) and (4) are true PHP-only gaps. The only Upstream use of `alias:` is skipped as `php-only` when it is ported. Every other item binds a later owner to Mockery's real behaviour, and none of them weakens the grader.
