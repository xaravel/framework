// `Dotenv\Parser\Entry` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { Option } from "../../PhpOption/Option";
import type { Value } from "./Value";

/** A parsed entry: a name and, unless it is cleared, a value. */
export class Entry {
  /** The entry name. */
  private readonly name: string;

  /** The entry value. */
  private readonly value: Value | null;

  /** Create a new entry instance. */
  constructor(name: string, value: Value | null = null) {
    this.name = name;
    this.value = value;
  }

  /** Get the entry name. */
  getName(): string {
    return this.name;
  }

  /** Get the entry value. */
  getValue(): Option<Value> {
    return Option.fromValue(this.value) as Option<Value>;
  }
}

registerClass("Dotenv\\Parser\\Entry", Entry);
