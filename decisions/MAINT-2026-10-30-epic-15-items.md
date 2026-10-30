---
decision: approved
decided_by: Maintainer
date: 2026-10-30
scope: Epic 15 retrospective, items 1 and 6
---

# Rulings: Epic 15 retrospective, items 1 and 6

The Maintainer ruled on both items routed to the Maintainer, on 2026-10-30, in the Maintainer's session, on the monitor's recommendation.

## Item 1: the config Repository's pre-sealed base write (`epic-15-retro-item-1-config-presealed-base-write-target`)

Story 17.4, which adds the Application's `sealed` state and the base-write seam Macroable also waits on, gains an acceptance criterion in `epics.md` naming `packages/config`: before `sealed`, a Repository write lands in the Repository's base items through that seam; after it, a write inside a unit frame still goes to the frame's overlay (`decisions/ESC-15.1-2.md`). It mirrors `epic-11-retro-item-7-macroable-boot-write`.

Config's half is action item `epic-15-retro-item-8-config-presealed-base-write` (scope `packages/config`). It waits in epic 15's `waiting_on_maintainer` until Story 17.4 is done, and Story 17.4's PR takes it out. XT-config-1 then gains its full wording. Item 1 is done.

## Item 6: a compiled-pattern cache for the runtime's `preg_*` functions (`epic-15-retro-item-6-pcre-compiled-pattern-cache`)

`Dotenv.parse` ran about 30× slower than PHP because every `preg_*` call recompiled its pattern; `pcre.ts` read AD-5 as forbidding a cache. AD-5 forbids per-request state in singletons and module variables. A cache of compiled patterns keyed only by pattern text and flags is memoization of a pure conversion, holds no request data, and is the same for every request, so it is allowed.

- The cache is process-wide and immutable in meaning: an entry depends only on its key.
- A `RegExp` with the `g` or `y` flag carries `lastIndex` state, so a cached entry never hands one shared stateful `RegExp` to two calls: each call gets a fresh `RegExp` built from the cached source and flags, or one whose `lastIndex` it resets before use and that no concurrent call can observe.
- It may be bounded (an LRU is fine). Results, errors and `preg_last_error` stay exactly as without it.

Action item `epic-15-retro-item-9-runtime-pcre-pattern-cache` (scope `packages/runtime`) builds it, with an XT-runtime case showing that interleaved calls with one sticky or global pattern give PHP's results, and a note in `pcre.ts` citing this ruling. Item 6 is done.
