---
decision: approved
decided_by: Maintainer
date: 2026-10-24
scope: Epic 11 retrospective items 2, 3 and 6
---

# Maintainer rulings: Epic 11 items 2, 3 and 6

The Maintainer gave these rulings on 2026-10-24 in the Maintainer's session, accepting each recommendation. Finding codes are those of `_bmad-output/implementation-artifacts/epic-11-retro-2026-10-24.md`.

## Item 2: the boot-time macro write lands in two steps (S2)

- **Story 17.4 adds the seam.** Story 17.4 (Scoped bindings and Scope Frame write rules) gains an AC: `@xaravel/runtime` provides a write to the active Application's base before `sealed`, as `decisions/ESC-11.1-2.md` approved. Its PR also takes `epic-11-retro-item-7-macroable-boot-write` out of `waiting_on_maintainer`. `epics.md` has the AC.
- **Macroable's half becomes a follow-up item.** It is `epic-11-retro-item-7-macroable-boot-write`, owned by the orchestrator. It routes `macro`, `mixin` and `flushMacros` made before `sealed` to that base, with an XT-macroable-2 boot-time case. It is registered now, so it cannot be forgotten.
  - The item stays in epic 11's `waiting_on_maintainer` until Story 17.4 is `done`, because the loop's step D has no other way to hold an item back for a later Story. The item does not wait on the Maintainer.
  - This keeps Story scope intact: Story 17.4 never edits `packages/macroable`.

## Item 3: `PORTING.md`'s `Macroable` row follows what shipped (S3)

The row now says callers type a macro with `declare` / `declare static` members on their class, as Story 11.1 and `packages/macroable/docs/macroable.md` do. oxlint's `no-unsafe-declaration-merging` rejects module augmentation of a class. Done in this PR.

## Item 6: AD-3's `src/<Upstream sub-path>/` is the Upstream file path (L4)

- **The rule.** A Component's files sit at the path of the Upstream file under that Component's folder, not at its PHP namespace path. AD-3's own example says so: `src/Illuminate/Collections/Collection.php` becomes `src/Collection.ts`, although the class's namespace is `Illuminate\Support`.
- **Macroable moves.** Upstream's `src/Illuminate/Macroable/Traits/Macroable.php` becomes `packages/macroable/src/Traits/Macroable.ts`, not `src/Support/Traits/Macroable.ts`. New orchestrator item `epic-11-retro-item-8-macroable-ad3-path` makes the move: imports, the barrel, docs and tests follow, and no behaviour changes. It lands before Epic 12 adds Conditionable, the second trait package.
- **Contracts conform.** `packages/contracts`' lower-case subpath folders (`src/async`, `src/mail`, …) follow AD-1's contract subpath rule (`Illuminate\Contracts\Mail\Mailer` becomes `@xaravel/contracts/mail`). That rule is specific to contracts, so they need no change.
