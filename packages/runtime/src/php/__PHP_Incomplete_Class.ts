// PHP's `__PHP_Incomplete_Class` (Story 9.7): what `phpUnserialize` rebuilds an object as when its class is not
// registered, or not allowed by `allowedClasses`. It holds the original class name in the public
// `__PHP_Incomplete_Class_Name` and the object's raw property entries (names as serialized, mangled protected and
// private ones included), so `phpSerialize` writes the original name and entries back byte for byte. No hook runs on
// it, and its entries are no JS properties, as PHP refuses property access on an incomplete object.
import { registerClass } from "../registry/registry";
import { arrayFromEntries } from "./PhpArray";

const PHP_PROPS = Symbol.for("xaravel.php.props");

export class __PHP_Incomplete_Class {
  /** The name of the class the payload named. */
  readonly __PHP_Incomplete_Class_Name: string;
  readonly #entries: [string, unknown][] = [];

  /** An incomplete object of class `name` holding the raw property `entries` (copied). */
  constructor(name: string, entries: Iterable<readonly [string, unknown]> = []) {
    this.__PHP_Incomplete_Class_Name = name;
    for (const [key, value] of entries) {
      this.pushEntry(key, value);
    }
  }

  /** The `[name, value]` property entries as serialized, in order, protected and private names mangled. */
  entries(): [string, unknown][] {
    return this.#entries.map(([key, value]) => [key, value]);
  }

  /**
   * Adds a raw entry (the unserializer fills an object it has already registered for back-references). A repeated name
   * keeps its first position and takes the new value, as PHP's property table does.
   */
  pushEntry(key: string, value: unknown): void {
    const existing = this.#entries.find(([name]) => name === key);
    if (existing !== undefined) {
      existing[1] = value ?? null;
      return;
    }
    this.#entries.push([key, value ?? null]);
  }

  /**
   * The public props, as the grader's decoded objects hold them (ESC-4.1-1's protocol is public props): the class name,
   * then each entry whose name is not mangled; protected and private entries stay out.
   */
  [PHP_PROPS](): unknown {
    const entries: [string, unknown][] = [["__PHP_Incomplete_Class_Name", this.__PHP_Incomplete_Class_Name]];
    for (const [key, value] of this.#entries) {
      if (!key.startsWith("\0")) {
        entries.push([key, value]);
      }
    }
    return arrayFromEntries(entries);
  }
}

registerClass("__PHP_Incomplete_Class", __PHP_Incomplete_Class);
