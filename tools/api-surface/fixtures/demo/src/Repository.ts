// Story 6.5 fixture: the Xaravel side of the API-surface diff's I/O matrix
// (tools/api-surface/fixtures/demo.jsonl is the Upstream side). Each member's
// comment names the finding the diff gives it.

/** Stands in for `@xaravel/runtime/registry`'s `registerClass` (never run). */
declare function registerClass(fqcn: string, value: object): void;

/** `pull()`'s options object, by interface name (AD-26). */
export interface PullOptions {
  ttl?: number;
  strict?: boolean;
}

/** The repository. */
export class Repository {
  /** Upstream constant `LIMIT`: a static property, matched. */
  static readonly LIMIT = 10;

  /** Upstream `cache_key` (`?string`): camelCase, matched. */
  cacheKey: string | null = null;

  /** Upstream `?string $label`: mismatch, not nullable. */
  label = "";

  /** Upstream method `resolver($name)`: a function-typed field, matched. */
  resolver: (name: string) => string = (name) => name;

  /** Upstream `__construct(array $config = [])`: `[]` matches `{}`, matched. */
  constructor(config: Record<string, unknown> = {}) {
    this.cacheKey = Object.keys(config)[0] ?? null;
  }

  /** Upstream `get(string $key, $default = null)`: `default` is reserved, so it takes its decided name `defaultValue`; matched. */
  get(key: string, defaultValue: unknown = null): unknown {
    return key === "" ? defaultValue : key;
  }

  /** Upstream `touch(string $key, $seconds)`: mismatch, parameter name. */
  touch(key: string, ttl: unknown): string {
    return `${key}${String(ttl)}`;
  }

  /** Upstream `remember($key, int $minutes = 60)`: mismatch, default. */
  remember(key: string, minutes = 30): string {
    return `${key}${minutes}`;
  }

  /** Upstream `tag(?string $name)`: mismatch, nullability. */
  tag(name: string): string {
    return name;
  }

  /** Upstream `many(array $keys, int $ttl = 1, bool $strict = false)`: the positional and the options form (AD-26), matched. */
  many(keys: string[], ttl?: number, strict?: boolean): string[];
  many(keys: string[], options?: { ttl?: number; strict?: boolean }): string[];
  many(keys: string[], ttl: number | { ttl?: number; strict?: boolean } = 1, strict = false): string[] {
    const options = typeof ttl === "number" ? { ttl, strict } : ttl;
    return options.strict === true ? keys.slice(0, options.ttl ?? 1) : keys;
  }

  /** Upstream `pull(string $key, int $ttl = 1, bool $strict = false)`: positional, and the options form through a named interface (never a union, AD-26), matched. */
  pull(key: string, ttl?: number, strict?: boolean): string;
  pull(key: string, options?: PullOptions): string;
  pull(key: string, ttl: number | PullOptions | null = 1, strict = false): string {
    const options = typeof ttl === "number" ? { ttl, strict } : ttl;
    return options === null ? key : `${key}${options.ttl ?? 0}`;
  }

  /** Overloads: the first fails, the second passes; matched. */
  value(key: string, fallback: string, extra: string): string;
  value(key: string): string;
  value(key: string, fallback?: string, extra?: string): string {
    return fallback ?? extra ?? key;
  }

  /** Upstream `get_id(): int`: camelCase, matched. */
  getId(): number {
    return 1;
  }

  /** Upstream `__toString(): string`: matched. */
  toString(): string {
    return "repository";
  }

  /** Upstream `getURL()`: renamed. */
  getUrl(): string {
    return "/";
  }

  /** Upstream `find($key)`: mismatch, returns undefined (AD-9). */
  find(key: string): string | undefined {
    return key === "" ? undefined : key;
  }

  /** Upstream `size(): ?int`: nullability through the Promise, matched. */
  size(): Promise<number | null> {
    return Promise.resolve(null);
  }

  /** Upstream `tags(string ...$names)`: variadic ↔ rest, matched. */
  tags(...names: string[]): string[] {
    return names;
  }

  /** Upstream static `flush(): void`: matched. */
  static flush(): void {}

  /** No Upstream counterpart: extra (explained by additions.jsonl). */
  extraHelper(): void {}

  #secret = 0;
  private hidden = 1;

  /** Not public: never compared. */
  protected peek(): number {
    return this.#secret + this.hidden;
  }
}

registerClass("Demo\\Repository", Repository);
