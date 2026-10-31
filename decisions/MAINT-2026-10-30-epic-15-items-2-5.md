---
decision: approved
decided_by: Maintainer
date: 2026-10-30
scope: Epic 15 retrospective, items 2 and 5
---

# Rulings: Epic 15 retrospective, items 2 and 5

The Maintainer ruled on 2026-10-30, in the Maintainer's session, on the monitor's recommendations.

## Item 2: untargeted deferrals (`epic-15-retro-item-2-untargeted-deferrals`, finding S2)

1. **(b) a non-UTF-8 `.env` and (c) the Lexer cap inside a multibyte character.** Both come from the runtime holding PHP strings as JS strings. New clause **DIV-9.18** records that limit: the runtime throws a `TypeError` naming it, never a silently different value. No byte-string model is added. Item 2 keeps this part: XT-config cases that assert the `TypeError` for (b) and (c), marked DIV-9.18.
2. **(a) the nested-frame config snapshot.** PHP has no frames, so the Oracle cannot decide it. It moves to **Story 17.4**, which gains an acceptance criterion in `epics.md`: 17.4 settles per-key fall-through from a child frame to its parent's overlay (AD-5), adds the `@xaravel/runtime/scope` read it needs, and config follows through `epic-15-retro-item-8-config-presealed-base-write`.
3. **(d) `class_exists` on a trait.** PHP's `class_exists` is `false` for a trait and `trait_exists` is `true`. New action item `epic-15-retro-item-10-runtime-trait-registry` adds a declaration-time trait mark to the Class Registry (`registerTrait`), `trait_exists`, and `class_exists` returning `false` for a trait, and registers the four existing traits with it.

Item 2 leaves `waiting_on_maintainer` for its remaining part, (b) and (c).

## Item 5: `getenv` with a name containing `=` (`epic-15-retro-item-5-getenv-equals-name`, finding L3)

The monitor ran the probe on the pinned Oracle base image, `php:8.5.11-cli-trixie@sha256:01a109229f4465bc9ef042d9198f09a4d9da7775a825dbd8572dcdbd8756c4d3` (PHP 8.5.11, Linux, glibc), on 2026-10-30:

```
putenv("FOO=bar=baz");
getenv("FOO=bar")      → string(3) "baz"
getenv("FOO=b")        → bool(false)
getenv("FOO")          → string(7) "bar=baz"
getenv("FOO=bar=baz")  → bool(false)
```

It confirms the glibc code-read: `getenv` returns the text after `<name>=` in the first environment entry that starts with `<name>=`. This record is the Oracle evidence the item needs; the host's macOS PHP, which answers differently, is not. Item 5 leaves `waiting_on_maintainer` and makes the runtime's `getenv` match these four results, with an XT-runtime case citing this file.
