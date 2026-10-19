// Story 6.3 fixture: the near-misses done right; lints clean at every placement.
import { Builder, inject, Mailer, Model, Queue, registerClass } from "./support";
import type { MailerShape, QueueShape } from "./support";

export interface Value {
  readonly v: number;
}

/** AD-6: overloads, callback parameters and non-public members may mention `T | Promise<T>`. */
export class Store {
  get(): Value;
  get(key: string): Value;
  get(key?: string): Value | Promise<Value> {
    return key === undefined ? this.load() : { v: key.length };
  }

  run(callback: () => Value | Promise<Value>): void {
    this.queue.push(callback);
  }

  async fetch(): Promise<Value> {
    return { v: this.queue.length };
  }

  protected load(): Value | Promise<Value> {
    return local();
  }

  private readonly queue: (() => Value | Promise<Value>)[] = [];
}

function local(): Value {
  return { v: 0 };
}

/** AD-6: an async function awaits its thenable, or returns a plain Promise. */
export class Repository {
  async find(): Promise<readonly string[]> {
    return await new Builder().get();
  }

  async rows(): Promise<readonly string[]> {
    const builder = new Builder();
    return builder.get();
  }

  query(): Builder {
    return new Builder();
  }
}

/** AD-5: a singleton writes its fields in the constructor and initialisers, and boot-only state in its writers. */
export class Router {
  current: string | null = null;
  groupStack: string[][] = [];
  readonly routes: string[];

  constructor() {
    this.routes = [];
    this.current = "";
  }

  group(attributes: string[]): void {
    this.groupStack.push(attributes);
  }

  updateGroupStack(attributes: string[]): void {
    this.groupStack = [...this.groupStack, attributes];
  }

  dispatch(request: string): string {
    return `${this.current ?? ""}${request}`;
  }
}

registerClass("Illuminate\\Routing\\Router", Router);

/** AD-5: a class that is not a singleton may write its fields anywhere. */
export class Counter {
  count = 0;

  increment(): void {
    this.count++;
  }
}

registerClass("App\\Counter", Counter);

/** AD-4: key names and order are the parameter names in order. */
@inject({ mailer: Mailer, queue: Queue })
export class Notifier {
  constructor(
    readonly mailer: MailerShape,
    readonly queue: QueueShape = { push: () => undefined },
  ) {}
}

/** AD-7: constant column defaults, and the Model config fields, which may hold any value. */
export class Post extends Model {
  declare id: number;
  status = "draft";
  views = -1;
  published = !0;
  tags = ["a", `b`] as const;
  meta = { rank: 1, nested: { on: true } } satisfies Record<string, unknown>;
  note: string | null = null;
  casts = { publishedAt: "datetime", now: Date.now() };
  static booted = new Date();
}
