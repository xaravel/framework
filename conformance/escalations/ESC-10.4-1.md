---
test_ids:
  - XT-contracts-11
  - XT-contracts-12
trigger: contract
proposed: >-
  Option 1 (recommended): keep AD-1's rule where it decides, and close its
  two gaps with Upstream's own data. (a) Among a service's contract aliases,
  the canonical token is the one no other contract alias of the service
  extends (Foundation\Application for 'app', Cookie\QueueingFactory for
  'cookie', Cache\Repository for 'cache.store'). When several remain because
  Upstream lists unrelated sibling contracts, the first one in Upstream's
  order is canonical, and the others stay aliases of it, as they are aliases
  of one key in Upstream: Encryption\Encrypter for 'encrypter', Mail\Mailer
  for 'mailer', Queue\Factory for 'queue', Routing\Registrar for 'router',
  Notifications\Dispatcher for ChannelManager. (b) A service none of whose
  aliases is a contract keeps its Upstream string key as its canonical
  abstract, the key Upstream binds: 'blade.compiler', 'db', 'db.connection',
  'db.schema', 'files', 'hash', 'image', 'queue.failer', 'redirect',
  'request', 'session', 'cache.psr6', and every provider string binding with
  no contract ('migrator', 'pipeline', …). So `canonicalToken` returns a
  contract token or that string. (c) Validation fails, naming the alias, for
  an alias listed under two services, an alias of itself, an alias whose
  FQCN is in a ported contract namespace but has no token, and an alias of a
  service that has neither a contract nor a string key (a provider's
  class-to-class alias set with no contract): that is "an alias with no
  canonical contract". The table at the Pin passes. Option 2: (b) uses the
  service's first concrete class FQCN ('Illuminate\View\Compilers\BladeCompiler')
  instead of its key. Option 3: validation fails for every service with no
  contract, and AD-1 is amended to list the exempt keys.
evidence: >-
  AD-1 (spine, "Alias table") says every service has one canonical token,
  "the most specific contract it is aliased to", and Story 10.4's third AC
  says validation fails naming "an alias with no canonical contract". Its
  first AC asks for `registerCoreContainerAliases` and each provider's string
  bindings verbatim. At the Pin those disagree in two ways
  (`conformance/upstream/framework/src/Illuminate/Foundation/Application.php`,
  `registerCoreContainerAliases`). First, 12 core keys alias no
  `Illuminate\Contracts` or ported PSR interface: 'blade.compiler' →
  [BladeCompiler], 'db' → [DatabaseManager, Database\ConnectionResolverInterface],
  'db.connection', 'db.schema', 'files', 'hash', 'image', 'queue.failer'
  (Queue\Failed\FailedJobProviderInterface), 'redirect', 'request',
  'session', and 'cache.psr6' (PSR-6, which AD-22 does not port). The 15
  provider string bindings outside the core list ('migrator', 'pipeline',
  'view.finder', …) alias nothing. A literal reading makes the verbatim table
  fail its own validation. Second, four core keys and one provider alias set
  list contracts where none extends the other: 'encrypter' (Encrypter,
  StringEncrypter), 'mailer' (Mailer, MailQueue), 'queue' (Factory, Monitor),
  'router' (Registrar, BindingRegistrar), and
  `Notifications/NotificationServiceProvider.php:36-40` (Dispatcher,
  Factory). Each `Contracts/*.php` declares a bare `interface`, so "most
  specific" picks none of them. AD-1 does not say which is canonical. That
  token is what providers bind and what the Container (Epic 17) reads.
---

# ESC-10.4-1: Which token is canonical when a service has no contract, or two unrelated ones?

AD-1 gives every service one canonical token: the most specific contract it is aliased to. Upstream's alias data at the Pin has 12 core services, and 15 provider string bindings, that alias no contract at all, and 5 alias sets that list sibling contracts. AD-1 decides neither case. Story 10.4's third AC (validation fails for "an alias with no canonical contract") would then reject the verbatim table its first AC asks for.

The Story builds Option 1. Option 1 adds no divergence, weakens no check, and keeps Upstream's binding keys, so the orchestrator may rule on it (MAINT-2026-10-16). This blocks XT-contracts-11 and XT-contracts-12 only. XT-contracts-10, the verbatim table, does not depend on the ruling.
