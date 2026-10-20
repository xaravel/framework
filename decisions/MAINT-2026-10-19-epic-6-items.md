---
decision: approved
decided_by: Maintainer
date: 2026-10-19
scope: Epic 6 retrospective items 6, 7, 8 and 9
---

# Maintainer rulings: Epic 6 items 6, 7, 8 and 9

The Maintainer gave these rulings on 2026-10-19 in the Maintainer's session, accepting each recommendation. Finding codes (S1, L1, …) are those of `_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md`.

## Item 6: `typescript/return-await` set to `always` enforces the thenable rule (L1)

Framework packages and Ported Tests turn on the type-aware `typescript/return-await: ["error", "always"]`, pinned in `lint:disables`. It catches `async find() { return this.query(); }`, which the syntactic `xaravel/no-async-thenable-return` cannot see. It is stricter than spine:183's wording (every Promise returned in an `async` function is awaited), and that is accepted: `return await` keeps async stack traces and makes a thenable's terminal explicit. The Skeleton keeps `xaravel/no-async-thenable-return`, so App Developers do not inherit a style rule. AD-6's Thenables bullet names the enforcement. Epic 6 action item 11 (orchestrator) does it.

## Item 7: a sync method that returns a thenable carries no `@asyncRoot` tag (S1)

AD-6 tags *async* public methods, and `DB.table(): Builder` is not async; a tag on it would give the Fidelity Review a false claim to check. `async-surface.json` still records each such method, as a `thenable` line with no tag, because awaiting a thenable runs IO. The tag stays required on every Promise-returning method. A return type matches a thenable by its qualified name, resolved through its import, never by its short name, so `Schema\Builder` is not taken for `Query\Builder`. AD-6's Enforcement bullet and Story 6.4's first acceptance criterion now say so. Epic 6 action item 12 (orchestrator) changes the tool and the lint thenable list.

## Item 8: `story:check` runs `api-surface:gate` from a manifest field (S4)

A Story manifest whose acceptance criteria say "`api-surface:gate <c>` passes" carries `api_surface_gate: <c>`, and `story:check` runs the gate for `<c>` and fails on any unexplained member. A check fails when such an acceptance criterion in `epics.md` has no manifest carrying the field. An explicit field is preferred over inferring a Component's last Story, because Components such as `database` span several Epics. Story 6.5's acceptance criteria now say so. Epic 6 action item 13 (orchestrator) builds it before Epic 10 closes.

## Item 9: covering targets for the Epic 6 deferrals

| Finding | Target |
|---|---|
| **S2** DIV-12 model-config renames not mapped; AD-26 options object accepted instead of, not in addition to, the positional form | Epic 6 action item 14 (orchestrator), now. The rename list (PRD DIV-12: `fillable` → `setFillable`, `touches` → `isTouching`) and AD-26 ("also accepts") are already decided, so it is a tool fix, due before the first Component gate (Story 10.6). |
| **S5** compiled-view lint coverage is a placeholder | Story 49.1: the compiler's TypeScript output is kept as `.ts` snapshots under `packages/view/tests/__snapshots__/`, and `lint:disables` and XT-conformance-129 point at them. |
| **L4** `no-singleton-field-write` misses writes into a field's contents | Story 17.4: the rule also reports `.set`, `.push`, index writes, `Object.assign(this, …)` and writes through an alias of `this`; a process-wide cache field (a manager's `drivers`, `customCreators`) is exempt only when `singletons.json` lists it with a citation of the Upstream member. Per-request state is never exempt. This answers the retrospective's open question about L4: widen it. |
| **L5** closure-built singletons have `class: null` | Story 17.4: each binding the static scan leaves `null` is resolved by booting Upstream through the Oracle (`get_class(app(<abstract>))`). |
| **R3** one class under two FQCNs; a file registering a class it imports | Story 9.4: `registerClass` throws on a second FQCN for the same class, and `registration:check` fails on a `registerClass` call whose class is not declared in that file. |
| **V1** the mappings have run only on fixtures | Story 9.4 (the registration scan, on the first real `registerClass` calls) and Story 10.6 (the API-surface mappings, at the first Component gate). A mapping that misreads real code raises an Escalation instead of an `additions.jsonl` or `exceptions.jsonl` line. |

The acceptance criteria added to Stories 9.4, 10.6, 17.4 and 49.1 change files under `tools/` (`tools/registration/`, `tools/lint-rules/`, `tools/scans/`). This ruling approves those changes as Infrastructure work inside those Stories (AD-16), so the Story PRs touching them are expected to fail `ownership` and `protected-paths` only for those paths.

Epic 6 waits on the Maintainer for nothing now.
