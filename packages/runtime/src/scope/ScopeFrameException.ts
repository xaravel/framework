// Thrown for a Scope Frame write with no active frame (AD-5, DIV-11), and on load when
// `Symbol.for('xaravel.scope.run')` is already owned by other code or another copy of the runtime (scope.ts). A PHP
// `RuntimeException` (Story 9.10, ESC-9.1-2), keeping its FQCN; its `name` is that FQCN, which the base sets.
import { RuntimeException } from "../php/RuntimeException";
import { registerClass } from "../registry/registry";

export class ScopeFrameException extends RuntimeException {}

registerClass("Xaravel\\Runtime\\Scope\\ScopeFrameException", ScopeFrameException);
