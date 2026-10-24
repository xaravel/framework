---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-24
escalation_sha256: "4bf4c3542e886c3c877ffc8abca6c96971fcbc587154ea973489d55961391524"
---

# ESC-10.4-2: approved, option 1 (the review shows the Upstream sources a test reads through an imported path constant, a directory walk filtered by file name, and a cited method)

`tools/fidelity-review/fidelity-review.ts` adds evidence to (h) in four cases:

- **An imported path constant.** `importedPathConsts` resolves each `const` a changed test imports from a relative repository module (`import { REPO } from "./support/contract-namespaces"`) in that module, where `import.meta.dir` is the module's directory, and hands it to `upstreamReadDirs` as a path relative to the test. So `const ILLUMINATE = join(REPO, "conformance", "upstream", "framework", "src", "Illuminate")` in `aliases.test.ts` now resolves, and `readdirSync(ILLUMINATE, …)` and `readFileSync(join(ILLUMINATE, file), …)` read from `conformance/upstream/framework/src/Illuminate/`. A function such as `upstreamPath` is not a path constant; the class it is called with is a string literal the test names, so `upstreamSourcesNamed` already finds `Foundation/Application.php` once the directory resolves.
- **A cited method.** `upstreamCitedSources` lists each `<Class>.php` under the read directory whose class implements, with a body, a method the reading test cites as `<Class>::<method>`. The XT-contracts-12 title cites "Upstream Container::alias's message", so `Container/Container.php`, which throws "[{$abstract}] is aliased to itself.", is shown. The interface `Contracts/Container/Container.php` declares `alias` without a body and is not selected this way.
- **A directory walk filtered by file name.** `upstreamWalkedSources` lists each file under the read directory whose name ends with a `<name>.php` suffix the reading test passes to `.endsWith(…)`. For `aliases.test.ts` that is the 38 `*ServiceProvider.php` files (138,525 characters). A bare `".php"` selects none, so Story 10.2's walk still reads only the classes the change names, as ESC-10.2-7 chose.
- **Method bodies with the declaration lines.** A source that does not fit shows, after its declaration lines, the methods the test points at (`upstreamMethodsCited`, `phpMethodBodies`): a name a regular expression in the test matches as `function <name>\(` (`registerCoreContainerAliases`), or a `<Class>::<method>` citation (`Container::alias`). Its heading names those methods.

Order within (h)'s Upstream sources: first a class the reading test names itself or whose method it cites, then the files its walk selects, then the other classes the change names. On Story 10.4's change, with a 700,000-character (h) budget, `Foundation/Application.php` (47,575), `Container/Container.php` (53,812) and all 38 providers are shown whole.

`conformance/tests/xaravel/fidelity-review.test.ts` (XT-conformance-161) tests each case against a hermetic snapshot: the imported `REPO` resolved relative to the test, an unreadable module and a function resolving nothing, and `upstreamReadDirs` finding the directory only through the import; the walk's suffix selecting the two providers, and a bare `".php"` selecting none; `Container::alias` selecting the class and not the interface, and no citation selecting nothing; the methods a regex and a citation point at, a function the PHP lacks left out, and the bodies with their docblocks; the (h) entries, their reasons and their order, with an unnamed class left out; and, under a tight budget, the declaration lines with the method bodies and the heading that names them.

In `conformance/review/fidelity.md`, the "Whole files" evidence note says what the prompt now carries. It sits above the checklist items, and no Check changes. The (h) entry in `docs/ops/fidelity-review.md` says the same.

The reject this answers is both reviewers' reject of Story 10.4 at tree `56738407bb01eca2c349e6d66167ad3a7225c137` (base `a02d058c0463f814522c232ec31c0e4f5f8158d1`). Reviewer 1 failed F-2 with a `missing-evidence` finding: "Supply the pinned Application::registerCoreContainerAliases, relevant service-provider sources, and Container::alias source so the expected alias data and self-alias exception message can be compared with Upstream". Reviewer 1 and reviewer 2 both failed F-7 on the same gap: "The prompt does not include Foundation/Application.php registerCoreContainerAliases or the provider sources".

**The re-run.** Story 10.4 re-runs its Fidelity Review on a changed tree with `--base a02d058c0463f814522c232ec31c0e4f5f8158d1`. Its tree changes, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings. ESC-10.4-1 is approved (`decisions/ESC-10.4-1.md`), so the Story is unblocked.

Rationale:

- **The evidence exists, but the tool never showed it.** The Upstream snapshot is what `bun run upstream:sync` puts in `conformance/upstream/` on every machine that runs the review. (h) resolved only path constants a test declares itself, followed a directory walk only to the classes the change names, and had no way to reach a class the test cites by method. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes. No evidence is removed or narrowed: every file (h) showed or named before is still shown or named. Its order changes only among the Upstream sources, all in the same tier. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Selecting by what the test says it reads.** A walk of `Illuminate/` could reach the whole framework. The test's own `.endsWith("ServiceProvider.php")` and its `Container::alias` citation say which files it reads, so the prompt shows those and no others.

This ruling clears XT-contracts-10, -11 and -12 of ESC-10.4-2.
