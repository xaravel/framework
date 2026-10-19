// Class-name strings (Story 4.6, ESC-4.6-1 item 9). Internal: not exported.
//
// JS cannot resolve a PHP class-name string to a class. The grader resolves:
//
//   - the exception classes it defines itself (PHP's SPL parents, `Exception`
//     and Mockery's exceptions), for `andThrow('<FQCN>')`;
//   - any other name only through the class-lookup protocol proposed in
//     ESC-4.6-1 item 9: when `globalThis[Symbol.for('xaravel.class.lookup')]`
//     is a function, `lookup(fqcn)` returns the registered class or null
//     (Story 9.4's class registry is to install it). `Container.mock` reads it
//     for class-name strings and `Foo[m]` partials;
//   - an interface name, for the Double port's safe defaults and class-name
//     targets (Story 4.8, ESC-4.8-1 item 1), only through the same lookup:
//     for an interface it returns the contract token, the symbol
//     `Symbol.for(fqcn)` or an AD-1 token object (one with `Symbol.hasInstance`).
//
// The grader's own exception names compare as PHP's do: case-insensitively, a
// leading `\` ignored. The lookup receives the name as written, minus a
// leading `\`; case-folding it is the installer's part of the protocol.
import { BadMethodCallException } from "../Mockery/Exception/BadMethodCallException";
import { InvalidArgumentException } from "../Mockery/Exception/InvalidArgumentException";
import { InvalidCountException } from "../Mockery/Exception/InvalidCountException";
import { InvalidOrderException } from "../Mockery/Exception/InvalidOrderException";
import { NoMatchingExpectationException } from "../Mockery/Exception/NoMatchingExpectationException";
import { RuntimeException } from "../Mockery/Exception/RuntimeException";
import { Exception as CountValidatorException } from "../Mockery/CountValidator/Exception";
import { Exception as MockeryException } from "../Mockery/Exception";
import { BadFunctionCallException } from "../php/BadFunctionCallException";
import { BadMethodCallException as PhpBadMethodCallException } from "../php/BadMethodCallException";
import { Exception as PhpException } from "../php/Exception";
import { InvalidArgumentException as PhpInvalidArgumentException } from "../php/InvalidArgumentException";
import { LogicException } from "../php/LogicException";
import { OutOfBoundsException } from "../php/OutOfBoundsException";
import { RuntimeException as PhpRuntimeException } from "../php/RuntimeException";
import { UnexpectedValueException } from "../php/UnexpectedValueException";
import { classNameOf } from "./values";

const LOOKUP = Symbol.for("xaravel.class.lookup");

type AnyClass = abstract new (...args: never[]) => object;

let exceptionClasses: ReadonlyMap<string, AnyClass> | null = null;

function normalise(name: string): string {
  return name.replace(/^\\/, "").toLowerCase();
}

/** The grader's own exception class named `name`, or null. */
export function graderExceptionClass(name: string): AnyClass | null {
  exceptionClasses ??= new Map(
    [
      BadFunctionCallException,
      BadMethodCallException,
      CountValidatorException,
      InvalidArgumentException,
      InvalidCountException,
      InvalidOrderException,
      LogicException,
      MockeryException,
      NoMatchingExpectationException,
      OutOfBoundsException,
      PhpBadMethodCallException,
      PhpException,
      PhpInvalidArgumentException,
      PhpRuntimeException,
      RuntimeException,
      UnexpectedValueException,
    ].map((ctor): [string, AnyClass] => [normalise(classNameOf(ctor) ?? ""), ctor]),
  );
  return exceptionClasses.get(normalise(name)) ?? null;
}

/** The class registered for `name` through the class-lookup protocol, or null when none is (or no lookup is installed). */
export function lookupClass(name: string): AnyClass | null {
  const lookup: unknown = (globalThis as Record<symbol, unknown>)[LOOKUP];
  if (typeof lookup !== "function") {
    return null;
  }
  const found: unknown = (lookup as (name: string) => unknown)(name.replace(/^\\/, ""));
  return typeof found === "function" && typeof (found as { prototype?: unknown }).prototype === "object" ? (found as AnyClass) : null;
}

/** The contract token registered for `name` through the class-lookup protocol (a symbol or an AD-1 token object), or null. */
export function lookupContract(name: string): symbol | object | null {
  const lookup: unknown = (globalThis as Record<symbol, unknown>)[LOOKUP];
  if (typeof lookup !== "function") {
    return null;
  }
  const found: unknown = (lookup as (name: string) => unknown)(name.replace(/^\\/, ""));
  if (typeof found === "symbol") {
    return found;
  }
  return typeof found === "object" && found !== null && typeof (found as { [Symbol.hasInstance]?: unknown })[Symbol.hasInstance] === "function" ? found : null;
}
