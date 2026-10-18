---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-18
escalation_sha256: "b6dc4354b21df86f16934828fc1c6c07dcbb687569a17d2bfaf4c68d00ee9f24"
---

# ESC-3.7-1: approved, option 1 (amend the PHPUnit, DIV-12 and Mockery rules)

Story 3.7 is rebuilt from the saved attempt (`_bmad-output/implementation-artifacts/spec-3-7-attempt.patch`), with its three static rules amended exactly as the Escalation's `proposed` text states:

- **PHPUnit call sites.** A `$this->N(` / `self::N(` / `static::N(` / `parent::N(` call in a suite class C is excluded only when N is declared, case-insensitively, in C's own indexed hierarchy: C, its ancestors and their traits, transitively. It is not excluded because an unrelated `src/` class declares N. An `X::N(` call counts when X resolves to `PHPUnit\Framework\Assert`, `PHPUnit\Framework\TestCase`, or an indexed class whose chain reaches `PHPUnit\Framework\Assert`. `fail`, `markTestSkipped` and `markTestIncomplete` are included. Names take the case of a matching Inventory kind. Names that never ran at the baseline stay listed with `executions: 0` and are printed for review. Story 4.4's coverage report may exclude such a name only through an approved Escalation.
- **DIV-12 classification.** `option-pair` applies only when N is an option name (one of AD-26's named option pairs, or a name read in `src/` as `method_exists($v, 'N')` together with `$v->N` on the same non-`$this` variable) and D is an option holder (a hierarchy implementing `ShouldQueue` or `ShouldBroadcast`, using `Queueable`, or reaching `Mailable` or `Notification`). In the Model hierarchy, `casts` is `option-pair` (AD-7) and every other pair is `model-config`. Every other pair is `method-plus-state`. The real-snapshot test asserts the spine's anchors: `Model`/`casts` is option-pair, `Model`/`connection` is model-config, `Query\Builder`/`timeout` is method-plus-state.
- **Mockery chains.** A chain also starts at a facade's `X::E(`, where X's indexed chain reaches `Illuminate\Support\Facades\Facade` and E is a chain starter, counted as `static: false`. After an argument-less `shouldReceive()`, `shouldHaveReceived()`, `shouldNotHaveReceived()`, `allows()` or `expects()`, the next `->M(` is the mocked method: it is skipped and the chain continues after it. After a static `Mockery::` call's `)`, only a chain starter continues the chain.

The Story spec's intent contract (Boundaries) is amended in place to these rules when the Story is rebuilt.

Rationale:

- **It restores what the AC and AD-26 / AD-7 ask for.** The AC asks for every assertion and Mockery method the Upstream suites use, each with a usage count. The current rules record `assertCount` with 0 calls against 1741 sites, miss `fail` and facade mocks, and count mocked methods as Mockery API. The name-only option-pair test labels `count` and `user` as option pairs while AD-26's `timeout` and `uniqueFor` fall out. The amended rules match the spine's own anchors.
- **It stays static.** Option 2 moves part of the scan into the Oracle image, so CI's `upstream` job could no longer check it after a plain sync, and it leaves the DIV-12 rule open. Option 3 leaves Stories 4.4 and 4.6 and `PORTING.md` built on counts that `--check` forbids correcting by hand.
- **Unresolved names stay visible.** Names that never ran are listed with `executions: 0` and printed. Excluding one from coverage needs its own approved Escalation, so the coverage check gets stricter, not looser.
- **The grader is not weakened.** No Upstream assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. No divergence outside DIV-1..12 is added: the classification follows DIV-12 and AD-26 as written.
- **No planning document changes and no run-time cost.** The spine, the SPEC and `epics.md` stay as they are. The scans run at build time only.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun.
