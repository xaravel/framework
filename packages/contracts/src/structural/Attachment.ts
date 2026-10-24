// Illuminate\Mail\Attachment, as a contract names it (AD-1.2): a subset of its public methods. It leaves out the
// `as` method and property pair (DIV-12.2) and the static constructors, which the later `@xaravel/mail` port declares.
import type { Closure } from "./Closure";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A mail attachment. */
export interface Attachment {
  /** Set the attached file's mime type. */
  withMime(mime: string): this;

  /** Attach the attachment with the given strategies. */
  attachWith(pathStrategy: Closure, dataStrategy: Closure): unknown;

  /** Attach the attachment to a built-in mail type. */
  attachTo(mail: unknown, options?: PhpArrayLike): unknown;

  /** Determine if the given attachment is equivalent to this attachment. */
  isEquivalent(attachment: Attachment, options?: PhpArrayLike): boolean;
}
