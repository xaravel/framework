// Story 6.2 fixture support: stand-ins for `inject`, `fqcn`, `jsonEncode` and a
// contract token, so the fixtures beside it typecheck and lint without the
// framework packages. Lints clean at every placement.

/** A contract token: a value, with a type of the same name. */
export interface Contract<T> {
  readonly id: symbol;
  readonly shape: T | null;
}

export function contract<T>(id: string): Contract<T> {
  return { id: Symbol(id), shape: null };
}

export interface MailerShape {
  send(to: string): void;
}

export type Mailer = MailerShape;
export const Mailer: Contract<MailerShape> = contract<MailerShape>("mailer");

type Constructor = abstract new (...args: never[]) => unknown;

/** A TC39 class decorator recording the injection map. */
export function inject(map: Readonly<Record<string, Contract<unknown>>>): (value: Constructor, context: ClassDecoratorContext) => void {
  return (_value, context) => {
    context.metadata["inject"] = map;
  };
}

export function fqcn(value: object): string {
  return Object.prototype.toString.call(value);
}

export function jsonEncode(value: unknown): string {
  return String(value);
}
