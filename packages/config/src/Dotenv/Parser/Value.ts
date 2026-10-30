// `Dotenv\Parser\Value` (vlucas/phpdotenv v5.7.0), ported line for line. Variable locations are character offsets
// (`Str::len`, mbstring over UTF-8).
import { Ref, registerClass } from "@xaravel/runtime";
import { array_merge, rsort, Error as PhpError } from "@xaravel/runtime/php";
import { Str } from "../Util/Str";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Value");

/** A parsed value: its characters and the locations of the variables in it. */
export class Value {
  /** The string representation of the parsed value. */
  private readonly chars: string;

  /** The locations of the variables in the value. */
  private readonly vars: readonly number[];

  /** Internal constructor for a value. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE, chars: string, vars: readonly number[]) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Parser\\Value::__construct() from global scope");
    }
    this.chars = chars;
    this.vars = vars;
  }

  /** Create an empty value instance. */
  static blank(): Value {
    return new Value(CREATE, "", []);
  }

  /** Create a new value instance. */
  static create(chars: string, vars: readonly number[]): Value {
    return new Value(CREATE, chars, vars);
  }

  /** Create a new value instance, appending the characters. */
  append(chars: string, variable: boolean): Value {
    return new Value(CREATE,
      this.chars + chars,
      variable ? (array_merge(this.vars, [Str.len(this.chars)]) as number[]) : this.vars,
    );
  }

  /** Get the string representation of the parsed value. */
  getChars(): string {
    return this.chars;
  }

  /** Get the locations of the variables in the value. */
  getVars(): number[] {
    const vars = new Ref<unknown>([...this.vars]);

    rsort(vars);

    return vars.value as number[];
  }
}

registerClass("Dotenv\\Parser\\Value", Value);
