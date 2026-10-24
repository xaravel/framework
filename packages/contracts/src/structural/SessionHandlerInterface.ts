// PHP's built-in `SessionHandlerInterface`, as a contract names it (AD-1.2): its six methods. A session handler is
// AD-6's session-handler root: `read`, `write`, `destroy` and `gc` reach its storage and are async, each its own root;
// `open` and `close` stay sync, as no Upstream handler does IO in them.

/** PHP's `SessionHandlerInterface`: a session storage driver. */
export interface SessionHandlerInterface {
  /** Initialize the session. */
  open(path: string, name: string): boolean;

  /** Close the session. */
  close(): boolean;

  /**
   * Read the session data.
   * @asyncRoot SessionHandlerInterface.read
   */
  read(id: string): Promise<string | false>;

  /**
   * Write the session data.
   * @asyncRoot SessionHandlerInterface.write
   */
  write(id: string, data: string): Promise<boolean>;

  /**
   * Destroy a session.
   * @asyncRoot SessionHandlerInterface.destroy
   */
  destroy(id: string): Promise<boolean>;

  /**
   * Clean up old sessions.
   * @asyncRoot SessionHandlerInterface.gc
   */
  gc(maxLifetime: number): Promise<number | false>;
}
