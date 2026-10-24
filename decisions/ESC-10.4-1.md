---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "3aa7fa9249d833fd038ca577c1a3fa0342d360ad58abfd114c6ffb05a92ace7e"
---

# ESC-10.4-1: approved, option 1 (AD-1's rule where it decides; Upstream's order and Upstream's string key where it does not)

Option 1 is approved. It completes AD-1.4's canonical-token rule for the two cases the Pin's alias data has and AD-1 does not decide:

- **(a) Sibling contracts.** Among a service's contract aliases, the canonical token is the one no other contract alias of that service extends: `Foundation\Application` for `'app'`, `Cookie\QueueingFactory` for `'cookie'`, `Cache\Repository` for `'cache.store'`. When more than one remains because Upstream lists unrelated contracts, the first in Upstream's order is canonical, and the others stay aliases of it, as they are aliases of one key in Upstream: `Encryption\Encrypter` for `'encrypter'`, `Mail\Mailer` for `'mailer'`, `Queue\Factory` for `'queue'`, `Routing\Registrar` for `'router'`, `Notifications\Dispatcher` for `ChannelManager`.
- **(b) No contract.** A service none of whose aliases is a contract keeps its Upstream string key as its canonical abstract, the key Upstream binds: `'blade.compiler'`, `'db'`, `'db.connection'`, `'db.schema'`, `'files'`, `'hash'`, `'image'`, `'queue.failer'`, `'redirect'`, `'request'`, `'session'`, `'cache.psr6'`, and every provider string binding with no contract (`'migrator'`, `'pipeline'`, …). `canonicalToken` returns a contract token or that string.
- **(c) Validation.** `validateAliasTable` fails, naming the alias, for an alias listed under two services, an alias of itself, an alias whose FQCN is in a ported contract namespace but has no token, and an alias of a service that has neither a contract nor a string key. That last case is what Story 10.4's third AC calls "an alias with no canonical contract". The table at the Pin passes.

Option 2 (the first concrete class FQCN in place of the key, under (b)) is not taken: Upstream binds the key, not the class, so providers ported verbatim would bind a token Upstream never uses. Option 3 (fail every service with no contract, and amend AD-1 with an exempt list) is not taken: it needs a spine change, and the exempt list would only restate (b).

Rationale:

- **It is AD-1 where AD-1 decides.** "The most specific contract it is aliased to" picks the same token as (a) whenever one contract extends the others. (a) and (b) only fill the cases where that phrase picks nothing: unrelated `interface` declarations, or no contract at all.
- **It keeps Upstream's data and keys.** The table stays verbatim (Story 10.4's first AC). (a) follows Upstream's own listing order, and (b) keeps the key Upstream's `bind`/`singleton` calls use, so the Container (Epic 17) resolves what Upstream resolves and autowiring a listed concrete class still never builds a second instance.
- **It is outside the classes the orchestrator may not rule on.** It removes no assertion, weakens no expected value, adds no skip or `adapted:` marker, and adds no divergence outside DIV-1..12. It does not make Xaravel slower or less faithful: canonical lookup is the same table read either way.

**The route.** Story 10.4 already builds Option 1. This ruling clears XT-contracts-11 and XT-contracts-12 of ESC-10.4-1. All three of XT-contracts-10, -11 and -12 still wait on ESC-10.4-2 (the Fidelity Review evidence for the Upstream sources the tests read), so the Story stays `blocked` on it. Once ESC-10.4-2 lands, the Story re-runs its Fidelity Review on a changed tree, as the standing-reject rule (ESC-8.8-1) requires.
