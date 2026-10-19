// Story 6.3 fixture: fails `xaravel/no-inject-param-mismatch` only, at any placement.
import { inject, Mailer, Queue } from "./support";
import type { MailerShape, QueueShape } from "./support";

@inject({ queue: Queue, mailer: Mailer })
export class Notifier {
  constructor(
    readonly mailer: MailerShape,
    readonly queue: QueueShape,
  ) {}
}
