---
test_ids:
  - Illuminate\Tests\Config\RepositoryTest::testOffsetGet
  - Illuminate\Tests\Config\RepositoryTest::testOffsetSet
trigger: divergence
proposed: >-
  Option 1 (recommended): amend `decisions/DIV-12.md`'s DIV-12.6 to cover an
  index read on every PHP `ArrayAccess` object, as DIV-12.17 already covers
  the writes, `isset` and `unset` (ESC-14.1-8): `$x[k]` becomes the method PHP
  calls, `x.offsetGet(k)`, each line marked, assertions unchanged; Collection's
  existing `collection.get(0)` lines keep their marker, since
  `Collection::offsetGet` is `get`. Story 15.1 then ports testOffsetGet and
  testOffsetSet with `offsetGet(k)` reads, so the test of `offsetGet` calls
  `offsetGet`. Option 2: amend DIV-12.6 to `x.get(k)` on every `ArrayAccess`
  object, as PORTING.md § Order of rewrites already writes it; this keeps
  PORTING unchanged but tests `get` in place of `offsetGet` on objects whose
  two methods differ.
evidence: >-
  Upstream RepositoryTest::testOffsetGet asserts on `$this->repository['not-exist']`,
  `$this->repository['foo']` and `$this->repository['associate']`, and
  testOffsetSet reads `$this->repository['key']`, `['new_key']`, `['']` and
  `[123]` between its writes; PHP evaluates each through
  `Repository::offsetGet`. JS has no index syntax on a class instance, so each
  read must change. decisions/DIV-12.md line 35 reads "DIV-12.6 Collection
  index access. `$collection[0]` becomes `collection.get(0)`", Collection
  only, while PORTING.md line 97 lists "index access on an `ArrayAccess`
  receiver, `a[k]` → `a.get(k)`: DIV-12.6" and line 20 lists only
  Collection. DIV-12.17 (line 46) covers writes, `isset` and `unset` on every
  `ArrayAccess` object but names reads as DIV-12.6's. Both Fidelity reviewers
  of tree adb46be542fb95e41482d84c7b9c272a80551d44 rejected the `get(k)`
  reads marked `// adapted:DIV-12.6` on the Repository (F-1, F-5): DIV-12.6
  does not reach a Repository, and the port of testOffsetGet never calls
  `offsetGet`. No other Ported Test reads an `ArrayAccess` object other than
  Collection by index yet (grep `adapted:DIV-12.6` outside
  `packages/collections`).
---

# ESC-15.1-4: no DIV clause covers an index read on a non-Collection `ArrayAccess` object

`$this->repository['k']` cannot be written in JS, so testOffsetGet and testOffsetSet must adapt their reads. DIV-12.6 covers only Collection index reads, and DIV-12.17 covers every other `ArrayAccess` form but leaves reads to DIV-12.6. PORTING.md applies DIV-12.6 to any `ArrayAccess` receiver, so the record and the guide disagree, and both Fidelity reviewers rejected the Repository's `get(k)` reads under DIV-12.6. Widening DIV-12.6 changes an Intentional Divergence, so it waits on the Maintainer. Option 1 widens it to `offsetGet(k)`, the method PHP calls, which also makes testOffsetGet test `offsetGet`. Only testOffsetGet and testOffsetSet wait on this; Story 15.1's other Test IDs do not read the Repository by index.
