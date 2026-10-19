// The thenable types (AD-6): awaiting one runs its terminal, so an `async`
// function must not return one unawaited. Story 6.3's
// `xaravel/no-async-thenable-return` rule matches them by short name; Story
// 6.4's `async-surface` tool uses this list as its fixture list until
// `@xaravel/contracts/async` (Story 10.5) supplies it.

/** The Upstream FQCNs of the thenable types: the Query and Eloquent Builders, the Relation classes and the `Pending*` builders. */
export const THENABLE_TYPES: readonly string[] = [
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
];

/** The short class names of `THENABLE_TYPES` (the last `\` segment), as TypeScript names them. */
export const THENABLE_NAMES: ReadonlySet<string> = new Set(THENABLE_TYPES.map((fqcn) => fqcn.slice(fqcn.lastIndexOf("\\") + 1)));
