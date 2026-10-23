// Symfony\Component\HttpFoundation\Response, as a contract names it (AD-1.2): a subset of its documented public
// methods.

/** An HTTP response. */
export interface Response {
  /** Retrieves the status code for the current web response. */
  getStatusCode(): number;

  /** Sets the response status code; a null text is the status code's default reason phrase. */
  setStatusCode(code: number, text?: string | null): this;

  /** Gets the current response content. */
  getContent(): string | false;

  /** Sets the response content. */
  setContent(content: string | null): this;
}
