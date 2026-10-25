---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "079ed7bdb616cb7b412ddc94c64ecc726572900d317b16dff4cf5f22e1b8ba1f"
---

# ESC-13.1-7: approved, option 1, a runtime table from a contract token's FQCN to the token

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Story 13.1's ESC-13.1-7 to ESC-13.1-10 were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1-second.md`.

`contract(...)` records each token under its FQCN in a table the runtime owns. Reflection then resolves an interface name as it resolves a class. `interface_exists` reads the table, `new ReflectionClass(<token FQCN>)` reflects the token, and `isParameterSubclassOf` ports line for line, with Upstream's `IA` / `IB` written as `contract(...)` tokens. This adds no divergence: it brings an interface hint closer to PHP. Option 2 (interfaces as abstract classes) would contradict PORTING.md and leave every token-typed parameter answering `false`.
