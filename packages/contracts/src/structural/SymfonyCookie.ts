// Symfony\Component\HttpFoundation\Cookie, as a contract names it (AD-1.2): a subset of its documented public
// methods. Named for its vendor, as `SymfonyRequest` is.

/** An HTTP cookie. */
export interface SymfonyCookie {
  /** Gets the name of the cookie. */
  getName(): string;

  /** Gets the value of the cookie. */
  getValue(): string | null;

  /** Gets the domain that the cookie is available to. */
  getDomain(): string | null;

  /** Gets the time the cookie expires. */
  getExpiresTime(): number;

  /** Gets the path on the server in which the cookie will be available on. */
  getPath(): string;

  /** Checks whether the cookie should only be transmitted over a secure HTTPS connection from the client. */
  isSecure(): boolean;

  /** Checks whether the cookie will be made accessible only through the HTTP protocol. */
  isHttpOnly(): boolean;

  /** Whether this cookie is about to be cleared. */
  isCleared(): boolean;

  /** Checks if the cookie value should be sent with no url encoding. */
  isRaw(): boolean;

  /** Gets the SameSite attribute of the cookie. */
  getSameSite(): string | null;
}
