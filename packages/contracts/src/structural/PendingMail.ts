// Illuminate\Mail\PendingMail, as a contract names it (AD-1.2): a subset of its public methods. It leaves out the
// sending methods (`send`, `sendNow`, `queue`, `later`), which reach the mail transport or the queue (AD-6) and which
// the later `@xaravel/mail` port declares.

/** A mail message being addressed before it is sent. */
export interface PendingMail {
  /** Set the locale of the message. */
  locale(locale: string): this;

  /** Set the recipients of the message. */
  to(users: unknown): this;

  /** Set the recipients of the message. */
  cc(users: unknown): this;

  /** Set the recipients of the message. */
  bcc(users: unknown): this;
}
