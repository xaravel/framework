// PHPUnit 13.4.3's `UnknownClassOrInterfaceException` (Story 4.3). A class name
// given as a string names no class here: the grader has no class table
// (ESC-4.3-1 item 1). Internal to the grader. PHP: `UnknownClassOrInterfaceException
// extends InvalidArgumentException` (PHPUnit's abstract one, not ported here, which
// `extends Exception`), so it extends the grader's PHPUnit `Exception`, which reaches
// the runtime's `RuntimeException` once linked (Story 9.11).
import { Exception } from "./Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class UnknownClassOrInterfaceException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\UnknownClassOrInterfaceException";

  constructor(name: string) {
    super(`Class or interface "${name}" does not exist`);
    this.name = "UnknownClassOrInterfaceException";
  }
}
