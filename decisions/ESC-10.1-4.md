---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "ffc6a8160dae52eadc1f2b3dc1e15b2bc603e8efb80949107c47cebe6e4f02c3"
---

# ESC-10.1-4: approved, option 1 (the PSR interfaces join the committed API surface)

Option 1 is approved. Option 2, hand-ported PSR metadata, is not taken: the PSR tokens' members and metadata would be checked against nothing.

## The change

`bun run oracle:api-surface` also exports the PSR interfaces AD-22 gives to `@xaravel/contracts/psr`:
- **What:** every interface in `Psr\Container`, `Psr\SimpleCache` and `Psr\Log`.
- **Versions:** those the framework install's `composer.lock` pins in the Oracle image. Today these are psr/container 2.0.2, psr/simple-cache 3.0.0 and psr/log 3.0.2.
- **Where:** their rows go to `conformance/api-surface/contracts.jsonl`, the file for the package that owns them.
- **Component map:** `componentForFqcn` maps those three namespaces to `contracts`, and nothing else under `Psr\` is exported.
- **Checks:** `api-surface --check` and `api-surface:gate contracts` then cover the PSR ports like every other contract. Story 10.1's PSR tokens take their method and parameter names from those rows (ESC-10.1-1 (b), ESC-4.7-1 item 5).

## The route

The change touches Protected Paths (`tools/oracle/`, `tools/component-map/`, `conformance/api-surface/`) and no package. It becomes action item **`epic-10-item-1-psr-api-surface`**, owner orchestrator, which this ruling approves as an Infrastructure change:
- **How it is done.** Step D does it on `planning/retro-10-psr-api-surface`, with tests for the new rows and mapping. It merges under the first amendment to the MAINT ruling.
- **Order.** Step D runs before Story work, so the item lands before Story 10.1 resumes XT-contracts-4.
- **Limits.** The item never edits another Component's rows, `schema.json`, or the citation files `additions.jsonl` and `exceptions.jsonl`.

## Changes in this ruling's PR

- **Sprint status:**
  - adds action item `epic-10-item-1-psr-api-surface`, `open`;
  - with ESC-10.1-3, Story 10.1 is `in-progress`.

This ruling clears ESC-10.1-4 for XT-contracts-4, after the action item.
