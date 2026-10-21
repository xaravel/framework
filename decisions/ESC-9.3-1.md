---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "4fc772a2c1756d7c97fca1ee84a9aa72d5bc6a572da094f81d67e815ebc53c66"
---

# ESC-9.3-1: approved, the generic Scope Frame runners are dual helpers and take no tag

Option 1. A generic Scope Frame runner, a public function that returns its body's own type `T` and never a declared Promise or thenable type (`runInFrame`, `runInRootFrame`, `runInNarrowFrame`), has the shape of AD-6's Dual helpers rule: it returns `T` for a sync body and `Promise<T>` for an async one. It is not async in AD-6's sense and carries no `@asyncRoot` tag, which is also what `tools/async-surface/` already requires. Story 9.3 re-applies `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch`, cites `decisions/ESC-9.3-1.md` in the three docblocks, and re-runs the Fidelity Review, which shows this record as evidence (f).

So that no later dual helper (`retry`, `rescue`, `tap`, `value`, `transform`, `once`, `when` / `unless`, `Benchmark.measure`, `Sleep`) stops on the same question, F-9 in `conformance/review/fidelity.md` now says a dual helper takes no tag.

The same PR fixes the CI `php-fixtures` check that held PRs #269 and #270: the job now runs in the Oracle image's own PHP base image, pinned by digest, so its PHP is exactly `PHP_VERSION` (8.5.11) whatever patch release GitHub's runner image carries. XT-conformance-33 checks that the job's image is the Oracle Dockerfile's PHP base and starts with `php:${PHP_VERSION}-`, so the two pins move together. No version guard in the Oracle tools or tests is relaxed.
