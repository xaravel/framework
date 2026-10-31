---
decision: approved
decided_by: Maintainer
date: 2026-10-31
escalation_sha256: "c5f8f3e8815de4a47e39c5231d053bb6300cb9aab6c1301df2381977323fcfca"
---

# ESC-16.1-6: approved, option 1 (eight additions for `JsonSchema`'s static delegators, under new clause DIV-12.22)

The Maintainer approved option 1 on 2026-10-31, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

Upstream declares `object`, `anyOf`, `integer`, `number`, `string`, `boolean`, `array` and `union` on `Illuminate\JsonSchema\JsonSchema` only as `@method static` tags served by `__callStatic`. AD-26 makes them explicit static delegating methods, so the API-surface gate reports them as `extra`. New clause **DIV-12.22** records that rule for every such `__callStatic` forwarder, not only Macroable's (DIV-12.10), and `conformance/api-surface/additions.jsonl` gains the eight lines citing it. Under XT-conformance-82, this ruling is their source. The gate's remaining json-schema items (the Deserializer, `fromArray`) are Story 16.2's.
