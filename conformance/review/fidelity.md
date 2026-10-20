# Fidelity Review checklist

Two reviewer agents, separate from the implementer, review every Story PR against Upstream (FR-111, AD-15.8). They run as two GitHub Apps, `xaravel-fidelity-1` and `xaravel-fidelity-2`, so their reviews come from two distinct identities, neither of them the PR author. `bun run fidelity:review` (`tools/fidelity-review/fidelity-review.ts`, [docs/ops/fidelity-review.md](../../docs/ops/fidelity-review.md)) reads this file at run time. Each item below is one `### F-<n>: <title>` heading; there is no second copy.

**Verdict rule.** The reviewer answers every item exactly once with `pass`, `fail` or `n/a`, and a note. A `fail` lists its findings, each with a path and a detail. When unsure, the answer is `fail`. The review is `APPROVE` only when every item is `pass` or `n/a`; any `fail` makes it `REQUEST_CHANGES`, and that review carries the findings back to the implementer on the PR (the orchestrator does not yet act on it, [ESC-8.5-1](../escalations/ESC-8.5-1.md)). `story:check` counts only approvals by distinct identity, on the PR head commit.

An item is `n/a` only when the PR has nothing it applies to, such as F-10 on a PR that changes no Oracle request file.

### F-1: Assertions match Upstream

**Check.** Compare each changed or added Ported Test with its Upstream source lines, as the Inventory row's `source` gives them. Every Upstream assertion has a counterpart that checks the same subject against the same expected value, in the same order. It fails when an assertion checks something else, checks a different value, or is missing. It also fails when the Upstream source is unavailable and the PR adds or changes a Ported Test, because the match cannot be confirmed.

### F-2: No expected value is weakened

**Check.** Compare each expected value with Upstream's. It fails when an exact comparison becomes a looser one (`assertSame` to `assertEquals`, an exact string to a substring or a pattern, an exact count to a minimum), when an expected value is changed to match what Xaravel produces, or when an expected exception class or message is generalised. A change is allowed only when the line carries an `// adapted:DIV-<n>.<k>` marker whose clause permits exactly that change.

### F-3: No assertion is removed without a DIV clause

**Check.** Count the assertions of each Ported Test against Upstream's. It fails when an Upstream assertion has no counterpart and no `// adapted:DIV-<n>.<k>` marker cites a DIV clause that allows dropping it. A clause allows fewer assertions only when its record lists it in `fewer_assertions`.

### F-4: Every new Skip Reason is justified and its precedence is right

**Check.** For every Expectations line the PR sets to `skip`, the reason applies to that test: the named `deferred:` item, `blocked-by:<component>` Component, Non-Goal or `intentional-divergence:DIV-<n>` really covers it. When more than one reason could apply, the line records the one the [Precedence](../README.md#precedence) section of `conformance/README.md` puts first ([ESC-5.2-1](../escalations/ESC-5.2-1.md)): `upstream-skip`, then the reasons that keep the test in the SM-1 denominator, and only then the reasons that exclude it. When in doubt, the right reason is the one that counts against conformance. It fails on an unjustified reason or the wrong precedence.

### F-5: Every `adapted` marker matches its clause

**Check.** For every `// adapted:DIV-<n>.<k>` marker on an assertion, and every Expectations `adapted` field, read clause `DIV-<n>.<k>` in `decisions/DIV-<n>.md`. The adaptation is what that clause describes, and nothing more. It fails when the clause does not exist, when it covers a different construct, or when the code changes more than the clause allows.

### F-6: Every Oracle error fixture is the error Upstream's test expects

**Check.** For every Oracle fixture the Story relies on whose output is an error (`output.error` not null), the error is the one the Upstream test expects: the same exception class and, where the test checks it, the same message. The Inventory records only whether the test passed or failed on the Oracle (Epic 5 retro item 9), so an error fixture can stand for the wrong failure. It fails when an error fixture's error differs from the error the Upstream test expects.

### F-7: Every Xaravel Test verifies the consequence it declares

**Check.** For every added or changed `xaravelTest(id, consequence, …)`, the body checks what its consequence string declares, and each `FR-<n>.<k>` or `AD-<n>.<k>` token it cites names the bullet the test actually verifies ([ESC-5.9-1](../escalations/ESC-5.9-1.md)). It fails when the body checks less than the string claims, or when a cited bullet is not the one tested.

### F-8: No stub, fake or partial implementation of another Component

**Check.** The PR changes code only in its own Component. It fails when it adds a stub, a fake, a hard-coded return or a partial implementation of another Component's behaviour to make a test pass (FR-111.4). A test that needs a later Component is marked `blocked-by:<component>` instead.

### F-9: Every `@asyncRoot` tag is true

**Check.** Every `@asyncRoot` tag the PR adds or keeps marks a method that really performs IO behind an async-root Driver contract (AD-6, DIV-1). It fails when a tagged method does no IO, or only calls other async code it could have kept sync, and when a method that does such IO is async without the tag.

### F-10: Oracle requests match the Upstream test's inputs

**Check.** For every request in a changed `conformance/oracle-requests/<story-id>.jsonl`, its `setup` and `exprs` are the inputs of the Upstream test its `id` names, or the request carries a recorded reason for the difference. A request must not get arbitrary PHP signed as an expected value (Epic 3 retro R4). It fails when `setup` or `exprs` differ from the Upstream test's inputs without a recorded reason.
