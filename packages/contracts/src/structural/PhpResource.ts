// PHP's stream `resource`, as `Illuminate\Contracts\Filesystem\Filesystem` reads and writes it: in Xaravel, an async
// byte stream. A pseudo-type, not a class, so it is a `type`.

/** A PHP stream resource: an async iterable of byte chunks. */
export type PhpResource = AsyncIterable<Uint8Array>;
