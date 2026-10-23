---
test_ids:
  - XT-contracts-5
  - XT-contracts-6
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) under the "What it may change" of the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md`, so the prompt
  also carries (a) the Upstream source files a touched Xaravel Test reads
  as data from `conformance/upstream/` (a `readFileSync` over a path built
  from a constant directory and a computed file name, or a directory walk
  of one), as whole files or, past the cap, named as omitted with the
  declaration lines (`namespace`, `use`, `interface`/`class … extends …
  implements …`) of each; (b) the spine section an AD citation in a
  changed file names when the citation is a sub-rule such as "AD-5,
  Lifecycle" (today only the cited ADs' Rule bullets are shown, and AD-5's
  "Lifecycle" bullet was missing); and (c) `tsconfig.base.json` when a
  touched Xaravel Test copies it into a compiler fixture. Tests for each
  case in `conformance/tests/xaravel/fidelity-review.test.ts`, and the
  evidence notes of `conformance/review/fidelity.md` and
  `docs/ops/fidelity-review.md` updated. The orchestrator may rule it
  itself under that amendment.
evidence: >-
  Both reviewers of Story 10.2's Fidelity Review rejected, on the first
  pass (tree 6d6c0b6bcfb46be659fe91f0583a7b87b8b36210) and again on the
  second (tree 70d1c9a929e5a71c857684270e6c910bf63a20ab), for evidence that
  is in the repository but not in the prompt: F-7 "XT-contracts-5 reads
  Upstream PHP declarations to establish parents and exception bases, but
  those PHP files are not supplied" and "Supply the Upstream PHP inputs
  read across the 19 namespaces and tsconfig.base.json" (XT-contracts-6,
  `packages/contracts/tests/xaravel/structural.test.ts`); F-9 "the cited
  AD-5 lifecycle evidence is not supplied" for
  `packages/contracts/src/foundation/Application.ts`. The files are
  `conformance/upstream/framework/src/Illuminate/Contracts/<Ns>/*.php` (90
  files), the spine's AD-5 "Lifecycle" bullet
  (`_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md`)
  and `tsconfig.base.json`.
---

# ESC-10.2-7: the Fidelity Review prompt lacks the Upstream sources, the AD-5 Lifecycle text and `tsconfig.base.json`

Story 10.2's tests derive their expectations from the Upstream PHP sources (each contract's parents, exception bases and the concrete classes it names) and build a compiler fixture from `tsconfig.base.json`, and `Application.ts` cites AD-5's "Lifecycle" rule for its sync deferred-provider methods. The Fidelity Review shows its reviewers none of these, and both reviewers rejected twice for that.

The recommended fix, Option 1, adds them to the prompt under the 2026-10-21 amendment ("missing Fidelity Review evidence"), which lets the orchestrator rule it and fix the tool on a `planning/esc-10.2-7` branch. It stops XT-contracts-5 and XT-contracts-6 until the Fidelity Review re-runs on the changed tree.
