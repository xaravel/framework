---
decision: approved
decided_by: Maintainer
date: 2026-10-18
scope: Epic 2 retrospective item 7; Epic 3 retrospective items 8 and 9
---

# Maintainer rulings: Epic 2 item 7 and Epic 3 items 8 and 9

The Maintainer gave these rulings on 2026-10-18 in the Maintainer's session, accepting each recommendation.

## Epic 2 item 7: close it

`epic-2-retro-item-7-cleanup-2-6-patches-and-nightly` is done. Its cleanup half was already done (finding P3). Its other half, the first scheduled `inventory.yml` run, has now happened: run 39110893567 (schedule, 2026-10-18 08:17 UTC) passed and logged `Inventory check OK: 22070 tests in 40 files are byte-identical.` That verifies AC 2.7/1 (finding S5).

## Epic 3 item 8: fixture verification blocks merges

`epic-3-retro-item-8-fixture-verify-blocks-merge` (finding S2): approved. This reverses the Epic 1 item 2 ruling (`decisions/MAINT-2026-10-17-epic-1-items.md`, "leave as is") for fixture verification only; that ruling was made before any fixture existed. The rest of Epic 1 item 2 stands: `check`, `php-fixtures`, `upstream` and the baseline `merge` job stay advisory.

- `oracle:verify-fixtures` moves out of `check` into its own small `fixtures` job in `.github/workflows/ci.yml`. It runs on pull requests, in the merge queue and on pushes to `main`, and needs no install, so it stays fast.
- `fixtures` becomes a required check on `main`: `.github/rulesets/main.json` and `REQUIRED_CHECKS` in `tools/ruleset/ruleset.ts`, pinned to GitHub Actions like the others.
- `ownership` keeps accepting fixture paths on path alone. The required `fixtures` check is what makes a forged fixture unmergeable.
- The Maintainer applies the live ruleset with `bun run ruleset:apply` after this change is on `main`.

## Epic 3 item 9: give the Epic 3 deferrals a home in `epics.md`

`epic-3-retro-item-9-target-epic-3-deferrals` (findings S5, S6, R4-R6): approved. Each deferral gets a target Story in `epics.md`, through a planning PR the Maintainer merges.
