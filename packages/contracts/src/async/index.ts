// `@xaravel/contracts/async`: the Xaravel-only async seam (AD-6, AD-27). `THENABLE_TYPES` is the list of thenable
// framework types, which `bun run async-surface`'s `thenableTypes()` prefers when `@xaravel/contracts/async` resolves
// from its root (resolution from the repository root waits on ESC-10.5-2), and `NotPromise<T>` types the callbacks of
// sync APIs.
// Every framework class with an instance `then` declares `implements PromiseLike<…>` (ESC-6.1-1).

/**
 * The Upstream FQCNs of the thenable types: the Query and Eloquent Builders, the Relation classes, the `Pending*`
 * builders and the Pipeline contract and class. Awaiting one runs its terminal (AD-6). A pipeline keeps Upstream's
 * `then(destination)`, so it is a declared thenable, as is `PendingClosureDispatch` (ESC-10.2-2).
 */
export const THENABLE_TYPES: readonly string[] = Object.freeze([
  "Illuminate\\Database\\Query\\Builder",
  "Illuminate\\Database\\Eloquent\\Builder",
  "Illuminate\\Database\\Eloquent\\Relations\\Relation",
  "Illuminate\\Database\\Eloquent\\Relations\\BelongsTo",
  "Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasManyThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOne",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneOrMany",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneOrManyThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\HasOneThrough",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphMany",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphOne",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphOneOrMany",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphTo",
  "Illuminate\\Database\\Eloquent\\Relations\\MorphToMany",
  "Illuminate\\Http\\Client\\PendingRequest",
  "Illuminate\\Foundation\\Bus\\PendingDispatch",
  "Illuminate\\Foundation\\Bus\\PendingClosureDispatch",
  "Illuminate\\Foundation\\Bus\\PendingChain",
  "Illuminate\\Bus\\PendingBatch",
  "Illuminate\\Broadcasting\\PendingBroadcast",
  "Illuminate\\Testing\\PendingCommand",
  "Laravel\\Mcp\\Server\\Testing\\PendingTestResponse",
  "Illuminate\\Contracts\\Pipeline\\Pipeline",
  "Illuminate\\Pipeline\\Pipeline",
]);

/**
 * `T` unless it is a Promise or another thenable, which gives `never`. Sync APIs type their callbacks' results with it
 * (`map(fn: () => NotPromise<U>)`), so an async callback does not compile (AD-6). It distributes over a union:
 * `NotPromise<number | Promise<number>>` is `number`. `NotPromise<any>` is `any`, so an `any`-typed callback is not
 * caught by the type; lint's no-misused-promises covers it.
 */
export type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;
