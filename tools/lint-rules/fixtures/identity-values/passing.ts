// Story 6.2 fixture: the near-misses done right; lints clean at every
// placement, including as `packages/database/src/Eloquent/Model.ts`.
import { fqcn, inject, jsonEncode, Mailer } from "./support";
import type { MailerShape } from "./support";

/** A Symbol slot, which the Model Proxy reaches, in place of `#private`. */
export const MODEL_STATE: unique symbol = Symbol("xaravel.model.state");

@inject({ mailer: Mailer })
export class Notifier {
  [MODEL_STATE]: Map<string, unknown> = new Map();
  readonly mailer: MailerShape | null;

  constructor(mailer: MailerShape | null = null) {
    this.mailer = mailer;
  }

  identity(): string {
    return fqcn(this);
  }

  encode(): string {
    return jsonEncode(this[MODEL_STATE].get("payload") ?? null);
  }
}

/** A parameter called `constructor` is not `<expr>.constructor`. */
export function describe(constructor: { readonly name: string }): string {
  return constructor.name;
}

export { Notifier as DefaultNotifier };
