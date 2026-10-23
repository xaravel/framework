---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "d84a49f9456510e03ed9f1f2b90e2d1332796895bb36f664097cb848dfe04ebc"
---

# ESC-10.2-6: approved, option 1 (`@asyncRoot callback` also covers a contract method that is itself such a callback)

Option 1 is approved.

## The change

- **Which methods.** Some contracts' implementations are the callbacks AD-6's Derivation lets be async:
  - validation rule objects: `Validation\Rule::passes`, `Validation\ValidationRule::validate` and `Validation\InvokableRule::__invoke`;
  - listeners, pipes and job handlers, where a contract declares them.
- **How they are declared.** Each such method returns a Promise and carries `@asyncRoot callback`, because DIV-1 lets each such callback be async and the caller awaits it.
- **Not taken:**
  - Option 2, an untagged Promise. It would weaken AD-6's rule that every async method is tagged.
  - Option 3, sync methods with closures only. It would drop DIV-1's "rule objects".

## Changes in this ruling's PR

- **`conformance/review/fidelity.md`, F-9's Check:** the `@asyncRoot callback` bullet also names a contract method whose implementations are such callbacks. The Check changes only through the Maintainer, and this is that change.
- **Spine, AD-6 Enforcement:** the tag's parenthesis says the same. `bun run xt:consequences` regenerates the consequence files.
- If `tools/async-surface/` checks a tag's reason, action item `epic-10-item-4-async-surface` teaches it this case (ESC-10.2-2).
