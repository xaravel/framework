---
test_ids:
  - XT-conformance-87
  - XT-conformance-88
trigger: open-question
proposed: >-
  Amend three rules in the Story 3.7 spec's intent contract, then rebuild from
  the saved attempt (_bmad-output/implementation-artifacts/spec-3-7-attempt.patch).
  (1) PHPUnit call sites. A `$this->N(` / `self::N(` / `static::N(` /
  `parent::N(` call in a suite class C is excluded only when N is declared
  (case-insensitively) in C's own hierarchy: C, its ancestors and their
  traits, transitively, among the indexed `src/` and `tests/` declarations.
  It is not excluded because some unrelated `src/` class declares N. An
  `X::N(` call counts when X resolves to `PHPUnit\Framework\Assert`,
  `PHPUnit\Framework\TestCase`, or an indexed class whose chain reaches
  `PHPUnit\Framework\Assert` (for example `Illuminate\Testing\Assert`). The
  names also include `fail`, `markTestSkipped` and `markTestIncomplete`,
  which are `Assert` methods. A name is written in the case of its Inventory
  kind when one matches case-insensitively. Names that never ran at the
  baseline stay listed with `executions: 0` and printed for review. Story
  4.4's coverage report may exclude such a name only through an approved
  Escalation, as Story 4.6 already does for PHP-only Mockery APIs.
  (2) DIV-12 classification. `option-pair` applies when N is an option name
  and D is an option holder. An option name is one of AD-26's named option
  pairs (casts, middleware, backoff, tries, timeout, uniqueId, uniqueFor,
  retryUntil, attachments, envelope, content, via, broadcastOn), or a name
  read in `src/` as `method_exists($v, 'N')` together with `$v->N` on the
  same non-`$this` variable. An option holder is a class or trait whose
  hierarchy implements `Illuminate\Contracts\Queue\ShouldQueue` or
  `Illuminate\Contracts\Broadcasting\ShouldBroadcast`, uses
  `Illuminate\Bus\Queueable`, or reaches `Illuminate\Mail\Mailable` or
  `Illuminate\Notifications\Notification`. In the Model hierarchy, `casts`
  is `option-pair` (AD-7) and every other pair is `model-config`. Every other
  pair is `method-plus-state`. The real-snapshot test also asserts the
  spine's anchors: `Model`/`casts` is option-pair, `Model`/`connection` is
  model-config, `Query\Builder`/`timeout` is method-plus-state.
  (3) Mockery chains. A chain also starts at a facade's `X::E(`, where X
  resolves to an indexed class whose chain reaches
  `Illuminate\Support\Facades\Facade` and E is a chain starter. That E counts
  as `static: false`. An argument-less `shouldReceive()`,
  `shouldHaveReceived()`, `shouldNotHaveReceived()`, `allows()` or
  `expects()` starts a chain too, but the next `->M(` is the mocked method:
  it is skipped, and the chain continues after it. After a static
  `Mockery::` call's `)`, only a chain starter continues the chain.
evidence: >-
  The spec's intent contract
  (_bmad-output/implementation-artifacts/spec-3-7-upstream-scans-closure-identifiers-div-12-pairs-and-test-api-usage.md,
  Boundaries) fixed these rules, and the build followed them. The review
  found outputs that contradict the Story's AC ("every assertion and every
  Mockery method used by the Upstream suites, each with a usage count") and
  AD-26 / AD-7. (a) Any name some `src/` class declares is dropped from
  `calls`. `FilesystemAdapter`, `QueueFake` and `AssertableJsonString`
  declare `assertCount`, so `phpunit-assertions.jsonl` records `assertCount`
  with `calls: 0` against 1741 `$this->assertCount(` sites. `assertEmpty`
  (201 sites) and `assertJson` are the same. Calls through
  `Illuminate\Testing\Assert::` (a PHPUnit `Assert` subclass) are not
  counted. `$this->fail(` (312 sites) and `markTestSkipped(` (56) are not
  listed. (b) `option-pair` matches a name anywhere in `src/`, on any
  receiver. So `count`, `user`, `from`, `locale`, `view` and `as` are option
  pairs (55 lines), while AD-26's `timeout` and `uniqueFor` come out as
  method-plus-state (`CallQueuedListener::uniqueFor`). (c) Facade chains
  such as `File::shouldReceive(` (86 sites) and `DB::shouldReceive(` (43)
  are not counted. `$spy->shouldHaveReceived()->getQueueableId()` puts the
  mocked method `getQueueableId` into `mockery-api.jsonl`. The rules are
  inside the intent contract, which the build workflow may not amend, so the
  Story halted as an intent gap.
---

# ESC-3.7-1: how the test-API and DIV-12 scans decide what counts

Three of Story 3.7's static rules, fixed by the spec's intent contract, give results that contradict the Story's AC and AD-26:

- **PHPUnit call sites are under-counted.** The exclusion drops any `assert*` name that some Laravel class declares, even on an unrelated receiver. So `assertCount`, `assertEmpty` and `assertJson` show 0 calls.
- **The DIV-12 option-pair test matches names, not classes.** Common names such as `count` and `user` become option pairs, while two of AD-26's named option pairs do not.
- **The Mockery chain rule misses facade mocks and counts mocked methods.** `File::shouldReceive(...)` chains are left out, and an argument-less `shouldHaveReceived()` counts the mocked method as Mockery API.

`allowed-identifiers.json` (AC 1) had no review finding that needs a ruling. The Story is blocked until the rules are settled.

The options:

1. **Amend the three rules as `proposed` (proposed).** The scans stay static and keep the saved implementation. Each rule then follows how Upstream actually uses the name. Names that never ran stay visible for review.
2. **Read PHPUnit's and Mockery's API from the Oracle image.** Run Reflection on `PHPUnit\Framework\Assert` and `Mockery\MockInterface` / `Expectation` at the locked versions, and keep only call sites whose name is in those APIs. This gives exact name sets, but it moves part of the scan into Docker, so CI's `upstream` job could no longer check it after a plain sync. It also leaves the DIV-12 rule open.
3. **Keep the rules and treat the files as rough seeds.** `--check` forbids hand edits, so Stories 4.4 and 4.6 would build their coverage on wrong counts, and `PORTING.md` would misclassify pairs.
