---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEach#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEach#1"
trigger: contract
proposed: >-
  Option 1 (recommended): runtime defines a PHP generator lifetime/disposal
  contract for an owned temporary generator, allowing its finally block to
  execute when collection enumeration stops early. Preserve PHP ownership:
  a separately retained generator remains resumable after foreach break,
  whereas destruction of an unretained temporary runs finally. Add runtime
  Oracle cases for both lifetimes and a PORTING.md idiom row if a new
  language-construct helper is needed. No DIV, expected-value or grader
  changes. Option 2: collections unwraps or emulates runtime Generator,
  advances it to exhaustion, or drops the finally assertion. Rejected:
  these bypass runtime ownership, execute unseen source side effects, or
  weaken the regression.
evidence: >-
  XT-collections-11 constructs LazyCollection from a generator function with
  a finally block, then eachAsync returns false at its first yielded key.
  The callback runs once, but the finally block never runs: expected
  ['first', 'finally'], actual ['first']. LazyCollection.makeIterator wraps
  the bare JS generator in runtime Generator; entries delegates to runtime
  Generator.entries and foreachIterator. Iterator return closes that entry
  iterator without closing or releasing the wrapped JS generator.
  Generator exposes current/key/next/valid/send/rewind/getReturn but no
  public close, return or disposal contract; its close helper is private.
  Collections cannot implement that PHP lifetime behavior locally or edit
  runtime. The exact new regression is held below as pending code evidence,
  and the Story remains blocked pending this earlier-component contract.
  The implicated upstream testEach IDs remain unchanged and passing;
  XT11 is the new async surface where the missing lifetime contract is
  observed.
---

# ESC-14.5-4: owned temporary generator finalization on early termination

This is a runtime language-construct/lifetime contract under the standing
runtime rule in `decisions/MAINT-2026-10-26-runtime-builtins.md`. The monitor
must determine the bounded ownership seam; blindly closing every retained
generator after a foreach break would change PHP behavior.

## Pending XT-collections-11 regression

This complete new regression is held before execution under the missing
runtime contract. It previously produced expected `["first", "finally"]`
versus observed `["first"]`; no cleanup guarantee is claimed as verified.

```ts
    const earlyEvents: unknown[] = [];
    const earlySource = LazyCollection.make(function* () {
      try { yield keyed("first", 1); earlyEvents.push("unreachable"); yield 2; }
      finally { earlyEvents.push("finally"); }
    });
    Assert.assertSame(earlySource, await earlySource.eachAsync(async (_value: unknown, key: unknown) => {
      earlyEvents.push(key);
      await Promise.resolve();
      return false;
    }));
    Assert.assertSame(["first", "finally"], earlyEvents);
```
