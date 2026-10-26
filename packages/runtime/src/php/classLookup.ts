// The class and interface name lookup (ESC-13.1-9). Loading this module defines
// `globalThis[Symbol.for('xaravel.class.lookup')]`: a function from a PHP class or interface name (case-insensitive, a
// leading `\` ignored) to what it names, the Registry's `lookUpName`: a registered class (a test class up the active
// frame chain first, then the base), else a recorded contract token (ESC-13.1-7), else null. The grader reads it
// without importing the runtime, so `assertInstanceOf` takes a class-string as PHPUnit does. The property follows
// `Symbol.for('xaravel.php.classes')`'s rules (`phpClasses.ts`) except that it is writable and configurable, so a
// grader fixture can layer its own stand-in over it and restore it (MAINT-2026-10-25 second ruling, Amendment 2); it
// stays non-enumerable; loading throws PHP's `LogicException` when the symbol is already defined with another value; and
// `XARAVEL_NO_SCOPE_GLOBAL=1`, read once at load, skips the install. Every package entry imports this module right
// after `phpClasses`.
import { lookUpName } from "../registry/registry";
import { LogicException } from "./LogicException";

const CLASS_LOOKUP = Symbol.for("xaravel.class.lookup");

function installGlobal(): void {
  if (process.env["XARAVEL_NO_SCOPE_GLOBAL"] === "1") {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, CLASS_LOOKUP);
  if (descriptor === undefined) {
    Object.defineProperty(globalThis, CLASS_LOOKUP, { value: lookUpName, writable: true, configurable: true, enumerable: false });
  } else if (!("value" in descriptor) || descriptor.value !== lookUpName) {
    throw new LogicException("Symbol.for('xaravel.class.lookup') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it");
  }
}

installGlobal();
