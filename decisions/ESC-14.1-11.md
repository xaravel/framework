---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "929a2434ed2c9d13aa1e7962965eeeb837d14bf5e205cb10e0c51e7a40c0f04a"
---

# ESC-14.1-11: approved, option 1, `Mockery.mock(<contract token>)` builds a mock that is `instanceof` the token

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement. The route is in `decisions/MAINT-2026-10-26-story-14-1-mockery.md`.

`@xaravel/mockery`'s `Mockery.mock(X)` accepts, as its target, a contract token: an `@xaravel/contracts` token such as `Arrayable`, or a runtime PHP-interface token such as `JsonSerializable`. That is the target PORTING.md's Mockery rule names. The mock it builds carries the token's brand and its parents' brands, as the JMac double generator already does (`defineContractBrand` over `contractParentBrands`). So `Mockery.mock(Arrayable) instanceof Arrayable` is true, as PHP's `Mockery::mock(Arrayable::class) instanceof Arrayable` is. The four Test IDs then port as Upstream wrote them, with no adaptation. Option 2 would have needed the same Mockery change plus a PORTING.md edit, and it left the runtime's PHP-interface tokens with no form. This is action item `epic-14-item-4-mockery-contract-token-targets`.
