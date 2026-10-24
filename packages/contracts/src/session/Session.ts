// Illuminate\Contracts\Session\Session, from laravel/framework v13.37.0.
// The session data is loaded once, by `start()` (AD-6, loaded-once), so its reads and writes stay sync; only
// `start`, `save`, `invalidate`, `regenerate` and `migrate` reach the session handler. Upstream's `$default` is
// `defaultValue`, `default` being a reserved word.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Request } from "../structural/Request";
import type { SessionHandlerInterface } from "../structural/SessionHandlerInterface";

declare const SessionBrand: unique symbol;

export interface Session {
  readonly [Session.brand]: true;

  /** Get the name of the session. */
  getName(): string;

  /** Set the name of the session. */
  setName(name: string): void;

  /** Get the current session ID. */
  getId(): string;

  /** Set the session ID. */
  setId(id: string): void;

  /**
   * Start the session, reading the data from a handler.
   * @asyncRoot SessionHandlerInterface.read
   */
  start(): Promise<boolean>;

  /**
   * Save the session data to storage.
   * @asyncRoot SessionHandlerInterface.write
   */
  save(): Promise<void>;

  /** Get all of the session data. */
  all(): PhpArrayLike;

  /** Checks if a key exists. */
  exists(key: PhpArrayLike | string): boolean;

  /** Checks if a key is present and not null. */
  has(key: PhpArrayLike | string): boolean;

  /** Get an item from the session. */
  get(key: string, defaultValue?: unknown): unknown;

  /** Get the value of a given key and then forget it. */
  pull(key: string, defaultValue?: unknown): unknown;

  /** Put a key / value pair or array of key / value pairs in the session. */
  put(key: PhpArrayLike | string, value?: unknown): void;

  /** Flash a key / value pair to the session. */
  flash(key: string, value?: unknown): void;

  /** Get the CSRF token value. */
  token(): string;

  /** Regenerate the CSRF token value. */
  regenerateToken(): void;

  /** Remove an item from the session, returning its value. */
  remove(key: string): unknown;

  /** Remove one or many items from the session. */
  forget(keys: PhpArrayLike | string): void;

  /** Remove all of the items from the session. */
  flush(): void;

  /**
   * Flush the session data and regenerate the ID.
   * Destroys the old session through the handler.
   * @asyncRoot SessionHandlerInterface.destroy
   */
  invalidate(): Promise<boolean>;

  /**
   * Generate a new session identifier.
   * Destroys the old session through the handler when `destroy` is true.
   * @asyncRoot SessionHandlerInterface.destroy
   */
  regenerate(destroy?: boolean): Promise<boolean>;

  /**
   * Generate a new session ID for the session.
   * Destroys the old session through the handler when `destroy` is true.
   * @asyncRoot SessionHandlerInterface.destroy
   */
  migrate(destroy?: boolean): Promise<boolean>;

  /** Determine if the session has been started. */
  isStarted(): boolean;

  /** Get the previous URL from the session. */
  previousUrl(): string | null;

  /** Set the "previous" URL in the session. */
  setPreviousUrl(url: string): void;

  /** Get the session handler instance. */
  getHandler(): SessionHandlerInterface;

  /** Determine if the session handler needs a request. */
  handlerNeedsRequest(): boolean;

  /** Set the request on the handler instance. */
  setRequestOnHandler(request: Request): void;
}

export const Session = contract<Session, typeof SessionBrand>(
  "Illuminate\\Contracts\\Session\\Session",
  {
    all: [],
    exists: ["key"],
    flash: ["key", "value"],
    flush: [],
    forget: ["keys"],
    get: ["key", "default"],
    getHandler: [],
    getId: [],
    getName: [],
    handlerNeedsRequest: [],
    has: ["key"],
    invalidate: [],
    isStarted: [],
    migrate: ["destroy"],
    previousUrl: [],
    pull: ["key", "default"],
    put: ["key", "value"],
    regenerate: ["destroy"],
    regenerateToken: [],
    remove: ["key"],
    save: [],
    setId: ["id"],
    setName: ["name"],
    setPreviousUrl: ["url"],
    setRequestOnHandler: ["request"],
    start: [],
    token: [],
  },
);
