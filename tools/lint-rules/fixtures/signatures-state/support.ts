// Story 6.3 fixture support: stand-ins for a thenable `Builder`, `registerClass`,
// `inject`, contract tokens, `Model`, and Pest-style `uses` / `test`, so the
// fixtures beside it typecheck and lint without the framework packages. Lints
// clean at every placement.

/** A thenable query builder, as AD-6 makes Builders, Relations and `PendingRequest`: awaiting one runs `get()`. */
export class Builder implements PromiseLike<readonly string[]> {
  get(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  then<TResult1 = readonly string[], TResult2 = never>(
    onfulfilled?: ((value: readonly string[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.get().then(onfulfilled, onrejected);
  }
}

const registry = new Map<string, object>();

/** The Class Registry stand-in (AD-10). */
export function registerClass(fqcn: string, value: object): void {
  registry.set(fqcn, value);
}

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

export interface QueueShape {
  push(job: string): void;
}

export type Mailer = MailerShape;
export const Mailer: Contract<MailerShape> = contract<MailerShape>("mailer");
export type Queue = QueueShape;
export const Queue: Contract<QueueShape> = contract<QueueShape>("queue");

type Constructor = abstract new (...args: never[]) => unknown;

/** A TC39 class decorator recording the injection map (AD-4). */
export function inject(map: Readonly<Record<string, Contract<unknown>>>): (value: Constructor, context: ClassDecoratorContext) => void {
  return (_value, context) => {
    context.metadata["inject"] = map;
  };
}

/** The Eloquent `Model` stand-in. */
export class Model {
  readonly exists: boolean = false;
}

/** The Pest-style test case and functions (AD-25). */
export class TestCase {
  readonly name: string = "test";
}

const cases: TestCase[] = [];

export function uses(testCase: typeof TestCase): void {
  cases.push(new testCase());
}

export function test(name: string, body: (this: TestCase) => unknown): void {
  const testCase = cases[0] ?? new TestCase();
  if (name !== "") {
    body.call(testCase);
  }
}
