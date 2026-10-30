---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "40f4bc5bb30a9786eb7b691e59c807070e4c4fc8b5bfd5051f508193354b4a5c"
---

# ESC-15.1-4: approved, option 1 (an index read on any `ArrayAccess` object becomes `offsetGet`)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

DIV-12.6 now covers an index read on every PHP `ArrayAccess` object, as DIV-12.17 already covers writes, `isset` and `unset`. `$x[k]` becomes `x.offsetGet(k)`, the method PHP calls, and each changed line is marked with DIV-12.6, assertions unchanged. Collection's existing `collection.get(0)` lines keep their form and marker, because `Collection::offsetGet` is `get`. PORTING.md's three index-read rows say the same.

Story 15.1 ports `RepositoryTest::testOffsetGet` and `testOffsetSet` with `offsetGet(k)` reads, so the test of `offsetGet` calls `offsetGet`.
