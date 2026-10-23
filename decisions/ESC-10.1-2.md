---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "f43793b62b1f70192549851f88b3e00c5c5e142653e45fe043ae83a2c83fe085"
---

# ESC-10.1-2: approved, option 1 (every `@xaravel/contracts` subpath approved at once)

Option 1 is approved. `SUBPATH_EXPORTS` in `conformance/tests/xaravel/scaffold.test.ts` gets one entry for `@xaravel/contracts`, listing every subpath Epic 10 builds. Option 2, one Escalation per later subpath, is not taken.

## The list

- **Xaravel subpaths the spine names:**
  - `psr`: the PSR container, simple-cache and log interfaces (AD-22, Story 10.1).
  - `aliases`: the container alias table (AD-1, Story 10.4).
  - `async`, `view` and `testing`: the Xaravel-only contracts (AD-6, AD-11 and AD-25 respectively, Story 10.5).
- **Each `Illuminate\Contracts\<Ns>` namespace at the Pin (v13.37.0), in kebab case:**
  - The 33 top-level namespaces: `auth`, `broadcasting`, `bus`, `cache`, `concurrency`, `config`, `console`, `container`, `cookie`, `database`, `debug`, `encryption`, `events`, `filesystem`, `foundation`, `hashing`, `http`, `image`, `json-schema`, `log`, `mail`, `notifications`, `pagination`, `pipeline`, `process`, `queue`, `redis`, `routing`, `session`, `support`, `translation`, `validation`, and `view`, which Story 10.5's `view` shares.
  - The six nested namespaces, at the nested subpath AD-1 gives them: `auth/access`, `auth/middleware`, `database/eloquent`, `database/events`, `database/query` and `session/middleware`.
  - `log` is included because it is at the Pin. Story 10.3 lists only its namespaces by name, but it ports "each remaining" interface.

## What stays the same

- **The check still applies.** An entry allows the subpath; it does not create it. Each one maps to `./src/<sub>/index.ts` and is added by the Story that builds it.
- **Other packages.** Every other package stays root-only, apart from `@xaravel/runtime`'s three (ESC-9.1-1).
- **A subpath not in the list** still needs a Maintainer-approved change, as ESC-9.1-1 says.

## Rationale

The list follows mechanically from AD-1's rule: each contract lives "at the subpath of its Upstream namespace". It also covers the Xaravel-only seams the spine names. Approving it once saves Stories 10.2–10.5 the same Escalation, and the list is checked against the Pin's tree rather than guessed.

This ruling clears ESC-10.1-2 for XT-contracts-4.
