// Story 6.2 fixture: fails `xaravel/no-type-import-injection` only, at any placement.
import { inject } from "./support";
import type { Mailer } from "./support";

@inject({
  // @ts-expect-error TS1361: the rule reports the misuse tsc also reports.
  mailer: Mailer,
})
export class Notifier {
  constructor(readonly mailer: Mailer | null = null) {}
}
