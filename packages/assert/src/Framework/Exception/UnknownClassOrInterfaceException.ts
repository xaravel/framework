// PHPUnit 13.4.3's `UnknownClassOrInterfaceException` (Story 4.3). Thrown for a
// class name given as a string that names no class or interface: the grader has
// no class table of its own (ESC-4.3-1 item 1), and only `assertInstanceOf` /
// `assertNotInstanceOf` resolve a string, through the runtime's published lookup
// (ESC-13.1-9). Internal to the grader. PHP: `UnknownClassOrInterfaceException
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
