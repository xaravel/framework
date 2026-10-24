// Upstream's container aliases, verbatim as data (AD-1.4). FQCNs carry no leading `\`, and `self::class` in
// `Application::registerCoreContainerAliases` is `Illuminate\Foundation\Application`.
//
// - `CORE_CONTAINER_ALIASES`: `Illuminate\Foundation\Application::registerCoreContainerAliases`, its 40 keys and each
//   key's aliases in Upstream order.
// - `PROVIDER_BINDINGS`: each string abstract a `*ServiceProvider.php` binds with `singleton`, `bind` or `scoped` that
//   is not a core key, mapped to the FQCN of the class its closure builds (read through the file's `use` lines), in
//   provider file path order, then line order.
// - `PROVIDER_ALIASES`: the providers' `$this->app->alias(X::class, Y::class)` calls as `[abstract, alias]`, in file
//   and line order.

/** `Application::registerCoreContainerAliases`: key → its aliases, in Upstream order. */
export const CORE_CONTAINER_ALIASES: Readonly<Record<string, readonly string[]>> = deepFreeze({
  app: ["Illuminate\\Foundation\\Application", "Illuminate\\Contracts\\Container\\Container", "Illuminate\\Contracts\\Foundation\\Application", "Psr\\Container\\ContainerInterface"],
  auth: ["Illuminate\\Auth\\AuthManager", "Illuminate\\Contracts\\Auth\\Factory"],
  "auth.driver": ["Illuminate\\Contracts\\Auth\\Guard"],
  "auth.password": ["Illuminate\\Auth\\Passwords\\PasswordBrokerManager", "Illuminate\\Contracts\\Auth\\PasswordBrokerFactory"],
  "auth.password.broker": ["Illuminate\\Auth\\Passwords\\PasswordBroker", "Illuminate\\Contracts\\Auth\\PasswordBroker"],
  "blade.compiler": ["Illuminate\\View\\Compilers\\BladeCompiler"],
  cache: ["Illuminate\\Cache\\CacheManager", "Illuminate\\Contracts\\Cache\\Factory"],
  "cache.store": ["Illuminate\\Cache\\Repository", "Illuminate\\Contracts\\Cache\\Repository", "Psr\\SimpleCache\\CacheInterface"],
  "cache.psr6": ["Symfony\\Component\\Cache\\Adapter\\Psr16Adapter", "Symfony\\Component\\Cache\\Adapter\\AdapterInterface", "Psr\\Cache\\CacheItemPoolInterface"],
  config: ["Illuminate\\Config\\Repository", "Illuminate\\Contracts\\Config\\Repository"],
  cookie: ["Illuminate\\Cookie\\CookieJar", "Illuminate\\Contracts\\Cookie\\Factory", "Illuminate\\Contracts\\Cookie\\QueueingFactory"],
  db: ["Illuminate\\Database\\DatabaseManager", "Illuminate\\Database\\ConnectionResolverInterface"],
  "db.connection": ["Illuminate\\Database\\Connection", "Illuminate\\Database\\ConnectionInterface"],
  "db.schema": ["Illuminate\\Database\\Schema\\Builder"],
  encrypter: ["Illuminate\\Encryption\\Encrypter", "Illuminate\\Contracts\\Encryption\\Encrypter", "Illuminate\\Contracts\\Encryption\\StringEncrypter"],
  events: ["Illuminate\\Events\\Dispatcher", "Illuminate\\Contracts\\Events\\Dispatcher"],
  files: ["Illuminate\\Filesystem\\Filesystem"],
  filesystem: ["Illuminate\\Filesystem\\FilesystemManager", "Illuminate\\Contracts\\Filesystem\\Factory"],
  "filesystem.disk": ["Illuminate\\Contracts\\Filesystem\\Filesystem"],
  "filesystem.cloud": ["Illuminate\\Contracts\\Filesystem\\Cloud"],
  hash: ["Illuminate\\Hashing\\HashManager"],
  "hash.driver": ["Illuminate\\Contracts\\Hashing\\Hasher"],
  image: ["Illuminate\\Image\\ImageManager"],
  log: ["Illuminate\\Log\\LogManager", "Psr\\Log\\LoggerInterface"],
  "mail.manager": ["Illuminate\\Mail\\MailManager", "Illuminate\\Contracts\\Mail\\Factory"],
  mailer: ["Illuminate\\Mail\\Mailer", "Illuminate\\Contracts\\Mail\\Mailer", "Illuminate\\Contracts\\Mail\\MailQueue"],
  queue: ["Illuminate\\Queue\\QueueManager", "Illuminate\\Contracts\\Queue\\Factory", "Illuminate\\Contracts\\Queue\\Monitor"],
  "queue.connection": ["Illuminate\\Contracts\\Queue\\Queue"],
  "queue.failer": ["Illuminate\\Queue\\Failed\\FailedJobProviderInterface"],
  redirect: ["Illuminate\\Routing\\Redirector"],
  redis: ["Illuminate\\Redis\\RedisManager", "Illuminate\\Contracts\\Redis\\Factory"],
  "redis.connection": ["Illuminate\\Redis\\Connections\\Connection", "Illuminate\\Contracts\\Redis\\Connection"],
  request: ["Illuminate\\Http\\Request", "Symfony\\Component\\HttpFoundation\\Request"],
  router: ["Illuminate\\Routing\\Router", "Illuminate\\Contracts\\Routing\\Registrar", "Illuminate\\Contracts\\Routing\\BindingRegistrar"],
  session: ["Illuminate\\Session\\SessionManager"],
  "session.store": ["Illuminate\\Session\\Store", "Illuminate\\Contracts\\Session\\Session"],
  translator: ["Illuminate\\Translation\\Translator", "Illuminate\\Contracts\\Translation\\Translator"],
  url: ["Illuminate\\Routing\\UrlGenerator", "Illuminate\\Contracts\\Routing\\UrlGenerator"],
  validator: ["Illuminate\\Validation\\Factory", "Illuminate\\Contracts\\Validation\\Factory"],
  view: ["Illuminate\\View\\Factory", "Illuminate\\Contracts\\View\\Factory"],
});

/** The providers' string bindings outside the core keys: key → the FQCN of the class its closure builds. */
export const PROVIDER_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  // Cache/CacheServiceProvider.php
  "memcached.connector": "Illuminate\\Cache\\MemcachedConnector",
  // Database/DatabaseServiceProvider.php
  "db.factory": "Illuminate\\Database\\Connectors\\ConnectionFactory",
  "db.transactions": "Illuminate\\Database\\DatabaseTransactionsManager",
  // Database/MigrationServiceProvider.php
  "migration.repository": "Illuminate\\Database\\Migrations\\DatabaseMigrationRepository",
  migrator: "Illuminate\\Database\\Migrations\\Migrator",
  "migration.creator": "Illuminate\\Database\\Migrations\\MigrationCreator",
  // Foundation/Providers/ComposerServiceProvider.php
  composer: "Illuminate\\Support\\Composer",
  // Pipeline/PipelineServiceProvider.php
  pipeline: "Illuminate\\Pipeline\\Pipeline",
  // Queue/QueueServiceProvider.php
  "queue.worker": "Illuminate\\Queue\\Worker",
  "queue.listener": "Illuminate\\Queue\\Listener",
  "queue.routes": "Illuminate\\Queue\\QueueRoutes",
  // Translation/TranslationServiceProvider.php
  "translation.loader": "Illuminate\\Translation\\FileLoader",
  // Validation/ValidationServiceProvider.php
  "validation.presence": "Illuminate\\Validation\\DatabasePresenceVerifier",
  // View/ViewServiceProvider.php
  "view.finder": "Illuminate\\View\\FileViewFinder",
  "view.engine.resolver": "Illuminate\\View\\Engines\\EngineResolver",
});

/** The providers' `alias(abstract, alias)` calls, in file and line order. */
export const PROVIDER_ALIASES: readonly (readonly [abstract: string, alias: string])[] = deepFreeze([
  // Broadcasting/BroadcastServiceProvider.php
  ["Illuminate\\Broadcasting\\BroadcastManager", "Illuminate\\Contracts\\Broadcasting\\Factory"],
  // Bus/BusServiceProvider.php
  ["Illuminate\\Bus\\Dispatcher", "Illuminate\\Contracts\\Bus\\Dispatcher"],
  ["Illuminate\\Contracts\\Bus\\Dispatcher", "Illuminate\\Contracts\\Bus\\QueueingDispatcher"],
  // Notifications/NotificationServiceProvider.php
  ["Illuminate\\Notifications\\ChannelManager", "Illuminate\\Contracts\\Notifications\\Dispatcher"],
  ["Illuminate\\Notifications\\ChannelManager", "Illuminate\\Contracts\\Notifications\\Factory"],
] as const);

/** `value` with every nested array and plain object frozen. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
