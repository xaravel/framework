// Symfony\Component\HttpFoundation\Request, as a contract names it (AD-1.2): a subset of its documented public
// methods. Named for its vendor, `Request` being Illuminate's.

/** An HTTP request, as Symfony's HttpFoundation models it. */
export interface SymfonyRequest {
  /** Gets the request "intended" method. */
  getMethod(): string;

  /** Returns the path being requested relative to the executed script. */
  getPathInfo(): string;

  /** Generates a normalized URI (URL) for the Request. */
  getUri(): string;

  /** Returns the host name. */
  getHost(): string;

  /** Checks whether the request is secure or not. */
  isSecure(): boolean;
}
