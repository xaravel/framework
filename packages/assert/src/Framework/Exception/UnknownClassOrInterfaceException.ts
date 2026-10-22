// PHPUnit 13.4.3's `UnknownClassOrInterfaceException` (Story 4.3). A class name
// given as a string names no class here: the grader has no class table
// (ESC-4.3-1 item 1). Internal to the grader. PHP: `UnknownClassOrInterfaceException
// extends InvalidArgumentException` (PHPUnit's, `extends Exception`, which `extends
// \RuntimeException`), so it sits on the runtime's `RuntimeException` once linked (Story 9.11).
import { RuntimeExceptionParent } from "./RuntimeExceptionParent";

export class UnknownClassOrInterfaceException extends RuntimeExceptionParent {
  constructor(name: string) {
    super(`Class or interface "${name}" does not exist`);
    this.name = "UnknownClassOrInterfaceException";
  }
}
