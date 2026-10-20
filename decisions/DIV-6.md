---
div: 6
title: "PHP-only behaviour"
cites: []
sources: ["decisions/ESC-4.6-1.md", "decisions/ESC-4.7-1.md", "decisions/ESC-4.8-1.md"]
fewer_assertions: []
---

# DIV-6: PHP-only behaviour

## Rationale

Some Upstream behaviour belongs to the PHP engine and has no TypeScript analogue. Skipping a test as `php-only` removes it from the grader, so the reason is limited to an enumerated catalogue, and every entry needs an approved Escalation (FR-3, FR-114). PHP semantics that can be reproduced are ported, not skipped (PRD §5.1).

## Behaviour

- `php-only` is limited to an enumerated catalogue: PHP extensions, OPcache, `php.ini` settings, engine internals (for example `gc_*`, `opcache_*`, `declare(ticks)`), and PHP-runtime reflection with no TypeScript analogue.
- Type juggling is *not* `php-only`; it is ported (PRD §5.1).
- Every `php-only` entry needs an approved Escalation (FR-3).
- Approved Escalation rulings have added the entries below for Mockery, PHPUnit's test doubles and `JMac\Testing\Double` (ESC-4.6-1, ESC-4.7-1, ESC-4.8-1).

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-6.1** A `php-only` skip needs an approved Escalation. A test is skipped as `php-only` only when the behaviour it tests is in the catalogue above, and its Expectations line names an approved Escalation with `trigger: php-only` whose `test_ids` lists it (FR-3, FR-114). Type juggling is never `php-only`.
- **DIV-6.2** DIV-6 php-only: Mockery `alias:`/`overload:` mocks (class aliasing, autoload interception). JS has no class aliasing and no autoload interception, so an Upstream test that uses `alias:` or `overload:` is skipped as `php-only` under DIV-6.1 when it is ported; each such skip still names an approved Escalation listing its Test ID (ESC-4.6-1 item 3).
- **DIV-6.3** DIV-6 php-only: run-time method visibility (Mockery's protected/private guards). JS has no run-time method visibility. An Upstream test that relies on it is skipped as `php-only` under DIV-6.1; each such skip still names an approved Escalation listing its Test ID (ESC-4.6-1 item 4).
- **DIV-6.4** DIV-6 php-only: PHP run-time types and reflection in test doubles. When the double's target has a surface row for the method, PHPUnit's test doubles take the declared return type, parameter names and defaults from that row. When there is no row, as for a test-local class, an unconfigured call returns null, parameter names come from the JS source, and null is every default. The clause covers both the targets without a row and the parts no row can supply: a double made without the constructor runs no JS field initializer, a real method of a partial mock that touches a `#private` field throws, a built-in subclass's double lacks its internal slots, "final or static" never applies, and every JS error reaching the invocation handler is treated as PHP's `\Exception`. Ported Tests that rely on a generated return value for a target without a row configure it, marked with this clause (ESC-4.7-1 item 2).
- **DIV-6.5** DIV-6 php-only: PHP final, visibility and reflection in Double's doubles. Where the target's declaring class has a surface row, parameter names come from the row; the method's JS source is used only when there is none. There is no run-time `final` or visibility, `Object.create` runs no field initializer, `#private` and built-in internal slots are missing under passthru, accessors are not doubled, FinalBypass is not ported, and the plain `DoubleException` variants are never thrown (ESC-4.8-1 item 3).
