// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\ReturnValueGenerator` (Story 9.11; ESC-4.7-1 item 2, DIV-6.4):
// the value of an unconfigured call, by the declared return type a signature row gives (Generator/Signature.ts).
// Internal to the grader.
//
// `generate` follows PHPUnit's order: a type list that holds `''`, `null`, `mixed` or `void` gives `null`; then
// `true`; `false` or `bool`; `float` gives `0` and `int` gives `0` (a plain number: the grader cannot make the
// runtime's float marker, AD-2, so a generated float reads as an int; DIV-9.4); `string` gives `''`; `array` gives
// `[]`; `static` gives a new double of the same class that shares its configurable methods; `object` gives the
// runtime's `stdClass` (from `Symbol.for('xaravel.php.classes')`); `callable` or `Closure` an empty function that
// returns `null`; `Traversable`, `Generator` or `iterable` an empty generator; a single class name gives a stub of
// it (the declaring class and the double's target resolve directly, any other name through
// `Symbol.for('xaravel.class.lookup')`). Anything else throws PHPUnit's `MockObject\RuntimeException`. No surface
// row declares an intersection, so intersection doubles are not built.
import { phpClass } from "../../Exception/RuntimeExceptionParent";
import { RuntimeException } from "../Exception/RuntimeException";
import { hasClassLookup, lookupClass } from "../Generator/Signature";

/** What the generator needs from the Generator that made the double. */
export interface DoubleFactory {
  /** A new double of `object`'s class that shares its configurable methods (`static`). */
  newInstanceOf(object: object): object;
  /** `createStub(type)`. */
  testDoubleFor(type: unknown): object;
  /** The classes a name resolves to without the lookup (the declaring class, the target), by lower-case name. */
  readonly known: ReadonlyMap<string, unknown>;
}

function cannotBeGenerated(className: string, methodName: string, reason: string): RuntimeException {
  return new RuntimeException(`Return value for ${className}::${methodName}() cannot be generated${reason}, please configure a return value for this method`);
}

function cannotBeBuilt(className: string, methodName: string, reason: string): RuntimeException {
  return new RuntimeException(`Return value for ${className}::${methodName}() cannot be generated: ${reason}`);
}

export class ReturnValueGenerator {
  readonly #factory: DoubleFactory;

  constructor(factory: DoubleFactory) {
    this.#factory = factory;
  }

  generate(className: string, methodName: string, object: object, returnType: string): unknown {
    let intersection = false;
    let union = false;
    let types: string[];
    if (returnType.includes("|")) {
      union = true;
      types = returnType.split("|").map((type) => (type.startsWith("(") && type.endsWith(")") ? type.slice(1, -1) : type));
    } else if (returnType.includes("&")) {
      intersection = true;
      types = returnType.split("&");
    } else {
      types = [returnType];
    }
    if (!intersection) {
      const lower = new Set(types.map((type) => type.toLowerCase()));
      if (lower.has("") || lower.has("null") || lower.has("mixed") || lower.has("void")) {
        return null;
      }
      if (lower.has("true")) {
        return true;
      }
      if (lower.has("false") || lower.has("bool")) {
        return false;
      }
      if (lower.has("float") || lower.has("int")) {
        return 0;
      }
      if (lower.has("string")) {
        return "";
      }
      if (lower.has("array")) {
        return [];
      }
      if (lower.has("static")) {
        return this.#newInstanceOf(object, className, methodName);
      }
      if (lower.has("object")) {
        const stdClass = phpClass("stdClass");
        if (stdClass !== null) {
          return new (stdClass as unknown as new () => object)();
        }
      } else {
        if (lower.has("callable") || lower.has("closure")) {
          return function (): null {
            return null;
          };
        }
        if (lower.has("traversable") || lower.has("generator") || lower.has("iterable")) {
          return (function* (): Generator<never, void, unknown> {})();
        }
        if (!union) {
          return this.#testDoubleFor(types[0]!, className, methodName);
        }
      }
    }
    // A union or intersection of interfaces would be an intersection double here; no surface row declares one.
    const reason = union ? " because the declared return type is a union" : intersection ? " because the declared return type is an intersection" : "";
    throw cannotBeGenerated(className, methodName, reason);
  }

  #newInstanceOf(object: object, className: string, methodName: string): object {
    try {
      return this.#factory.newInstanceOf(object);
    } catch (error) {
      throw cannotBeBuilt(className, methodName, error instanceof Error ? error.message : String(error));
    }
  }

  #testDoubleFor(name: string, className: string, methodName: string): object {
    const bare = name.replace(/^\\/, "");
    let type: unknown = this.#factory.known.get(bare.toLowerCase()) ?? null;
    if (type === null) {
      if (!hasClassLookup()) {
        throw cannotBeBuilt(className, methodName, `the class "${bare}" cannot be resolved: Symbol.for('xaravel.class.lookup') is not installed`);
      }
      type = lookupClass(bare);
      if (type === null) {
        throw cannotBeBuilt(className, methodName, `Symbol.for('xaravel.class.lookup') does not resolve the class "${bare}"`);
      }
    }
    try {
      return this.#factory.testDoubleFor(type);
    } catch (error) {
      throw cannotBeBuilt(className, methodName, error instanceof Error ? error.message : String(error));
    }
  }
}
