// PHPUnit 13.4.3's `UnknownClassOrInterfaceException` (Story 4.3). A class name
// given as a string names no class here: the grader has no class table
// (ESC-4.3-1 item 1). Internal to the grader.
export class UnknownClassOrInterfaceException extends Error {
  constructor(name: string) {
    super(`Class or interface "${name}" does not exist`);
    this.name = "UnknownClassOrInterfaceException";
  }
}
