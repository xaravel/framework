// Illuminate\Contracts\Foundation\Application, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Container } from "../container/Container";
import type { ClassString } from "../structural/ClassString";
import type { MaintenanceMode } from "./MaintenanceMode";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { ServiceProvider } from "../structural/ServiceProvider";
import type { SyncClosure } from "../structural/SyncClosure";
import type { UnitEnum } from "../structural/UnitEnum";

declare const ApplicationBrand: unique symbol;

export interface Application extends Container {
  readonly [Application.brand]: true;

  /** Get the version number of the application. */
  version(): string;

  /** Get the base path of the Laravel installation. */
  basePath(path?: string): string;

  /** Get the path to the bootstrap directory. */
  bootstrapPath(path?: string): string;

  /** Get the path to the application configuration files. */
  configPath(path?: string): string;

  /** Get the path to the database directory. */
  databasePath(path?: string): string;

  /** Get the path to the language files. */
  langPath(path?: string): string;

  /** Get the path to the public directory. */
  publicPath(path?: string): string;

  /** Get the path to the resources directory. */
  resourcePath(path?: string): string;

  /** Get the path to the storage directory. */
  storagePath(path?: string): string;

  /** Get or check the current application environment. */
  environment(...environments: (UnitEnum | string | PhpArrayLike)[]): string | boolean;

  /** Determine if the application is running in the console. */
  runningInConsole(): boolean;

  /** Determine if the application is running unit tests. */
  runningUnitTests(): boolean;

  /** Determine if the application is running with debug mode enabled. */
  hasDebugModeEnabled(): boolean;

  /** Get an instance of the maintenance mode manager implementation. */
  maintenanceMode(): MaintenanceMode;

  /**
   * Determine if the application is currently down for maintenance.
   * @asyncRoot Cache\Store.get
   */
  isDownForMaintenance(): Promise<boolean>;

  /**
   * Register all of the configured providers.
   * Async because it registers each provider as `register()` does, which may boot it (AD-5).
   * @asyncRoot callback
   */
  registerConfiguredProviders(): Promise<void>;

  /**
   * Register a service provider with the application.
   * Async because it boots the provider when the application is already booted, and a provider's `boot()` may return a Promise (AD-5).
   * @asyncRoot callback
   */
  register(provider: ServiceProvider | ClassString, force?: boolean): Promise<ServiceProvider>;

  /**
   * Register a deferred provider and service.
   * Sync: a deferred provider has a sync `boot()` (AD-5, the spine's Lifecycle).
   */
  registerDeferredProvider(provider: ClassString, service?: string | null): void;

  /** Resolve a service provider instance from the class name. */
  resolveProvider(provider: ClassString): ServiceProvider;

  /**
   * Boot the application's service providers.
   * Runs each provider's `boot()`, which may return a Promise (AD-5).
   * @asyncRoot callback
   */
  boot(): Promise<void>;

  /**
   * Register a new boot listener.
   * The callback is sync: DIV-1 lists no async booting callback (`SyncClosure`).
   */
  booting<F extends (...args: never[]) => unknown>(callback: SyncClosure<F>): void;

  /**
   * Register a new "booted" listener.
   * The callback is sync: DIV-1 lists no async booted callback (`SyncClosure`).
   */
  booted<F extends (...args: never[]) => unknown>(callback: SyncClosure<F>): void;

  /**
   * Run the given array of bootstrap classes.
   * Runs the bootstrappers, which register and boot providers whose `boot()` may return a Promise (AD-5).
   * @asyncRoot callback
   */
  bootstrapWith(bootstrappers: PhpArrayLike): Promise<void>;

  /** Get the current application locale. */
  getLocale(): string;

  /** Get the application namespace. */
  getNamespace(): string;

  /** Get the registered service provider instances if any exist. */
  getProviders(provider: ServiceProvider | ClassString): PhpArrayLike;

  /** Determine if the application has been bootstrapped before. */
  hasBeenBootstrapped(): boolean;

  /**
   * Load and boot all of the remaining deferred providers.
   * Sync: a deferred provider has a sync `boot()` (AD-5, the spine's Lifecycle).
   */
  loadDeferredProviders(): void;

  /** Set the current application locale. */
  setLocale(locale: string): void;

  /** Determine if middleware has been disabled for the application. */
  shouldSkipMiddleware(): boolean;

  /**
   * Register a terminating callback with the application.
   * The callback is sync: DIV-1 lists no async terminating callback (`SyncClosure`).
   */
  terminating<F extends (...args: never[]) => unknown>(callback: SyncClosure<F> | string): Application;

  /**
   * Terminate the application.
   * Sync: its terminating callbacks are sync (DIV-1 lists no async terminating callback).
   */
  terminate(): void;
}

export const Application = contract<Application, typeof ApplicationBrand>(
  "Illuminate\\Contracts\\Foundation\\Application",
  {
    basePath: ["path"],
    boot: [],
    booted: ["callback"],
    booting: ["callback"],
    bootstrapPath: ["path"],
    bootstrapWith: ["bootstrappers"],
    configPath: ["path"],
    databasePath: ["path"],
    environment: ["environments"],
    getLocale: [],
    getNamespace: [],
    getProviders: ["provider"],
    hasBeenBootstrapped: [],
    hasDebugModeEnabled: [],
    isDownForMaintenance: [],
    langPath: ["path"],
    loadDeferredProviders: [],
    maintenanceMode: [],
    publicPath: ["path"],
    register: ["provider", "force"],
    registerConfiguredProviders: [],
    registerDeferredProvider: ["provider", "service"],
    resolveProvider: ["provider"],
    resourcePath: ["path"],
    runningInConsole: [],
    runningUnitTests: [],
    setLocale: ["locale"],
    shouldSkipMiddleware: [],
    storagePath: ["path"],
    terminate: [],
    terminating: ["callback"],
    version: [],
  },
  [Container],
);
