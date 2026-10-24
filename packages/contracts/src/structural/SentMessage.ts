// Illuminate\Mail\SentMessage, as a contract names it (AD-1.2): its one declared public method (the rest forward to
// Symfony's sent message through `__call`, which AD-26 ports as generated delegating methods).

/** A message the mailer sent. */
export interface SentMessage {
  /** Get the underlying Symfony Email instance. */
  getSymfonySentMessage(): unknown;
}
